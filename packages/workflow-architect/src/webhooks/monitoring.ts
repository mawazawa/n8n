/**
 * Webhook Monitor
 * Delivery tracking, statistics, and alerting
 */

import { getSupabaseClient } from '../supabase/client.js';
import type { WebhookStats, WebhookDelivery, DeliveryLogOptions } from './types.js';

export interface AlertConfig {
  consecutiveFailures: number; // Alert after N consecutive failures
  onAlert?: (webhookId: string, stats: WebhookStats) => void | Promise<void>;
}

export class WebhookMonitor {
  private supabase = getSupabaseClient();
  private alertConfig?: AlertConfig;

  constructor(alertConfig?: AlertConfig) {
    this.alertConfig = alertConfig;
  }

  /**
   * Get webhook statistics
   */
  async getStats(webhookId: string, timeWindow?: { hours?: number; days?: number }): Promise<WebhookStats> {
    // Build interval string
    let interval = '24 hours'; // default
    if (timeWindow?.hours) {
      interval = `${timeWindow.hours} hours`;
    } else if (timeWindow?.days) {
      interval = `${timeWindow.days} days`;
    }

    // Call database function to get stats
    const { data, error } = await this.supabase
      .rpc('get_webhook_stats', {
        webhook_uuid: webhookId,
        time_window: interval,
      })
      .single();

    if (error) {
      throw new Error(`Failed to get webhook stats: ${error.message}`);
    }

    // Get last delivery time
    const { data: lastDelivery } = await this.supabase
      .from('webhook_deliveries')
      .select('created_at')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const stats: WebhookStats = {
      webhookId,
      totalDeliveries: Number(data.total_deliveries) || 0,
      successfulDeliveries: Number(data.successful_deliveries) || 0,
      failedDeliveries: Number(data.failed_deliveries) || 0,
      successRate: Number(data.success_rate) || 0,
      averageResponseTime: Number(data.avg_response_time) || 0,
      lastDelivery: lastDelivery ? new Date(lastDelivery.created_at) : undefined,
      consecutiveFailures: Number(data.consecutive_failures) || 0,
    };

    // Check if we should alert
    if (this.alertConfig && stats.consecutiveFailures >= this.alertConfig.consecutiveFailures) {
      await this.alertConfig.onAlert?.(webhookId, stats);
    }

    return stats;
  }

  /**
   * Get delivery history for a webhook
   */
  async getDeliveryHistory(webhookId: string, options?: DeliveryLogOptions): Promise<{
    deliveries: WebhookDelivery[];
    total: number;
  }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // Build query
    let query = this.supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact' })
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
      throw new Error(`Failed to get delivery history: ${error.message}`);
    }

    const deliveries = (data || []).map(this.mapToDelivery);

    return {
      deliveries,
      total: count || 0,
    };
  }

  /**
   * Get delivery by ID
   */
  async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get delivery: ${error.message}`);
    }

    return this.mapToDelivery(data);
  }

  /**
   * Get recent failures for a webhook
   */
  async getRecentFailures(webhookId: string, limit = 10): Promise<WebhookDelivery[]> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent failures: ${error.message}`);
    }

    return (data || []).map(this.mapToDelivery);
  }

  /**
   * Get success rate over time (daily breakdown)
   */
  async getSuccessRateOverTime(
    webhookId: string,
    days = 7,
  ): Promise<Array<{ date: string; successRate: number; total: number }>> {
    const { data, error } = await this.supabase.rpc('get_webhook_success_rate_by_day', {
      webhook_uuid: webhookId,
      days_count: days,
    });

    if (error) {
      // If function doesn't exist, calculate manually
      return this.calculateSuccessRateManually(webhookId, days);
    }

    return data || [];
  }

  /**
   * Get average response time over time
   */
  async getResponseTimeOverTime(
    webhookId: string,
    hours = 24,
  ): Promise<Array<{ hour: string; avgResponseTime: number; count: number }>> {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('created_at, response_time')
      .eq('webhook_id', webhookId)
      .eq('status', 'delivered')
      .gte('created_at', startDate.toISOString())
      .not('response_time', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get response time data: ${error.message}`);
    }

    // Group by hour
    const hourlyData = new Map<string, { sum: number; count: number }>();

    for (const delivery of data || []) {
      const hour = new Date(delivery.created_at).toISOString().slice(0, 13) + ':00:00';
      const existing = hourlyData.get(hour) || { sum: 0, count: 0 };
      existing.sum += delivery.response_time;
      existing.count += 1;
      hourlyData.set(hour, existing);
    }

    // Convert to array
    return Array.from(hourlyData.entries()).map(([hour, data]) => ({
      hour,
      avgResponseTime: Math.round(data.sum / data.count),
      count: data.count,
    }));
  }

  /**
   * Get webhooks that need attention (high failure rate)
   */
  async getWebhooksNeedingAttention(userId: string, threshold = 50): Promise<
    Array<{
      webhookId: string;
      webhookName: string;
      stats: WebhookStats;
    }>
  > {
    // Get all active webhooks for user
    const { data: webhooks, error: webhooksError } = await this.supabase
      .from('webhooks')
      .select('id, name')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (webhooksError) {
      throw new Error(`Failed to get webhooks: ${webhooksError.message}`);
    }

    const results: Array<{ webhookId: string; webhookName: string; stats: WebhookStats }> = [];

    // Check stats for each webhook
    for (const webhook of webhooks || []) {
      const stats = await this.getStats(webhook.id);

      // Include if success rate is below threshold or consecutive failures
      if (stats.successRate < threshold || stats.consecutiveFailures >= 3) {
        results.push({
          webhookId: webhook.id,
          webhookName: webhook.name,
          stats,
        });
      }
    }

    // Sort by success rate (worst first)
    results.sort((a, b) => a.stats.successRate - b.stats.successRate);

    return results;
  }

  /**
   * Check webhook health and return status
   */
  async checkHealth(webhookId: string): Promise<{
    healthy: boolean;
    issues: string[];
    stats: WebhookStats;
  }> {
    const stats = await this.getStats(webhookId);
    const issues: string[] = [];
    let healthy = true;

    // Check success rate
    if (stats.totalDeliveries > 10 && stats.successRate < 90) {
      issues.push(`Low success rate: ${stats.successRate.toFixed(1)}%`);
      healthy = false;
    }

    // Check consecutive failures
    if (stats.consecutiveFailures >= 5) {
      issues.push(`${stats.consecutiveFailures} consecutive failures`);
      healthy = false;
    }

    // Check average response time (over 10 seconds is concerning)
    if (stats.averageResponseTime > 10000) {
      issues.push(`Slow response time: ${(stats.averageResponseTime / 1000).toFixed(1)}s`);
      healthy = false;
    }

    // Check if webhook has been idle for too long (no deliveries in 24h)
    if (stats.lastDelivery) {
      const hoursSinceLastDelivery = (Date.now() - stats.lastDelivery.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastDelivery > 24) {
        issues.push(`No deliveries in ${Math.floor(hoursSinceLastDelivery)} hours`);
      }
    }

    return { healthy, issues, stats };
  }

  /**
   * Calculate success rate manually (fallback)
   */
  private async calculateSuccessRateManually(
    webhookId: string,
    days: number,
  ): Promise<Array<{ date: string; successRate: number; total: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('created_at, status')
      .eq('webhook_id', webhookId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      throw new Error(`Failed to get delivery data: ${error.message}`);
    }

    // Group by day
    const dailyData = new Map<string, { successful: number; total: number }>();

    for (const delivery of data || []) {
      const date = new Date(delivery.created_at).toISOString().slice(0, 10);
      const existing = dailyData.get(date) || { successful: 0, total: 0 };
      existing.total += 1;
      if (delivery.status === 'delivered') {
        existing.successful += 1;
      }
      dailyData.set(date, existing);
    }

    // Convert to array
    return Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
      total: data.total,
    }));
  }

  /**
   * Map database row to WebhookDelivery
   */
  private mapToDelivery(data: Record<string, unknown>): WebhookDelivery {
    return {
      id: data.id as string,
      webhookId: data.webhook_id as string,
      event: data.event as string,
      payload: data.payload as Record<string, unknown>,
      status: data.status as WebhookDelivery['status'],
      attempts: data.attempts as number,
      response: data.response_status_code
        ? {
            statusCode: data.response_status_code as number,
            body: data.response_body as string,
            headers: data.response_headers as Record<string, string>,
          }
        : undefined,
      error: data.error as string | undefined,
      createdAt: data.created_at as string,
      deliveredAt: data.delivered_at as string | undefined,
      nextRetry: data.next_retry as string | undefined,
    };
  }
}

/**
 * Create a webhook monitor instance
 */
export function createWebhookMonitor(alertConfig?: AlertConfig): WebhookMonitor {
  return new WebhookMonitor(alertConfig);
}
