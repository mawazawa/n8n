/**
 * Built-in Metrics
 * Pre-configured metrics for workflow analytics
 */

import type { Metric, MetricType } from './types.js';
import { MetricAggregator } from './aggregator.js';

// Metric registry
const metrics: Map<string, Metric> = new Map();
const aggregator = new MetricAggregator();

/**
 * Built-in metric names
 */
export const METRICS = {
  WORKFLOWS_CREATED: 'workflows_created',
  WORKFLOWS_EXECUTED: 'workflows_executed',
  EXECUTION_DURATION_SECONDS: 'execution_duration_seconds',
  EXECUTION_SUCCESS_RATE: 'execution_success_rate',
  ACTIVE_USERS: 'active_users',
  API_CALLS_TOTAL: 'api_calls_total',
  ERRORS_TOTAL: 'errors_total',
} as const;

/**
 * Initialize built-in metrics with aggregation configs
 */
export function initializeMetrics(): void {
  // Counter: workflows_created
  aggregator.configureMetric(METRICS.WORKFLOWS_CREATED, {
    type: 'count',
    period: 'day',
  });

  // Counter: workflows_executed
  aggregator.configureMetric(METRICS.WORKFLOWS_EXECUTED, {
    type: 'count',
    period: 'hour',
  });

  // Histogram: execution_duration_seconds
  aggregator.configureMetric(METRICS.EXECUTION_DURATION_SECONDS, {
    type: 'p95',
    period: 'hour',
    buckets: 50,
  });

  // Gauge: execution_success_rate
  aggregator.configureMetric(METRICS.EXECUTION_SUCCESS_RATE, {
    type: 'avg',
    period: 'hour',
  });

  // Gauge: active_users
  aggregator.configureMetric(METRICS.ACTIVE_USERS, {
    type: 'count',
    period: 'day',
  });

  // Counter: api_calls_total
  aggregator.configureMetric(METRICS.API_CALLS_TOTAL, {
    type: 'count',
    period: 'hour',
  });

  // Counter: errors_total (with labels)
  aggregator.configureMetric(METRICS.ERRORS_TOTAL, {
    type: 'count',
    period: 'hour',
  });
}

/**
 * Record a metric value
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {},
): void {
  const metric: Metric = {
    name,
    type: getMetricType(name),
    value,
    labels,
    timestamp: Date.now(),
  };

  metrics.set(`${name}:${Date.now()}`, metric);
  aggregator.rollup(metric, 'hour');
}

/**
 * Increment a counter metric
 */
export function incrementCounter(name: string, labels: Record<string, string> = {}): void {
  recordMetric(name, 1, labels);
}

/**
 * Set a gauge metric
 */
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  recordMetric(name, value, labels);
}

/**
 * Record a histogram/timing value
 */
export function recordHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {},
): void {
  recordMetric(name, value, labels);
  aggregator.recordHistogram(name, value);
}

/**
 * Record a timing in milliseconds (converted to seconds)
 */
export function recordTiming(
  name: string,
  durationMs: number,
  labels: Record<string, string> = {},
): void {
  const durationSeconds = durationMs / 1000;
  recordHistogram(name, durationSeconds, labels);
}

/**
 * Built-in metric helpers
 */

export function workflowCreated(workflowId: string, userId?: string): void {
  incrementCounter(METRICS.WORKFLOWS_CREATED, {
    workflow_id: workflowId,
    user_id: userId || 'unknown',
  });
}

export function workflowExecuted(
  workflowId: string,
  success: boolean,
  durationMs: number,
): void {
  incrementCounter(METRICS.WORKFLOWS_EXECUTED, {
    workflow_id: workflowId,
    status: success ? 'success' : 'failure',
  });

  recordTiming(METRICS.EXECUTION_DURATION_SECONDS, durationMs, {
    workflow_id: workflowId,
  });

  setGauge(METRICS.EXECUTION_SUCCESS_RATE, success ? 1 : 0, {
    workflow_id: workflowId,
  });
}

export function activeUser(userId: string): void {
  incrementCounter(METRICS.ACTIVE_USERS, {
    user_id: userId,
  });
}

export function apiCall(endpoint: string, method: string, statusCode: number): void {
  incrementCounter(METRICS.API_CALLS_TOTAL, {
    endpoint,
    method,
    status_code: statusCode.toString(),
  });
}

export function recordError(
  errorType: string,
  errorCode: string,
  context: Record<string, string> = {},
): void {
  incrementCounter(METRICS.ERRORS_TOTAL, {
    type: errorType,
    code: errorCode,
    ...context,
  });
}

/**
 * Get all recorded metrics
 */
export function getMetrics(): Metric[] {
  return Array.from(metrics.values());
}

/**
 * Get metrics by name
 */
export function getMetricsByName(name: string): Metric[] {
  return Array.from(metrics.values()).filter(m => m.name === name);
}

/**
 * Get metrics in time range
 */
export function getMetricsInRange(startTime: number, endTime: number): Metric[] {
  return Array.from(metrics.values()).filter(
    m => m.timestamp >= startTime && m.timestamp <= endTime,
  );
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metrics.clear();
  aggregator.clear();
}

/**
 * Get the aggregator instance
 */
export function getAggregator(): MetricAggregator {
  return aggregator;
}

/**
 * Get percentile for a histogram metric
 */
export function getPercentile(metricName: string, percentile: number): number {
  return aggregator.computePercentile(metricName, percentile);
}

/**
 * Get histogram data
 */
export function getHistogram(metricName: string) {
  return aggregator.getHistogram(metricName);
}

/**
 * Get metric statistics for a time period
 */
export function getMetricStats(name: string, period: 'hour' | 'day' | 'week' | 'month') {
  return aggregator.getWindowStats(name, period);
}

/**
 * Measure execution time of a function
 */
export async function measureExecution<T>(
  name: string,
  fn: () => Promise<T> | T,
  labels: Record<string, string> = {},
): Promise<T> {
  const start = performance.now();
  let success = true;

  try {
    const result = await fn();
    return result;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const duration = performance.now() - start;
    recordTiming(name, duration, {
      ...labels,
      status: success ? 'success' : 'failure',
    });
  }
}

/**
 * Create a timer that can be stopped later
 */
export function startTimer(name: string, labels: Record<string, string> = {}) {
  const start = performance.now();

  return {
    stop: (additionalLabels: Record<string, string> = {}) => {
      const duration = performance.now() - start;
      recordTiming(name, duration, { ...labels, ...additionalLabels });
      return duration;
    },
    getDuration: () => {
      return performance.now() - start;
    },
  };
}

/**
 * Get metric type from name
 */
function getMetricType(name: string): MetricType {
  if (name.includes('duration') || name.includes('latency') || name.includes('timing')) {
    return 'histogram';
  }

  if (name.includes('rate') || name.includes('ratio') || name.includes('percentage')) {
    return 'gauge';
  }

  if (name.includes('total') || name.includes('count') || name.includes('created')) {
    return 'counter';
  }

  // Default to counter
  return 'counter';
}

// Initialize metrics on module load
initializeMetrics();
