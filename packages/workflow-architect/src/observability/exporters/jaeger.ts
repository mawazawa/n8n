import type { Span } from '../types';
import { ExporterConfigSchema } from '../types';

// ============================================================================
// Jaeger Exporter
// ============================================================================

export interface JaegerExporterConfig {
	endpoint: string;
	serviceName: string;
	headers?: Record<string, string>;
	batchSize?: number;
	batchTimeout?: number;
	maxQueueSize?: number;
}

export class JaegerExporter {
	private config: JaegerExporterConfig;
	private queue: Span[] = [];
	private batchTimer: NodeJS.Timeout | null = null;
	private isShutdown = false;

	constructor(config: JaegerExporterConfig) {
		this.config = {
			batchSize: 100,
			batchTimeout: 5000,
			maxQueueSize: 1000,
			...config,
		};
	}

	/**
	 * Export spans to Jaeger
	 */
	async export(spans: Span[]): Promise<void> {
		if (this.isShutdown) {
			throw new Error('Exporter is shutdown');
		}

		// Add to queue
		this.queue.push(...spans);

		// Limit queue size
		if (this.queue.length > this.config.maxQueueSize!) {
			this.queue = this.queue.slice(-this.config.maxQueueSize!);
		}

		// Export if batch size reached
		if (this.queue.length >= this.config.batchSize!) {
			await this.flush();
			return;
		}

		// Schedule batch export
		if (!this.batchTimer) {
			this.batchTimer = setTimeout(() => {
				void this.flush();
			}, this.config.batchTimeout!);
		}
	}

	/**
	 * Flush all queued spans
	 */
	async flush(): Promise<void> {
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}

		if (this.queue.length === 0) return;

		const spans = [...this.queue];
		this.queue = [];

		try {
			const jaegerBatch = this.convertToJaegerFormat(spans);
			await this.sendToJaeger(jaegerBatch);
		} catch (err) {
			console.error('Failed to export to Jaeger:', err);
			// Put spans back in queue
			this.queue.unshift(...spans);
		}
	}

	/**
	 * Convert spans to Jaeger format
	 */
	private convertToJaegerFormat(spans: Span[]): JaegerBatch {
		const jaegerSpans = spans.map(span => ({
			traceID: span.traceId,
			spanID: span.spanId,
			operationName: span.name,
			references: span.parentId ? [
				{
					refType: 'CHILD_OF',
					traceID: span.traceId,
					spanID: span.parentId,
				},
			] : [],
			startTime: span.startTime * 1000, // microseconds
			duration: (span.duration ?? 0) * 1000, // microseconds
			tags: this.convertAttributes(span.attributes),
			logs: span.events.map(event => ({
				timestamp: event.timestamp * 1000, // microseconds
				fields: event.attributes ? this.convertAttributes(event.attributes) : [],
			})),
		}));

		return {
			process: {
				serviceName: this.config.serviceName,
				tags: [],
			},
			spans: jaegerSpans,
		};
	}

	/**
	 * Convert attributes to Jaeger tags
	 */
	private convertAttributes(
		attributes: Record<string, string | number | boolean | string[] | number[]>,
	): JaegerTag[] {
		return Object.entries(attributes).map(([key, value]) => {
			if (typeof value === 'string') {
				return { key, vType: 'string', vStr: value };
			} else if (typeof value === 'number') {
				return { key, vType: Number.isInteger(value) ? 'int64' : 'float64', vNum: value };
			} else if (typeof value === 'boolean') {
				return { key, vType: 'bool', vBool: value };
			} else if (Array.isArray(value)) {
				return { key, vType: 'string', vStr: JSON.stringify(value) };
			}
			return { key, vType: 'string', vStr: String(value) };
		});
	}

	/**
	 * Send batch to Jaeger collector
	 */
	private async sendToJaeger(batch: JaegerBatch): Promise<void> {
		const response = await fetch(`${this.config.endpoint}/api/traces`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.config.headers,
			},
			body: JSON.stringify(batch),
		});

		if (!response.ok) {
			throw new Error(`Jaeger export failed: ${response.status} ${response.statusText}`);
		}
	}

	/**
	 * Shutdown exporter
	 */
	async shutdown(): Promise<void> {
		this.isShutdown = true;
		await this.flush();
	}
}

// ============================================================================
// Jaeger Types
// ============================================================================

interface JaegerBatch {
	process: {
		serviceName: string;
		tags: JaegerTag[];
	};
	spans: JaegerSpan[];
}

interface JaegerSpan {
	traceID: string;
	spanID: string;
	operationName: string;
	references: JaegerReference[];
	startTime: number;
	duration: number;
	tags: JaegerTag[];
	logs: JaegerLog[];
}

interface JaegerReference {
	refType: 'CHILD_OF' | 'FOLLOWS_FROM';
	traceID: string;
	spanID: string;
}

interface JaegerTag {
	key: string;
	vType: 'string' | 'bool' | 'int64' | 'float64' | 'binary';
	vStr?: string;
	vBool?: boolean;
	vNum?: number;
	vBin?: string;
}

interface JaegerLog {
	timestamp: number;
	fields: JaegerTag[];
}
