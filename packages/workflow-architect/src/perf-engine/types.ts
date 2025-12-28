/**
 * Performance Optimization Engine Type Definitions
 * Comprehensive types for profiling, analyzing, and optimizing workflow performance
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum BottleneckType {
  CPU = 'cpu',
  MEMORY = 'memory',
  IO = 'io',
  NETWORK = 'network',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
}

export enum BottleneckSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum OptimizationType {
  CACHING = 'caching',
  PARALLELIZATION = 'parallelization',
  BATCHING = 'batching',
  RESOURCE_ALLOCATION = 'resource_allocation',
  QUERY_OPTIMIZATION = 'query_optimization',
  CODE_OPTIMIZATION = 'code_optimization',
}

export enum ResourceType {
  CPU = 'cpu',
  MEMORY = 'memory',
  NETWORK = 'network',
  DISK = 'disk',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// ============================================================================
// METRIC TYPES
// ============================================================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  nodeId?: string;
  executionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceUsage {
  cpu: {
    usage: number; // percentage
    cores: number;
    timeMs: number;
  };
  memory: {
    used: number; // bytes
    peak: number; // bytes
    allocated: number; // bytes
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    requests: number;
    latencyMs: number;
  };
  disk: {
    reads: number;
    writes: number;
    bytesRead: number;
    bytesWritten: number;
  };
}

export interface NodeMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executionTime: number;
  resourceUsage: ResourceUsage;
  inputItems: number;
  outputItems: number;
  errorCount: number;
  retries: number;
  cacheHit?: boolean;
}

// ============================================================================
// PROFILING TYPES
// ============================================================================

export interface ProfileResult {
  id: string;
  workflowId: string;
  executionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  nodeMetrics: NodeMetrics[];
  totalResourceUsage: ResourceUsage;
  flameGraph?: FlameGraphNode;
  metadata?: Record<string, unknown>;
}

export interface FlameGraphNode {
  name: string;
  value: number;
  children?: FlameGraphNode[];
  metadata?: Record<string, unknown>;
}

export interface ProfilingOptions {
  includeFlameGraph?: boolean;
  sampleRate?: number;
  captureMemory?: boolean;
  captureNetwork?: boolean;
  captureDisk?: boolean;
}

// ============================================================================
// BOTTLENECK TYPES
// ============================================================================

export interface Bottleneck {
  id: string;
  nodeId: string;
  nodeName: string;
  type: BottleneckType;
  severity: BottleneckSeverity;
  impact: number; // 0-100 percentage
  description: string;
  rootCause?: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
  metadata?: Record<string, unknown>;
}

export interface BottleneckAnalysis {
  workflowId: string;
  executionId: string;
  bottlenecks: Bottleneck[];
  totalImpact: number;
  criticalPath: string[];
  analysisTimestamp: string;
}

// ============================================================================
// OPTIMIZATION TYPES
// ============================================================================

export interface OptimizationSuggestion {
  id: string;
  type: OptimizationType;
  title: string;
  description: string;
  expectedGain: {
    metric: string;
    currentValue: number;
    expectedValue: number;
    unit: string;
    confidence: number; // 0-1
  };
  affectedNodes: string[];
  safeToAutoApply: boolean;
  complexity: 'low' | 'medium' | 'high';
  implementation?: OptimizationImplementation;
  metadata?: Record<string, unknown>;
}

export interface OptimizationImplementation {
  type: 'config_change' | 'node_addition' | 'node_modification' | 'workflow_restructure';
  changes: OptimizationChange[];
  rollbackPlan?: OptimizationChange[];
}

export interface OptimizationChange {
  target: string;
  action: 'add' | 'modify' | 'remove';
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface OptimizedWorkflow {
  workflowId: string;
  originalWorkflow: unknown;
  optimizedWorkflow: unknown;
  appliedOptimizations: OptimizationSuggestion[];
  expectedImprovement: {
    executionTime: number; // percentage
    resourceUsage: number; // percentage
    cost: number; // percentage
  };
  dryRun: boolean;
  timestamp: string;
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export interface AnalysisResult {
  workflowId: string;
  analysisTimestamp: string;
  performanceScore: number; // 0-100
  trends: PerformanceTrend[];
  bottlenecks: Bottleneck[];
  optimizations: OptimizationSuggestion[];
  historicalComparison?: HistoricalComparison;
  metadata?: Record<string, unknown>;
}

export interface PerformanceTrend {
  metric: string;
  direction: 'improving' | 'degrading' | 'stable';
  changePercent: number;
  dataPoints: Array<{ timestamp: number; value: number }>;
  period: 'hour' | 'day' | 'week' | 'month';
}

export interface HistoricalComparison {
  baseline: {
    executionId: string;
    timestamp: string;
    metrics: PerformanceMetric[];
  };
  current: {
    executionId: string;
    timestamp: string;
    metrics: PerformanceMetric[];
  };
  changes: Array<{
    metric: string;
    change: number;
    changePercent: number;
    significant: boolean;
  }>;
}

// ============================================================================
// CACHING TYPES
// ============================================================================

export interface CacheRecommendation {
  nodeId: string;
  nodeName: string;
  cacheability: number; // 0-1 score
  estimatedHitRate: number; // 0-1
  ttlRecommendation: number; // seconds
  invalidationStrategy: 'time_based' | 'event_based' | 'manual' | 'hybrid';
  keyStrategy: string;
  estimatedSavings: {
    executionTime: number; // ms
    apiCalls: number;
    cost: number; // currency units
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PARALLELIZATION TYPES
// ============================================================================

export interface ParallelOpportunity {
  id: string;
  branchNodes: string[][];
  estimatedSpeedup: number; // multiplier
  dependencies: Array<{ from: string; to: string }>;
  requiresRefactoring: boolean;
  complexity: 'low' | 'medium' | 'high';
  risks: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// RESOURCE ALLOCATION TYPES
// ============================================================================

export interface ResourcePlan {
  workflowId: string;
  estimatedResources: {
    cpu: {
      cores: number;
      durationMs: number;
    };
    memory: {
      requiredMb: number;
      peakMb: number;
    };
    network: {
      bandwidthMbps: number;
      totalMb: number;
    };
    disk: {
      spaceMb: number;
      iops: number;
    };
  };
  scalingRecommendations: ScalingRecommendation[];
  costEstimate?: {
    currency: string;
    amount: number;
    breakdown: Record<string, number>;
  };
  confidence: number; // 0-1
  timestamp: string;
}

export interface ScalingRecommendation {
  type: 'horizontal' | 'vertical' | 'auto';
  resource: ResourceType;
  currentValue: number;
  recommendedValue: number;
  expectedImprovement: number; // percentage
  costImpact: number; // percentage
}

// ============================================================================
// BENCHMARK TYPES
// ============================================================================

export interface BenchmarkResult {
  id: string;
  workflowId: string;
  iterations: number;
  warmupRuns: number;
  metrics: {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  outliers: number[];
  comparisons?: BenchmarkComparison[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkComparison {
  baselineId: string;
  currentId: string;
  improvement: number; // percentage
  significant: boolean;
  pValue?: number;
}

export interface BenchmarkConfig {
  iterations: number;
  warmupRuns: number;
  timeout?: number;
  captureMetrics?: string[];
  skipOutliers?: boolean;
  outlierThreshold?: number; // standard deviations
}

// ============================================================================
// REGRESSION TYPES
// ============================================================================

export interface Regression {
  id: string;
  metric: string;
  baseline: {
    executionId: string;
    value: number;
    timestamp: string;
  };
  current: {
    executionId: string;
    value: number;
    timestamp: string;
  };
  degradation: number; // percentage
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  statisticallySignificant: boolean;
  pValue?: number;
  rootCause?: string;
  suspects: string[]; // node IDs
  detectedAt: string;
  metadata?: Record<string, unknown>;
}

export interface RegressionDetectionConfig {
  thresholdPercent: number;
  minSampleSize: number;
  significanceLevel: number;
  enableBisection: boolean;
  monitoredMetrics: string[];
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface PerformanceReport {
  id: string;
  workflowId: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalExecutions: number;
    avgDuration: number;
    successRate: number;
    performanceScore: number;
  };
  metrics: PerformanceMetric[];
  bottlenecks: Bottleneck[];
  optimizations: OptimizationSuggestion[];
  trends: PerformanceTrend[];
  regressions: Regression[];
  visualizations: ReportVisualization[];
  generatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ReportVisualization {
  type: 'line_chart' | 'bar_chart' | 'flame_graph' | 'heatmap' | 'waterfall';
  title: string;
  data: unknown;
  config?: Record<string, unknown>;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface Alert {
  id: string;
  type: 'threshold' | 'anomaly' | 'regression' | 'failure';
  severity: AlertSeverity;
  title: string;
  message: string;
  workflowId: string;
  executionId?: string;
  metric?: string;
  value?: number;
  threshold?: number;
  triggeredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
  severity: AlertSeverity;
  duration?: number; // seconds - must exceed threshold for this long
  cooldown?: number; // seconds - minimum time between alerts
}

export interface AnomalyAlert extends Alert {
  type: 'anomaly';
  expectedValue: number;
  actualValue: number;
  deviation: number;
  confidence: number;
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const PerformanceMetricSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  timestamp: z.number().int().positive(),
  nodeId: z.string().optional(),
  executionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ResourceUsageSchema = z.object({
  cpu: z.object({
    usage: z.number().min(0).max(100),
    cores: z.number().int().positive(),
    timeMs: z.number().nonnegative(),
  }),
  memory: z.object({
    used: z.number().nonnegative(),
    peak: z.number().nonnegative(),
    allocated: z.number().nonnegative(),
  }),
  network: z.object({
    bytesIn: z.number().nonnegative(),
    bytesOut: z.number().nonnegative(),
    requests: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative(),
  }),
  disk: z.object({
    reads: z.number().int().nonnegative(),
    writes: z.number().int().nonnegative(),
    bytesRead: z.number().nonnegative(),
    bytesWritten: z.number().nonnegative(),
  }),
});

export const BottleneckSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string(),
  nodeName: z.string(),
  type: z.nativeEnum(BottleneckType),
  severity: z.nativeEnum(BottleneckSeverity),
  impact: z.number().min(0).max(100),
  description: z.string(),
  rootCause: z.string().optional(),
  evidence: z.record(z.unknown()),
  detectedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const OptimizationSuggestionSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(OptimizationType),
  title: z.string().min(1).max(200),
  description: z.string(),
  expectedGain: z.object({
    metric: z.string(),
    currentValue: z.number(),
    expectedValue: z.number(),
    unit: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  affectedNodes: z.array(z.string()),
  safeToAutoApply: z.boolean(),
  complexity: z.enum(['low', 'medium', 'high']),
  implementation: z.object({
    type: z.enum(['config_change', 'node_addition', 'node_modification', 'workflow_restructure']),
    changes: z.array(z.object({
      target: z.string(),
      action: z.enum(['add', 'modify', 'remove']),
      before: z.unknown().optional(),
      after: z.unknown().optional(),
      metadata: z.record(z.unknown()).optional(),
    })),
    rollbackPlan: z.array(z.object({
      target: z.string(),
      action: z.enum(['add', 'modify', 'remove']),
      before: z.unknown().optional(),
      after: z.unknown().optional(),
      metadata: z.record(z.unknown()).optional(),
    })).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const BenchmarkResultSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string(),
  iterations: z.number().int().positive(),
  warmupRuns: z.number().int().nonnegative(),
  metrics: z.object({
    mean: z.number(),
    median: z.number(),
    min: z.number(),
    max: z.number(),
    stdDev: z.number(),
    p50: z.number(),
    p75: z.number(),
    p90: z.number(),
    p95: z.number(),
    p99: z.number(),
  }),
  outliers: z.array(z.number()),
  comparisons: z.array(z.object({
    baselineId: z.string().uuid(),
    currentId: z.string().uuid(),
    improvement: z.number(),
    significant: z.boolean(),
    pValue: z.number().optional(),
  })).optional(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const RegressionSchema = z.object({
  id: z.string().uuid(),
  metric: z.string(),
  baseline: z.object({
    executionId: z.string(),
    value: z.number(),
    timestamp: z.string().datetime(),
  }),
  current: z.object({
    executionId: z.string(),
    value: z.number(),
    timestamp: z.string().datetime(),
  }),
  degradation: z.number(),
  severity: z.enum(['minor', 'moderate', 'major', 'critical']),
  statisticallySignificant: z.boolean(),
  pValue: z.number().optional(),
  rootCause: z.string().optional(),
  suspects: z.array(z.string()),
  detectedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const AlertSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['threshold', 'anomaly', 'regression', 'failure']),
  severity: z.nativeEnum(AlertSeverity),
  title: z.string(),
  message: z.string(),
  workflowId: z.string(),
  executionId: z.string().optional(),
  metric: z.string().optional(),
  value: z.number().optional(),
  threshold: z.number().optional(),
  triggeredAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const AlertThresholdSchema = z.object({
  metric: z.string(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
  value: z.number(),
  severity: z.nativeEnum(AlertSeverity),
  duration: z.number().int().positive().optional(),
  cooldown: z.number().int().positive().optional(),
});

export const ProfilingOptionsSchema = z.object({
  includeFlameGraph: z.boolean().optional(),
  sampleRate: z.number().min(0).max(1).optional(),
  captureMemory: z.boolean().optional(),
  captureNetwork: z.boolean().optional(),
  captureDisk: z.boolean().optional(),
});

export const BenchmarkConfigSchema = z.object({
  iterations: z.number().int().positive(),
  warmupRuns: z.number().int().nonnegative(),
  timeout: z.number().int().positive().optional(),
  captureMetrics: z.array(z.string()).optional(),
  skipOutliers: z.boolean().optional(),
  outlierThreshold: z.number().positive().optional(),
});

export const RegressionDetectionConfigSchema = z.object({
  thresholdPercent: z.number().positive(),
  minSampleSize: z.number().int().positive(),
  significanceLevel: z.number().min(0).max(1),
  enableBisection: z.boolean(),
  monitoredMetrics: z.array(z.string()),
});
