/**
 * MetricCollector - Real-time metric collection and aggregation
 * Tracks experiment metrics with pre-defined and custom metrics
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { MetricEvent, Metric } from './types.js';

/**
 * Pre-defined metric names
 */
export const PREDEFINED_METRICS = {
  SUCCESS_RATE: 'success_rate',
  LATENCY: 'latency',
  ERROR_RATE: 'error_rate',
  CONVERSION_RATE: 'conversion_rate',
  REVENUE: 'revenue',
  ENGAGEMENT: 'engagement',
} as const;

/**
 * Aggregated metric data
 */
export interface AggregatedMetric {
  metricName: string;
  variantId: string;
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  variance: number;
  standardDeviation: number;
}

export class MetricCollector {
  private supabase: SupabaseClient;
  private registeredMetrics: Map<string, Metric>;
  private aggregationBuffer: Map<string, MetricEvent[]>;
  private aggregationInterval: NodeJS.Timeout | null;

  constructor(supabase: SupabaseClient, aggregationIntervalMs = 5000) {
    this.supabase = supabase;
    this.registeredMetrics = new Map();
    this.aggregationBuffer = new Map();
    this.aggregationInterval = null;

    // Initialize pre-defined metrics
    this.initializePredefinedMetrics();

    // Start aggregation interval
    if (aggregationIntervalMs > 0) {
      this.startAggregation(aggregationIntervalMs);
    }
  }

  /**
   * Track a metric event
   */
  async track(
    experimentId: string,
    variantId: string,
    metricName: string,
    value: number,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // Validate metric is registered
    if (!this.registeredMetrics.has(metricName)) {
      throw new Error(`Metric not registered: ${metricName}`);
    }

    const event: MetricEvent = {
      id: uuidv4(),
      experimentId,
      variantId,
      userId: userId || 'anonymous',
      metricName,
      value,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Add to buffer for aggregation
    const bufferKey = `${experimentId}:${variantId}:${metricName}`;
    if (!this.aggregationBuffer.has(bufferKey)) {
      this.aggregationBuffer.set(bufferKey, []);
    }
    this.aggregationBuffer.get(bufferKey)!.push(event);

    // Also store individual event
    await this.storeEvent(event);
  }

  /**
   * Register a custom metric
   */
  registerMetric(metric: Metric): void {
    this.registeredMetrics.set(metric.name, metric);
  }

  /**
   * Unregister a metric
   */
  unregisterMetric(metricName: string): void {
    this.registeredMetrics.delete(metricName);
  }

  /**
   * Get registered metrics
   */
  getRegisteredMetrics(): Metric[] {
    return Array.from(this.registeredMetrics.values());
  }

  /**
   * Get aggregated metrics for a variant
   */
  async getAggregatedMetrics(
    experimentId: string,
    variantId: string,
  ): Promise<AggregatedMetric[]> {
    const { data, error } = await this.supabase
      .from('metric_events')
      .select('metric_name, value')
      .eq('experiment_id', experimentId)
      .eq('variant_id', variantId);

    if (error) {
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }

    // Group by metric name
    const metricGroups = new Map<string, number[]>();
    (data || []).forEach((event) => {
      const metricName = event.metric_name as string;
      if (!metricGroups.has(metricName)) {
        metricGroups.set(metricName, []);
      }
      metricGroups.get(metricName)!.push(event.value as number);
    });

    // Calculate aggregations
    const aggregated: AggregatedMetric[] = [];
    metricGroups.forEach((values, metricName) => {
      aggregated.push(this.calculateAggregation(metricName, variantId, values));
    });

    return aggregated;
  }

  /**
   * Get metric history over time
   */
  async getMetricHistory(
    experimentId: string,
    variantId: string,
    metricName: string,
    bucketSize: 'hour' | 'day' | 'week' = 'day',
  ): Promise<Array<{ timestamp: string; mean: number; count: number }>> {
    const { data, error } = await this.supabase
      .from('metric_events')
      .select('timestamp, value')
      .eq('experiment_id', experimentId)
      .eq('variant_id', variantId)
      .eq('metric_name', metricName)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch metric history: ${error.message}`);
    }

    // Group by time bucket
    const buckets = new Map<string, number[]>();
    (data || []).forEach((event) => {
      const bucket = this.getBucketKey(event.timestamp as string, bucketSize);
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(event.value as number);
    });

    // Calculate mean for each bucket
    const history: Array<{ timestamp: string; mean: number; count: number }> = [];
    buckets.forEach((values, timestamp) => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      history.push({ timestamp, mean, count: values.length });
    });

    return history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Track success rate (proportion metric)
   */
  async trackSuccess(
    experimentId: string,
    variantId: string,
    success: boolean,
    userId?: string,
  ): Promise<void> {
    await this.track(experimentId, variantId, PREDEFINED_METRICS.SUCCESS_RATE, success ? 1 : 0, userId);
  }

  /**
   * Track latency (continuous metric)
   */
  async trackLatency(
    experimentId: string,
    variantId: string,
    latencyMs: number,
    userId?: string,
  ): Promise<void> {
    await this.track(experimentId, variantId, PREDEFINED_METRICS.LATENCY, latencyMs, userId);
  }

  /**
   * Track error (proportion metric)
   */
  async trackError(
    experimentId: string,
    variantId: string,
    error: boolean,
    userId?: string,
  ): Promise<void> {
    await this.track(experimentId, variantId, PREDEFINED_METRICS.ERROR_RATE, error ? 1 : 0, userId);
  }

  /**
   * Track conversion (proportion metric)
   */
  async trackConversion(
    experimentId: string,
    variantId: string,
    converted: boolean,
    userId?: string,
  ): Promise<void> {
    await this.track(experimentId, variantId, PREDEFINED_METRICS.CONVERSION_RATE, converted ? 1 : 0, userId);
  }

  /**
   * Track revenue (continuous metric)
   */
  async trackRevenue(
    experimentId: string,
    variantId: string,
    amount: number,
    userId?: string,
  ): Promise<void> {
    await this.track(experimentId, variantId, PREDEFINED_METRICS.REVENUE, amount, userId);
  }

  /**
   * Flush aggregation buffer
   */
  async flushBuffer(): Promise<void> {
    if (this.aggregationBuffer.size === 0) {
      return;
    }

    // Process all buffered events
    const promises: Promise<void>[] = [];
    this.aggregationBuffer.forEach((events, key) => {
      if (events.length > 0) {
        promises.push(this.processBufferedEvents(events));
      }
    });

    await Promise.all(promises);
    this.aggregationBuffer.clear();
  }

  /**
   * Stop aggregation interval
   */
  stopAggregation(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
    }
  }

  /**
   * Initialize pre-defined metrics
   */
  private initializePredefinedMetrics(): void {
    this.registerMetric({
      name: PREDEFINED_METRICS.SUCCESS_RATE,
      type: 'proportion',
      goal: 'maximize',
      description: 'Success rate of workflow executions',
      isPrimary: true,
    });

    this.registerMetric({
      name: PREDEFINED_METRICS.LATENCY,
      type: 'continuous',
      goal: 'minimize',
      description: 'Workflow execution latency',
      unit: 'ms',
      isPrimary: true,
    });

    this.registerMetric({
      name: PREDEFINED_METRICS.ERROR_RATE,
      type: 'proportion',
      goal: 'minimize',
      description: 'Error rate of workflow executions',
      isPrimary: true,
    });

    this.registerMetric({
      name: PREDEFINED_METRICS.CONVERSION_RATE,
      type: 'proportion',
      goal: 'maximize',
      description: 'Conversion rate',
      isPrimary: false,
    });

    this.registerMetric({
      name: PREDEFINED_METRICS.REVENUE,
      type: 'continuous',
      goal: 'maximize',
      description: 'Revenue generated',
      unit: 'USD',
      isPrimary: false,
    });

    this.registerMetric({
      name: PREDEFINED_METRICS.ENGAGEMENT,
      type: 'continuous',
      goal: 'maximize',
      description: 'User engagement score',
      isPrimary: false,
    });
  }

  /**
   * Store a metric event in the database
   */
  private async storeEvent(event: MetricEvent): Promise<void> {
    const { error } = await this.supabase.from('metric_events').insert({
      id: event.id,
      experiment_id: event.experimentId,
      variant_id: event.variantId,
      user_id: event.userId,
      metric_name: event.metricName,
      value: event.value,
      timestamp: event.timestamp,
      metadata: event.metadata,
    });

    if (error) {
      console.error('Failed to store metric event:', error);
    }
  }

  /**
   * Calculate aggregation for a set of values
   */
  private calculateAggregation(
    metricName: string,
    variantId: string,
    values: number[],
  ): AggregatedMetric {
    const count = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / count;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate variance
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);

    return {
      metricName,
      variantId,
      count,
      sum,
      mean,
      min,
      max,
      variance,
      standardDeviation,
    };
  }

  /**
   * Get bucket key for time-based aggregation
   */
  private getBucketKey(timestamp: string, bucketSize: 'hour' | 'day' | 'week'): string {
    const date = new Date(timestamp);

    switch (bucketSize) {
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
      case 'week':
        date.setHours(0, 0, 0, 0);
        const day = date.getDay();
        date.setDate(date.getDate() - day);
        break;
    }

    return date.toISOString();
  }

  /**
   * Start aggregation interval
   */
  private startAggregation(intervalMs: number): void {
    this.aggregationInterval = setInterval(() => {
      this.flushBuffer().catch((error) => {
        console.error('Failed to flush aggregation buffer:', error);
      });
    }, intervalMs);
  }

  /**
   * Process buffered events (placeholder for real-time aggregation)
   */
  private async processBufferedEvents(events: MetricEvent[]): Promise<void> {
    // This could update real-time aggregation tables
    // For now, events are already stored individually
    return Promise.resolve();
  }
}
