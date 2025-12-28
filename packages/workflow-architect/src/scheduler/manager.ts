/**
 * ScheduleManager - CRUD operations for scheduled jobs
 * Handles job creation, updates, deletion, and querying
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type {
  ScheduledJob,
  CreateJobInput,
  UpdateJobInput,
  JobFilters,
  Schedule,
} from './types.js';
import { CronParser } from './cron-parser.js';

export class ScheduleManager {
  private supabase: SupabaseClient;
  private cronParser: CronParser;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.cronParser = new CronParser();
  }

  /**
   * Create a new scheduled job
   */
  async create(input: CreateJobInput): Promise<ScheduledJob> {
    // Validate schedule
    this.validateSchedule(input.schedule);

    // Calculate next run time
    const nextRun = this.calculateNextRun(input.schedule, input.timezone || 'UTC');

    const job = {
      id: uuidv4(),
      name: input.name,
      workflow_id: input.workflowId,
      schedule: input.schedule,
      status: 'pending' as const,
      priority: input.priority ?? 0,
      retry_config: input.retryConfig || null,
      timezone: input.timezone || 'UTC',
      enabled: input.enabled ?? true,
      next_run: nextRun,
      last_run: null,
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
    };

    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .insert(job)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create scheduled job: ${error.message}`);
    }

    return this.mapToScheduledJob(data);
  }

  /**
   * Update an existing scheduled job
   */
  async update(jobId: string, input: UpdateJobInput): Promise<ScheduledJob> {
    // Validate schedule if provided
    if (input.schedule) {
      this.validateSchedule(input.schedule);
    }

    // Get current job to determine timezone
    const currentJob = await this.getJob(jobId);
    const timezone = input.timezone || currentJob.timezone;

    // Calculate new next run time if schedule or timezone changed
    const nextRun =
      input.schedule || input.timezone
        ? this.calculateNextRun(input.schedule || currentJob.schedule, timezone)
        : undefined;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name) updates.name = input.name;
    if (input.schedule) updates.schedule = input.schedule;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.retryConfig !== undefined) updates.retry_config = input.retryConfig;
    if (input.timezone) updates.timezone = input.timezone;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (nextRun !== undefined) updates.next_run = nextRun;

    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update scheduled job: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Scheduled job not found: ${jobId}`);
    }

    return this.mapToScheduledJob(data);
  }

  /**
   * Delete a scheduled job
   */
  async delete(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('scheduled_jobs')
      .delete()
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to delete scheduled job: ${error.message}`);
    }
  }

  /**
   * Enable a scheduled job
   */
  async enable(jobId: string): Promise<ScheduledJob> {
    return this.update(jobId, { enabled: true });
  }

  /**
   * Disable a scheduled job
   */
  async disable(jobId: string): Promise<ScheduledJob> {
    return this.update(jobId, { enabled: false });
  }

  /**
   * Get a single scheduled job
   */
  async getJob(jobId: string): Promise<ScheduledJob> {
    const { data, error } = await this.supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to get scheduled job: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Scheduled job not found: ${jobId}`);
    }

    return this.mapToScheduledJob(data);
  }

  /**
   * List scheduled jobs with optional filters
   */
  async listJobs(filters?: JobFilters): Promise<ScheduledJob[]> {
    let query = this.supabase.from('scheduled_jobs').select('*');

    // Apply filters
    if (filters?.workflowId) {
      query = query.eq('workflow_id', filters.workflowId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.enabled !== undefined) {
      query = query.eq('enabled', filters.enabled);
    }
    if (filters?.priority !== undefined) {
      query = query.eq('priority', filters.priority);
    }

    // Apply pagination
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    // Order by priority and next run
    query = query.order('priority', { ascending: false }).order('next_run', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list scheduled jobs: ${error.message}`);
    }

    return (data || []).map((job) => this.mapToScheduledJob(job));
  }

  /**
   * Get jobs by workflow ID
   */
  async getJobsByWorkflow(workflowId: string): Promise<ScheduledJob[]> {
    return this.listJobs({ workflowId });
  }

  /**
   * Update job's next run time
   */
  async updateNextRun(jobId: string, nextRun: number): Promise<void> {
    const { error } = await this.supabase
      .from('scheduled_jobs')
      .update({
        next_run: nextRun,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to update next run time: ${error.message}`);
    }
  }

  /**
   * Update job's last run information
   */
  async updateLastRun(jobId: string, lastRun: unknown): Promise<void> {
    const { error } = await this.supabase
      .from('scheduled_jobs')
      .update({
        last_run: lastRun,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to update last run: ${error.message}`);
    }
  }

  /**
   * Validate a schedule configuration
   */
  private validateSchedule(schedule: Schedule): void {
    if (!schedule.type) {
      throw new Error('Schedule type is required');
    }

    switch (schedule.type) {
      case 'cron':
        if (!schedule.cron) {
          throw new Error('Cron expression is required for cron schedules');
        }
        const parseResult = this.cronParser.parse(schedule.cron);
        if (!parseResult.valid) {
          throw new Error(`Invalid cron expression: ${parseResult.error}`);
        }
        break;

      case 'interval':
        if (!schedule.interval || schedule.interval <= 0) {
          throw new Error('Interval must be a positive number');
        }
        if (schedule.interval < 1000) {
          throw new Error('Interval must be at least 1000ms (1 second)');
        }
        break;

      case 'once':
        if (!schedule.runAt) {
          throw new Error('RunAt timestamp is required for one-time schedules');
        }
        if (schedule.runAt <= Date.now()) {
          throw new Error('RunAt timestamp must be in the future');
        }
        break;

      case 'calendar':
        if (!schedule.calendar) {
          throw new Error('Calendar configuration is required for calendar schedules');
        }
        this.validateCalendarSchedule(schedule.calendar);
        break;

      default:
        throw new Error(`Invalid schedule type: ${schedule.type}`);
    }
  }

  /**
   * Validate calendar schedule configuration
   */
  private validateCalendarSchedule(calendar: CreateJobInput['schedule']['calendar']): void {
    if (!calendar) return;

    if (calendar.daysOfWeek) {
      if (!Array.isArray(calendar.daysOfWeek)) {
        throw new Error('daysOfWeek must be an array');
      }
      if (calendar.daysOfWeek.some((d) => d < 0 || d > 6)) {
        throw new Error('daysOfWeek values must be between 0 and 6');
      }
    }

    if (calendar.daysOfMonth) {
      if (!Array.isArray(calendar.daysOfMonth)) {
        throw new Error('daysOfMonth must be an array');
      }
      if (calendar.daysOfMonth.some((d) => d < 1 || d > 31)) {
        throw new Error('daysOfMonth values must be between 1 and 31');
      }
    }

    if (calendar.months) {
      if (!Array.isArray(calendar.months)) {
        throw new Error('months must be an array');
      }
      if (calendar.months.some((m) => m < 1 || m > 12)) {
        throw new Error('months values must be between 1 and 12');
      }
    }
  }

  /**
   * Calculate next run time based on schedule
   */
  private calculateNextRun(schedule: Schedule, timezone: string): number {
    const now = Date.now();

    switch (schedule.type) {
      case 'cron':
        if (!schedule.cron) {
          throw new Error('Cron expression is required');
        }
        return this.cronParser.getNextRunTime(schedule.cron, now);

      case 'interval':
        if (!schedule.interval) {
          throw new Error('Interval is required');
        }
        return now + schedule.interval;

      case 'once':
        if (!schedule.runAt) {
          throw new Error('RunAt timestamp is required');
        }
        return schedule.runAt;

      case 'calendar':
        if (!schedule.calendar) {
          throw new Error('Calendar configuration is required');
        }
        return this.calculateCalendarNextRun(schedule.calendar, timezone);

      default:
        throw new Error(`Unsupported schedule type: ${schedule.type}`);
    }
  }

  /**
   * Calculate next run time for calendar-based schedules
   */
  private calculateCalendarNextRun(
    calendar: NonNullable<Schedule['calendar']>,
    timezone: string,
  ): number {
    const now = new Date();
    let candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0); // Start at midnight

    // Find next matching date (search up to 1 year)
    const maxDate = new Date(now);
    maxDate.setFullYear(maxDate.getFullYear() + 1);

    while (candidate < maxDate) {
      const dateStr = candidate.toISOString().split('T')[0];

      // Check if date is explicitly excluded
      if (calendar.excludeDates?.includes(dateStr)) {
        candidate.setDate(candidate.getDate() + 1);
        continue;
      }

      // Check if date is explicitly included
      if (calendar.includeDates?.includes(dateStr)) {
        return candidate.getTime();
      }

      // Check calendar rules
      const matchesMonth =
        !calendar.months || calendar.months.includes(candidate.getMonth() + 1);
      const matchesDayOfMonth =
        !calendar.daysOfMonth || calendar.daysOfMonth.includes(candidate.getDate());
      const matchesDayOfWeek =
        !calendar.daysOfWeek || calendar.daysOfWeek.includes(candidate.getDay());

      if (matchesMonth && matchesDayOfMonth && matchesDayOfWeek) {
        return candidate.getTime();
      }

      candidate.setDate(candidate.getDate() + 1);
    }

    throw new Error('Could not find next run time within 1 year for calendar schedule');
  }

  /**
   * Map database record to ScheduledJob
   */
  private mapToScheduledJob(data: Record<string, unknown>): ScheduledJob {
    return {
      id: data.id as string,
      name: data.name as string,
      workflowId: data.workflow_id as string,
      schedule: data.schedule as Schedule,
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
   * Calculate next run after current execution
   */
  async scheduleNextRun(jobId: string): Promise<number> {
    const job = await this.getJob(jobId);

    // For one-time jobs, disable them
    if (job.schedule.type === 'once') {
      await this.disable(jobId);
      return 0;
    }

    // Calculate next run
    const nextRun = this.calculateNextRun(job.schedule, job.timezone);
    await this.updateNextRun(jobId, nextRun);

    return nextRun;
  }
}
