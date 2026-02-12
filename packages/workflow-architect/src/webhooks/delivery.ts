/**
 * Delivery Manager
 * Send webhook payloads with retry and timeout handling
 */

import { getSupabaseClient } from '../supabase/client.js';
import { WebhookSecurity } from './security.js';
import type { Webhook, WebhookEvent, WebhookDelivery, DeliveryStatus } from './types.js';

export interface DeliveryOptions {
  timeout?: number; // milliseconds
  followRedirects?: boolean;
}

export class DeliveryManager {
  private supabase = getSupabaseClient();
  private security = new WebhookSecurity();
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Deliver a webhook event
   */
  async deliver(webhook: Webhook, event: WebhookEvent, options?: DeliveryOptions): Promise<WebhookDelivery> {
    // Create delivery record
    const delivery = await this.createDelivery(webhook.id, event);

    try {
      // Make HTTP request
      const result = await this.sendRequest(webhook, event, options);

      // Update delivery with success
      return await this.updateDelivery(delivery.id, {
        status: 'delivered',
        response: {
          statusCode: result.statusCode,
          body: result.body,
          headers: result.headers,
        },
        responseTime: result.responseTime,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      // Determine if we should retry
      const shouldRetry = this.shouldRetry(delivery.attempts, webhook.retryConfig.maxAttempts);
      const status: DeliveryStatus = shouldRetry ? 'retrying' : 'failed';

      // Calculate next retry time if applicable
      const nextRetry = shouldRetry
        ? this.calculateNextRetry(delivery.attempts, webhook.retryConfig)
        : undefined;

      // Update delivery with failure
      return await this.updateDelivery(delivery.id, {
        status,
        error: error instanceof Error ? error.message : String(error),
        nextRetry: nextRetry?.toISOString(),
      });
    }
  }

  /**
   * Retry a failed delivery
   */
  async retry(deliveryId: string): Promise<WebhookDelivery> {
    // Get delivery details
    const { data: deliveryData, error: deliveryError } = await this.supabase
      .from('webhook_deliveries')
      .select('*, webhooks(*)')
      .eq('id', deliveryId)
      .single();

    if (deliveryError || !deliveryData) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    const webhook = this.mapToWebhook(deliveryData.webhooks);
    const event: WebhookEvent = {
      type: deliveryData.event,
      data: deliveryData.payload as Record<string, unknown>,
      timestamp: new Date(deliveryData.created_at).getTime(),
      source: 'retry',
    };

    // Increment attempts
    await this.incrementAttempts(deliveryId);

    try {
      // Make HTTP request
      const result = await this.sendRequest(webhook, event);

      // Update delivery with success
      return await this.updateDelivery(deliveryId, {
        status: 'delivered',
        response: {
          statusCode: result.statusCode,
          body: result.body,
          headers: result.headers,
        },
        responseTime: result.responseTime,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      // Get updated attempts count
      const { data: updated } = await this.supabase
        .from('webhook_deliveries')
        .select('attempts')
        .eq('id', deliveryId)
        .single();

      const attempts = updated?.attempts || deliveryData.attempts;

      // Determine if we should retry again
      const shouldRetry = this.shouldRetry(attempts, webhook.retryConfig.maxAttempts);
      const status: DeliveryStatus = shouldRetry ? 'retrying' : 'failed';

      // Calculate next retry time if applicable
      const nextRetry = shouldRetry
        ? this.calculateNextRetry(attempts, webhook.retryConfig)
        : undefined;

      // Update delivery with failure
      return await this.updateDelivery(deliveryId, {
        status,
        error: error instanceof Error ? error.message : String(error),
        nextRetry: nextRetry?.toISOString(),
      });
    }
  }

  /**
   * Get deliveries ready for retry
   */
  async getRetryableDeliveries(limit = 100): Promise<WebhookDelivery[]> {
    const { data, error } = await this.supabase
      .rpc('get_retryable_deliveries', { limit_count: limit });

    if (error) {
      throw new Error(`Failed to get retryable deliveries: ${error.message}`);
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.delivery_id as string,
      webhookId: row.webhook_id as string,
      event: row.event as string,
      payload: row.payload as Record<string, unknown>,
      status: 'retrying' as DeliveryStatus,
      attempts: row.attempts as number,
      createdAt: new Date().toISOString(),
    }));
  }

  /**
   * Send HTTP request to webhook URL
   */
  private async sendRequest(
    webhook: Webhook,
    event: WebhookEvent,
    options?: DeliveryOptions,
  ): Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    responseTime: number;
  }> {
    const timeout = options?.timeout || this.defaultTimeout;
    const startTime = Date.now();

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Workflow-Architect-Webhook/1.0',
      'X-Webhook-Event': event.type,
      'X-Webhook-Timestamp': event.timestamp.toString(),
      'X-Webhook-Source': event.source,
      ...webhook.headers,
    };

    // Add signature header if required
    if (webhook.signatureType !== 'none' && webhook.secret) {
      const signature = this.security.sign(event.data, webhook.secret, webhook.signatureType);
      const headerName = this.security.getSignatureHeaderName(webhook.signatureType);
      const headerValue = this.security.getSignatureValue(signature, webhook.signatureType);
      headers[headerName] = headerValue;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event.data),
        signal: controller.signal,
        redirect: options?.followRedirects ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const body = await response.text();
      const responseHeaders: Record<string, string> = {};

      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Consider 2xx status codes as success
      if (response.status >= 200 && response.status < 300) {
        return {
          statusCode: response.status,
          body,
          headers: responseHeaders,
          responseTime,
        };
      }

      // Non-2xx status codes are failures
      throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)}`);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error during webhook delivery');
    }
  }

  /**
   * Create a new delivery record
   */
  private async createDelivery(webhookId: string, event: WebhookEvent): Promise<WebhookDelivery> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhookId,
        event: event.type,
        payload: event.data,
        status: 'pending',
        attempts: 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create delivery: ${error.message}`);
    }

    return {
      id: data.id,
      webhookId: data.webhook_id,
      event: data.event,
      payload: data.payload,
      status: data.status,
      attempts: data.attempts,
      createdAt: data.created_at,
    };
  }

  /**
   * Update delivery record
   */
  private async updateDelivery(
    deliveryId: string,
    updates: {
      status?: DeliveryStatus;
      response?: WebhookDelivery['response'];
      error?: string;
      responseTime?: number;
      deliveredAt?: string;
      nextRetry?: string;
    },
  ): Promise<WebhookDelivery> {
    const dbUpdates: Record<string, unknown> = {};

    if (updates.status) {
      dbUpdates.status = updates.status;
    }

    if (updates.response) {
      dbUpdates.response_status_code = updates.response.statusCode;
      dbUpdates.response_body = updates.response.body?.substring(0, 1000); // Limit size
      dbUpdates.response_headers = updates.response.headers;
    }

    if (updates.responseTime !== undefined) {
      dbUpdates.response_time = updates.responseTime;
    }

    if (updates.error) {
      dbUpdates.error = updates.error.substring(0, 500); // Limit size
    }

    if (updates.deliveredAt) {
      dbUpdates.delivered_at = updates.deliveredAt;
    }

    if (updates.nextRetry) {
      dbUpdates.next_retry = updates.nextRetry;
    }

    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .update(dbUpdates)
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update delivery: ${error.message}`);
    }

    return {
      id: data.id,
      webhookId: data.webhook_id,
      event: data.event,
      payload: data.payload,
      status: data.status,
      attempts: data.attempts,
      response: data.response_status_code
        ? {
            statusCode: data.response_status_code,
            body: data.response_body,
            headers: data.response_headers,
          }
        : undefined,
      error: data.error,
      createdAt: data.created_at,
      deliveredAt: data.delivered_at,
      nextRetry: data.next_retry,
    };
  }

  /**
   * Increment delivery attempts
   */
  private async incrementAttempts(deliveryId: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment', {
      row_id: deliveryId,
      x: 1,
    });

    if (error) {
      // If RPC doesn't exist, do it manually
      await this.supabase
        .from('webhook_deliveries')
        .update({ attempts: this.supabase.rpc('increment', { x: 1 }) })
        .eq('id', deliveryId);
    }
  }

  /**
   * Check if delivery should be retried
   */
  private shouldRetry(attempts: number, maxAttempts: number): boolean {
    return attempts < maxAttempts;
  }

  /**
   * Calculate next retry time based on backoff strategy
   */
  private calculateNextRetry(
    attempts: number,
    retryConfig: Webhook['retryConfig'],
  ): Date {
    const now = Date.now();
    let delayMs: number;

    if (retryConfig.backoff === 'exponential') {
      // Exponential backoff: initialDelay * 2^attempts
      delayMs = retryConfig.initialDelay * Math.pow(2, attempts);
    } else {
      // Fixed backoff
      delayMs = retryConfig.initialDelay;
    }

    // Cap at 1 hour
    delayMs = Math.min(delayMs, 3600000);

    return new Date(now + delayMs);
  }

  /**
   * Map database webhook to Webhook type
   */
  private mapToWebhook(data: Record<string, unknown>): Webhook {
    return {
      id: data.id as string,
      name: data.name as string,
      url: data.url as string,
      secret: data.secret as string | undefined,
      signatureType: data.signature_type as Webhook['signatureType'],
      headers: (data.headers as Record<string, string>) || {},
      events: data.events as string[],
      status: data.status as Webhook['status'],
      retryConfig: {
        maxAttempts: data.max_retry_attempts as number,
        backoff: data.backoff_strategy as Webhook['retryConfig']['backoff'],
        initialDelay: data.initial_delay as number,
      },
      rateLimit:
        data.rate_limit_requests && data.rate_limit_window
          ? {
              requests: data.rate_limit_requests as number,
              window: data.rate_limit_window as number,
            }
          : undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}

/**
 * Create a delivery manager instance
 */
export function createDeliveryManager(): DeliveryManager {
  return new DeliveryManager();
}
