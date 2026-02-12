import type { Event, ReplayOptions, ReplayProgress, EventHandler } from './types';
import { ReplayOptionsSchema } from './types';
import type { EventStore } from './event-store';
import type { AggregateRoot } from './aggregates';

/**
 * Replay status
 */
export enum ReplayStatus {
	NOT_STARTED = 'not_started',
	RUNNING = 'running',
	PAUSED = 'paused',
	COMPLETED = 'completed',
	FAILED = 'failed',
}

/**
 * Replay result
 */
export interface ReplayResult {
	status: ReplayStatus;
	totalEvents: number;
	processedEvents: number;
	failedEvents: number;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	errors: Array<{ event: Event; error: Error }>;
}

/**
 * Replay engine for event replay
 * Supports full replay, partial replay, and point-in-time reconstruction
 */
export class ReplayEngine {
	private eventStore: EventStore;
	private status: ReplayStatus = ReplayStatus.NOT_STARTED;
	private isPaused: boolean = false;

	constructor(eventStore: EventStore) {
		this.eventStore = eventStore;
	}

	/**
	 * Replay events with a handler
	 */
	async replay(handler: EventHandler, options: ReplayOptions = {}): Promise<ReplayResult> {
		const validatedOptions = ReplayOptionsSchema.parse(options);

		this.status = ReplayStatus.RUNNING;
		const result: ReplayResult = {
			status: ReplayStatus.RUNNING,
			totalEvents: 0,
			processedEvents: 0,
			failedEvents: 0,
			startTime: new Date(),
			errors: [],
		};

		try {
			// Get events based on options
			const events = await this.getEventsForReplay(validatedOptions);
			result.totalEvents = events.length;

			// Process events in batches
			const batchSize = validatedOptions.batchSize || 100;
			for (let i = 0; i < events.length; i += batchSize) {
				// Check if paused
				while (this.isPaused) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}

				const batch = events.slice(i, i + batchSize);

				// Process batch
				for (const event of batch) {
					try {
						await handler(event);
						result.processedEvents++;
					} catch (error) {
						result.failedEvents++;
						result.errors.push({
							event,
							error: error as Error,
						});
					}

					// Report progress
					if (validatedOptions.onProgress) {
						const progress = this.calculateProgress(
							result.processedEvents,
							result.totalEvents,
							result.startTime,
						);
						validatedOptions.onProgress(progress);
					}
				}
			}

			result.status = ReplayStatus.COMPLETED;
			this.status = ReplayStatus.COMPLETED;
		} catch (error) {
			result.status = ReplayStatus.FAILED;
			this.status = ReplayStatus.FAILED;
			result.errors.push({
				event: {} as Event,
				error: error as Error,
			});
		}

		result.endTime = new Date();
		result.duration = result.endTime.getTime() - result.startTime.getTime();

		return result;
	}

	/**
	 * Replay events for a specific aggregate
	 */
	async replayAggregate(
		aggregateId: string,
		handler: EventHandler,
		options: Omit<ReplayOptions, 'aggregateIds'> = {},
	): Promise<ReplayResult> {
		return this.replay(handler, {
			...options,
			aggregateIds: [aggregateId],
		});
	}

	/**
	 * Reconstruct aggregate state at a specific point in time
	 */
	async reconstructAggregateAtTime<T extends AggregateRoot>(
		AggregateClass: new (id?: string) => T,
		aggregateId: string,
		timestamp: Date,
	): Promise<T | null> {
		// Get events up to the timestamp
		const events = await this.eventStore.getEvents(aggregateId, {
			toTimestamp: timestamp,
		});

		if (events.length === 0) {
			return null;
		}

		// Reconstruct aggregate
		const aggregate = new AggregateClass(aggregateId);
		aggregate.hydrate(events);

		return aggregate;
	}

	/**
	 * Reconstruct aggregate state at a specific version
	 */
	async reconstructAggregateAtVersion<T extends AggregateRoot>(
		AggregateClass: new (id?: string) => T,
		aggregateId: string,
		version: number,
	): Promise<T | null> {
		// Get events up to the version
		const events = await this.eventStore.getEvents(aggregateId, {
			toVersion: version,
		});

		if (events.length === 0) {
			return null;
		}

		// Reconstruct aggregate
		const aggregate = new AggregateClass(aggregateId);
		aggregate.hydrate(events);

		return aggregate;
	}

	/**
	 * Compare aggregate state at two different points in time
	 */
	async compareAggregateStates<T extends AggregateRoot>(
		AggregateClass: new (id?: string) => T,
		aggregateId: string,
		timestamp1: Date,
		timestamp2: Date,
	): Promise<{
		state1: T | null;
		state2: T | null;
		changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
	}> {
		const [state1, state2] = await Promise.all([
			this.reconstructAggregateAtTime(AggregateClass, aggregateId, timestamp1),
			this.reconstructAggregateAtTime(AggregateClass, aggregateId, timestamp2),
		]);

		// Calculate changes
		const changes: Array<{ path: string; oldValue: unknown; newValue: unknown }> = [];

		if (state1 && state2) {
			const snapshot1 = state1.toSnapshot();
			const snapshot2 = state2.toSnapshot();

			// Simple comparison (in a real implementation, use a deep diff library)
			for (const key in snapshot2) {
				if (JSON.stringify(snapshot1[key]) !== JSON.stringify(snapshot2[key])) {
					changes.push({
						path: key,
						oldValue: snapshot1[key],
						newValue: snapshot2[key],
					});
				}
			}
		}

		return { state1, state2, changes };
	}

	/**
	 * Get audit trail for an aggregate
	 */
	async getAuditTrail(aggregateId: string): Promise<
		Array<{
			event: Event;
			timestamp: Date;
			userId?: string;
			changes: string;
		}>
	> {
		const events = await this.eventStore.getEvents(aggregateId);

		return events.map((event) => ({
			event,
			timestamp: event.timestamp,
			userId: event.metadata?.userId as string | undefined,
			changes: JSON.stringify(event.data),
		}));
	}

	/**
	 * Replay events for analytics
	 */
	async analyzeEvents(
		options: ReplayOptions = {},
	): Promise<{
		eventCounts: Record<string, number>;
		aggregateCounts: Record<string, number>;
		timeline: Array<{ date: string; count: number }>;
		topUsers: Array<{ userId: string; count: number }>;
	}> {
		const validatedOptions = ReplayOptionsSchema.parse(options);
		const events = await this.getEventsForReplay(validatedOptions);

		const eventCounts: Record<string, number> = {};
		const aggregateCounts: Record<string, number> = {};
		const userCounts: Record<string, number> = {};
		const dailyCounts: Record<string, number> = {};

		for (const event of events) {
			// Count by event type
			eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;

			// Count by aggregate type
			aggregateCounts[event.aggregateType] =
				(aggregateCounts[event.aggregateType] || 0) + 1;

			// Count by user
			const userId = event.metadata?.userId as string | undefined;
			if (userId) {
				userCounts[userId] = (userCounts[userId] || 0) + 1;
			}

			// Count by day
			const date = event.timestamp.toISOString().split('T')[0];
			dailyCounts[date] = (dailyCounts[date] || 0) + 1;
		}

		// Build timeline
		const timeline = Object.entries(dailyCounts)
			.map(([date, count]) => ({ date, count }))
			.sort((a, b) => a.date.localeCompare(b.date));

		// Get top users
		const topUsers = Object.entries(userCounts)
			.map(([userId, count]) => ({ userId, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			eventCounts,
			aggregateCounts,
			timeline,
			topUsers,
		};
	}

	/**
	 * Pause replay
	 */
	pause(): void {
		this.isPaused = true;
		this.status = ReplayStatus.PAUSED;
	}

	/**
	 * Resume replay
	 */
	resume(): void {
		this.isPaused = false;
		this.status = ReplayStatus.RUNNING;
	}

	/**
	 * Get replay status
	 */
	getStatus(): ReplayStatus {
		return this.status;
	}

	/**
	 * Get events for replay based on options
	 */
	private async getEventsForReplay(options: ReplayOptions): Promise<Event[]> {
		let events: Event[] = [];

		// Get events based on filters
		if (options.aggregateIds && options.aggregateIds.length > 0) {
			// Get events for specific aggregates
			const eventsByAggregate = await Promise.all(
				options.aggregateIds.map((id) =>
					this.eventStore.getEvents(id, {
						fromTimestamp: options.fromTimestamp,
						toTimestamp: options.toTimestamp,
					}),
				),
			);
			events = eventsByAggregate.flat();
		} else if (options.eventTypes && options.eventTypes.length > 0) {
			// Get events by type
			events = await this.eventStore.getEventsByTypes(options.eventTypes, {
				fromTimestamp: options.fromTimestamp,
				toTimestamp: options.toTimestamp,
			});
		} else {
			// Get all events
			events = await this.eventStore.getAllEvents({
				fromTimestamp: options.fromTimestamp,
				toTimestamp: options.toTimestamp,
			});
		}

		// Sort by timestamp
		events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		// Apply position filters
		if (options.fromPosition !== undefined) {
			events = events.slice(options.fromPosition);
		}

		if (options.toPosition !== undefined) {
			events = events.slice(0, options.toPosition + 1);
		}

		return events;
	}

	/**
	 * Calculate progress
	 */
	private calculateProgress(
		processed: number,
		total: number,
		startTime: Date,
	): ReplayProgress {
		const percentage = total > 0 ? (processed / total) * 100 : 0;
		const elapsed = Date.now() - startTime.getTime();
		const rate = processed / (elapsed / 1000); // events per second
		const remaining = total - processed;
		const estimatedTimeRemaining = rate > 0 ? (remaining / rate) * 1000 : undefined;

		return {
			total,
			processed,
			position: processed,
			percentage,
			estimatedTimeRemaining,
		};
	}

	/**
	 * Test replay without actually executing
	 */
	async dryRun(options: ReplayOptions = {}): Promise<{
		totalEvents: number;
		eventTypes: Record<string, number>;
		aggregates: string[];
		timeRange: { from?: Date; to?: Date };
	}> {
		const validatedOptions = ReplayOptionsSchema.parse(options);
		const events = await this.getEventsForReplay(validatedOptions);

		const eventTypes: Record<string, number> = {};
		const aggregates = new Set<string>();
		let firstTimestamp: Date | undefined;
		let lastTimestamp: Date | undefined;

		for (const event of events) {
			eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
			aggregates.add(event.aggregateId);

			if (!firstTimestamp || event.timestamp < firstTimestamp) {
				firstTimestamp = event.timestamp;
			}
			if (!lastTimestamp || event.timestamp > lastTimestamp) {
				lastTimestamp = event.timestamp;
			}
		}

		return {
			totalEvents: events.length,
			eventTypes,
			aggregates: Array.from(aggregates),
			timeRange: {
				from: firstTimestamp,
				to: lastTimestamp,
			},
		};
	}
}
