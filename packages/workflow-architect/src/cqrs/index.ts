/**
 * CQRS & Event Sourcing System
 * Complete implementation of Command Query Responsibility Segregation with Event Sourcing
 */

// =====================================================
// Type Exports
// =====================================================

export type {
	Event,
	EventMetadata,
	Command,
	CommandMetadata,
	Query,
	QueryMetadata,
	Aggregate,
	Projection,
	Snapshot,
	Saga,
	Subscription,
	CommandHandler,
	QueryHandler,
	EventHandler,
	Result,
	EventStreamOptions,
	ReplayOptions,
	ReplayProgress,
	EventVersion,
	PaginationOptions,
} from './types';

export {
	ProjectionState,
	SagaState,
	SubscriptionType,
	SubscriptionState,
} from './types';

// =====================================================
// Event Store Exports
// =====================================================

export { EventStore, ConcurrencyError } from './event-store';

// =====================================================
// Command Bus Exports
// =====================================================

export {
	CommandBus,
	CommandValidationError,
	CommandNotRegisteredError,
	loggingMiddleware,
	retryMiddleware,
	idempotencyMiddleware,
	authorizationMiddleware,
	metricsMiddleware,
	CommandDecorator,
} from './commands';

export type {
	CommandMiddleware,
	CommandBusOptions,
	CommandMetrics,
} from './commands';

// =====================================================
// Query Bus Exports
// =====================================================

export {
	QueryBus,
	QueryValidationError,
	QueryNotRegisteredError,
	InMemoryQueryCache,
	QueryDecorator,
	createPaginatedResult,
	createCursorPaginatedResult,
} from './queries';

export type {
	QueryCache,
	QueryBusOptions,
	PaginatedResult,
	CursorPaginatedResult,
} from './queries';

// =====================================================
// Aggregate Exports
// =====================================================

export {
	AggregateRoot,
	WorkflowAggregate,
	WorkflowEvents,
} from './aggregates';

export type {
	WorkflowState,
} from './aggregates';

// =====================================================
// Projection Exports
// =====================================================

export {
	ProjectionManager,
	ProjectionBuilder,
	createWorkflowSummaryProjection,
} from './projections';

export type {
	ProjectionHandler,
} from './projections';

// =====================================================
// Snapshot Exports
// =====================================================

export {
	SnapshotStore,
	EveryNEventsStrategy,
	TimeBasedStrategy,
} from './snapshots';

export type {
	SnapshotStrategy,
	SnapshotStoreOptions,
} from './snapshots';

// =====================================================
// Saga Exports
// =====================================================

export {
	SagaBase,
	SagaManager,
	WorkflowDeploymentSaga,
} from './sagas';

export type {
	SagaStep,
} from './sagas';

// =====================================================
// Replay Exports
// =====================================================

export {
	ReplayEngine,
	ReplayStatus,
} from './replay';

export type {
	ReplayResult,
} from './replay';

// =====================================================
// Versioning Exports
// =====================================================

export {
	EventVersioning,
	EventVersionBuilder,
	setupWorkflowEventVersioning,
	generateMigrationPlan,
} from './versioning';

export type {
	Upcaster,
	MigrationPlan,
} from './versioning';

// =====================================================
// Subscription Exports
// =====================================================

export {
	SubscriptionManager,
} from './subscriptions';

export type {
	SubscriptionOptions,
} from './subscriptions';

// =====================================================
// Causation Exports
// =====================================================

export {
	CausationTracker,
	createCausationMiddleware,
} from './causation';

export type {
	CausationContext,
	EventChainNode,
} from './causation';

// =====================================================
// API Exports
// =====================================================

export {
	createCQRSApi,
} from './api';

export type {
	CQRSApiDeps,
} from './api';

// =====================================================
// CQRS System
// =====================================================

import { EventStore } from './event-store';
import { CommandBus, type CommandBusOptions } from './commands';
import { QueryBus, type QueryBusOptions } from './queries';
import { ProjectionManager } from './projections';
import { SnapshotStore, type SnapshotStoreOptions } from './snapshots';
import { SagaManager } from './sagas';
import { ReplayEngine } from './replay';
import { EventVersioning } from './versioning';
import { SubscriptionManager } from './subscriptions';
import { CausationTracker } from './causation';
import { createCQRSApi } from './api';
import type { Router } from 'express';

/**
 * CQRS System configuration
 */
export interface CQRSSystemConfig {
	/** Supabase URL */
	supabaseUrl: string;
	/** Supabase API key */
	supabaseKey: string;
	/** Command bus options */
	commandBus?: CommandBusOptions;
	/** Query bus options */
	queryBus?: QueryBusOptions;
	/** Snapshot store options */
	snapshotStore?: SnapshotStoreOptions;
}

/**
 * Main CQRS System
 * Coordinates all CQRS components
 */
export class CQRSSystem {
	private config: CQRSSystemConfig;

	// Core components
	public readonly eventStore: EventStore;
	public readonly commandBus: CommandBus;
	public readonly queryBus: QueryBus;
	public readonly projectionManager: ProjectionManager;
	public readonly snapshotStore: SnapshotStore;
	public readonly sagaManager: SagaManager;
	public readonly replayEngine: ReplayEngine;
	public readonly eventVersioning: EventVersioning;
	public readonly subscriptionManager: SubscriptionManager;
	public readonly causationTracker: CausationTracker;

	constructor(config: CQRSSystemConfig) {
		this.config = config;

		// Initialize core components
		this.eventStore = new EventStore(config.supabaseUrl, config.supabaseKey);
		this.commandBus = new CommandBus(config.commandBus);
		this.queryBus = new QueryBus(config.queryBus);
		this.projectionManager = new ProjectionManager(
			config.supabaseUrl,
			config.supabaseKey,
			this.eventStore,
		);
		this.snapshotStore = new SnapshotStore(
			config.supabaseUrl,
			config.supabaseKey,
			this.eventStore,
			config.snapshotStore,
		);
		this.sagaManager = new SagaManager(
			config.supabaseUrl,
			config.supabaseKey,
			this.commandBus,
		);
		this.replayEngine = new ReplayEngine(this.eventStore);
		this.eventVersioning = new EventVersioning();
		this.subscriptionManager = new SubscriptionManager(
			config.supabaseUrl,
			config.supabaseKey,
			this.eventStore,
		);
		this.causationTracker = new CausationTracker(this.eventStore);
	}

	/**
	 * Initialize the CQRS system
	 */
	async initialize(): Promise<void> {
		// Setup event versioning
		// You can register custom event versions here

		// Start any auto-start projections
		// await this.projectionManager.startAll();
	}

	/**
	 * Shutdown the CQRS system
	 */
	async shutdown(): Promise<void> {
		// Stop all projections
		await this.projectionManager.stopAll();

		// Stop all subscriptions
		await this.subscriptionManager.stopAll();
	}

	/**
	 * Create API router
	 */
	createApiRouter(): Router {
		return createCQRSApi({
			commandBus: this.commandBus,
			queryBus: this.queryBus,
			eventStore: this.eventStore,
			projectionManager: this.projectionManager,
			replayEngine: this.replayEngine,
			snapshotStore: this.snapshotStore,
			sagaManager: this.sagaManager,
			subscriptionManager: this.subscriptionManager,
			causationTracker: this.causationTracker,
		});
	}

	/**
	 * Get system health status
	 */
	async getHealth(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		components: Record<string, boolean>;
		details: Record<string, unknown>;
	}> {
		try {
			// Check event store
			const eventCount = await this.eventStore.getTotalEventCount();

			// Check projections
			const projections = await this.projectionManager.getAllProjections();
			const errorProjections = projections.filter((p) => p.state === 'error');

			// Check sagas
			const sagas = await this.sagaManager.getAllSagas();
			const failedSagas = sagas.filter((s) => s.state === 'failed');

			const components = {
				eventStore: true,
				commandBus: true,
				queryBus: true,
				projectionManager: errorProjections.length === 0,
				sagaManager: true,
				subscriptionManager: true,
			};

			const allHealthy = Object.values(components).every((v) => v);

			return {
				status: allHealthy ? 'healthy' : 'degraded',
				components,
				details: {
					totalEvents: eventCount,
					projections: {
						total: projections.length,
						errors: errorProjections.length,
					},
					sagas: {
						total: sagas.length,
						failed: failedSagas.length,
					},
				},
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				components: {
					eventStore: false,
					commandBus: false,
					queryBus: false,
					projectionManager: false,
					sagaManager: false,
					subscriptionManager: false,
				},
				details: {
					error: (error as Error).message,
				},
			};
		}
	}

	/**
	 * Get system metrics
	 */
	async getMetrics(): Promise<{
		events: {
			total: number;
			byType: Record<string, number>;
		};
		aggregates: {
			total: number;
		};
		projections: {
			total: number;
			running: number;
			stopped: number;
			error: number;
		};
		sagas: {
			total: number;
			running: number;
			completed: number;
			failed: number;
		};
		subscriptions: {
			total: number;
			active: number;
		};
	}> {
		const [
			eventStats,
			projections,
			sagas,
			subscriptions,
		] = await Promise.all([
			this.eventStore.getStatistics(),
			this.projectionManager.getAllProjections(),
			this.sagaManager.getAllSagas(),
			this.subscriptionManager.getAllSubscriptions(),
		]);

		return {
			events: {
				total: eventStats.totalEvents,
				byType: eventStats.eventsByType,
			},
			aggregates: {
				total: eventStats.totalAggregates,
			},
			projections: {
				total: projections.length,
				running: projections.filter((p) => p.state === 'running').length,
				stopped: projections.filter((p) => p.state === 'stopped').length,
				error: projections.filter((p) => p.state === 'error').length,
			},
			sagas: {
				total: sagas.length,
				running: sagas.filter((s) => s.state === 'running').length,
				completed: sagas.filter((s) => s.state === 'completed').length,
				failed: sagas.filter((s) => s.state === 'failed').length,
			},
			subscriptions: {
				total: subscriptions.length,
				active: subscriptions.filter((s) => s.state === 'active').length,
			},
		};
	}
}

/**
 * Create and configure a CQRS system instance
 */
export function createCQRSSystem(config: CQRSSystemConfig): CQRSSystem {
	return new CQRSSystem(config);
}

/**
 * Decorator factory for creating command handlers
 */
export function Command(commandType: string) {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
		// Store metadata for registration
		Reflect.defineMetadata('cqrs:command', commandType, target, propertyKey);
		return descriptor;
	};
}

/**
 * Decorator factory for creating query handlers
 */
export function Query(queryType: string) {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
		// Store metadata for registration
		Reflect.defineMetadata('cqrs:query', queryType, target, propertyKey);
		return descriptor;
	};
}

/**
 * Decorator factory for creating event handlers
 */
export function EventHandler(eventType: string) {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
		// Store metadata for registration
		Reflect.defineMetadata('cqrs:event', eventType, target, propertyKey);
		return descriptor;
	};
}

// =====================================================
// Default Export
// =====================================================

export default CQRSSystem;
