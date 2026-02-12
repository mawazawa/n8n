/**
 * Violation Alerting
 * Real-time monitoring and alerting for policy violations with escalation paths
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  ViolationAlert,
  AlertRule,
  AlertCondition,
  EscalationStep,
  RuleSeverity,
} from './types';

export class ViolationAlerter {
  private monitoringActive = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly checkIntervalMs: number = 60000, // 1 minute default
  ) {}

  /**
   * Configure alert rules
   */
  async configure(rules: AlertRule[]): Promise<void> {
    // Store rules in database
    for (const rule of rules) {
      const { error } = await this.supabase
        .from('governance_alert_rules')
        .upsert({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          conditions: rule.conditions,
          severity: rule.severity,
          escalation_path: rule.escalationPath,
          cooldown: rule.cooldown,
          enabled: rule.enabled,
          last_triggered: rule.lastTriggered,
        });

      if (error) {
        console.error(`Failed to configure rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Start monitoring for violations
   */
  async *monitor(): AsyncGenerator<ViolationAlert> {
    this.monitoringActive = true;

    while (this.monitoringActive) {
      // Get all enabled alert rules
      const rules = await this.getEnabledRules();

      for (const rule of rules) {
        // Check if rule is in cooldown
        if (this.isInCooldown(rule)) {
          continue;
        }

        // Evaluate rule conditions
        const violations = await this.evaluateRule(rule);

        if (violations.length > 0) {
          // Trigger alert
          const alert = await this.createAlert(rule, violations);
          yield alert;

          // Update last triggered time
          await this.updateLastTriggered(rule.id);

          // Process escalation
          await this.processEscalation(alert, rule.escalationPath);
        }
      }

      // Wait for next check interval
      await this.sleep(this.checkIntervalMs);
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.monitoringActive = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Send an immediate alert
   */
  async sendAlert(
    violationId: string,
    severity: RuleSeverity,
    title: string,
    message: string,
    recipients: string[],
    channels: ViolationAlert['channels'],
  ): Promise<ViolationAlert> {
    const alert: ViolationAlert = {
      id: uuidv4(),
      violationId,
      severity,
      title,
      message,
      triggeredAt: new Date().toISOString(),
      escalationLevel: 0,
      recipients,
      channels,
    };

    // Store alert
    await this.storeAlert(alert);

    // Send through configured channels
    await this.sendThroughChannels(alert);

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledge(alertId: string, acknowledgedBy: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violation_alerts')
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: acknowledgedBy,
      })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }
  }

  /**
   * Resolve an alert
   */
  async resolve(alertId: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violation_alerts')
      .update({
        resolved_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to resolve alert: ${error.message}`);
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<ViolationAlert[]> {
    const { data, error } = await this.supabase
      .from('governance_violation_alerts')
      .select('*')
      .is('resolved_at', null)
      .order('triggered_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get alerts: ${error.message}`);
    }

    return (data || []).map(this.mapRowToAlert);
  }

  /**
   * Get enabled alert rules
   */
  private async getEnabledRules(): Promise<AlertRule[]> {
    const { data, error } = await this.supabase
      .from('governance_alert_rules')
      .select('*')
      .eq('enabled', true);

    if (error) {
      console.error('Failed to get alert rules:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      conditions: row.conditions,
      severity: row.severity,
      escalationPath: row.escalation_path,
      cooldown: row.cooldown,
      enabled: row.enabled,
      lastTriggered: row.last_triggered,
    }));
  }

  /**
   * Check if rule is in cooldown period
   */
  private isInCooldown(rule: AlertRule): boolean {
    if (!rule.lastTriggered) {
      return false;
    }

    const lastTriggered = new Date(rule.lastTriggered);
    const cooldownEnd = new Date(lastTriggered.getTime() + rule.cooldown * 60 * 1000);

    return new Date() < cooldownEnd;
  }

  /**
   * Evaluate alert rule conditions
   */
  private async evaluateRule(rule: AlertRule): Promise<string[]> {
    const violationIds: string[] = [];

    for (const condition of rule.conditions) {
      const matches = await this.evaluateCondition(condition);
      violationIds.push(...matches);
    }

    return [...new Set(violationIds)]; // Remove duplicates
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(condition: AlertCondition): Promise<string[]> {
    switch (condition.type) {
      case 'violation_count':
        return this.evaluateViolationCount(condition.config);

      case 'severity_threshold':
        return this.evaluateSeverityThreshold(condition.config);

      case 'pattern_match':
        return this.evaluatePatternMatch(condition.config);

      case 'time_window':
        return this.evaluateTimeWindow(condition.config);

      default:
        return [];
    }
  }

  /**
   * Evaluate violation count condition
   */
  private async evaluateViolationCount(config: Record<string, unknown>): Promise<string[]> {
    const threshold = config.threshold as number;
    const timeWindowMinutes = config.timeWindowMinutes as number;

    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    const { data } = await this.supabase
      .from('governance_violations')
      .select('id, resource_id')
      .eq('status', 'open')
      .gte('timestamp', since);

    if (!data) {
      return [];
    }

    // Group by resource
    const byResource = new Map<string, number>();
    for (const row of data) {
      const count = byResource.get(row.resource_id) || 0;
      byResource.set(row.resource_id, count + 1);
    }

    // Find resources exceeding threshold
    const violationIds: string[] = [];
    for (const [resourceId, count] of byResource.entries()) {
      if (count >= threshold) {
        const resourceViolations = data.filter((r) => r.resource_id === resourceId);
        violationIds.push(...resourceViolations.map((v) => v.id));
      }
    }

    return violationIds;
  }

  /**
   * Evaluate severity threshold condition
   */
  private async evaluateSeverityThreshold(config: Record<string, unknown>): Promise<string[]> {
    const severities = config.severities as RuleSeverity[];

    const { data } = await this.supabase
      .from('governance_violations')
      .select('id')
      .eq('status', 'open')
      .in('severity', severities);

    return (data || []).map((row) => row.id);
  }

  /**
   * Evaluate pattern match condition
   */
  private async evaluatePatternMatch(config: Record<string, unknown>): Promise<string[]> {
    const pattern = config.pattern as string;

    const { data } = await this.supabase
      .from('governance_violations')
      .select('id, description')
      .eq('status', 'open');

    if (!data) {
      return [];
    }

    const regex = new RegExp(pattern, 'i');
    return data.filter((row) => regex.test(row.description)).map((row) => row.id);
  }

  /**
   * Evaluate time window condition
   */
  private async evaluateTimeWindow(config: Record<string, unknown>): Promise<string[]> {
    const minutes = config.minutes as number;
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const { data } = await this.supabase
      .from('governance_violations')
      .select('id')
      .eq('status', 'open')
      .gte('timestamp', since);

    return (data || []).map((row) => row.id);
  }

  /**
   * Create an alert
   */
  private async createAlert(rule: AlertRule, violationIds: string[]): Promise<ViolationAlert> {
    const alert: ViolationAlert = {
      id: uuidv4(),
      violationId: violationIds[0], // Primary violation
      severity: rule.severity,
      title: rule.name,
      message: `${rule.description} - ${violationIds.length} violation(s) detected`,
      triggeredAt: new Date().toISOString(),
      escalationLevel: 0,
      recipients: rule.escalationPath[0]?.recipients || [],
      channels: rule.escalationPath[0]?.channels || ['email'],
      metadata: {
        ruleId: rule.id,
        violationIds,
      },
    };

    await this.storeAlert(alert);
    await this.sendThroughChannels(alert);

    return alert;
  }

  /**
   * Process escalation path
   */
  private async processEscalation(alert: ViolationAlert, escalationPath: EscalationStep[]): Promise<void> {
    // Skip first level (already sent)
    for (let i = 1; i < escalationPath.length; i++) {
      const step = escalationPath[i];

      // Wait for delay
      await this.sleep(step.delayMinutes * 60 * 1000);

      // Check if alert was acknowledged or resolved
      const { data } = await this.supabase
        .from('governance_violation_alerts')
        .select('acknowledged_at, resolved_at')
        .eq('id', alert.id)
        .single();

      if (data?.acknowledged_at || data?.resolved_at) {
        // Alert handled, stop escalation
        break;
      }

      // Send escalated alert
      const escalatedAlert: ViolationAlert = {
        ...alert,
        escalationLevel: i,
        recipients: step.recipients,
        channels: step.channels,
      };

      await this.sendThroughChannels(escalatedAlert);
    }
  }

  /**
   * Store alert in database
   */
  private async storeAlert(alert: ViolationAlert): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violation_alerts')
      .insert({
        id: alert.id,
        violation_id: alert.violationId,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        triggered_at: alert.triggeredAt,
        escalation_level: alert.escalationLevel,
        recipients: alert.recipients,
        channels: alert.channels,
        metadata: alert.metadata,
      });

    if (error) {
      console.error('Failed to store alert:', error);
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendThroughChannels(alert: ViolationAlert): Promise<void> {
    for (const channel of alert.channels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmail(alert);
            break;
          case 'slack':
            await this.sendSlack(alert);
            break;
          case 'webhook':
            await this.sendWebhook(alert);
            break;
          case 'sms':
            await this.sendSMS(alert);
            break;
        }
      } catch (error) {
        console.error(`Failed to send alert via ${channel}:`, error);
      }
    }
  }

  /**
   * Send email alert
   */
  private async sendEmail(alert: ViolationAlert): Promise<void> {
    // Placeholder - integrate with email service
    console.log(`Email alert sent to ${alert.recipients.join(', ')}: ${alert.title}`);
  }

  /**
   * Send Slack alert
   */
  private async sendSlack(alert: ViolationAlert): Promise<void> {
    // Placeholder - integrate with Slack API
    console.log(`Slack alert sent: ${alert.title}`);
  }

  /**
   * Send webhook alert
   */
  private async sendWebhook(alert: ViolationAlert): Promise<void> {
    // Placeholder - send to webhook URL
    console.log(`Webhook alert sent: ${alert.title}`);
  }

  /**
   * Send SMS alert
   */
  private async sendSMS(alert: ViolationAlert): Promise<void> {
    // Placeholder - integrate with SMS service
    console.log(`SMS alert sent to ${alert.recipients.join(', ')}: ${alert.title}`);
  }

  /**
   * Update last triggered time
   */
  private async updateLastTriggered(ruleId: string): Promise<void> {
    await this.supabase
      .from('governance_alert_rules')
      .update({ last_triggered: new Date().toISOString() })
      .eq('id', ruleId);
  }

  /**
   * Map database row to alert
   */
  private mapRowToAlert(row: Record<string, unknown>): ViolationAlert {
    return {
      id: row.id as string,
      violationId: row.violation_id as string,
      severity: row.severity as RuleSeverity,
      title: row.title as string,
      message: row.message as string,
      triggeredAt: row.triggered_at as string,
      acknowledgedAt: row.acknowledged_at as string | undefined,
      acknowledgedBy: row.acknowledged_by as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      escalationLevel: row.escalation_level as number,
      recipients: row.recipients as string[],
      channels: row.channels as ViolationAlert['channels'],
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
