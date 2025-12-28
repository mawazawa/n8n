/**
 * SMS Notification Channel
 * Supports SMS delivery via Twilio
 */

import type {
  INotificationChannel,
  NotificationChannel,
  SmsConfig,
  SmsPayload,
} from '../types';
import { getSupabaseAdminClient } from '../../supabase/client';

interface TwilioResponse {
  sid?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
  code?: number;
  message?: string;
}

export class SmsChannel implements INotificationChannel {
  private config: SmsConfig | null = null;
  private readonly MAX_SMS_LENGTH = 160;
  private readonly MAX_SEGMENTS = 10;

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize SMS configuration
   */
  private async initializeConfig(): Promise<void> {
    const config = await this.loadConfig();
    if (config) {
      this.config = config;
    }
  }

  /**
   * Load SMS configuration from database
   */
  private async loadConfig(): Promise<SmsConfig | null> {
    try {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('channel_configs')
        .select('config')
        .eq('channel', 'sms')
        .eq('enabled', true)
        .single();

      if (error || !data) {
        console.warn('SMS channel not configured');
        return null;
      }

      const config = data.config as Partial<SmsConfig>;

      return {
        provider: 'twilio',
        accountSid: config.accountSid || process.env.TWILIO_ACCOUNT_SID || '',
        authToken: config.authToken || process.env.TWILIO_AUTH_TOKEN || '',
        from: config.from || process.env.TWILIO_PHONE_NUMBER || '',
      };
    } catch (error) {
      console.error('Failed to load SMS config:', error);
      return null;
    }
  }

  /**
   * Send an SMS notification
   */
  async send(
    payload: SmsPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'SMS channel not configured' };
        }
      }

      // Validate phone number
      if (!this.isValidPhoneNumber(payload.to)) {
        return { success: false, error: `Invalid phone number: ${payload.to}` };
      }

      // Check message length
      const segments = this.calculateSegments(payload.body);
      if (segments > this.MAX_SEGMENTS) {
        return {
          success: false,
          error: `Message too long (${segments} segments, max ${this.MAX_SEGMENTS})`,
        };
      }

      // Send via Twilio
      const result = await this.sendViaTwilio(payload);

      return result;
    } catch (error) {
      console.error('SMS send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendViaTwilio(
    payload: SmsPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.config) {
      return { success: false, error: 'SMS not configured' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;

    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('To', payload.to);
    formData.append('From', this.config.from);
    formData.append('Body', payload.body);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
              'base64',
            ),
        },
        body: formData.toString(),
      });

      const data = (await response.json()) as TwilioResponse;

      if (response.ok && data.sid) {
        return {
          success: true,
          messageId: data.sid,
        };
      } else {
        return {
          success: false,
          error: data.message || data.error_message || `HTTP ${response.status}`,
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
   * Validate phone number format
   * Accepts E.164 format: +[country code][number]
   */
  private isValidPhoneNumber(phone: string): boolean {
    // E.164 format: +1234567890 (1 to 15 digits)
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Calculate number of SMS segments
   * Standard SMS: 160 characters
   * Multi-part SMS: 153 characters per segment (7 for header)
   */
  calculateSegments(message: string): number {
    const length = message.length;

    if (length === 0) return 0;
    if (length <= this.MAX_SMS_LENGTH) return 1;

    // Multi-part messages use 153 characters per segment
    return Math.ceil(length / 153);
  }

  /**
   * Truncate message to fit in specified segments
   */
  truncateMessage(message: string, maxSegments: number = 1): string {
    const maxLength = maxSegments === 1 ? this.MAX_SMS_LENGTH : maxSegments * 153;

    if (message.length <= maxLength) {
      return message;
    }

    // Truncate and add ellipsis
    return message.substring(0, maxLength - 3) + '...';
  }

  /**
   * Send bulk SMS
   */
  async sendBulk(
    payloads: SmsPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    const results: Array<{ success: boolean; messageId?: string; error?: string }> = [];

    // Process with rate limiting (Twilio limit: ~1 request/second for standard accounts)
    for (const payload of payloads) {
      const result = await this.send(payload);
      results.push(result);

      // Small delay between messages
      if (payloads.indexOf(payload) < payloads.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return results;
  }

  /**
   * Get message status from Twilio
   */
  async getMessageStatus(messageSid: string): Promise<{
    status?: string;
    error?: string;
  }> {
    if (!this.config) {
      await this.initializeConfig();
      if (!this.config) {
        return { error: 'SMS not configured' };
      }
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages/${messageSid}.json`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
              'base64',
            ),
        },
      });

      if (response.ok) {
        const data = (await response.json()) as TwilioResponse;
        return { status: data.status };
      } else {
        const error = (await response.json()) as TwilioResponse;
        return { error: error.message || `HTTP ${response.status}` };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Format phone number to E.164
   */
  formatPhoneNumber(phone: string, defaultCountryCode: string = '+1'): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Add country code if missing
    if (!phone.startsWith('+')) {
      // If doesn't start with country code, add default
      if (cleaned.length === 10) {
        // Assuming US/Canada number
        cleaned = defaultCountryCode.replace('+', '') + cleaned;
      }
    }

    return '+' + cleaned;
  }

  /**
   * Validate SMS configuration
   */
  validateConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const smsConfig = config as Partial<SmsConfig>;

    return !!(
      smsConfig.provider === 'twilio' &&
      smsConfig.accountSid &&
      smsConfig.authToken &&
      smsConfig.from &&
      this.isValidPhoneNumber(smsConfig.from)
    );
  }

  /**
   * Get channel type
   */
  getChannelType(): NotificationChannel {
    return 'sms';
  }

  /**
   * Test SMS connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config) {
        await this.initializeConfig();
        if (!this.config) {
          return { success: false, error: 'SMS channel not configured' };
        }
      }

      // Validate credentials by fetching account details
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}.json`;

      const response = await fetch(url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
              'base64',
            ),
        },
      });

      if (response.ok) {
        return { success: true };
      } else {
        const error = (await response.json()) as TwilioResponse;
        return { success: false, error: error.message || `HTTP ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get account balance (Twilio)
   */
  async getBalance(): Promise<{ balance?: string; currency?: string; error?: string }> {
    if (!this.config) {
      await this.initializeConfig();
      if (!this.config) {
        return { error: 'SMS not configured' };
      }
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Balance.json`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
              'base64',
            ),
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          balance: data.balance,
          currency: data.currency,
        };
      } else {
        const error = (await response.json()) as TwilioResponse;
        return { error: error.message || `HTTP ${response.status}` };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
