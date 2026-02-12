/**
 * Preferences Manager
 * Manages user notification preferences including channels, quiet hours, and digests
 */

import { getSupabaseAdminClient } from '../supabase/client';
import type {
  UserPreferences,
  UserPreferencesRow,
  NotificationChannel,
} from './types';

export class PreferencesManager {
  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Return default preferences if not found
      return this.getDefaultPreferences(userId);
    }

    return this.rowToPreferences(data);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<Omit<UserPreferences, 'userId'>>,
  ): Promise<UserPreferences> {
    const supabase = getSupabaseAdminClient();

    // Convert to database format
    const update: Partial<UserPreferencesRow> = {};

    if (preferences.channels) {
      update.channels = preferences.channels;
    }

    if (preferences.quietHours) {
      update.quiet_hours_start = preferences.quietHours.start;
      update.quiet_hours_end = preferences.quietHours.end;
    }

    if (preferences.digest) {
      update.digest_enabled = preferences.digest.enabled;
      update.digest_frequency = preferences.digest.frequency;
    }

    if (preferences.timezone) {
      update.timezone = preferences.timezone;
    }

    // Upsert preferences
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: userId,
          ...update,
        },
        {
          onConflict: 'user_id',
        },
      )
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update preferences: ${error?.message}`);
    }

    return this.rowToPreferences(data);
  }

  /**
   * Enable a notification channel for user
   */
  async enableChannel(userId: string, channel: NotificationChannel): Promise<boolean> {
    const preferences = await this.getPreferences(userId);
    preferences.channels[channel] = true;

    await this.updatePreferences(userId, { channels: preferences.channels });
    return true;
  }

  /**
   * Disable a notification channel for user
   */
  async disableChannel(userId: string, channel: NotificationChannel): Promise<boolean> {
    const preferences = await this.getPreferences(userId);
    preferences.channels[channel] = false;

    await this.updatePreferences(userId, { channels: preferences.channels });
    return true;
  }

  /**
   * Set quiet hours for user
   */
  async setQuietHours(
    userId: string,
    start: string,
    end: string,
  ): Promise<UserPreferences> {
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      throw new Error('Invalid time format. Use HH:MM format');
    }

    return this.updatePreferences(userId, {
      quietHours: { start, end },
    });
  }

  /**
   * Remove quiet hours for user
   */
  async removeQuietHours(userId: string): Promise<UserPreferences> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .update({
        quiet_hours_start: null,
        quiet_hours_end: null,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to remove quiet hours: ${error?.message}`);
    }

    return this.rowToPreferences(data);
  }

  /**
   * Enable digest notifications
   */
  async enableDigest(
    userId: string,
    frequency: 'daily' | 'weekly',
  ): Promise<UserPreferences> {
    return this.updatePreferences(userId, {
      digest: { enabled: true, frequency },
    });
  }

  /**
   * Disable digest notifications
   */
  async disableDigest(userId: string): Promise<UserPreferences> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .update({
        digest_enabled: false,
        digest_frequency: null,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to disable digest: ${error?.message}`);
    }

    return this.rowToPreferences(data);
  }

  /**
   * Set user timezone
   */
  async setTimezone(userId: string, timezone: string): Promise<UserPreferences> {
    // Validate timezone (basic check)
    if (!this.isValidTimezone(timezone)) {
      throw new Error('Invalid timezone');
    }

    return this.updatePreferences(userId, { timezone });
  }

  /**
   * Check if user is in quiet hours
   */
  async isInQuietHours(userId: string, time?: Date): Promise<boolean> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.quietHours) {
      return false;
    }

    const checkTime = time || new Date();

    // Convert to user's timezone
    const userTime = new Date(
      checkTime.toLocaleString('en-US', { timeZone: preferences.timezone }),
    );

    const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();

    const [startHours, startMinutes] = preferences.quietHours.start.split(':').map(Number);
    const [endHours, endMinutes] = preferences.quietHours.end.split(':').map(Number);

    const startMinutesTotal = startHours * 60 + startMinutes;
    const endMinutesTotal = endHours * 60 + endMinutes;

    // Handle quiet hours spanning midnight
    if (startMinutesTotal <= endMinutesTotal) {
      return currentMinutes >= startMinutesTotal && currentMinutes < endMinutesTotal;
    } else {
      return currentMinutes >= startMinutesTotal || currentMinutes < endMinutesTotal;
    }
  }

  /**
   * Get all users with a specific channel enabled
   */
  async getUsersWithChannelEnabled(
    channel: NotificationChannel,
  ): Promise<string[]> {
    const supabase = getSupabaseAdminClient();

    // Query using JSONB operator
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('user_id')
      .filter('channels->>email', 'eq', 'true');

    if (error || !data) {
      return [];
    }

    return data.map((row) => row.user_id);
  }

  /**
   * Get all users with digest enabled
   */
  async getUsersWithDigestEnabled(
    frequency?: 'daily' | 'weekly',
  ): Promise<string[]> {
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('user_notification_preferences')
      .select('user_id')
      .eq('digest_enabled', true);

    if (frequency) {
      query = query.eq('digest_frequency', frequency);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map((row) => row.user_id);
  }

  /**
   * Reset preferences to defaults
   */
  async resetToDefaults(userId: string): Promise<UserPreferences> {
    const supabase = getSupabaseAdminClient();

    const defaults = this.getDefaultPreferences(userId);

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: userId,
          channels: defaults.channels,
          quiet_hours_start: null,
          quiet_hours_end: null,
          digest_enabled: false,
          digest_frequency: null,
          timezone: defaults.timezone,
        },
        {
          onConflict: 'user_id',
        },
      )
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to reset preferences: ${error?.message}`);
    }

    return this.rowToPreferences(data);
  }

  /**
   * Delete user preferences
   */
  async deletePreferences(userId: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
      .from('user_notification_preferences')
      .delete()
      .eq('user_id', userId);

    return !error;
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      channels: {
        email: true,
        slack: false,
        discord: false,
        sms: false,
        push: true,
        webhook: false,
      },
      timezone: 'UTC',
    };
  }

  /**
   * Convert database row to UserPreferences
   */
  private rowToPreferences(row: UserPreferencesRow): UserPreferences {
    const preferences: UserPreferences = {
      userId: row.user_id,
      channels: row.channels as Record<NotificationChannel, boolean>,
      timezone: row.timezone,
    };

    if (row.quiet_hours_start && row.quiet_hours_end) {
      preferences.quietHours = {
        start: row.quiet_hours_start,
        end: row.quiet_hours_end,
      };
    }

    if (row.digest_enabled && row.digest_frequency) {
      preferences.digest = {
        enabled: row.digest_enabled,
        frequency: row.digest_frequency,
      };
    }

    return preferences;
  }

  /**
   * Validate timezone string
   */
  private isValidTimezone(timezone: string): boolean {
    try {
      // Try to format a date with the timezone
      new Date().toLocaleString('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get statistics about user preferences
   */
  async getPreferencesStats(): Promise<{
    totalUsers: number;
    channelStats: Record<NotificationChannel, number>;
    digestEnabled: number;
    quietHoursEnabled: number;
  }> {
    const supabase = getSupabaseAdminClient();

    const { count: totalUsers } = await supabase
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true });

    const { count: digestEnabled } = await supabase
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('digest_enabled', true);

    const { count: quietHoursEnabled } = await supabase
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true })
      .not('quiet_hours_start', 'is', null);

    // For channel stats, we'd need to query JSONB which is more complex
    // This is a simplified version
    const channelStats: Record<NotificationChannel, number> = {
      email: 0,
      slack: 0,
      discord: 0,
      sms: 0,
      push: 0,
      webhook: 0,
    };

    return {
      totalUsers: totalUsers || 0,
      channelStats,
      digestEnabled: digestEnabled || 0,
      quietHoursEnabled: quietHoursEnabled || 0,
    };
  }
}
