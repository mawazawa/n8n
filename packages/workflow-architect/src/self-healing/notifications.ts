import type { NotificationConfig, NotificationChannel, NotificationSeverity, HealingResult } from './types.js';
import { NotificationConfigSchema } from './types.js';
import type { Anomaly } from './types.js';

/**
 * Healing Notification System
 *
 * Multi-channel notifications for healing events with rate limiting and filtering.
 */
export class HealingNotifier {
  private readonly configs: Map<string, NotificationConfig> = new Map();
  private readonly rateLimiter: RateLimiter = new RateLimiter();
  private readonly notificationHistory: NotificationRecord[] = [];

  /**
   * Configure notifications for a workflow
   */
  configure(workflowId: string, config: Partial<NotificationConfig>): void {
    const notificationConfig = NotificationConfigSchema.parse(config);
    this.configs.set(workflowId, notificationConfig);
  }

  /**
   * Send notification for a healing event
   */
  async notify(event: HealingEvent): Promise<NotificationResult> {
    const config = this.configs.get(event.workflowId);
    if (!config) {
      return {
        success: false,
        error: 'No notification configuration found',
        channelsNotified: [],
      };
    }

    // Check severity filter
    if (!this.shouldNotify(event.severity, config)) {
      return {
        success: true,
        channelsNotified: [],
        filtered: true,
      };
    }

    // Check rate limits
    if (!this.rateLimiter.allowNotification(event.workflowId, config.rateLimit)) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        channelsNotified: [],
        rateLimited: true,
      };
    }

    const results: ChannelResult[] = [];

    // Send to each configured channel
    for (const channel of config.channels) {
      try {
        const result = await this.sendToChannel(channel, event, config);
        results.push(result);
      } catch (error) {
        results.push({
          channel,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Record notification
    this.recordNotification(event, results);

    return {
      success: results.some((r) => r.success),
      channelsNotified: results.filter((r) => r.success).map((r) => r.channel),
      results,
    };
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(
    channel: NotificationChannel,
    event: HealingEvent,
    config: NotificationConfig
  ): Promise<ChannelResult> {
    switch (channel) {
      case 'EMAIL':
        return await this.sendEmail(event, config);
      case 'SLACK':
        return await this.sendSlack(event, config);
      case 'WEBHOOK':
        return await this.sendWebhook(event, config);
      case 'SMS':
        return await this.sendSMS(event, config);
      default:
        return {
          channel,
          success: false,
          error: `Unsupported channel: ${channel}`,
        };
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(
    event: HealingEvent,
    config: NotificationConfig
  ): Promise<ChannelResult> {
    if (!config.emailConfig) {
      return {
        channel: 'EMAIL',
        success: false,
        error: 'Email configuration not provided',
      };
    }

    try {
      const subject = config.emailConfig.subject || this.generateEmailSubject(event);
      const body = this.generateEmailBody(event);

      // Simulate email sending
      await this.sleep(100);
      console.log(`[EMAIL] To: ${config.emailConfig.recipients.join(', ')}`);
      console.log(`[EMAIL] Subject: ${subject}`);
      console.log(`[EMAIL] Body: ${body}`);

      return {
        channel: 'EMAIL',
        success: true,
      };
    } catch (error) {
      return {
        channel: 'EMAIL',
        success: false,
        error: error instanceof Error ? error.message : 'Email send failed',
      };
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(
    event: HealingEvent,
    config: NotificationConfig
  ): Promise<ChannelResult> {
    if (!config.slackConfig) {
      return {
        channel: 'SLACK',
        success: false,
        error: 'Slack configuration not provided',
      };
    }

    try {
      const message = this.generateSlackMessage(event, config.slackConfig.mentionUsers);

      // Simulate Slack webhook
      await this.sleep(100);
      console.log(`[SLACK] Webhook: ${config.slackConfig.webhookUrl}`);
      console.log(`[SLACK] Channel: ${config.slackConfig.channel || 'default'}`);
      console.log(`[SLACK] Message: ${JSON.stringify(message, null, 2)}`);

      return {
        channel: 'SLACK',
        success: true,
      };
    } catch (error) {
      return {
        channel: 'SLACK',
        success: false,
        error: error instanceof Error ? error.message : 'Slack send failed',
      };
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(
    event: HealingEvent,
    config: NotificationConfig
  ): Promise<ChannelResult> {
    if (!config.webhookConfig) {
      return {
        channel: 'WEBHOOK',
        success: false,
        error: 'Webhook configuration not provided',
      };
    }

    try {
      const payload = this.generateWebhookPayload(event);

      // Simulate webhook call
      await this.sleep(100);
      console.log(`[WEBHOOK] ${config.webhookConfig.method} ${config.webhookConfig.url}`);
      console.log(`[WEBHOOK] Payload: ${JSON.stringify(payload, null, 2)}`);

      return {
        channel: 'WEBHOOK',
        success: true,
      };
    } catch (error) {
      return {
        channel: 'WEBHOOK',
        success: false,
        error: error instanceof Error ? error.message : 'Webhook send failed',
      };
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(_event: HealingEvent, _config: NotificationConfig): Promise<ChannelResult> {
    // SMS not implemented in this version
    return {
      channel: 'SMS',
      success: false,
      error: 'SMS notifications not implemented',
    };
  }

  /**
   * Check if notification should be sent based on severity
   */
  private shouldNotify(severity: NotificationSeverity, config: NotificationConfig): boolean {
    if (!config.severityFilter || config.severityFilter.length === 0) {
      return true;
    }

    return config.severityFilter.includes(severity);
  }

  /**
   * Record notification in history
   */
  private recordNotification(event: HealingEvent, results: ChannelResult[]): void {
    this.notificationHistory.push({
      event,
      results,
      timestamp: Date.now(),
    });

    // Keep last 1000 notifications
    if (this.notificationHistory.length > 1000) {
      this.notificationHistory.shift();
    }
  }

  /**
   * Generate email subject
   */
  private generateEmailSubject(event: HealingEvent): string {
    return `[${event.severity}] Self-Healing: ${event.type} - Workflow ${event.workflowId}`;
  }

  /**
   * Generate email body
   */
  private generateEmailBody(event: HealingEvent): string {
    let body = `Healing Event Notification\n\n`;
    body += `Type: ${event.type}\n`;
    body += `Severity: ${event.severity}\n`;
    body += `Workflow ID: ${event.workflowId}\n`;
    body += `Timestamp: ${new Date(event.timestamp).toISOString()}\n\n`;

    if (event.anomaly) {
      body += `Anomaly Details:\n`;
      body += `  Type: ${event.anomaly.type}\n`;
      body += `  Severity: ${event.anomaly.severity}\n`;
      body += `  Value: ${event.anomaly.value}\n`;
      body += `  Baseline: ${event.anomaly.baseline}\n\n`;
    }

    if (event.healingResult) {
      body += `Healing Action:\n`;
      body += `  Action: ${event.healingResult.action.type}\n`;
      body += `  Success: ${event.healingResult.success}\n`;
      body += `  Duration: ${event.healingResult.duration}ms\n`;
    }

    return body;
  }

  /**
   * Generate Slack message
   */
  private generateSlackMessage(event: HealingEvent, mentionUsers?: string[]): Record<string, unknown> {
    const mentions = mentionUsers ? mentionUsers.map((u) => `<@${u}>`).join(' ') : '';

    return {
      text: `${mentions} Self-Healing Event`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🔧 ${event.type} - ${event.severity}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Workflow:*\n${event.workflowId}`,
            },
            {
              type: 'mrkdwn',
              text: `*Time:*\n${new Date(event.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate webhook payload
   */
  private generateWebhookPayload(event: HealingEvent): Record<string, unknown> {
    return {
      eventType: event.type,
      severity: event.severity,
      workflowId: event.workflowId,
      timestamp: event.timestamp,
      anomaly: event.anomaly,
      healingResult: event.healingResult,
    };
  }

  /**
   * Get notification history
   */
  getHistory(workflowId?: string, limit?: number): NotificationRecord[] {
    let records = [...this.notificationHistory];

    if (workflowId) {
      records = records.filter((r) => r.event.workflowId === workflowId);
    }

    if (limit) {
      records = records.slice(-limit);
    }

    return records;
  }

  /**
   * Clear notification history
   */
  clearHistory(): void {
    this.notificationHistory.length = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Rate Limiter
 */
class RateLimiter {
  private readonly counters: Map<string, RateLimitCounter> = new Map();

  allowNotification(
    workflowId: string,
    config?: { maxPerMinute: number; maxPerHour: number }
  ): boolean {
    if (!config) {
      return true; // No rate limiting
    }

    const counter = this.getCounter(workflowId);
    const now = Date.now();

    // Clean old entries
    counter.perMinute = counter.perMinute.filter((t) => now - t < 60000);
    counter.perHour = counter.perHour.filter((t) => now - t < 3600000);

    // Check limits
    if (counter.perMinute.length >= config.maxPerMinute) {
      return false;
    }

    if (counter.perHour.length >= config.maxPerHour) {
      return false;
    }

    // Record notification
    counter.perMinute.push(now);
    counter.perHour.push(now);

    return true;
  }

  private getCounter(workflowId: string): RateLimitCounter {
    if (!this.counters.has(workflowId)) {
      this.counters.set(workflowId, {
        perMinute: [],
        perHour: [],
      });
    }
    return this.counters.get(workflowId)!;
  }
}

/**
 * Healing Event
 */
export interface HealingEvent {
  type: 'ANOMALY_DETECTED' | 'HEALING_STARTED' | 'HEALING_COMPLETED' | 'HEALING_FAILED';
  severity: NotificationSeverity;
  workflowId: string;
  timestamp: number;
  anomaly?: Anomaly;
  healingResult?: HealingResult;
  metadata?: Record<string, unknown>;
}

/**
 * Notification Result
 */
interface NotificationResult {
  success: boolean;
  error?: string;
  channelsNotified: NotificationChannel[];
  results?: ChannelResult[];
  filtered?: boolean;
  rateLimited?: boolean;
}

/**
 * Channel Result
 */
interface ChannelResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

/**
 * Notification Record
 */
interface NotificationRecord {
  event: HealingEvent;
  results: ChannelResult[];
  timestamp: number;
}

/**
 * Rate Limit Counter
 */
interface RateLimitCounter {
  perMinute: number[];
  perHour: number[];
}
