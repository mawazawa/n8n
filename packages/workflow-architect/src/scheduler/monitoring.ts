/**
 * SchedulerMonitor - Health checks and metrics
 * Provides monitoring, alerting, and performance tracking for the scheduler
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchedulerHealth, SchedulerMetrics, JobStats } from './types.js';
import type { SchedulerEngine } from './engine.js';

export interface AlertConfig {
  enabled: boolean;
  failureThreshold: number; // Number of failures before alerting
  unhealthyThreshold: number; // Seconds of unhealthy state before alerting
  onAlert?: (message: string, severity: 'warning' | 'error' | 'critical') => void;
}

export class SchedulerMonitor {
  private supabase: SupabaseClient;
  private engine?: SchedulerEngine;
  private alertConfig: AlertConfig;

  private healthHistory: Array<{ timestamp: number; healthy: boolean }> = [];
  private metricsHistory: Array<{ timestamp: number; metrics: SchedulerMetrics }> = [];
  private maxHistorySize: number = 1000;

  private failureCount: number = 0;
  private lastHealthCheck: number = 0;
  private unhealthySince: number | null = null;

  constructor(
    supabase: SupabaseClient,
    engine?: SchedulerEngine,
    alertConfig?: Partial<AlertConfig>,
  ) {
    this.supabase = supabase;
    this.engine = engine;
    this.alertConfig = {
      enabled: alertConfig?.enabled ?? true,
      failureThreshold: alertConfig?.failureThreshold || 5,
      unhealthyThreshold: alertConfig?.unhealthyThreshold || 300, // 5 minutes
      onAlert: alertConfig?.onAlert,
    };
  }

  /**
   * Set the scheduler engine (for late binding)
   */
  setEngine(engine: SchedulerEngine): void {
    this.engine = engine;
  }

  /**
   * Get current health status
   */
  async getHealth(): Promise<SchedulerHealth> {
    this.lastHealthCheck = Date.now();

    const status = this.engine?.getStatus();
    const queueStats = this.engine?.getQueueStats();
    const errors = this.engine?.getErrors() || [];

    // Get database metrics
    const dbMetrics = await this.getDatabaseMetrics();

    // Determine health status
    const healthy = this.determineHealth(status, queueStats, errors, dbMetrics);

    // Track health status
    if (healthy && this.unhealthySince) {
      this.unhealthySince = null;
      this.failureCount = 0;
    } else if (!healthy && !this.unhealthySince) {
      this.unhealthySince = Date.now();
    }

    // Check for alerts
    this.checkAlerts(healthy, errors);

    const health: SchedulerHealth = {
      healthy,
      uptime: status?.uptime || 0,
      activeJobs: status?.activeJobs || 0,
      pendingJobs: queueStats?.queueSize || 0,
      failedJobs: dbMetrics.failedJobs,
      lastPoll: status?.lastPoll || 0,
      errors: errors.slice(-10), // Last 10 errors
    };

    // Record health history
    this.recordHealth(health);

    return health;
  }

  /**
   * Get scheduler metrics
   */
  async getMetrics(): Promise<SchedulerMetrics> {
    const dbMetrics = await this.getDatabaseMetrics();
    const queueStats = this.engine?.getQueueStats();

    const metrics: SchedulerMetrics = {
      totalJobs: dbMetrics.totalJobs,
      activeJobs: dbMetrics.activeJobs,
      completedJobs: dbMetrics.completedJobs,
      failedJobs: dbMetrics.failedJobs,
      averageExecutionTime: dbMetrics.averageExecutionTime,
      jobsPerMinute: await this.calculateJobsPerMinute(),
      queueSize: queueStats?.queueSize || 0,
      oldestPendingJob: queueStats?.oldestJob || undefined,
    };

    // Record metrics history
    this.recordMetrics(metrics);

    return metrics;
  }

  /**
   * Get statistics for a specific job
   */
  async getJobStats(jobId: string): Promise<JobStats> {
    const { data, error } = await this.supabase.rpc('get_job_statistics', {
      p_job_id: jobId,
    });

    if (error) {
      throw new Error(`Failed to get job statistics: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        jobId,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
        successRate: 0,
      };
    }

    const stats = data[0];
    return {
      jobId,
      totalRuns: Number(stats.total_runs) || 0,
      successfulRuns: Number(stats.successful_runs) || 0,
      failedRuns: Number(stats.failed_runs) || 0,
      averageDuration: Number(stats.average_duration) || 0,
      lastSuccess: stats.last_success ? Number(stats.last_success) : undefined,
      lastFailure: stats.last_failure ? Number(stats.last_failure) : undefined,
      successRate: Number(stats.success_rate) || 0,
    };
  }

  /**
   * Get database metrics using the stored function
   */
  private async getDatabaseMetrics(): Promise<{
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageExecutionTime: number;
  }> {
    try {
      const { data, error } = await this.supabase.rpc('get_scheduler_metrics');

      if (error) {
        console.error('Failed to get database metrics:', error);
        return {
          totalJobs: 0,
          activeJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          averageExecutionTime: 0,
        };
      }

      if (!data || data.length === 0) {
        return {
          totalJobs: 0,
          activeJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          averageExecutionTime: 0,
        };
      }

      const metrics = data[0];
      return {
        totalJobs: Number(metrics.total_jobs) || 0,
        activeJobs: Number(metrics.active_jobs) || 0,
        completedJobs: Number(metrics.total_runs_today) || 0,
        failedJobs: Number(metrics.failed_runs_today) || 0,
        averageExecutionTime: Number(metrics.average_execution_time) || 0,
      };
    } catch (error) {
      console.error('Error getting database metrics:', error);
      return {
        totalJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageExecutionTime: 0,
      };
    }
  }

  /**
   * Calculate jobs executed per minute
   */
  private async calculateJobsPerMinute(): Promise<number> {
    try {
      const oneMinuteAgo = Date.now() - 60000;

      const { count, error } = await this.supabase
        .from('job_runs')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', oneMinuteAgo);

      if (error) {
        console.error('Failed to calculate jobs per minute:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error calculating jobs per minute:', error);
      return 0;
    }
  }

  /**
   * Determine overall health status
   */
  private determineHealth(
    status: ReturnType<SchedulerEngine['getStatus']> | undefined,
    queueStats: ReturnType<SchedulerEngine['getQueueStats']> | undefined,
    errors: string[],
    dbMetrics: { totalJobs: number; activeJobs: number; failedJobs: number },
  ): boolean {
    // Not running = unhealthy
    if (!status?.running) {
      return false;
    }

    // Too many recent errors = unhealthy
    if (errors.length > 10) {
      return false;
    }

    // Last poll too long ago = unhealthy
    const timeSinceLastPoll = Date.now() - (status.lastPoll || 0);
    if (timeSinceLastPoll > 60000) {
      // 1 minute
      return false;
    }

    // High failure rate = unhealthy
    const failureRate = dbMetrics.totalJobs > 0 ? dbMetrics.failedJobs / dbMetrics.totalJobs : 0;
    if (failureRate > 0.5) {
      // More than 50% failures
      return false;
    }

    // Dead letter queue too large = warning but not critical
    if ((queueStats?.deadLetterSize || 0) > 100) {
      console.warn('Dead letter queue size exceeds 100');
    }

    return true;
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(healthy: boolean, errors: string[]): void {
    if (!this.alertConfig.enabled) {
      return;
    }

    // Check failure threshold
    if (errors.length >= this.alertConfig.failureThreshold) {
      this.sendAlert(
        `Scheduler has ${errors.length} recent errors (threshold: ${this.alertConfig.failureThreshold})`,
        'warning',
      );
    }

    // Check unhealthy duration
    if (!healthy && this.unhealthySince) {
      const unhealthyDuration = (Date.now() - this.unhealthySince) / 1000;
      if (unhealthyDuration >= this.alertConfig.unhealthyThreshold) {
        this.sendAlert(
          `Scheduler has been unhealthy for ${Math.round(unhealthyDuration)} seconds`,
          'critical',
        );
      }
    }
  }

  /**
   * Send an alert
   */
  private sendAlert(message: string, severity: 'warning' | 'error' | 'critical'): void {
    console.error(`[${severity.toUpperCase()}] ${message}`);

    if (this.alertConfig.onAlert) {
      this.alertConfig.onAlert(message, severity);
    }
  }

  /**
   * Record health status in history
   */
  private recordHealth(health: SchedulerHealth): void {
    this.healthHistory.push({
      timestamp: Date.now(),
      healthy: health.healthy,
    });

    // Trim history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  /**
   * Record metrics in history
   */
  private recordMetrics(metrics: SchedulerMetrics): void {
    this.metricsHistory.push({
      timestamp: Date.now(),
      metrics,
    });

    // Trim history
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Get health history
   */
  getHealthHistory(
    duration?: number,
  ): Array<{ timestamp: number; healthy: boolean }> {
    if (!duration) {
      return [...this.healthHistory];
    }

    const cutoff = Date.now() - duration;
    return this.healthHistory.filter((h) => h.timestamp >= cutoff);
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(
    duration?: number,
  ): Array<{ timestamp: number; metrics: SchedulerMetrics }> {
    if (!duration) {
      return [...this.metricsHistory];
    }

    const cutoff = Date.now() - duration;
    return this.metricsHistory.filter((m) => m.timestamp >= cutoff);
  }

  /**
   * Calculate uptime percentage
   */
  getUptimePercentage(duration: number = 3600000): number {
    const history = this.getHealthHistory(duration);

    if (history.length === 0) {
      return 100;
    }

    const healthyCount = history.filter((h) => h.healthy).length;
    return (healthyCount / history.length) * 100;
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(duration: number = 3600000): Promise<{
    averageExecutionTime: number;
    averageQueueSize: number;
    averageJobsPerMinute: number;
    successRate: number;
  }> {
    const history = this.getMetricsHistory(duration);

    if (history.length === 0) {
      return {
        averageExecutionTime: 0,
        averageQueueSize: 0,
        averageJobsPerMinute: 0,
        successRate: 0,
      };
    }

    const avgExecTime =
      history.reduce((sum, h) => sum + h.metrics.averageExecutionTime, 0) /
      history.length;

    const avgQueueSize =
      history.reduce((sum, h) => sum + h.metrics.queueSize, 0) / history.length;

    const avgJobsPerMinute =
      history.reduce((sum, h) => sum + h.metrics.jobsPerMinute, 0) / history.length;

    const successRate =
      history.reduce((sum, h) => {
        const total = h.metrics.completedJobs + h.metrics.failedJobs;
        return total > 0 ? sum + h.metrics.completedJobs / total : sum;
      }, 0) / history.length;

    return {
      averageExecutionTime: avgExecTime,
      averageQueueSize: avgQueueSize,
      averageJobsPerMinute: avgJobsPerMinute,
      successRate: successRate * 100,
    };
  }

  /**
   * Get top failing jobs
   */
  async getTopFailingJobs(limit: number = 10): Promise<
    Array<{
      jobId: string;
      jobName: string;
      failureCount: number;
      lastError: string | null;
    }>
  > {
    try {
      const { data, error } = await this.supabase
        .from('job_runs')
        .select(
          `
          job_id,
          scheduled_jobs!inner(name),
          error
        `,
        )
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to get top failing jobs:', error);
        return [];
      }

      // Group by job_id and count failures
      const failureMap = new Map<
        string,
        { name: string; count: number; lastError: string | null }
      >();

      for (const run of data || []) {
        const jobId = run.job_id as string;
        const scheduledJob = run.scheduled_jobs as unknown as { name: string } | null;
        const jobName = scheduledJob?.name || 'Unknown';
        const error = (run.error as string) || null;

        const current = failureMap.get(jobId);
        if (current) {
          current.count++;
          if (!current.lastError && error) {
            current.lastError = error;
          }
        } else {
          failureMap.set(jobId, {
            name: jobName,
            count: 1,
            lastError: error,
          });
        }
      }

      // Convert to array and sort by count
      return Array.from(failureMap.entries())
        .map(([jobId, info]) => ({
          jobId,
          jobName: info.name,
          failureCount: info.count,
          lastError: info.lastError,
        }))
        .sort((a, b) => b.failureCount - a.failureCount)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top failing jobs:', error);
      return [];
    }
  }

  /**
   * Get slow jobs (jobs with high execution time)
   */
  async getSlowJobs(limit: number = 10, threshold: number = 60000): Promise<
    Array<{
      jobId: string;
      jobName: string;
      averageDuration: number;
      maxDuration: number;
    }>
  > {
    try {
      const { data, error } = await this.supabase
        .from('job_runs')
        .select(
          `
          job_id,
          duration,
          scheduled_jobs!inner(name)
        `,
        )
        .gte('duration', threshold)
        .order('duration', { ascending: false })
        .limit(limit * 10); // Get more to aggregate

      if (error) {
        console.error('Failed to get slow jobs:', error);
        return [];
      }

      // Group by job_id and calculate stats
      const jobMap = new Map<
        string,
        { name: string; durations: number[] }
      >();

      for (const run of data || []) {
        const jobId = run.job_id as string;
        const scheduledJob = run.scheduled_jobs as unknown as { name: string } | null;
        const jobName = scheduledJob?.name || 'Unknown';
        const duration = run.duration as number;

        const current = jobMap.get(jobId);
        if (current) {
          current.durations.push(duration);
        } else {
          jobMap.set(jobId, {
            name: jobName,
            durations: [duration],
          });
        }
      }

      // Calculate averages and return
      return Array.from(jobMap.entries())
        .map(([jobId, info]) => ({
          jobId,
          jobName: info.name,
          averageDuration:
            info.durations.reduce((sum, d) => sum + d, 0) / info.durations.length,
          maxDuration: Math.max(...info.durations),
        }))
        .sort((a, b) => b.averageDuration - a.averageDuration)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting slow jobs:', error);
      return [];
    }
  }

  /**
   * Reset monitoring state
   */
  reset(): void {
    this.healthHistory = [];
    this.metricsHistory = [];
    this.failureCount = 0;
    this.unhealthySince = null;
  }
}
