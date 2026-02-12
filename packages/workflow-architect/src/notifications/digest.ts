/**
 * Digest Manager
 * Manages batched/digest notifications sent daily or weekly
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdminClient } from '../supabase/client';
import type {
  Notification,
  NotificationRow,
  DigestPayload,
  NotificationDigestRow,
} from './types';
import { PreferencesManager } from './preferences';
import { EmailChannel } from './channels/email';

export class DigestManager {
  private preferencesManager: PreferencesManager;
  private emailChannel: EmailChannel;

  constructor() {
    this.preferencesManager = new PreferencesManager();
    this.emailChannel = new EmailChannel();
  }

  /**
   * Add notification to user's digest
   */
  async addToDigest(userId: string, notificationId: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    // Check if user has digest enabled
    const preferences = await this.preferencesManager.getPreferences(userId);
    if (!preferences.digest?.enabled) {
      return false;
    }

    // Mark notification as part of digest (will be picked up later)
    // For now, we just ensure the notification is pending
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'pending',
        // We'll create the digest when sending
      })
      .eq('id', notificationId);

    return !error;
  }

  /**
   * Send digest for a user
   */
  async sendDigest(userId: string): Promise<{ success: boolean; count: number }> {
    const preferences = await this.preferencesManager.getPreferences(userId);

    if (!preferences.digest?.enabled) {
      return { success: false, count: 0 };
    }

    // Get pending notifications for digest
    const notifications = await this.getPendingDigestNotifications(
      userId,
      preferences.digest.frequency,
    );

    if (notifications.length === 0) {
      return { success: true, count: 0 };
    }

    // Create digest
    const digest = await this.createDigest(
      userId,
      notifications,
      preferences.digest.frequency,
    );

    // Send digest email
    const sent = await this.sendDigestEmail(digest);

    if (sent) {
      // Mark digest as sent
      await this.markDigestAsSent(digest.id);

      // Update notifications to reference digest
      await this.linkNotificationsToDigest(digest.id, notifications.map((n) => n.id));
    }

    return { success: sent, count: notifications.length };
  }

  /**
   * Process all pending digests
   * Should be called by a scheduled job (daily/weekly)
   */
  async processDigests(frequency: 'daily' | 'weekly'): Promise<{
    processed: number;
    successful: number;
    failed: number;
  }> {
    const users = await this.preferencesManager.getUsersWithDigestEnabled(frequency);

    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (const userId of users) {
      try {
        const result = await this.sendDigest(userId);
        processed++;

        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to send digest for user ${userId}:`, error);
        processed++;
        failed++;
      }
    }

    return { processed, successful, failed };
  }

  /**
   * Get pending notifications for digest
   */
  private async getPendingDigestNotifications(
    userId: string,
    frequency: 'daily' | 'weekly',
  ): Promise<Notification[]> {
    const supabase = getSupabaseAdminClient();

    // Calculate time window
    const now = new Date();
    const since = new Date(now);

    if (frequency === 'daily') {
      since.setDate(since.getDate() - 1);
    } else {
      since.setDate(since.getDate() - 7);
    }

    const { data, error } = await supabase.rpc('get_pending_digest_notifications', {
      user_uuid: userId,
      since: since.toISOString(),
    });

    if (error || !data) {
      return [];
    }

    return (data as unknown as NotificationRow[]).map((row) => this.rowToNotification(row));
  }

  /**
   * Create digest record
   */
  private async createDigest(
    userId: string,
    notifications: Notification[],
    frequency: 'daily' | 'weekly',
  ): Promise<{ id: string; userId: string; notifications: Notification[] }> {
    const supabase = getSupabaseAdminClient();

    // Calculate period
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now);

    if (frequency === 'daily') {
      periodStart.setDate(periodStart.getDate() - 1);
    } else {
      periodStart.setDate(periodStart.getDate() - 7);
    }

    const { data, error } = await supabase
      .from('notification_digests')
      .insert({
        id: uuidv4(),
        user_id: userId,
        notification_ids: notifications.map((n) => n.id),
        frequency,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create digest: ${error?.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      notifications,
    };
  }

  /**
   * Send digest email
   */
  private async sendDigestEmail(digest: {
    id: string;
    userId: string;
    notifications: Notification[];
  }): Promise<boolean> {
    // Get user email (would need to query user table)
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', digest.userId)
      .single();

    if (!user?.email) {
      console.error('User email not found for digest');
      return false;
    }

    // Group notifications by type/template
    const grouped = this.groupNotifications(digest.notifications);

    // Build email content
    const subject = `Your ${digest.notifications.length} notification${digest.notifications.length > 1 ? 's' : ''} digest`;

    const body = this.buildDigestBody(grouped);
    const html = this.buildDigestHtml(grouped);

    // Send email
    const result = await this.emailChannel.send({
      to: user.email,
      subject,
      body,
      html,
    });

    return result.success;
  }

  /**
   * Group notifications by template
   */
  private groupNotifications(
    notifications: Notification[],
  ): Map<string, Notification[]> {
    const groups = new Map<string, Notification[]>();

    for (const notification of notifications) {
      const template = notification.template;
      if (!groups.has(template)) {
        groups.set(template, []);
      }
      groups.get(template)!.push(notification);
    }

    return groups;
  }

  /**
   * Build plain text digest body
   */
  private buildDigestBody(groups: Map<string, Notification[]>): string {
    let body = 'Your notification digest:\n\n';

    for (const [template, notifications] of groups) {
      body += `${template.toUpperCase().replace(/_/g, ' ')} (${notifications.length}):\n`;

      for (const notification of notifications) {
        const time = new Date(notification.createdAt).toLocaleString();
        body += `  - ${time}: ${JSON.stringify(notification.data)}\n`;
      }

      body += '\n';
    }

    return body;
  }

  /**
   * Build HTML digest body
   */
  private buildDigestHtml(groups: Map<string, Notification[]>): string {
    let html = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Your Notification Digest</h1>
    `;

    for (const [template, notifications] of groups) {
      html += `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #666; border-bottom: 2px solid #eee; padding-bottom: 10px;">
            ${template.toUpperCase().replace(/_/g, ' ')} (${notifications.length})
          </h2>
          <ul style="list-style: none; padding: 0;">
      `;

      for (const notification of notifications) {
        const time = new Date(notification.createdAt).toLocaleString();
        html += `
          <li style="padding: 10px; margin: 5px 0; background: #f9f9f9; border-left: 3px solid #4CAF50;">
            <div style="color: #999; font-size: 12px;">${time}</div>
            <div style="margin-top: 5px;">${this.formatNotificationData(notification.data)}</div>
          </li>
        `;
      }

      html += `
          </ul>
        </div>
      `;
    }

    html += `
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Format notification data for display
   */
  private formatNotificationData(data: Record<string, unknown>): string {
    const formatted: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      formatted.push(
        `<strong>${key}:</strong> ${value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
      );
    }

    return formatted.join('<br>');
  }

  /**
   * Mark digest as sent
   */
  private async markDigestAsSent(digestId: string): Promise<void> {
    const supabase = getSupabaseAdminClient();

    await supabase
      .from('notification_digests')
      .update({
        sent_at: new Date().toISOString(),
      })
      .eq('id', digestId);
  }

  /**
   * Link notifications to digest
   */
  private async linkNotificationsToDigest(
    digestId: string,
    notificationIds: string[],
  ): Promise<void> {
    const supabase = getSupabaseAdminClient();

    await supabase
      .from('notifications')
      .update({
        digest_id: digestId,
        status: 'sent',
      })
      .in('id', notificationIds);
  }

  /**
   * Get user digests
   */
  async getUserDigests(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<DigestPayload[]> {
    const supabase = getSupabaseAdminClient();
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await supabase
      .from('notification_digests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      return [];
    }

    // Convert to DigestPayload
    const digests: DigestPayload[] = [];

    for (const row of data) {
      // Get notifications for this digest
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('digest_id', row.id);

      if (notifications) {
        digests.push({
          userId: row.user_id,
          notifications: notifications.map((n) => this.rowToNotification(n)),
          period: {
            start: row.period_start,
            end: row.period_end,
          },
          frequency: row.frequency,
        });
      }
    }

    return digests;
  }

  /**
   * Get digest statistics
   */
  async getDigestStats(userId?: string): Promise<{
    totalDigests: number;
    dailyDigests: number;
    weeklyDigests: number;
    averageNotificationsPerDigest: number;
  }> {
    const supabase = getSupabaseAdminClient();

    let query = supabase.from('notification_digests').select('*', { count: 'exact' });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { count: total } = await query;

    const { count: daily } = await supabase
      .from('notification_digests')
      .select('*', { count: 'exact', head: true })
      .eq('frequency', 'daily')
      .eq('user_id', userId || '');

    const { count: weekly } = await supabase
      .from('notification_digests')
      .select('*', { count: 'exact', head: true })
      .eq('frequency', 'weekly')
      .eq('user_id', userId || '');

    // Calculate average notifications per digest
    const { data: digests } = await supabase
      .from('notification_digests')
      .select('notification_ids')
      .eq('user_id', userId || '');

    let totalNotifications = 0;
    if (digests) {
      for (const digest of digests) {
        totalNotifications += (digest.notification_ids as string[]).length;
      }
    }

    const average = total ? totalNotifications / total : 0;

    return {
      totalDigests: total || 0,
      dailyDigests: daily || 0,
      weeklyDigests: weekly || 0,
      averageNotificationsPerDigest: Math.round(average * 10) / 10,
    };
  }

  /**
   * Convert database row to Notification
   */
  private rowToNotification(row: NotificationRow): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      template: row.template,
      data: row.data,
      priority: row.priority,
      status: row.status,
      scheduledAt: row.scheduled_at || undefined,
      sentAt: row.sent_at || undefined,
      deliveredAt: row.delivered_at || undefined,
      readAt: row.read_at || undefined,
      error: row.error || undefined,
      createdAt: row.created_at,
    };
  }
}
