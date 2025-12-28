import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Event, EventStreamOptions } from './types';
import { EventStreamOptionsSchema } from './types';

/**
 * Concurrency exception thrown when optimistic locking fails
 */
export class ConcurrencyError extends Error {
	constructor(
		public readonly aggregateId: string,
		public readonly expectedVersion: number,
		public readonly actualVersion: number,
	) {
		super(
			`Concurrency conflict for aggregate ${aggregateId}: expected version ${expectedVersion}, but actual version is ${actualVersion}`,
		);
		this.name = 'ConcurrencyError';
	}
}

/**
 * Event store for append-only event storage
 * Provides optimistic concurrency control and temporal queries
 */
export class EventStore {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Append events to an aggregate's event stream
	 * Implements optimistic concurrency control
	 */
	async append(aggregateId: string, events: Event[], expectedVersion?: number): Promise<void> {
		if (events.length === 0) {
			return;
		}

		// Validate all events belong to the same aggregate
		const invalidEvent = events.find((e) => e.aggregateId !== aggregateId);
		if (invalidEvent) {
			throw new Error(
				`Event ${invalidEvent.id} belongs to aggregate ${invalidEvent.aggregateId}, expected ${aggregateId}`,
			);
		}

		// Start a transaction
		const { data: currentVersion, error: versionError } = await this.supabase.rpc(
			'get_aggregate_version',
			{
				p_aggregate_id: aggregateId,
			},
		);

		if (versionError) {
			throw new Error(`Failed to get current version: ${versionError.message}`);
		}

		const actualVersion = (currentVersion as number) || 0;

		// Check optimistic concurrency
		if (expectedVersion !== undefined && actualVersion !== expectedVersion) {
			throw new ConcurrencyError(aggregateId, expectedVersion, actualVersion);
		}

		// Prepare events for insertion
		const eventsToInsert = events.map((event, index) => ({
			id: event.id || uuidv4(),
			type: event.type,
			aggregate_id: event.aggregateId,
			aggregate_type: event.aggregateType,
			data: event.data,
			metadata: event.metadata || {},
			version: actualVersion + index + 1,
			timestamp: event.timestamp || new Date(),
		}));

		// Insert events (append-only)
		const { error: insertError } = await this.supabase.from('events').insert(eventsToInsert);

		if (insertError) {
			// Check for unique constraint violation (concurrent append)
			if (insertError.code === '23505') {
				throw new ConcurrencyError(aggregateId, expectedVersion || actualVersion, actualVersion);
			}
			throw new Error(`Failed to append events: ${insertError.message}`);
		}
	}

	/**
	 * Get all events for an aggregate
	 */
	async getEvents(aggregateId: string, options: EventStreamOptions = {}): Promise<Event[]> {
		const validatedOptions = EventStreamOptionsSchema.parse(options);

		let query = this.supabase
			.from('events')
			.select('*')
			.eq('aggregate_id', aggregateId)
			.order('version', { ascending: validatedOptions.direction !== 'backward' });

		// Apply version filters
		if (validatedOptions.fromVersion !== undefined) {
			query = query.gte('version', validatedOptions.fromVersion);
		}
		if (validatedOptions.toVersion !== undefined) {
			query = query.lte('version', validatedOptions.toVersion);
		}

		// Apply timestamp filters
		if (validatedOptions.fromTimestamp !== undefined) {
			query = query.gte('timestamp', validatedOptions.fromTimestamp.toISOString());
		}
		if (validatedOptions.toTimestamp !== undefined) {
			query = query.lte('timestamp', validatedOptions.toTimestamp.toISOString());
		}

		// Apply limit
		if (validatedOptions.limit !== undefined) {
			query = query.limit(validatedOptions.limit);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get events: ${error.message}`);
		}

		return (data || []).map(this.mapToEvent);
	}

	/**
	 * Get events by type across all aggregates
	 */
	async getEventsByType(type: string, options: EventStreamOptions = {}): Promise<Event[]> {
		const validatedOptions = EventStreamOptionsSchema.parse(options);

		let query = this.supabase
			.from('events')
			.select('*')
			.eq('type', type)
			.order('timestamp', { ascending: validatedOptions.direction !== 'backward' });

		// Apply timestamp filters
		if (validatedOptions.fromTimestamp !== undefined) {
			query = query.gte('timestamp', validatedOptions.fromTimestamp.toISOString());
		}
		if (validatedOptions.toTimestamp !== undefined) {
			query = query.lte('timestamp', validatedOptions.toTimestamp.toISOString());
		}

		// Apply limit
		if (validatedOptions.limit !== undefined) {
			query = query.limit(validatedOptions.limit);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get events by type: ${error.message}`);
		}

		return (data || []).map(this.mapToEvent);
	}

	/**
	 * Get events by multiple types
	 */
	async getEventsByTypes(types: string[], options: EventStreamOptions = {}): Promise<Event[]> {
		const validatedOptions = EventStreamOptionsSchema.parse(options);

		let query = this.supabase
			.from('events')
			.select('*')
			.in('type', types)
			.order('timestamp', { ascending: validatedOptions.direction !== 'backward' });

		// Apply timestamp filters
		if (validatedOptions.fromTimestamp !== undefined) {
			query = query.gte('timestamp', validatedOptions.fromTimestamp.toISOString());
		}
		if (validatedOptions.toTimestamp !== undefined) {
			query = query.lte('timestamp', validatedOptions.toTimestamp.toISOString());
		}

		// Apply limit
		if (validatedOptions.limit !== undefined) {
			query = query.limit(validatedOptions.limit);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get events by types: ${error.message}`);
		}

		return (data || []).map(this.mapToEvent);
	}

	/**
	 * Get all events in the store (for replay scenarios)
	 */
	async getAllEvents(options: EventStreamOptions = {}): Promise<Event[]> {
		const validatedOptions = EventStreamOptionsSchema.parse(options);

		let query = this.supabase
			.from('events')
			.select('*')
			.order('timestamp', { ascending: validatedOptions.direction !== 'backward' });

		// Apply timestamp filters
		if (validatedOptions.fromTimestamp !== undefined) {
			query = query.gte('timestamp', validatedOptions.fromTimestamp.toISOString());
		}
		if (validatedOptions.toTimestamp !== undefined) {
			query = query.lte('timestamp', validatedOptions.toTimestamp.toISOString());
		}

		// Apply limit
		if (validatedOptions.limit !== undefined) {
			query = query.limit(validatedOptions.limit);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get all events: ${error.message}`);
		}

		return (data || []).map(this.mapToEvent);
	}

	/**
	 * Get events in a time range
	 */
	async getEventsByTimeRange(fromDate: Date, toDate: Date, limit?: number): Promise<Event[]> {
		return this.getAllEvents({
			fromTimestamp: fromDate,
			toTimestamp: toDate,
			limit,
		});
	}

	/**
	 * Get the current version of an aggregate
	 */
	async getAggregateVersion(aggregateId: string): Promise<number> {
		const { data, error } = await this.supabase.rpc('get_aggregate_version', {
			p_aggregate_id: aggregateId,
		});

		if (error) {
			throw new Error(`Failed to get aggregate version: ${error.message}`);
		}

		return (data as number) || 0;
	}

	/**
	 * Check if an aggregate exists
	 */
	async aggregateExists(aggregateId: string): Promise<boolean> {
		const { data, error } = await this.supabase
			.from('events')
			.select('id')
			.eq('aggregate_id', aggregateId)
			.limit(1);

		if (error) {
			throw new Error(`Failed to check aggregate existence: ${error.message}`);
		}

		return (data?.length || 0) > 0;
	}

	/**
	 * Get event count for an aggregate
	 */
	async getEventCount(aggregateId: string): Promise<number> {
		const { count, error } = await this.supabase
			.from('events')
			.select('*', { count: 'exact', head: true })
			.eq('aggregate_id', aggregateId);

		if (error) {
			throw new Error(`Failed to get event count: ${error.message}`);
		}

		return count || 0;
	}

	/**
	 * Get total event count in the store
	 */
	async getTotalEventCount(): Promise<number> {
		const { count, error } = await this.supabase
			.from('events')
			.select('*', { count: 'exact', head: true });

		if (error) {
			throw new Error(`Failed to get total event count: ${error.message}`);
		}

		return count || 0;
	}

	/**
	 * Get events with pagination
	 */
	async getEventsPaginated(
		page: number = 1,
		pageSize: number = 100,
	): Promise<{ events: Event[]; total: number; pages: number }> {
		const from = (page - 1) * pageSize;
		const to = from + pageSize - 1;

		const { data, error, count } = await this.supabase
			.from('events')
			.select('*', { count: 'exact' })
			.order('timestamp', { ascending: true })
			.range(from, to);

		if (error) {
			throw new Error(`Failed to get paginated events: ${error.message}`);
		}

		return {
			events: (data || []).map(this.mapToEvent),
			total: count || 0,
			pages: Math.ceil((count || 0) / pageSize),
		};
	}

	/**
	 * Map database row to Event object
	 */
	private mapToEvent(row: Record<string, unknown>): Event {
		return {
			id: row.id as string,
			type: row.type as string,
			aggregateId: row.aggregate_id as string,
			aggregateType: row.aggregate_type as string,
			data: row.data as Record<string, unknown>,
			timestamp: new Date(row.timestamp as string),
			version: row.version as number,
			metadata: (row.metadata as Record<string, unknown>) || undefined,
		};
	}

	/**
	 * Delete all events for an aggregate (use with caution!)
	 * This violates the append-only principle and should only be used for testing
	 */
	async deleteAggregateEvents(aggregateId: string): Promise<void> {
		const { error } = await this.supabase.from('events').delete().eq('aggregate_id', aggregateId);

		if (error) {
			throw new Error(`Failed to delete aggregate events: ${error.message}`);
		}
	}

	/**
	 * Get distinct aggregate IDs
	 */
	async getAggregateIds(aggregateType?: string): Promise<string[]> {
		let query = this.supabase.from('events').select('aggregate_id');

		if (aggregateType) {
			query = query.eq('aggregate_type', aggregateType);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get aggregate IDs: ${error.message}`);
		}

		// Get unique aggregate IDs
		const uniqueIds = new Set((data || []).map((row) => row.aggregate_id));
		return Array.from(uniqueIds);
	}

	/**
	 * Get event statistics
	 */
	async getStatistics(): Promise<{
		totalEvents: number;
		totalAggregates: number;
		eventsByType: Record<string, number>;
		oldestEvent?: Date;
		newestEvent?: Date;
	}> {
		const [totalEvents, aggregateIds, eventTypes, oldestEvent, newestEvent] = await Promise.all([
			this.getTotalEventCount(),
			this.getAggregateIds(),
			this.getEventTypes(),
			this.getOldestEvent(),
			this.getNewestEvent(),
		]);

		const eventsByType: Record<string, number> = {};
		for (const type of eventTypes) {
			const { count } = await this.supabase
				.from('events')
				.select('*', { count: 'exact', head: true })
				.eq('type', type);
			eventsByType[type] = count || 0;
		}

		return {
			totalEvents,
			totalAggregates: aggregateIds.length,
			eventsByType,
			oldestEvent: oldestEvent?.timestamp,
			newestEvent: newestEvent?.timestamp,
		};
	}

	/**
	 * Get distinct event types
	 */
	private async getEventTypes(): Promise<string[]> {
		const { data, error } = await this.supabase.from('events').select('type');

		if (error) {
			throw new Error(`Failed to get event types: ${error.message}`);
		}

		const uniqueTypes = new Set((data || []).map((row) => row.type));
		return Array.from(uniqueTypes);
	}

	/**
	 * Get oldest event
	 */
	private async getOldestEvent(): Promise<Event | undefined> {
		const { data, error } = await this.supabase
			.from('events')
			.select('*')
			.order('timestamp', { ascending: true })
			.limit(1);

		if (error) {
			throw new Error(`Failed to get oldest event: ${error.message}`);
		}

		return data?.[0] ? this.mapToEvent(data[0]) : undefined;
	}

	/**
	 * Get newest event
	 */
	private async getNewestEvent(): Promise<Event | undefined> {
		const { data, error } = await this.supabase
			.from('events')
			.select('*')
			.order('timestamp', { ascending: false })
			.limit(1);

		if (error) {
			throw new Error(`Failed to get newest event: ${error.message}`);
		}

		return data?.[0] ? this.mapToEvent(data[0]) : undefined;
	}
}
