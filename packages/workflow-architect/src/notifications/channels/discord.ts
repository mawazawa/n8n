/**
 * Discord Notification Channel
 * Supports Discord webhooks with rich embeds
 */

import type {
  INotificationChannel,
  NotificationChannel,
  DiscordConfig,
  DiscordPayload,
} from '../types';
import { getSupabaseAdminClient } from '../../supabase/client';

interface DiscordWebhookResponse {
  id?: string;
  code?: number;
  message?: string;
}

export class DiscordChannel implements INotificationChannel {
  private config: DiscordConfig | null = null;

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize Discord configuration
   */
  private async initializeConfig(): Promise<void> {
    const config = await this.loadConfig();
    if (config) {
      this.config = config;
    }
  }

  /**
   * Load Discord configuration from database
   */
  private async loadConfig(): Promise<DiscordConfig | null> {
    try {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('channel_configs')
        .select('config')
        .eq('channel', 'discord')
        .eq('enabled', true)
        .single();

      if (error || !data) {
        console.warn('Discord channel not configured');
        return null;
      }

      const config = data.config as Partial<DiscordConfig>;

      return {
        webhookUrl: config.webhookUrl || process.env.DISCORD_WEBHOOK_URL || '',
        username: config.username || process.env.DISCORD_USERNAME || 'Workflow Architect',
        avatarUrl: config.avatarUrl || process.env.DISCORD_AVATAR_URL,
      };
    } catch (error) {
      console.error('Failed to load Discord config:', error);
      return null;
    }
  }

  /**
   * Send a Discord notification
   */
  async send(
    payload: DiscordPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'Discord channel not configured' };
        }
      }

      if (!this.config.webhookUrl) {
        return { success: false, error: 'Discord webhook URL not configured' };
      }

      // Build webhook payload
      const webhookPayload: Record<string, unknown> = {
        content: payload.content,
        username: payload.username || this.config.username,
        avatar_url: payload.avatarUrl || this.config.avatarUrl,
      };

      if (payload.embeds && payload.embeds.length > 0) {
        webhookPayload.embeds = payload.embeds;
      }

      // Send to Discord
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      if (response.ok || response.status === 204) {
        return { success: true };
      } else {
        const error = (await response.json()) as DiscordWebhookResponse;
        return {
          success: false,
          error: error.message || `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      console.error('Discord send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a simple text message
   */
  async sendText(
    message: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.send({ content: message });
  }

  /**
   * Send a message with a rich embed
   */
  async sendEmbed(
    embed: {
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string; icon_url?: string };
      timestamp?: string;
      thumbnail?: { url: string };
      image?: { url: string };
    },
    content?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.send({
      content,
      embeds: [embed],
    });
  }

  /**
   * Create a notification embed
   */
  createNotificationEmbed(options: {
    title: string;
    message: string;
    status?: 'success' | 'error' | 'warning' | 'info';
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    url?: string;
  }): DiscordPayload['embeds'][0] {
    const { title, message, status = 'info', fields, url } = options;

    // Color codes
    const colors = {
      success: 0x00ff00, // Green
      error: 0xff0000, // Red
      warning: 0xffa500, // Orange
      info: 0x0099ff, // Blue
    };

    const embed: NonNullable<DiscordPayload['embeds']>[0] = {
      title,
      description: message,
      color: colors[status],
      timestamp: new Date().toISOString(),
    };

    if (fields) {
      embed.fields = fields;
    }

    if (url) {
      embed.url = url;
    }

    return embed;
  }

  /**
   * Send a workflow notification
   */
  async sendWorkflowNotification(options: {
    workflowName: string;
    status: 'completed' | 'failed' | 'started';
    message?: string;
    executionTime?: number;
    errorMessage?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { workflowName, status, message, executionTime, errorMessage } = options;

    const statusEmojis = {
      completed: '✅',
      failed: '❌',
      started: '▶️',
    };

    const statusColors = {
      completed: 0x00ff00,
      failed: 0xff0000,
      started: 0x0099ff,
    };

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    if (executionTime !== undefined) {
      fields.push({
        name: 'Execution Time',
        value: `${executionTime}ms`,
        inline: true,
      });
    }

    if (errorMessage) {
      fields.push({
        name: 'Error',
        value: errorMessage,
        inline: false,
      });
    }

    const embed = {
      title: `${statusEmojis[status]} Workflow ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      description: message || `Workflow "${workflowName}" ${status}`,
      color: statusColors[status],
      fields,
      timestamp: new Date().toISOString(),
    };

    return this.send({ embeds: [embed] });
  }

  /**
   * Validate Discord configuration
   */
  validateConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const discordConfig = config as Partial<DiscordConfig>;

    // Must have webhook URL
    return !!discordConfig.webhookUrl && this.isValidWebhookUrl(discordConfig.webhookUrl);
  }

  /**
   * Validate Discord webhook URL format
   */
  private isValidWebhookUrl(url: string): boolean {
    // Discord webhook URLs follow a specific pattern
    const webhookRegex = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    return webhookRegex.test(url);
  }

  /**
   * Get channel type
   */
  getChannelType(): NotificationChannel {
    return 'discord';
  }

  /**
   * Test Discord connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'Discord channel not configured' };
        }
      }

      // Send a test message
      const result = await this.send({
        content: 'Test message from Workflow Architect',
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
   * Get webhook information
   */
  async getWebhookInfo(): Promise<{
    id?: string;
    name?: string;
    channelId?: string;
    guildId?: string;
  } | null> {
    if (!this.config?.webhookUrl) {
      return null;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'GET',
      });

      if (response.ok) {
        return await response.json();
      }

      return null;
    } catch (error) {
      console.error('Failed to get webhook info:', error);
      return null;
    }
  }

  /**
   * Send multiple embeds at once
   */
  async sendMultipleEmbeds(
    embeds: Array<NonNullable<DiscordPayload['embeds']>[0]>,
    content?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Discord allows up to 10 embeds per message
    if (embeds.length > 10) {
      return {
        success: false,
        error: 'Discord allows maximum 10 embeds per message',
      };
    }

    return this.send({
      content,
      embeds,
    });
  }
}
