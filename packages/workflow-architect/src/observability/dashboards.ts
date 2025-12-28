import { randomBytes } from 'node:crypto';
import type { Dashboard, Widget, WidgetType } from './types';
import { DashboardSchema, WidgetSchema } from './types';

// ============================================================================
// Dashboard Builder
// ============================================================================

export class DashboardBuilder {
	private id: string;
	private name: string;
	private description?: string;
	private tags: string[] = [];
	private widgets: Widget[] = [];
	private refresh?: string;
	private timeRange?: { from: string; to: string };

	constructor(name: string) {
		this.id = randomBytes(8).toString('hex');
		this.name = name;
	}

	/**
	 * Set dashboard description
	 */
	setDescription(description: string): this {
		this.description = description;
		return this;
	}

	/**
	 * Add tags
	 */
	addTags(...tags: string[]): this {
		this.tags.push(...tags);
		return this;
	}

	/**
	 * Set auto-refresh interval
	 */
	setRefresh(interval: string): this {
		this.refresh = interval;
		return this;
	}

	/**
	 * Set time range
	 */
	setTimeRange(from: string, to: string): this {
		this.timeRange = { from, to };
		return this;
	}

	/**
	 * Add a widget
	 */
	addWidget(
		type: WidgetType,
		title: string,
		query: string,
		position: { x: number; y: number; w: number; h: number },
		options: Record<string, unknown> = {},
	): this {
		const widget: Widget = {
			id: randomBytes(8).toString('hex'),
			type,
			title,
			query,
			position,
			options,
		};

		WidgetSchema.parse(widget);
		this.widgets.push(widget);
		return this;
	}

	/**
	 * Build dashboard
	 */
	build(): Dashboard {
		const dashboard: Dashboard = {
			id: this.id,
			name: this.name,
			description: this.description,
			tags: this.tags,
			widgets: this.widgets,
			refresh: this.refresh,
			timeRange: this.timeRange,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		DashboardSchema.parse(dashboard);
		return dashboard;
	}

	/**
	 * Export to Grafana JSON
	 */
	toGrafana(): GrafanaDashboard {
		return {
			dashboard: {
				id: null,
				uid: this.id,
				title: this.name,
				tags: this.tags,
				timezone: 'browser',
				schemaVersion: 36,
				version: 0,
				refresh: this.refresh,
				time: this.timeRange ? {
					from: this.timeRange.from,
					to: this.timeRange.to,
				} : {
					from: 'now-6h',
					to: 'now',
				},
				panels: this.widgets.map((widget, index) => ({
					id: index + 1,
					gridPos: {
						x: widget.position.x,
						y: widget.position.y,
						w: widget.position.w,
						h: widget.position.h,
					},
					type: this.convertWidgetType(widget.type),
					title: widget.title,
					targets: [
						{
							expr: widget.query,
							refId: 'A',
						},
					],
					options: widget.options,
				})),
			},
			overwrite: true,
		};
	}

	/**
	 * Convert widget type to Grafana panel type
	 */
	private convertWidgetType(type: WidgetType): string {
		const typeMap: Record<WidgetType, string> = {
			timeseries: 'timeseries',
			gauge: 'gauge',
			counter: 'stat',
			heatmap: 'heatmap',
			table: 'table',
			pie: 'piechart',
			bar: 'barchart',
			stat: 'stat',
		};
		return typeMap[type] ?? 'timeseries';
	}
}

// ============================================================================
// Pre-built Dashboards
// ============================================================================

export class PrebuiltDashboards {
	/**
	 * Create overview dashboard
	 */
	static createOverviewDashboard(): Dashboard {
		return new DashboardBuilder('System Overview')
			.setDescription('High-level system metrics and health')
			.addTags('system', 'overview')
			.setRefresh('5s')
			.setTimeRange('now-1h', 'now')
			// Request rate
			.addWidget(
				'timeseries',
				'Request Rate',
				'rate(http_requests_total[5m])',
				{ x: 0, y: 0, w: 12, h: 8 },
				{ legend: { show: true } },
			)
			// Error rate
			.addWidget(
				'timeseries',
				'Error Rate',
				'rate(http_requests_total{status=~"5.."}[5m])',
				{ x: 12, y: 0, w: 12, h: 8 },
				{ legend: { show: true } },
			)
			// Latency
			.addWidget(
				'timeseries',
				'Request Latency (p95)',
				'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
				{ x: 0, y: 8, w: 12, h: 8 },
				{ unit: 'seconds' },
			)
			// Active connections
			.addWidget(
				'gauge',
				'Active Connections',
				'active_connections',
				{ x: 12, y: 8, w: 12, h: 8 },
				{ max: 1000, thresholds: { warn: 800, critical: 900 } },
			)
			.build();
	}

	/**
	 * Create performance dashboard
	 */
	static createPerformanceDashboard(): Dashboard {
		return new DashboardBuilder('Performance Metrics')
			.setDescription('Detailed performance analysis')
			.addTags('performance', 'metrics')
			.setRefresh('10s')
			.setTimeRange('now-6h', 'now')
			// CPU usage
			.addWidget(
				'timeseries',
				'CPU Usage',
				'process_cpu_seconds_total',
				{ x: 0, y: 0, w: 8, h: 8 },
				{ unit: 'percent' },
			)
			// Memory usage
			.addWidget(
				'timeseries',
				'Memory Usage',
				'process_memory_bytes',
				{ x: 8, y: 0, w: 8, h: 8 },
				{ unit: 'bytes' },
			)
			// Disk I/O
			.addWidget(
				'timeseries',
				'Disk I/O',
				'rate(disk_io_bytes_total[5m])',
				{ x: 16, y: 0, w: 8, h: 8 },
				{ unit: 'bytes/s' },
			)
			// Latency distribution
			.addWidget(
				'heatmap',
				'Latency Distribution',
				'http_request_duration_seconds_bucket',
				{ x: 0, y: 8, w: 24, h: 8 },
			)
			// Throughput
			.addWidget(
				'timeseries',
				'Throughput',
				'rate(processed_items_total[5m])',
				{ x: 0, y: 16, w: 12, h: 8 },
			)
			// Queue depth
			.addWidget(
				'timeseries',
				'Queue Depth',
				'queue_depth',
				{ x: 12, y: 16, w: 12, h: 8 },
			)
			.build();
	}

	/**
	 * Create errors dashboard
	 */
	static createErrorsDashboard(): Dashboard {
		return new DashboardBuilder('Error Analysis')
			.setDescription('Error rates and types')
			.addTags('errors', 'monitoring')
			.setRefresh('30s')
			.setTimeRange('now-24h', 'now')
			// Error rate
			.addWidget(
				'timeseries',
				'Total Error Rate',
				'rate(errors_total[5m])',
				{ x: 0, y: 0, w: 12, h: 8 },
			)
			// Errors by type
			.addWidget(
				'pie',
				'Errors by Type',
				'sum by(type) (errors_total)',
				{ x: 12, y: 0, w: 12, h: 8 },
			)
			// Error status codes
			.addWidget(
				'bar',
				'HTTP Status Codes',
				'sum by(status) (http_requests_total{status=~"[45].."})',
				{ x: 0, y: 8, w: 12, h: 8 },
			)
			// Recent errors
			.addWidget(
				'table',
				'Recent Errors',
				'topk(10, errors_total)',
				{ x: 12, y: 8, w: 12, h: 8 },
			)
			// Error trends
			.addWidget(
				'timeseries',
				'Error Trends (24h)',
				'rate(errors_total[1h])',
				{ x: 0, y: 16, w: 24, h: 8 },
			)
			.build();
	}

	/**
	 * Create SLO dashboard
	 */
	static createSLODashboard(): Dashboard {
		return new DashboardBuilder('SLO Tracking')
			.setDescription('Service Level Objectives and error budgets')
			.addTags('slo', 'reliability')
			.setRefresh('1m')
			.setTimeRange('now-30d', 'now')
			// Availability SLO
			.addWidget(
				'gauge',
				'Availability SLO',
				'(1 - (rate(http_requests_total{status=~"5.."}[30d]) / rate(http_requests_total[30d]))) * 100',
				{ x: 0, y: 0, w: 8, h: 8 },
				{ max: 100, thresholds: { warn: 99.5, critical: 99.0 } },
			)
			// Latency SLO
			.addWidget(
				'gauge',
				'Latency SLO (p95 < 100ms)',
				'(1 - (count(http_request_duration_seconds_bucket{le="0.1"}) / count(http_request_duration_seconds_bucket))) * 100',
				{ x: 8, y: 0, w: 8, h: 8 },
				{ max: 100, thresholds: { warn: 95, critical: 90 } },
			)
			// Error budget
			.addWidget(
				'stat',
				'Error Budget Remaining',
				'error_budget_remaining',
				{ x: 16, y: 0, w: 8, h: 8 },
				{ unit: 'percent' },
			)
			// Burn rate
			.addWidget(
				'timeseries',
				'Error Budget Burn Rate',
				'error_budget_burn_rate',
				{ x: 0, y: 8, w: 24, h: 8 },
			)
			.build();
	}

	/**
	 * Create trace analysis dashboard
	 */
	static createTracesDashboard(): Dashboard {
		return new DashboardBuilder('Trace Analysis')
			.setDescription('Distributed tracing insights')
			.addTags('traces', 'distributed')
			.setRefresh('10s')
			.setTimeRange('now-1h', 'now')
			// Trace duration
			.addWidget(
				'timeseries',
				'Trace Duration (p95)',
				'histogram_quantile(0.95, rate(trace_duration_seconds_bucket[5m]))',
				{ x: 0, y: 0, w: 12, h: 8 },
			)
			// Span count
			.addWidget(
				'timeseries',
				'Spans per Trace',
				'avg(spans_per_trace)',
				{ x: 12, y: 0, w: 12, h: 8 },
			)
			// Service calls
			.addWidget(
				'heatmap',
				'Service Call Latency',
				'span_duration_seconds_bucket',
				{ x: 0, y: 8, w: 24, h: 8 },
			)
			// Top operations
			.addWidget(
				'table',
				'Top Operations by Duration',
				'topk(10, avg by(operation) (span_duration_seconds))',
				{ x: 0, y: 16, w: 12, h: 8 },
			)
			// Error spans
			.addWidget(
				'timeseries',
				'Error Spans',
				'rate(spans_total{status="error"}[5m])',
				{ x: 12, y: 16, w: 12, h: 8 },
			)
			.build();
	}
}

// ============================================================================
// Dashboard Manager
// ============================================================================

export class DashboardManager {
	private dashboards = new Map<string, Dashboard>();

	/**
	 * Register a dashboard
	 */
	register(dashboard: Dashboard): void {
		DashboardSchema.parse(dashboard);
		this.dashboards.set(dashboard.id, dashboard);
	}

	/**
	 * Get a dashboard by ID
	 */
	get(id: string): Dashboard | undefined {
		return this.dashboards.get(id);
	}

	/**
	 * List all dashboards
	 */
	list(): Dashboard[] {
		return Array.from(this.dashboards.values());
	}

	/**
	 * Find dashboards by tag
	 */
	findByTag(tag: string): Dashboard[] {
		return Array.from(this.dashboards.values()).filter(d => d.tags.includes(tag));
	}

	/**
	 * Update a dashboard
	 */
	update(id: string, updates: Partial<Dashboard>): Dashboard | null {
		const dashboard = this.dashboards.get(id);
		if (!dashboard) return null;

		const updated = {
			...dashboard,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: Date.now(),
		};

		DashboardSchema.parse(updated);
		this.dashboards.set(id, updated);
		return updated;
	}

	/**
	 * Delete a dashboard
	 */
	delete(id: string): boolean {
		return this.dashboards.delete(id);
	}

	/**
	 * Load prebuilt dashboards
	 */
	loadPrebuilt(): void {
		this.register(PrebuiltDashboards.createOverviewDashboard());
		this.register(PrebuiltDashboards.createPerformanceDashboard());
		this.register(PrebuiltDashboards.createErrorsDashboard());
		this.register(PrebuiltDashboards.createSLODashboard());
		this.register(PrebuiltDashboards.createTracesDashboard());
	}
}

// ============================================================================
// Grafana Types
// ============================================================================

interface GrafanaDashboard {
	dashboard: {
		id: null;
		uid: string;
		title: string;
		tags: string[];
		timezone: string;
		schemaVersion: number;
		version: number;
		refresh?: string;
		time: {
			from: string;
			to: string;
		};
		panels: GrafanaPanel[];
	};
	overwrite: boolean;
}

interface GrafanaPanel {
	id: number;
	gridPos: {
		x: number;
		y: number;
		w: number;
		h: number;
	};
	type: string;
	title: string;
	targets: Array<{
		expr: string;
		refId: string;
	}>;
	options: Record<string, unknown>;
}
