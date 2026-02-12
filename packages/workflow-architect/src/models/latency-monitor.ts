/**
 * Latency Monitor
 * Tracks and analyzes latency metrics per model
 */

import type { ModelId } from './router.js';

export interface LatencyMetrics {
  p50: number;  // Median
  p95: number;  // 95th percentile
  p99: number;  // 99th percentile
  mean: number;
  min: number;
  max: number;
  count: number;
}

export interface RequestLatency {
  requestId: string;
  modelId: ModelId;
  startTime: number;
  endTime?: number;
  latency?: number;
  timestamp: Date;
}

export interface LatencyMonitorConfig {
  maxHistorySize?: number;
  enableRealTimeAlerts?: boolean;
  slowRequestThreshold?: number; // milliseconds
  windowSize?: number; // milliseconds for rolling window
}

export class LatencyMonitor {
  private requests: Map<string, RequestLatency> = new Map();
  private history: RequestLatency[] = [];
  private config: LatencyMonitorConfig;

  constructor(config: LatencyMonitorConfig = {}) {
    this.config = {
      maxHistorySize: config.maxHistorySize ?? 10000,
      enableRealTimeAlerts: config.enableRealTimeAlerts ?? false,
      slowRequestThreshold: config.slowRequestThreshold ?? 5000, // 5 seconds
      windowSize: config.windowSize ?? 3600000, // 1 hour
    };
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, modelId: ModelId): void {
    const request: RequestLatency = {
      requestId,
      modelId,
      startTime: Date.now(),
      timestamp: new Date(),
    };

    this.requests.set(requestId, request);
  }

  /**
   * End tracking a request
   */
  endRequest(requestId: string, modelId: ModelId): number | null {
    const request = this.requests.get(requestId);
    if (!request) {
      console.warn(`[Latency] Request ${requestId} not found`);
      return null;
    }

    request.endTime = Date.now();
    request.latency = request.endTime - request.startTime;

    // Add to history
    this.history.push({ ...request });
    this.requests.delete(requestId);

    // Trim history if needed
    if (this.history.length > (this.config.maxHistorySize || 10000)) {
      this.history = this.history.slice(-this.config.maxHistorySize!);
    }

    // Check for slow requests
    if (this.config.enableRealTimeAlerts && request.latency > (this.config.slowRequestThreshold || 5000)) {
      console.warn(`[Latency] Slow request detected: ${modelId} took ${request.latency}ms`);
    }

    return request.latency;
  }

  /**
   * Get metrics for a specific model
   */
  getModelMetrics(modelId: ModelId, windowMs?: number): LatencyMetrics | null {
    const cutoffTime = windowMs ? Date.now() - windowMs : 0;

    const latencies = this.history
      .filter(r => r.modelId === modelId && r.latency !== undefined)
      .filter(r => r.startTime >= cutoffTime)
      .map(r => r.latency!)
      .sort((a, b) => a - b);

    if (latencies.length === 0) {
      return null;
    }

    return this.calculateMetrics(latencies);
  }

  /**
   * Get metrics for all models
   */
  getAllMetrics(windowMs?: number): Record<string, LatencyMetrics> {
    const cutoffTime = windowMs ? Date.now() - windowMs : 0;

    const byModel = new Map<ModelId, number[]>();

    for (const request of this.history) {
      if (request.latency === undefined || request.startTime < cutoffTime) {
        continue;
      }

      if (!byModel.has(request.modelId)) {
        byModel.set(request.modelId, []);
      }
      byModel.get(request.modelId)!.push(request.latency);
    }

    const metrics: Record<string, LatencyMetrics> = {};

    for (const [modelId, latencies] of byModel.entries()) {
      latencies.sort((a, b) => a - b);
      metrics[modelId] = this.calculateMetrics(latencies);
    }

    return metrics;
  }

  /**
   * Calculate percentile metrics from sorted latencies
   */
  private calculateMetrics(sortedLatencies: number[]): LatencyMetrics {
    const count = sortedLatencies.length;

    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    const sum = sortedLatencies.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;

    return {
      p50: sortedLatencies[p50Index],
      p95: sortedLatencies[p95Index],
      p99: sortedLatencies[p99Index],
      mean,
      min: sortedLatencies[0],
      max: sortedLatencies[count - 1],
      count,
    };
  }

  /**
   * Get current request count (in-flight requests)
   */
  getCurrentLoad(): number {
    return this.requests.size;
  }

  /**
   * Get current load per model
   */
  getCurrentLoadByModel(): Record<string, number> {
    const load: Record<string, number> = {};

    for (const request of this.requests.values()) {
      load[request.modelId] = (load[request.modelId] || 0) + 1;
    }

    return load;
  }

  /**
   * Get recent latencies for a model
   */
  getRecentLatencies(modelId: ModelId, limit: number = 100): number[] {
    return this.history
      .filter(r => r.modelId === modelId && r.latency !== undefined)
      .slice(-limit)
      .map(r => r.latency!);
  }

  /**
   * Get slowest requests
   */
  getSlowestRequests(limit: number = 10, modelId?: ModelId): RequestLatency[] {
    let requests = this.history.filter(r => r.latency !== undefined);

    if (modelId) {
      requests = requests.filter(r => r.modelId === modelId);
    }

    return requests
      .sort((a, b) => (b.latency || 0) - (a.latency || 0))
      .slice(0, limit);
  }

  /**
   * Get fastest model based on recent performance
   */
  getFastestModel(windowMs?: number): { modelId: ModelId; p50: number } | null {
    const metrics = this.getAllMetrics(windowMs);
    const entries = Object.entries(metrics);

    if (entries.length === 0) {
      return null;
    }

    const fastest = entries.reduce((min, [modelId, metric]) => {
      if (!min || metric.p50 < min.metric.p50) {
        return { modelId: modelId as ModelId, metric };
      }
      return min;
    }, null as { modelId: ModelId; metric: LatencyMetrics } | null);

    if (!fastest) {
      return null;
    }

    return {
      modelId: fastest.modelId,
      p50: fastest.metric.p50,
    };
  }

  /**
   * Get latency trend for a model
   * Returns average latency over time buckets
   */
  getLatencyTrend(modelId: ModelId, bucketSizeMs: number = 300000): Array<{
    timestamp: number;
    avgLatency: number;
    count: number;
  }> {
    const buckets = new Map<number, number[]>();

    for (const request of this.history) {
      if (request.modelId !== modelId || request.latency === undefined) {
        continue;
      }

      const bucketTime = Math.floor(request.startTime / bucketSizeMs) * bucketSizeMs;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime)!.push(request.latency);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, latencies]) => ({
        timestamp,
        avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
        count: latencies.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Check if a model is performing well
   */
  isModelHealthy(modelId: ModelId, maxP95Ms: number = 3000): boolean {
    const metrics = this.getModelMetrics(modelId);
    if (!metrics) {
      return true; // No data, assume healthy
    }

    return metrics.p95 <= maxP95Ms;
  }

  /**
   * Get health status for all models
   */
  getHealthStatus(maxP95Ms: number = 3000): Record<string, {
    healthy: boolean;
    p95: number;
    reason?: string;
  }> {
    const metrics = this.getAllMetrics();
    const status: Record<string, { healthy: boolean; p95: number; reason?: string }> = {};

    for (const [modelId, metric] of Object.entries(metrics)) {
      const healthy = metric.p95 <= maxP95Ms;
      status[modelId] = {
        healthy,
        p95: metric.p95,
        reason: healthy ? undefined : `P95 latency (${metric.p95}ms) exceeds threshold (${maxP95Ms}ms)`,
      };
    }

    return status;
  }

  /**
   * Export latency data as CSV
   */
  exportCSV(): string {
    const headers = ['Request ID', 'Model', 'Start Time', 'End Time', 'Latency (ms)', 'Timestamp'];

    const rows = this.history
      .filter(r => r.latency !== undefined)
      .map(r => [
        r.requestId,
        r.modelId,
        new Date(r.startTime).toISOString(),
        r.endTime ? new Date(r.endTime).toISOString() : '',
        r.latency?.toString() || '',
        r.timestamp.toISOString(),
      ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.requests.clear();
    this.history = [];
  }

  /**
   * Clean old entries beyond window size
   */
  cleanOldEntries(): void {
    const cutoffTime = Date.now() - (this.config.windowSize || 3600000);
    const beforeCount = this.history.length;

    this.history = this.history.filter(r => r.startTime >= cutoffTime);

    const afterCount = this.history.length;
    if (beforeCount !== afterCount) {
      console.log(`[Latency] Cleaned up ${beforeCount - afterCount} old entries`);
    }
  }
}

// Singleton instance
let monitorInstance: LatencyMonitor | null = null;

export function getLatencyMonitor(config?: LatencyMonitorConfig): LatencyMonitor {
  if (!monitorInstance || config) {
    monitorInstance = new LatencyMonitor(config);
  }
  return monitorInstance;
}
