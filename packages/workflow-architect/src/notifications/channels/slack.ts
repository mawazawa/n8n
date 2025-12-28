/**
 * Slack Notification Channel
 * Supports Bot API and Incoming Webhooks with Block Kit
 */

import type {
  INotificationChannel,
  NotificationChannel,
  SlackConfig,
  SlackPayload,
} from '../types';
import { getSupabaseAdminClient } from '../../supabase/client';

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

export class SlackChannel implements INotificationChannel {
  private config: SlackConfig | null = null;

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize Slack configuration
   */
  private async initializeConfig(): Promise<void> {
    const config = await this.loadConfig();
    if (config) {
      this.config = config;
    }
  }

  /**
   * Load Slack configuration from database
   */
  private async loadConfig(): Promise<SlackConfig | null> {
    try {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('channel_configs')
        .select('config')
        .eq('channel', 'slack')
        .eq('enabled', true)
        .single();

      if (error || !data) {
        console.warn('Slack channel not configured');
        return null;
      }

      const config = data.config as Partial<SlackConfig>;

      return {
        token: config.token || process.env.SLACK_BOT_TOKEN || '',
        defaultChannel: config.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL,
        webhookUrl: config.webhookUrl || process.env.SLACK_WEBHOOK_URL,
      };
    } catch (error) {
      console.error('Failed to load Slack config:', error);
      return null;
    }
  }

  /**
   * Send a Slack notification
   */
  async send(
    payload: SlackPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'Slack channel not configured' };
        }
      }

      // Use webhook if available, otherwise use Bot API
      if (this.config.webhookUrl) {
        return this.sendViaWebhook(payload);
      } else if (this.config.token) {
        return this.sendViaAPI(payload);
      } else {
        return { success: false, error: 'No Slack token or webhook URL configured' };
      }
    } catch (error) {
      console.error('Slack send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send message via Slack Web API
   */
  private async sendViaAPI(
    payload: SlackPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.config?.token) {
      return { success: false, error: 'Slack token not configured' };
    }

    const channel = payload.channel || this.config.defaultChannel;
    if (!channel) {
      return { success: false, error: 'No Slack channel specified' };
    }

    const body: Record<string, unknown> = {
      channel,
      text: payload.text,
    };

    if (payload.blocks) {
      body.blocks = payload.blocks;
    }

    if (payload.threadTs) {
      body.thread_ts = payload.threadTs;
    }

    if (payload.username) {
      body.username = payload.username;
    }

    if (payload.iconEmoji) {
      body.icon_emoji = payload.iconEmoji;
    }

    if (payload.iconUrl) {
      body.icon_url = payload.iconUrl;
    }

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as SlackResponse;

      if (data.ok) {
        return {
          success: true,
          messageId: data.ts,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Unknown Slack API error',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send message via Incoming Webhook
   */
  private async sendViaWebhook(
    payload: SlackPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.config?.webhookUrl) {
      return { success: false, error: 'Slack webhook URL not configured' };
    }

    const body: Record<string, unknown> = {
      text: payload.text,
    };

    if (payload.blocks) {
      body.blocks = payload.blocks;
    }

    if (payload.username) {
      body.username = payload.username;
    }

    if (payload.iconEmoji) {
      body.icon_emoji = payload.iconEmoji;
    }

    if (payload.iconUrl) {
      body.icon_url = payload.iconUrl;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          error: errorText || 'Webhook request failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send message with Block Kit formatting
   */
  async sendWithBlocks(
    channel: string,
    text: string,
    blocks: unknown[],
    options?: {
      threadTs?: string;
      username?: string;
      iconEmoji?: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.send({
      channel,
      text,
      blocks,
      threadTs: options?.threadTs,
      username: options?.username,
      iconEmoji: options?.iconEmoji,
    });
  }

  /**
   * Reply to a thread
   */
  async replyToThread(
    channel: string,
    threadTs: string,
    text: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.send({
      channel,
      text,
      threadTs,
    });
  }

  /**
   * Create a formatted notification block
   */
  createNotificationBlock(options: {
    title: string;
    message: string;
    status?: 'success' | 'error' | 'warning' | 'info';
    fields?: Array<{ title: string; value: string; short?: boolean }>;
    actions?: Array<{ text: string; url: string }>;
  }): unknown[] {
    const { title, message, status = 'info', fields, actions } = options;

    const blocks: unknown[] = [];

    // Header
    let emoji = '🔔';
    if (status === 'success') emoji = '✅';
    if (status === 'error') emoji = '❌';
    if (status === 'warning') emoji = '⚠️';

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${title}`,
      },
    });

    // Message
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: message,
      },
    });

    // Fields
    if (fields && fields.length > 0) {
      blocks.push({
        type: 'section',
        fields: fields.map((field) => ({
          type: 'mrkdwn',
          text: `*${field.title}*\n${field.value}`,
        })),
      });
    }

    // Actions
    if (actions && actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions.map((action, index) => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.text,
          },
          url: action.url,
          action_id: `action_${index}`,
        })),
      });
    }

    // Divider
    blocks.push({
      type: 'divider',
    });

    return blocks;
  }

  /**
   * Validate Slack configuration
   */
  validateConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const slackConfig = config as Partial<SlackConfig>;

    // Must have either token or webhook URL
    return !!(slackConfig.token || slackConfig.webhookUrl);
  }

  /**
   * Get channel type
   */
  getChannelType(): NotificationChannel {
    return 'slack';
  }

  /**
   * Test Slack connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'Slack channel not configured' };
        }
      }

      // Test with a simple message
      const result = await this.send({
        channel: this.config.defaultChannel || 'general',
        text: 'Test message from Workflow Architect',
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List channels (requires token)
   */
  async listChannels(): Promise<Array<{ id: string; name: string }>> {
    if (!this.config?.token) {
      return [];
    }

    try {
      const response = await fetch('https://slack.com/api/conversations.list', {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
      });

      const data = (await response.json()) as {
        ok: boolean;
        channels?: Array<{ id: string; name: string }>;
      };

      if (data.ok && data.channels) {
        return data.channels;
      }

      return [];
    } catch (error) {
      console.error('Failed to list Slack channels:', error);
      return [];
    }
  }
}
