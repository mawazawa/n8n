// ============================================================================
// Type Exports
// ============================================================================

export type {
	// Span types
	Span,
	SpanStatus,
	SpanKind,
	SpanAttributes,
	SpanEvent,
	SpanLink,
	// Trace types
	Trace,
	TraceContext,
	// Metric types
	Metric,
	MetricType,
	MetricLabels,
	MetricDataPoint,
	HistogramData,
	HistogramBucket,
	// Log types
	LogEntry,
	LogLevel,
	LogContext,
	// SLI/SLO types
	SLO,
	SLIType,
	SLIWindow,
	SLIConfig,
	ErrorBudget,
	// Dashboard types
	Dashboard,
	Widget,
	WidgetType,
	// Alert types
	Alert,
	AlertRule,
	AlertCondition,
	AlertSeverity,
	// Anomaly types
	Anomaly,
	AnomalyType,
	// Sampling types
	SamplingStrategy,
	SamplingConfig,
	// Retention types
	RetentionPolicy,
	DataType,
	// Exporter types
	ExporterType,
	ExporterConfig,
	// Query types
	TimeRange,
	TraceQuery,
	MetricQuery,
	LogQuery,
} from './types';

export {
	// Schema validators
	SpanSchema,
	TraceSchema,
	MetricSchema,
	LogEntrySchema,
	SLOSchema,
	ErrorBudgetSchema,
	DashboardSchema,
	WidgetSchema,
	AlertRuleSchema,
	AlertSchema,
	AnomalySchema,
	SamplingConfigSchema,
	RetentionPolicySchema,
} from './types';

// ============================================================================
// Tracer Exports
// ============================================================================

export {
	Tracer,
	initTracer,
	getTracer,
	tracingMiddleware,
	W3CTraceContext,
	ContextManager,
} from './tracer';

export type { SpanOptions, TracingMiddlewareOptions } from './tracer';

// ============================================================================
// Span Exports
// ============================================================================

export { SpanManager, SpanUtils } from './spans';
export type { SpanTree, SpanStats } from './spans';

// ============================================================================
// Metrics Exports
// ============================================================================

export {
	Counter,
	Gauge,
	Histogram,
	Summary,
	MetricsRegistry,
	getMetricsRegistry,
	setMetricsRegistry,
	initDefaultMetrics,
} from './metrics';

// ============================================================================
// Logs Exports
// ============================================================================

export {
	Logger,
	initLogger,
	getLogger,
	ConsoleHandler,
	JSONHandler,
	BufferHandler,
	BatchHandler,
	debug,
	info,
	warn,
	error,
	fatal,
} from './logs';

export type { LoggerOptions } from './logs';

// ============================================================================
// Exporter Exports
// ============================================================================

export { JaegerExporter } from './exporters/jaeger';
export type { JaegerExporterConfig } from './exporters/jaeger';

export { ZipkinExporter } from './exporters/zipkin';
export type { ZipkinExporterConfig } from './exporters/zipkin';

export { OTLPExporter } from './exporters/otlp';
export type { OTLPExporterConfig } from './exporters/otlp';

export { ConsoleExporter } from './exporters/console';
export type { ConsoleExporterConfig } from './exporters/console';

// ============================================================================
// Dashboard Exports
// ============================================================================

export { DashboardBuilder, PrebuiltDashboards, DashboardManager } from './dashboards';

// ============================================================================
// Alert Exports
// ============================================================================

export { AlertRuleEngine, AlertRuleBuilder } from './alerts';

// ============================================================================
// SLI/SLO Exports
// ============================================================================

export { SLITracker, SLOBuilder } from './sli';
export type { SLOComplianceStatus } from './sli';

// ============================================================================
// Anomaly Detection Exports
// ============================================================================

export { AnomalyDetector } from './anomaly';

// ============================================================================
// Correlation Exports
// ============================================================================

export { CorrelationEngine } from './correlation';
export type { UnifiedTraceView, TimelineEvent, ErrorPropagationAnalysis } from './correlation';

// ============================================================================
// Sampling Exports
// ============================================================================

export { AdaptiveSampler, SamplingDecision, SamplingStrategies } from './sampling';

// ============================================================================
// Retention Exports
// ============================================================================

export { RetentionManager, DefaultRetentionPolicies } from './retention';
export type { CleanupResult, RetentionStatistics } from './retention';

// ============================================================================
// API Exports
// ============================================================================

export { ObservabilityAPI, createObservabilityRouter } from './api';

// ============================================================================
// Main Observability Class
// ============================================================================

export class Observability {
	public tracer: Tracer;
	public metrics: MetricsRegistry;
	public logger: Logger;
	public alerts: AlertRuleEngine;
	public sli: SLITracker;
	public anomaly: AnomalyDetector;
	public correlation: CorrelationEngine;
	public sampling: AdaptiveSampler;
	public retention: RetentionManager;
	public dashboards: DashboardManager;
	public api: ObservabilityAPI;

	constructor(config: ObservabilityConfig) {
		// Initialize tracer
		this.tracer = new Tracer(config.serviceName);

		// Initialize metrics
		this.metrics = new MetricsRegistry();
		if (config.enableDefaultMetrics !== false) {
			initDefaultMetrics(this.metrics);
		}

		// Initialize logger
		this.logger = new Logger({
			serviceName: config.serviceName,
			minLevel: config.logLevel ?? 'info',
			enableTraceCorrelation: config.enableTraceCorrelation !== false,
		});

		// Add default console handler
		if (config.logToConsole !== false) {
			this.logger.addHandler(new ConsoleHandler().handle.bind(new ConsoleHandler()));
		}

		// Initialize alert engine
		this.alerts = new AlertRuleEngine();
		this.alerts.setMetricsProvider(() => this.metrics.collect());

		// Initialize SLI tracker
		this.sli = new SLITracker();
		this.sli.setMetricsProvider(() => this.metrics.collect());

		// Initialize anomaly detector
		this.anomaly = new AnomalyDetector();
		this.anomaly.setMetricsProvider(() => this.metrics.collect());

		// Initialize correlation engine
		this.correlation = new CorrelationEngine();

		// Initialize sampling
		this.sampling = new AdaptiveSampler(config.samplingConfig);

		// Initialize retention manager
		this.retention = new RetentionManager();

		// Initialize dashboard manager
		this.dashboards = new DashboardManager();
		if (config.loadPrebuiltDashboards !== false) {
			this.dashboards.loadPrebuilt();
		}

		// Initialize API
		this.api = new ObservabilityAPI();

		// Configure exporters
		if (config.exporters) {
			for (const exporterConfig of config.exporters) {
				this.addExporter(exporterConfig);
			}
		}
	}

	/**
	 * Add an exporter
	 */
	addExporter(config: ExporterConfig): void {
		switch (config.type) {
			case 'jaeger':
				if (config.endpoint) {
					const exporter = new JaegerExporter({
						endpoint: config.endpoint,
						serviceName: this.tracer.getServiceName(),
						headers: config.headers,
						batchSize: config.batchSize,
						batchTimeout: config.batchTimeout,
					});
					this.tracer.addExporter(spans => exporter.export(spans));
				}
				break;

			case 'zipkin':
				if (config.endpoint) {
					const exporter = new ZipkinExporter({
						endpoint: config.endpoint,
						serviceName: this.tracer.getServiceName(),
						headers: config.headers,
						batchSize: config.batchSize,
						batchTimeout: config.batchTimeout,
					});
					this.tracer.addExporter(spans => exporter.export(spans));
				}
				break;

			case 'otlp':
				if (config.endpoint) {
					const exporter = new OTLPExporter({
						endpoint: config.endpoint,
						serviceName: this.tracer.getServiceName(),
						headers: config.headers,
						batchSize: config.batchSize,
						batchTimeout: config.batchTimeout,
						compression: config.compression,
					});
					this.tracer.addExporter(spans => exporter.export(spans));
				}
				break;

			case 'console':
				const exporter = new ConsoleExporter({
					serviceName: this.tracer.getServiceName(),
					pretty: true,
					verbose: false,
				});
				this.tracer.addExporter(spans => exporter.export(spans));
				break;
		}
	}

	/**
	 * Start all continuous processes
	 */
	start(): void {
		// Start alert evaluation
		this.alerts.start();

		// Start retention cleanup
		this.retention.start();
	}

	/**
	 * Stop all continuous processes
	 */
	stop(): void {
		// Stop alert evaluation
		this.alerts.stop();

		// Stop retention cleanup
		this.retention.stop();
	}

	/**
	 * Shutdown observability system
	 */
	async shutdown(): Promise<void> {
		this.stop();
		await this.tracer.shutdown();
	}

	/**
	 * Create middleware for auto-instrumentation
	 */
	middleware(options?: TracingMiddlewareOptions) {
		return tracingMiddleware({
			...options,
			serviceName: this.tracer.getServiceName(),
		});
	}
}

// ============================================================================
// Configuration
// ============================================================================

export interface ObservabilityConfig {
	serviceName: string;
	logLevel?: LogLevel;
	logToConsole?: boolean;
	enableDefaultMetrics?: boolean;
	enableTraceCorrelation?: boolean;
	loadPrebuiltDashboards?: boolean;
	samplingConfig?: SamplingConfig;
	exporters?: ExporterConfig[];
}

// ============================================================================
// Default Export
// ============================================================================

export default Observability;
