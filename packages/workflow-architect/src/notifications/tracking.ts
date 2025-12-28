/**
 * Notification Tracker
 * Tracks notification opens, clicks, bounces, and provides analytics
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdminClient } from '../supabase/client';
import type {
  NotificationTrackingRow,
  TrackingPixelData,
  ClickTrackingData,
} from './types';

type TrackingEvent = 'open' | 'click' | 'bounce' | 'complaint';

interface TrackingEventData {
  notificationId: string;
  eventType: TrackingEvent;
  metadata?: Record<string, unknown>;
  userAgent?: string;
  ipAddress?: string;
}

export class NotificationTracker {
  /**
   * Track notification open event
   */
  async trackOpen(
    notificationId: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<boolean> {
    return this.trackEvent({
      notificationId,
      eventType: 'open',
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });
  }

  /**
   * Track notification click event
   */
  async trackClick(
    notificationId: string,
    link: string,
    linkIndex?: number,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<boolean> {
    return this.trackEvent({
      notificationId,
      eventType: 'click',
      metadata: {
        link,
        linkIndex: linkIndex || 0,
      },
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });
  }

  /**
   * Track bounce event
   */
  async trackBounce(
    notificationId: string,
    reason?: string,
    bounceType?: 'hard' | 'soft',
  ): Promise<boolean> {
    return this.trackEvent({
      notificationId,
      eventType: 'bounce',
      metadata: {
        reason,
        bounceType,
      },
    });
  }

  /**
   * Track complaint event
   */
  async trackComplaint(
    notificationId: string,
    reason?: string,
  ): Promise<boolean> {
    return this.trackEvent({
      notificationId,
      eventType: 'complaint',
      metadata: {
        reason,
      },
    });
  }

  /**
   * Track a generic event
   */
  private async trackEvent(data: TrackingEventData): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase.from('notification_tracking').insert({
      id: uuidv4(),
      notification_id: data.notificationId,
      event_type: data.eventType,
      metadata: data.metadata || {},
      user_agent: data.userAgent || null,
      ip_address: data.ipAddress || null,
    });

    return !error;
  }

  /**
   * Generate tracking pixel URL
   */
  generateTrackingPixelUrl(notificationId: string): string {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/notifications/track/open/${notificationId}`;
  }

  /**
   * Generate click tracking URL
   */
  generateClickTrackingUrl(
    notificationId: string,
    targetUrl: string,
    linkIndex: number = 0,
  ): string {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const encodedUrl = encodeURIComponent(targetUrl);
    return `${baseUrl}/api/notifications/track/click/${notificationId}?url=${encodedUrl}&index=${linkIndex}`;
  }

  /**
   * Get tracking data for a notification
   */
  async getTrackingData(notificationId: string): Promise<{
    opens: number;
    clicks: number;
    uniqueClicks: number;
    clickedLinks: Array<{ url: string; count: number }>;
    bounces: number;
    complaints: number;
    lastOpened?: string;
    lastClicked?: string;
  }> {
    const supabase = getSupabaseAdminClient();

    const { data: events, error } = await supabase
      .from('notification_tracking')
      .select('*')
      .eq('notification_id', notificationId);

    if (error || !events) {
      return {
        opens: 0,
        clicks: 0,
        uniqueClicks: 0,
        clickedLinks: [],
        bounces: 0,
        complaints: 0,
      };
    }

    const opens = events.filter((e) => e.event_type === 'open').length;
    const clicks = events.filter((e) => e.event_type === 'click').length;
    const bounces = events.filter((e) => e.event_type === 'bounce').length;
    const complaints = events.filter((e) => e.event_type === 'complaint').length;

    // Count unique clicks (by IP/user agent combination)
    const clickEvents = events.filter((e) => e.event_type === 'click');
    const uniqueClickSet = new Set(
      clickEvents.map((e) => `${e.ip_address || 'unknown'}-${e.user_agent || 'unknown'}`),
    );
    const uniqueClicks = uniqueClickSet.size;

    // Group clicked links
    const linkCounts = new Map<string, number>();
    for (const event of clickEvents) {
      const metadata = event.metadata as { link?: string };
      const link = metadata.link || 'unknown';
      linkCounts.set(link, (linkCounts.get(link) || 0) + 1);
    }

    const clickedLinks = Array.from(linkCounts.entries()).map(([url, count]) => ({
      url,
      count,
    }));

    // Get last events
    const openEvents = events
      .filter((e) => e.event_type === 'open')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const clickEventsOrdered = clickEvents.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return {
      opens,
      clicks,
      uniqueClicks,
      clickedLinks,
      bounces,
      complaints,
      lastOpened: openEvents[0]?.created_at,
      lastClicked: clickEventsOrdered[0]?.created_at,
    };
  }

  /**
   * Get aggregated analytics for a time period
   */
  async getAnalytics(options: {
    startDate: Date;
    endDate: Date;
    userId?: string;
    channel?: string;
  }): Promise<{
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  }> {
    const supabase = getSupabaseAdminClient();

    // Get notifications in period
    let notificationsQuery = supabase
      .from('notifications')
      .select('id, status')
      .gte('created_at', options.startDate.toISOString())
      .lte('created_at', options.endDate.toISOString());

    if (options.userId) {
      notificationsQuery = notificationsQuery.eq('user_id', options.userId);
    }

    if (options.channel) {
      notificationsQuery = notificationsQuery.eq('channel', options.channel);
    }

    const { data: notifications, error: notifError } = await notificationsQuery;

    if (notifError || !notifications) {
      return {
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        complaintRate: 0,
      };
    }

    const totalSent = notifications.filter((n) => n.status !== 'pending').length;
    const notificationIds = notifications.map((n) => n.id);

    if (notificationIds.length === 0) {
      return {
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        complaintRate: 0,
      };
    }

    // Get tracking events
    const { data: events } = await supabase
      .from('notification_tracking')
      .select('notification_id, event_type')
      .in('notification_id', notificationIds);

    if (!events) {
      return {
        totalSent,
        totalOpened: 0,
        totalClicked: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        complaintRate: 0,
      };
    }

    // Count unique opens and clicks
    const openedNotifications = new Set(
      events.filter((e) => e.event_type === 'open').map((e) => e.notification_id),
    );
    const clickedNotifications = new Set(
      events.filter((e) => e.event_type === 'click').map((e) => e.notification_id),
    );
    const bouncedNotifications = new Set(
      events.filter((e) => e.event_type === 'bounce').map((e) => e.notification_id),
    );
    const complaintNotifications = new Set(
      events.filter((e) => e.event_type === 'complaint').map((e) => e.notification_id),
    );

    const totalOpened = openedNotifications.size;
    const totalClicked = clickedNotifications.size;
    const totalBounced = bouncedNotifications.size;
    const totalComplaints = complaintNotifications.size;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
      clickRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
      bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
      complaintRate: totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0,
    };
  }

  /**
   * Get click heatmap (which links are clicked most)
   */
  async getClickHeatmap(options: {
    startDate: Date;
    endDate: Date;
    userId?: string;
  }): Promise<Array<{ url: string; clicks: number; uniqueClicks: number }>> {
    const supabase = getSupabaseAdminClient();

    // Get notifications in period
    let notificationsQuery = supabase
      .from('notifications')
      .select('id')
      .gte('created_at', options.startDate.toISOString())
      .lte('created_at', options.endDate.toISOString());

    if (options.userId) {
      notificationsQuery = notificationsQuery.eq('user_id', options.userId);
    }

    const { data: notifications } = await notificationsQuery;

    if (!notifications || notifications.length === 0) {
      return [];
    }

    const notificationIds = notifications.map((n) => n.id);

    // Get click events
    const { data: events } = await supabase
      .from('notification_tracking')
      .select('*')
      .in('notification_id', notificationIds)
      .eq('event_type', 'click');

    if (!events) {
      return [];
    }

    // Group by URL
    const urlStats = new Map<
      string,
      { clicks: number; uniqueUsers: Set<string> }
    >();

    for (const event of events) {
      const metadata = event.metadata as { link?: string };
      const url = metadata.link || 'unknown';
      const userKey = `${event.ip_address || 'unknown'}-${event.user_agent || 'unknown'}`;

      if (!urlStats.has(url)) {
        urlStats.set(url, { clicks: 0, uniqueUsers: new Set() });
      }

      const stats = urlStats.get(url)!;
      stats.clicks++;
      stats.uniqueUsers.add(userKey);
    }

    return Array.from(urlStats.entries())
      .map(([url, stats]) => ({
        url,
        clicks: stats.clicks,
        uniqueClicks: stats.uniqueUsers.size,
      }))
      .sort((a, b) => b.clicks - a.clicks);
  }

  /**
   * Get engagement timeline
   */
  async getEngagementTimeline(options: {
    notificationId: string;
  }): Promise<
    Array<{
      timestamp: string;
      eventType: TrackingEvent;
      metadata?: Record<string, unknown>;
    }>
  > {
    const supabase = getSupabaseAdminClient();

    const { data: events, error } = await supabase
      .from('notification_tracking')
      .select('*')
      .eq('notification_id', options.notificationId)
      .order('created_at', { ascending: true });

    if (error || !events) {
      return [];
    }

    return events.map((event) => ({
      timestamp: event.created_at,
      eventType: event.event_type as TrackingEvent,
      metadata: event.metadata as Record<string, unknown>,
    }));
  }

  /**
   * Clean up old tracking data
   */
  async cleanupOldTracking(daysToKeep: number = 90): Promise<number> {
    const supabase = getSupabaseAdminClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error, count } = await supabase
      .from('notification_tracking')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    return error ? 0 : count || 0;
  }

  /**
   * Get top performing notifications
   */
  async getTopPerformingNotifications(options: {
    startDate: Date;
    endDate: Date;
    limit?: number;
    metric?: 'opens' | 'clicks' | 'engagement';
  }): Promise<
    Array<{
      notificationId: string;
      opens: number;
      clicks: number;
      engagementScore: number;
    }>
  > {
    const supabase = getSupabaseAdminClient();
    const limit = options.limit || 10;

    // Get notifications in period
    const { data: notifications } = await supabase
      .from('notifications')
      .select('id')
      .gte('created_at', options.startDate.toISOString())
      .lte('created_at', options.endDate.toISOString())
      .neq('status', 'pending');

    if (!notifications || notifications.length === 0) {
      return [];
    }

    const notificationIds = notifications.map((n) => n.id);

    // Get tracking events
    const { data: events } = await supabase
      .from('notification_tracking')
      .select('notification_id, event_type')
      .in('notification_id', notificationIds);

    if (!events) {
      return [];
    }

    // Calculate metrics for each notification
    const metrics = new Map<string, { opens: number; clicks: number }>();

    for (const event of events) {
      if (!metrics.has(event.notification_id)) {
        metrics.set(event.notification_id, { opens: 0, clicks: 0 });
      }

      const metric = metrics.get(event.notification_id)!;
      if (event.event_type === 'open') {
        metric.opens++;
      } else if (event.event_type === 'click') {
        metric.clicks++;
      }
    }

    // Convert to array and calculate engagement score
    const results = Array.from(metrics.entries()).map(([notificationId, metric]) => ({
      notificationId,
      opens: metric.opens,
      clicks: metric.clicks,
      engagementScore: metric.opens + metric.clicks * 2, // Clicks worth 2x opens
    }));

    // Sort by selected metric
    const metric = options.metric || 'engagement';
    results.sort((a, b) => {
      if (metric === 'opens') return b.opens - a.opens;
      if (metric === 'clicks') return b.clicks - a.clicks;
      return b.engagementScore - a.engagementScore;
    });

    return results.slice(0, limit);
  }
}
