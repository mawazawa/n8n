/**
 * JobExecutor - Execute scheduled jobs
 * Handles job execution, result storage, and integration with workflow execution
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { ScheduledJob, JobRun, JobStatus } from './types.js';

export interface WorkflowExecutor {
  execute(workflowId: string): Promise<Record<string, unknown>>;
}

export class JobExecutor {
  private supabase: SupabaseClient;
  private workflowExecutor?: WorkflowExecutor;

  constructor(supabase: SupabaseClient, workflowExecutor?: WorkflowExecutor) {
    this.supabase = supabase;
    this.workflowExecutor = workflowExecutor;
  }

  /**
   * Set the workflow executor (for late binding)
   */
  setWorkflowExecutor(executor: WorkflowExecutor): void {
    this.workflowExecutor = executor;
  }

  /**
   * Execute a scheduled job
   */
  async executeJob(job: ScheduledJob): Promise<JobRun> {
    const startTime = Date.now();
    const runId = uuidv4();

    // Create job run record
    const jobRun: JobRun = {
      id: runId,
      jobId: job.id,
      status: 'running',
      startedAt: startTime,
      attempt: (job.lastRun?.attempt || 0) + 1,
    };

    await this.createJobRun(jobRun);

    try {
      // Execute the workflow
      const result = await this.executeWorkflow(job.workflowId);

      // Update job run with success
      const finishTime = Date.now();
      jobRun.status = 'completed';
      jobRun.finishedAt = finishTime;
      jobRun.duration = finishTime - startTime;
      jobRun.result = result;

      await this.updateJobRun(jobRun);

      return jobRun;
    } catch (error) {
      // Update job run with failure
      const finishTime = Date.now();
      jobRun.status = 'failed';
      jobRun.finishedAt = finishTime;
      jobRun.duration = finishTime - startTime;
      jobRun.error = error instanceof Error ? error.message : String(error);

      await this.updateJobRun(jobRun);

      throw error;
    }
  }

  /**
   * Execute a job immediately (bypass schedule)
   */
  async executeNow(jobId: string): Promise<JobRun> {
    // Get the job
    const { data: jobData, error: jobError } = await this.supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !jobData) {
      throw new Error(`Failed to get job ${jobId}: ${jobError?.message}`);
    }

    const job = this.mapToScheduledJob(jobData);

    // Check if job is enabled
    if (!job.enabled) {
      throw new Error(`Job ${jobId} is disabled and cannot be executed`);
    }

    // Execute the job
    return this.executeJob(job);
  }

  /**
   * Execute workflow using the configured executor
   */
  private async executeWorkflow(workflowId: string): Promise<Record<string, unknown>> {
    if (!this.workflowExecutor) {
      throw new Error('Workflow executor not configured');
    }

    try {
      const result = await this.workflowExecutor.execute(workflowId);
      return result;
    } catch (error) {
      throw new Error(
        `Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a job run record in the database
   */
  private async createJobRun(jobRun: JobRun): Promise<void> {
    const { error } = await this.supabase.from('job_runs').insert({
      id: jobRun.id,
      job_id: jobRun.jobId,
      status: jobRun.status,
      started_at: jobRun.startedAt,
      finished_at: jobRun.finishedAt || null,
      duration: jobRun.duration || null,
      attempt: jobRun.attempt,
      result: jobRun.result || null,
      error: jobRun.error || null,
    });

    if (error) {
      throw new Error(`Failed to create job run record: ${error.message}`);
    }
  }

  /**
   * Update a job run record in the database
   */
  private async updateJobRun(jobRun: JobRun): Promise<void> {
    const { error } = await this.supabase
      .from('job_runs')
      .update({
        status: jobRun.status,
        finished_at: jobRun.finishedAt || null,
        duration: jobRun.duration || null,
        result: jobRun.result || null,
        error: jobRun.error || null,
      })
      .eq('id', jobRun.id);

    if (error) {
      throw new Error(`Failed to update job run record: ${error.message}`);
    }
  }

  /**
   * Get job run by ID
   */
  async getJobRun(runId: string): Promise<JobRun> {
    const { data, error } = await this.supabase
      .from('job_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      throw new Error(`Failed to get job run: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Job run not found: ${runId}`);
    }

    return this.mapToJobRun(data);
  }

  /**
   * Get job runs for a specific job
   */
  async getJobRuns(
    jobId: string,
    options?: { limit?: number; offset?: number; status?: JobStatus },
  ): Promise<JobRun[]> {
    let query = this.supabase.from('job_runs').select('*').eq('job_id', jobId);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    query = query.order('started_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get job runs: ${error.message}`);
    }

    return (data || []).map((run) => this.mapToJobRun(run));
  }

  /**
   * Get latest job run for a job
   */
  async getLatestJobRun(jobId: string): Promise<JobRun | null> {
    const { data, error } = await this.supabase
      .from('job_runs')
      .select('*')
      .eq('job_id', jobId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new Error(`Failed to get latest job run: ${error.message}`);
    }

    return data ? this.mapToJobRun(data) : null;
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    // Update scheduled job status
    const { error: jobError } = await this.supabase
      .from('scheduled_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'running');

    if (jobError) {
      throw new Error(`Failed to cancel job: ${jobError.message}`);
    }

    // Cancel running job runs
    const { error: runError } = await this.supabase
      .from('job_runs')
      .update({
        status: 'cancelled',
        finished_at: Date.now(),
        error: 'Job cancelled by user',
      })
      .eq('job_id', jobId)
      .eq('status', 'running');

    if (runError) {
      throw new Error(`Failed to cancel job runs: ${runError.message}`);
    }
  }

  /**
   * Get execution statistics for a job
   */
  async getExecutionStats(jobId: string): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    successRate: number;
  }> {
    const { data, error } = await this.supabase.rpc('get_job_statistics', {
      p_job_id: jobId,
    });

    if (error) {
      throw new Error(`Failed to get execution statistics: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
        successRate: 0,
      };
    }

    const stats = data[0];
    return {
      totalRuns: Number(stats.total_runs) || 0,
      successfulRuns: Number(stats.successful_runs) || 0,
      failedRuns: Number(stats.failed_runs) || 0,
      averageDuration: Number(stats.average_duration) || 0,
      successRate: Number(stats.success_rate) || 0,
    };
  }

  /**
   * Clean up old job runs
   */
  async cleanupOldRuns(retentionDays: number = 30): Promise<number> {
    const { data, error } = await this.supabase.rpc('cleanup_old_job_runs', {
      p_retention_days: retentionDays,
    });

    if (error) {
      throw new Error(`Failed to cleanup old job runs: ${error.message}`);
    }

    return Number(data) || 0;
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
      status: data.status as JobStatus,
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
   * Map database record to JobRun
   */
  private mapToJobRun(data: Record<string, unknown>): JobRun {
    return {
      id: data.id as string,
      jobId: data.job_id as string,
      status: data.status as JobStatus,
      startedAt: data.started_at as number,
      finishedAt: data.finished_at as number | undefined,
      duration: data.duration as number | undefined,
      attempt: data.attempt as number,
      result: data.result as Record<string, unknown> | undefined,
      error: data.error as string | undefined,
    };
  }
}
