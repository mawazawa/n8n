/**
 * SchedulerEngine - Main scheduler loop
 * Polls for ready jobs, manages execution, and handles health monitoring
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchedulerConfig, ScheduledJob } from './types.js';
import { JobQueue } from './queue.js';
import { JobExecutor, type WorkflowExecutor } from './executor.js';
import { RetryHandler } from './retry.js';
import { ScheduleManager } from './manager.js';
import { v4 as uuidv4 } from 'uuid';

export class SchedulerEngine {
  private supabase: SupabaseClient;
  private config: SchedulerConfig;
  private queue: JobQueue;
  private executor: JobExecutor;
  private retryHandler: RetryHandler;
  private manager: ScheduleManager;

  private running: boolean = false;
  private paused: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  private startTime: number = 0;
  private activeJobs: Map<string, Promise<void>> = new Map();
  private errors: string[] = [];
  private lastPoll: number = 0;

  constructor(
    supabase: SupabaseClient,
    workflowExecutor: WorkflowExecutor,
    config?: Partial<SchedulerConfig>,
  ) {
    this.supabase = supabase;

    // Initialize configuration with defaults
    this.config = {
      pollInterval: config?.pollInterval || 5000, // 5 seconds
      maxConcurrentJobs: config?.maxConcurrentJobs || 10,
      lockTimeout: config?.lockTimeout || 60000, // 60 seconds
      instanceId: config?.instanceId || `scheduler-${uuidv4()}`,
      enableMetrics: config?.enableMetrics ?? true,
      enableHealthCheck: config?.enableHealthCheck ?? true,
      deadLetterQueueSize: config?.deadLetterQueueSize || 1000,
    };

    // Initialize components
    this.queue = new JobQueue(this.supabase, this.config.instanceId, {
      lockTimeout: this.config.lockTimeout,
      maxDeadLetterSize: this.config.deadLetterQueueSize,
    });

    this.executor = new JobExecutor(this.supabase, workflowExecutor);
    this.retryHandler = new RetryHandler();
    this.manager = new ScheduleManager(this.supabase);
  }

  /**
   * Start the scheduler engine
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Scheduler is already running');
    }

    this.running = true;
    this.paused = false;
    this.startTime = Date.now();
    this.errors = [];

    console.log(`Scheduler engine starting (instance: ${this.config.instanceId})`);

    // Initial cleanup of expired locks
    await this.queue.cleanupExpiredLocks();

    // Start the poll loop
    this.schedulePoll();

    // Start cleanup timer (every 5 minutes)
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredLocks();
    }, 5 * 60 * 1000);

    console.log('Scheduler engine started successfully');
  }

  /**
   * Stop the scheduler engine
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('Scheduler engine stopping...');

    this.running = false;

    // Clear timers
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Wait for active jobs to complete (with timeout)
    const activeJobPromises = Array.from(this.activeJobs.values());
    if (activeJobPromises.length > 0) {
      console.log(`Waiting for ${activeJobPromises.length} active jobs to complete...`);

      const timeout = new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second timeout
      await Promise.race([Promise.all(activeJobPromises), timeout]);
    }

    // Release all locks
    const released = await this.queue.releaseAllLocks();
    console.log(`Released ${released} locks`);

    console.log('Scheduler engine stopped');
  }

  /**
   * Pause the scheduler (stop polling, but keep running jobs)
   */
  pause(): void {
    if (!this.running) {
      throw new Error('Scheduler is not running');
    }

    this.paused = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    console.log('Scheduler engine paused');
  }

  /**
   * Resume the scheduler after pause
   */
  resume(): void {
    if (!this.running) {
      throw new Error('Scheduler is not running');
    }

    if (!this.paused) {
      return;
    }

    this.paused = false;
    this.schedulePoll();

    console.log('Scheduler engine resumed');
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    paused: boolean;
    uptime: number;
    activeJobs: number;
    queueSize: number;
    lastPoll: number;
  } {
    return {
      running: this.running,
      paused: this.paused,
      uptime: this.running ? Date.now() - this.startTime : 0,
      activeJobs: this.activeJobs.size,
      queueSize: this.queue.size(),
      lastPoll: this.lastPoll,
    };
  }

  /**
   * Schedule the next poll
   */
  private schedulePoll(): void {
    if (!this.running || this.paused) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, this.config.pollInterval);
  }

  /**
   * Poll for ready jobs and execute them
   */
  private async poll(): Promise<void> {
    try {
      this.lastPoll = Date.now();

      // Load ready jobs into the queue
      const loadedCount = await this.queue.loadReadyJobs(100);

      if (loadedCount > 0) {
        console.log(`Loaded ${loadedCount} ready jobs into queue`);
      }

      // Process jobs from queue up to max concurrent limit
      while (
        this.activeJobs.size < this.config.maxConcurrentJobs &&
        this.queue.size() > 0
      ) {
        const job = await this.queue.dequeue();

        if (job) {
          void this.executeJobAsync(job);
        } else {
          break; // No more jobs could be locked
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error during poll:', errorMsg);
      this.recordError(errorMsg);
    } finally {
      // Schedule next poll
      this.schedulePoll();
    }
  }

  /**
   * Execute a job asynchronously
   */
  private async executeJobAsync(job: ScheduledJob): Promise<void> {
    const jobPromise = this.executeJob(job);
    this.activeJobs.set(job.id, jobPromise);

    try {
      await jobPromise;
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: ScheduledJob): Promise<void> {
    const startTime = Date.now();
    console.log(`Executing job: ${job.name} (${job.id})`);

    try {
      // Execute the job
      const jobRun = await this.executor.executeJob(job);

      // Update last run
      await this.manager.updateLastRun(job.id, jobRun);

      // Schedule next run (for recurring jobs)
      await this.manager.scheduleNextRun(job.id);

      // Release lock
      await this.queue.releaseLock(job.id);

      const duration = Date.now() - startTime;
      console.log(`Job completed successfully: ${job.name} (${duration}ms)`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Job failed: ${job.name} - ${errorMsg}`);

      // Determine if we should retry
      const currentAttempt = (job.lastRun?.attempt || 0) + 1;
      const shouldRetry = this.retryHandler.shouldRetry(
        job,
        currentAttempt,
        error instanceof Error ? error : new Error(errorMsg),
      );

      if (shouldRetry) {
        // Calculate next retry time
        const nextRetry = this.retryHandler.getNextAttemptTime(job, currentAttempt);
        await this.manager.updateNextRun(job.id, nextRetry);

        console.log(
          `Job will be retried (attempt ${currentAttempt + 1}/${job.retryConfig?.maxAttempts})`,
        );
      } else {
        // No more retries, move to dead letter queue
        this.queue.addToDeadLetterQueue(job, errorMsg, currentAttempt);

        // Disable the job
        await this.manager.disable(job.id);

        console.log(`Job moved to dead letter queue: ${job.name}`);
      }

      // Release lock
      await this.queue.releaseLock(job.id);

      this.recordError(`Job ${job.name} failed: ${errorMsg}`);
    }
  }

  /**
   * Cleanup expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    try {
      const cleaned = await this.queue.cleanupExpiredLocks();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired locks`);
      }
    } catch (error) {
      console.error('Error cleaning up expired locks:', error);
    }
  }

  /**
   * Record an error
   */
  private recordError(error: string): void {
    this.errors.push(error);

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }

  /**
   * Get recent errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): ReturnType<JobQueue['getStats']> {
    return this.queue.getStats();
  }

  /**
   * Get active job IDs
   */
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Force execute a job immediately (bypass schedule)
   */
  async executeNow(jobId: string): Promise<void> {
    console.log(`Force executing job: ${jobId}`);

    const jobRun = await this.executor.executeNow(jobId);

    // Update last run
    await this.manager.updateLastRun(jobId, jobRun);

    console.log(`Job force-executed successfully: ${jobId}`);
  }

  /**
   * Get configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect)
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    if (this.running) {
      throw new Error('Cannot update configuration while scheduler is running');
    }

    this.config = {
      ...this.config,
      ...config,
    };
  }
}
