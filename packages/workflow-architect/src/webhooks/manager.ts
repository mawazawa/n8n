/**
 * Webhook Manager
 * CRUD operations and lifecycle management for webhooks
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import type {
  Webhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookStatus,
  RetryConfig,
} from './types.js';

export class WebhookManager {
  private supabase = getSupabaseClient();

  /**
   * Create a new webhook
   */
  async create(userId: string, input: CreateWebhookInput): Promise<Webhook> {
    // Validate URL
    if (!this.isValidUrl(input.url)) {
      throw new Error('Invalid webhook URL. Must be http:// or https://');
    }

    // Generate secret if signature type requires it
    const signatureType = input.signatureType || 'hmac-sha256';
    const secret = this.needsSecret(signatureType) ? this.generateSecret() : undefined;

    // Set default retry config
    const retryConfig = {
      maxAttempts: input.retryConfig?.maxAttempts ?? 3,
      backoff: input.retryConfig?.backoff ?? 'exponential' as const,
      initialDelay: input.retryConfig?.initialDelay ?? 1000,
    };

    // Insert webhook
    const { data, error } = await this.supabase
      .from('webhooks')
      .insert({
        user_id: userId,
        name: input.name,
        url: input.url,
        secret,
        signature_type: signatureType,
        headers: input.headers || {},
        events: input.events,
        max_retry_attempts: retryConfig.maxAttempts,
        backoff_strategy: retryConfig.backoff,
        initial_delay: retryConfig.initialDelay,
        rate_limit_requests: input.rateLimit?.requests,
        rate_limit_window: input.rateLimit?.window,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create webhook: ${error.message}`);
    }

    return this.mapToWebhook(data);
  }

  /**
   * Get webhook by ID
   */
  async get(webhookId: string, userId?: string): Promise<Webhook | null> {
    const query = this.supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId);

    if (userId) {
      query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get webhook: ${error.message}`);
    }

    return this.mapToWebhook(data);
  }

  /**
   * List all webhooks for a user
   */
  async list(userId: string, options?: { status?: WebhookStatus }): Promise<Webhook[]> {
    const query = this.supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query.eq('status', options.status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list webhooks: ${error.message}`);
    }

    return (data || []).map(this.mapToWebhook);
  }

  /**
   * Update webhook configuration
   */
  async update(webhookId: string, userId: string, input: UpdateWebhookInput): Promise<Webhook> {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updates.name = input.name;
    }

    if (input.url !== undefined) {
      if (!this.isValidUrl(input.url)) {
        throw new Error('Invalid webhook URL. Must be http:// or https://');
      }
      updates.url = input.url;
    }

    if (input.events !== undefined) {
      if (input.events.length === 0) {
        throw new Error('At least one event must be specified');
      }
      updates.events = input.events;
    }

    if (input.headers !== undefined) {
      updates.headers = input.headers;
    }

    if (input.retryConfig) {
      if (input.retryConfig.maxAttempts !== undefined) {
        updates.max_retry_attempts = input.retryConfig.maxAttempts;
      }
      if (input.retryConfig.backoff !== undefined) {
        updates.backoff_strategy = input.retryConfig.backoff;
      }
      if (input.retryConfig.initialDelay !== undefined) {
        updates.initial_delay = input.retryConfig.initialDelay;
      }
    }

    if (input.rateLimit !== undefined) {
      updates.rate_limit_requests = input.rateLimit.requests;
      updates.rate_limit_window = input.rateLimit.window;
    }

    const { data, error } = await this.supabase
      .from('webhooks')
      .update(updates)
      .eq('id', webhookId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update webhook: ${error.message}`);
    }

    return this.mapToWebhook(data);
  }

  /**
   * Delete a webhook
   */
  async delete(webhookId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }
  }

  /**
   * Enable a webhook (set status to active)
   */
  async enable(webhookId: string, userId: string): Promise<Webhook> {
    return this.updateStatus(webhookId, userId, 'active');
  }

  /**
   * Disable a webhook (set status to disabled)
   */
  async disable(webhookId: string, userId: string): Promise<Webhook> {
    return this.updateStatus(webhookId, userId, 'disabled');
  }

  /**
   * Pause a webhook (set status to paused)
   */
  async pause(webhookId: string, userId: string): Promise<Webhook> {
    return this.updateStatus(webhookId, userId, 'paused');
  }

  /**
   * Rotate webhook secret
   */
  async rotateSecret(webhookId: string, userId: string): Promise<Webhook> {
    const webhook = await this.get(webhookId, userId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    if (!this.needsSecret(webhook.signatureType)) {
      throw new Error('This webhook signature type does not use secrets');
    }

    const newSecret = this.generateSecret();

    const { data, error } = await this.supabase
      .from('webhooks')
      .update({ secret: newSecret })
      .eq('id', webhookId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to rotate secret: ${error.message}`);
    }

    return this.mapToWebhook(data);
  }

  /**
   * Get webhooks subscribed to a specific event
   */
  async getByEvent(event: string, userId?: string): Promise<Webhook[]> {
    const query = this.supabase
      .from('webhooks')
      .select('*')
      .contains('events', [event])
      .eq('status', 'active');

    if (userId) {
      query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get webhooks by event: ${error.message}`);
    }

    return (data || []).map(this.mapToWebhook);
  }

  /**
   * Update webhook status
   */
  private async updateStatus(
    webhookId: string,
    userId: string,
    status: WebhookStatus,
  ): Promise<Webhook> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .update({ status })
      .eq('id', webhookId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update webhook status: ${error.message}`);
    }

    return this.mapToWebhook(data);
  }

  /**
   * Check if a signature type needs a secret
   */
  private needsSecret(signatureType: string): boolean {
    return ['hmac-sha256', 'hmac-sha1', 'jwt', 'basic'].includes(signatureType);
  }

  /**
   * Generate a secure random secret
   */
  private generateSecret(): string {
    // Generate 32 random bytes and encode as hex
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Map database row to Webhook type
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
      status: data.status as WebhookStatus,
      retryConfig: {
        maxAttempts: data.max_retry_attempts as number,
        backoff: data.backoff_strategy as RetryConfig['backoff'],
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
 * Create a webhook manager instance
 */
export function createWebhookManager(): WebhookManager {
  return new WebhookManager();
}
