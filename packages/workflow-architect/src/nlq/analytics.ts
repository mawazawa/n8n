/**
 * Query Analytics
 * Tracks and analyzes query performance and patterns
 */

import type { QueryAnalytics as QueryAnalyticsData, Feedback } from './types';
import { Intent } from './types';

/**
 * Analytics report
 */
export interface AnalyticsReport {
  totalQueries: number;
  successRate: number;
  avgExecutionTime: number;
  avgConfidence: number;
  popularIntents: Array<{ intent: Intent; count: number }>;
  failedQueries: Array<{ query: string; count: number }>;
  avgSatisfaction?: number;
  timeRange: { start: Date; end: Date };
}

/**
 * Query analytics configuration
 */
export interface QueryAnalyticsConfig {
  enableTracking?: boolean;
  maxDataPoints?: number;
  aggregationInterval?: number;
}

/**
 * Aggregated metrics
 */
interface AggregatedMetrics {
  totalQueries: number;
  successCount: number;
  failureCount: number;
  totalExecutionTime: number;
  totalConfidence: number;
  intentCounts: Map<Intent, number>;
  cachedCount: number;
  feedbackCount: number;
  totalSatisfaction: number;
}

/**
 * QueryAnalytics tracks and analyzes query performance
 */
export class QueryAnalytics {
  private config: Required<QueryAnalyticsConfig>;
  private dataPoints: QueryAnalyticsData[];
  private failedQueries: Map<string, number>; // query -> count
  private metrics: AggregatedMetrics;

  constructor(config: QueryAnalyticsConfig = {}) {
    this.config = {
      enableTracking: config.enableTracking ?? true,
      maxDataPoints: config.maxDataPoints ?? 10000,
      aggregationInterval: config.aggregationInterval ?? 3600000, // 1 hour
    };

    this.dataPoints = [];
    this.failedQueries = new Map();
    this.metrics = this.initializeMetrics();

    // Set up periodic aggregation
    setInterval(() => this.aggregate(), this.config.aggregationInterval);
  }

  /**
   * Track a query execution
   */
  async track(data: Omit<QueryAnalyticsData, 'queryId' | 'timestamp'>): Promise<string> {
    if (!this.config.enableTracking) {
      return '';
    }

    const queryId = this.generateId();
    const dataPoint: QueryAnalyticsData = {
      ...data,
      queryId,
      timestamp: new Date(),
    };

    // Add to data points
    this.dataPoints.push(dataPoint);

    // Update metrics
    this.updateMetrics(dataPoint);

    // Track failed queries
    if (!data.success) {
      const count = this.failedQueries.get(data.queryText) || 0;
      this.failedQueries.set(data.queryText, count + 1);
    }

    // Trim if exceeds max
    if (this.dataPoints.length > this.config.maxDataPoints) {
      this.dataPoints.shift();
    }

    return queryId;
  }

  /**
   * Update feedback for a query
   */
  async updateFeedback(queryId: string, feedback: Feedback): Promise<boolean> {
    const dataPoint = this.dataPoints.find((dp) => dp.queryId === queryId);
    if (!dataPoint) return false;

    dataPoint.feedback = feedback;

    // Update metrics
    if (feedback.rating) {
      this.metrics.feedbackCount++;
      this.metrics.totalSatisfaction += feedback.rating;
    }

    return true;
  }

  /**
   * Generate analytics report
   */
  async generateReport(timeRange?: { start: Date; end: Date }): Promise<AnalyticsReport> {
    let data = this.dataPoints;

    // Filter by time range if provided
    if (timeRange) {
      data = data.filter(
        (dp) => dp.timestamp >= timeRange.start && dp.timestamp <= timeRange.end,
      );
    }

    if (data.length === 0) {
      return {
        totalQueries: 0,
        successRate: 0,
        avgExecutionTime: 0,
        avgConfidence: 0,
        popularIntents: [],
        failedQueries: [],
        timeRange: timeRange || { start: new Date(), end: new Date() },
      };
    }

    // Calculate metrics
    const totalQueries = data.length;
    const successCount = data.filter((dp) => dp.success).length;
    const successRate = successCount / totalQueries;

    const avgExecutionTime =
      data.reduce((sum, dp) => sum + dp.executionTime, 0) / totalQueries;

    const avgConfidence = data.reduce((sum, dp) => sum + dp.confidence, 0) / totalQueries;

    // Popular intents
    const intentCounts = new Map<Intent, number>();
    for (const dp of data) {
      intentCounts.set(dp.intent, (intentCounts.get(dp.intent) || 0) + 1);
    }

    const popularIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Failed queries
    const failedInRange = new Map<string, number>();
    for (const dp of data.filter((d) => !d.success)) {
      failedInRange.set(dp.queryText, (failedInRange.get(dp.queryText) || 0) + 1);
    }

    const failedQueries = Array.from(failedInRange.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Average satisfaction
    const withFeedback = data.filter((dp) => dp.feedback?.rating);
    const avgSatisfaction =
      withFeedback.length > 0
        ? withFeedback.reduce((sum, dp) => sum + (dp.feedback?.rating || 0), 0) /
          withFeedback.length
        : undefined;

    return {
      totalQueries,
      successRate,
      avgExecutionTime,
      avgConfidence,
      popularIntents,
      failedQueries,
      avgSatisfaction,
      timeRange: timeRange || {
        start: data[0].timestamp,
        end: data[data.length - 1].timestamp,
      },
    };
  }

  /**
   * Get popular queries
   */
  async getPopularQueries(limit = 10): Promise<Array<{ query: string; count: number }>> {
    const queryCounts = new Map<string, number>();

    for (const dp of this.dataPoints) {
      if (dp.success) {
        queryCounts.set(dp.queryText, (queryCounts.get(dp.queryText) || 0) + 1);
      }
    }

    return Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get failed queries analysis
   */
  async getFailedQueriesAnalysis(limit = 20): Promise<
    Array<{
      query: string;
      count: number;
      avgConfidence: number;
      lastSeen: Date;
    }>
  > {
    const failed = this.dataPoints.filter((dp) => !dp.success);

    const queryMap = new Map<
      string,
      { count: number; totalConfidence: number; lastSeen: Date }
    >();

    for (const dp of failed) {
      const existing = queryMap.get(dp.queryText);
      if (existing) {
        existing.count++;
        existing.totalConfidence += dp.confidence;
        if (dp.timestamp > existing.lastSeen) {
          existing.lastSeen = dp.timestamp;
        }
      } else {
        queryMap.set(dp.queryText, {
          count: 1,
          totalConfidence: dp.confidence,
          lastSeen: dp.timestamp,
        });
      }
    }

    return Array.from(queryMap.entries())
      .map(([query, data]) => ({
        query,
        count: data.count,
        avgConfidence: data.totalConfidence / data.count,
        lastSeen: data.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get user satisfaction metrics
   */
  async getSatisfactionMetrics(): Promise<{
    avgRating: number;
    totalFeedback: number;
    helpfulPercentage: number;
    ratingDistribution: Record<number, number>;
  }> {
    const withFeedback = this.dataPoints.filter((dp) => dp.feedback);

    if (withFeedback.length === 0) {
      return {
        avgRating: 0,
        totalFeedback: 0,
        helpfulPercentage: 0,
        ratingDistribution: {},
      };
    }

    const totalRating = withFeedback.reduce(
      (sum, dp) => sum + (dp.feedback?.rating || 0),
      0,
    );
    const avgRating = totalRating / withFeedback.length;

    const helpfulCount = withFeedback.filter((dp) => dp.feedback?.helpful).length;
    const helpfulPercentage = (helpfulCount / withFeedback.length) * 100;

    const ratingDistribution: Record<number, number> = {};
    for (const dp of withFeedback) {
      const rating = dp.feedback?.rating || 0;
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    }

    return {
      avgRating,
      totalFeedback: withFeedback.length,
      helpfulPercentage,
      ratingDistribution,
    };
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(
    interval: 'hour' | 'day' | 'week',
  ): Promise<
    Array<{
      timestamp: Date;
      queryCount: number;
      successRate: number;
      avgExecutionTime: number;
    }>
  > {
    // Group data points by interval
    const groups = new Map<
      string,
      Array<{ success: boolean; executionTime: number; timestamp: Date }>
    >();

    for (const dp of this.dataPoints) {
      const key = this.getIntervalKey(dp.timestamp, interval);
      const group = groups.get(key) || [];
      group.push({
        success: dp.success,
        executionTime: dp.executionTime,
        timestamp: dp.timestamp,
      });
      groups.set(key, group);
    }

    // Calculate metrics for each group
    return Array.from(groups.entries())
      .map(([key, data]) => {
        const successCount = data.filter((d) => d.success).length;
        const avgExecutionTime =
          data.reduce((sum, d) => sum + d.executionTime, 0) / data.length;

        return {
          timestamp: data[0].timestamp,
          queryCount: data.length,
          successRate: successCount / data.length,
          avgExecutionTime,
        };
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Export analytics data
   */
  async exportData(): Promise<string> {
    return JSON.stringify(
      {
        dataPoints: this.dataPoints,
        metrics: {
          ...this.metrics,
          intentCounts: Array.from(this.metrics.intentCounts.entries()),
        },
        failedQueries: Array.from(this.failedQueries.entries()),
        exportedAt: new Date(),
      },
      null,
      2,
    );
  }

  /**
   * Clear all analytics data
   */
  async clear(): Promise<void> {
    this.dataPoints = [];
    this.failedQueries.clear();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): AggregatedMetrics {
    return {
      totalQueries: 0,
      successCount: 0,
      failureCount: 0,
      totalExecutionTime: 0,
      totalConfidence: 0,
      intentCounts: new Map(),
      cachedCount: 0,
      feedbackCount: 0,
      totalSatisfaction: 0,
    };
  }

  /**
   * Update aggregated metrics
   */
  private updateMetrics(dataPoint: QueryAnalyticsData): void {
    this.metrics.totalQueries++;

    if (dataPoint.success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }

    this.metrics.totalExecutionTime += dataPoint.executionTime;
    this.metrics.totalConfidence += dataPoint.confidence;

    const intentCount = this.metrics.intentCounts.get(dataPoint.intent) || 0;
    this.metrics.intentCounts.set(dataPoint.intent, intentCount + 1);

    if (dataPoint.cached) {
      this.metrics.cachedCount++;
    }
  }

  /**
   * Aggregate old data points
   */
  private aggregate(): void {
    // TODO: Implement data aggregation for long-term storage
    console.debug('Aggregating analytics data');
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get interval key for grouping
   */
  private getIntervalKey(date: Date, interval: 'hour' | 'day' | 'week'): string {
    const d = new Date(date);

    switch (interval) {
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
    }

    return d.toISOString();
  }
}
