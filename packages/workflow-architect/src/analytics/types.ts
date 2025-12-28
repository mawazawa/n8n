/**
 * Analytics Type Definitions
 * Production-ready analytics types for the Workflow Architect
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timing';
export type TimePeriod = 'hour' | 'day' | 'week' | 'month';

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface AnalyticsEvent {
  id: string;
  type: string;
  workflowId?: string;
  userId?: string;
  timestamp: number;
  properties: Record<string, unknown>;
}

export interface TimeSeriesData {
  metric: string;
  period: TimePeriod;
  dataPoints: Array<{ timestamp: number; value: number }>;
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface Report {
  id: string;
  name: string;
  description: string;
  metrics: string[];
  filters: Record<string, unknown>;
  generatedAt: string;
  data: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'stat_card' | 'table';
  title: string;
  metric: string;
  period: TimePeriod;
  config: Record<string, unknown>;
}

export interface AggregationConfig {
  type: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99';
  period: TimePeriod;
  buckets?: number;
}

export interface ReportConfig {
  name: string;
  description: string;
  metrics: string[];
  filters?: Record<string, unknown>;
  startDate?: Date;
  endDate?: Date;
  aggregation?: AggregationConfig;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  filename: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  fields?: string[];
  streaming?: boolean;
}

export interface MetricBucket {
  start: number;
  end: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
}

export interface TrendData {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AnomalyDetectionResult {
  metric: string;
  timestamp: number;
  value: number;
  expected: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  isAnomaly: boolean;
}
