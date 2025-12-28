/**
 * GuardrailManager - Safety guardrails for experiments
 * Monitors metrics and auto-stops on degradation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { GuardrailRule, GuardrailAlert, AlertSeverity } from './types.js';
import { GuardrailRuleSchema } from './types.js';
import { MetricCollector } from './metrics.js';
import { ExperimentManager } from './manager.js';

export class GuardrailManager {
  private supabase: SupabaseClient;
  private metricCollector: MetricCollector;
  private experimentManager: ExperimentManager;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.metricCollector = new MetricCollector(supabase, 0);
    this.experimentManager = new ExperimentManager(supabase);
    this.monitoringIntervals = new Map();
  }

  /**
   * Configure guardrail rules for an experiment
   */
  async configure(experimentId: string, rules: GuardrailRule[]): Promise<void> {
    // Validate rules
    rules.forEach((rule) => GuardrailRuleSchema.parse(rule));

    // Store rules in database
    const ruleRecords = rules.map((rule) => ({
      experiment_id: experimentId,
      metric_name: rule.metricName,
      operator: rule.operator,
      threshold: rule.threshold,
      action: rule.action,
      severity: rule.severity,
    }));

    // Delete existing rules
    await this.supabase.from('guardrail_rules').delete().eq('experiment_id', experimentId);

    // Insert new rules
    const { error } = await this.supabase.from('guardrail_rules').insert(ruleRecords);

    if (error) {
      throw new Error(`Failed to configure guardrails: ${error.message}`);
    }
  }

  /**
   * Start monitoring an experiment
   */
  async startMonitoring(experimentId: string, checkIntervalMs = 60000): Promise<void> {
    // Stop existing monitoring if any
    this.stopMonitoring(experimentId);

    // Start periodic checks
    const interval = setInterval(async () => {
      try {
        await this.checkExperiment(experimentId);
      } catch (error) {
        console.error(`Guardrail monitoring error for ${experimentId}:`, error);
      }
    }, checkIntervalMs);

    this.monitoringIntervals.set(experimentId, interval);
  }

  /**
   * Stop monitoring an experiment
   */
  stopMonitoring(experimentId: string): void {
    const interval = this.monitoringIntervals.get(experimentId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(experimentId);
    }
  }

  /**
   * Monitor an experiment and yield alerts
   */
  async *monitor(experimentId: string): AsyncGenerator<GuardrailAlert> {
    const rules = await this.getGuardrailRules(experimentId);

    // Get experiment variants
    const experiment = await this.experimentManager.getExperiment(experimentId);

    for (const variant of experiment.variants) {
      for (const rule of rules) {
        const alert = await this.evaluateRule(experimentId, variant.id, rule);
        if (alert) {
          yield alert;
        }
      }
    }
  }

  /**
   * Get active alerts for an experiment
   */
  async getActiveAlerts(experimentId: string): Promise<GuardrailAlert[]> {
    const { data, error } = await this.supabase
      .from('guardrail_alerts')
      .select('*')
      .eq('experiment_id', experimentId)
      .eq('acknowledged', false)
      .order('triggered_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch alerts: ${error.message}`);
    }

    return (data || []).map((a) => this.mapToAlert(a));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const { error } = await this.supabase
      .from('guardrail_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: acknowledgedBy,
      })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }
  }

  /**
   * Check experiment against all guardrails
   */
  private async checkExperiment(experimentId: string): Promise<void> {
    const rules = await this.getGuardrailRules(experimentId);
    const experiment = await this.experimentManager.getExperiment(experimentId);

    // Only monitor running experiments
    if (experiment.status !== 'RUNNING') {
      return;
    }

    const alerts: GuardrailAlert[] = [];

    for (const variant of experiment.variants) {
      for (const rule of rules) {
        const alert = await this.evaluateRule(experimentId, variant.id, rule);
        if (alert) {
          alerts.push(alert);
        }
      }
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(experimentId, alert);
    }
  }

  /**
   * Evaluate a guardrail rule
   */
  private async evaluateRule(
    experimentId: string,
    variantId: string,
    rule: GuardrailRule,
  ): Promise<GuardrailAlert | null> {
    // Get metric data
    const aggregated = await this.metricCollector.getAggregatedMetrics(
      experimentId,
      variantId,
    );

    const metricData = aggregated.find((m) => m.metricName === rule.metricName);
    if (!metricData) {
      return null; // Metric not yet collected
    }

    const currentValue = metricData.mean;

    // Evaluate rule
    let violated = false;
    switch (rule.operator) {
      case 'lt':
        violated = currentValue < rule.threshold;
        break;
      case 'lte':
        violated = currentValue <= rule.threshold;
        break;
      case 'gt':
        violated = currentValue > rule.threshold;
        break;
      case 'gte':
        violated = currentValue >= rule.threshold;
        break;
      case 'eq':
        violated = Math.abs(currentValue - rule.threshold) < 0.0001;
        break;
      case 'neq':
        violated = Math.abs(currentValue - rule.threshold) >= 0.0001;
        break;
    }

    if (!violated) {
      return null;
    }

    // Create alert
    const message = `Guardrail violated: ${rule.metricName} ${rule.operator} ${rule.threshold} (current: ${currentValue.toFixed(2)})`;

    return {
      id: uuidv4(),
      experimentId,
      rule,
      triggeredAt: new Date().toISOString(),
      currentValue,
      message,
      severity: rule.severity,
      acknowledged: false,
    };
  }

  /**
   * Process an alert (store and take action)
   */
  private async processAlert(experimentId: string, alert: GuardrailAlert): Promise<void> {
    // Store alert
    await this.storeAlert(alert);

    // Take action based on rule
    switch (alert.rule.action) {
      case 'alert':
        // Just store the alert, no action needed
        console.warn(`Guardrail alert for ${experimentId}:`, alert.message);
        break;

      case 'pause':
        console.warn(`Pausing experiment ${experimentId} due to guardrail:`, alert.message);
        await this.experimentManager.pause(experimentId);
        this.stopMonitoring(experimentId);
        break;

      case 'stop':
        console.error(`Stopping experiment ${experimentId} due to guardrail:`, alert.message);
        await this.experimentManager.stop(experimentId);
        this.stopMonitoring(experimentId);
        break;
    }
  }

  /**
   * Store an alert
   */
  private async storeAlert(alert: GuardrailAlert): Promise<void> {
    const { error } = await this.supabase.from('guardrail_alerts').insert({
      id: alert.id,
      experiment_id: alert.experimentId,
      rule: alert.rule,
      triggered_at: alert.triggeredAt,
      current_value: alert.currentValue,
      message: alert.message,
      severity: alert.severity,
      acknowledged: alert.acknowledged,
    });

    if (error) {
      console.error('Failed to store guardrail alert:', error);
    }
  }

  /**
   * Get guardrail rules for an experiment
   */
  private async getGuardrailRules(experimentId: string): Promise<GuardrailRule[]> {
    const { data, error } = await this.supabase
      .from('guardrail_rules')
      .select('*')
      .eq('experiment_id', experimentId);

    if (error) {
      throw new Error(`Failed to fetch guardrail rules: ${error.message}`);
    }

    return (data || []).map((r) => ({
      metricName: r.metric_name as string,
      operator: r.operator as GuardrailRule['operator'],
      threshold: r.threshold as number,
      action: r.action as GuardrailRule['action'],
      severity: r.severity as AlertSeverity,
    }));
  }

  /**
   * Map database record to GuardrailAlert
   */
  private mapToAlert(data: Record<string, unknown>): GuardrailAlert {
    return {
      id: data.id as string,
      experimentId: data.experiment_id as string,
      rule: data.rule as GuardrailRule,
      triggeredAt: data.triggered_at as string,
      currentValue: data.current_value as number,
      message: data.message as string,
      severity: data.severity as AlertSeverity,
      acknowledged: data.acknowledged as boolean,
      acknowledgedAt: data.acknowledged_at as string | undefined,
      acknowledgedBy: data.acknowledged_by as string | undefined,
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup(): void {
    this.monitoringIntervals.forEach((interval) => clearInterval(interval));
    this.monitoringIntervals.clear();
    this.metricCollector.stopAggregation();
  }
}
