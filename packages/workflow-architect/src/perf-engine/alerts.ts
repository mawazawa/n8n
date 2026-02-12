/**
 * Performance Alert Manager
 * Monitors performance metrics and triggers alerts
 */

import { v4 as uuidv4 } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  Alert,
  AlertThreshold,
  AlertSeverity,
  AlertThresholdSchema,
  AnomalyAlert,
  ProfileResult,
  PerformanceMetric,
} from './types';

interface AlertConfig {
  workflowId?: string;
  thresholds: AlertThreshold[];
  enableAnomalyDetection?: boolean;
  anomalySensitivity?: number; // 0-1
}

export class AlertManager {
  private thresholds: Map<string, AlertThreshold[]> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private historicalMetrics: Map<string, number[]> = new Map();

  constructor(private supabase: SupabaseClient) {}

  /**
   * Configure alert thresholds
   */
  configure(config: AlertConfig): void {
    const key = config.workflowId || 'global';

    // Validate thresholds
    const validatedThresholds = config.thresholds.map((t) =>
      AlertThresholdSchema.parse(t),
    );

    this.thresholds.set(key, validatedThresholds);
  }

  /**
   * Monitor performance and generate alerts
   */
  async *monitor(workflowId: string): AsyncGenerator<Alert> {
    const thresholds = this.thresholds.get(workflowId) || this.thresholds.get('global') || [];

    while (true) {
      // Get latest profile
      const latestProfile = await this.getLatestProfile(workflowId);

      if (latestProfile) {
        // Check threshold alerts
        for (const threshold of thresholds) {
          const alert = this.checkThreshold(latestProfile, threshold);
          if (alert) {
            yield alert;
          }
        }

        // Check for anomalies
        const anomalyAlert = await this.checkAnomaly(latestProfile);
        if (anomalyAlert) {
          yield anomalyAlert;
        }
      }

      // Wait before next check (would use real-time subscriptions in production)
      await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds
    }
  }

  /**
   * Check if metric exceeds threshold
   */
  private checkThreshold(
    profile: ProfileResult,
    threshold: AlertThreshold,
  ): Alert | null {
    const metricValue = this.extractMetricValue(threshold.metric, profile);

    if (metricValue === null) {
      return null;
    }

    // Check if threshold is exceeded
    const exceeded = this.evaluateThreshold(metricValue, threshold);

    if (!exceeded) {
      return null;
    }

    // Check cooldown
    const alertKey = `${profile.workflowId}_${threshold.metric}`;
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;
    const now = Date.now();

    if (threshold.cooldown && now - lastAlert < threshold.cooldown * 1000) {
      return null; // Still in cooldown period
    }

    // Create alert
    this.lastAlertTime.set(alertKey, now);

    return {
      id: uuidv4(),
      type: 'threshold',
      severity: threshold.severity,
      title: `Performance threshold exceeded: ${threshold.metric}`,
      message: this.formatThresholdMessage(threshold, metricValue),
      workflowId: profile.workflowId,
      executionId: profile.executionId,
      metric: threshold.metric,
      value: metricValue,
      threshold: threshold.value,
      triggeredAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluate threshold condition
   */
  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt':
        return value > threshold.value;
      case 'gte':
        return value >= threshold.value;
      case 'lt':
        return value < threshold.value;
      case 'lte':
        return value <= threshold.value;
      case 'eq':
        return value === threshold.value;
      case 'neq':
        return value !== threshold.value;
      default:
        return false;
    }
  }

  /**
   * Check for performance anomalies
   */
  private async checkAnomaly(profile: ProfileResult): Promise<AnomalyAlert | null> {
    const metric = 'execution_time';
    const currentValue = profile.duration;

    // Get historical values
    const key = `${profile.workflowId}_${metric}`;
    const historical = this.historicalMetrics.get(key) || [];

    // Need sufficient history for anomaly detection
    if (historical.length < 10) {
      historical.push(currentValue);
      this.historicalMetrics.set(key, historical);
      return null;
    }

    // Calculate statistics
    const mean = historical.reduce((sum, v) => sum + v, 0) / historical.length;
    const stdDev = Math.sqrt(
      historical.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historical.length,
    );

    // Detect anomaly (value more than 3 standard deviations from mean)
    const deviation = Math.abs(currentValue - mean) / stdDev;
    const isAnomaly = deviation > 3;

    // Update historical data
    historical.push(currentValue);
    if (historical.length > 100) {
      historical.shift(); // Keep only last 100 values
    }
    this.historicalMetrics.set(key, historical);

    if (!isAnomaly) {
      return null;
    }

    // Determine severity based on deviation
    const severity = this.determineSeverityFromDeviation(deviation);

    return {
      id: uuidv4(),
      type: 'anomaly',
      severity,
      title: `Performance anomaly detected: ${metric}`,
      message: `${metric} value ${currentValue} deviates significantly from expected ${mean.toFixed(2)} (${deviation.toFixed(1)} std dev)`,
      workflowId: profile.workflowId,
      executionId: profile.executionId,
      metric,
      value: currentValue,
      triggeredAt: new Date().toISOString(),
      expectedValue: mean,
      actualValue: currentValue,
      deviation,
      confidence: Math.min(deviation / 5, 1), // 0-1 confidence score
    };
  }

  /**
   * Determine severity from statistical deviation
   */
  private determineSeverityFromDeviation(deviation: number): AlertSeverity {
    if (deviation >= 5) return AlertSeverity.CRITICAL;
    if (deviation >= 4) return AlertSeverity.ERROR;
    if (deviation >= 3) return AlertSeverity.WARNING;
    return AlertSeverity.INFO;
  }

  /**
   * Extract metric value from profile
   */
  private extractMetricValue(metric: string, profile: ProfileResult): number | null {
    switch (metric) {
      case 'execution_time':
        return profile.duration;
      case 'cpu_usage':
        return profile.totalResourceUsage.cpu.usage;
      case 'memory_peak':
        return profile.totalResourceUsage.memory.peak;
      case 'network_latency':
        return profile.totalResourceUsage.network.latencyMs;
      default:
        return null;
    }
  }

  /**
   * Format threshold alert message
   */
  private formatThresholdMessage(threshold: AlertThreshold, value: number): string {
    const operator = {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      eq: '==',
      neq: '!=',
    }[threshold.operator];

    return `Metric '${threshold.metric}' value ${value} exceeds threshold ${operator} ${threshold.value}`;
  }

  /**
   * Get latest profile
   */
  private async getLatestProfile(workflowId: string): Promise<ProfileResult | null> {
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapRowToProfile(data);
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
   * Acknowledge alert
   */
  async acknowledge(alertId: string, userId: string): Promise<void> {
    // Would update alert in database
    console.log(`Alert ${alertId} acknowledged by ${userId}`);
  }

  /**
   * Resolve alert
   */
  async resolve(alertId: string, userId: string, resolution: string): Promise<void> {
    // Would update alert in database
    console.log(`Alert ${alertId} resolved by ${userId}: ${resolution}`);
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(workflowId?: string): Promise<Alert[]> {
    // Would query alerts from database
    // For now, return empty array
    return [];
  }
}
