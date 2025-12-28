/**
 * Intelligence Type Definitions
 * Types for workflow intelligence, insights, and recommendations
 */

import { z } from 'zod';
import type { WorkflowDefinition } from '../types/workflow.js';

// Insight Types
export enum InsightType {
  PERFORMANCE = 'performance',
  RELIABILITY = 'reliability',
  COST = 'cost',
  SECURITY = 'security',
  USAGE = 'usage',
}

export enum InsightSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  action: string;
  affectedNodes?: string[];
  metadata?: Record<string, unknown>;
  timestamp: number;
  workflowId: string;
}

// Recommendation Types
export interface Recommendation {
  id: string;
  insight: Insight;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  confidence: number; // 0-100
  roi: number; // Return on Investment score
  steps: string[];
  estimatedImprovement: {
    metric: string;
    currentValue: number;
    projectedValue: number;
    unit: string;
    improvementPercent: number;
  };
  alternatives?: Array<{
    title: string;
    description: string;
    tradeoffs: string[];
  }>;
}

// Trend Types
export interface TrendData {
  metric: string;
  values: Array<{ timestamp: number; value: number }>;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  current: number;
  previous: number;
  average: number;
  min: number;
  max: number;
  stdDev: number;
}

export interface Trend {
  id: string;
  workflowId: string;
  metric: string;
  data: TrendData;
  pattern: 'linear' | 'exponential' | 'seasonal' | 'anomaly' | 'stable';
  seasonality?: {
    period: 'daily' | 'weekly' | 'monthly';
    strength: number;
  };
  forecast?: Array<{ timestamp: number; value: number; confidence: number }>;
  detectedAt: number;
}

// Prediction Types
export interface PredictionResult {
  id: string;
  workflowId: string;
  type: 'failure' | 'degradation' | 'overload';
  probability: number; // 0-100
  timeframe: {
    start: number;
    end: number;
    mostLikely: number;
  };
  factors: Array<{
    name: string;
    contribution: number; // percentage
    description: string;
  }>;
  confidence: number; // 0-100
  mitigation: string[];
  generatedAt: number;
}

export interface Prediction {
  result: PredictionResult;
  historicalAccuracy: number;
  similarCases: number;
}

// Similarity Types
export interface SimilarWorkflow {
  workflow: WorkflowDefinition;
  similarity: number; // 0-100
  matchedFeatures: string[];
  differences: string[];
  metrics?: {
    avgExecutionTime: number;
    successRate: number;
    cost: number;
  };
}

export interface SimilarityMetrics {
  structural: number; // 0-100
  functional: number; // 0-100
  semantic: number; // 0-100
  overall: number; // 0-100
}

// Clustering Types
export interface Cluster {
  id: string;
  name: string;
  description: string;
  workflows: string[];
  centroid: number[];
  characteristics: string[];
  avgMetrics: {
    executionTime: number;
    successRate: number;
    nodeCount: number;
  };
  outliers: string[];
}

export interface ClusteringResult {
  clusters: Cluster[];
  unassigned: string[];
  quality: {
    silhouetteScore: number; // -1 to 1
    daviesBouldinIndex: number;
  };
  recommendations: string[];
}

// Pattern Types
export interface Pattern {
  id: string;
  name: string;
  description: string;
  type: 'best_practice' | 'anti_pattern' | 'optimization_opportunity';
  occurrences: Array<{
    nodeIds: string[];
    confidence: number;
  }>;
  recommendation?: string;
  impact: 'low' | 'medium' | 'high';
}

// Benchmark Types
export interface BenchmarkResult {
  workflowId: string;
  category: string;
  percentile: number; // Where this workflow ranks (0-100)
  metrics: {
    executionTime: {
      value: number;
      unit: 'ms';
      percentile: number;
      industryAvg: number;
      bestInClass: number;
    };
    successRate: {
      value: number;
      unit: '%';
      percentile: number;
      industryAvg: number;
      bestInClass: number;
    };
    cost: {
      value: number;
      unit: 'credits';
      percentile: number;
      industryAvg: number;
      bestInClass: number;
    };
  };
  comparison: {
    similarWorkflows: number;
    betterThan: number;
    worseThan: number;
  };
  recommendations: string[];
}

// Cost Analysis Types
export interface CostAnalysis {
  workflowId: string;
  totalCost: number;
  breakdown: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    cost: number;
    percentage: number;
    executions: number;
    avgCostPerExecution: number;
  }>;
  trends: {
    daily: TrendData;
    weekly: TrendData;
    monthly: TrendData;
  };
  optimizations: Array<{
    description: string;
    potentialSavings: number;
    savingsPercent: number;
    effort: 'low' | 'medium' | 'high';
  }>;
  projectedCost: {
    nextWeek: number;
    nextMonth: number;
    nextQuarter: number;
  };
}

// Impact Analysis Types
export interface ImpactReport {
  changeId: string;
  workflowId: string;
  changes: Array<{
    type: 'add' | 'remove' | 'modify';
    nodeId?: string;
    description: string;
  }>;
  impact: {
    directNodes: string[];
    indirectNodes: string[];
    affectedWorkflows: string[];
    estimatedDowntime: number; // minutes
  };
  risks: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    probability: number;
    mitigation: string;
  }>;
  dependencies: {
    upstream: string[];
    downstream: string[];
    external: string[];
  };
  recommendations: string[];
  rollbackPlan: string[];
}

// Report Types
export interface IntelligenceReport {
  id: string;
  workflowId: string;
  type: 'executive' | 'detailed' | 'technical';
  generatedAt: number;
  period: {
    start: number;
    end: number;
  };
  summary: {
    overallHealth: number; // 0-100
    totalInsights: number;
    criticalIssues: number;
    recommendations: number;
    trends: string[];
  };
  sections: ReportSection[];
  metadata: Record<string, unknown>;
}

export interface ReportSection {
  title: string;
  type: 'text' | 'metrics' | 'chart' | 'table' | 'recommendations';
  content: unknown;
  priority: number;
}

// Alert Types
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  workflowId?: string; // undefined means global
  condition: {
    type: 'threshold' | 'anomaly' | 'pattern' | 'prediction';
    metric: string;
    operator?: '>' | '<' | '==' | '!=' | '>=' | '<=';
    value?: number;
    window?: number; // time window in ms
  };
  actions: Array<{
    type: 'notify' | 'webhook' | 'pause_workflow' | 'execute_workflow';
    config: Record<string, unknown>;
  }>;
  cooldown: number; // ms between alerts
  lastTriggered?: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  workflowId?: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data: Record<string, unknown>;
  triggeredAt: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

// Zod Schemas for Validation
export const InsightSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(InsightType),
  severity: z.nativeEnum(InsightSeverity),
  title: z.string().min(1),
  description: z.string().min(1),
  action: z.string().min(1),
  affectedNodes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number().positive(),
  workflowId: z.string(),
});

export const RecommendationSchema = z.object({
  id: z.string(),
  insight: InsightSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  impact: z.enum(['low', 'medium', 'high']),
  effort: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(100),
  roi: z.number(),
  steps: z.array(z.string().min(1)),
  estimatedImprovement: z.object({
    metric: z.string(),
    currentValue: z.number(),
    projectedValue: z.number(),
    unit: z.string(),
    improvementPercent: z.number(),
  }),
  alternatives: z.array(z.object({
    title: z.string(),
    description: z.string(),
    tradeoffs: z.array(z.string()),
  })).optional(),
});

export const TrendDataSchema = z.object({
  metric: z.string(),
  values: z.array(z.object({
    timestamp: z.number(),
    value: z.number(),
  })),
  direction: z.enum(['up', 'down', 'stable']),
  changePercent: z.number(),
  current: z.number(),
  previous: z.number(),
  average: z.number(),
  min: z.number(),
  max: z.number(),
  stdDev: z.number(),
});

export const PredictionResultSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  type: z.enum(['failure', 'degradation', 'overload']),
  probability: z.number().min(0).max(100),
  timeframe: z.object({
    start: z.number(),
    end: z.number(),
    mostLikely: z.number(),
  }),
  factors: z.array(z.object({
    name: z.string(),
    contribution: z.number(),
    description: z.string(),
  })),
  confidence: z.number().min(0).max(100),
  mitigation: z.array(z.string()),
  generatedAt: z.number(),
});

export const AlertRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  workflowId: z.string().optional(),
  condition: z.object({
    type: z.enum(['threshold', 'anomaly', 'pattern', 'prediction']),
    metric: z.string(),
    operator: z.enum(['>', '<', '==', '!=', '>=', '<=']).optional(),
    value: z.number().optional(),
    window: z.number().optional(),
  }),
  actions: z.array(z.object({
    type: z.enum(['notify', 'webhook', 'pause_workflow', 'execute_workflow']),
    config: z.record(z.unknown()),
  })),
  cooldown: z.number().min(0),
  lastTriggered: z.number().optional(),
});

export const BenchmarkResultSchema = z.object({
  workflowId: z.string(),
  category: z.string(),
  percentile: z.number().min(0).max(100),
  metrics: z.object({
    executionTime: z.object({
      value: z.number(),
      unit: z.literal('ms'),
      percentile: z.number(),
      industryAvg: z.number(),
      bestInClass: z.number(),
    }),
    successRate: z.object({
      value: z.number(),
      unit: z.literal('%'),
      percentile: z.number(),
      industryAvg: z.number(),
      bestInClass: z.number(),
    }),
    cost: z.object({
      value: z.number(),
      unit: z.literal('credits'),
      percentile: z.number(),
      industryAvg: z.number(),
      bestInClass: z.number(),
    }),
  }),
  comparison: z.object({
    similarWorkflows: z.number(),
    betterThan: z.number(),
    worseThan: z.number(),
  }),
  recommendations: z.array(z.string()),
});

// Type exports for validation
export type ValidatedInsight = z.infer<typeof InsightSchema>;
export type ValidatedRecommendation = z.infer<typeof RecommendationSchema>;
export type ValidatedTrendData = z.infer<typeof TrendDataSchema>;
export type ValidatedPredictionResult = z.infer<typeof PredictionResultSchema>;
export type ValidatedAlertRule = z.infer<typeof AlertRuleSchema>;
export type ValidatedBenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
