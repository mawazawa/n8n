/**
 * Audit Dashboard
 * Provide analytics and statistics for audit dashboard visualization
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  DashboardStats,
  TimelineData,
  ActorStats,
  ResourceStats,
  AuditEventType,
  AuditSeverity,
  ResourceType,
} from './types.js';

export interface DashboardConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export class AuditDashboard {
  private supabase: SupabaseClient;

  constructor(config: DashboardConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(startDate: string, endDate: string): Promise<DashboardStats> {
    const period = { start: startDate, end: endDate };

    // Fetch all events in the period
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);

    if (error) {
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }

    const allEvents = events ?? [];
    const totalEvents = allEvents.length;

    // Events by severity
    const eventsBySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    for (const event of allEvents) {
      eventsBySeverity[event.severity as AuditSeverity]++;
    }

    // Events by type
    const eventsByType: Partial<Record<AuditEventType, number>> = {};
    for (const event of allEvents) {
      const type = event.event_type as AuditEventType;
      eventsByType[type] = (eventsByType[type] ?? 0) + 1;
    }

    // Top actors
    const actorCounts = new Map<string, { userId: string; email?: string; count: number }>();
    for (const event of allEvents) {
      const existing = actorCounts.get(event.actor_user_id);
      if (existing) {
        existing.count++;
      } else {
        actorCounts.set(event.actor_user_id, {
          userId: event.actor_user_id,
          email: event.actor_email ?? undefined,
          count: 1,
        });
      }
    }

    const topActors = Array.from(actorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top resources
    const resourceCounts = new Map<string, {
      type: ResourceType;
      id: string;
      name?: string;
      count: number;
    }>();

    for (const event of allEvents) {
      const key = `${event.resource_type}:${event.resource_id}`;
      const existing = resourceCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        resourceCounts.set(key, {
          type: event.resource_type as ResourceType,
          id: event.resource_id,
          name: event.resource_name ?? undefined,
          count: 1,
        });
      }
    }

    const topResources = Array.from(resourceCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Failure rate
    const failedEvents = allEvents.filter((e) => !e.success).length;
    const failureRate = totalEvents > 0 ? failedEvents / totalEvents : 0;

    // Average duration
    const eventsWithDuration = allEvents.filter((e) => e.duration !== null);
    const averageDuration = eventsWithDuration.length > 0
      ? eventsWithDuration.reduce((sum, e) => sum + (e.duration ?? 0), 0) / eventsWithDuration.length
      : 0;

    // Security events
    const securityEvents = allEvents.filter((e) =>
      (e.event_type as string).startsWith('security.') ||
      e.event_type === 'user.login_failed' ||
      (e.event_type as string).startsWith('permission.'),
    ).length;

    // Authentication events
    const authenticationEvents = allEvents.filter((e) =>
      e.event_type === 'user.login' ||
      e.event_type === 'user.login_failed' ||
      e.event_type === 'user.logout',
    ).length;

    return {
      period,
      totalEvents,
      eventsBySeverity,
      eventsByType: eventsByType as Record<AuditEventType, number>,
      topActors,
      topResources,
      failureRate,
      averageDuration,
      securityEvents,
      authenticationEvents,
    };
  }

  /**
   * Get activity timeline data
   */
  async getActivityTimeline(
    startDate: string,
    endDate: string,
    interval: 'hour' | 'day' | 'week' | 'month' = 'day',
  ): Promise<TimelineData> {
    // Determine the time bucket based on interval
    let timeBucket: string;
    switch (interval) {
      case 'hour':
        timeBucket = 'hour';
        break;
      case 'day':
        timeBucket = 'day';
        break;
      case 'week':
        timeBucket = 'week';
        break;
      case 'month':
        timeBucket = 'month';
        break;
    }

    // Fetch events grouped by time bucket
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('timestamp, severity')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch timeline data: ${error.message}`);
    }

    // Group events by time bucket
    const buckets = new Map<string, {
      timestamp: string;
      count: number;
      severity: Record<AuditSeverity, number>;
    }>();

    for (const event of events ?? []) {
      const bucket = this.getBucketKey(event.timestamp, interval);

      if (!buckets.has(bucket)) {
        buckets.set(bucket, {
          timestamp: bucket,
          count: 0,
          severity: { info: 0, warning: 0, error: 0, critical: 0 },
        });
      }

      const bucketData = buckets.get(bucket)!;
      bucketData.count++;
      bucketData.severity[event.severity as AuditSeverity]++;
    }

    return {
      interval,
      dataPoints: Array.from(buckets.values()).sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      ),
    };
  }

  /**
   * Get actor statistics
   */
  async getTopActors(startDate: string, endDate: string, limit = 20): Promise<ActorStats[]> {
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);

    if (error) {
      throw new Error(`Failed to fetch actor stats: ${error.message}`);
    }

    // Group by actor
    const actorMap = new Map<string, {
      userId: string;
      email?: string;
      name?: string;
      totalEvents: number;
      eventsByType: Partial<Record<AuditEventType, number>>;
      lastActivity: string;
      failedEvents: number;
      criticalEvents: number;
    }>();

    for (const event of events ?? []) {
      if (!actorMap.has(event.actor_user_id)) {
        actorMap.set(event.actor_user_id, {
          userId: event.actor_user_id,
          email: event.actor_email ?? undefined,
          name: event.actor_name ?? undefined,
          totalEvents: 0,
          eventsByType: {},
          lastActivity: event.timestamp,
          failedEvents: 0,
          criticalEvents: 0,
        });
      }

      const actor = actorMap.get(event.actor_user_id)!;
      actor.totalEvents++;

      const eventType = event.event_type as AuditEventType;
      actor.eventsByType[eventType] = (actor.eventsByType[eventType] ?? 0) + 1;

      if (event.timestamp > actor.lastActivity) {
        actor.lastActivity = event.timestamp;
      }

      if (!event.success) {
        actor.failedEvents++;
      }

      if (event.severity === 'critical') {
        actor.criticalEvents++;
      }
    }

    // Calculate suspiciousActivityScore
    const actorStats: ActorStats[] = Array.from(actorMap.values()).map((actor) => {
      // Simple scoring: failed events * 10 + critical events * 5
      const suspiciousActivityScore = actor.failedEvents * 10 + actor.criticalEvents * 5;

      return {
        userId: actor.userId,
        email: actor.email,
        name: actor.name,
        totalEvents: actor.totalEvents,
        eventsByType: actor.eventsByType as Record<AuditEventType, number>,
        lastActivity: actor.lastActivity,
        suspiciousActivityScore,
      };
    });

    // Sort by total events and limit
    return actorStats
      .sort((a, b) => b.totalEvents - a.totalEvents)
      .slice(0, limit);
  }

  /**
   * Get resource statistics
   */
  async getResourceActivity(startDate: string, endDate: string, limit = 20): Promise<ResourceStats[]> {
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);

    if (error) {
      throw new Error(`Failed to fetch resource stats: ${error.message}`);
    }

    // Group by resource
    const resourceMap = new Map<string, {
      type: ResourceType;
      id: string;
      name?: string;
      totalAccess: number;
      uniqueActors: Set<string>;
      lastAccessed: string;
      modifications: number;
      eventsByType: Partial<Record<AuditEventType, number>>;
    }>();

    for (const event of events ?? []) {
      const key = `${event.resource_type}:${event.resource_id}`;

      if (!resourceMap.has(key)) {
        resourceMap.set(key, {
          type: event.resource_type as ResourceType,
          id: event.resource_id,
          name: event.resource_name ?? undefined,
          totalAccess: 0,
          uniqueActors: new Set(),
          lastAccessed: event.timestamp,
          modifications: 0,
          eventsByType: {},
        });
      }

      const resource = resourceMap.get(key)!;
      resource.totalAccess++;
      resource.uniqueActors.add(event.actor_user_id);

      const eventType = event.event_type as AuditEventType;
      resource.eventsByType[eventType] = (resource.eventsByType[eventType] ?? 0) + 1;

      if (event.timestamp > resource.lastAccessed) {
        resource.lastAccessed = event.timestamp;
      }

      if (event.action === 'update' || event.action === 'delete') {
        resource.modifications++;
      }
    }

    // Convert to ResourceStats
    const resourceStats: ResourceStats[] = Array.from(resourceMap.values()).map((resource) => ({
      type: resource.type,
      id: resource.id,
      name: resource.name,
      totalAccess: resource.totalAccess,
      uniqueActors: resource.uniqueActors.size,
      lastAccessed: resource.lastAccessed,
      modifications: resource.modifications,
      eventsByType: resource.eventsByType as Record<AuditEventType, number>,
    }));

    // Sort by total access and limit
    return resourceStats
      .sort((a, b) => b.totalAccess - a.totalAccess)
      .slice(0, limit);
  }

  /**
   * Get bucket key for timeline grouping
   */
  private getBucketKey(timestamp: string, interval: 'hour' | 'day' | 'week' | 'month'): string {
    const date = new Date(timestamp);

    switch (interval) {
      case 'hour':
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00:00Z`;
      case 'day':
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T00:00:00Z`;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
        return `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}T00:00:00Z`;
      }
      case 'month':
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;
    }
  }

  /**
   * Get failed events statistics
   */
  async getFailureStats(startDate: string, endDate: string): Promise<{
    totalFailed: number;
    failureRate: number;
    failedByType: Record<AuditEventType, number>;
    topErrors: Array<{ error: string; count: number }>;
  }> {
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);

    if (error) {
      throw new Error(`Failed to fetch failure stats: ${error.message}`);
    }

    const allEvents = events ?? [];
    const failedEvents = allEvents.filter((e) => !e.success);

    const totalFailed = failedEvents.length;
    const failureRate = allEvents.length > 0 ? totalFailed / allEvents.length : 0;

    // Failed by type
    const failedByType: Partial<Record<AuditEventType, number>> = {};
    for (const event of failedEvents) {
      const type = event.event_type as AuditEventType;
      failedByType[type] = (failedByType[type] ?? 0) + 1;
    }

    // Top errors
    const errorCounts = new Map<string, number>();
    for (const event of failedEvents) {
      if (event.error) {
        errorCounts.set(event.error, (errorCounts.get(event.error) ?? 0) + 1);
      }
    }

    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalFailed,
      failureRate,
      failedByType: failedByType as Record<AuditEventType, number>,
      topErrors,
    };
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStats(startDate: string, endDate: string): Promise<{
    averageDuration: number;
    medianDuration: number;
    p95Duration: number;
    p99Duration: number;
    slowestEvents: Array<{
      id: string;
      eventType: AuditEventType;
      duration: number;
      timestamp: string;
    }>;
  }> {
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('id, event_type, duration, timestamp')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .not('duration', 'is', null)
      .order('duration', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch performance stats: ${error.message}`);
    }

    const eventsWithDuration = (events ?? []).filter((e) => e.duration !== null);

    if (eventsWithDuration.length === 0) {
      return {
        averageDuration: 0,
        medianDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        slowestEvents: [],
      };
    }

    // Sort by duration
    const sortedDurations = [...eventsWithDuration].sort((a, b) => a.duration - b.duration);

    // Calculate statistics
    const averageDuration = sortedDurations.reduce((sum, e) => sum + e.duration, 0) / sortedDurations.length;
    const medianDuration = sortedDurations[Math.floor(sortedDurations.length / 2)].duration;
    const p95Duration = sortedDurations[Math.floor(sortedDurations.length * 0.95)].duration;
    const p99Duration = sortedDurations[Math.floor(sortedDurations.length * 0.99)].duration;

    const slowestEvents = eventsWithDuration.slice(0, 10).map((e) => ({
      id: e.id,
      eventType: e.event_type as AuditEventType,
      duration: e.duration,
      timestamp: e.timestamp,
    }));

    return {
      averageDuration,
      medianDuration,
      p95Duration,
      p99Duration,
      slowestEvents,
    };
  }
}
