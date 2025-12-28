import type {
  Anomaly,
  AnomalyType,
  DetectionResult,
  HealthMetric,
  StatisticalMetrics,
} from './types.js';
import { AnomalySchema } from './types.js';
import { AnomalyType as AnomalyTypeEnum } from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Anomaly Detection for Workflow Health
 *
 * Implements statistical and ML-based anomaly detection for real-time
 * workflow monitoring with <30 second detection time.
 */
export class AnomalyDetector {
  private readonly historicalData: Map<string, number[]> = new Map();
  private readonly thresholds: Map<AnomalyType, number> = new Map();
  private readonly zScoreThreshold = 3; // Standard deviations
  private readonly iqrMultiplier = 1.5;

  constructor(options?: { zScoreThreshold?: number; iqrMultiplier?: number }) {
    if (options?.zScoreThreshold) {
      this.zScoreThreshold = options.zScoreThreshold;
    }
    if (options?.iqrMultiplier) {
      this.iqrMultiplier = options.iqrMultiplier;
    }

    // Initialize default thresholds
    this.thresholds.set(AnomalyTypeEnum.LATENCY, 0.7);
    this.thresholds.set(AnomalyTypeEnum.ERROR_RATE, 0.1);
    this.thresholds.set(AnomalyTypeEnum.MEMORY, 0.85);
    this.thresholds.set(AnomalyTypeEnum.TIMEOUT, 0.8);
  }

  /**
   * Detect anomalies from workflow metrics
   */
  async detect(metrics: HealthMetric): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const { workflowId, nodeId, metrics: metricValues } = metrics;

    // Check latency anomalies
    if (metricValues.latency !== undefined) {
      const latencyAnomaly = await this.detectLatencyAnomaly(
        workflowId,
        nodeId || 'workflow',
        metricValues.latency
      );
      if (latencyAnomaly.isAnomaly && latencyAnomaly.anomaly) {
        anomalies.push(latencyAnomaly.anomaly);
      }
    }

    // Check error rate anomalies
    if (metricValues.errorRate !== undefined) {
      const errorAnomaly = await this.detectErrorRateAnomaly(
        workflowId,
        nodeId || 'workflow',
        metricValues.errorRate
      );
      if (errorAnomaly.isAnomaly && errorAnomaly.anomaly) {
        anomalies.push(errorAnomaly.anomaly);
      }
    }

    // Check memory anomalies
    if (metricValues.memoryUsage !== undefined) {
      const memoryAnomaly = await this.detectMemoryAnomaly(
        workflowId,
        nodeId || 'workflow',
        metricValues.memoryUsage
      );
      if (memoryAnomaly.isAnomaly && memoryAnomaly.anomaly) {
        anomalies.push(memoryAnomaly.anomaly);
      }
    }

    // Check timeout patterns
    if (metricValues.latency !== undefined && metricValues.latency > 30000) {
      const timeoutAnomaly = this.createTimeoutAnomaly(
        workflowId,
        nodeId || 'workflow',
        metricValues.latency
      );
      anomalies.push(timeoutAnomaly);
    }

    return anomalies;
  }

  /**
   * Detect latency anomalies using statistical methods
   */
  private async detectLatencyAnomaly(
    workflowId: string,
    nodeId: string,
    latency: number
  ): Promise<DetectionResult> {
    const key = `${workflowId}:${nodeId}:latency`;
    const historical = this.getHistoricalData(key);

    if (historical.length < 10) {
      // Not enough data for statistical analysis, use threshold
      return this.thresholdDetection(
        workflowId,
        nodeId,
        AnomalyTypeEnum.LATENCY,
        latency,
        5000 // 5 seconds baseline
      );
    }

    // Try Z-score detection first
    const zScoreResult = this.zScoreDetection(
      workflowId,
      nodeId,
      AnomalyTypeEnum.LATENCY,
      latency,
      historical
    );

    if (zScoreResult.isAnomaly) {
      return zScoreResult;
    }

    // Try IQR detection
    return this.iqrDetection(workflowId, nodeId, AnomalyTypeEnum.LATENCY, latency, historical);
  }

  /**
   * Detect error rate anomalies
   */
  private async detectErrorRateAnomaly(
    workflowId: string,
    nodeId: string,
    errorRate: number
  ): Promise<DetectionResult> {
    const threshold = this.thresholds.get(AnomalyTypeEnum.ERROR_RATE) || 0.1;

    if (errorRate > threshold) {
      const anomaly: Anomaly = {
        id: uuidv4(),
        type: AnomalyTypeEnum.ERROR_RATE,
        workflowId,
        nodeId,
        severity: Math.min(errorRate / threshold, 1),
        detectedAt: Date.now(),
        value: errorRate,
        baseline: threshold,
        deviation: errorRate - threshold,
        metadata: {
          thresholdExceeded: true,
        },
      };

      return {
        isAnomaly: true,
        anomaly,
        confidence: 0.9,
        method: 'threshold',
        explanation: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`,
      };
    }

    return {
      isAnomaly: false,
      confidence: 1,
      method: 'threshold',
      explanation: 'Error rate within normal range',
    };
  }

  /**
   * Detect memory usage anomalies
   */
  private async detectMemoryAnomaly(
    workflowId: string,
    nodeId: string,
    memoryUsage: number
  ): Promise<DetectionResult> {
    const threshold = this.thresholds.get(AnomalyTypeEnum.MEMORY) || 0.85;

    if (memoryUsage > threshold) {
      const anomaly: Anomaly = {
        id: uuidv4(),
        type: AnomalyTypeEnum.MEMORY,
        workflowId,
        nodeId,
        severity: Math.min(memoryUsage / threshold, 1),
        detectedAt: Date.now(),
        value: memoryUsage,
        baseline: threshold,
        deviation: memoryUsage - threshold,
        metadata: {
          memoryPressure: true,
        },
      };

      return {
        isAnomaly: true,
        anomaly,
        confidence: 0.95,
        method: 'threshold',
        explanation: `Memory usage ${(memoryUsage * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`,
      };
    }

    return {
      isAnomaly: false,
      confidence: 1,
      method: 'threshold',
      explanation: 'Memory usage within normal range',
    };
  }

  /**
   * Z-score based anomaly detection
   */
  private zScoreDetection(
    workflowId: string,
    nodeId: string,
    type: AnomalyType,
    value: number,
    historical: number[]
  ): DetectionResult {
    const stats = this.calculateStatistics(historical);
    const zScore = Math.abs((value - stats.mean) / stats.stdDev);

    if (zScore > this.zScoreThreshold) {
      const anomaly: Anomaly = {
        id: uuidv4(),
        type,
        workflowId,
        nodeId,
        severity: Math.min(zScore / this.zScoreThreshold, 1) * 0.8,
        detectedAt: Date.now(),
        value,
        baseline: stats.mean,
        deviation: value - stats.mean,
        metadata: {
          zScore,
          method: 'zscore',
          stdDev: stats.stdDev,
        },
      };

      // Validate against schema
      const validated = AnomalySchema.parse(anomaly);

      return {
        isAnomaly: true,
        anomaly: validated,
        confidence: Math.min(zScore / this.zScoreThreshold / 2, 0.95),
        method: 'zscore',
        explanation: `Value deviates ${zScore.toFixed(2)} standard deviations from mean`,
      };
    }

    return {
      isAnomaly: false,
      confidence: 1 - zScore / this.zScoreThreshold,
      method: 'zscore',
      explanation: 'Value within normal statistical range',
    };
  }

  /**
   * Interquartile Range (IQR) based anomaly detection
   */
  private iqrDetection(
    workflowId: string,
    nodeId: string,
    type: AnomalyType,
    value: number,
    historical: number[]
  ): DetectionResult {
    const sorted = [...historical].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 0.25);
    const q3 = this.percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - this.iqrMultiplier * iqr;
    const upperBound = q3 + this.iqrMultiplier * iqr;

    if (value < lowerBound || value > upperBound) {
      const median = this.percentile(sorted, 0.5);
      const anomaly: Anomaly = {
        id: uuidv4(),
        type,
        workflowId,
        nodeId,
        severity: Math.min(Math.abs(value - median) / (iqr || 1), 1) * 0.7,
        detectedAt: Date.now(),
        value,
        baseline: median,
        deviation: value - median,
        metadata: {
          method: 'iqr',
          q1,
          q3,
          iqr,
          lowerBound,
          upperBound,
        },
      };

      return {
        isAnomaly: true,
        anomaly,
        confidence: 0.85,
        method: 'iqr',
        explanation: `Value ${value.toFixed(2)} outside IQR bounds [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
      };
    }

    return {
      isAnomaly: false,
      confidence: 0.9,
      method: 'iqr',
      explanation: 'Value within IQR bounds',
    };
  }

  /**
   * Threshold-based detection for simple cases
   */
  private thresholdDetection(
    workflowId: string,
    nodeId: string,
    type: AnomalyType,
    value: number,
    baseline: number
  ): DetectionResult {
    const threshold = this.thresholds.get(type) || 0.5;
    const normalizedValue = value / baseline;

    if (normalizedValue > 1 + threshold) {
      const anomaly: Anomaly = {
        id: uuidv4(),
        type,
        workflowId,
        nodeId,
        severity: Math.min((normalizedValue - 1) / threshold, 1),
        detectedAt: Date.now(),
        value,
        baseline,
        deviation: value - baseline,
        metadata: {
          method: 'threshold',
          threshold,
        },
      };

      return {
        isAnomaly: true,
        anomaly,
        confidence: 0.75,
        method: 'threshold',
        explanation: `Value exceeds baseline by ${((normalizedValue - 1) * 100).toFixed(1)}%`,
      };
    }

    return {
      isAnomaly: false,
      confidence: 0.8,
      method: 'threshold',
      explanation: 'Value within threshold range',
    };
  }

  /**
   * Create timeout anomaly
   */
  private createTimeoutAnomaly(workflowId: string, nodeId: string, latency: number): Anomaly {
    return AnomalySchema.parse({
      id: uuidv4(),
      type: AnomalyTypeEnum.TIMEOUT,
      workflowId,
      nodeId,
      severity: Math.min(latency / 60000, 1), // Normalize to 60s
      detectedAt: Date.now(),
      value: latency,
      baseline: 30000,
      deviation: latency - 30000,
      metadata: {
        timeoutDetected: true,
      },
    });
  }

  /**
   * Calculate statistical metrics
   */
  private calculateStatistics(data: number[]): StatisticalMetrics {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = sorted.reduce((sum, val) => sum + val, 0) / n;
    const median = this.percentile(sorted, 0.5);
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median,
      stdDev,
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      min: sorted[0],
      max: sorted[n - 1],
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Get historical data for a metric
   */
  private getHistoricalData(key: string): number[] {
    return this.historicalData.get(key) || [];
  }

  /**
   * Add data point to historical data
   */
  addDataPoint(workflowId: string, nodeId: string, metric: string, value: number): void {
    const key = `${workflowId}:${nodeId}:${metric}`;
    const data = this.getHistoricalData(key);
    data.push(value);

    // Keep last 1000 data points
    if (data.length > 1000) {
      data.shift();
    }

    this.historicalData.set(key, data);
  }

  /**
   * Set custom threshold for anomaly type
   */
  setThreshold(type: AnomalyType, threshold: number): void {
    this.thresholds.set(type, threshold);
  }

  /**
   * Clear historical data
   */
  clearHistory(workflowId?: string): void {
    if (workflowId) {
      const keysToDelete = Array.from(this.historicalData.keys()).filter((key) =>
        key.startsWith(`${workflowId}:`)
      );
      keysToDelete.forEach((key) => this.historicalData.delete(key));
    } else {
      this.historicalData.clear();
    }
  }
}
