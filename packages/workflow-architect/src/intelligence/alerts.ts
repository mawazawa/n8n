/**
 * Alert Engine
 * Configures and manages proactive alerts for workflow intelligence
 */

import type { Alert, AlertRule } from './types.js';
import { AlertRuleSchema } from './types.js';
import { v4 as uuidv4 } from 'uuid';

interface MetricValue {
  workflowId?: string;
  metric: string;
  value: number;
  timestamp: number;
}

export class AlertEngine {
  private rules: Map<string, AlertRule>;
  private alerts: Map<string, Alert>;
  private metricHistory: Map<string, MetricValue[]>;

  constructor() {
    this.rules = new Map();
    this.alerts = new Map();
    this.metricHistory = new Map();
  }

  /**
   * Configure an alert rule
   */
  async configureAlert(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const alertRule: AlertRule = {
      id: uuidv4(),
      ...rule,
    };

    // Validate
    const validated = AlertRuleSchema.parse(alertRule);

    // Store
    this.rules.set(validated.id, validated);

    return validated;
  }

  /**
   * Update an alert rule
   */
  async updateAlert(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      throw new Error(`Alert rule ${ruleId} not found`);
    }

    const updated = {
      ...existing,
      ...updates,
      id: ruleId, // Prevent ID changes
    };

    const validated = AlertRuleSchema.parse(updated);
    this.rules.set(ruleId, validated);

    return validated;
  }

  /**
   * Delete an alert rule
   */
  async deleteAlert(ruleId: string): Promise<void> {
    this.rules.delete(ruleId);
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get alert rule by ID
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Monitor metrics and generate alerts
   */
  async *monitor(): AsyncGenerator<Alert> {
    while (true) {
      // Check all enabled rules
      for (const rule of this.rules.values()) {
        if (!rule.enabled) continue;

        // Check if in cooldown period
        if (rule.lastTriggered && Date.now() - rule.lastTriggered < rule.cooldown) {
          continue;
        }

        // Evaluate rule
        const alert = await this.evaluateRule(rule);
        if (alert) {
          // Update last triggered time
          rule.lastTriggered = Date.now();
          this.rules.set(rule.id, rule);

          // Store alert
          this.alerts.set(alert.id, alert);

          // Execute actions
          await this.executeActions(rule, alert);

          yield alert;
        }
      }

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Record metric value for monitoring
   */
  recordMetric(metric: MetricValue): void {
    const key = metric.workflowId ? `${metric.workflowId}:${metric.metric}` : metric.metric;

    if (!this.metricHistory.has(key)) {
      this.metricHistory.set(key, []);
    }

    const history = this.metricHistory.get(key)!;
    history.push(metric);

    // Keep only last 1000 values
    if (history.length > 1000) {
      history.shift();
    }
  }

  /**
   * Get alerts
   */
  getAlerts(workflowId?: string): Alert[] {
    const allAlerts = Array.from(this.alerts.values());

    if (!workflowId) {
      return allAlerts;
    }

    return allAlerts.filter((a) => a.workflowId === workflowId);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      alert.acknowledgedBy = acknowledgedBy;
      this.alerts.set(alertId, alert);
    }
  }

  /**
   * Evaluate an alert rule
   */
  private async evaluateRule(rule: AlertRule): Promise<Alert | undefined> {
    const now = Date.now();

    switch (rule.condition.type) {
      case 'threshold':
        return this.evaluateThreshold(rule, now);

      case 'anomaly':
        return this.evaluateAnomaly(rule, now);

      case 'pattern':
        return this.evaluatePattern(rule, now);

      case 'prediction':
        return this.evaluatePrediction(rule, now);

      default:
        return undefined;
    }
  }

  /**
   * Evaluate threshold-based rule
   */
  private evaluateThreshold(rule: AlertRule, now: number): Alert | undefined {
    const key = rule.workflowId
      ? `${rule.workflowId}:${rule.condition.metric}`
      : rule.condition.metric;

    const history = this.metricHistory.get(key);
    if (!history || history.length === 0) return undefined;

    const windowMs = rule.condition.window || 60000; // Default 1 minute
    const windowData = history.filter((m) => now - m.timestamp < windowMs);

    if (windowData.length === 0) return undefined;

    // Get latest value
    const latestValue = windowData[windowData.length - 1].value;
    const threshold = rule.condition.value!;
    const operator = rule.condition.operator!;

    let triggered = false;

    switch (operator) {
      case '>':
        triggered = latestValue > threshold;
        break;
      case '<':
        triggered = latestValue < threshold;
        break;
      case '>=':
        triggered = latestValue >= threshold;
        break;
      case '<=':
        triggered = latestValue <= threshold;
        break;
      case '==':
        triggered = latestValue === threshold;
        break;
      case '!=':
        triggered = latestValue !== threshold;
        break;
    }

    if (triggered) {
      return {
        id: uuidv4(),
        ruleId: rule.id,
        workflowId: rule.workflowId,
        severity: 'warning',
        title: rule.name,
        message: `${rule.condition.metric} ${operator} ${threshold} (current: ${latestValue})`,
        data: {
          metric: rule.condition.metric,
          value: latestValue,
          threshold,
          operator,
        },
        triggeredAt: now,
        acknowledged: false,
      };
    }

    return undefined;
  }

  /**
   * Evaluate anomaly-based rule
   */
  private evaluateAnomaly(rule: AlertRule, now: number): Alert | undefined {
    const key = rule.workflowId
      ? `${rule.workflowId}:${rule.condition.metric}`
      : rule.condition.metric;

    const history = this.metricHistory.get(key);
    if (!history || history.length < 10) return undefined; // Need at least 10 data points

    const windowMs = rule.condition.window || 3600000; // Default 1 hour
    const windowData = history.filter((m) => now - m.timestamp < windowMs);

    if (windowData.length < 5) return undefined;

    // Calculate statistics
    const values = windowData.map((m) => m.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Check if latest value is anomalous (> 3 standard deviations from mean)
    const latestValue = values[values.length - 1];
    const deviation = Math.abs(latestValue - mean);

    if (deviation > 3 * stdDev) {
      return {
        id: uuidv4(),
        ruleId: rule.id,
        workflowId: rule.workflowId,
        severity: 'warning',
        title: rule.name,
        message: `Anomaly detected in ${rule.condition.metric}: ${latestValue.toFixed(2)} (expected: ${mean.toFixed(2)} ± ${stdDev.toFixed(2)})`,
        data: {
          metric: rule.condition.metric,
          value: latestValue,
          mean,
          stdDev,
          deviation,
        },
        triggeredAt: now,
        acknowledged: false,
      };
    }

    return undefined;
  }

  /**
   * Evaluate pattern-based rule
   */
  private evaluatePattern(rule: AlertRule, now: number): Alert | undefined {
    const key = rule.workflowId
      ? `${rule.workflowId}:${rule.condition.metric}`
      : rule.condition.metric;

    const history = this.metricHistory.get(key);
    if (!history || history.length < 5) return undefined;

    const windowMs = rule.condition.window || 3600000; // Default 1 hour
    const windowData = history.filter((m) => now - m.timestamp < windowMs);

    if (windowData.length < 5) return undefined;

    // Check for consistent increase (possible degradation)
    const values = windowData.map((m) => m.value);
    let increasingCount = 0;

    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) {
        increasingCount++;
      }
    }

    // If 80%+ of values are increasing, trigger alert
    if (increasingCount / (values.length - 1) > 0.8) {
      return {
        id: uuidv4(),
        ruleId: rule.id,
        workflowId: rule.workflowId,
        severity: 'warning',
        title: rule.name,
        message: `Consistent increase detected in ${rule.condition.metric}`,
        data: {
          metric: rule.condition.metric,
          pattern: 'increasing',
          confidence: (increasingCount / (values.length - 1)) * 100,
        },
        triggeredAt: now,
        acknowledged: false,
      };
    }

    return undefined;
  }

  /**
   * Evaluate prediction-based rule
   */
  private evaluatePrediction(rule: AlertRule, now: number): Alert | undefined {
    // Simplified prediction evaluation
    // In production, this would use the FailurePredictor
    const key = rule.workflowId
      ? `${rule.workflowId}:${rule.condition.metric}`
      : rule.condition.metric;

    const history = this.metricHistory.get(key);
    if (!history || history.length < 10) return undefined;

    // For now, just check if metric is trending badly
    const recent = history.slice(-5);
    const older = history.slice(-10, -5);

    const recentAvg = recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.value, 0) / older.length;

    // If recent values are significantly worse, predict issues
    if (recentAvg > olderAvg * 1.5) {
      return {
        id: uuidv4(),
        ruleId: rule.id,
        workflowId: rule.workflowId,
        severity: 'warning',
        title: rule.name,
        message: `Predicted degradation in ${rule.condition.metric}`,
        data: {
          metric: rule.condition.metric,
          prediction: 'degradation',
          confidence: 70,
        },
        triggeredAt: now,
        acknowledged: false,
      };
    }

    return undefined;
  }

  /**
   * Execute alert actions
   */
  private async executeActions(rule: AlertRule, alert: Alert): Promise<void> {
    for (const action of rule.actions) {
      switch (action.type) {
        case 'notify':
          await this.sendNotification(alert, action.config);
          break;

        case 'webhook':
          await this.callWebhook(alert, action.config);
          break;

        case 'pause_workflow':
          await this.pauseWorkflow(alert.workflowId!, action.config);
          break;

        case 'execute_workflow':
          await this.executeWorkflow(action.config);
          break;
      }
    }
  }

  private async sendNotification(alert: Alert, config: Record<string, unknown>): Promise<void> {
    // Mock implementation - in production would integrate with notification system
    console.log(`[NOTIFICATION] ${alert.severity.toUpperCase()}: ${alert.message}`);
  }

  private async callWebhook(alert: Alert, config: Record<string, unknown>): Promise<void> {
    // Mock implementation - in production would call actual webhook
    console.log(`[WEBHOOK] Calling ${config.url} with alert data`);
  }

  private async pauseWorkflow(workflowId: string, config: Record<string, unknown>): Promise<void> {
    // Mock implementation - in production would pause actual workflow
    console.log(`[ACTION] Pausing workflow ${workflowId}`);
  }

  private async executeWorkflow(config: Record<string, unknown>): Promise<void> {
    // Mock implementation - in production would execute actual workflow
    console.log(`[ACTION] Executing workflow ${config.workflowId}`);
  }
}
