/**
 * Scheduler Type Definitions
 * Defines all types and interfaces for the scheduled tasks & cron system
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RepeatType = 'cron' | 'interval' | 'once' | 'calendar';

/**
 * Core scheduled job entity
 */
export interface ScheduledJob {
  id: string;
  name: string;
  workflowId: string;
  schedule: Schedule;
  status: JobStatus;
  priority: number;
  retryConfig?: RetryConfig;
  timezone: string;
  enabled: boolean;
  lastRun?: JobRun;
  nextRun?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Schedule configuration
 */
export interface Schedule {
  type: RepeatType;
  cron?: string;
  interval?: number;
  runAt?: number;
  calendar?: CalendarSchedule;
}

/**
 * Calendar-based schedule configuration
 */
export interface CalendarSchedule {
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  daysOfMonth?: number[]; // 1-31
  months?: number[]; // 1-12
  excludeDates?: string[]; // ISO date strings to exclude
  includeDates?: string[]; // ISO date strings to force include
}

/**
 * Retry configuration for failed jobs
 */
export interface RetryConfig {
  maxAttempts: number;
  backoff: 'fixed' | 'exponential' | 'linear';
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
}

/**
 * Individual job execution record
 */
export interface JobRun {
  id: string;
  jobId: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  attempt: number;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Job creation input
 */
export interface CreateJobInput {
  name: string;
  workflowId: string;
  schedule: Schedule;
  priority?: number;
  retryConfig?: RetryConfig;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Job update input
 */
export interface UpdateJobInput {
  name?: string;
  schedule?: Schedule;
  priority?: number;
  retryConfig?: RetryConfig;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Job query filters
 */
export interface JobFilters {
  workflowId?: string;
  status?: JobStatus;
  enabled?: boolean;
  priority?: number;
  limit?: number;
  offset?: number;
}

/**
 * Scheduler health status
 */
export interface SchedulerHealth {
  healthy: boolean;
  uptime: number;
  activeJobs: number;
  pendingJobs: number;
  failedJobs: number;
  lastPoll: number;
  errors: string[];
}

/**
 * Scheduler metrics
 */
export interface SchedulerMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageExecutionTime: number;
  jobsPerMinute: number;
  queueSize: number;
  oldestPendingJob?: number;
}

/**
 * Job statistics
 */
export interface JobStats {
  jobId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  lastSuccess?: number;
  lastFailure?: number;
  successRate: number;
}

/**
 * Distributed lock
 */
export interface JobLock {
  jobId: string;
  instanceId: string;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  pollInterval: number; // milliseconds
  maxConcurrentJobs: number;
  lockTimeout: number; // milliseconds
  instanceId: string;
  enableMetrics: boolean;
  enableHealthCheck: boolean;
  deadLetterQueueSize: number;
}

/**
 * Cron parse result
 */
export interface CronParseResult {
  valid: boolean;
  fields: CronFields;
  description: string;
  nextRuns?: number[];
  error?: string;
}

/**
 * Parsed cron fields
 */
export interface CronFields {
  second?: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/**
 * Queue item for priority queue
 */
export interface QueueItem {
  job: ScheduledJob;
  priority: number;
  enqueueTime: number;
}

/**
 * Dead letter queue item
 */
export interface DeadLetterItem {
  job: ScheduledJob;
  lastError: string;
  failedAt: number;
  attemptCount: number;
}
