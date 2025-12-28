import { z } from 'zod';
import type { Event, EventVersion } from './types';

/**
 * Event upcaster function
 */
export type Upcaster = (event: Event) => Event;

/**
 * Event version registry
 */
interface EventVersionRegistry {
	currentVersion: number;
	versions: Map<number, EventVersion>;
	upcasters: Map<number, Upcaster>;
}

/**
 * Event versioning system
 * Handles event schema migration and compatibility
 */
export class EventVersioning {
	private registry: Map<string, EventVersionRegistry> = new Map();
	private deprecatedEvents: Set<string> = new Set();

	/**
	 * Register an event version
	 */
	registerVersion(
		eventType: string,
		version: number,
		schema: z.ZodSchema,
		upcaster?: Upcaster,
	): void {
		if (!this.registry.has(eventType)) {
			this.registry.set(eventType, {
				currentVersion: version,
				versions: new Map(),
				upcasters: new Map(),
			});
		}

		const registry = this.registry.get(eventType)!;

		// Update current version if this is newer
		if (version > registry.currentVersion) {
			registry.currentVersion = version;
		}

		// Register version
		registry.versions.set(version, {
			type: eventType,
			version,
			schema,
			upcast: upcaster,
		});

		// Register upcaster
		if (upcaster) {
			registry.upcasters.set(version, upcaster);
		}
	}

	/**
	 * Upcast an event to the latest version
	 */
	upcast(event: Event): Event {
		const registry = this.registry.get(event.type);
		if (!registry) {
			// No versioning for this event type, return as-is
			return event;
		}

		// Get event version from metadata or assume version 1
		const currentVersion = this.getEventVersion(event);

		// Already at current version
		if (currentVersion === registry.currentVersion) {
			return event;
		}

		// Upcast through all versions
		let upcastedEvent = event;
		for (let v = currentVersion + 1; v <= registry.currentVersion; v++) {
			const upcaster = registry.upcasters.get(v);
			if (upcaster) {
				upcastedEvent = upcaster(upcastedEvent);
				// Update version in metadata
				upcastedEvent = {
					...upcastedEvent,
					metadata: {
						...upcastedEvent.metadata,
						eventVersion: v,
					},
				};
			}
		}

		return upcastedEvent;
	}

	/**
	 * Upcast to a specific version
	 */
	upcastToVersion(event: Event, targetVersion: number): Event {
		const registry = this.registry.get(event.type);
		if (!registry) {
			return event;
		}

		const currentVersion = this.getEventVersion(event);

		if (currentVersion === targetVersion) {
			return event;
		}

		if (currentVersion > targetVersion) {
			throw new Error('Cannot downcast events');
		}

		let upcastedEvent = event;
		for (let v = currentVersion + 1; v <= targetVersion; v++) {
			const upcaster = registry.upcasters.get(v);
			if (upcaster) {
				upcastedEvent = upcaster(upcastedEvent);
				upcastedEvent = {
					...upcastedEvent,
					metadata: {
						...upcastedEvent.metadata,
						eventVersion: v,
					},
				};
			} else {
				throw new Error(`No upcaster registered for ${event.type} version ${v}`);
			}
		}

		return upcastedEvent;
	}

	/**
	 * Validate event against its schema
	 */
	validate(event: Event): { valid: boolean; errors?: z.ZodError } {
		const registry = this.registry.get(event.type);
		if (!registry) {
			// No schema registered, assume valid
			return { valid: true };
		}

		const version = this.getEventVersion(event);
		const eventVersion = registry.versions.get(version);

		if (!eventVersion) {
			return {
				valid: false,
				errors: new z.ZodError([
					{
						code: 'custom',
						path: [],
						message: `No schema registered for ${event.type} version ${version}`,
					},
				]),
			};
		}

		try {
			eventVersion.schema.parse(event.data);
			return { valid: true };
		} catch (error) {
			return {
				valid: false,
				errors: error as z.ZodError,
			};
		}
	}

	/**
	 * Get current version for an event type
	 */
	getCurrentVersion(eventType: string): number {
		const registry = this.registry.get(eventType);
		return registry?.currentVersion ?? 1;
	}

	/**
	 * Get event version from metadata
	 */
	private getEventVersion(event: Event): number {
		return (event.metadata?.eventVersion as number) ?? 1;
	}

	/**
	 * Mark event type as deprecated
	 */
	deprecate(eventType: string, replacementType?: string): void {
		this.deprecatedEvents.add(eventType);

		if (replacementType) {
			// Store replacement mapping
			const registry = this.registry.get(eventType);
			if (registry) {
				registry.versions.set(0, {
					type: eventType,
					version: 0,
					schema: z.unknown(),
					upcast: undefined,
				});
			}
		}
	}

	/**
	 * Check if event type is deprecated
	 */
	isDeprecated(eventType: string): boolean {
		return this.deprecatedEvents.has(eventType);
	}

	/**
	 * Get all registered event types
	 */
	getEventTypes(): string[] {
		return Array.from(this.registry.keys());
	}

	/**
	 * Get version history for an event type
	 */
	getVersionHistory(eventType: string): EventVersion[] {
		const registry = this.registry.get(eventType);
		if (!registry) {
			return [];
		}

		return Array.from(registry.versions.values()).sort((a, b) => a.version - b.version);
	}

	/**
	 * Check if event is compatible with current version
	 */
	isCompatible(event: Event): boolean {
		const registry = this.registry.get(event.type);
		if (!registry) {
			return true; // Unknown events are considered compatible
		}

		const currentVersion = this.getEventVersion(event);

		// Check if we can upcast to current version
		for (let v = currentVersion + 1; v <= registry.currentVersion; v++) {
			if (!registry.upcasters.has(v)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Batch upcast events
	 */
	upcastBatch(events: Event[]): Event[] {
		return events.map((event) => this.upcast(event));
	}

	/**
	 * Clear all registrations (for testing)
	 */
	clear(): void {
		this.registry.clear();
		this.deprecatedEvents.clear();
	}
}

/**
 * Event versioning builder for fluent API
 */
export class EventVersionBuilder {
	private eventType: string;
	private versions: Array<{
		version: number;
		schema: z.ZodSchema;
		upcaster?: Upcaster;
	}> = [];

	constructor(eventType: string) {
		this.eventType = eventType;
	}

	/**
	 * Add a version
	 */
	version(version: number, schema: z.ZodSchema, upcaster?: Upcaster): this {
		this.versions.push({ version, schema, upcaster });
		return this;
	}

	/**
	 * Register all versions with the versioning system
	 */
	register(versioning: EventVersioning): void {
		for (const v of this.versions) {
			versioning.registerVersion(this.eventType, v.version, v.schema, v.upcaster);
		}
	}
}

/**
 * Example: Workflow event versioning
 */
export function setupWorkflowEventVersioning(versioning: EventVersioning): void {
	// workflow.created - Version 1
	const workflowCreatedV1 = z.object({
		name: z.string(),
		description: z.string(),
	});

	versioning.registerVersion('workflow.created', 1, workflowCreatedV1);

	// workflow.created - Version 2 (added tags field)
	const workflowCreatedV2 = z.object({
		name: z.string(),
		description: z.string(),
		tags: z.array(z.string()),
	});

	versioning.registerVersion(
		'workflow.created',
		2,
		workflowCreatedV2,
		(event: Event): Event => ({
			...event,
			data: {
				...(event.data as Record<string, unknown>),
				tags: [],
			},
		}),
	);

	// workflow.created - Version 3 (added metadata field)
	const workflowCreatedV3 = z.object({
		name: z.string(),
		description: z.string(),
		tags: z.array(z.string()),
		metadata: z.record(z.unknown()),
	});

	versioning.registerVersion(
		'workflow.created',
		3,
		workflowCreatedV3,
		(event: Event): Event => ({
			...event,
			data: {
				...(event.data as Record<string, unknown>),
				metadata: {},
			},
		}),
	);

	// workflow.node.added - Version 1
	const nodeAddedV1 = z.object({
		nodeId: z.string(),
		nodeType: z.string(),
		position: z.object({
			x: z.number(),
			y: z.number(),
		}),
	});

	versioning.registerVersion('workflow.node.added', 1, nodeAddedV1);

	// workflow.node.added - Version 2 (added configuration field)
	const nodeAddedV2 = z.object({
		nodeId: z.string(),
		nodeType: z.string(),
		position: z.object({
			x: z.number(),
			y: z.number(),
		}),
		configuration: z.record(z.unknown()),
	});

	versioning.registerVersion(
		'workflow.node.added',
		2,
		nodeAddedV2,
		(event: Event): Event => ({
			...event,
			data: {
				...(event.data as Record<string, unknown>),
				configuration: {},
			},
		}),
	);
}

/**
 * Create a migration plan for event schema changes
 */
export interface MigrationPlan {
	eventType: string;
	fromVersion: number;
	toVersion: number;
	steps: Array<{
		version: number;
		description: string;
		breaking: boolean;
	}>;
}

/**
 * Generate migration plan
 */
export function generateMigrationPlan(
	versioning: EventVersioning,
	eventType: string,
	fromVersion: number,
	toVersion: number,
): MigrationPlan {
	const history = versioning.getVersionHistory(eventType);

	const steps = history
		.filter((v) => v.version > fromVersion && v.version <= toVersion)
		.map((v) => ({
			version: v.version,
			description: `Migrate to version ${v.version}`,
			breaking: v.upcast === undefined,
		}));

	return {
		eventType,
		fromVersion,
		toVersion,
		steps,
	};
}
