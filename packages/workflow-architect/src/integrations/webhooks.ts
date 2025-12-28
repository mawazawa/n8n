import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WebhookSubscription, WebhookSubscriptionSchema } from './types';

/**
 * Webhook payload
 */
interface WebhookPayload {
	event: string;
	timestamp: Date;
	data: Record<string, unknown>;
	signature?: string;
}

/**
 * Webhook handler function
 */
type WebhookHandler = (payload: WebhookPayload) => Promise<void>;

/**
 * Webhook Subscription Manager
 * Manages webhook subscriptions including creation, verification, and handling
 */
export class WebhookSubscriptionManager {
	private supabase: SupabaseClient;
	private handlers: Map<string, WebhookHandler[]>;
	private secrets: Map<string, string>;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.handlers = new Map();
		this.secrets = new Map();
	}

	/**
	 * Subscribe to webhook events for an integration
	 */
	async subscribe(
		integrationId: string,
		events: string[],
		url: string,
		secret?: string,
	): Promise<WebhookSubscription> {
		// Generate secret if not provided
		const webhookSecret = secret || this.generateSecret();

		// Create subscription
		const subscription: Omit<WebhookSubscription, 'id' | 'createdAt'> = {
			integrationId,
			events,
			url,
			secret: webhookSecret,
			active: true,
		};

		const { data, error } = await this.supabase
			.from('webhook_subscriptions')
			.insert({
				integration_id: integrationId,
				events,
				url,
				secret: webhookSecret,
				active: true,
			})
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to create webhook subscription: ${error.message}`);
		}

		const webhookSubscription = this.mapDatabaseToSubscription(data);

		// Store secret in memory
		this.secrets.set(webhookSubscription.id, webhookSecret);

		return webhookSubscription;
	}

	/**
	 * Unsubscribe from webhook events
	 */
	async unsubscribe(subscriptionId: string): Promise<void> {
		const { error } = await this.supabase
			.from('webhook_subscriptions')
			.delete()
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to unsubscribe: ${error.message}`);
		}

		// Remove from memory
		this.handlers.delete(subscriptionId);
		this.secrets.delete(subscriptionId);
	}

	/**
	 * Get subscription by ID
	 */
	async getSubscription(subscriptionId: string): Promise<WebhookSubscription | null> {
		const { data, error } = await this.supabase
			.from('webhook_subscriptions')
			.select('*')
			.eq('id', subscriptionId)
			.single();

		if (error || !data) {
			return null;
		}

		return this.mapDatabaseToSubscription(data);
	}

	/**
	 * Get all subscriptions for an integration
	 */
	async getSubscriptionsByIntegration(integrationId: string): Promise<WebhookSubscription[]> {
		const { data, error } = await this.supabase
			.from('webhook_subscriptions')
			.select('*')
			.eq('integration_id', integrationId);

		if (error) {
			throw new Error(`Failed to get subscriptions: ${error.message}`);
		}

		return data.map((item) => this.mapDatabaseToSubscription(item));
	}

	/**
	 * Update subscription status
	 */
	async updateStatus(subscriptionId: string, active: boolean): Promise<void> {
		const { error } = await this.supabase
			.from('webhook_subscriptions')
			.update({ active })
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to update subscription: ${error.message}`);
		}
	}

	/**
	 * Handle incoming webhook payload
	 */
	async handleIncoming(payload: WebhookPayload, signature?: string): Promise<void> {
		// Find subscriptions that match the event
		const { data, error } = await this.supabase
			.from('webhook_subscriptions')
			.select('*')
			.contains('events', [payload.event])
			.eq('active', true);

		if (error) {
			throw new Error(`Failed to find subscriptions: ${error.message}`);
		}

		// Process each subscription
		for (const subscription of data) {
			try {
				// Verify signature if secret is configured
				if (subscription.secret && signature) {
					const isValid = this.verifySignature(payload, signature, subscription.secret);
					if (!isValid) {
						console.error(`Invalid signature for subscription ${subscription.id}`);
						continue;
					}
				}

				// Get handlers for this subscription
				const handlers = this.handlers.get(subscription.id) || [];

				// Execute all handlers
				for (const handler of handlers) {
					await handler(payload);
				}

				// Log successful delivery
				await this.logWebhookEvent(subscription.id, payload, 'success');
			} catch (error) {
				console.error(`Error handling webhook for subscription ${subscription.id}:`, error);
				await this.logWebhookEvent(
					subscription.id,
					payload,
					'error',
					error instanceof Error ? error.message : 'Unknown error',
				);
			}
		}
	}

	/**
	 * Register a handler for a subscription
	 */
	registerHandler(subscriptionId: string, handler: WebhookHandler): void {
		if (!this.handlers.has(subscriptionId)) {
			this.handlers.set(subscriptionId, []);
		}

		this.handlers.get(subscriptionId)!.push(handler);
	}

	/**
	 * Unregister all handlers for a subscription
	 */
	unregisterHandlers(subscriptionId: string): void {
		this.handlers.delete(subscriptionId);
	}

	/**
	 * Generate webhook signature
	 */
	generateSignature(payload: WebhookPayload, secret: string): string {
		const payloadString = JSON.stringify({
			event: payload.event,
			timestamp: payload.timestamp.toISOString(),
			data: payload.data,
		});

		return crypto
			.createHmac('sha256', secret)
			.update(payloadString)
			.digest('hex');
	}

	/**
	 * Verify webhook signature
	 */
	verifySignature(payload: WebhookPayload, signature: string, secret: string): boolean {
		const expectedSignature = this.generateSignature(payload, secret);
		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature),
		);
	}

	/**
	 * Test webhook subscription
	 */
	async testSubscription(subscriptionId: string): Promise<boolean> {
		const subscription = await this.getSubscription(subscriptionId);

		if (!subscription) {
			throw new Error('Subscription not found');
		}

		// Create test payload
		const testPayload: WebhookPayload = {
			event: 'test',
			timestamp: new Date(),
			data: {
				message: 'This is a test webhook',
			},
		};

		// Generate signature
		const signature = subscription.secret
			? this.generateSignature(testPayload, subscription.secret)
			: undefined;

		try {
			// Send test webhook
			const response = await fetch(subscription.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(signature && { 'X-Webhook-Signature': signature }),
				},
				body: JSON.stringify(testPayload),
			});

			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Rotate webhook secret
	 */
	async rotateSecret(subscriptionId: string): Promise<string> {
		const newSecret = this.generateSecret();

		const { error } = await this.supabase
			.from('webhook_subscriptions')
			.update({ secret: newSecret })
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to rotate secret: ${error.message}`);
		}

		// Update in memory
		this.secrets.set(subscriptionId, newSecret);

		return newSecret;
	}

	/**
	 * Get webhook delivery history
	 */
	async getDeliveryHistory(subscriptionId: string, limit = 100): Promise<Array<{
		timestamp: Date;
		event: string;
		status: 'success' | 'error';
		errorMessage?: string;
	}>> {
		const { data, error } = await this.supabase
			.from('webhook_deliveries')
			.select('*')
			.eq('subscription_id', subscriptionId)
			.order('timestamp', { ascending: false })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to get delivery history: ${error.message}`);
		}

		return data.map((row) => ({
			timestamp: new Date(row.timestamp),
			event: row.event,
			status: row.status,
			errorMessage: row.error_message,
		}));
	}

	/**
	 * Log webhook event
	 */
	private async logWebhookEvent(
		subscriptionId: string,
		payload: WebhookPayload,
		status: 'success' | 'error',
		errorMessage?: string,
	): Promise<void> {
		const { error } = await this.supabase
			.from('webhook_deliveries')
			.insert({
				subscription_id: subscriptionId,
				event: payload.event,
				timestamp: payload.timestamp.toISOString(),
				status,
				error_message: errorMessage,
				payload: payload.data,
			});

		if (error) {
			console.error('Failed to log webhook event:', error);
		}
	}

	/**
	 * Generate a random secret
	 */
	private generateSecret(): string {
		return crypto.randomBytes(32).toString('hex');
	}

	/**
	 * Map database record to WebhookSubscription
	 */
	private mapDatabaseToSubscription(data: Record<string, unknown>): WebhookSubscription {
		const subscription: WebhookSubscription = {
			id: data.id as string,
			integrationId: data.integration_id as string,
			events: data.events as string[],
			url: data.url as string,
			secret: data.secret as string | undefined,
			active: (data.active as boolean) ?? true,
			createdAt: new Date(data.created_at as string),
		};

		return WebhookSubscriptionSchema.parse(subscription);
	}

	/**
	 * Batch subscribe to multiple events
	 */
	async batchSubscribe(
		subscriptions: Array<{
			integrationId: string;
			events: string[];
			url: string;
			secret?: string;
		}>,
	): Promise<WebhookSubscription[]> {
		const results: WebhookSubscription[] = [];

		for (const sub of subscriptions) {
			const subscription = await this.subscribe(
				sub.integrationId,
				sub.events,
				sub.url,
				sub.secret,
			);
			results.push(subscription);
		}

		return results;
	}

	/**
	 * Get subscription statistics
	 */
	async getStatistics(subscriptionId: string, hours = 24): Promise<{
		totalDeliveries: number;
		successfulDeliveries: number;
		failedDeliveries: number;
		successRate: number;
	}> {
		const since = new Date(Date.now() - hours * 60 * 60 * 1000);

		const { data, error } = await this.supabase
			.from('webhook_deliveries')
			.select('status')
			.eq('subscription_id', subscriptionId)
			.gte('timestamp', since.toISOString());

		if (error) {
			throw new Error(`Failed to get statistics: ${error.message}`);
		}

		const totalDeliveries = data.length;
		const successfulDeliveries = data.filter((row) => row.status === 'success').length;
		const failedDeliveries = data.filter((row) => row.status === 'error').length;
		const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;

		return {
			totalDeliveries,
			successfulDeliveries,
			failedDeliveries,
			successRate,
		};
	}
}
