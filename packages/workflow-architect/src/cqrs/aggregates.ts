import { v4 as uuidv4 } from 'uuid';
import type { Event, EventMetadata } from './types';

/**
 * Base class for aggregate roots
 * Implements event sourcing pattern
 */
export abstract class AggregateRoot {
	private _id: string;
	private _version: number = 0;
	private _uncommittedEvents: Event[] = [];
	private _createdAt: Date;
	private _updatedAt: Date;

	constructor(id?: string) {
		this._id = id || uuidv4();
		this._createdAt = new Date();
		this._updatedAt = new Date();
	}

	/**
	 * Get aggregate ID
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Get aggregate version
	 */
	get version(): number {
		return this._version;
	}

	/**
	 * Get aggregate type
	 */
	abstract get aggregateType(): string;

	/**
	 * Get creation timestamp
	 */
	get createdAt(): Date {
		return this._createdAt;
	}

	/**
	 * Get last update timestamp
	 */
	get updatedAt(): Date {
		return this._updatedAt;
	}

	/**
	 * Get uncommitted events
	 */
	getUncommittedEvents(): Event[] {
		return [...this._uncommittedEvents];
	}

	/**
	 * Mark events as committed
	 */
	markEventsAsCommitted(): void {
		this._uncommittedEvents = [];
	}

	/**
	 * Apply an event to the aggregate
	 * This is used when hydrating from event store
	 */
	apply(event: Event, isNew: boolean = false): void {
		// Call the event handler
		this.applyEvent(event);

		// Increment version
		this._version++;
		this._updatedAt = event.timestamp;

		// Add to uncommitted events if this is a new event
		if (isNew) {
			this._uncommittedEvents.push(event);
		}
	}

	/**
	 * Raise a new domain event
	 */
	protected raise<TData = unknown>(
		eventType: string,
		data: TData,
		metadata?: EventMetadata,
	): void {
		const event: Event<TData> = {
			id: uuidv4(),
			type: eventType,
			aggregateId: this._id,
			aggregateType: this.aggregateType,
			data,
			timestamp: new Date(),
			version: this._version + this._uncommittedEvents.length + 1,
			metadata,
		};

		this.apply(event, true);
	}

	/**
	 * Abstract method to handle events
	 * Subclasses must implement this to update their state based on events
	 */
	protected abstract applyEvent(event: Event): void;

	/**
	 * Hydrate the aggregate from a list of events
	 */
	hydrate(events: Event[]): void {
		for (const event of events) {
			this.apply(event, false);
		}
	}

	/**
	 * Load aggregate from events
	 */
	static loadFromEvents<T extends AggregateRoot>(
		this: new (id?: string) => T,
		events: Event[],
	): T {
		if (events.length === 0) {
			throw new Error('Cannot load aggregate from empty event list');
		}

		const aggregate = new this(events[0].aggregateId);
		aggregate.hydrate(events);
		return aggregate;
	}

	/**
	 * Get aggregate state as a snapshot
	 */
	abstract toSnapshot(): Record<string, unknown>;

	/**
	 * Restore aggregate from a snapshot
	 */
	abstract fromSnapshot(snapshot: Record<string, unknown>): void;
}

/**
 * Example: Workflow aggregate
 */
export interface WorkflowState {
	name: string;
	description: string;
	nodes: Array<{
		id: string;
		type: string;
		position: { x: number; y: number };
	}>;
	edges: Array<{
		id: string;
		source: string;
		target: string;
	}>;
	status: 'draft' | 'active' | 'archived';
	tags: string[];
}

/**
 * Workflow events
 */
export const WorkflowEvents = {
	CREATED: 'workflow.created',
	UPDATED: 'workflow.updated',
	NODE_ADDED: 'workflow.node.added',
	NODE_REMOVED: 'workflow.node.removed',
	NODE_UPDATED: 'workflow.node.updated',
	EDGE_ADDED: 'workflow.edge.added',
	EDGE_REMOVED: 'workflow.edge.removed',
	STATUS_CHANGED: 'workflow.status.changed',
	TAGGED: 'workflow.tagged',
	UNTAGGED: 'workflow.untagged',
	ARCHIVED: 'workflow.archived',
} as const;

/**
 * Workflow aggregate root
 */
export class WorkflowAggregate extends AggregateRoot {
	private state: WorkflowState;

	constructor(id?: string) {
		super(id);
		this.state = {
			name: '',
			description: '',
			nodes: [],
			edges: [],
			status: 'draft',
			tags: [],
		};
	}

	get aggregateType(): string {
		return 'Workflow';
	}

	/**
	 * Create a new workflow
	 */
	create(name: string, description: string, metadata?: EventMetadata): void {
		if (this.version > 0) {
			throw new Error('Workflow already created');
		}

		this.raise(
			WorkflowEvents.CREATED,
			{
				name,
				description,
			},
			metadata,
		);
	}

	/**
	 * Update workflow details
	 */
	update(name?: string, description?: string, metadata?: EventMetadata): void {
		if (this.version === 0) {
			throw new Error('Workflow not created');
		}

		this.raise(
			WorkflowEvents.UPDATED,
			{
				name: name || this.state.name,
				description: description || this.state.description,
			},
			metadata,
		);
	}

	/**
	 * Add a node to the workflow
	 */
	addNode(
		nodeId: string,
		nodeType: string,
		position: { x: number; y: number },
		metadata?: EventMetadata,
	): void {
		if (this.state.nodes.some((n) => n.id === nodeId)) {
			throw new Error(`Node ${nodeId} already exists`);
		}

		this.raise(
			WorkflowEvents.NODE_ADDED,
			{
				nodeId,
				nodeType,
				position,
			},
			metadata,
		);
	}

	/**
	 * Remove a node from the workflow
	 */
	removeNode(nodeId: string, metadata?: EventMetadata): void {
		if (!this.state.nodes.some((n) => n.id === nodeId)) {
			throw new Error(`Node ${nodeId} not found`);
		}

		this.raise(
			WorkflowEvents.NODE_REMOVED,
			{
				nodeId,
			},
			metadata,
		);
	}

	/**
	 * Add an edge between nodes
	 */
	addEdge(edgeId: string, source: string, target: string, metadata?: EventMetadata): void {
		if (this.state.edges.some((e) => e.id === edgeId)) {
			throw new Error(`Edge ${edgeId} already exists`);
		}

		if (!this.state.nodes.some((n) => n.id === source)) {
			throw new Error(`Source node ${source} not found`);
		}

		if (!this.state.nodes.some((n) => n.id === target)) {
			throw new Error(`Target node ${target} not found`);
		}

		this.raise(
			WorkflowEvents.EDGE_ADDED,
			{
				edgeId,
				source,
				target,
			},
			metadata,
		);
	}

	/**
	 * Remove an edge
	 */
	removeEdge(edgeId: string, metadata?: EventMetadata): void {
		if (!this.state.edges.some((e) => e.id === edgeId)) {
			throw new Error(`Edge ${edgeId} not found`);
		}

		this.raise(
			WorkflowEvents.EDGE_REMOVED,
			{
				edgeId,
			},
			metadata,
		);
	}

	/**
	 * Change workflow status
	 */
	changeStatus(status: 'draft' | 'active' | 'archived', metadata?: EventMetadata): void {
		if (this.state.status === status) {
			return;
		}

		this.raise(
			WorkflowEvents.STATUS_CHANGED,
			{
				from: this.state.status,
				to: status,
			},
			metadata,
		);
	}

	/**
	 * Add a tag
	 */
	addTag(tag: string, metadata?: EventMetadata): void {
		if (this.state.tags.includes(tag)) {
			return;
		}

		this.raise(
			WorkflowEvents.TAGGED,
			{
				tag,
			},
			metadata,
		);
	}

	/**
	 * Remove a tag
	 */
	removeTag(tag: string, metadata?: EventMetadata): void {
		if (!this.state.tags.includes(tag)) {
			return;
		}

		this.raise(
			WorkflowEvents.UNTAGGED,
			{
				tag,
			},
			metadata,
		);
	}

	/**
	 * Archive the workflow
	 */
	archive(metadata?: EventMetadata): void {
		if (this.state.status === 'archived') {
			return;
		}

		this.raise(WorkflowEvents.ARCHIVED, {}, metadata);
	}

	/**
	 * Apply events to update state
	 */
	protected applyEvent(event: Event): void {
		switch (event.type) {
			case WorkflowEvents.CREATED:
				this.state.name = (event.data as { name: string }).name;
				this.state.description = (event.data as { description: string }).description;
				break;

			case WorkflowEvents.UPDATED:
				this.state.name = (event.data as { name: string }).name;
				this.state.description = (event.data as { description: string }).description;
				break;

			case WorkflowEvents.NODE_ADDED:
				this.state.nodes.push({
					id: (event.data as { nodeId: string }).nodeId,
					type: (event.data as { nodeType: string }).nodeType,
					position: (event.data as { position: { x: number; y: number } }).position,
				});
				break;

			case WorkflowEvents.NODE_REMOVED:
				this.state.nodes = this.state.nodes.filter(
					(n) => n.id !== (event.data as { nodeId: string }).nodeId,
				);
				// Also remove connected edges
				this.state.edges = this.state.edges.filter(
					(e) =>
						e.source !== (event.data as { nodeId: string }).nodeId &&
						e.target !== (event.data as { nodeId: string }).nodeId,
				);
				break;

			case WorkflowEvents.EDGE_ADDED:
				this.state.edges.push({
					id: (event.data as { edgeId: string }).edgeId,
					source: (event.data as { source: string }).source,
					target: (event.data as { target: string }).target,
				});
				break;

			case WorkflowEvents.EDGE_REMOVED:
				this.state.edges = this.state.edges.filter(
					(e) => e.id !== (event.data as { edgeId: string }).edgeId,
				);
				break;

			case WorkflowEvents.STATUS_CHANGED:
				this.state.status = (event.data as { to: 'draft' | 'active' | 'archived' }).to;
				break;

			case WorkflowEvents.TAGGED:
				this.state.tags.push((event.data as { tag: string }).tag);
				break;

			case WorkflowEvents.UNTAGGED:
				this.state.tags = this.state.tags.filter(
					(t) => t !== (event.data as { tag: string }).tag,
				);
				break;

			case WorkflowEvents.ARCHIVED:
				this.state.status = 'archived';
				break;

			default:
				// Unknown event type, ignore
				break;
		}
	}

	/**
	 * Get current state
	 */
	getState(): Readonly<WorkflowState> {
		return { ...this.state };
	}

	/**
	 * Create snapshot of current state
	 */
	toSnapshot(): Record<string, unknown> {
		return {
			state: this.state,
		};
	}

	/**
	 * Restore from snapshot
	 */
	fromSnapshot(snapshot: Record<string, unknown>): void {
		this.state = snapshot.state as WorkflowState;
	}
}
