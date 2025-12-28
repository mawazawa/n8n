import { z } from 'zod';

// ============================================================================
// Span Types
// ============================================================================

export const SpanStatusSchema = z.enum(['unset', 'ok', 'error']);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

export const SpanKindSchema = z.enum(['internal', 'server', 'client', 'producer', 'consumer']);
export type SpanKind = z.infer<typeof SpanKindSchema>;

export const SpanAttributesSchema = z.record(z.string(), z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string()),
	z.array(z.number()),
]));
export type SpanAttributes = z.infer<typeof SpanAttributesSchema>;

export const SpanEventSchema = z.object({
	name: z.string(),
	timestamp: z.number(),
	attributes: SpanAttributesSchema.optional(),
});
export type SpanEvent = z.infer<typeof SpanEventSchema>;

export const SpanLinkSchema = z.object({
	traceId: z.string(),
	spanId: z.string(),
	attributes: SpanAttributesSchema.optional(),
});
export type SpanLink = z.infer<typeof SpanLinkSchema>;

export const SpanSchema = z.object({
	spanId: z.string(),
	traceId: z.string(),
	parentId: z.string().optional(),
	name: z.string(),
	kind: SpanKindSchema,
	startTime: z.number(),
	endTime: z.number().optional(),
	duration: z.number().optional(),
	status: SpanStatusSchema,
	attributes: SpanAttributesSchema,
	events: z.array(SpanEventSchema),
	links: z.array(SpanLinkSchema),
});
export type Span = z.infer<typeof SpanSchema>;

// ============================================================================
// Trace Types
// ============================================================================

export const TraceSchema = z.object({
	traceId: z.string(),
	spans: z.array(SpanSchema),
	startTime: z.number(),
	endTime: z.number().optional(),
	duration: z.number().optional(),
	rootSpanId: z.string().optional(),
	serviceName: z.string(),
});
export type Trace = z.infer<typeof TraceSchema>;

export const TraceContextSchema = z.object({
	traceId: z.string(),
	spanId: z.string(),
	traceFlags: z.number(),
	traceState: z.string().optional(),
});
export type TraceContext = z.infer<typeof TraceContextSchema>;

// ============================================================================
// Metric Types
// ============================================================================

export const MetricTypeSchema = z.enum(['counter', 'gauge', 'histogram', 'summary']);
export type MetricType = z.infer<typeof MetricTypeSchema>;

export const MetricLabelsSchema = z.record(z.string(), z.string());
export type MetricLabels = z.infer<typeof MetricLabelsSchema>;

export const MetricDataPointSchema = z.object({
	value: z.number(),
	timestamp: z.number(),
	labels: MetricLabelsSchema,
});
export type MetricDataPoint = z.infer<typeof MetricDataPointSchema>;

export const HistogramBucketSchema = z.object({
	upperBound: z.number(),
	count: z.number(),
});
export type HistogramBucket = z.infer<typeof HistogramBucketSchema>;

export const HistogramDataSchema = z.object({
	count: z.number(),
	sum: z.number(),
	buckets: z.array(HistogramBucketSchema),
});
export type HistogramData = z.infer<typeof HistogramDataSchema>;

export const MetricSchema = z.object({
	name: z.string(),
	type: MetricTypeSchema,
	description: z.string().optional(),
	unit: z.string().optional(),
	dataPoints: z.array(MetricDataPointSchema),
});
export type Metric = z.infer<typeof MetricSchema>;

// ============================================================================
// Log Types
// ============================================================================

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogContextSchema = z.record(z.string(), z.unknown());
export type LogContext = z.infer<typeof LogContextSchema>;

export const LogEntrySchema = z.object({
	id: z.string(),
	timestamp: z.number(),
	level: LogLevelSchema,
	message: z.string(),
	context: LogContextSchema,
	traceId: z.string().optional(),
	spanId: z.string().optional(),
	serviceName: z.string(),
	error: z.object({
		name: z.string(),
		message: z.string(),
		stack: z.string().optional(),
	}).optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

// ============================================================================
// SLI/SLO Types
// ============================================================================

export const SLITypeSchema = z.enum(['availability', 'latency', 'error_rate', 'throughput']);
export type SLIType = z.infer<typeof SLITypeSchema>;

export const SLIWindowSchema = z.enum(['1h', '6h', '24h', '7d', '30d']);
export type SLIWindow = z.infer<typeof SLIWindowSchema>;

export const SLIConfigSchema = z.object({
	type: SLITypeSchema,
	query: z.string(),
	threshold: z.number().optional(),
	aggregation: z.enum(['avg', 'p50', 'p95', 'p99']).optional(),
});
export type SLIConfig = z.infer<typeof SLIConfigSchema>;

export const SLOSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	sli: SLIConfigSchema,
	target: z.number().min(0).max(100), // percentage
	window: SLIWindowSchema,
	createdAt: z.number(),
	updatedAt: z.number(),
});
export type SLO = z.infer<typeof SLOSchema>;

export const ErrorBudgetSchema = z.object({
	sloId: z.string(),
	total: z.number(),
	consumed: z.number(),
	remaining: z.number(),
	remainingPercentage: z.number(),
	burnRate: z.number(),
	status: z.enum(['healthy', 'warning', 'critical']),
});
export type ErrorBudget = z.infer<typeof ErrorBudgetSchema>;

// ============================================================================
// Dashboard Types
// ============================================================================

export const WidgetTypeSchema = z.enum([
	'timeseries',
	'gauge',
	'counter',
	'heatmap',
	'table',
	'pie',
	'bar',
	'stat',
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

export const WidgetSchema = z.object({
	id: z.string(),
	type: WidgetTypeSchema,
	title: z.string(),
	query: z.string(),
	position: z.object({
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	}),
	options: z.record(z.string(), z.unknown()),
});
export type Widget = z.infer<typeof WidgetSchema>;

export const DashboardSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	tags: z.array(z.string()),
	widgets: z.array(WidgetSchema),
	refresh: z.string().optional(), // e.g., '5s', '1m'
	timeRange: z.object({
		from: z.string(),
		to: z.string(),
	}).optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

// ============================================================================
// Alert Types
// ============================================================================

export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertConditionSchema = z.object({
	metric: z.string(),
	operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne']),
	threshold: z.number(),
	duration: z.string(), // e.g., '5m'
});
export type AlertCondition = z.infer<typeof AlertConditionSchema>;

export const AlertRuleSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	severity: AlertSeveritySchema,
	conditions: z.array(AlertConditionSchema),
	combinator: z.enum(['and', 'or']),
	enabled: z.boolean(),
	notifications: z.array(z.object({
		type: z.enum(['email', 'slack', 'webhook', 'pagerduty']),
		config: z.record(z.string(), z.unknown()),
	})),
	createdAt: z.number(),
	updatedAt: z.number(),
});
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertSchema = z.object({
	id: z.string(),
	ruleId: z.string(),
	ruleName: z.string(),
	severity: AlertSeveritySchema,
	message: z.string(),
	state: z.enum(['firing', 'resolved']),
	firedAt: z.number(),
	resolvedAt: z.number().optional(),
	labels: z.record(z.string(), z.string()),
	annotations: z.record(z.string(), z.string()),
});
export type Alert = z.infer<typeof AlertSchema>;

// ============================================================================
// Anomaly Types
// ============================================================================

export const AnomalyTypeSchema = z.enum(['spike', 'drop', 'trend', 'seasonal']);
export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;

export const AnomalySchema = z.object({
	id: z.string(),
	type: AnomalyTypeSchema,
	metric: z.string(),
	timestamp: z.number(),
	actualValue: z.number(),
	expectedValue: z.number(),
	deviation: z.number(),
	severity: z.number(), // 0-1
	confidence: z.number(), // 0-1
	context: z.record(z.string(), z.unknown()),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

// ============================================================================
// Sampling Types
// ============================================================================

export const SamplingStrategySchema = z.enum([
	'always',
	'never',
	'probabilistic',
	'rate_limiting',
	'tail_based',
]);
export type SamplingStrategy = z.infer<typeof SamplingStrategySchema>;

export const SamplingConfigSchema = z.object({
	strategy: SamplingStrategySchema,
	rate: z.number().min(0).max(1).optional(), // for probabilistic
	maxTracesPerSecond: z.number().optional(), // for rate_limiting
	rules: z.array(z.object({
		condition: z.string(),
		sample: z.boolean(),
	})).optional(),
});
export type SamplingConfig = z.infer<typeof SamplingConfigSchema>;

// ============================================================================
// Retention Types
// ============================================================================

export const DataTypeSchema = z.enum(['traces', 'metrics', 'logs']);
export type DataType = z.infer<typeof DataTypeSchema>;

export const RetentionPolicySchema = z.object({
	dataType: DataTypeSchema,
	hotStorageDuration: z.string(), // e.g., '7d'
	coldStorageDuration: z.string().optional(), // e.g., '30d'
	deletionDuration: z.string(), // e.g., '90d'
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

// ============================================================================
// Exporter Types
// ============================================================================

export const ExporterTypeSchema = z.enum(['jaeger', 'zipkin', 'otlp', 'console']);
export type ExporterType = z.infer<typeof ExporterTypeSchema>;

export const ExporterConfigSchema = z.object({
	type: ExporterTypeSchema,
	endpoint: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	batchSize: z.number().optional(),
	batchTimeout: z.number().optional(),
	compression: z.boolean().optional(),
});
export type ExporterConfig = z.infer<typeof ExporterConfigSchema>;

// ============================================================================
// Query Types
// ============================================================================

export const TimeRangeSchema = z.object({
	start: z.number(),
	end: z.number(),
});
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const TraceQuerySchema = z.object({
	traceIds: z.array(z.string()).optional(),
	serviceName: z.string().optional(),
	operationName: z.string().optional(),
	tags: z.record(z.string(), z.string()).optional(),
	minDuration: z.number().optional(),
	maxDuration: z.number().optional(),
	timeRange: TimeRangeSchema,
	limit: z.number().optional(),
});
export type TraceQuery = z.infer<typeof TraceQuerySchema>;

export const MetricQuerySchema = z.object({
	name: z.string(),
	labels: MetricLabelsSchema.optional(),
	aggregation: z.enum(['avg', 'sum', 'min', 'max', 'count', 'p50', 'p95', 'p99']).optional(),
	timeRange: TimeRangeSchema,
	step: z.string().optional(), // e.g., '1m'
});
export type MetricQuery = z.infer<typeof MetricQuerySchema>;

export const LogQuerySchema = z.object({
	level: LogLevelSchema.optional(),
	message: z.string().optional(),
	traceId: z.string().optional(),
	serviceName: z.string().optional(),
	context: z.record(z.string(), z.unknown()).optional(),
	timeRange: TimeRangeSchema,
	limit: z.number().optional(),
});
export type LogQuery = z.infer<typeof LogQuerySchema>;
