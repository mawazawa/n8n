import type { Span } from '../types';

// ============================================================================
// OTLP Exporter (OpenTelemetry Protocol)
// ============================================================================

export interface OTLPExporterConfig {
	endpoint: string;
	serviceName: string;
	headers?: Record<string, string>;
	batchSize?: number;
	batchTimeout?: number;
	maxQueueSize?: number;
	compression?: boolean;
}

export class OTLPExporter {
	private config: OTLPExporterConfig;
	private queue: Span[] = [];
	private batchTimer: NodeJS.Timeout | null = null;
	private isShutdown = false;

	constructor(config: OTLPExporterConfig) {
		this.config = {
			batchSize: 100,
			batchTimeout: 5000,
			maxQueueSize: 1000,
			compression: false,
			...config,
		};
	}

	/**
	 * Export spans to OTLP endpoint
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
			const otlpRequest = this.convertToOTLPFormat(spans);
			await this.sendToOTLP(otlpRequest);
		} catch (err) {
			console.error('Failed to export to OTLP:', err);
			// Put spans back in queue
			this.queue.unshift(...spans);
		}
	}

	/**
	 * Convert spans to OTLP format
	 */
	private convertToOTLPFormat(spans: Span[]): OTLPTraceRequest {
		const resourceSpans: OTLPResourceSpans = {
			resource: {
				attributes: [
					{
						key: 'service.name',
						value: { stringValue: this.config.serviceName },
					},
				],
			},
			scopeSpans: [
				{
					scope: {
						name: 'workflow-architect',
						version: '1.0.0',
					},
					spans: spans.map(span => this.convertSpan(span)),
				},
			],
		};

		return {
			resourceSpans: [resourceSpans],
		};
	}

	/**
	 * Convert a single span to OTLP format
	 */
	private convertSpan(span: Span): OTLPSpan {
		return {
			traceId: this.hexToBase64(span.traceId),
			spanId: this.hexToBase64(span.spanId),
			parentSpanId: span.parentId ? this.hexToBase64(span.parentId) : undefined,
			name: span.name,
			kind: this.convertKind(span.kind),
			startTimeUnixNano: String(span.startTime * 1000000), // nanoseconds
			endTimeUnixNano: span.endTime ? String(span.endTime * 1000000) : undefined,
			attributes: this.convertAttributes(span.attributes),
			events: span.events.map(event => ({
				timeUnixNano: String(event.timestamp * 1000000),
				name: event.name,
				attributes: event.attributes ? this.convertAttributes(event.attributes) : [],
			})),
			links: span.links.map(link => ({
				traceId: this.hexToBase64(link.traceId),
				spanId: this.hexToBase64(link.spanId),
				attributes: link.attributes ? this.convertAttributes(link.attributes) : [],
			})),
			status: {
				code: this.convertStatus(span.status),
			},
		};
	}

	/**
	 * Convert span kind to OTLP kind
	 */
	private convertKind(kind: string): number {
		const kindMap: Record<string, number> = {
			internal: 1,
			server: 2,
			client: 3,
			producer: 4,
			consumer: 5,
		};
		return kindMap[kind] ?? 1;
	}

	/**
	 * Convert span status to OTLP status code
	 */
	private convertStatus(status: string): number {
		const statusMap: Record<string, number> = {
			unset: 0,
			ok: 1,
			error: 2,
		};
		return statusMap[status] ?? 0;
	}

	/**
	 * Convert attributes to OTLP format
	 */
	private convertAttributes(
		attributes: Record<string, string | number | boolean | string[] | number[]>,
	): OTLPAttribute[] {
		return Object.entries(attributes).map(([key, value]) => {
			let attributeValue: OTLPAnyValue;

			if (typeof value === 'string') {
				attributeValue = { stringValue: value };
			} else if (typeof value === 'number') {
				if (Number.isInteger(value)) {
					attributeValue = { intValue: String(value) };
				} else {
					attributeValue = { doubleValue: value };
				}
			} else if (typeof value === 'boolean') {
				attributeValue = { boolValue: value };
			} else if (Array.isArray(value)) {
				if (typeof value[0] === 'string') {
					attributeValue = {
						arrayValue: {
							values: value.map(v => ({ stringValue: String(v) })),
						},
					};
				} else {
					attributeValue = {
						arrayValue: {
							values: value.map(v => ({ intValue: String(v) })),
						},
					};
				}
			} else {
				attributeValue = { stringValue: String(value) };
			}

			return { key, value: attributeValue };
		});
	}

	/**
	 * Convert hex string to base64
	 */
	private hexToBase64(hex: string): string {
		const bytes = Buffer.from(hex, 'hex');
		return bytes.toString('base64');
	}

	/**
	 * Send request to OTLP endpoint
	 */
	private async sendToOTLP(request: OTLPTraceRequest): Promise<void> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.config.headers,
		};

		const response = await fetch(`${this.config.endpoint}/v1/traces`, {
			method: 'POST',
			headers,
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
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
// OTLP Types
// ============================================================================

interface OTLPTraceRequest {
	resourceSpans: OTLPResourceSpans[];
}

interface OTLPResourceSpans {
	resource: {
		attributes: OTLPAttribute[];
	};
	scopeSpans: OTLPScopeSpans[];
}

interface OTLPScopeSpans {
	scope: {
		name: string;
		version: string;
	};
	spans: OTLPSpan[];
}

interface OTLPSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	kind: number;
	startTimeUnixNano: string;
	endTimeUnixNano?: string;
	attributes: OTLPAttribute[];
	events: OTLPEvent[];
	links: OTLPLink[];
	status: {
		code: number;
	};
}

interface OTLPAttribute {
	key: string;
	value: OTLPAnyValue;
}

interface OTLPAnyValue {
	stringValue?: string;
	intValue?: string;
	doubleValue?: number;
	boolValue?: boolean;
	arrayValue?: {
		values: OTLPAnyValue[];
	};
}

interface OTLPEvent {
	timeUnixNano: string;
	name: string;
	attributes: OTLPAttribute[];
}

interface OTLPLink {
	traceId: string;
	spanId: string;
	attributes: OTLPAttribute[];
}
