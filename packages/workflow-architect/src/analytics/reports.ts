/**
 * Report Generator
 * Generate analytics reports with trend analysis and anomaly detection
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Report,
  ReportConfig,
  TrendData,
  AnomalyDetectionResult,
  TimePeriod,
} from './types.js';
import { getMetrics, getMetricsByName, getAggregator } from './metrics.js';

interface StoredReport extends Report {
  config: ReportConfig;
}

/**
 * ReportGenerator - Generate and manage analytics reports
 *
 * Features:
 * - Daily/weekly/monthly rollups
 * - Trend analysis and comparison
 * - Anomaly detection using statistical methods
 * - Report storage and retrieval
 * - Export to JSON/CSV
 */
export class ReportGenerator {
  private reports: Map<string, StoredReport> = new Map();
  private schedules: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Generate a report based on configuration
   */
  async generateReport(config: ReportConfig): Promise<Report> {
    const reportId = uuidv4();
    const now = new Date();
    const aggregator = getAggregator();

    const data: Record<string, unknown> = {
      period: {
        start: config.startDate?.toISOString() || this.getDefaultStartDate(now).toISOString(),
        end: config.endDate?.toISOString() || now.toISOString(),
      },
      metrics: {},
      trends: [],
      anomalies: [],
      summary: {},
    };

    // Generate metrics data
    for (const metricName of config.metrics) {
      const metricData = await this.generateMetricData(
        metricName,
        config.startDate || this.getDefaultStartDate(now),
        config.endDate || now,
        config.aggregation?.period || 'day',
      );

      (data.metrics as Record<string, unknown>)[metricName] = metricData;

      // Generate trend analysis
      const trend = this.analyzeTrend(metricName, metricData as any);
      if (trend) {
        (data.trends as TrendData[]).push(trend);
      }

      // Detect anomalies
      const anomalies = this.detectAnomalies(metricName, metricData as any);
      (data.anomalies as AnomalyDetectionResult[]).push(...anomalies);
    }

    // Generate summary statistics
    data.summary = this.generateSummary(data);

    const report: Report = {
      id: reportId,
      name: config.name,
      description: config.description,
      metrics: config.metrics,
      filters: config.filters || {},
      generatedAt: now.toISOString(),
      data,
    };

    // Store report with config
    const storedReport: StoredReport = {
      ...report,
      config,
    };
    this.reports.set(reportId, storedReport);

    return report;
  }

  /**
   * Get a report by ID
   */
  getReport(id: string): Report | null {
    const stored = this.reports.get(id);
    if (!stored) return null;

    const { config, ...report } = stored;
    return report;
  }

  /**
   * List all reports
   */
  listReports(filter?: { name?: string; metrics?: string[] }): Report[] {
    const reports = Array.from(this.reports.values());

    if (!filter) {
      return reports.map(({ config, ...report }) => report);
    }

    const filtered = reports.filter(report => {
      if (filter.name && !report.name.toLowerCase().includes(filter.name.toLowerCase())) {
        return false;
      }

      if (filter.metrics && !filter.metrics.some(m => report.metrics.includes(m))) {
        return false;
      }

      return true;
    });

    return filtered.map(({ config, ...report }) => report);
  }

  /**
   * Delete a report
   */
  deleteReport(id: string): boolean {
    return this.reports.delete(id);
  }

  /**
   * Schedule a recurring report
   */
  scheduleReport(config: ReportConfig, cronPattern: string): string {
    const scheduleId = uuidv4();

    // Simple interval-based scheduling (would use a proper cron library in production)
    const interval = this.parseCronToInterval(cronPattern);

    const timer = setInterval(async () => {
      try {
        await this.generateReport(config);
      } catch (error) {
        console.error('Failed to generate scheduled report:', error);
      }
    }, interval);

    this.schedules.set(scheduleId, timer);
    return scheduleId;
  }

  /**
   * Cancel a scheduled report
   */
  cancelSchedule(scheduleId: string): boolean {
    const timer = this.schedules.get(scheduleId);
    if (!timer) return false;

    clearInterval(timer);
    this.schedules.delete(scheduleId);
    return true;
  }

  /**
   * Generate daily rollup report
   */
  async generateDailyRollup(date?: Date): Promise<Report> {
    const targetDate = date || new Date();
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    return this.generateReport({
      name: `Daily Report - ${targetDate.toISOString().split('T')[0]}`,
      description: 'Automated daily rollup of all metrics',
      metrics: [
        'workflows_created',
        'workflows_executed',
        'execution_duration_seconds',
        'execution_success_rate',
        'active_users',
        'api_calls_total',
        'errors_total',
      ],
      startDate,
      endDate,
      aggregation: {
        type: 'sum',
        period: 'day',
      },
    });
  }

  /**
   * Generate weekly rollup report
   */
  async generateWeeklyRollup(date?: Date): Promise<Report> {
    const targetDate = date || new Date();
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    return this.generateReport({
      name: `Weekly Report - Week of ${startDate.toISOString().split('T')[0]}`,
      description: 'Automated weekly rollup of all metrics',
      metrics: [
        'workflows_created',
        'workflows_executed',
        'execution_duration_seconds',
        'execution_success_rate',
        'active_users',
        'api_calls_total',
        'errors_total',
      ],
      startDate,
      endDate,
      aggregation: {
        type: 'sum',
        period: 'week',
      },
    });
  }

  /**
   * Generate monthly rollup report
   */
  async generateMonthlyRollup(date?: Date): Promise<Report> {
    const targetDate = date || new Date();
    const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

    return this.generateReport({
      name: `Monthly Report - ${targetDate.toISOString().substring(0, 7)}`,
      description: 'Automated monthly rollup of all metrics',
      metrics: [
        'workflows_created',
        'workflows_executed',
        'execution_duration_seconds',
        'execution_success_rate',
        'active_users',
        'api_calls_total',
        'errors_total',
      ],
      startDate,
      endDate,
      aggregation: {
        type: 'sum',
        period: 'month',
      },
    });
  }

  /**
   * Generate metric data for a time range
   */
  private async generateMetricData(
    metricName: string,
    startDate: Date,
    endDate: Date,
    period: TimePeriod,
  ) {
    const metrics = getMetricsByName(metricName);
    const filteredMetrics = metrics.filter(
      m => m.timestamp >= startDate.getTime() && m.timestamp <= endDate.getTime(),
    );

    const aggregator = getAggregator();
    const stats = aggregator.getWindowStats(metricName, period);

    return {
      count: filteredMetrics.length,
      values: filteredMetrics.map(m => m.value),
      stats,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }

  /**
   * Analyze trend for a metric
   */
  private analyzeTrend(metricName: string, metricData: any): TrendData | null {
    if (!metricData.stats || !metricData.values || metricData.values.length === 0) {
      return null;
    }

    const current = metricData.stats.sum || 0;
    const values = metricData.values as number[];

    // Use first half as "previous" and second half as "current" for comparison
    const midpoint = Math.floor(values.length / 2);
    const previousValues = values.slice(0, midpoint);
    const currentValues = values.slice(midpoint);

    const previous = previousValues.reduce((a, b) => a + b, 0) / previousValues.length || 0;
    const currentAvg = currentValues.reduce((a, b) => a + b, 0) / currentValues.length || 0;

    const change = currentAvg - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 5) {
      trend = changePercent > 0 ? 'up' : 'down';
    }

    return {
      metric: metricName,
      current: currentAvg,
      previous,
      change,
      changePercent,
      trend,
    };
  }

  /**
   * Detect anomalies using simple statistical method
   */
  private detectAnomalies(metricName: string, metricData: any): AnomalyDetectionResult[] {
    const values = metricData.values as number[];
    if (!values || values.length < 10) {
      return [];
    }

    const anomalies: AnomalyDetectionResult[] = [];

    // Calculate mean and standard deviation
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Detect values outside 2 or 3 standard deviations
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const deviation = Math.abs(value - mean) / stdDev;

      if (deviation > 2) {
        anomalies.push({
          metric: metricName,
          timestamp: Date.now() - (values.length - i) * 60000, // Rough approximation
          value,
          expected: mean,
          deviation,
          severity: deviation > 3 ? 'high' : deviation > 2.5 ? 'medium' : 'low',
          isAnomaly: true,
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(data: Record<string, unknown>) {
    const trends = data.trends as TrendData[];
    const anomalies = data.anomalies as AnomalyDetectionResult[];

    return {
      totalMetrics: Object.keys(data.metrics || {}).length,
      trendsDetected: trends.length,
      anomaliesDetected: anomalies.length,
      upwardTrends: trends.filter(t => t.trend === 'up').length,
      downwardTrends: trends.filter(t => t.trend === 'down').length,
      criticalAnomalies: anomalies.filter(a => a.severity === 'high').length,
    };
  }

  /**
   * Get default start date (24 hours ago)
   */
  private getDefaultStartDate(now: Date): Date {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    return start;
  }

  /**
   * Simple cron pattern to interval converter
   * In production, use a proper cron library
   */
  private parseCronToInterval(pattern: string): number {
    // Very simple implementation - just handle basic patterns
    if (pattern.includes('hourly') || pattern === '0 * * * *') {
      return 60 * 60 * 1000; // 1 hour
    }
    if (pattern.includes('daily') || pattern === '0 0 * * *') {
      return 24 * 60 * 60 * 1000; // 1 day
    }
    if (pattern.includes('weekly') || pattern === '0 0 * * 0') {
      return 7 * 24 * 60 * 60 * 1000; // 1 week
    }

    // Default to daily
    return 24 * 60 * 60 * 1000;
  }

  /**
   * Clear all reports
   */
  clear(): void {
    this.reports.clear();

    // Clear all schedules
    for (const timer of this.schedules.values()) {
      clearInterval(timer);
    }
    this.schedules.clear();
  }
}
