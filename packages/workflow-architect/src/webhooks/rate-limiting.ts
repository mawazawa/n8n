/**
 * Webhook Rate Limiter
 * Per-webhook rate limiting with sliding window algorithm
 */

import { getSupabaseClient } from '../supabase/client.js';
import type { Webhook, RateLimit } from './types.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds
}

export class WebhookRateLimiter {
  private supabase = getSupabaseClient();
  private localCache = new Map<string, { count: number; windowStart: number }>();

  /**
   * Check if a webhook request is within rate limits
   */
  async checkLimit(webhookId: string): Promise<RateLimitResult> {
    // Get webhook rate limit configuration
    const webhook = await this.getWebhook(webhookId);

    if (!webhook?.rateLimit) {
      // No rate limit configured - always allow
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      };
    }

    const { requests, window } = webhook.rateLimit;

    // Use database function for accurate counting
    const allowed = await this.checkDatabaseLimit(webhookId, window);

    // Get current count for remaining calculation
    const currentCount = await this.getCurrentCount(webhookId, window);

    const windowStart = this.getWindowStart(window);
    const resetAt = new Date(windowStart + window * 1000);

    return {
      allowed,
      limit: requests,
      remaining: Math.max(0, requests - currentCount),
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - Date.now()) / 1000),
    };
  }

  /**
   * Record a webhook request (call after successful delivery)
   */
  async recordRequest(webhookId: string): Promise<void> {
    const webhook = await this.getWebhook(webhookId);

    if (!webhook?.rateLimit) {
      // No rate limit - nothing to record
      return;
    }

    const { window } = webhook.rateLimit;

    // Use database function to record
    const { error } = await this.supabase.rpc('record_rate_limit_request', {
      webhook_uuid: webhookId,
      window_seconds: window,
    });

    if (error) {
      // Fallback to manual recording
      await this.recordRequestManually(webhookId, window);
    }

    // Update local cache
    const windowStart = this.getWindowStart(window);
    const cacheKey = `${webhookId}:${windowStart}`;
    const cached = this.localCache.get(cacheKey) || { count: 0, windowStart };
    cached.count += 1;
    this.localCache.set(cacheKey, cached);

    // Clean up old cache entries
    this.cleanupCache();
  }

  /**
   * Get current request count for a webhook in the current window
   */
  async getCurrentCount(webhookId: string, windowSeconds: number): Promise<number> {
    const windowStart = this.getWindowStart(windowSeconds);

    const { data, error } = await this.supabase
      .from('webhook_rate_limits')
      .select('request_count')
      .eq('webhook_id', webhookId)
      .eq('window_start', new Date(windowStart).toISOString())
      .single();

    if (error || !data) {
      return 0;
    }

    return data.request_count as number;
  }

  /**
   * Reset rate limit for a webhook (admin function)
   */
  async resetLimit(webhookId: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_rate_limits')
      .delete()
      .eq('webhook_id', webhookId);

    if (error) {
      throw new Error(`Failed to reset rate limit: ${error.message}`);
    }

    // Clear local cache for this webhook
    const keys = Array.from(this.localCache.keys());
    for (const key of keys) {
      if (key.startsWith(webhookId + ':')) {
        this.localCache.delete(key);
      }
    }
  }

  /**
   * Get rate limit status for multiple webhooks
   */
  async getMultipleStatuses(webhookIds: string[]): Promise<Map<string, RateLimitResult>> {
    const results = new Map<string, RateLimitResult>();

    // Process in parallel
    await Promise.all(
      webhookIds.map(async (webhookId) => {
        try {
          const result = await this.checkLimit(webhookId);
          results.set(webhookId, result);
        } catch (error) {
          // If error, assume no rate limit
          results.set(webhookId, {
            allowed: true,
            limit: Infinity,
            remaining: Infinity,
            resetAt: new Date(Date.now() + 1000 * 60 * 60),
          });
        }
      }),
    );

    return results;
  }

  /**
   * Check if burst is allowed (multiple requests in rapid succession)
   */
  async checkBurst(webhookId: string, burstSize: number): Promise<RateLimitResult> {
    const result = await this.checkLimit(webhookId);

    if (result.remaining < burstSize) {
      return {
        ...result,
        allowed: false,
      };
    }

    return result;
  }

  /**
   * Get webhook from database
   */
  private async getWebhook(webhookId: string): Promise<Webhook | null> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      url: data.url,
      secret: data.secret,
      signatureType: data.signature_type,
      headers: data.headers,
      events: data.events,
      status: data.status,
      retryConfig: {
        maxAttempts: data.max_retry_attempts,
        backoff: data.backoff_strategy,
        initialDelay: data.initial_delay,
      },
      rateLimit:
        data.rate_limit_requests && data.rate_limit_window
          ? {
              requests: data.rate_limit_requests,
              window: data.rate_limit_window,
            }
          : undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Check rate limit using database function
   */
  private async checkDatabaseLimit(webhookId: string, windowSeconds: number): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_rate_limit_request', {
      webhook_uuid: webhookId,
      window_seconds: windowSeconds,
    });

    if (error) {
      // Fallback to manual check
      return this.checkLimitManually(webhookId, windowSeconds);
    }

    return data as boolean;
  }

  /**
   * Check rate limit manually (fallback)
   */
  private async checkLimitManually(webhookId: string, windowSeconds: number): Promise<boolean> {
    const webhook = await this.getWebhook(webhookId);
    if (!webhook?.rateLimit) {
      return true;
    }

    const currentCount = await this.getCurrentCount(webhookId, windowSeconds);
    return currentCount < webhook.rateLimit.requests;
  }

  /**
   * Record request manually (fallback)
   */
  private async recordRequestManually(webhookId: string, windowSeconds: number): Promise<void> {
    const windowStart = new Date(this.getWindowStart(windowSeconds));

    // Try to update existing record
    const { data: existing } = await this.supabase
      .from('webhook_rate_limits')
      .select('id, request_count')
      .eq('webhook_id', webhookId)
      .eq('window_start', windowStart.toISOString())
      .single();

    if (existing) {
      // Update existing
      await this.supabase
        .from('webhook_rate_limits')
        .update({ request_count: (existing.request_count as number) + 1 })
        .eq('id', existing.id);
    } else {
      // Insert new
      await this.supabase.from('webhook_rate_limits').insert({
        webhook_id: webhookId,
        window_start: windowStart.toISOString(),
        request_count: 1,
      });
    }
  }

  /**
   * Calculate the start of the current window in milliseconds
   */
  private getWindowStart(windowSeconds: number): number {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    return Math.floor(now / windowMs) * windowMs;
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    const entries = Array.from(this.localCache.entries());
    for (const [key, value] of entries) {
      if (now - value.windowStart > maxAge) {
        this.localCache.delete(key);
      }
    }
  }

  /**
   * Get rate limit headers (for API responses)
   */
  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.toISOString(),
      ...(result.retryAfter !== undefined && {
        'Retry-After': result.retryAfter.toString(),
      }),
    };
  }
}

/**
 * Create a webhook rate limiter instance
 */
export function createWebhookRateLimiter(): WebhookRateLimiter {
  return new WebhookRateLimiter();
}
