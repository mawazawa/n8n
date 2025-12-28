/**
 * Analytics Module
 * Production-ready analytics dashboard backend for Workflow Architect
 */

// Types
export type {
  MetricType,
  TimePeriod,
  Metric,
  AnalyticsEvent,
  TimeSeriesData,
  Report,
  Dashboard,
  DashboardWidget,
  AggregationConfig,
  ReportConfig,
  ExportOptions,
  MetricBucket,
  TrendData,
  AnomalyDetectionResult,
} from './types.js';

// Event Collector
export {
  EventCollector,
  getGlobalCollector,
  setGlobalCollector,
  track,
} from './collector.js';
export type { CollectorConfig } from './collector.js';

// Metric Aggregator
export { MetricAggregator } from './aggregator.js';

// Built-in Metrics
export {
  METRICS,
  initializeMetrics,
  recordMetric,
  incrementCounter,
  setGauge,
  recordHistogram,
  recordTiming,
  workflowCreated,
  workflowExecuted,
  activeUser,
  apiCall,
  recordError,
  getMetrics,
  getMetricsByName,
  getMetricsInRange,
  clearMetrics,
  getAggregator,
  getPercentile,
  getHistogram,
  getMetricStats,
  measureExecution,
  startTimer,
} from './metrics.js';

// Report Generator
export { ReportGenerator } from './reports.js';

// Data Exporter
export {
  DataExporter,
  getGlobalExporter,
  setGlobalExporter,
} from './export.js';
