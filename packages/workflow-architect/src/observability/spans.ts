import type {
	Span,
	SpanStatus,
	SpanAttributes,
	SpanEvent,
	SpanLink,
} from './types';
import {
	SpanAttributesSchema,
	SpanEventSchema,
	SpanLinkSchema,
} from './types';

// ============================================================================
// Span Manager
// ============================================================================

export class SpanManager {
	private span: Span;
	private tracer: any; // Tracer instance
	private ended = false;

	constructor(span: Span, tracer: any) {
		this.span = span;
		this.tracer = tracer;
	}

	/**
	 * Add an attribute to the span
	 */
	addAttribute(key: string, value: string | number | boolean | string[] | number[]): this {
		if (this.ended) {
			console.warn('Cannot add attribute to ended span');
			return this;
		}

		// Validate attribute
		const attrs = { [key]: value };
		SpanAttributesSchema.parse(attrs);

		this.span.attributes[key] = value;
		return this;
	}

	/**
	 * Add multiple attributes to the span
	 */
	addAttributes(attributes: SpanAttributes): this {
		if (this.ended) {
			console.warn('Cannot add attributes to ended span');
			return this;
		}

		// Validate all attributes
		SpanAttributesSchema.parse(attributes);

		Object.assign(this.span.attributes, attributes);
		return this;
	}

	/**
	 * Add an event to the span
	 */
	addEvent(name: string, attributes?: SpanAttributes): this {
		if (this.ended) {
			console.warn('Cannot add event to ended span');
			return this;
		}

		const event: SpanEvent = {
			name,
			timestamp: Date.now(),
			attributes,
		};

		// Validate event
		SpanEventSchema.parse(event);

		this.span.events.push(event);
		return this;
	}

	/**
	 * Set the status of the span
	 */
	setStatus(status: SpanStatus): this {
		if (this.ended) {
			console.warn('Cannot set status on ended span');
			return this;
		}

		this.span.status = status;
		return this;
	}

	/**
	 * Record an exception in the span
	 */
	recordException(error: Error): this {
		if (this.ended) {
			console.warn('Cannot record exception on ended span');
			return this;
		}

		this.addEvent('exception', {
			'exception.type': error.name,
			'exception.message': error.message,
			'exception.stacktrace': error.stack ?? '',
		});

		this.setStatus('error');
		return this;
	}

	/**
	 * Add a link to another span
	 */
	addLink(link: SpanLink): this {
		if (this.ended) {
			console.warn('Cannot add link to ended span');
			return this;
		}

		// Validate link
		SpanLinkSchema.parse(link);

		this.span.links.push(link);
		return this;
	}

	/**
	 * Get the span ID
	 */
	getSpanId(): string {
		return this.span.spanId;
	}

	/**
	 * Get the trace ID
	 */
	getTraceId(): string {
		return this.span.traceId;
	}

	/**
	 * Get the span data
	 */
	getSpan(): Span {
		return this.span;
	}

	/**
	 * Check if span has ended
	 */
	isEnded(): boolean {
		return this.ended;
	}

	/**
	 * End the span
	 */
	end(endTime?: number): void {
		if (this.ended) {
			console.warn('Span already ended');
			return;
		}

		this.span.endTime = endTime ?? Date.now();
		this.span.duration = this.span.endTime - this.span.startTime;
		this.ended = true;

		// Notify tracer
		if (this.tracer && typeof this.tracer.endSpan === 'function') {
			this.tracer.endSpan(this);
		}
	}

	/**
	 * Update the span name
	 */
	updateName(name: string): this {
		if (this.ended) {
			console.warn('Cannot update name of ended span');
			return this;
		}

		this.span.name = name;
		return this;
	}

	/**
	 * Get span duration (current if not ended)
	 */
	getDuration(): number {
		if (this.span.duration !== undefined) {
			return this.span.duration;
		}
		return Date.now() - this.span.startTime;
	}

	/**
	 * Check if span is sampled (always true in this implementation)
	 */
	isSampled(): boolean {
		return true;
	}

	/**
	 * Get span context for propagation
	 */
	getContext(): { traceId: string; spanId: string } {
		return {
			traceId: this.span.traceId,
			spanId: this.span.spanId,
		};
	}
}

// ============================================================================
// Span Utilities
// ============================================================================

export class SpanUtils {
	/**
	 * Calculate critical path through a trace
	 */
	static calculateCriticalPath(spans: Span[]): Span[] {
		if (spans.length === 0) return [];

		// Build span map
		const spanMap = new Map<string, Span>();
		spans.forEach(span => spanMap.set(span.spanId, span));

		// Find root span
		const rootSpan = spans.find(s => !s.parentId);
		if (!rootSpan) return [];

		// Build tree and find longest path
		const path: Span[] = [];
		let currentSpan: Span | undefined = rootSpan;

		while (currentSpan) {
			path.push(currentSpan);

			// Find child with longest duration
			const children = spans.filter(s => s.parentId === currentSpan!.spanId);
			if (children.length === 0) break;

			currentSpan = children.reduce((longest, child) =>
				(child.duration ?? 0) > (longest.duration ?? 0) ? child : longest
			);
		}

		return path;
	}

	/**
	 * Calculate span depth in trace tree
	 */
	static calculateDepth(span: Span, spans: Span[]): number {
		let depth = 0;
		let currentSpan = span;

		while (currentSpan.parentId) {
			const parent = spans.find(s => s.spanId === currentSpan.parentId);
			if (!parent) break;
			depth++;
			currentSpan = parent;
		}

		return depth;
	}

	/**
	 * Get all descendants of a span
	 */
	static getDescendants(spanId: string, spans: Span[]): Span[] {
		const descendants: Span[] = [];
		const queue = [spanId];

		while (queue.length > 0) {
			const currentId = queue.shift()!;
			const children = spans.filter(s => s.parentId === currentId);

			descendants.push(...children);
			queue.push(...children.map(c => c.spanId));
		}

		return descendants;
	}

	/**
	 * Get all ancestors of a span
	 */
	static getAncestors(span: Span, spans: Span[]): Span[] {
		const ancestors: Span[] = [];
		let currentSpan = span;

		while (currentSpan.parentId) {
			const parent = spans.find(s => s.spanId === currentSpan.parentId);
			if (!parent) break;
			ancestors.push(parent);
			currentSpan = parent;
		}

		return ancestors;
	}

	/**
	 * Build trace tree structure
	 */
	static buildTree(spans: Span[]): SpanTree {
		const spanMap = new Map<string, Span>();
		const childrenMap = new Map<string, Span[]>();

		// Build maps
		spans.forEach(span => {
			spanMap.set(span.spanId, span);

			if (span.parentId) {
				const siblings = childrenMap.get(span.parentId) ?? [];
				siblings.push(span);
				childrenMap.set(span.parentId, siblings);
			}
		});

		// Find root
		const root = spans.find(s => !s.parentId);
		if (!root) {
			return { span: spans[0], children: [] };
		}

		return this.buildTreeRecursive(root, childrenMap);
	}

	private static buildTreeRecursive(
		span: Span,
		childrenMap: Map<string, Span[]>,
	): SpanTree {
		const children = childrenMap.get(span.spanId) ?? [];
		return {
			span,
			children: children.map(child => this.buildTreeRecursive(child, childrenMap)),
		};
	}

	/**
	 * Calculate span statistics
	 */
	static calculateStats(spans: Span[]): SpanStats {
		if (spans.length === 0) {
			return {
				count: 0,
				totalDuration: 0,
				avgDuration: 0,
				minDuration: 0,
				maxDuration: 0,
				errorCount: 0,
				errorRate: 0,
			};
		}

		const durations = spans
			.map(s => s.duration ?? 0)
			.filter(d => d > 0);

		const errorCount = spans.filter(s => s.status === 'error').length;

		return {
			count: spans.length,
			totalDuration: durations.reduce((sum, d) => sum + d, 0),
			avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
			minDuration: Math.min(...durations),
			maxDuration: Math.max(...durations),
			errorCount,
			errorRate: errorCount / spans.length,
		};
	}

	/**
	 * Filter spans by attributes
	 */
	static filterByAttributes(
		spans: Span[],
		filter: Record<string, string | number | boolean>,
	): Span[] {
		return spans.filter(span => {
			return Object.entries(filter).every(([key, value]) => {
				return span.attributes[key] === value;
			});
		});
	}

	/**
	 * Find spans by name pattern
	 */
	static findByNamePattern(spans: Span[], pattern: string | RegExp): Span[] {
		const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
		return spans.filter(span => regex.test(span.name));
	}

	/**
	 * Calculate self-time (time not spent in children)
	 */
	static calculateSelfTime(span: Span, allSpans: Span[]): number {
		const children = allSpans.filter(s => s.parentId === span.spanId);
		const childrenTime = children.reduce((sum, child) => sum + (child.duration ?? 0), 0);
		return (span.duration ?? 0) - childrenTime;
	}
}

// ============================================================================
// Types
// ============================================================================

export interface SpanTree {
	span: Span;
	children: SpanTree[];
}

export interface SpanStats {
	count: number;
	totalDuration: number;
	avgDuration: number;
	minDuration: number;
	maxDuration: number;
	errorCount: number;
	errorRate: number;
}
