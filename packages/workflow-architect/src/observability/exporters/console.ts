import type { Span } from '../types';

// ============================================================================
// Console Exporter
// ============================================================================

export interface ConsoleExporterConfig {
	serviceName: string;
	pretty?: boolean;
	verbose?: boolean;
}

export class ConsoleExporter {
	private config: ConsoleExporterConfig;

	constructor(config: ConsoleExporterConfig) {
		this.config = {
			pretty: true,
			verbose: false,
			...config,
		};
	}

	/**
	 * Export spans to console
	 */
	async export(spans: Span[]): Promise<void> {
		if (this.config.pretty) {
			this.exportPretty(spans);
		} else {
			this.exportJSON(spans);
		}
	}

	/**
	 * Export spans as pretty-printed text
	 */
	private exportPretty(spans: Span[]): void {
		console.log(`\n${'='.repeat(80)}`);
		console.log(`TRACE EXPORT - ${this.config.serviceName}`);
		console.log(`Exported ${spans.length} span(s) at ${new Date().toISOString()}`);
		console.log('='.repeat(80));

		// Group spans by trace
		const traceMap = new Map<string, Span[]>();
		for (const span of spans) {
			const traceSpans = traceMap.get(span.traceId) ?? [];
			traceSpans.push(span);
			traceMap.set(span.traceId, traceSpans);
		}

		// Print each trace
		for (const [traceId, traceSpans] of traceMap.entries()) {
			this.printTrace(traceId, traceSpans);
		}

		console.log('='.repeat(80) + '\n');
	}

	/**
	 * Print a single trace
	 */
	private printTrace(traceId: string, spans: Span[]): void {
		console.log(`\nTrace ID: ${traceId}`);
		console.log(`Spans: ${spans.length}`);

		// Find root span
		const rootSpan = spans.find(s => !s.parentId);
		if (rootSpan) {
			console.log(`Root: ${rootSpan.name}`);
			console.log(`Duration: ${rootSpan.duration}ms`);
		}

		// Build tree
		const tree = this.buildSpanTree(spans);
		this.printSpanTree(tree, 0);
	}

	/**
	 * Build span tree structure
	 */
	private buildSpanTree(spans: Span[]): SpanTreeNode[] {
		const spanMap = new Map<string, Span>();
		const childrenMap = new Map<string, Span[]>();

		// Build maps
		for (const span of spans) {
			spanMap.set(span.spanId, span);

			if (span.parentId) {
				const siblings = childrenMap.get(span.parentId) ?? [];
				siblings.push(span);
				childrenMap.set(span.parentId, siblings);
			}
		}

		// Find roots
		const roots = spans.filter(s => !s.parentId);

		// Build tree
		return roots.map(root => this.buildNode(root, childrenMap));
	}

	/**
	 * Build tree node recursively
	 */
	private buildNode(span: Span, childrenMap: Map<string, Span[]>): SpanTreeNode {
		const children = childrenMap.get(span.spanId) ?? [];
		return {
			span,
			children: children.map(child => this.buildNode(child, childrenMap)),
		};
	}

	/**
	 * Print span tree
	 */
	private printSpanTree(nodes: SpanTreeNode[], depth: number): void {
		for (const node of nodes) {
			const indent = '  '.repeat(depth);
			const status = this.getStatusIcon(node.span.status);
			const duration = node.span.duration ?? 0;

			console.log(`${indent}${status} ${node.span.name} (${duration}ms)`);

			if (this.config.verbose) {
				// Print attributes
				const attrs = Object.entries(node.span.attributes);
				if (attrs.length > 0) {
					console.log(`${indent}  Attributes:`);
					for (const [key, value] of attrs) {
						console.log(`${indent}    ${key}: ${value}`);
					}
				}

				// Print events
				if (node.span.events.length > 0) {
					console.log(`${indent}  Events:`);
					for (const event of node.span.events) {
						console.log(`${indent}    [${event.timestamp}] ${event.name}`);
					}
				}
			}

			// Print children
			if (node.children.length > 0) {
				this.printSpanTree(node.children, depth + 1);
			}
		}
	}

	/**
	 * Get status icon
	 */
	private getStatusIcon(status: string): string {
		switch (status) {
			case 'ok': return '✓';
			case 'error': return '✗';
			default: return '•';
		}
	}

	/**
	 * Export spans as JSON
	 */
	private exportJSON(spans: Span[]): void {
		console.log(JSON.stringify(spans, null, 2));
	}

	/**
	 * Flush (no-op for console exporter)
	 */
	async flush(): Promise<void> {
		// Nothing to flush
	}

	/**
	 * Shutdown exporter
	 */
	async shutdown(): Promise<void> {
		// Nothing to cleanup
	}
}

// ============================================================================
// Types
// ============================================================================

interface SpanTreeNode {
	span: Span;
	children: SpanTreeNode[];
}
