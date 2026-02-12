import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Event, Projection, ProjectionState, EventHandler } from './types';
import type { EventStore } from './event-store';

/**
 * Projection handler interface
 */
export interface ProjectionHandler {
	/** Projection name */
	name: string;
	/** Event types this projection subscribes to */
	eventTypes: string[];
	/** Handle an event */
	handle(event: Event): Promise<void>;
	/** Reset the projection */
	reset?(): Promise<void>;
}

/**
 * Projection manager for managing event projections
 * Creates and maintains read models from events
 */
export class ProjectionManager {
	private supabase: SupabaseClient;
	private eventStore: EventStore;
	private projections: Map<string, ProjectionHandler> = new Map();
	private runningProjections: Set<string> = new Set();
	private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

	constructor(
		supabaseUrl: string,
		supabaseKey: string,
		eventStore: EventStore,
	) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.eventStore = eventStore;
	}

	/**
	 * Register a projection
	 */
	async register(projection: ProjectionHandler): Promise<void> {
		if (this.projections.has(projection.name)) {
			throw new Error(`Projection ${projection.name} already registered`);
		}

		this.projections.set(projection.name, projection);

		// Create or update projection record in database
		const { error } = await this.supabase.from('projections').upsert({
			id: projection.name,
			name: projection.name,
			event_types: projection.eventTypes,
			position: 0,
			state: 'stopped',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to register projection: ${error.message}`);
		}
	}

	/**
	 * Unregister a projection
	 */
	async unregister(projectionId: string): Promise<void> {
		await this.stop(projectionId);
		this.projections.delete(projectionId);
	}

	/**
	 * Start a projection
	 */
	async start(projectionId: string, pollInterval: number = 1000): Promise<void> {
		const projection = this.projections.get(projectionId);
		if (!projection) {
			throw new Error(`Projection ${projectionId} not found`);
		}

		if (this.runningProjections.has(projectionId)) {
			return; // Already running
		}

		// Update state to running
		await this.updateProjectionState(projectionId, 'running');

		this.runningProjections.add(projectionId);

		// Start polling for new events
		const interval = setInterval(() => {
			this.processEvents(projectionId).catch((error) => {
				console.error(`Error processing events for projection ${projectionId}:`, error);
			});
		}, pollInterval);

		this.pollingIntervals.set(projectionId, interval);

		// Process any existing events immediately
		await this.processEvents(projectionId);
	}

	/**
	 * Stop a projection
	 */
	async stop(projectionId: string): Promise<void> {
		const interval = this.pollingIntervals.get(projectionId);
		if (interval) {
			clearInterval(interval);
			this.pollingIntervals.delete(projectionId);
		}

		this.runningProjections.delete(projectionId);

		await this.updateProjectionState(projectionId, 'stopped');
	}

	/**
	 * Rebuild a projection from scratch
	 */
	async rebuild(projectionId: string): Promise<void> {
		const projection = this.projections.get(projectionId);
		if (!projection) {
			throw new Error(`Projection ${projectionId} not found`);
		}

		// Stop if running
		const wasRunning = this.runningProjections.has(projectionId);
		if (wasRunning) {
			await this.stop(projectionId);
		}

		// Update state to rebuilding
		await this.updateProjectionState(projectionId, 'rebuilding');

		try {
			// Reset the projection
			if (projection.reset) {
				await projection.reset();
			}

			// Reset position to 0
			await this.updateProjectionPosition(projectionId, 0);

			// Process all events
			await this.processAllEvents(projectionId);

			// Update state back to stopped
			await this.updateProjectionState(projectionId, 'stopped');

			// Restart if it was running
			if (wasRunning) {
				await this.start(projectionId);
			}
		} catch (error) {
			await this.updateProjectionState(projectionId, 'error');
			throw error;
		}
	}

	/**
	 * Process new events for a projection
	 */
	private async processEvents(projectionId: string): Promise<void> {
		const projection = this.projections.get(projectionId);
		if (!projection) {
			return;
		}

		// Get current position
		const currentPosition = await this.getProjectionPosition(projectionId);

		// Get new events
		const events = await this.eventStore.getEventsByTypes(projection.eventTypes, {
			limit: 100,
		});

		// Filter events after current position
		const newEvents = events.filter((e) => {
			const eventPosition = new Date(e.timestamp).getTime();
			return eventPosition > currentPosition;
		});

		if (newEvents.length === 0) {
			return;
		}

		// Process events in order
		for (const event of newEvents) {
			try {
				await projection.handle(event);

				// Update position
				const eventPosition = new Date(event.timestamp).getTime();
				await this.updateProjectionPosition(projectionId, eventPosition, event.timestamp);
			} catch (error) {
				console.error(`Error handling event ${event.id} in projection ${projectionId}:`, error);
				await this.updateProjectionState(projectionId, 'error');
				throw error;
			}
		}
	}

	/**
	 * Process all events for a projection (used during rebuild)
	 */
	private async processAllEvents(projectionId: string): Promise<void> {
		const projection = this.projections.get(projectionId);
		if (!projection) {
			return;
		}

		let hasMore = true;
		let lastTimestamp: Date | undefined;

		while (hasMore) {
			// Get events in batches
			const events = await this.eventStore.getEventsByTypes(projection.eventTypes, {
				fromTimestamp: lastTimestamp,
				limit: 100,
			});

			if (events.length === 0) {
				hasMore = false;
				break;
			}

			// Process events
			for (const event of events) {
				await projection.handle(event);

				// Update position
				const eventPosition = new Date(event.timestamp).getTime();
				await this.updateProjectionPosition(projectionId, eventPosition, event.timestamp);

				lastTimestamp = event.timestamp;
			}

			// Check if we have more events
			hasMore = events.length === 100;
		}
	}

	/**
	 * Get projection details
	 */
	async getProjection(projectionId: string): Promise<Projection | null> {
		const { data, error } = await this.supabase
			.from('projections')
			.select('*')
			.eq('id', projectionId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get projection: ${error.message}`);
		}

		return this.mapToProjection(data);
	}

	/**
	 * Get all projections
	 */
	async getAllProjections(): Promise<Projection[]> {
		const { data, error } = await this.supabase.from('projections').select('*');

		if (error) {
			throw new Error(`Failed to get projections: ${error.message}`);
		}

		return (data || []).map(this.mapToProjection);
	}

	/**
	 * Update projection state
	 */
	private async updateProjectionState(
		projectionId: string,
		state: ProjectionState,
	): Promise<void> {
		const { error } = await this.supabase
			.from('projections')
			.update({
				state,
				updated_at: new Date().toISOString(),
			})
			.eq('id', projectionId);

		if (error) {
			throw new Error(`Failed to update projection state: ${error.message}`);
		}
	}

	/**
	 * Update projection position
	 */
	private async updateProjectionPosition(
		projectionId: string,
		position: number,
		lastEventTimestamp?: Date,
	): Promise<void> {
		const updateData: Record<string, unknown> = {
			position,
			updated_at: new Date().toISOString(),
		};

		if (lastEventTimestamp) {
			updateData.last_event_timestamp = lastEventTimestamp.toISOString();
		}

		const { error } = await this.supabase
			.from('projections')
			.update(updateData)
			.eq('id', projectionId);

		if (error) {
			throw new Error(`Failed to update projection position: ${error.message}`);
		}
	}

	/**
	 * Get projection position
	 */
	private async getProjectionPosition(projectionId: string): Promise<number> {
		const { data, error } = await this.supabase
			.from('projections')
			.select('position')
			.eq('id', projectionId)
			.single();

		if (error) {
			throw new Error(`Failed to get projection position: ${error.message}`);
		}

		return (data?.position as number) || 0;
	}

	/**
	 * Map database row to Projection
	 */
	private mapToProjection(row: Record<string, unknown>): Projection {
		return {
			id: row.id as string,
			name: row.name as string,
			eventTypes: row.event_types as string[],
			position: row.position as number,
			lastEventTimestamp: row.last_event_timestamp
				? new Date(row.last_event_timestamp as string)
				: undefined,
			state: row.state as ProjectionState,
			createdAt: new Date(row.created_at as string),
			updatedAt: new Date(row.updated_at as string),
		};
	}

	/**
	 * Stop all projections
	 */
	async stopAll(): Promise<void> {
		const projectionIds = Array.from(this.projections.keys());
		await Promise.all(projectionIds.map((id) => this.stop(id)));
	}

	/**
	 * Start all registered projections
	 */
	async startAll(): Promise<void> {
		const projectionIds = Array.from(this.projections.keys());
		await Promise.all(projectionIds.map((id) => this.start(id)));
	}
}

/**
 * Simple projection builder helper
 */
export class ProjectionBuilder {
	private name: string;
	private eventHandlers: Map<string, EventHandler> = new Map();
	private resetHandler?: () => Promise<void>;

	constructor(name: string) {
		this.name = name;
	}

	/**
	 * Add an event handler
	 */
	on(eventType: string, handler: EventHandler): this {
		this.eventHandlers.set(eventType, handler);
		return this;
	}

	/**
	 * Set reset handler
	 */
	onReset(handler: () => Promise<void>): this {
		this.resetHandler = handler;
		return this;
	}

	/**
	 * Build the projection handler
	 */
	build(): ProjectionHandler {
		const eventTypes = Array.from(this.eventHandlers.keys());

		return {
			name: this.name,
			eventTypes,
			handle: async (event: Event) => {
				const handler = this.eventHandlers.get(event.type);
				if (handler) {
					await handler(event);
				}
			},
			reset: this.resetHandler,
		};
	}
}

/**
 * Example projection: Workflow summary
 */
export function createWorkflowSummaryProjection(supabase: SupabaseClient): ProjectionHandler {
	return new ProjectionBuilder('workflow-summary')
		.on('workflow.created', async (event) => {
			await supabase.from('workflow_summary').insert({
				id: event.aggregateId,
				name: (event.data as { name: string }).name,
				description: (event.data as { description: string }).description,
				node_count: 0,
				edge_count: 0,
				status: 'draft',
				tags: [],
				created_at: event.timestamp.toISOString(),
				updated_at: event.timestamp.toISOString(),
			});
		})
		.on('workflow.updated', async (event) => {
			await supabase
				.from('workflow_summary')
				.update({
					name: (event.data as { name: string }).name,
					description: (event.data as { description: string }).description,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.node.added', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('node_count')
				.eq('id', event.aggregateId)
				.single();

			await supabase
				.from('workflow_summary')
				.update({
					node_count: ((data?.node_count as number) || 0) + 1,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.node.removed', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('node_count')
				.eq('id', event.aggregateId)
				.single();

			await supabase
				.from('workflow_summary')
				.update({
					node_count: Math.max(0, ((data?.node_count as number) || 0) - 1),
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.edge.added', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('edge_count')
				.eq('id', event.aggregateId)
				.single();

			await supabase
				.from('workflow_summary')
				.update({
					edge_count: ((data?.edge_count as number) || 0) + 1,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.edge.removed', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('edge_count')
				.eq('id', event.aggregateId)
				.single();

			await supabase
				.from('workflow_summary')
				.update({
					edge_count: Math.max(0, ((data?.edge_count as number) || 0) - 1),
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.status.changed', async (event) => {
			await supabase
				.from('workflow_summary')
				.update({
					status: (event.data as { to: string }).to,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.tagged', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('tags')
				.eq('id', event.aggregateId)
				.single();

			const tags = (data?.tags as string[]) || [];
			tags.push((event.data as { tag: string }).tag);

			await supabase
				.from('workflow_summary')
				.update({
					tags,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.on('workflow.untagged', async (event) => {
			const { data } = await supabase
				.from('workflow_summary')
				.select('tags')
				.eq('id', event.aggregateId)
				.single();

			const tags = ((data?.tags as string[]) || []).filter(
				(t) => t !== (event.data as { tag: string }).tag,
			);

			await supabase
				.from('workflow_summary')
				.update({
					tags,
					updated_at: event.timestamp.toISOString(),
				})
				.eq('id', event.aggregateId);
		})
		.onReset(async () => {
			await supabase.from('workflow_summary').delete().neq('id', '');
		})
		.build();
}
