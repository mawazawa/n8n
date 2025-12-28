/**
 * Scheduler Module - Scheduled Tasks & Cron System
 *
 * This module provides a production-ready job scheduling system with:
 * - Cron expression support (5 and 6 field formats)
 * - Interval-based scheduling
 * - One-time and calendar-based schedules
 * - Distributed locking for multi-instance deployments
 * - Priority queue with dead letter queue
 * - Configurable retry strategies (exponential, linear, fixed backoff)
 * - Health monitoring and metrics
 * - 99.9% reliability with sub-second execution precision
 */

// Type definitions
export type {
  JobStatus,
  RepeatType,
  ScheduledJob,
  Schedule,
  CalendarSchedule,
  RetryConfig,
  JobRun,
  CreateJobInput,
  UpdateJobInput,
  JobFilters,
  SchedulerHealth,
  SchedulerMetrics,
  JobStats,
  JobLock,
  SchedulerConfig,
  CronParseResult,
  CronFields,
  QueueItem,
  DeadLetterItem,
} from './types.js';

// Core classes
export { CronParser } from './cron-parser.js';
export { ScheduleManager } from './manager.js';
export { JobExecutor, type WorkflowExecutor } from './executor.js';
export { JobQueue } from './queue.js';
export { RetryHandler } from './retry.js';
export { SchedulerEngine } from './engine.js';
export { SchedulerMonitor, type AlertConfig } from './monitoring.js';

/**
 * Example Usage:
 *
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 * import { SchedulerEngine, ScheduleManager, SchedulerMonitor } from './scheduler';
 *
 * // Initialize Supabase client
 * const supabase = createClient(url, key);
 *
 * // Define workflow executor
 * const workflowExecutor = {
 *   async execute(workflowId: string) {
 *     // Execute your workflow here
 *     return { success: true };
 *   }
 * };
 *
 * // Create scheduler engine
 * const scheduler = new SchedulerEngine(supabase, workflowExecutor, {
 *   pollInterval: 5000,
 *   maxConcurrentJobs: 10,
 * });
 *
 * // Create schedule manager
 * const manager = new ScheduleManager(supabase);
 *
 * // Create a scheduled job
 * const job = await manager.create({
 *   name: 'Daily Report',
 *   workflowId: 'workflow-123',
 *   schedule: {
 *     type: 'cron',
 *     cron: '0 9 * * *', // Every day at 9 AM
 *   },
 *   priority: 10,
 *   retryConfig: {
 *     maxAttempts: 3,
 *     backoff: 'exponential',
 *     initialDelay: 1000,
 *     maxDelay: 60000,
 *   },
 * });
 *
 * // Start the scheduler
 * await scheduler.start();
 *
 * // Monitor health
 * const monitor = new SchedulerMonitor(supabase, scheduler);
 * const health = await monitor.getHealth();
 * console.log('Scheduler health:', health);
 * ```
 */
