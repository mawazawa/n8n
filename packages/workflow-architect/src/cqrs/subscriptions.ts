import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type {
	Event,
	Subscription,
	SubscriptionType,
	SubscriptionState,
	EventHandler,
} from './types';
import type { EventStore } from './event-store';

/**
 * Subscription options
 */
export interface SubscriptionOptions {
	/** Subscription type */
	type?: SubscriptionType;
	/** Consumer group for competing consumers */
	consumerGroup?: string;
	/** Batch size for processing events */
	batchSize?: number;
	/** Poll interval in milliseconds */
	pollInterval?: number;
	/** Start from this position */
	startFromPosition?: number;
	/** Error handler */
	onError?: (error: Error, event?: Event) => void;
}

/**
 * Subscription manager
 * Manages event subscriptions with support for different subscription types
 */
export class SubscriptionManager {
	private supabase: SupabaseClient;
	private eventStore: EventStore;
	private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();
	private handlers: Map<string, EventHandler> = new Map();

	constructor(supabaseUrl: string, supabaseKey: string, eventStore: EventStore) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.eventStore = eventStore;
	}

	/**
	 * Subscribe to events
	 */
	async subscribe(
		name: string,
		eventTypes: string[],
		handler: EventHandler,
		options: SubscriptionOptions = {},
	): Promise<Subscription> {
		const subscription: Subscription = {
			id: uuidv4(),
			name,
			eventTypes,
			position: options.startFromPosition ?? 0,
			type: options.type ?? 'persistent',
			state: 'active',
			consumerGroup: options.consumerGroup,
			createdAt: new Date(),
		};

		// Save subscription to database (except for volatile)
		if (subscription.type !== 'volatile') {
			await this.saveSubscription(subscription);
		}

		// Store handler
		this.handlers.set(subscription.id, handler);

		// Start processing
		await this.startSubscription(subscription, options);

		return subscription;
	}

	/**
	 * Create a persistent subscription
	 */
	async createPersistentSubscription(
		name: string,
		eventTypes: string[],
		handler: EventHandler,
		options: Omit<SubscriptionOptions, 'type'> = {},
	): Promise<Subscription> {
		return this.subscribe(name, eventTypes, handler, {
			...options,
			type: 'persistent',
		});
	}

	/**
	 * Create a catch-up subscription
	 */
	async createCatchUpSubscription(
		name: string,
		eventTypes: string[],
		handler: EventHandler,
		options: Omit<SubscriptionOptions, 'type'> = {},
	): Promise<Subscription> {
		return this.subscribe(name, eventTypes, handler, {
			...options,
			type: 'catch_up',
		});
	}

	/**
	 * Create a competing consumers subscription
	 */
	async createCompetingSubscription(
		name: string,
		eventTypes: string[],
		consumerGroup: string,
		handler: EventHandler,
		options: Omit<SubscriptionOptions, 'type' | 'consumerGroup'> = {},
	): Promise<Subscription> {
		return this.subscribe(name, eventTypes, handler, {
			...options,
			type: 'competing',
			consumerGroup,
		});
	}

	/**
	 * Unsubscribe
	 */
	async unsubscribe(subscriptionId: string): Promise<void> {
		// Stop polling
		const interval = this.activeSubscriptions.get(subscriptionId);
		if (interval) {
			clearInterval(interval);
			this.activeSubscriptions.delete(subscriptionId);
		}

		// Remove handler
		this.handlers.delete(subscriptionId);

		// Update state to stopped
		await this.updateSubscriptionState(subscriptionId, 'stopped');
	}

	/**
	 * Pause subscription
	 */
	async pause(subscriptionId: string): Promise<void> {
		const interval = this.activeSubscriptions.get(subscriptionId);
		if (interval) {
			clearInterval(interval);
			this.activeSubscriptions.delete(subscriptionId);
		}

		await this.updateSubscriptionState(subscriptionId, 'paused');
	}

	/**
	 * Resume subscription
	 */
	async resume(subscriptionId: string): Promise<void> {
		// Load subscription
		const subscription = await this.getSubscription(subscriptionId);
		if (!subscription) {
			throw new Error(`Subscription ${subscriptionId} not found`);
		}

		const handler = this.handlers.get(subscriptionId);
		if (!handler) {
			throw new Error(`Handler for subscription ${subscriptionId} not found`);
		}

		// Update state
		await this.updateSubscriptionState(subscriptionId, 'active');

		// Start processing
		await this.startSubscription(subscription, {});
	}

	/**
	 * Start processing events for a subscription
	 */
	private async startSubscription(
		subscription: Subscription,
		options: SubscriptionOptions,
	): Promise<void> {
		const batchSize = options.batchSize ?? 10;
		const pollInterval = options.pollInterval ?? 1000;
		const handler = this.handlers.get(subscription.id);

		if (!handler) {
			throw new Error(`Handler for subscription ${subscription.id} not found`);
		}

		// For catch-up subscriptions, process all historical events first
		if (subscription.type === 'catch_up') {
			await this.updateSubscriptionState(subscription.id, 'catching_up');
			await this.processCatchUp(subscription, handler, batchSize, options.onError);
		}

		// Start polling for new events
		const interval = setInterval(() => {
			this.processNewEvents(subscription, handler, batchSize, options.onError).catch(
				(error) => {
					console.error(`Error processing events for subscription ${subscription.id}:`, error);
					if (options.onError) {
						options.onError(error);
					}
				},
			);
		}, pollInterval);

		this.activeSubscriptions.set(subscription.id, interval);
	}

	/**
	 * Process catch-up events
	 */
	private async processCatchUp(
		subscription: Subscription,
		handler: EventHandler,
		batchSize: number,
		onError?: (error: Error, event?: Event) => void,
	): Promise<void> {
		let hasMore = true;
		let currentPosition = subscription.position;

		while (hasMore) {
			// Get events
			const events = await this.eventStore.getEventsByTypes(subscription.eventTypes, {
				limit: batchSize,
			});

			// Filter events after current position
			const newEvents = events.filter((e) => {
				const eventPosition = new Date(e.timestamp).getTime();
				return eventPosition > currentPosition;
			});

			if (newEvents.length === 0) {
				hasMore = false;
				break;
			}

			// Process events
			for (const event of newEvents) {
				try {
					await handler(event);

					// Update position
					currentPosition = new Date(event.timestamp).getTime();
					await this.updateSubscriptionPosition(subscription.id, currentPosition, event);
				} catch (error) {
					if (onError) {
						onError(error as Error, event);
					}
					await this.updateSubscriptionState(subscription.id, 'error');
					throw error;
				}
			}

			hasMore = newEvents.length === batchSize;
		}

		// Update state to active
		await this.updateSubscriptionState(subscription.id, 'active');
	}

	/**
	 * Process new events
	 */
	private async processNewEvents(
		subscription: Subscription,
		handler: EventHandler,
		batchSize: number,
		onError?: (error: Error, event?: Event) => void,
	): Promise<void> {
		// Get current position
		const currentSubscription = await this.getSubscription(subscription.id);
		if (!currentSubscription) {
			return;
		}

		// Don't process if subscription is in error or stopped state
		if (currentSubscription.state === 'error' || currentSubscription.state === 'stopped') {
			// Clear the interval to stop polling
			const interval = this.activeSubscriptions.get(subscription.id);
			if (interval) {
				clearInterval(interval);
				this.activeSubscriptions.delete(subscription.id);
			}
			return;
		}

		const currentPosition = currentSubscription.position;

		// Get new events
		const events = await this.eventStore.getEventsByTypes(subscription.eventTypes, {
			limit: batchSize,
		});

		// Filter events after current position
		const newEvents = events.filter((e) => {
			const eventPosition = new Date(e.timestamp).getTime();
			return eventPosition > currentPosition;
		});

		if (newEvents.length === 0) {
			return;
		}

		// For competing consumers, try to claim events
		if (subscription.type === 'competing' && subscription.consumerGroup) {
			// In a real implementation, this would use a distributed lock
			// For now, we'll process all events
		}

		// Process events
		for (const event of newEvents) {
			try {
				await handler(event);

				// Update position
				const eventPosition = new Date(event.timestamp).getTime();
				await this.updateSubscriptionPosition(subscription.id, eventPosition, event);
			} catch (error) {
				if (onError) {
					onError(error as Error, event);
				}
				await this.updateSubscriptionState(subscription.id, 'error');

				// Stop polling on error by clearing the interval
				const interval = this.activeSubscriptions.get(subscription.id);
				if (interval) {
					clearInterval(interval);
					this.activeSubscriptions.delete(subscription.id);
				}
				return;
			}
		}
	}

	/**
	 * Get subscription
	 */
	async getSubscription(subscriptionId: string): Promise<Subscription | null> {
		const { data, error } = await this.supabase
			.from('subscriptions')
			.select('*')
			.eq('id', subscriptionId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get subscription: ${error.message}`);
		}

		return this.mapToSubscription(data);
	}

	/**
	 * Get all subscriptions
	 */
	async getAllSubscriptions(): Promise<Subscription[]> {
		const { data, error } = await this.supabase
			.from('subscriptions')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get subscriptions: ${error.message}`);
		}

		return (data || []).map(this.mapToSubscription);
	}

	/**
	 * Get subscriptions by consumer group
	 */
	async getSubscriptionsByGroup(consumerGroup: string): Promise<Subscription[]> {
		const { data, error } = await this.supabase
			.from('subscriptions')
			.select('*')
			.eq('consumer_group', consumerGroup)
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get subscriptions by group: ${error.message}`);
		}

		return (data || []).map(this.mapToSubscription);
	}

	/**
	 * Save subscription
	 */
	private async saveSubscription(subscription: Subscription): Promise<void> {
		const { error } = await this.supabase.from('subscriptions').upsert({
			id: subscription.id,
			name: subscription.name,
			event_types: subscription.eventTypes,
			position: subscription.position,
			type: subscription.type,
			state: subscription.state,
			consumer_group: subscription.consumerGroup,
			created_at: subscription.createdAt.toISOString(),
			last_event_id: subscription.lastEventId,
			last_event_timestamp: subscription.lastEventTimestamp?.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to save subscription: ${error.message}`);
		}
	}

	/**
	 * Update subscription state
	 */
	private async updateSubscriptionState(
		subscriptionId: string,
		state: SubscriptionState,
	): Promise<void> {
		const { error } = await this.supabase
			.from('subscriptions')
			.update({ state })
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to update subscription state: ${error.message}`);
		}
	}

	/**
	 * Update subscription position
	 */
	private async updateSubscriptionPosition(
		subscriptionId: string,
		position: number,
		lastEvent: Event,
	): Promise<void> {
		const { error } = await this.supabase
			.from('subscriptions')
			.update({
				position,
				last_event_id: lastEvent.id,
				last_event_timestamp: lastEvent.timestamp.toISOString(),
			})
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to update subscription position: ${error.message}`);
		}
	}

	/**
	 * Map database row to Subscription
	 */
	private mapToSubscription(row: Record<string, unknown>): Subscription {
		return {
			id: row.id as string,
			name: row.name as string,
			eventTypes: row.event_types as string[],
			position: row.position as number,
			type: row.type as SubscriptionType,
			state: row.state as SubscriptionState,
			consumerGroup: row.consumer_group as string | undefined,
			createdAt: new Date(row.created_at as string),
			lastEventId: row.last_event_id as string | undefined,
			lastEventTimestamp: row.last_event_timestamp
				? new Date(row.last_event_timestamp as string)
				: undefined,
		};
	}

	/**
	 * Stop all subscriptions
	 */
	async stopAll(): Promise<void> {
		const subscriptionIds = Array.from(this.activeSubscriptions.keys());
		await Promise.all(subscriptionIds.map((id) => this.unsubscribe(id)));
	}

	/**
	 * Delete subscription
	 */
	async deleteSubscription(subscriptionId: string): Promise<void> {
		// Unsubscribe first
		await this.unsubscribe(subscriptionId);

		// Delete from database
		const { error } = await this.supabase
			.from('subscriptions')
			.delete()
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to delete subscription: ${error.message}`);
		}
	}

	/**
	 * Reset subscription position
	 */
	async resetPosition(subscriptionId: string, position: number = 0): Promise<void> {
		const { error } = await this.supabase
			.from('subscriptions')
			.update({
				position,
				last_event_id: null,
				last_event_timestamp: null,
			})
			.eq('id', subscriptionId);

		if (error) {
			throw new Error(`Failed to reset subscription position: ${error.message}`);
		}
	}
}
