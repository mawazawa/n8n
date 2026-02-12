import type { LogEntry, TraceContext, Span } from './types';

// ============================================================================
// Correlation Engine
// ============================================================================

export class CorrelationEngine {
	private tracesProvider?: () => Span[];
	private logsProvider?: () => LogEntry[];

	/**
	 * Set traces provider
	 */
	setTracesProvider(provider: () => Span[]): void {
		this.tracesProvider = provider;
	}

	/**
	 * Set logs provider
	 */
	setLogsProvider(provider: () => LogEntry[]): void {
		this.logsProvider = provider;
	}

	/**
	 * Correlate a log entry with trace context
	 */
	correlate(logEntry: LogEntry): TraceContext | null {
		// Extract trace context from log entry
		if (logEntry.traceId && logEntry.spanId) {
			return {
				traceId: logEntry.traceId,
				spanId: logEntry.spanId,
				traceFlags: 1,
			};
		}

		return null;
	}

	/**
	 * Get logs for a specific trace
	 */
	getLogsForTrace(traceId: string): LogEntry[] {
		if (!this.logsProvider) return [];

		const logs = this.logsProvider();
		return logs.filter(log => log.traceId === traceId);
	}

	/**
	 * Get logs for a specific span
	 */
	getLogsForSpan(traceId: string, spanId: string): LogEntry[] {
		if (!this.logsProvider) return [];

		const logs = this.logsProvider();
		return logs.filter(log => log.traceId === traceId && log.spanId === spanId);
	}

	/**
	 * Get trace for a log entry
	 */
	getTraceForLog(logEntry: LogEntry): Span[] {
		if (!this.tracesProvider || !logEntry.traceId) return [];

		const spans = this.tracesProvider();
		return spans.filter(span => span.traceId === logEntry.traceId);
	}

	/**
	 * Build unified view of trace with logs
	 */
	buildUnifiedView(traceId: string): UnifiedTraceView {
		const spans = this.tracesProvider ? this.tracesProvider() : [];
		const logs = this.logsProvider ? this.logsProvider() : [];

		const traceSpans = spans.filter(span => span.traceId === traceId);
		const traceLogs = logs.filter(log => log.traceId === traceId);

		// Build timeline
		const timeline: TimelineEvent[] = [];

		// Add span events
		for (const span of traceSpans) {
			timeline.push({
				timestamp: span.startTime,
				type: 'span_start',
				spanId: span.spanId,
				data: span,
			});

			if (span.endTime) {
				timeline.push({
					timestamp: span.endTime,
					type: 'span_end',
					spanId: span.spanId,
					data: span,
				});
			}

			// Add span events
			for (const event of span.events) {
				timeline.push({
					timestamp: event.timestamp,
					type: 'span_event',
					spanId: span.spanId,
					data: event,
				});
			}
		}

		// Add log events
		for (const log of traceLogs) {
			timeline.push({
				timestamp: log.timestamp,
				type: 'log',
				spanId: log.spanId,
				data: log,
			});
		}

		// Sort by timestamp
		timeline.sort((a, b) => a.timestamp - b.timestamp);

		return {
			traceId,
			spans: traceSpans,
			logs: traceLogs,
			timeline,
		};
	}

	/**
	 * Search for related traces based on log patterns
	 */
	findRelatedTraces(logEntry: LogEntry, maxResults = 10): string[] {
		if (!this.logsProvider) return [];

		const logs = this.logsProvider();
		const relatedTraces = new Set<string>();

		// Find logs with similar context
		for (const log of logs) {
			if (log.id === logEntry.id) continue;
			if (!log.traceId) continue;

			// Check for similar error patterns
			if (logEntry.level === 'error' && log.level === 'error') {
				if (logEntry.error && log.error) {
					if (logEntry.error.name === log.error.name) {
						relatedTraces.add(log.traceId);
					}
				}
			}

			// Check for similar context keys
			const commonKeys = Object.keys(logEntry.context).filter(key =>
				Object.keys(log.context).includes(key),
			);

			if (commonKeys.length > 2) {
				if (log.traceId) {
					relatedTraces.add(log.traceId);
				}
			}

			if (relatedTraces.size >= maxResults) break;
		}

		return Array.from(relatedTraces);
	}

	/**
	 * Analyze error propagation across traces
	 */
	analyzeErrorPropagation(traceId: string): ErrorPropagationAnalysis {
		const view = this.buildUnifiedView(traceId);
		const errorEvents: Array<{ timestamp: number; spanId: string; error: string }> = [];

		// Find error events
		for (const span of view.spans) {
			if (span.status === 'error') {
				const errorEvent = span.events.find(e => e.name === 'exception');
				if (errorEvent) {
					errorEvents.push({
						timestamp: span.startTime,
						spanId: span.spanId,
						error: String(errorEvent.attributes?.['exception.message'] ?? 'Unknown'),
					});
				}
			}
		}

		// Find error logs
		for (const log of view.logs) {
			if (log.level === 'error' && log.error) {
				errorEvents.push({
					timestamp: log.timestamp,
					spanId: log.spanId ?? '',
					error: log.error.message,
				});
			}
		}

		// Sort by timestamp
		errorEvents.sort((a, b) => a.timestamp - b.timestamp);

		return {
			traceId,
			errorCount: errorEvents.length,
			firstError: errorEvents[0],
			errorChain: errorEvents,
			rootCause: errorEvents[0]?.error,
		};
	}

	/**
	 * Inject trace context into log entry
	 */
	static injectTraceContext(logEntry: LogEntry, context: TraceContext): LogEntry {
		return {
			...logEntry,
			traceId: context.traceId,
			spanId: context.spanId,
		};
	}

	/**
	 * Extract trace context from headers (for cross-service correlation)
	 */
	static extractFromHeaders(headers: Record<string, string>): TraceContext | null {
		const traceparent = headers['traceparent'] || headers['Traceparent'];
		if (!traceparent) return null;

		const regex = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
		const match = regex.exec(traceparent);

		if (!match) return null;

		const [, traceId, spanId, flags] = match;
		return {
			traceId,
			spanId,
			traceFlags: parseInt(flags, 16),
			traceState: headers['tracestate'] || headers['Tracestate'],
		};
	}
}

// ============================================================================
// Types
// ============================================================================

export interface UnifiedTraceView {
	traceId: string;
	spans: Span[];
	logs: LogEntry[];
	timeline: TimelineEvent[];
}

export interface TimelineEvent {
	timestamp: number;
	type: 'span_start' | 'span_end' | 'span_event' | 'log';
	spanId?: string;
	data: unknown;
}

export interface ErrorPropagationAnalysis {
	traceId: string;
	errorCount: number;
	firstError?: { timestamp: number; spanId: string; error: string };
	errorChain: Array<{ timestamp: number; spanId: string; error: string }>;
	rootCause?: string;
}
