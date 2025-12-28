import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from './types';
import type { AggregateRoot } from './aggregates';
import type { EventStore } from './event-store';

/**
 * Snapshot strategy interface
 */
export interface SnapshotStrategy {
	/** Determine if a snapshot should be created */
	shouldCreateSnapshot(currentVersion: number, lastSnapshotVersion: number): boolean;
}

/**
 * Snapshot every N events strategy
 */
export class EveryNEventsStrategy implements SnapshotStrategy {
	constructor(private readonly frequency: number) {}

	shouldCreateSnapshot(currentVersion: number, lastSnapshotVersion: number): boolean {
		return currentVersion - lastSnapshotVersion >= this.frequency;
	}
}

/**
 * Time-based snapshot strategy
 */
export class TimeBasedStrategy implements SnapshotStrategy {
	constructor(private readonly intervalMs: number) {}

	shouldCreateSnapshot(currentVersion: number, lastSnapshotVersion: number): boolean {
		// This would need access to timestamp, simplified implementation
		return currentVersion > lastSnapshotVersion;
	}
}

/**
 * Snapshot store options
 */
export interface SnapshotStoreOptions {
	/** Snapshot strategy */
	strategy?: SnapshotStrategy;
	/** Maximum number of snapshots to keep per aggregate */
	maxSnapshots?: number;
	/** Compression enabled */
	compression?: boolean;
}

/**
 * Snapshot store for saving and loading aggregate snapshots
 * Optimizes aggregate loading by reducing event replay
 */
export class SnapshotStore {
	private supabase: SupabaseClient;
	private eventStore: EventStore;
	private options: Required<SnapshotStoreOptions>;

	constructor(
		supabaseUrl: string,
		supabaseKey: string,
		eventStore: EventStore,
		options: SnapshotStoreOptions = {},
	) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.eventStore = eventStore;
		this.options = {
			strategy: options.strategy ?? new EveryNEventsStrategy(10),
			maxSnapshots: options.maxSnapshots ?? 5,
			compression: options.compression ?? false,
		};
	}

	/**
	 * Save a snapshot of an aggregate
	 */
	async save<T extends AggregateRoot>(aggregate: T): Promise<void> {
		const snapshot: Snapshot = {
			id: uuidv4(),
			aggregateId: aggregate.id,
			aggregateType: aggregate.aggregateType,
			version: aggregate.version,
			state: aggregate.toSnapshot(),
			timestamp: new Date(),
		};

		// Save to database
		const { error } = await this.supabase.from('snapshots').insert({
			id: snapshot.id,
			aggregate_id: snapshot.aggregateId,
			aggregate_type: snapshot.aggregateType,
			version: snapshot.version,
			state: snapshot.state,
			timestamp: snapshot.timestamp.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to save snapshot: ${error.message}`);
		}

		// Cleanup old snapshots
		await this.cleanupOldSnapshots(aggregate.id);
	}

	/**
	 * Load the latest snapshot for an aggregate
	 */
	async load(aggregateId: string): Promise<Snapshot | null> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('*')
			.eq('aggregate_id', aggregateId)
			.order('version', { ascending: false })
			.limit(1);

		if (error) {
			throw new Error(`Failed to load snapshot: ${error.message}`);
		}

		if (!data || data.length === 0) {
			return null;
		}

		return this.mapToSnapshot(data[0]);
	}

	/**
	 * Load a specific snapshot by version
	 */
	async loadByVersion(aggregateId: string, version: number): Promise<Snapshot | null> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('*')
			.eq('aggregate_id', aggregateId)
			.lte('version', version)
			.order('version', { ascending: false })
			.limit(1);

		if (error) {
			throw new Error(`Failed to load snapshot by version: ${error.message}`);
		}

		if (!data || data.length === 0) {
			return null;
		}

		return this.mapToSnapshot(data[0]);
	}

	/**
	 * Load aggregate with snapshot optimization
	 */
	async loadAggregate<T extends AggregateRoot>(
		AggregateClass: new (id?: string) => T,
		aggregateId: string,
	): Promise<T | null> {
		// Try to load the latest snapshot
		const snapshot = await this.load(aggregateId);

		let aggregate: T;
		let fromVersion = 0;

		if (snapshot) {
			// Create aggregate and restore from snapshot
			aggregate = new AggregateClass(aggregateId);
			aggregate.fromSnapshot(snapshot.state);

			// Set version from snapshot
			// Note: This requires the aggregate to expose a way to set version
			// In a real implementation, you might need to adjust the AggregateRoot base class
			fromVersion = snapshot.version;
		} else {
			// Create new aggregate
			aggregate = new AggregateClass(aggregateId);
		}

		// Load events after snapshot
		const events = await this.eventStore.getEvents(aggregateId, {
			fromVersion: fromVersion + 1,
		});

		if (events.length === 0 && !snapshot) {
			// No snapshot and no events means aggregate doesn't exist
			return null;
		}

		// Apply events
		aggregate.hydrate(events);

		return aggregate;
	}

	/**
	 * Check if a snapshot should be created
	 */
	async shouldCreateSnapshot(aggregate: AggregateRoot): Promise<boolean> {
		const lastSnapshot = await this.load(aggregate.id);
		const lastSnapshotVersion = lastSnapshot?.version ?? 0;

		return this.options.strategy.shouldCreateSnapshot(aggregate.version, lastSnapshotVersion);
	}

	/**
	 * Save snapshot if needed based on strategy
	 */
	async saveIfNeeded<T extends AggregateRoot>(aggregate: T): Promise<boolean> {
		if (await this.shouldCreateSnapshot(aggregate)) {
			await this.save(aggregate);
			return true;
		}
		return false;
	}

	/**
	 * Get all snapshots for an aggregate
	 */
	async getSnapshots(aggregateId: string): Promise<Snapshot[]> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('*')
			.eq('aggregate_id', aggregateId)
			.order('version', { ascending: false });

		if (error) {
			throw new Error(`Failed to get snapshots: ${error.message}`);
		}

		return (data || []).map(this.mapToSnapshot);
	}

	/**
	 * Delete all snapshots for an aggregate
	 */
	async deleteSnapshots(aggregateId: string): Promise<void> {
		const { error } = await this.supabase
			.from('snapshots')
			.delete()
			.eq('aggregate_id', aggregateId);

		if (error) {
			throw new Error(`Failed to delete snapshots: ${error.message}`);
		}
	}

	/**
	 * Delete a specific snapshot
	 */
	async deleteSnapshot(snapshotId: string): Promise<void> {
		const { error } = await this.supabase.from('snapshots').delete().eq('id', snapshotId);

		if (error) {
			throw new Error(`Failed to delete snapshot: ${error.message}`);
		}
	}

	/**
	 * Cleanup old snapshots for an aggregate
	 */
	private async cleanupOldSnapshots(aggregateId: string): Promise<void> {
		// Get all snapshots for this aggregate
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('id')
			.eq('aggregate_id', aggregateId)
			.order('version', { ascending: false });

		if (error) {
			throw new Error(`Failed to get snapshots for cleanup: ${error.message}`);
		}

		if (!data || data.length <= this.options.maxSnapshots) {
			return;
		}

		// Delete old snapshots beyond maxSnapshots
		const snapshotsToDelete = data.slice(this.options.maxSnapshots);
		const idsToDelete = snapshotsToDelete.map((s) => s.id);

		const { error: deleteError } = await this.supabase
			.from('snapshots')
			.delete()
			.in('id', idsToDelete);

		if (deleteError) {
			throw new Error(`Failed to cleanup old snapshots: ${deleteError.message}`);
		}
	}

	/**
	 * Get snapshot statistics
	 */
	async getStatistics(): Promise<{
		totalSnapshots: number;
		aggregatesWithSnapshots: number;
		averageSnapshotsPerAggregate: number;
		oldestSnapshot?: Date;
		newestSnapshot?: Date;
	}> {
		const [totalCount, aggregateCount, oldestSnapshot, newestSnapshot] = await Promise.all([
			this.getTotalSnapshotCount(),
			this.getAggregateCount(),
			this.getOldestSnapshot(),
			this.getNewestSnapshot(),
		]);

		return {
			totalSnapshots: totalCount,
			aggregatesWithSnapshots: aggregateCount,
			averageSnapshotsPerAggregate:
				aggregateCount > 0 ? totalCount / aggregateCount : 0,
			oldestSnapshot: oldestSnapshot?.timestamp,
			newestSnapshot: newestSnapshot?.timestamp,
		};
	}

	/**
	 * Get total snapshot count
	 */
	private async getTotalSnapshotCount(): Promise<number> {
		const { count, error } = await this.supabase
			.from('snapshots')
			.select('*', { count: 'exact', head: true });

		if (error) {
			throw new Error(`Failed to get total snapshot count: ${error.message}`);
		}

		return count || 0;
	}

	/**
	 * Get count of aggregates with snapshots
	 */
	private async getAggregateCount(): Promise<number> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('aggregate_id');

		if (error) {
			throw new Error(`Failed to get aggregate count: ${error.message}`);
		}

		const uniqueAggregates = new Set((data || []).map((row) => row.aggregate_id));
		return uniqueAggregates.size;
	}

	/**
	 * Get oldest snapshot
	 */
	private async getOldestSnapshot(): Promise<Snapshot | undefined> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('*')
			.order('timestamp', { ascending: true })
			.limit(1);

		if (error) {
			throw new Error(`Failed to get oldest snapshot: ${error.message}`);
		}

		return data?.[0] ? this.mapToSnapshot(data[0]) : undefined;
	}

	/**
	 * Get newest snapshot
	 */
	private async getNewestSnapshot(): Promise<Snapshot | undefined> {
		const { data, error } = await this.supabase
			.from('snapshots')
			.select('*')
			.order('timestamp', { ascending: false })
			.limit(1);

		if (error) {
			throw new Error(`Failed to get newest snapshot: ${error.message}`);
		}

		return data?.[0] ? this.mapToSnapshot(data[0]) : undefined;
	}

	/**
	 * Map database row to Snapshot
	 */
	private mapToSnapshot(row: Record<string, unknown>): Snapshot {
		return {
			id: row.id as string,
			aggregateId: row.aggregate_id as string,
			aggregateType: row.aggregate_type as string,
			version: row.version as number,
			state: row.state as Record<string, unknown>,
			timestamp: new Date(row.timestamp as string),
		};
	}

	/**
	 * Rebuild snapshots for all aggregates
	 */
	async rebuildAllSnapshots(): Promise<void> {
		// Get all unique aggregate IDs
		const aggregateIds = await this.eventStore.getAggregateIds();

		for (const aggregateId of aggregateIds) {
			// Get events for this aggregate
			const events = await this.eventStore.getEvents(aggregateId);

			if (events.length === 0) {
				continue;
			}

			// Create snapshots at regular intervals
			// This is a simplified example - in reality, you'd need to reconstruct
			// the aggregate at each snapshot point
			// For now, we'll just create a snapshot at the latest version
			// A real implementation would need the aggregate class
		}
	}

	/**
	 * Set snapshot strategy
	 */
	setStrategy(strategy: SnapshotStrategy): void {
		this.options.strategy = strategy;
	}

	/**
	 * Get current strategy
	 */
	getStrategy(): SnapshotStrategy {
		return this.options.strategy;
	}
}
