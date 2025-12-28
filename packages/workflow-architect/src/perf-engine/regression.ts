/**
 * Regression Detector
 * Detects performance regressions by comparing with baseline
 */

import { v4 as uuidv4 } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  Regression,
  RegressionDetectionConfig,
  RegressionDetectionConfigSchema,
  ProfileResult,
  PerformanceMetric,
} from './types';

export class RegressionDetector {
  private config: RegressionDetectionConfig = {
    thresholdPercent: 10,
    minSampleSize: 5,
    significanceLevel: 0.05,
    enableBisection: true,
    monitoredMetrics: ['execution_time', 'cpu_usage', 'memory_peak'],
  };

  constructor(private supabase: SupabaseClient, config?: Partial<RegressionDetectionConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
      RegressionDetectionConfigSchema.parse(this.config);
    }
  }

  /**
   * Detect regressions between current and baseline
   */
  async detect(
    current: ProfileResult,
    baseline: ProfileResult,
  ): Promise<Regression[]> {
    const regressions: Regression[] = [];

    // Check each monitored metric
    for (const metricName of this.config.monitoredMetrics) {
      const regression = this.checkMetricRegression(
        metricName,
        current,
        baseline,
      );

      if (regression) {
        regressions.push(regression);
      }
    }

    // Check individual node regressions
    const nodeRegressions = await this.detectNodeRegressions(current, baseline);
    regressions.push(...nodeRegressions);

    return regressions;
  }

  /**
   * Detect regressions by comparing with historical baseline
   */
  async detectFromHistory(
    workflowId: string,
    currentExecutionId: string,
  ): Promise<Regression[]> {
    // Get current profile
    const currentProfile = await this.getProfile(workflowId, currentExecutionId);
    if (!currentProfile) {
      throw new Error('Current execution profile not found');
    }

    // Get baseline (median of recent successful executions)
    const baseline = await this.calculateBaseline(workflowId);
    if (!baseline) {
      console.log('No baseline available for regression detection');
      return [];
    }

    return this.detect(currentProfile, baseline);
  }

  /**
   * Check for regression in a specific metric
   */
  private checkMetricRegression(
    metricName: string,
    current: ProfileResult,
    baseline: ProfileResult,
  ): Regression | null {
    const currentValue = this.extractMetricValue(metricName, current);
    const baselineValue = this.extractMetricValue(metricName, baseline);

    if (currentValue === null || baselineValue === null) {
      return null;
    }

    // Calculate degradation percentage
    const degradation = ((currentValue - baselineValue) / baselineValue) * 100;

    // Check if degradation exceeds threshold
    if (degradation < this.config.thresholdPercent) {
      return null;
    }

    // Check statistical significance
    const { significant, pValue } = this.testSignificance(
      currentValue,
      baselineValue,
    );

    const severity = this.determineSeverity(degradation);
    const suspects = this.identifySuspects(metricName, current, baseline);
    const rootCause = this.identifyRootCause(metricName, current, baseline, suspects);

    return {
      id: uuidv4(),
      metric: metricName,
      baseline: {
        executionId: baseline.executionId,
        value: baselineValue,
        timestamp: new Date(baseline.startTime).toISOString(),
      },
      current: {
        executionId: current.executionId,
        value: currentValue,
        timestamp: new Date(current.startTime).toISOString(),
      },
      degradation,
      severity,
      statisticallySignificant: significant,
      pValue,
      rootCause,
      suspects,
      detectedAt: new Date().toISOString(),
    };
  }

  /**
   * Detect regressions in individual nodes
   */
  private async detectNodeRegressions(
    current: ProfileResult,
    baseline: ProfileResult,
  ): Promise<Regression[]> {
    const regressions: Regression[] = [];

    for (const currentNode of current.nodeMetrics) {
      const baselineNode = baseline.nodeMetrics.find((n) => n.nodeId === currentNode.nodeId);
      if (!baselineNode) continue;

      const degradation =
        ((currentNode.executionTime - baselineNode.executionTime) /
          baselineNode.executionTime) *
        100;

      if (degradation >= this.config.thresholdPercent) {
        const severity = this.determineSeverity(degradation);

        regressions.push({
          id: uuidv4(),
          metric: `node_${currentNode.nodeId}_execution_time`,
          baseline: {
            executionId: baseline.executionId,
            value: baselineNode.executionTime,
            timestamp: new Date(baseline.startTime).toISOString(),
          },
          current: {
            executionId: current.executionId,
            value: currentNode.executionTime,
            timestamp: new Date(current.startTime).toISOString(),
          },
          degradation,
          severity,
          statisticallySignificant: true,
          suspects: [currentNode.nodeId],
          rootCause: `Node ${currentNode.nodeName} execution time increased by ${degradation.toFixed(1)}%`,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return regressions;
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
   * Test statistical significance
   */
  private testSignificance(
    currentValue: number,
    baselineValue: number,
  ): { significant: boolean; pValue: number } {
    // Simplified significance test
    // Real implementation would use proper statistical tests
    const difference = Math.abs(currentValue - baselineValue);
    const relativeDiff = difference / baselineValue;

    // Simple heuristic: >20% difference is significant
    const significant = relativeDiff > 0.2;
    const pValue = significant ? 0.01 : 0.5;

    return { significant, pValue };
  }

  /**
   * Determine regression severity
   */
  private determineSeverity(
    degradation: number,
  ): Regression['severity'] {
    if (degradation >= 50) return 'critical';
    if (degradation >= 30) return 'major';
    if (degradation >= 15) return 'moderate';
    return 'minor';
  }

  /**
   * Identify suspect nodes
   */
  private identifySuspects(
    metric: string,
    current: ProfileResult,
    baseline: ProfileResult,
  ): string[] {
    const suspects: string[] = [];

    // Compare each node
    for (const currentNode of current.nodeMetrics) {
      const baselineNode = baseline.nodeMetrics.find((n) => n.nodeId === currentNode.nodeId);
      if (!baselineNode) continue;

      const nodeDegradation =
        ((currentNode.executionTime - baselineNode.executionTime) /
          baselineNode.executionTime) *
        100;

      // Node is a suspect if it degraded significantly
      if (nodeDegradation >= this.config.thresholdPercent) {
        suspects.push(currentNode.nodeId);
      }
    }

    return suspects;
  }

  /**
   * Identify root cause
   */
  private identifyRootCause(
    metric: string,
    current: ProfileResult,
    baseline: ProfileResult,
    suspects: string[],
  ): string {
    if (suspects.length === 0) {
      return `Overall ${metric} degraded without specific node regression. May be system-wide issue.`;
    }

    if (suspects.length === 1) {
      const nodeId = suspects[0];
      const node = current.nodeMetrics.find((n) => n.nodeId === nodeId);
      return `Primary regression in node: ${node?.nodeName || nodeId}`;
    }

    return `Multiple nodes regressed: ${suspects.length} nodes affected`;
  }

  /**
   * Calculate baseline from historical data
   */
  private async calculateBaseline(workflowId: string): Promise<ProfileResult | null> {
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: false })
      .limit(this.config.minSampleSize * 2);

    if (error || !data || data.length < this.config.minSampleSize) {
      return null;
    }

    // Use median of recent executions as baseline
    const profiles = data.map((row) => this.mapRowToProfile(row));

    // Calculate median execution time
    const durations = profiles.map((p) => p.duration).sort((a, b) => a - b);
    const medianDuration = durations[Math.floor(durations.length / 2)];

    // Find profile closest to median
    const baselineProfile = profiles.reduce((closest, profile) => {
      const closestDiff = Math.abs(closest.duration - medianDuration);
      const currentDiff = Math.abs(profile.duration - medianDuration);
      return currentDiff < closestDiff ? profile : closest;
    });

    return baselineProfile;
  }

  /**
   * Get profile by execution ID
   */
  private async getProfile(
    workflowId: string,
    executionId: string,
  ): Promise<ProfileResult | null> {
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('execution_id', executionId)
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
   * Perform bisection to find regression introduction point
   */
  async bisect(
    workflowId: string,
    goodExecutionId: string,
    badExecutionId: string,
  ): Promise<string | null> {
    if (!this.config.enableBisection) {
      return null;
    }

    // Get all executions between good and bad
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('execution_id, start_time, duration')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: true });

    if (error || !data) {
      return null;
    }

    // Find indices of good and bad
    const goodIndex = data.findIndex((e) => e.execution_id === goodExecutionId);
    const badIndex = data.findIndex((e) => e.execution_id === badExecutionId);

    if (goodIndex === -1 || badIndex === -1 || goodIndex >= badIndex) {
      return null;
    }

    // Binary search for regression point
    let left = goodIndex;
    let right = badIndex;
    let regressionPoint: string | null = null;

    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      const midExecution = data[mid];

      // Check if mid is good or bad (compare with good baseline)
      if (this.isRegression(midExecution.duration, data[goodIndex].duration)) {
        right = mid;
        regressionPoint = midExecution.execution_id;
      } else {
        left = mid;
      }
    }

    return regressionPoint;
  }

  /**
   * Check if duration represents a regression
   */
  private isRegression(current: number, baseline: number): boolean {
    const degradation = ((current - baseline) / baseline) * 100;
    return degradation >= this.config.thresholdPercent;
  }
}
