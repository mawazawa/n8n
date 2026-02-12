/**
 * Push Notification Channel
 * Supports Web Push notifications using VAPID
 */

import * as webpush from 'web-push';
import type {
  INotificationChannel,
  NotificationChannel,
  PushConfig,
  PushPayload,
} from '../types';
import { getSupabaseAdminClient } from '../../supabase/client';

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class PushChannel implements INotificationChannel {
  private config: PushConfig | null = null;
  private initialized = false;

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize Push notification configuration
   */
  private async initializeConfig(): Promise<void> {
    const config = await this.loadConfig();
    if (config) {
      this.config = config;
      this.setupWebPush();
    }
  }

  /**
   * Load Push configuration from database
   */
  private async loadConfig(): Promise<PushConfig | null> {
    try {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('channel_configs')
        .select('config')
        .eq('channel', 'push')
        .eq('enabled', true)
        .single();

      if (error || !data) {
        console.warn('Push channel not configured');
        return null;
      }

      const config = data.config as Partial<PushConfig>;

      return {
        vapidPublicKey: config.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || '',
        vapidPrivateKey: config.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY || '',
        subject: config.subject || process.env.VAPID_SUBJECT || 'mailto:admin@workflow-architect.dev',
      };
    } catch (error) {
      console.error('Failed to load Push config:', error);
      return null;
    }
  }

  /**
   * Setup web-push library
   */
  private setupWebPush(): void {
    if (!this.config || this.initialized) return;

    webpush.setVapidDetails(
      this.config.subject,
      this.config.vapidPublicKey,
      this.config.vapidPrivateKey,
    );

    this.initialized = true;
  }

  /**
   * Send a push notification
   */
  async send(
    payload: PushPayload & { subscription?: PushSubscription; userId?: string },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.config || !this.initialized) {
        await this.initializeConfig();
        if (!this.config || !this.initialized) {
          return { success: false, error: 'Push channel not configured' };
        }
      }

      // Get subscription from database if userId provided
      let subscription = payload.subscription;
      if (!subscription && payload.userId) {
        const subscriptions = await this.getUserSubscriptions(payload.userId);
        if (subscriptions.length === 0) {
          return { success: false, error: 'No push subscriptions found for user' };
        }
        // Send to first subscription (could be extended to send to all)
        subscription = subscriptions[0];
      }

      if (!subscription) {
        return { success: false, error: 'No push subscription provided' };
      }

      // Build notification payload
      const notificationPayload = {
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        data: payload.data,
        actions: payload.actions,
        tag: payload.tag,
        requireInteraction: payload.requireInteraction,
      };

      // Send push notification
      const result = await webpush.sendNotification(
        subscription,
        JSON.stringify(notificationPayload),
      );

      return {
        success: result.statusCode >= 200 && result.statusCode < 300,
        messageId: result.headers?.location,
      };
    } catch (error) {
      console.error('Push send error:', error);

      // Handle specific push errors
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const pushError = error as { statusCode: number; body?: string };
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          // Subscription expired or invalid - should remove from database
          if (payload.subscription) {
            await this.removeSubscription(payload.subscription.endpoint);
          }
          return { success: false, error: 'Subscription expired or invalid' };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send push notification to all user's subscriptions
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<{ success: boolean; sent: number; failed: number }> {
    const subscriptions = await this.getUserSubscriptions(userId);

    if (subscriptions.length === 0) {
      return { success: false, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    // Send to all subscriptions
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await this.send({ ...payload, subscription });
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      }),
    );

    return { success: sent > 0, sent, failed };
  }

  /**
   * Get user's push subscriptions from database
   */
  private async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    }));
  }

  /**
   * Save push subscription to database
   */
  async saveSubscription(
    userId: string,
    subscription: PushSubscription,
    userAgent?: string,
  ): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase.from('push_subscriptions').insert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent,
    });

    return !error;
  }

  /**
   * Remove push subscription from database
   */
  async removeSubscription(endpoint: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    return !error;
  }

  /**
   * Send bulk push notifications
   */
  async sendBulk(
    userIds: string[],
    payload: PushPayload,
  ): Promise<{ success: boolean; totalSent: number; totalFailed: number }> {
    let totalSent = 0;
    let totalFailed = 0;

    // Process in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (userId) => {
          const result = await this.sendToUser(userId, payload);
          totalSent += result.sent;
          totalFailed += result.failed;
        }),
      );
    }

    return {
      success: totalSent > 0,
      totalSent,
      totalFailed,
    };
  }

  /**
   * Create notification with action buttons
   */
  createActionNotification(options: {
    title: string;
    body: string;
    actions: Array<{ action: string; title: string; icon?: string }>;
    data?: Record<string, unknown>;
  }): PushPayload {
    return {
      title: options.title,
      body: options.body,
      actions: options.actions.map((a) => ({
        action: a.action,
        title: a.title,
      })),
      data: options.data,
      requireInteraction: true,
    };
  }

  /**
   * Validate push configuration
   */
  validateConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const pushConfig = config as Partial<PushConfig>;

    return !!(
      pushConfig.vapidPublicKey &&
      pushConfig.vapidPrivateKey &&
      pushConfig.subject
    );
  }

  /**
   * Get channel type
   */
  getChannelType(): NotificationChannel {
    return 'push';
  }

  /**
   * Generate VAPID keys (utility method for setup)
   */
  static generateVapidKeys(): { publicKey: string; privateKey: string } {
    return webpush.generateVAPIDKeys();
  }

  /**
   * Test push configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config || !this.initialized) {
        await this.initializeConfig();
        if (!this.config || !this.initialized) {
          return { success: false, error: 'Push channel not configured' };
        }
      }

      // Configuration is valid if we got here
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get subscription count for a user
   */
  async getUserSubscriptionCount(userId: string): Promise<number> {
    const supabase = getSupabaseAdminClient();

    const { count, error } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return error ? 0 : count || 0;
  }

  /**
   * Clean up expired subscriptions
   */
  async cleanupExpiredSubscriptions(): Promise<number> {
    const supabase = getSupabaseAdminClient();

    // Get all subscriptions
    const { data, error } = await supabase.from('push_subscriptions').select('*');

    if (error || !data) {
      return 0;
    }

    let removed = 0;

    // Test each subscription
    for (const sub of data) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        // Try to send an empty notification to test
        await webpush.sendNotification(subscription, JSON.stringify({ test: true }));
      } catch (error) {
        // If error indicates subscription is invalid, remove it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const pushError = error as { statusCode: number };
          if (pushError.statusCode === 410 || pushError.statusCode === 404) {
            await this.removeSubscription(sub.endpoint);
            removed++;
          }
        }
      }
    }

    return removed;
  }
}
