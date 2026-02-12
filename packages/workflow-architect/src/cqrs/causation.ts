import { v4 as uuidv4 } from 'uuid';
import type { Event, Command, EventMetadata, CommandMetadata } from './types';
import type { EventStore } from './event-store';

/**
 * Causation context
 * Tracks the chain of cause and effect through the system
 */
export interface CausationContext {
	/** Unique identifier for this operation */
	correlationId: string;
	/** ID of the command/event that caused this */
	causationId: string;
	/** User who initiated the operation */
	userId?: string;
	/** Additional context data */
	metadata?: Record<string, unknown>;
}

/**
 * Event chain node
 */
export interface EventChainNode {
	event: Event;
	children: EventChainNode[];
	depth: number;
}

/**
 * Causation tracker
 * Tracks causation and correlation IDs for debugging and tracing
 */
export class CausationTracker {
	private eventStore: EventStore;
	private contexts: Map<string, CausationContext> = new Map();
	private currentContext?: CausationContext;

	constructor(eventStore: EventStore) {
		this.eventStore = eventStore;
	}

	/**
	 * Start a new causation context
	 */
	startContext(userId?: string, metadata?: Record<string, unknown>): CausationContext {
		const context: CausationContext = {
			correlationId: uuidv4(),
			causationId: uuidv4(),
			userId,
			metadata,
		};

		this.contexts.set(context.correlationId, context);
		this.currentContext = context;

		return context;
	}

	/**
	 * Get current context
	 */
	getCurrentContext(): CausationContext | undefined {
		return this.currentContext;
	}

	/**
	 * Set current context
	 */
	setCurrentContext(context: CausationContext): void {
		this.currentContext = context;
	}

	/**
	 * Clear current context
	 */
	clearContext(): void {
		this.currentContext = undefined;
	}

	/**
	 * Create child context
	 */
	createChildContext(parentContext?: CausationContext): CausationContext {
		const parent = parentContext || this.currentContext;

		if (!parent) {
			throw new Error('No parent context available');
		}

		const childContext: CausationContext = {
			correlationId: parent.correlationId,
			causationId: uuidv4(),
			userId: parent.userId,
			metadata: parent.metadata,
		};

		this.currentContext = childContext;

		return childContext;
	}

	/**
	 * Enrich command metadata with causation info
	 */
	enrichCommand(command: Command, context?: CausationContext): Command {
		const ctx = context || this.currentContext;

		if (!ctx) {
			return command;
		}

		const metadata: CommandMetadata = {
			...command.metadata,
			correlationId: ctx.correlationId,
			userId: ctx.userId,
			commandId: uuidv4(),
		};

		return {
			...command,
			metadata,
		};
	}

	/**
	 * Enrich event metadata with causation info
	 */
	enrichEvent(event: Event, context?: CausationContext): Event {
		const ctx = context || this.currentContext;

		if (!ctx) {
			return event;
		}

		const metadata: EventMetadata = {
			...event.metadata,
			correlationId: ctx.correlationId,
			causationId: ctx.causationId,
			userId: ctx.userId,
		};

		return {
			...event,
			metadata,
		};
	}

	/**
	 * Get events by correlation ID
	 */
	async getEventsByCorrelationId(correlationId: string): Promise<Event[]> {
		const allEvents = await this.eventStore.getAllEvents();

		return allEvents.filter(
			(event) => event.metadata?.correlationId === correlationId,
		);
	}

	/**
	 * Get events by causation ID
	 */
	async getEventsByCausationId(causationId: string): Promise<Event[]> {
		const allEvents = await this.eventStore.getAllEvents();

		return allEvents.filter(
			(event) => event.metadata?.causationId === causationId,
		);
	}

	/**
	 * Build event chain from a root event
	 */
	async buildEventChain(rootEventId: string): Promise<EventChainNode | null> {
		// Get all events
		const allEvents = await this.eventStore.getAllEvents();

		// Find root event
		const rootEvent = allEvents.find((e) => e.id === rootEventId);
		if (!rootEvent) {
			return null;
		}

		// Build chain recursively
		return this.buildChainNode(rootEvent, allEvents, 0);
	}

	/**
	 * Build chain node recursively
	 */
	private buildChainNode(
		event: Event,
		allEvents: Event[],
		depth: number,
	): EventChainNode {
		// Find children (events caused by this event)
		const children = allEvents.filter(
			(e) => e.metadata?.causationId === event.id,
		);

		return {
			event,
			children: children.map((child) => this.buildChainNode(child, allEvents, depth + 1)),
			depth,
		};
	}

	/**
	 * Get event chain as a flat list
	 */
	async getEventChainFlat(rootEventId: string): Promise<Event[]> {
		const chain = await this.buildEventChain(rootEventId);
		if (!chain) {
			return [];
		}

		return this.flattenChain(chain);
	}

	/**
	 * Flatten event chain to array
	 */
	private flattenChain(node: EventChainNode): Event[] {
		const events: Event[] = [node.event];

		for (const child of node.children) {
			events.push(...this.flattenChain(child));
		}

		return events;
	}

	/**
	 * Visualize event chain as ASCII tree
	 */
	visualizeChain(node: EventChainNode): string {
		return this.visualizeNode(node, '', true);
	}

	/**
	 * Visualize node recursively
	 */
	private visualizeNode(
		node: EventChainNode,
		prefix: string,
		isLast: boolean,
	): string {
		const connector = isLast ? '└── ' : '├── ';
		const event = node.event;
		let output = `${prefix}${connector}${event.type} (${event.id})\n`;

		const childPrefix = prefix + (isLast ? '    ' : '│   ');
		node.children.forEach((child, index) => {
			const isLastChild = index === node.children.length - 1;
			output += this.visualizeNode(child, childPrefix, isLastChild);
		});

		return output;
	}

	/**
	 * Get causation statistics
	 */
	async getStatistics(): Promise<{
		totalCorrelations: number;
		averageEventsPerCorrelation: number;
		longestChain: number;
		mostActiveUsers: Array<{ userId: string; count: number }>;
	}> {
		const allEvents = await this.eventStore.getAllEvents();

		// Group by correlation ID
		const correlations = new Map<string, Event[]>();
		const userCounts = new Map<string, number>();

		for (const event of allEvents) {
			const correlationId = event.metadata?.correlationId as string | undefined;
			if (correlationId) {
				if (!correlations.has(correlationId)) {
					correlations.set(correlationId, []);
				}
				correlations.get(correlationId)!.push(event);
			}

			const userId = event.metadata?.userId as string | undefined;
			if (userId) {
				userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
			}
		}

		// Calculate statistics
		const totalCorrelations = correlations.size;
		const totalEvents = Array.from(correlations.values()).reduce(
			(sum, events) => sum + events.length,
			0,
		);
		const averageEventsPerCorrelation =
			totalCorrelations > 0 ? totalEvents / totalCorrelations : 0;

		// Find longest chain
		let longestChain = 0;
		for (const events of correlations.values()) {
			if (events.length > longestChain) {
				longestChain = events.length;
			}
		}

		// Get most active users
		const mostActiveUsers = Array.from(userCounts.entries())
			.map(([userId, count]) => ({ userId, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			totalCorrelations,
			averageEventsPerCorrelation,
			longestChain,
			mostActiveUsers,
		};
	}

	/**
	 * Trace event origin
	 */
	async traceOrigin(eventId: string): Promise<Event[]> {
		const allEvents = await this.eventStore.getAllEvents();
		const event = allEvents.find((e) => e.id === eventId);

		if (!event) {
			return [];
		}

		const trace: Event[] = [event];
		let currentEvent = event;

		// Follow causation chain backwards
		while (currentEvent.metadata?.causationId) {
			const parent = allEvents.find(
				(e) => e.id === currentEvent.metadata?.causationId,
			);

			if (!parent) {
				break;
			}

			trace.unshift(parent);
			currentEvent = parent;
		}

		return trace;
	}

	/**
	 * Get events in the same correlation
	 */
	async getRelatedEvents(eventId: string): Promise<Event[]> {
		const allEvents = await this.eventStore.getAllEvents();
		const event = allEvents.find((e) => e.id === eventId);

		if (!event || !event.metadata?.correlationId) {
			return [event].filter((e): e is Event => e !== undefined);
		}

		const correlationId = event.metadata.correlationId;
		return allEvents.filter(
			(e) => e.metadata?.correlationId === correlationId,
		);
	}

	/**
	 * Debug event flow
	 */
	async debugFlow(correlationId: string): Promise<{
		correlationId: string;
		totalEvents: number;
		eventTypes: string[];
		aggregates: string[];
		timeline: Array<{
			timestamp: Date;
			eventType: string;
			aggregateId: string;
			userId?: string;
		}>;
	}> {
		const events = await this.getEventsByCorrelationId(correlationId);

		const eventTypes = new Set(events.map((e) => e.type));
		const aggregates = new Set(events.map((e) => e.aggregateId));

		const timeline = events
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
			.map((e) => ({
				timestamp: e.timestamp,
				eventType: e.type,
				aggregateId: e.aggregateId,
				userId: e.metadata?.userId as string | undefined,
			}));

		return {
			correlationId,
			totalEvents: events.length,
			eventTypes: Array.from(eventTypes),
			aggregates: Array.from(aggregates),
			timeline,
		};
	}

	/**
	 * Find circular dependencies
	 */
	async findCircularDependencies(): Promise<
		Array<{
			events: string[];
			description: string;
		}>
	> {
		const allEvents = await this.eventStore.getAllEvents();
		const circularDeps: Array<{ events: string[]; description: string }> = [];

		// Simple check: if an event's causation ID appears in its own chain
		for (const event of allEvents) {
			const chain = await this.getEventChainFlat(event.id);
			const eventIds = chain.map((e) => e.id);

			// Check if any event in the chain has a causation ID that points back
			for (const chainEvent of chain) {
				const causationId = chainEvent.metadata?.causationId;
				if (causationId && eventIds.includes(causationId)) {
					const index = eventIds.indexOf(causationId);
					if (index < eventIds.indexOf(chainEvent.id)) {
						circularDeps.push({
							events: eventIds.slice(index),
							description: `Circular dependency detected starting from ${event.type}`,
						});
					}
				}
			}
		}

		return circularDeps;
	}

	/**
	 * Export causation graph as DOT format (for Graphviz)
	 */
	async exportDot(correlationId: string): Promise<string> {
		const events = await this.getEventsByCorrelationId(correlationId);

		let dot = 'digraph EventFlow {\n';
		dot += '  rankdir=TB;\n';
		dot += '  node [shape=box];\n\n';

		// Add nodes
		for (const event of events) {
			const label = `${event.type}\\n${event.aggregateId}`;
			dot += `  "${event.id}" [label="${label}"];\n`;
		}

		dot += '\n';

		// Add edges
		for (const event of events) {
			const causationId = event.metadata?.causationId;
			if (causationId) {
				dot += `  "${causationId}" -> "${event.id}";\n`;
			}
		}

		dot += '}\n';

		return dot;
	}
}

/**
 * Middleware for automatic causation tracking
 */
export function createCausationMiddleware(tracker: CausationTracker) {
	return {
		/**
		 * Command middleware
		 */
		command: async (
			command: Command,
			next: () => Promise<unknown>,
		): Promise<unknown> => {
			// Start or continue context
			if (!tracker.getCurrentContext()) {
				tracker.startContext(command.metadata?.userId);
			}

			// Enrich command
			const enrichedCommand = tracker.enrichCommand(command);

			// Create child context for events
			tracker.createChildContext();

			try {
				return await next();
			} finally {
				// Context will be used by event handlers
			}
		},

		/**
		 * Event handler wrapper
		 */
		eventHandler: (handler: (event: Event) => Promise<void>) => {
			return async (event: Event): Promise<void> => {
				// Create context from event metadata
				if (event.metadata?.correlationId) {
					tracker.setCurrentContext({
						correlationId: event.metadata.correlationId,
						causationId: event.id,
						userId: event.metadata.userId as string | undefined,
					});
				}

				await handler(event);
			};
		},
	};
}
