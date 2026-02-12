import { z } from 'zod';
import type { Trace, Metric, LogEntry, SLO, AlertRule } from './types';
import {
	TraceQuerySchema,
	MetricQuerySchema,
	LogQuerySchema,
	SLOSchema,
	AlertRuleSchema,
} from './types';

// ============================================================================
// Observability API
// ============================================================================

export class ObservabilityAPI {
	private tracesStore: Trace[] = [];
	private metricsStore: Metric[] = [];
	private logsStore: LogEntry[] = [];
	private sloStore: Map<string, SLO> = new Map();
	private alertRulesStore: Map<string, AlertRule> = new Map();

	/**
	 * Set traces store
	 */
	setTracesStore(traces: Trace[]): void {
		this.tracesStore = traces;
	}

	/**
	 * Set metrics store
	 */
	setMetricsStore(metrics: Metric[]): void {
		this.metricsStore = metrics;
	}

	/**
	 * Set logs store
	 */
	setLogsStore(logs: LogEntry[]): void {
		this.logsStore = logs;
	}

	/**
	 * Set SLO store
	 */
	setSLOStore(slos: Map<string, SLO>): void {
		this.sloStore = slos;
	}

	/**
	 * Set alert rules store
	 */
	setAlertRulesStore(rules: Map<string, AlertRule>): void {
		this.alertRulesStore = rules;
	}

	// ============================================================================
	// Traces API
	// ============================================================================

	/**
	 * GET /traces - List traces
	 */
	async listTraces(query: z.infer<typeof TraceQuerySchema>): Promise<Trace[]> {
		TraceQuerySchema.parse(query);

		let traces = [...this.tracesStore];

		// Filter by trace IDs
		if (query.traceIds && query.traceIds.length > 0) {
			const traceIdSet = new Set(query.traceIds);
			traces = traces.filter(t => traceIdSet.has(t.traceId));
		}

		// Filter by service name
		if (query.serviceName) {
			traces = traces.filter(t => t.serviceName === query.serviceName);
		}

		// Filter by operation name
		if (query.operationName) {
			traces = traces.filter(t =>
				t.spans.some(s => s.name === query.operationName),
			);
		}

		// Filter by tags
		if (query.tags) {
			traces = traces.filter(t =>
				t.spans.some(s =>
					Object.entries(query.tags!).every(
						([key, value]) => s.attributes[key] === value,
					),
				),
			);
		}

		// Filter by duration
		if (query.minDuration !== undefined) {
			traces = traces.filter(t => (t.duration ?? 0) >= query.minDuration!);
		}
		if (query.maxDuration !== undefined) {
			traces = traces.filter(t => (t.duration ?? 0) <= query.maxDuration!);
		}

		// Filter by time range
		traces = traces.filter(
			t => t.startTime >= query.timeRange.start && t.startTime <= query.timeRange.end,
		);

		// Limit results
		if (query.limit) {
			traces = traces.slice(0, query.limit);
		}

		return traces;
	}

	/**
	 * GET /traces/:id - Get trace details
	 */
	async getTrace(traceId: string): Promise<Trace | null> {
		return this.tracesStore.find(t => t.traceId === traceId) ?? null;
	}

	// ============================================================================
	// Metrics API
	// ============================================================================

	/**
	 * GET /metrics - Query metrics
	 */
	async queryMetrics(query: z.infer<typeof MetricQuerySchema>): Promise<Metric[]> {
		MetricQuerySchema.parse(query);

		let metrics = [...this.metricsStore];

		// Filter by name
		metrics = metrics.filter(m => m.name === query.name);

		// Filter by labels
		if (query.labels) {
			metrics = metrics.map(metric => ({
				...metric,
				dataPoints: metric.dataPoints.filter(dp =>
					Object.entries(query.labels!).every(
						([key, value]) => dp.labels[key] === value,
					),
				),
			}));
		}

		// Filter by time range
		metrics = metrics.map(metric => ({
			...metric,
			dataPoints: metric.dataPoints.filter(
				dp => dp.timestamp >= query.timeRange.start && dp.timestamp <= query.timeRange.end,
			),
		}));

		// Apply aggregation if specified
		if (query.aggregation) {
			metrics = metrics.map(metric => {
				const values = metric.dataPoints.map(dp => dp.value);
				let aggregatedValue: number;

				switch (query.aggregation) {
					case 'avg':
						aggregatedValue = values.reduce((sum, v) => sum + v, 0) / values.length;
						break;
					case 'sum':
						aggregatedValue = values.reduce((sum, v) => sum + v, 0);
						break;
					case 'min':
						aggregatedValue = Math.min(...values);
						break;
					case 'max':
						aggregatedValue = Math.max(...values);
						break;
					case 'count':
						aggregatedValue = values.length;
						break;
					case 'p50':
						aggregatedValue = this.percentile(values, 50);
						break;
					case 'p95':
						aggregatedValue = this.percentile(values, 95);
						break;
					case 'p99':
						aggregatedValue = this.percentile(values, 99);
						break;
					default:
						aggregatedValue = values[0] ?? 0;
				}

				return {
					...metric,
					dataPoints: [
						{
							value: aggregatedValue,
							timestamp: Date.now(),
							labels: {},
						},
					],
				};
			});
		}

		return metrics;
	}

	/**
	 * Calculate percentile
	 */
	private percentile(values: number[], p: number): number {
		const sorted = [...values].sort((a, b) => a - b);
		const index = Math.ceil((p / 100) * sorted.length) - 1;
		return sorted[Math.max(0, index)] ?? 0;
	}

	// ============================================================================
	// Logs API
	// ============================================================================

	/**
	 * GET /logs - Search logs
	 */
	async searchLogs(query: z.infer<typeof LogQuerySchema>): Promise<LogEntry[]> {
		LogQuerySchema.parse(query);

		let logs = [...this.logsStore];

		// Filter by level
		if (query.level) {
			logs = logs.filter(log => log.level === query.level);
		}

		// Filter by message
		if (query.message) {
			const regex = new RegExp(query.message, 'i');
			logs = logs.filter(log => regex.test(log.message));
		}

		// Filter by trace ID
		if (query.traceId) {
			logs = logs.filter(log => log.traceId === query.traceId);
		}

		// Filter by service name
		if (query.serviceName) {
			logs = logs.filter(log => log.serviceName === query.serviceName);
		}

		// Filter by context
		if (query.context) {
			logs = logs.filter(log =>
				Object.entries(query.context!).every(
					([key, value]) => log.context[key] === value,
				),
			);
		}

		// Filter by time range
		logs = logs.filter(
			log => log.timestamp >= query.timeRange.start && log.timestamp <= query.timeRange.end,
		);

		// Sort by timestamp (newest first)
		logs.sort((a, b) => b.timestamp - a.timestamp);

		// Limit results
		if (query.limit) {
			logs = logs.slice(0, query.limit);
		}

		return logs;
	}

	// ============================================================================
	// SLOs API
	// ============================================================================

	/**
	 * GET /slos - List SLOs
	 */
	async listSLOs(): Promise<SLO[]> {
		return Array.from(this.sloStore.values());
	}

	/**
	 * GET /slos/:id - Get SLO details
	 */
	async getSLO(id: string): Promise<SLO | null> {
		return this.sloStore.get(id) ?? null;
	}

	/**
	 * POST /slos - Create SLO
	 */
	async createSLO(slo: Omit<SLO, 'id' | 'createdAt' | 'updatedAt'>): Promise<SLO> {
		const fullSLO: SLO = {
			id: this.generateId(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			...slo,
		};

		SLOSchema.parse(fullSLO);
		this.sloStore.set(fullSLO.id, fullSLO);

		return fullSLO;
	}

	/**
	 * PUT /slos/:id - Update SLO
	 */
	async updateSLO(id: string, updates: Partial<SLO>): Promise<SLO | null> {
		const slo = this.sloStore.get(id);
		if (!slo) return null;

		const updated: SLO = {
			...slo,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: Date.now(),
		};

		SLOSchema.parse(updated);
		this.sloStore.set(id, updated);

		return updated;
	}

	/**
	 * DELETE /slos/:id - Delete SLO
	 */
	async deleteSLO(id: string): Promise<boolean> {
		return this.sloStore.delete(id);
	}

	// ============================================================================
	// Alert Rules API
	// ============================================================================

	/**
	 * GET /alerts - List alert rules
	 */
	async listAlertRules(): Promise<AlertRule[]> {
		return Array.from(this.alertRulesStore.values());
	}

	/**
	 * GET /alerts/:id - Get alert rule details
	 */
	async getAlertRule(id: string): Promise<AlertRule | null> {
		return this.alertRulesStore.get(id) ?? null;
	}

	/**
	 * POST /alerts - Create alert rule
	 */
	async createAlertRule(
		rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<AlertRule> {
		const fullRule: AlertRule = {
			id: this.generateId(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			...rule,
		};

		AlertRuleSchema.parse(fullRule);
		this.alertRulesStore.set(fullRule.id, fullRule);

		return fullRule;
	}

	/**
	 * PUT /alerts/:id - Update alert rule
	 */
	async updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
		const rule = this.alertRulesStore.get(id);
		if (!rule) return null;

		const updated: AlertRule = {
			...rule,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: Date.now(),
		};

		AlertRuleSchema.parse(updated);
		this.alertRulesStore.set(id, updated);

		return updated;
	}

	/**
	 * DELETE /alerts/:id - Delete alert rule
	 */
	async deleteAlertRule(id: string): Promise<boolean> {
		return this.alertRulesStore.delete(id);
	}

	// ============================================================================
	// Helpers
	// ============================================================================

	private generateId(): string {
		return Math.random().toString(36).substring(2, 15);
	}
}

// ============================================================================
// Express Router Setup
// ============================================================================

export function createObservabilityRouter(api: ObservabilityAPI) {
	return {
		// Traces
		'GET /traces': async (req: any) => {
			const query = req.query;
			return api.listTraces(query);
		},
		'GET /traces/:id': async (req: any) => {
			return api.getTrace(req.params.id);
		},

		// Metrics
		'GET /metrics': async (req: any) => {
			return api.queryMetrics(req.query);
		},

		// Logs
		'GET /logs': async (req: any) => {
			return api.searchLogs(req.query);
		},

		// SLOs
		'GET /slos': async () => {
			return api.listSLOs();
		},
		'GET /slos/:id': async (req: any) => {
			return api.getSLO(req.params.id);
		},
		'POST /slos': async (req: any) => {
			return api.createSLO(req.body);
		},
		'PUT /slos/:id': async (req: any) => {
			return api.updateSLO(req.params.id, req.body);
		},
		'DELETE /slos/:id': async (req: any) => {
			return api.deleteSLO(req.params.id);
		},

		// Alert Rules
		'GET /alerts': async () => {
			return api.listAlertRules();
		},
		'GET /alerts/:id': async (req: any) => {
			return api.getAlertRule(req.params.id);
		},
		'POST /alerts': async (req: any) => {
			return api.createAlertRule(req.body);
		},
		'PUT /alerts/:id': async (req: any) => {
			return api.updateAlertRule(req.params.id, req.body);
		},
		'DELETE /alerts/:id': async (req: any) => {
			return api.deleteAlertRule(req.params.id);
		},
	};
}
