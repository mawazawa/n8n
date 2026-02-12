/**
 * Audit Alerts
 * Real-time monitoring and alerting for audit events
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AlertRule,
  AlertCondition,
  AlertAction,
  AlertEvent,
  AuditEvent,
  AuditSeverity,
} from './types.js';

export interface AlertsConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

interface RuleTriggerState {
  ruleId: string;
  matchCount: number;
  firstMatch: number; // timestamp
  lastTriggered?: number; // timestamp
}

export class AlertManager {
  private supabase: SupabaseClient;
  private rules: Map<string, AlertRule> = new Map();
  private triggerStates: Map<string, RuleTriggerState> = new Map();
  private monitoring = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(config: AlertsConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.triggerStates.delete(ruleId);
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Enable a rule
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  /**
   * Disable a rule
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  /**
   * Start monitoring audit events for alerts
   */
  startMonitoring(interval = 10000): void {
    if (this.monitoring) {
      return;
    }

    this.monitoring = true;

    // Check for new events periodically
    this.monitorInterval = setInterval(() => {
      void this.checkForAlerts();
    }, interval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.monitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Check for events that match alert rules
   */
  async checkForAlerts(): Promise<void> {
    const now = Date.now();
    const checkSince = new Date(now - 60000).toISOString(); // Last minute

    // Get recent events
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', checkSince)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Failed to fetch recent events for alerts:', error);
      return;
    }

    if (!events || events.length === 0) {
      return;
    }

    // Check each rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      await this.checkRule(rule, events as unknown as AuditEvent[], now);
    }
  }

  /**
   * Check a specific rule against events
   */
  private async checkRule(rule: AlertRule, events: AuditEvent[], now: number): Promise<void> {
    // Filter events that match rule conditions
    const matchingEvents = events.filter((event) => this.eventMatchesConditions(event, rule.conditions));

    if (matchingEvents.length === 0) {
      return;
    }

    // Get or create trigger state
    let state = this.triggerStates.get(rule.id);
    if (!state) {
      state = {
        ruleId: rule.id,
        matchCount: 0,
        firstMatch: now,
      };
      this.triggerStates.set(rule.id, state);
    }

    // Check time window
    const timeWindow = (rule.timeWindow ?? 5) * 60 * 1000; // minutes to ms
    if (now - state.firstMatch > timeWindow) {
      // Reset state for new window
      state.matchCount = matchingEvents.length;
      state.firstMatch = now;
    } else {
      state.matchCount += matchingEvents.length;
    }

    // Check threshold
    const threshold = rule.threshold ?? 1;
    if (state.matchCount >= threshold) {
      // Check cooldown
      const cooldown = (rule.cooldown ?? 60) * 60 * 1000; // minutes to ms
      if (state.lastTriggered && now - state.lastTriggered < cooldown) {
        return; // Still in cooldown
      }

      // Trigger alert
      await this.triggerAlert(rule, matchingEvents);

      // Update state
      state.lastTriggered = now;
      state.matchCount = 0;
      state.firstMatch = now;

      // Update rule
      rule.lastTriggered = new Date(now).toISOString();
    }
  }

  /**
   * Check if an event matches all conditions
   */
  private eventMatchesConditions(event: AuditEvent, conditions: AlertCondition[]): boolean {
    return conditions.every((condition) => this.eventMatchesCondition(event, condition));
  }

  /**
   * Check if an event matches a single condition
   */
  private eventMatchesCondition(event: AuditEvent, condition: AlertCondition): boolean {
    const value = this.getEventFieldValue(event, condition.field);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return typeof value === 'string' && value.includes(String(condition.value));
      case 'greater_than':
        return typeof value === 'number' && value > Number(condition.value);
      case 'less_than':
        return typeof value === 'number' && value < Number(condition.value);
      case 'matches_regex':
        return typeof value === 'string' && new RegExp(String(condition.value)).test(value);
      default:
        return false;
    }
  }

  /**
   * Get a field value from an event using dot notation
   */
  private getEventFieldValue(event: AuditEvent, field: string): unknown {
    const parts = field.split('.');
    let value: unknown = event;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, matchingEvents: AuditEvent[]): Promise<void> {
    const alertEvent: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      triggeredAt: new Date().toISOString(),
      matchingEvents,
      severity: this.getAlertSeverity(matchingEvents),
      message: this.buildAlertMessage(rule, matchingEvents),
      actionResults: [],
    };

    // Execute actions
    for (const action of rule.actions) {
      const result = await this.executeAction(action, alertEvent);
      alertEvent.actionResults.push(result);
    }

    // Log the alert event
    console.log(`Alert triggered: ${rule.name}`, alertEvent);
  }

  /**
   * Determine alert severity based on matching events
   */
  private getAlertSeverity(events: AuditEvent[]): AuditSeverity {
    // Return highest severity
    if (events.some((e) => e.severity === 'critical')) return 'critical';
    if (events.some((e) => e.severity === 'error')) return 'error';
    if (events.some((e) => e.severity === 'warning')) return 'warning';
    return 'info';
  }

  /**
   * Build alert message
   */
  private buildAlertMessage(rule: AlertRule, events: AuditEvent[]): string {
    return `Alert "${rule.name}" triggered with ${events.length} matching event(s):\n${
      events.slice(0, 5).map((e) => `- ${e.eventType}: ${e.description}`).join('\n')
    }${events.length > 5 ? `\n... and ${events.length - 5} more` : ''}`;
  }

  /**
   * Execute an alert action
   */
  private async executeAction(action: AlertAction, alertEvent: AlertEvent): Promise<{
    type: string;
    success: boolean;
    error?: string;
  }> {
    try {
      switch (action.type) {
        case 'email':
          await this.sendEmailAlert(action.config, alertEvent);
          break;
        case 'slack':
          await this.sendSlackAlert(action.config, alertEvent);
          break;
        case 'webhook':
          await this.sendWebhookAlert(action.config, alertEvent);
          break;
        case 'sms':
          await this.sendSMSAlert(action.config, alertEvent);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      return { type: action.type, success: true };
    } catch (error) {
      return {
        type: action.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(config: Record<string, unknown>, alertEvent: AlertEvent): Promise<void> {
    // Placeholder - integrate with email service
    console.log('Email alert:', {
      to: config.to,
      subject: `Alert: ${alertEvent.ruleName}`,
      body: alertEvent.message,
    });
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(config: Record<string, unknown>, alertEvent: AlertEvent): Promise<void> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *${alertEvent.ruleName}*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Alert:* ${alertEvent.ruleName}\n*Severity:* ${alertEvent.severity}\n*Triggered:* ${alertEvent.triggeredAt}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: alertEvent.message,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(config: Record<string, unknown>, alertEvent: AlertEvent): Promise<void> {
    const url = config.url as string;
    if (!url) {
      throw new Error('Webhook URL not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers as Record<string, string> ?? {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(alertEvent),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
  }

  /**
   * Send SMS alert
   */
  private async sendSMSAlert(config: Record<string, unknown>, alertEvent: AlertEvent): Promise<void> {
    // Placeholder - integrate with Twilio or similar
    console.log('SMS alert:', {
      to: config.to,
      message: `Alert: ${alertEvent.ruleName} - ${alertEvent.message.substring(0, 100)}`,
    });
  }

  /**
   * Create a pre-configured alert rule for failed logins
   */
  static createFailedLoginAlert(actions: AlertAction[]): AlertRule {
    return {
      id: 'failed-login-alert',
      name: 'Failed Login Attempts',
      description: 'Alert when there are multiple failed login attempts',
      enabled: true,
      conditions: [
        {
          field: 'eventType',
          operator: 'equals',
          value: 'user.login_failed',
        },
      ],
      threshold: 5,
      timeWindow: 15, // 15 minutes
      actions,
      cooldown: 60, // 1 hour
    };
  }

  /**
   * Create a pre-configured alert rule for permission changes
   */
  static createPermissionChangeAlert(actions: AlertAction[]): AlertRule {
    return {
      id: 'permission-change-alert',
      name: 'Permission Changes',
      description: 'Alert when permissions are granted or revoked',
      enabled: true,
      conditions: [
        {
          field: 'eventType',
          operator: 'contains',
          value: 'permission.',
        },
      ],
      threshold: 1,
      actions,
    };
  }

  /**
   * Create a pre-configured alert rule for data exports
   */
  static createDataExportAlert(actions: AlertAction[]): AlertRule {
    return {
      id: 'data-export-alert',
      name: 'Data Export',
      description: 'Alert when data is exported',
      enabled: true,
      conditions: [
        {
          field: 'eventType',
          operator: 'equals',
          value: 'data.export',
        },
      ],
      threshold: 1,
      actions,
    };
  }

  /**
   * Create a pre-configured alert rule for security violations
   */
  static createSecurityViolationAlert(actions: AlertAction[]): AlertRule {
    return {
      id: 'security-violation-alert',
      name: 'Security Violation',
      description: 'Alert on any security violation',
      enabled: true,
      conditions: [
        {
          field: 'severity',
          operator: 'equals',
          value: 'critical',
        },
      ],
      threshold: 1,
      actions,
    };
  }
}
