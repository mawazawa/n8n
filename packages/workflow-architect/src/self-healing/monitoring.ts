import type { HealthMetric, HealthEvent, HealthState } from './types.js';
import { HealthState as HealthStateEnum } from './types.js';
import { AnomalyDetector } from './detector.js';

/**
 * Health Monitoring System
 *
 * Real-time monitoring of workflow health with metrics collection and alerts.
 */
export class HealthMonitor {
  private readonly detector: AnomalyDetector;
  private readonly metrics: Map<string, MetricHistory> = new Map();
  private readonly thresholds: Map<string, ThresholdConfig> = new Map();
  private isMonitoring = false;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(detector?: AnomalyDetector) {
    this.detector = detector || new AnomalyDetector();

    // Set default thresholds
    this.setDefaultThresholds();
  }

  /**
   * Start monitoring a workflow
   */
  async *monitor(workflowId: string, options?: MonitorOptions): AsyncGenerator<HealthEvent> {
    this.isMonitoring = true;
    const interval = options?.interval || 5000; // 5 seconds default
    const duration = options?.duration; // Optional duration limit

    const startTime = Date.now();

    try {
      while (this.isMonitoring) {
        // Check duration limit
        if (duration && Date.now() - startTime > duration) {
          break;
        }

        // Collect metrics
        const metrics = await this.collectMetrics(workflowId);

        // Store metrics
        this.storeMetrics(workflowId, metrics);

        // Detect anomalies
        const anomalies = await this.detector.detect(metrics);

        // Determine health state
        const healthState = this.determineHealthState(workflowId, metrics, anomalies.length > 0);

        // Yield health events
        if (anomalies.length > 0) {
          yield {
            type: 'ANOMALY_DETECTED',
            workflowId,
            timestamp: Date.now(),
            data: { anomalies, metrics },
          };
        }

        if (healthState !== HealthStateEnum.HEALTHY) {
          yield {
            type: 'STATE_CHANGED',
            workflowId,
            timestamp: Date.now(),
            data: { state: healthState, metrics },
          };
        }

        // Wait for next interval
        await this.sleep(interval);
      }
    } finally {
      this.isMonitoring = false;
    }
  }

  /**
   * Collect metrics for a workflow
   */
  private async collectMetrics(workflowId: string): Promise<HealthMetric> {
    // Simulate metric collection
    const latency = this.simulateLatency();
    const errorRate = this.simulateErrorRate();
    const memoryUsage = this.simulateMemoryUsage();
    const cpuUsage = this.simulateCpuUsage();

    const metric: HealthMetric = {
      workflowId,
      timestamp: Date.now(),
      metrics: {
        latency,
        errorRate,
        memoryUsage,
        cpuUsage,
        throughput: Math.random() * 100,
        activeConnections: Math.floor(Math.random() * 50),
      },
      state: HealthStateEnum.HEALTHY,
    };

    // Add to detector historical data
    this.detector.addDataPoint(workflowId, 'workflow', 'latency', latency);
    this.detector.addDataPoint(workflowId, 'workflow', 'errorRate', errorRate);
    this.detector.addDataPoint(workflowId, 'workflow', 'memoryUsage', memoryUsage);

    return metric;
  }

  /**
   * Store metrics in history
   */
  private storeMetrics(workflowId: string, metric: HealthMetric): void {
    const history = this.metrics.get(workflowId) || {
      workflowId,
      dataPoints: [],
      startedAt: Date.now(),
    };

    history.dataPoints.push(metric);

    // Keep last 1000 data points
    if (history.dataPoints.length > 1000) {
      history.dataPoints.shift();
    }

    this.metrics.set(workflowId, history);
  }

  /**
   * Determine health state based on metrics
   */
  private determineHealthState(
    workflowId: string,
    metrics: HealthMetric,
    hasAnomalies: boolean
  ): HealthState {
    const thresholds = this.thresholds.get(workflowId) || this.getDefaultThresholds();

    // Critical state checks
    if (
      metrics.metrics.errorRate !== undefined &&
      metrics.metrics.errorRate > thresholds.critical.errorRate
    ) {
      return HealthStateEnum.CRITICAL;
    }

    if (
      metrics.metrics.memoryUsage !== undefined &&
      metrics.metrics.memoryUsage > thresholds.critical.memoryUsage
    ) {
      return HealthStateEnum.CRITICAL;
    }

    // Unhealthy state checks
    if (hasAnomalies) {
      return HealthStateEnum.UNHEALTHY;
    }

    if (
      metrics.metrics.errorRate !== undefined &&
      metrics.metrics.errorRate > thresholds.unhealthy.errorRate
    ) {
      return HealthStateEnum.UNHEALTHY;
    }

    // Degraded state checks
    if (
      metrics.metrics.latency !== undefined &&
      metrics.metrics.latency > thresholds.degraded.latency
    ) {
      return HealthStateEnum.DEGRADED;
    }

    if (
      metrics.metrics.memoryUsage !== undefined &&
      metrics.metrics.memoryUsage > thresholds.degraded.memoryUsage
    ) {
      return HealthStateEnum.DEGRADED;
    }

    return HealthStateEnum.HEALTHY;
  }

  /**
   * Set monitoring thresholds
   */
  setThresholds(workflowId: string, thresholds: ThresholdConfig): void {
    this.thresholds.set(workflowId, thresholds);
  }

  /**
   * Get current health state
   */
  async getCurrentHealth(workflowId: string): Promise<HealthMetric> {
    return await this.collectMetrics(workflowId);
  }

  /**
   * Get metric history
   */
  getMetricHistory(workflowId: string, limit?: number): HealthMetric[] {
    const history = this.metrics.get(workflowId);
    if (!history) {
      return [];
    }

    if (limit) {
      return history.dataPoints.slice(-limit);
    }

    return history.dataPoints;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;

    // Clear all monitoring intervals
    this.monitoringIntervals.forEach((interval) => clearInterval(interval));
    this.monitoringIntervals.clear();
  }

  /**
   * Clear metrics history
   */
  clearHistory(workflowId?: string): void {
    if (workflowId) {
      this.metrics.delete(workflowId);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Set default thresholds
   */
  private setDefaultThresholds(): void {
    const defaultThresholds = this.getDefaultThresholds();
    this.thresholds.set('default', defaultThresholds);
  }

  /**
   * Get default thresholds
   */
  private getDefaultThresholds(): ThresholdConfig {
    return {
      healthy: {
        latency: 1000,
        errorRate: 0.01,
        memoryUsage: 0.6,
        cpuUsage: 0.6,
      },
      degraded: {
        latency: 3000,
        errorRate: 0.05,
        memoryUsage: 0.75,
        cpuUsage: 0.75,
      },
      unhealthy: {
        latency: 5000,
        errorRate: 0.1,
        memoryUsage: 0.85,
        cpuUsage: 0.85,
      },
      critical: {
        latency: 10000,
        errorRate: 0.5,
        memoryUsage: 0.95,
        cpuUsage: 0.95,
      },
    };
  }

  // Simulation methods for metrics
  private simulateLatency(): number {
    return 500 + Math.random() * 2000;
  }

  private simulateErrorRate(): number {
    return Math.random() * 0.1;
  }

  private simulateMemoryUsage(): number {
    return 0.3 + Math.random() * 0.4;
  }

  private simulateCpuUsage(): number {
    return 0.2 + Math.random() * 0.5;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Monitor Options
 */
interface MonitorOptions {
  interval?: number; // Monitoring interval in ms
  duration?: number; // Optional duration limit in ms
}

/**
 * Metric History
 */
interface MetricHistory {
  workflowId: string;
  dataPoints: HealthMetric[];
  startedAt: number;
}

/**
 * Threshold Configuration
 */
interface ThresholdConfig {
  healthy: MetricThresholds;
  degraded: MetricThresholds;
  unhealthy: MetricThresholds;
  critical: MetricThresholds;
}

/**
 * Metric Thresholds
 */
interface MetricThresholds {
  latency: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}
