/**
 * JobQueue - Priority queue for scheduled jobs
 * Implements distributed locking and dead letter queue for failed jobs
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledJob, QueueItem, DeadLetterItem, JobLock } from './types.js';

export class JobQueue {
  private supabase: SupabaseClient;
  private instanceId: string;
  private lockTimeout: number;
  private queue: QueueItem[] = [];
  private deadLetterQueue: DeadLetterItem[] = [];
  private maxDeadLetterSize: number;

  constructor(
    supabase: SupabaseClient,
    instanceId: string,
    options?: {
      lockTimeout?: number;
      maxDeadLetterSize?: number;
    },
  ) {
    this.supabase = supabase;
    this.instanceId = instanceId;
    this.lockTimeout = options?.lockTimeout || 60000; // 60 seconds default
    this.maxDeadLetterSize = options?.maxDeadLetterSize || 1000;
  }

  /**
   * Enqueue a job into the priority queue
   */
  enqueue(job: ScheduledJob): void {
    const item: QueueItem = {
      job,
      priority: job.priority,
      enqueueTime: Date.now(),
    };

    // Insert maintaining priority order (higher priority first)
    let insertIndex = 0;
    while (
      insertIndex < this.queue.length &&
      this.queue[insertIndex].priority >= item.priority
    ) {
      insertIndex++;
    }

    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * Dequeue the highest priority job (with distributed lock)
   */
  async dequeue(): Promise<ScheduledJob | null> {
    if (this.queue.length === 0) {
      return null;
    }

    // Try to acquire lock for the highest priority job
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const locked = await this.acquireLock(item.job.id);

      if (locked) {
        // Remove from queue and return
        this.queue.splice(i, 1);
        return item.job;
      }
    }

    // No job could be locked
    return null;
  }

  /**
   * Peek at the highest priority job without removing it
   */
  peek(): ScheduledJob | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue[0].job;
  }

  /**
   * Get the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get all jobs in the queue (for monitoring)
   */
  getAll(): ScheduledJob[] {
    return this.queue.map((item) => item.job);
  }

  /**
   * Acquire distributed lock for a job
   */
  async acquireLock(jobId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('acquire_job_lock', {
        p_job_id: jobId,
        p_instance_id: this.instanceId,
        p_lock_duration_ms: this.lockTimeout,
      });

      if (error) {
        console.error('Failed to acquire lock:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Release lock for a job
   */
  async releaseLock(jobId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('release_job_lock', {
        p_job_id: jobId,
        p_instance_id: this.instanceId,
      });

      if (error) {
        console.error('Failed to release lock:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Cleanup expired locks (for crashed instances)
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_locks');

      if (error) {
        console.error('Failed to cleanup expired locks:', error);
        return 0;
      }

      return Number(data) || 0;
    } catch (error) {
      console.error('Error cleaning up expired locks:', error);
      return 0;
    }
  }

  /**
   * Get ready jobs from database
   */
  async getReadyJobs(limit: number = 100): Promise<ScheduledJob[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_ready_jobs', {
        p_limit: limit,
      });

      if (error) {
        throw new Error(`Failed to get ready jobs: ${error.message}`);
      }

      return (data || []).map((job: Record<string, unknown>) =>
        this.mapToScheduledJob(job),
      );
    } catch (error) {
      console.error('Error getting ready jobs:', error);
      return [];
    }
  }

  /**
   * Load ready jobs into the queue
   */
  async loadReadyJobs(limit: number = 100): Promise<number> {
    const jobs = await this.getReadyJobs(limit);

    for (const job of jobs) {
      this.enqueue(job);
    }

    return jobs.length;
  }

  /**
   * Add job to dead letter queue
   */
  addToDeadLetterQueue(job: ScheduledJob, error: string, attemptCount: number): void {
    const item: DeadLetterItem = {
      job,
      lastError: error,
      failedAt: Date.now(),
      attemptCount,
    };

    this.deadLetterQueue.push(item);

    // Trim if exceeds max size
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      this.deadLetterQueue.shift();
    }
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): DeadLetterItem[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  /**
   * Get dead letter queue size
   */
  deadLetterSize(): number {
    return this.deadLetterQueue.length;
  }

  /**
   * Retry a job from dead letter queue
   */
  retryFromDeadLetterQueue(jobId: string): ScheduledJob | null {
    const index = this.deadLetterQueue.findIndex((item) => item.job.id === jobId);

    if (index === -1) {
      return null;
    }

    const item = this.deadLetterQueue.splice(index, 1)[0];
    this.enqueue(item.job);

    return item.job;
  }

  /**
   * Get lock information for a job
   */
  async getLockInfo(jobId: string): Promise<JobLock | null> {
    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .select('locked_by, locked_at, lock_expires_at')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    if (!data.locked_by) {
      return null;
    }

    return {
      jobId,
      instanceId: data.locked_by as string,
      acquiredAt: data.locked_at as number,
      expiresAt: data.lock_expires_at as number,
    };
  }

  /**
   * Check if a job is locked
   */
  async isLocked(jobId: string): Promise<boolean> {
    const lockInfo = await this.getLockInfo(jobId);
    if (!lockInfo) {
      return false;
    }

    // Check if lock is expired
    const now = Date.now();
    return lockInfo.expiresAt > now;
  }

  /**
   * Get jobs locked by this instance
   */
  async getLockedJobs(): Promise<ScheduledJob[]> {
    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('locked_by', this.instanceId);

    if (error) {
      console.error('Failed to get locked jobs:', error);
      return [];
    }

    return (data || []).map((job) => this.mapToScheduledJob(job));
  }

  /**
   * Release all locks held by this instance
   */
  async releaseAllLocks(): Promise<number> {
    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .update({
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('locked_by', this.instanceId)
      .select();

    if (error) {
      console.error('Failed to release all locks:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Map database record to ScheduledJob
   */
  private mapToScheduledJob(data: Record<string, unknown>): ScheduledJob {
    return {
      id: data.id as string,
      name: data.name as string,
      workflowId: data.workflow_id as string,
      schedule: data.schedule as ScheduledJob['schedule'],
      status: data.status as ScheduledJob['status'],
      priority: data.priority as number,
      retryConfig: data.retry_config as ScheduledJob['retryConfig'],
      timezone: data.timezone as string,
      enabled: data.enabled as boolean,
      lastRun: data.last_run as ScheduledJob['lastRun'],
      nextRun: data.next_run as number | undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueSize: number;
    deadLetterSize: number;
    oldestJob: number | null;
    highestPriority: number | null;
  } {
    return {
      queueSize: this.queue.length,
      deadLetterSize: this.deadLetterQueue.length,
      oldestJob: this.queue.length > 0 ? this.queue[0].enqueueTime : null,
      highestPriority: this.queue.length > 0 ? this.queue[0].priority : null,
    };
  }
}
