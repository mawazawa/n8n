/**
 * Performance Report Builder
 * Generates comprehensive performance reports
 */

import { v4 as uuidv4 } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  PerformanceReport,
  ReportVisualization,
  PerformanceMetric,
  Bottleneck,
  OptimizationSuggestion,
  PerformanceTrend,
  Regression,
  ProfileResult,
  AnalysisResult,
} from './types';

interface ReportPeriod {
  start: string;
  end: string;
}

export class ReportBuilder {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Build comprehensive performance report
   */
  async build(
    workflowId: string,
    period: ReportPeriod,
    analysis?: AnalysisResult,
  ): Promise<PerformanceReport> {
    // Get all profiles in period
    const profiles = await this.getProfilesInPeriod(workflowId, period);

    // Calculate summary statistics
    const summary = this.calculateSummary(profiles);

    // Extract metrics
    const metrics = this.extractMetrics(profiles);

    // Get bottlenecks
    const bottlenecks = analysis?.bottlenecks || [];

    // Get optimizations
    const optimizations = analysis?.optimizations || [];

    // Get trends
    const trends = analysis?.trends || [];

    // Get regressions
    const regressions = await this.getRegressionsInPeriod(workflowId, period);

    // Generate visualizations
    const visualizations = this.generateVisualizations(profiles, metrics, bottlenecks);

    return {
      id: uuidv4(),
      workflowId,
      period,
      summary,
      metrics,
      bottlenecks,
      optimizations,
      trends,
      regressions,
      visualizations,
      generatedAt: new Date().toISOString(),
      metadata: {
        profileCount: profiles.length,
      },
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    profiles: ProfileResult[],
  ): PerformanceReport['summary'] {
    if (profiles.length === 0) {
      return {
        totalExecutions: 0,
        avgDuration: 0,
        successRate: 0,
        performanceScore: 0,
      };
    }

    const durations = profiles.map((p) => p.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    // Assume all profiles are successful for now
    // In a real implementation, would track errors
    const successRate = 100;

    // Calculate overall performance score
    const performanceScore = this.calculateOverallScore(profiles);

    return {
      totalExecutions: profiles.length,
      avgDuration,
      successRate,
      performanceScore,
    };
  }

  /**
   * Calculate overall performance score
   */
  private calculateOverallScore(profiles: ProfileResult[]): number {
    let totalScore = 0;

    for (const profile of profiles) {
      let score = 100;

      // Deduct for slow execution
      if (profile.duration > 10000) score -= 30;
      else if (profile.duration > 5000) score -= 20;
      else if (profile.duration > 2000) score -= 10;

      // Deduct for high resource usage
      if (profile.totalResourceUsage.cpu.usage > 80) score -= 20;
      if (profile.totalResourceUsage.memory.peak > 1024 * 1024 * 1024) score -= 20;

      totalScore += Math.max(0, score);
    }

    return totalScore / profiles.length;
  }

  /**
   * Extract metrics from profiles
   */
  private extractMetrics(profiles: ProfileResult[]): PerformanceMetric[] {
    const metrics: PerformanceMetric[] = [];

    for (const profile of profiles) {
      metrics.push(
        {
          name: 'execution_time',
          value: profile.duration,
          unit: 'ms',
          timestamp: profile.startTime,
          executionId: profile.executionId,
        },
        {
          name: 'cpu_usage',
          value: profile.totalResourceUsage.cpu.usage,
          unit: 'percent',
          timestamp: profile.startTime,
          executionId: profile.executionId,
        },
        {
          name: 'memory_peak',
          value: profile.totalResourceUsage.memory.peak,
          unit: 'bytes',
          timestamp: profile.startTime,
          executionId: profile.executionId,
        },
      );
    }

    return metrics;
  }

  /**
   * Generate visualizations
   */
  private generateVisualizations(
    profiles: ProfileResult[],
    metrics: PerformanceMetric[],
    bottlenecks: Bottleneck[],
  ): ReportVisualization[] {
    const visualizations: ReportVisualization[] = [];

    // Execution time line chart
    visualizations.push({
      type: 'line_chart',
      title: 'Execution Time Over Time',
      data: this.prepareLineChartData(
        metrics.filter((m) => m.name === 'execution_time'),
      ),
    });

    // Resource usage bar chart
    visualizations.push({
      type: 'bar_chart',
      title: 'Average Resource Usage',
      data: this.prepareResourceBarChart(profiles),
    });

    // Bottleneck heatmap
    if (bottlenecks.length > 0) {
      visualizations.push({
        type: 'heatmap',
        title: 'Bottleneck Impact Heatmap',
        data: this.prepareBottleneckHeatmap(bottlenecks),
      });
    }

    // Execution waterfall
    if (profiles.length > 0) {
      visualizations.push({
        type: 'waterfall',
        title: 'Latest Execution Breakdown',
        data: this.prepareWaterfallData(profiles[0]),
      });
    }

    return visualizations;
  }

  /**
   * Prepare line chart data
   */
  private prepareLineChartData(
    metrics: PerformanceMetric[],
  ): { labels: string[]; datasets: Array<{ label: string; data: number[] }> } {
    const sorted = metrics.sort((a, b) => a.timestamp - b.timestamp);

    return {
      labels: sorted.map((m) => new Date(m.timestamp).toISOString()),
      datasets: [
        {
          label: 'Execution Time (ms)',
          data: sorted.map((m) => m.value),
        },
      ],
    };
  }

  /**
   * Prepare resource bar chart
   */
  private prepareResourceBarChart(
    profiles: ProfileResult[],
  ): { labels: string[]; datasets: Array<{ label: string; data: number[] }> } {
    const avgCpu =
      profiles.reduce((sum, p) => sum + p.totalResourceUsage.cpu.usage, 0) /
      profiles.length;

    const avgMemory =
      profiles.reduce((sum, p) => sum + p.totalResourceUsage.memory.peak, 0) /
      profiles.length /
      (1024 * 1024); // Convert to MB

    return {
      labels: ['CPU', 'Memory'],
      datasets: [
        {
          label: 'Average Usage',
          data: [avgCpu, avgMemory],
        },
      ],
    };
  }

  /**
   * Prepare bottleneck heatmap
   */
  private prepareBottleneckHeatmap(bottlenecks: Bottleneck[]): {
    nodes: string[];
    types: string[];
    values: number[][];
  } {
    const nodeIds = [...new Set(bottlenecks.map((b) => b.nodeId))];
    const types = [...new Set(bottlenecks.map((b) => b.type))];

    const values: number[][] = types.map((type) =>
      nodeIds.map((nodeId) => {
        const bottleneck = bottlenecks.find(
          (b) => b.nodeId === nodeId && b.type === type,
        );
        return bottleneck ? bottleneck.impact : 0;
      }),
    );

    return { nodes: nodeIds, types, values };
  }

  /**
   * Prepare waterfall data
   */
  private prepareWaterfallData(profile: ProfileResult): {
    nodes: Array<{ name: string; start: number; duration: number }>;
  } {
    let cumulativeTime = 0;

    const nodes = profile.nodeMetrics.map((metric) => {
      const start = cumulativeTime;
      const duration = metric.executionTime;
      cumulativeTime += duration;

      return {
        name: metric.nodeName,
        start,
        duration,
      };
    });

    return { nodes };
  }

  /**
   * Get profiles in time period
   */
  private async getProfilesInPeriod(
    workflowId: string,
    period: ReportPeriod,
  ): Promise<ProfileResult[]> {
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .gte('start_time', period.start)
      .lte('start_time', period.end)
      .order('start_time', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.mapRowToProfile(row));
  }

  /**
   * Get regressions in time period
   */
  private async getRegressionsInPeriod(
    workflowId: string,
    period: ReportPeriod,
  ): Promise<Regression[]> {
    // In a real implementation, would fetch from regressions table
    // For now, return empty array
    return [];
  }

  /**
   * Map database row to ProfileResult
   */
  private mapRowToProfile(row: Record<string, unknown>): ProfileResult {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string,
      executionId: row.execution_id as string,
      startTime: new Date(row.start_time as string).getTime(),
      endTime: new Date(row.end_time as string).getTime(),
      duration: row.duration as number,
      nodeMetrics: row.node_metrics as ProfileResult['nodeMetrics'],
      totalResourceUsage: row.total_resource_usage as ProfileResult['totalResourceUsage'],
      flameGraph: row.flame_graph as ProfileResult['flameGraph'],
      metadata: row.metadata as Record<string, unknown>,
    };
  }

  /**
   * Export report to JSON
   */
  async exportJson(report: PerformanceReport): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report to CSV
   */
  async exportCsv(report: PerformanceReport): Promise<string> {
    const lines: string[] = [];

    // Header
    lines.push('Metric,Value,Unit,Timestamp,Execution ID');

    // Data rows
    for (const metric of report.metrics) {
      lines.push(
        [
          metric.name,
          metric.value,
          metric.unit,
          new Date(metric.timestamp).toISOString(),
          metric.executionId || '',
        ].join(','),
      );
    }

    return lines.join('\n');
  }
}
