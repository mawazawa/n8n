/**
 * Metric Aggregator
 * High-performance metric aggregation supporting 1M+ events
 */

import type {
  AnalyticsEvent,
  Metric,
  TimePeriod,
  TimeSeriesData,
  AggregationConfig,
  MetricBucket,
} from './types.js';

const PERIOD_MS: Record<TimePeriod, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

interface AggregatedMetric {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
  lastUpdate: number;
}

interface WindowData {
  buckets: Map<number, AggregatedMetric>;
  startTime: number;
  endTime: number;
}

/**
 * MetricAggregator - Efficient metric aggregation with sliding windows
 *
 * Features:
 * - Real-time aggregation with sliding windows
 * - Support for sum, avg, min, max, count, percentiles
 * - Histogram bucket management
 * - Memory-efficient processing of 1M+ events
 * - Incremental aggregation
 */
export class MetricAggregator {
  private windows: Map<string, WindowData> = new Map();
  private histograms: Map<string, MetricBucket[]> = new Map();
  private config: Map<string, AggregationConfig> = new Map();

  /**
   * Configure aggregation for a metric
   */
  configureMetric(metricName: string, config: AggregationConfig): void {
    this.config.set(metricName, config);

    // Initialize histogram buckets if needed
    if (config.buckets && config.buckets > 0) {
      this.initializeHistogram(metricName, config.buckets);
    }
  }

  /**
   * Aggregate events over a time period
   * Optimized for batch processing of large event sets
   */
  aggregate(
    events: AnalyticsEvent[],
    metricExtractor: (event: AnalyticsEvent) => Metric | null,
    period: TimePeriod,
  ): TimeSeriesData[] {
    const periodMs = PERIOD_MS[period];
    const metricsByName = new Map<string, Map<number, number[]>>();

    // First pass: group events by metric and time bucket
    for (const event of events) {
      const metric = metricExtractor(event);
      if (!metric) continue;

      const bucketTime = Math.floor(event.timestamp / periodMs) * periodMs;

      let metricData = metricsByName.get(metric.name);
      if (!metricData) {
        metricData = new Map();
        metricsByName.set(metric.name, metricData);
      }

      let values = metricData.get(bucketTime);
      if (!values) {
        values = [];
        metricData.set(bucketTime, values);
      }

      values.push(metric.value);
    }

    // Second pass: compute aggregations
    const results: TimeSeriesData[] = [];

    for (const [metricName, buckets] of metricsByName) {
      const config = this.config.get(metricName);
      const aggregationType = config?.type || 'sum';

      const dataPoints = Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([timestamp, values]) => ({
          timestamp,
          value: this.computeAggregation(values, aggregationType),
        }));

      results.push({
        metric: metricName,
        period,
        dataPoints,
        aggregation: this.mapAggregationType(aggregationType),
      });
    }

    return results;
  }

  /**
   * Real-time rollup of metrics with sliding window
   */
  rollup(metric: Metric, period: TimePeriod): number {
    const windowKey = `${metric.name}:${period}`;
    const periodMs = PERIOD_MS[period];
    const now = Date.now();
    const windowStart = now - periodMs;

    // Get or create window
    let window = this.windows.get(windowKey);
    if (!window) {
      window = {
        buckets: new Map(),
        startTime: windowStart,
        endTime: now,
      };
      this.windows.set(windowKey, window);
    }

    // Update window bounds
    window.endTime = now;
    window.startTime = now - periodMs;

    // Clean up old buckets
    this.cleanupWindow(window, windowStart);

    // Add metric to window
    const bucketTime = Math.floor(metric.timestamp / 60000) * 60000; // 1-minute buckets
    let bucket = window.buckets.get(bucketTime);

    if (!bucket) {
      bucket = {
        count: 0,
        sum: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
        values: [],
        lastUpdate: metric.timestamp,
      };
      window.buckets.set(bucketTime, bucket);
    }

    // Update bucket
    bucket.count++;
    bucket.sum += metric.value;
    bucket.min = Math.min(bucket.min, metric.value);
    bucket.max = Math.max(bucket.max, metric.value);
    bucket.values.push(metric.value);
    bucket.lastUpdate = metric.timestamp;

    // Compute rollup based on config
    const config = this.config.get(metric.name);
    const aggregationType = config?.type || 'sum';

    return this.computeWindowAggregation(window, aggregationType);
  }

  /**
   * Add value to histogram
   */
  recordHistogram(metricName: string, value: number): void {
    const buckets = this.histograms.get(metricName);
    if (!buckets) {
      throw new Error(`Histogram not configured for metric: ${metricName}`);
    }

    // Find appropriate bucket
    for (const bucket of buckets) {
      if (value >= bucket.start && value < bucket.end) {
        bucket.count++;
        bucket.sum += value;
        bucket.min = Math.min(bucket.min, value);
        bucket.max = Math.max(bucket.max, value);
        bucket.values.push(value);
        break;
      }
    }
  }

  /**
   * Get histogram data
   */
  getHistogram(metricName: string): MetricBucket[] {
    const buckets = this.histograms.get(metricName);
    if (!buckets) {
      return [];
    }
    return [...buckets];
  }

  /**
   * Compute percentile from histogram
   */
  computePercentile(metricName: string, percentile: number): number {
    const buckets = this.histograms.get(metricName);
    if (!buckets || buckets.length === 0) {
      return 0;
    }

    const allValues: number[] = [];
    for (const bucket of buckets) {
      allValues.push(...bucket.values);
    }

    if (allValues.length === 0) {
      return 0;
    }

    allValues.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * allValues.length) - 1;
    return allValues[Math.max(0, index)];
  }

  /**
   * Get current window statistics
   */
  getWindowStats(metricName: string, period: TimePeriod) {
    const windowKey = `${metricName}:${period}`;
    const window = this.windows.get(windowKey);

    if (!window) {
      return null;
    }

    let totalCount = 0;
    let totalSum = 0;
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    for (const bucket of window.buckets.values()) {
      totalCount += bucket.count;
      totalSum += bucket.sum;
      globalMin = Math.min(globalMin, bucket.min);
      globalMax = Math.max(globalMax, bucket.max);
    }

    return {
      count: totalCount,
      sum: totalSum,
      avg: totalCount > 0 ? totalSum / totalCount : 0,
      min: globalMin === Number.POSITIVE_INFINITY ? 0 : globalMin,
      max: globalMax === Number.NEGATIVE_INFINITY ? 0 : globalMax,
      bucketCount: window.buckets.size,
      startTime: window.startTime,
      endTime: window.endTime,
    };
  }

  /**
   * Clear all aggregation data
   */
  clear(): void {
    this.windows.clear();
    this.histograms.clear();
  }

  /**
   * Reset a specific metric
   */
  resetMetric(metricName: string): void {
    // Remove all windows for this metric
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${metricName}:`)) {
        this.windows.delete(key);
      }
    }

    // Reset histogram
    const config = this.config.get(metricName);
    if (config?.buckets) {
      this.initializeHistogram(metricName, config.buckets);
    }
  }

  /**
   * Initialize histogram buckets
   */
  private initializeHistogram(metricName: string, bucketCount: number): void {
    const buckets: MetricBucket[] = [];
    const bucketSize = 1.0 / bucketCount;

    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        start: i * bucketSize,
        end: (i + 1) * bucketSize,
        count: 0,
        sum: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
        values: [],
      });
    }

    this.histograms.set(metricName, buckets);
  }

  /**
   * Clean up old buckets from window
   */
  private cleanupWindow(window: WindowData, cutoffTime: number): void {
    for (const [bucketTime, _] of window.buckets) {
      if (bucketTime < cutoffTime) {
        window.buckets.delete(bucketTime);
      }
    }
  }

  /**
   * Compute aggregation for a set of values
   */
  private computeAggregation(values: number[], type: string): number {
    if (values.length === 0) return 0;

    switch (type) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      case 'p50':
        return this.percentile(values, 50);
      case 'p95':
        return this.percentile(values, 95);
      case 'p99':
        return this.percentile(values, 99);
      default:
        return values.reduce((a, b) => a + b, 0);
    }
  }

  /**
   * Compute window-level aggregation
   */
  private computeWindowAggregation(window: WindowData, type: string): number {
    const buckets = Array.from(window.buckets.values());
    if (buckets.length === 0) return 0;

    switch (type) {
      case 'sum':
        return buckets.reduce((sum, b) => sum + b.sum, 0);
      case 'avg': {
        const totalSum = buckets.reduce((sum, b) => sum + b.sum, 0);
        const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
        return totalCount > 0 ? totalSum / totalCount : 0;
      }
      case 'min':
        return Math.min(...buckets.map(b => b.min));
      case 'max':
        return Math.max(...buckets.map(b => b.max));
      case 'count':
        return buckets.reduce((sum, b) => sum + b.count, 0);
      case 'p50':
      case 'p95':
      case 'p99': {
        const allValues: number[] = [];
        for (const bucket of buckets) {
          allValues.push(...bucket.values);
        }
        const p = type === 'p50' ? 50 : type === 'p95' ? 95 : 99;
        return this.percentile(allValues, p);
      }
      default:
        return buckets.reduce((sum, b) => sum + b.sum, 0);
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Map aggregation type to TimeSeriesData aggregation
   */
  private mapAggregationType(type: string): 'sum' | 'avg' | 'min' | 'max' | 'count' {
    if (type === 'sum' || type === 'avg' || type === 'min' || type === 'max' || type === 'count') {
      return type;
    }
    return 'sum';
  }
}
