import type { Span } from '../types';

// ============================================================================
// Zipkin Exporter
// ============================================================================

export interface ZipkinExporterConfig {
	endpoint: string;
	serviceName: string;
	headers?: Record<string, string>;
	batchSize?: number;
	batchTimeout?: number;
	maxQueueSize?: number;
}

export class ZipkinExporter {
	private config: ZipkinExporterConfig;
	private queue: Span[] = [];
	private batchTimer: NodeJS.Timeout | null = null;
	private isShutdown = false;

	constructor(config: ZipkinExporterConfig) {
		this.config = {
			batchSize: 100,
			batchTimeout: 5000,
			maxQueueSize: 1000,
			...config,
		};
	}

	/**
	 * Export spans to Zipkin
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
			const zipkinSpans = this.convertToZipkinFormat(spans);
			await this.sendToZipkin(zipkinSpans);
		} catch (err) {
			console.error('Failed to export to Zipkin:', err);
			// Put spans back in queue
			this.queue.unshift(...spans);
		}
	}

	/**
	 * Convert spans to Zipkin format
	 */
	private convertToZipkinFormat(spans: Span[]): ZipkinSpan[] {
		return spans.map(span => {
			const zipkinSpan: ZipkinSpan = {
				traceId: span.traceId,
				id: span.spanId,
				name: span.name,
				timestamp: span.startTime * 1000, // microseconds
				duration: (span.duration ?? 0) * 1000, // microseconds
				kind: this.convertKind(span.kind),
				localEndpoint: {
					serviceName: this.config.serviceName,
				},
				tags: this.convertAttributes(span.attributes),
				annotations: span.events.map(event => ({
					timestamp: event.timestamp * 1000, // microseconds
					value: event.name,
				})),
			};

			if (span.parentId) {
				zipkinSpan.parentId = span.parentId;
			}

			return zipkinSpan;
		});
	}

	/**
	 * Convert span kind to Zipkin kind
	 */
	private convertKind(kind: string): ZipkinKind {
		switch (kind) {
			case 'server': return 'SERVER';
			case 'client': return 'CLIENT';
			case 'producer': return 'PRODUCER';
			case 'consumer': return 'CONSUMER';
			default: return 'CLIENT';
		}
	}

	/**
	 * Convert attributes to Zipkin tags
	 */
	private convertAttributes(
		attributes: Record<string, string | number | boolean | string[] | number[]>,
	): Record<string, string> {
		const tags: Record<string, string> = {};

		for (const [key, value] of Object.entries(attributes)) {
			if (Array.isArray(value)) {
				tags[key] = JSON.stringify(value);
			} else {
				tags[key] = String(value);
			}
		}

		return tags;
	}

	/**
	 * Send spans to Zipkin collector
	 */
	private async sendToZipkin(spans: ZipkinSpan[]): Promise<void> {
		const response = await fetch(`${this.config.endpoint}/api/v2/spans`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.config.headers,
			},
			body: JSON.stringify(spans),
		});

		if (!response.ok) {
			throw new Error(`Zipkin export failed: ${response.status} ${response.statusText}`);
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
// Zipkin Types
// ============================================================================

type ZipkinKind = 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';

interface ZipkinSpan {
	traceId: string;
	id: string;
	parentId?: string;
	name: string;
	timestamp: number;
	duration: number;
	kind: ZipkinKind;
	localEndpoint: {
		serviceName: string;
	};
	tags: Record<string, string>;
	annotations: ZipkinAnnotation[];
}

interface ZipkinAnnotation {
	timestamp: number;
	value: string;
}
