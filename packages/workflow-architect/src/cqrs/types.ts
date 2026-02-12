import { z } from 'zod';

/**
 * Base Event interface
 * Events are immutable facts that have happened in the system
 */
export interface Event<TData = unknown> {
	/** Unique event identifier */
	id: string;
	/** Event type/name */
	type: string;
	/** ID of the aggregate this event belongs to */
	aggregateId: string;
	/** Aggregate type */
	aggregateType: string;
	/** Event data payload */
	data: TData;
	/** When the event occurred */
	timestamp: Date;
	/** Event version number in the aggregate stream */
	version: number;
	/** Optional metadata */
	metadata?: EventMetadata;
}

/**
 * Event metadata for tracking and debugging
 */
export interface EventMetadata {
	/** User who triggered the event */
	userId?: string;
	/** Correlation ID for tracing related events */
	correlationId?: string;
	/** Causation ID linking to the command that caused this event */
	causationId?: string;
	/** IP address of the client */
	ipAddress?: string;
	/** Additional custom metadata */
	[key: string]: unknown;
}

/**
 * Command interface
 * Commands represent intent to change state
 */
export interface Command<TData = unknown> {
	/** Command type/name */
	type: string;
	/** ID of the aggregate to modify */
	aggregateId: string;
	/** Aggregate type */
	aggregateType: string;
	/** Command data payload */
	data: TData;
	/** Optional metadata */
	metadata?: CommandMetadata;
}

/**
 * Command metadata
 */
export interface CommandMetadata {
	/** User issuing the command */
	userId?: string;
	/** Correlation ID for tracing */
	correlationId?: string;
	/** Command ID for idempotency */
	commandId?: string;
	/** Additional custom metadata */
	[key: string]: unknown;
}

/**
 * Query interface
 * Queries retrieve data without modifying state
 */
export interface Query<TFilters = unknown> {
	/** Query type/name */
	type: string;
	/** Query filters/parameters */
	filters: TFilters;
	/** Pagination options */
	pagination?: PaginationOptions;
	/** Optional metadata */
	metadata?: QueryMetadata;
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
	/** Page number (1-based) */
	page?: number;
	/** Items per page */
	limit?: number;
	/** Cursor for cursor-based pagination */
	cursor?: string;
}

/**
 * Query metadata
 */
export interface QueryMetadata {
	/** User executing the query */
	userId?: string;
	/** Cache control options */
	cache?: boolean;
	/** Additional custom metadata */
	[key: string]: unknown;
}

/**
 * Aggregate interface
 * Aggregates are the consistency boundaries in the domain
 */
export interface Aggregate {
	/** Aggregate identifier */
	id: string;
	/** Aggregate type */
	type: string;
	/** Current version (number of events applied) */
	version: number;
	/** Uncommitted events */
	uncommittedEvents: Event[];
	/** When the aggregate was created */
	createdAt: Date;
	/** When the aggregate was last modified */
	updatedAt: Date;
}

/**
 * Projection interface
 * Projections create read models from events
 */
export interface Projection {
	/** Projection identifier */
	id: string;
	/** Projection name */
	name: string;
	/** Event types this projection subscribes to */
	eventTypes: string[];
	/** Current position in the event stream */
	position: number;
	/** Last processed event timestamp */
	lastEventTimestamp?: Date;
	/** Projection state */
	state: ProjectionState;
	/** When the projection was created */
	createdAt: Date;
	/** When the projection was last updated */
	updatedAt: Date;
}

/**
 * Projection state
 */
export enum ProjectionState {
	RUNNING = 'running',
	STOPPED = 'stopped',
	REBUILDING = 'rebuilding',
	ERROR = 'error',
}

/**
 * Snapshot interface
 * Snapshots are point-in-time captures of aggregate state
 */
export interface Snapshot<TState = unknown> {
	/** Snapshot identifier */
	id: string;
	/** Aggregate ID */
	aggregateId: string;
	/** Aggregate type */
	aggregateType: string;
	/** Version at which snapshot was taken */
	version: number;
	/** Aggregate state */
	state: TState;
	/** When the snapshot was created */
	timestamp: Date;
}

/**
 * Saga interface
 * Sagas coordinate long-running processes across aggregates
 */
export interface Saga {
	/** Saga identifier */
	id: string;
	/** Saga type */
	type: string;
	/** Current saga state */
	state: SagaState;
	/** Saga data */
	data: Record<string, unknown>;
	/** Current step in the saga */
	currentStep: number;
	/** Completed steps */
	completedSteps: string[];
	/** Compensating actions executed */
	compensations: string[];
	/** When the saga started */
	startedAt: Date;
	/** When the saga completed */
	completedAt?: Date;
	/** Saga timeout */
	timeout?: Date;
}

/**
 * Saga state
 */
export enum SagaState {
	STARTED = 'started',
	RUNNING = 'running',
	COMPENSATING = 'compensating',
	COMPLETED = 'completed',
	FAILED = 'failed',
	TIMEOUT = 'timeout',
}

/**
 * Subscription interface
 * Subscriptions listen to event streams
 */
export interface Subscription {
	/** Subscription identifier */
	id: string;
	/** Subscription name */
	name: string;
	/** Event types to subscribe to */
	eventTypes: string[];
	/** Current position in the event stream */
	position: number;
	/** Subscription type */
	type: SubscriptionType;
	/** Subscription state */
	state: SubscriptionState;
	/** Consumer group (for competing consumers) */
	consumerGroup?: string;
	/** When the subscription was created */
	createdAt: Date;
	/** Last processed event */
	lastEventId?: string;
	/** Last processed event timestamp */
	lastEventTimestamp?: Date;
}

/**
 * Subscription type
 */
export enum SubscriptionType {
	/** Catch-up subscription - processes all events from start */
	CATCH_UP = 'catch_up',
	/** Persistent subscription - processes events and maintains position */
	PERSISTENT = 'persistent',
	/** Volatile subscription - processes events but doesn't save position */
	VOLATILE = 'volatile',
	/** Competing consumers - multiple subscribers in a group */
	COMPETING = 'competing',
}

/**
 * Subscription state
 */
export enum SubscriptionState {
	ACTIVE = 'active',
	PAUSED = 'paused',
	STOPPED = 'stopped',
	CATCHING_UP = 'catching_up',
	ERROR = 'error',
}

/**
 * Command handler function type
 */
export type CommandHandler<TCommand extends Command = Command, TResult = unknown> = (
	command: TCommand,
) => Promise<TResult>;

/**
 * Query handler function type
 */
export type QueryHandler<TQuery extends Query = Query, TResult = unknown> = (
	query: TQuery,
) => Promise<TResult>;

/**
 * Event handler function type
 */
export type EventHandler<TEvent extends Event = Event> = (event: TEvent) => Promise<void>;

/**
 * Result wrapper for command/query operations
 */
export interface Result<TData = unknown, TError = Error> {
	success: boolean;
	data?: TData;
	error?: TError;
	metadata?: Record<string, unknown>;
}

/**
 * Event stream options
 */
export interface EventStreamOptions {
	/** Start from this version (inclusive) */
	fromVersion?: number;
	/** End at this version (inclusive) */
	toVersion?: number;
	/** Start from this timestamp */
	fromTimestamp?: Date;
	/** End at this timestamp */
	toTimestamp?: Date;
	/** Maximum events to retrieve */
	limit?: number;
	/** Direction to read events */
	direction?: 'forward' | 'backward';
}

/**
 * Replay options
 */
export interface ReplayOptions {
	/** Start from this position */
	fromPosition?: number;
	/** End at this position */
	toPosition?: number;
	/** Start from this timestamp */
	fromTimestamp?: Date;
	/** End at this timestamp */
	toTimestamp?: Date;
	/** Event types to replay */
	eventTypes?: string[];
	/** Aggregate IDs to replay */
	aggregateIds?: string[];
	/** Batch size for processing */
	batchSize?: number;
	/** Progress callback */
	onProgress?: (progress: ReplayProgress) => void;
}

/**
 * Replay progress information
 */
export interface ReplayProgress {
	/** Total events to process */
	total: number;
	/** Events processed so far */
	processed: number;
	/** Current position */
	position: number;
	/** Percentage complete */
	percentage: number;
	/** Estimated time remaining (ms) */
	estimatedTimeRemaining?: number;
}

/**
 * Event versioning information
 */
export interface EventVersion {
	/** Event type */
	type: string;
	/** Version number */
	version: number;
	/** Schema for this version */
	schema: z.ZodSchema;
	/** Upcast function to next version */
	upcast?: (event: Event) => Event;
}

/**
 * Zod schemas for validation
 */

export const EventMetadataSchema = z.object({
	userId: z.string().optional(),
	correlationId: z.string().optional(),
	causationId: z.string().optional(),
	ipAddress: z.string().optional(),
}).passthrough();

export const EventSchema = z.object({
	id: z.string().uuid(),
	type: z.string().min(1),
	aggregateId: z.string().min(1),
	aggregateType: z.string().min(1),
	data: z.unknown(),
	timestamp: z.date(),
	version: z.number().int().positive(),
	metadata: EventMetadataSchema.optional(),
});

export const CommandMetadataSchema = z.object({
	userId: z.string().optional(),
	correlationId: z.string().optional(),
	commandId: z.string().optional(),
}).passthrough();

export const CommandSchema = z.object({
	type: z.string().min(1),
	aggregateId: z.string().min(1),
	aggregateType: z.string().min(1),
	data: z.unknown(),
	metadata: CommandMetadataSchema.optional(),
});

export const QueryMetadataSchema = z.object({
	userId: z.string().optional(),
	cache: z.boolean().optional(),
}).passthrough();

export const PaginationOptionsSchema = z.object({
	page: z.number().int().positive().optional(),
	limit: z.number().int().positive().max(1000).optional(),
	cursor: z.string().optional(),
});

export const QuerySchema = z.object({
	type: z.string().min(1),
	filters: z.unknown(),
	pagination: PaginationOptionsSchema.optional(),
	metadata: QueryMetadataSchema.optional(),
});

export const EventStreamOptionsSchema = z.object({
	fromVersion: z.number().int().positive().optional(),
	toVersion: z.number().int().positive().optional(),
	fromTimestamp: z.date().optional(),
	toTimestamp: z.date().optional(),
	limit: z.number().int().positive().max(10000).optional(),
	direction: z.enum(['forward', 'backward']).optional(),
});

export const ReplayOptionsSchema = z.object({
	fromPosition: z.number().int().nonnegative().optional(),
	toPosition: z.number().int().nonnegative().optional(),
	fromTimestamp: z.date().optional(),
	toTimestamp: z.date().optional(),
	eventTypes: z.array(z.string()).optional(),
	aggregateIds: z.array(z.string()).optional(),
	batchSize: z.number().int().positive().max(1000).default(100),
});
