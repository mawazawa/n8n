import { randomBytes } from 'node:crypto';
import type {
	Span,
	SpanKind,
	SpanAttributes,
	TraceContext,
	SpanLink,
} from './types';
import { SpanManager } from './spans';
import type { ExporterConfig } from './types';
import { SpanAttributesSchema } from './types';

// ============================================================================
// W3C Trace Context
// ============================================================================

const TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export class W3CTraceContext {
	static parse(traceparent: string): TraceContext | null {
		const match = TRACEPARENT_REGEX.exec(traceparent);
		if (!match) return null;

		const [, traceId, spanId, flags] = match;
		return {
			traceId,
			spanId,
			traceFlags: parseInt(flags, 16),
		};
	}

	static format(context: TraceContext): string {
		const flags = context.traceFlags.toString(16).padStart(2, '0');
		return `00-${context.traceId}-${context.spanId}-${flags}`;
	}

	static inject(context: TraceContext, headers: Record<string, string>): void {
		headers['traceparent'] = this.format(context);
		if (context.traceState) {
			headers['tracestate'] = context.traceState;
		}
	}

	static extract(headers: Record<string, string>): TraceContext | null {
		const traceparent = headers['traceparent'] || headers['Traceparent'];
		if (!traceparent) return null;

		const context = this.parse(traceparent);
		if (!context) return null;

		const tracestate = headers['tracestate'] || headers['Tracestate'];
		if (tracestate) {
			context.traceState = tracestate;
		}

		return context;
	}
}

// ============================================================================
// Context Management
// ============================================================================

interface ActiveContext {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	baggage: Map<string, string>;
}

const contextStore = new Map<string, ActiveContext>();

export class ContextManager {
	private static currentContext: ActiveContext | null = null;

	static setActiveContext(context: ActiveContext): void {
		this.currentContext = context;
	}

	static getActiveContext(): ActiveContext | null {
		return this.currentContext;
	}

	static clearActiveContext(): void {
		this.currentContext = null;
	}

	static setBaggage(key: string, value: string): void {
		if (this.currentContext) {
			this.currentContext.baggage.set(key, value);
		}
	}

	static getBaggage(key: string): string | undefined {
		return this.currentContext?.baggage.get(key);
	}

	static getAllBaggage(): Map<string, string> {
		return this.currentContext?.baggage ?? new Map();
	}
}

// ============================================================================
// Span Options
// ============================================================================

export interface SpanOptions {
	kind?: SpanKind;
	attributes?: SpanAttributes;
	links?: SpanLink[];
	startTime?: number;
	parent?: TraceContext;
}

// ============================================================================
// Tracer
// ============================================================================

export class Tracer {
	private serviceName: string;
	private activeSpans = new Map<string, SpanManager>();
	private exporters: Array<(spans: Span[]) => Promise<void>> = [];
	private batchSize = 100;
	private batchTimeout = 5000;
	private spanBuffer: Span[] = [];
	private batchTimer: NodeJS.Timeout | null = null;

	constructor(serviceName: string) {
		this.serviceName = serviceName;
	}

	/**
	 * Configure exporters for trace data
	 */
	addExporter(exporter: (spans: Span[]) => Promise<void>): void {
		this.exporters.push(exporter);
	}

	/**
	 * Configure batching behavior
	 */
	configureBatching(batchSize: number, batchTimeout: number): void {
		this.batchSize = batchSize;
		this.batchTimeout = batchTimeout;
	}

	/**
	 * Start a new span
	 */
	startSpan(name: string, options: SpanOptions = {}): SpanManager {
		const startTime = options.startTime ?? Date.now();
		const context = ContextManager.getActiveContext();

		// Determine trace and parent IDs
		let traceId: string;
		let parentId: string | undefined;

		if (options.parent) {
			traceId = options.parent.traceId;
			parentId = options.parent.spanId;
		} else if (context) {
			traceId = context.traceId;
			parentId = context.spanId;
		} else {
			traceId = this.generateTraceId();
		}

		const spanId = this.generateSpanId();

		// Validate attributes
		const attributes = options.attributes ?? {};
		SpanAttributesSchema.parse(attributes);

		const span: Span = {
			spanId,
			traceId,
			parentId,
			name,
			kind: options.kind ?? 'internal',
			startTime,
			status: 'unset',
			attributes,
			events: [],
			links: options.links ?? [],
		};

		const spanManager = new SpanManager(span, this);
		this.activeSpans.set(spanId, spanManager);

		// Set as active context
		ContextManager.setActiveContext({
			traceId,
			spanId,
			parentSpanId: parentId,
			baggage: new Map(),
		});

		return spanManager;
	}

	/**
	 * Execute a function within a span context
	 */
	async withSpan<T>(
		name: string,
		fn: (span: SpanManager) => Promise<T>,
		options: SpanOptions = {},
	): Promise<T> {
		const span = this.startSpan(name, options);

		try {
			const result = await fn(span);
			span.end();
			return result;
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus('error');
			span.end();
			throw error;
		}
	}

	/**
	 * Execute a synchronous function within a span context
	 */
	withSpanSync<T>(
		name: string,
		fn: (span: SpanManager) => T,
		options: SpanOptions = {},
	): T {
		const span = this.startSpan(name, options);

		try {
			const result = fn(span);
			span.end();
			return result;
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus('error');
			span.end();
			throw error;
		}
	}

	/**
	 * End a span and add it to the export buffer
	 */
	endSpan(spanManager: SpanManager): void {
		const span = spanManager.getSpan();
		this.activeSpans.delete(span.spanId);

		// Restore parent context if exists
		if (span.parentId) {
			const parentSpan = this.activeSpans.get(span.parentId);
			if (parentSpan) {
				const parentData = parentSpan.getSpan();
				ContextManager.setActiveContext({
					traceId: parentData.traceId,
					spanId: parentData.spanId,
					parentSpanId: parentData.parentId,
					baggage: new Map(),
				});
			}
		} else {
			ContextManager.clearActiveContext();
		}

		// Add to buffer for export
		this.addToBuffer(span);
	}

	/**
	 * Get current trace context
	 */
	getCurrentContext(): TraceContext | null {
		const context = ContextManager.getActiveContext();
		if (!context) return null;

		return {
			traceId: context.traceId,
			spanId: context.spanId,
			traceFlags: 1, // sampled
		};
	}

	/**
	 * Inject context into headers for propagation
	 */
	inject(headers: Record<string, string>): void {
		const context = this.getCurrentContext();
		if (context) {
			W3CTraceContext.inject(context, headers);
		}
	}

	/**
	 * Extract context from headers
	 */
	extract(headers: Record<string, string>): TraceContext | null {
		return W3CTraceContext.extract(headers);
	}

	/**
	 * Create a span from extracted context
	 */
	startSpanFromContext(
		name: string,
		headers: Record<string, string>,
		options: Omit<SpanOptions, 'parent'> = {},
	): SpanManager {
		const context = this.extract(headers);
		return this.startSpan(name, {
			...options,
			parent: context ?? undefined,
		});
	}

	/**
	 * Generate a unique trace ID (128-bit)
	 */
	private generateTraceId(): string {
		return randomBytes(16).toString('hex');
	}

	/**
	 * Generate a unique span ID (64-bit)
	 */
	private generateSpanId(): string {
		return randomBytes(8).toString('hex');
	}

	/**
	 * Add span to buffer and trigger export if needed
	 */
	private addToBuffer(span: Span): void {
		this.spanBuffer.push(span);

		// Export immediately if buffer is full
		if (this.spanBuffer.length >= this.batchSize) {
			void this.flush();
			return;
		}

		// Schedule batch export
		if (!this.batchTimer) {
			this.batchTimer = setTimeout(() => {
				void this.flush();
			}, this.batchTimeout);
		}
	}

	/**
	 * Flush all buffered spans to exporters
	 */
	async flush(): Promise<void> {
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}

		if (this.spanBuffer.length === 0) return;

		const spans = [...this.spanBuffer];
		this.spanBuffer = [];

		// Export to all configured exporters
		await Promise.allSettled(
			this.exporters.map(exporter => exporter(spans)),
		);
	}

	/**
	 * Get service name
	 */
	getServiceName(): string {
		return this.serviceName;
	}

	/**
	 * Shutdown tracer and flush remaining spans
	 */
	async shutdown(): Promise<void> {
		await this.flush();
		this.activeSpans.clear();
		ContextManager.clearActiveContext();
	}
}

// ============================================================================
// Global Tracer Instance
// ============================================================================

let globalTracer: Tracer | null = null;

export function initTracer(serviceName: string): Tracer {
	globalTracer = new Tracer(serviceName);
	return globalTracer;
}

export function getTracer(): Tracer {
	if (!globalTracer) {
		throw new Error('Tracer not initialized. Call initTracer() first.');
	}
	return globalTracer;
}

// ============================================================================
// Express Middleware for Auto-Instrumentation
// ============================================================================

export interface TracingMiddlewareOptions {
	serviceName?: string;
	ignoreRoutes?: string[];
	extractHeaders?: boolean;
}

export function tracingMiddleware(options: TracingMiddlewareOptions = {}) {
	const tracer = options.serviceName
		? initTracer(options.serviceName)
		: getTracer();

	const ignoreRoutes = new Set(options.ignoreRoutes ?? []);

	return (req: any, res: any, next: any) => {
		// Skip ignored routes
		if (ignoreRoutes.has(req.path)) {
			return next();
		}

		// Extract parent context from headers if enabled
		const parentContext = options.extractHeaders !== false
			? tracer.extract(req.headers)
			: null;

		// Start span for request
		const span = tracer.startSpan(`${req.method} ${req.route?.path ?? req.path}`, {
			kind: 'server',
			parent: parentContext ?? undefined,
			attributes: {
				'http.method': req.method,
				'http.url': req.url,
				'http.route': req.route?.path ?? req.path,
				'http.user_agent': req.headers['user-agent'] ?? '',
			},
		});

		// Inject trace context into response headers
		const context = tracer.getCurrentContext();
		if (context) {
			res.setHeader('X-Trace-Id', context.traceId);
		}

		// Record response
		const originalEnd = res.end;
		res.end = function(this: any, ...args: any[]) {
			span.addAttribute('http.status_code', res.statusCode);

			if (res.statusCode >= 400) {
				span.setStatus('error');
			} else {
				span.setStatus('ok');
			}

			span.end();
			return originalEnd.apply(this, args);
		};

		next();
	};
}
