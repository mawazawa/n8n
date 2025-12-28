/**
 * Notification Manager
 * Central notification management system coordinating channels, templates, and preferences
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdminClient } from '../supabase/client';
import type {
  Notification,
  NotificationChannel,
  NotificationPriority,
  NotificationRow,
  INotificationChannel,
  ScheduleOptions,
  BatchNotification,
  BatchSendResult,
} from './types';
import { TemplateManager } from './templates';
import { PreferencesManager } from './preferences';
import { EmailChannel } from './channels/email';
import { SlackChannel } from './channels/slack';
import { DiscordChannel } from './channels/discord';
import { SmsChannel } from './channels/sms';
import { PushChannel } from './channels/push';

interface SendNotificationOptions {
  userId: string;
  channel: NotificationChannel;
  template: string;
  data: Record<string, unknown>;
  priority?: NotificationPriority;
  scheduledAt?: Date;
}

export class NotificationManager {
  private channels: Map<NotificationChannel, INotificationChannel> = new Map();
  private templateManager: TemplateManager;
  private preferencesManager: PreferencesManager;
  private isProcessing = false;

  constructor() {
    this.templateManager = new TemplateManager();
    this.preferencesManager = new PreferencesManager();
    this.initializeChannels();
  }

  /**
   * Initialize all notification channels
   */
  private initializeChannels(): void {
    this.channels.set('email', new EmailChannel());
    this.channels.set('slack', new SlackChannel());
    this.channels.set('discord', new DiscordChannel());
    this.channels.set('sms', new SmsChannel());
    this.channels.set('push', new PushChannel());
  }

  /**
   * Send a notification
   */
  async send(options: SendNotificationOptions): Promise<{ id: string; sent: boolean }> {
    const {
      userId,
      channel,
      template,
      data,
      priority = 'normal',
      scheduledAt,
    } = options;

    // Check user preferences
    const preferences = await this.preferencesManager.getPreferences(userId);
    if (!preferences.channels[channel]) {
      throw new Error(`User has disabled ${channel} notifications`);
    }

    // Check if in quiet hours
    if (this.isInQuietHours(preferences.quietHours)) {
      // Schedule for after quiet hours if not already scheduled
      if (!scheduledAt && preferences.quietHours) {
        const nextAvailable = this.getNextAvailableTime(preferences.quietHours);
        return this.schedule({ userId, channel, template, data, priority }, nextAvailable);
      }
    }

    // Create notification record
    const notification = await this.createNotification({
      userId,
      channel,
      template,
      data,
      priority,
      scheduledAt: scheduledAt?.toISOString(),
    });

    // If scheduled, don't send immediately
    if (scheduledAt && scheduledAt > new Date()) {
      return { id: notification.id, sent: false };
    }

    // Send immediately
    const sent = await this.sendNotification(notification);
    return { id: notification.id, sent };
  }

  /**
   * Schedule a notification for later delivery
   */
  async schedule(
    notification: SendNotificationOptions,
    sendAt: Date,
  ): Promise<{ id: string; scheduledFor: string }> {
    const { userId, channel, template, data, priority = 'normal' } = notification;

    const created = await this.createNotification({
      userId,
      channel,
      template,
      data,
      priority,
      scheduledAt: sendAt.toISOString(),
    });

    return {
      id: created.id,
      scheduledFor: sendAt.toISOString(),
    };
  }

  /**
   * Cancel a scheduled notification
   */
  async cancel(id: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !notification) {
      return false;
    }

    if (notification.status !== 'pending') {
      throw new Error('Can only cancel pending notifications');
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    return !error;
  }

  /**
   * Send a batch of notifications
   */
  async sendBatch(notifications: BatchNotification[]): Promise<BatchSendResult> {
    const results: BatchSendResult = {
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (notif) => {
          try {
            // Determine channel based on user preferences
            const prefs = await this.preferencesManager.getPreferences(notif.userId);
            const channel = this.selectBestChannel(prefs.channels);

            await this.send({
              ...notif,
              channel,
            });
            results.successful++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              userId: notif.userId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }),
      );
    }

    return results;
  }

  /**
   * Process pending notifications
   * This should be called periodically (e.g., every minute)
   */
  async processPendingNotifications(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      const supabase = getSupabaseAdminClient();

      // Get ready notifications using database function
      const { data: notifications, error } = await supabase
        .rpc('get_ready_notifications', { max_count: 100 });

      if (error || !notifications) {
        throw error || new Error('No notifications returned');
      }

      // Process notifications
      for (const notif of notifications) {
        try {
          const notification = this.rowToNotification(notif as unknown as NotificationRow);
          await this.sendNotification(notification);
          processedCount++;
        } catch (error) {
          console.error(`Failed to send notification ${notif.id}:`, error);
          await this.markAsFailed(
            notif.id,
            error instanceof Error ? error.message : 'Unknown error',
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Create a notification record in the database
   */
  private async createNotification(params: {
    userId: string;
    channel: NotificationChannel;
    template: string;
    data: Record<string, unknown>;
    priority: NotificationPriority;
    scheduledAt?: string;
  }): Promise<Notification> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        id: uuidv4(),
        user_id: params.userId,
        channel: params.channel,
        template: params.template,
        data: params.data,
        priority: params.priority,
        status: 'pending',
        scheduled_at: params.scheduledAt || null,
      })
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to create notification');
    }

    return this.rowToNotification(data);
  }

  /**
   * Send a notification through the appropriate channel
   */
  private async sendNotification(notification: Notification): Promise<boolean> {
    const channel = this.channels.get(notification.channel);
    if (!channel) {
      throw new Error(`Channel ${notification.channel} not initialized`);
    }

    try {
      // Render template
      const rendered = await this.templateManager.render(
        notification.template,
        notification.data,
      );

      // Send through channel
      const result = await channel.send(rendered);

      if (result.success) {
        await this.markAsSent(notification.id, result.messageId);
        return true;
      } else {
        await this.markAsFailed(notification.id, result.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      await this.markAsFailed(
        notification.id,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return false;
    }
  }

  /**
   * Mark notification as sent
   */
  private async markAsSent(id: string, messageId?: string): Promise<void> {
    const supabase = getSupabaseAdminClient();

    await supabase
      .from('notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: messageId ? { messageId } : {},
      })
      .eq('id', id);
  }

  /**
   * Mark notification as failed
   */
  private async markAsFailed(id: string, error: string): Promise<void> {
    const supabase = getSupabaseAdminClient();

    await supabase
      .from('notifications')
      .update({
        status: 'failed',
        error,
      })
      .eq('id', id);
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(quietHours?: { start: string; end: string }): boolean {
    if (!quietHours) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHours, startMinutes] = quietHours.start.split(':').map(Number);
    const [endHours, endMinutes] = quietHours.end.split(':').map(Number);

    const startTime = startHours * 60 + startMinutes;
    const endTime = endHours * 60 + endMinutes;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  /**
   * Get next available time after quiet hours
   */
  private getNextAvailableTime(quietHours: { start: string; end: string }): Date {
    const now = new Date();
    const [endHours, endMinutes] = quietHours.end.split(':').map(Number);

    const nextAvailable = new Date(now);
    nextAvailable.setHours(endHours, endMinutes, 0, 0);

    // If end time already passed today, schedule for tomorrow
    if (nextAvailable <= now) {
      nextAvailable.setDate(nextAvailable.getDate() + 1);
    }

    return nextAvailable;
  }

  /**
   * Select best channel based on user preferences
   */
  private selectBestChannel(
    channels: Record<NotificationChannel, boolean>,
  ): NotificationChannel {
    // Priority order: push > email > slack > discord > sms > webhook
    const priority: NotificationChannel[] = [
      'push',
      'email',
      'slack',
      'discord',
      'sms',
      'webhook',
    ];

    for (const channel of priority) {
      if (channels[channel]) {
        return channel;
      }
    }

    return 'email'; // Default fallback
  }

  /**
   * Convert database row to Notification object
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

  /**
   * Get notification by ID
   */
  async getNotification(id: string): Promise<Notification | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.rowToNotification(data);
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    options: { limit?: number; offset?: number; status?: string } = {},
  ): Promise<Notification[]> {
    const supabase = getSupabaseAdminClient();
    const { limit = 50, offset = 0, status } = options;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.rowToNotification(row));
  }
}
