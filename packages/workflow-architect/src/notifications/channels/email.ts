/**
 * Email Notification Channel
 * Supports SendGrid, AWS SES, and SMTP delivery
 */

import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
  INotificationChannel,
  NotificationChannel,
  EmailConfig,
  EmailPayload,
} from '../types';
import { getSupabaseAdminClient } from '../../supabase/client';

export class EmailChannel implements INotificationChannel {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on configuration
   */
  private async initializeTransporter(): Promise<void> {
    const config = await this.loadConfig();
    if (!config) return;

    this.config = config;

    switch (config.provider) {
      case 'sendgrid':
        this.transporter = nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: config.apiKey,
          },
        });
        break;

      case 'ses':
        // AWS SES via SMTP
        this.transporter = nodemailer.createTransport({
          host: 'email-smtp.us-east-1.amazonaws.com', // Update region as needed
          port: 587,
          secure: false,
          auth: {
            user: config.apiKey?.split(':')[0],
            pass: config.apiKey?.split(':')[1],
          },
        });
        break;

      case 'smtp':
        this.transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort || 587,
          secure: config.smtpPort === 465,
          auth: config.smtpUser
            ? {
                user: config.smtpUser,
                pass: config.smtpPassword,
              }
            : undefined,
        });
        break;

      default:
        throw new Error(`Unsupported email provider: ${config.provider}`);
    }
  }

  /**
   * Load email configuration from database
   */
  private async loadConfig(): Promise<EmailConfig | null> {
    try {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('channel_configs')
        .select('config')
        .eq('channel', 'email')
        .eq('enabled', true)
        .single();

      if (error || !data) {
        console.warn('Email channel not configured');
        return null;
      }

      // Also check environment variables for credentials
      const config = data.config as Partial<EmailConfig>;

      return {
        provider: (config.provider as EmailConfig['provider']) || 'smtp',
        apiKey: config.apiKey || process.env.EMAIL_API_KEY,
        smtpHost: config.smtpHost || process.env.SMTP_HOST,
        smtpPort: config.smtpPort || Number(process.env.SMTP_PORT || 587),
        smtpUser: config.smtpUser || process.env.SMTP_USER,
        smtpPassword: config.smtpPassword || process.env.SMTP_PASSWORD,
        from: config.from || process.env.EMAIL_FROM || 'notifications@workflow-architect.dev',
        fromName: config.fromName || process.env.EMAIL_FROM_NAME || 'Workflow Architect',
      };
    } catch (error) {
      console.error('Failed to load email config:', error);
      return null;
    }
  }

  /**
   * Send an email notification
   */
  async send(
    payload: EmailPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.transporter || !this.config) {
        await this.initializeTransporter();
        if (!this.transporter || !this.config) {
          return { success: false, error: 'Email channel not configured' };
        }
      }

      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

      // Validate email addresses
      for (const email of recipients) {
        if (!this.isValidEmail(email)) {
          return { success: false, error: `Invalid email address: ${email}` };
        }
      }

      // Prepare email
      const mailOptions: nodemailer.SendMailOptions = {
        from: `${this.config.fromName} <${this.config.from}>`,
        to: recipients.join(', '),
        subject: payload.subject,
        text: payload.body,
        html: payload.html,
        replyTo: payload.replyTo,
        cc: payload.cc?.join(', '),
        bcc: payload.bcc?.join(', '),
        attachments: payload.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send email with tracking pixel
   */
  async sendWithTracking(
    payload: EmailPayload,
    notificationId: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const trackingPixel = this.generateTrackingPixel(notificationId);

    // Add tracking pixel to HTML
    if (payload.html) {
      payload.html = payload.html + trackingPixel;
    } else {
      payload.html = `${this.textToHtml(payload.body)}${trackingPixel}`;
    }

    // Replace links with tracked links
    payload.html = this.wrapLinksWithTracking(payload.html, notificationId);

    return this.send(payload);
  }

  /**
   * Validate email address format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate tracking pixel HTML
   */
  private generateTrackingPixel(notificationId: string): string {
    const trackingUrl = process.env.APP_URL || 'http://localhost:3000';
    return `<img src="${trackingUrl}/api/notifications/track/open/${notificationId}" width="1" height="1" alt="" />`;
  }

  /**
   * Wrap links with tracking
   */
  private wrapLinksWithTracking(html: string, notificationId: string): string {
    const trackingUrl = process.env.APP_URL || 'http://localhost:3000';
    let linkIndex = 0;

    return html.replace(
      /href="([^"]+)"/g,
      (match, url) => {
        const trackedUrl = `${trackingUrl}/api/notifications/track/click/${notificationId}?url=${encodeURIComponent(url)}&index=${linkIndex}`;
        linkIndex++;
        return `href="${trackedUrl}"`;
      },
    );
  }

  /**
   * Convert plain text to HTML
   */
  private textToHtml(text: string): string {
    return text
      .split('\n')
      .map((line) => `<p>${this.escapeHtml(line)}</p>`)
      .join('');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Validate channel configuration
   */
  validateConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const emailConfig = config as Partial<EmailConfig>;

    if (!emailConfig.provider || !emailConfig.from) {
      return false;
    }

    switch (emailConfig.provider) {
      case 'sendgrid':
      case 'ses':
        return !!emailConfig.apiKey;

      case 'smtp':
        return !!(
          emailConfig.smtpHost &&
          emailConfig.smtpPort &&
          emailConfig.smtpUser &&
          emailConfig.smtpPassword
        );

      default:
        return false;
    }
  }

  /**
   * Get channel type
   */
  getChannelType(): NotificationChannel {
    return 'email';
  }

  /**
   * Send bulk emails
   */
  async sendBulk(
    payloads: EmailPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    const results: Array<{ success: boolean; messageId?: string; error?: string }> = [];

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((payload) => this.send(payload)));
      results.push(...batchResults);

      // Small delay between batches
      if (i + BATCH_SIZE < payloads.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
        if (!this.transporter) {
          return { success: false, error: 'Email channel not configured' };
        }
      }

      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
