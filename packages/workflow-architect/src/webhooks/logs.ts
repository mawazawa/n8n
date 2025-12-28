/**
 * Webhook Logger
 * Delivery logging, search, and retention management
 */

import { getSupabaseClient } from '../supabase/client.js';
import type { WebhookDelivery, DeliveryLogOptions, DeliveryStatus } from './types.js';

export interface LogEntry {
  id: string;
  webhookId: string;
  webhookName: string;
  event: string;
  status: DeliveryStatus;
  statusCode?: number;
  error?: string;
  responseTime?: number;
  attempts: number;
  timestamp: Date;
}

export interface LogSearchOptions extends DeliveryLogOptions {
  webhookIds?: string[];
  events?: string[];
  searchTerm?: string;
  minResponseTime?: number;
  maxResponseTime?: number;
}

export class WebhookLogger {
  private supabase = getSupabaseClient();
  private retentionDays = 90; // Default retention period

  /**
   * Set retention period in days
   */
  setRetentionPeriod(days: number): void {
    if (days < 1) {
      throw new Error('Retention period must be at least 1 day');
    }
    this.retentionDays = days;
  }

  /**
   * Log a webhook delivery
   */
  async logDelivery(delivery: WebhookDelivery): Promise<void> {
    // Delivery is already logged in the database by DeliveryManager
    // This method can be used for additional logging (e.g., external logging service)

    // For now, this is a no-op as deliveries are logged during creation
    // Can be extended to log to external services like CloudWatch, Datadog, etc.
  }

  /**
   * Get log entries for a webhook
   */
  async getLog(webhookId: string, options?: DeliveryLogOptions): Promise<{
    entries: LogEntry[];
    total: number;
  }> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    // Build query
    let query = this.supabase
      .from('webhook_deliveries')
      .select('*, webhooks!inner(name)', { count: 'exact' })
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }

    if (options?.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get logs: ${error.message}`);
    }

    const entries = (data || []).map(this.mapToLogEntry);

    return {
      entries,
      total: count || 0,
    };
  }

  /**
   * Search logs across multiple webhooks
   */
  async search(userId: string, options: LogSearchOptions): Promise<{
    entries: LogEntry[];
    total: number;
  }> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    // Build query
    let query = this.supabase
      .from('webhook_deliveries')
      .select('*, webhooks!inner(name, user_id)', { count: 'exact' })
      .eq('webhooks.user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (options.webhookIds && options.webhookIds.length > 0) {
      query = query.in('webhook_id', options.webhookIds);
    }

    if (options.events && options.events.length > 0) {
      query = query.in('event', options.events);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }

    if (options.minResponseTime !== undefined) {
      query = query.gte('response_time', options.minResponseTime);
    }

    if (options.maxResponseTime !== undefined) {
      query = query.lte('response_time', options.maxResponseTime);
    }

    // Text search in error messages
    if (options.searchTerm) {
      query = query.ilike('error', `%${options.searchTerm}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search logs: ${error.message}`);
    }

    const entries = (data || []).map(this.mapToLogEntry);

    return {
      entries,
      total: count || 0,
    };
  }

  /**
   * Get recent errors across all webhooks for a user
   */
  async getRecentErrors(userId: string, limit = 50): Promise<LogEntry[]> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*, webhooks!inner(name, user_id)')
      .eq('webhooks.user_id', userId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent errors: ${error.message}`);
    }

    return (data || []).map(this.mapToLogEntry);
  }

  /**
   * Get log statistics for a time period
   */
  async getStats(webhookId: string, startDate: Date, endDate: Date): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageResponseTime: number;
    statusBreakdown: Record<DeliveryStatus, number>;
    eventBreakdown: Record<string, number>;
  }> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('status, event, response_time')
      .eq('webhook_id', webhookId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw new Error(`Failed to get log stats: ${error.message}`);
    }

    const deliveries = data || [];
    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter((d) => d.status === 'delivered').length;
    const failedDeliveries = deliveries.filter((d) => d.status === 'failed').length;

    const responseTimes = deliveries
      .filter((d) => d.response_time !== null)
      .map((d) => d.response_time as number);
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const delivery of deliveries) {
      statusBreakdown[delivery.status] = (statusBreakdown[delivery.status] || 0) + 1;
    }

    // Event breakdown
    const eventBreakdown: Record<string, number> = {};
    for (const delivery of deliveries) {
      eventBreakdown[delivery.event] = (eventBreakdown[delivery.event] || 0) + 1;
    }

    return {
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      averageResponseTime: Math.round(averageResponseTime),
      statusBreakdown: statusBreakdown as Record<DeliveryStatus, number>,
      eventBreakdown,
    };
  }

  /**
   * Export logs to JSON
   */
  async exportLogs(webhookId: string, options?: DeliveryLogOptions): Promise<string> {
    const { entries } = await this.getLog(webhookId, {
      ...options,
      limit: 10000, // Max export size
    });

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Clean up old logs (based on retention period)
   */
  async cleanup(): Promise<{ deleted: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const { error } = await this.supabase
      .from('webhook_deliveries')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to clean up logs: ${error.message}`);
    }

    // Note: Can't get count from delete, would need to count first
    return { deleted: 0 };
  }

  /**
   * Get log entry by ID
   */
  async getLogEntry(deliveryId: string): Promise<LogEntry | null> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*, webhooks!inner(name)')
      .eq('id', deliveryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get log entry: ${error.message}`);
    }

    return this.mapToLogEntry(data);
  }

  /**
   * Get delivery timeline (for debugging)
   */
  async getDeliveryTimeline(deliveryId: string): Promise<{
    created: Date;
    attempts: Array<{ timestamp: Date; result: string }>;
    completed?: Date;
  }> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (error) {
      throw new Error(`Failed to get delivery timeline: ${error.message}`);
    }

    // Build timeline from available data
    const timeline = {
      created: new Date(data.created_at),
      attempts: [
        {
          timestamp: new Date(data.created_at),
          result: data.status === 'delivered' ? 'success' : 'failed',
        },
      ],
      completed: data.delivered_at ? new Date(data.delivered_at) : undefined,
    };

    return timeline;
  }

  /**
   * Get aggregated metrics for dashboards
   */
  async getMetrics(userId: string, period: 'hour' | 'day' | 'week' | 'month'): Promise<{
    deliveryCount: number;
    successRate: number;
    averageResponseTime: number;
    topEvents: Array<{ event: string; count: number }>;
    topFailures: Array<{ error: string; count: number }>;
  }> {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    // Get deliveries in period
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('status, event, error, response_time, webhooks!inner(user_id)')
      .eq('webhooks.user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }

    const deliveries = data || [];
    const deliveryCount = deliveries.length;
    const successCount = deliveries.filter((d) => d.status === 'delivered').length;
    const successRate = deliveryCount > 0 ? (successCount / deliveryCount) * 100 : 0;

    const responseTimes = deliveries
      .filter((d) => d.response_time !== null)
      .map((d) => d.response_time as number);
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Top events
    const eventCounts = new Map<string, number>();
    for (const delivery of deliveries) {
      eventCounts.set(delivery.event, (eventCounts.get(delivery.event) || 0) + 1);
    }
    const topEvents = Array.from(eventCounts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top failures
    const errorCounts = new Map<string, number>();
    for (const delivery of deliveries.filter((d) => d.error)) {
      const error = delivery.error as string;
      errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
    }
    const topFailures = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      deliveryCount,
      successRate: Math.round(successRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime),
      topEvents,
      topFailures,
    };
  }

  /**
   * Map database row to log entry
   */
  private mapToLogEntry(data: Record<string, unknown>): LogEntry {
    const webhooks = data.webhooks as Record<string, unknown>;

    return {
      id: data.id as string,
      webhookId: data.webhook_id as string,
      webhookName: webhooks?.name as string,
      event: data.event as string,
      status: data.status as DeliveryStatus,
      statusCode: data.response_status_code as number | undefined,
      error: data.error as string | undefined,
      responseTime: data.response_time as number | undefined,
      attempts: data.attempts as number,
      timestamp: new Date(data.created_at as string),
    };
  }
}

/**
 * Create a webhook logger instance
 */
export function createWebhookLogger(retentionDays = 90): WebhookLogger {
  const logger = new WebhookLogger();
  logger.setRetentionPeriod(retentionDays);
  return logger;
}
