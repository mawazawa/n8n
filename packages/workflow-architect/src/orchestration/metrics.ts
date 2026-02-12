/**
 * Metrics Collection
 * Tracks team and agent performance metrics
 */

import {
  type TeamMetrics,
  type Task,
  type Agent,
  TaskStatus,
  AgentStatus,
} from './types.js';

/**
 * Task metric entry
 */
export interface TaskMetric {
  taskId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Agent metric entry
 */
export interface AgentMetric {
  agentId: string;
  timestamp: number;
  workload: number;
  status: AgentStatus;
  tasksCompleted: number;
  tasksFailed: number;
  responseTime: number;
}

/**
 * Metrics Collector Class
 */
export class MetricsCollector {
  private taskMetrics: TaskMetric[];
  private agentMetrics: Map<string, AgentMetric[]>;
  private retentionPeriod: number;

  constructor(retentionPeriod = 86400000) { // 24 hours
    this.taskMetrics = [];
    this.agentMetrics = new Map();
    this.retentionPeriod = retentionPeriod;
  }

  /**
   * Record task completion
   */
  recordTaskCompletion(
    task: Task,
    agentId: string,
    success: boolean,
    error?: string
  ): void {
    const metric: TaskMetric = {
      taskId: task.id,
      agentId,
      startTime: task.startedAt || Date.now(),
      endTime: task.completedAt || Date.now(),
      duration: (task.completedAt || Date.now()) - (task.startedAt || Date.now()),
      success,
      error,
    };

    this.taskMetrics.push(metric);
    console.log(`[Metrics] Recorded task ${task.name}: ${success ? 'success' : 'failed'} (${metric.duration}ms)`);
  }

  /**
   * Record agent status
   */
  recordAgentStatus(agent: Agent): void {
    const metrics = this.agentMetrics.get(agent.id) || [];

    const metric: AgentMetric = {
      agentId: agent.id,
      timestamp: Date.now(),
      workload: agent.workload,
      status: agent.status,
      tasksCompleted: agent.capabilities.metrics?.tasksCompleted || 0,
      tasksFailed: 0,
      responseTime: agent.capabilities.metrics?.averageLatency || 0,
    };

    metrics.push(metric);
    this.agentMetrics.set(agent.id, metrics);
  }

  /**
   * Get team metrics
   */
  async getTeamMetrics(teamId: string, periodStart?: number, periodEnd?: number): Promise<TeamMetrics> {
    const end = periodEnd || Date.now();
    const start = periodStart || end - 3600000; // Default 1 hour

    // Filter metrics by time period
    const periodTasks = this.taskMetrics.filter(
      m => m.endTime >= start && m.endTime <= end
    );

    // Calculate task metrics
    const completedTasks = periodTasks.filter(m => m.success);
    const failedTasks = periodTasks.filter(m => !m.success);
    const totalDuration = periodTasks.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = periodTasks.length > 0 ? totalDuration / periodTasks.length : 0;

    // Calculate agent metrics
    const agentIds = new Set(periodTasks.map(m => m.agentId));
    let totalUtilization = 0;
    let totalResponseTime = 0;

    for (const agentId of agentIds) {
      const agentMetrics = this.agentMetrics.get(agentId) || [];
      const periodMetrics = agentMetrics.filter(
        m => m.timestamp >= start && m.timestamp <= end
      );

      if (periodMetrics.length > 0) {
        const avgWorkload = periodMetrics.reduce((sum, m) => sum + m.workload, 0) / periodMetrics.length;
        const avgResponseTime = periodMetrics.reduce((sum, m) => sum + m.responseTime, 0) / periodMetrics.length;

        totalUtilization += avgWorkload;
        totalResponseTime += avgResponseTime;
      }
    }

    const agentCount = agentIds.size || 1;

    // Calculate latency percentiles
    const durations = periodTasks.map(m => m.duration).sort((a, b) => a - b);
    const p50 = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);
    const p99 = this.percentile(durations, 0.99);

    // Calculate throughput (tasks per hour)
    const periodHours = (end - start) / 3600000;
    const throughput = periodTasks.length / periodHours;

    return {
      teamId,
      period: { start, end },
      tasks: {
        total: periodTasks.length,
        completed: completedTasks.length,
        failed: failedTasks.length,
        averageDuration: avgDuration,
        successRate: periodTasks.length > 0 ? completedTasks.length / periodTasks.length : 0,
      },
      agents: {
        total: agentCount,
        averageUtilization: totalUtilization / agentCount,
        averageResponseTime: totalResponseTime / agentCount,
        healthScore: this.calculateHealthScore(agentIds),
      },
      performance: {
        throughput,
        latencyP50: p50,
        latencyP95: p95,
        latencyP99: p99,
      },
      resources: {
        cpuUsage: 0, // Would be populated from actual system metrics
        memoryUsage: 0,
        networkUsage: 0,
      },
    };
  }

  /**
   * Get task metrics for agent
   */
  getAgentTaskMetrics(agentId: string, limit = 100): TaskMetric[] {
    return this.taskMetrics
      .filter(m => m.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Get agent performance over time
   */
  getAgentPerformanceHistory(agentId: string, limit = 100): AgentMetric[] {
    const metrics = this.agentMetrics.get(agentId) || [];
    return metrics.slice(-limit);
  }

  /**
   * Detect bottlenecks
   */
  detectBottlenecks(threshold = 0.9): Array<{
    agentId: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const bottlenecks: Array<{
      agentId: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    for (const [agentId, metrics] of this.agentMetrics) {
      const recentMetrics = metrics.slice(-10);

      if (recentMetrics.length === 0) continue;

      // Check high workload
      const avgWorkload = recentMetrics.reduce((sum, m) => sum + m.workload, 0) / recentMetrics.length;
      if (avgWorkload > threshold) {
        bottlenecks.push({
          agentId,
          issue: `High workload: ${(avgWorkload * 100).toFixed(1)}%`,
          severity: 'high',
        });
      }

      // Check slow response time
      const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
      if (avgResponseTime > 5000) { // 5 seconds
        bottlenecks.push({
          agentId,
          issue: `Slow response time: ${avgResponseTime.toFixed(0)}ms`,
          severity: 'medium',
        });
      }

      // Check frequent failures
      const agentTasks = this.taskMetrics.filter(m => m.agentId === agentId).slice(-20);
      const failureRate = agentTasks.filter(m => !m.success).length / agentTasks.length;
      if (failureRate > 0.3 && agentTasks.length >= 10) {
        bottlenecks.push({
          agentId,
          issue: `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
          severity: 'high',
        });
      }
    }

    return bottlenecks;
  }

  /**
   * Get historical analysis
   */
  getHistoricalAnalysis(periodHours = 24): {
    trends: {
      taskVolume: number[];
      successRate: number[];
      avgDuration: number[];
    };
    summary: string;
  } {
    const now = Date.now();
    const periodMs = periodHours * 3600000;
    const bucketSize = periodMs / 24; // 24 data points

    const taskVolume: number[] = [];
    const successRate: number[] = [];
    const avgDuration: number[] = [];

    for (let i = 0; i < 24; i++) {
      const bucketStart = now - periodMs + (i * bucketSize);
      const bucketEnd = bucketStart + bucketSize;

      const bucketTasks = this.taskMetrics.filter(
        m => m.endTime >= bucketStart && m.endTime < bucketEnd
      );

      taskVolume.push(bucketTasks.length);

      if (bucketTasks.length > 0) {
        const successful = bucketTasks.filter(m => m.success).length;
        successRate.push(successful / bucketTasks.length);

        const totalDuration = bucketTasks.reduce((sum, m) => sum + m.duration, 0);
        avgDuration.push(totalDuration / bucketTasks.length);
      } else {
        successRate.push(0);
        avgDuration.push(0);
      }
    }

    // Generate summary
    const totalTasks = taskVolume.reduce((sum, v) => sum + v, 0);
    const avgSuccess = successRate.reduce((sum, v) => sum + v, 0) / successRate.length;
    const avgDur = avgDuration.reduce((sum, v) => sum + v, 0) / avgDuration.length;

    const summary = `Over ${periodHours}h: ${totalTasks} tasks, ${(avgSuccess * 100).toFixed(1)}% success rate, ${avgDur.toFixed(0)}ms avg duration`;

    return {
      trends: { taskVolume, successRate, avgDuration },
      summary,
    };
  }

  /**
   * Cleanup old metrics
   */
  cleanup(): void {
    const cutoff = Date.now() - this.retentionPeriod;
    let deletedCount = 0;

    // Clean task metrics
    this.taskMetrics = this.taskMetrics.filter(m => {
      const keep = m.endTime >= cutoff;
      if (!keep) deletedCount++;
      return keep;
    });

    // Clean agent metrics
    for (const [agentId, metrics] of this.agentMetrics) {
      const filtered = metrics.filter(m => m.timestamp >= cutoff);
      this.agentMetrics.set(agentId, filtered);
    }

    if (deletedCount > 0) {
      console.log(`[Metrics] Cleaned up ${deletedCount} old metrics`);
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;

    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(agentIds: Set<string>): number {
    let totalScore = 0;

    for (const agentId of agentIds) {
      const agentTasks = this.taskMetrics.filter(m => m.agentId === agentId).slice(-20);

      if (agentTasks.length === 0) {
        totalScore += 1.0;
        continue;
      }

      const successRate = agentTasks.filter(m => m.success).length / agentTasks.length;
      totalScore += successRate;
    }

    return agentIds.size > 0 ? totalScore / agentIds.size : 1.0;
  }

  /**
   * Export metrics
   */
  exportMetrics(): {
    tasks: TaskMetric[];
    agents: Record<string, AgentMetric[]>;
  } {
    const agents: Record<string, AgentMetric[]> = {};
    for (const [agentId, metrics] of this.agentMetrics) {
      agents[agentId] = metrics;
    }

    return {
      tasks: this.taskMetrics,
      agents,
    };
  }
}

/**
 * Create a metrics collector
 */
export function createMetricsCollector(retentionPeriod?: number): MetricsCollector {
  return new MetricsCollector(retentionPeriod);
}
