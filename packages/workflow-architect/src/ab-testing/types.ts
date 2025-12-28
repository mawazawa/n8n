/**
 * A/B Testing Type Definitions
 * Comprehensive types for experiment management, variants, metrics, and analysis
 */

import { z } from 'zod';

/**
 * Experiment Status
 */
export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

/**
 * Metric Goal Type
 */
export type MetricGoal = 'maximize' | 'minimize';

/**
 * Metric Value Type
 */
export type MetricType = 'continuous' | 'proportion' | 'count' | 'rate';

/**
 * Test Type
 */
export type TestType = 't-test' | 'chi-square' | 'bayesian';

/**
 * Traffic Allocation Strategy
 */
export type AllocationStrategy = 'random' | 'consistent-hash' | 'weighted';

/**
 * Rollout Status
 */
export type RolloutStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'rolled-back';

/**
 * Alert Severity
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Workflow Variant Configuration
 */
export interface VariantConfig {
  workflowId: string;
  version?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Experiment Variant
 */
export interface Variant {
  id: string;
  experimentId: string;
  name: string;
  description?: string;
  config: VariantConfig;
  trafficAllocation: number; // 0-1 (percentage as decimal)
  isControl: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Metric Definition
 */
export interface Metric {
  name: string;
  type: MetricType;
  goal: MetricGoal;
  description?: string;
  unit?: string;
  isPrimary: boolean;
}

/**
 * Experiment Definition
 */
export interface Experiment {
  id: string;
  name: string;
  description?: string;
  workflowId: string;
  status: ExperimentStatus;
  variants: Variant[];
  metrics: Metric[];
  hypothesis?: string;
  startDate?: string;
  endDate?: string;
  minimumSampleSize: number;
  confidenceLevel: number; // 0-1 (typically 0.95)
  minimumDetectableEffect: number; // 0-1 (typically 0.05)
  segmentId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User Assignment
 */
export interface Assignment {
  id: string;
  userId: string;
  experimentId: string;
  variantId: string;
  assignedAt: string;
  sticky: boolean; // If true, user always gets same variant
  metadata?: Record<string, unknown>;
}

/**
 * Metric Event
 */
export interface MetricEvent {
  id: string;
  experimentId: string;
  variantId: string;
  userId: string;
  metricName: string;
  value: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Statistical Summary
 */
export interface StatisticalSummary {
  mean: number;
  variance: number;
  standardDeviation: number;
  standardError: number;
  sampleSize: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
}

/**
 * Significance Test Result
 */
export interface SignificanceResult {
  testType: TestType;
  pValue: number;
  isSignificant: boolean;
  confidenceLevel: number;
  effectSize: number;
  powerAnalysis?: {
    power: number;
    requiredSampleSize: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Variant Analysis Result
 */
export interface VariantAnalysis {
  variantId: string;
  variantName: string;
  isControl: boolean;
  statistics: Map<string, StatisticalSummary>;
  sampleSize: number;
}

/**
 * Comparison Result
 */
export interface ComparisonResult {
  metricName: string;
  control: VariantAnalysis;
  treatment: VariantAnalysis;
  significance: SignificanceResult;
  relativeImprovement: number; // Percentage improvement over control
  absoluteDifference: number;
}

/**
 * Experiment Analysis Result
 */
export interface AnalysisResult {
  experimentId: string;
  experimentName: string;
  status: ExperimentStatus;
  duration: number; // milliseconds
  totalSampleSize: number;
  variants: VariantAnalysis[];
  comparisons: ComparisonResult[];
  recommendation?: {
    winningVariantId: string;
    confidence: number;
    reason: string;
  };
  generatedAt: string;
}

/**
 * User Segment Criteria
 */
export interface SegmentCriteria {
  userProperties?: Record<string, unknown>;
  behaviors?: {
    event: string;
    count?: number;
    within?: number; // milliseconds
  }[];
  cohort?: {
    startDate: string;
    endDate: string;
  };
  customQuery?: string;
}

/**
 * User Segment
 */
export interface Segment {
  id: string;
  name: string;
  description?: string;
  criteria: SegmentCriteria;
  estimatedSize?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rollout Schedule Step
 */
export interface RolloutStep {
  percentage: number; // Target traffic percentage
  scheduledAt: string;
  executedAt?: string;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * Rollout Configuration
 */
export interface RolloutConfig {
  id: string;
  experimentId: string;
  strategy: 'linear' | 'exponential' | 'custom';
  startPercentage: number;
  targetPercentage: number;
  duration: number; // milliseconds
  steps: RolloutStep[];
  status: RolloutStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Guardrail Rule
 */
export interface GuardrailRule {
  metricName: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
  threshold: number;
  action: 'alert' | 'pause' | 'stop';
  severity: AlertSeverity;
}

/**
 * Guardrail Alert
 */
export interface GuardrailAlert {
  id: string;
  experimentId: string;
  rule: GuardrailRule;
  triggeredAt: string;
  currentValue: number;
  message: string;
  severity: AlertSeverity;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/**
 * Experiment Report
 */
export interface ExperimentReport {
  experimentId: string;
  experimentName: string;
  summary: {
    status: ExperimentStatus;
    duration: number;
    totalUsers: number;
    totalEvents: number;
    startDate: string;
    endDate?: string;
  };
  analysis: AnalysisResult;
  recommendations: string[];
  visualizations: {
    type: string;
    data: Record<string, unknown>;
  }[];
  generatedAt: string;
}

/**
 * Multi-Armed Bandit Configuration
 */
export interface BanditConfig {
  algorithm: 'epsilon-greedy' | 'thompson-sampling' | 'ucb';
  explorationRate?: number; // for epsilon-greedy
  priorAlpha?: number; // for thompson-sampling
  priorBeta?: number; // for thompson-sampling
  confidenceLevel?: number; // for UCB
  updateFrequency: number; // milliseconds
}

/**
 * Auto Optimization Configuration
 */
export interface AutoOptimizationConfig {
  id: string;
  experimentId: string;
  enabled: boolean;
  banditConfig: BanditConfig;
  earlyStoppingRules: {
    minSampleSize: number;
    checkFrequency: number; // milliseconds
    probabilityThreshold: number;
  };
  status: 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Experiment Input
 */
export interface CreateExperimentInput {
  name: string;
  description?: string;
  workflowId: string;
  variants: Array<{
    name: string;
    description?: string;
    config: VariantConfig;
    trafficAllocation: number;
    isControl: boolean;
  }>;
  metrics: Metric[];
  hypothesis?: string;
  minimumSampleSize?: number;
  confidenceLevel?: number;
  minimumDetectableEffect?: number;
  segmentId?: string;
}

/**
 * Update Experiment Input
 */
export interface UpdateExperimentInput {
  name?: string;
  description?: string;
  status?: ExperimentStatus;
  endDate?: string;
  metrics?: Metric[];
}

// Zod Schemas for Validation

export const VariantConfigSchema = z.object({
  workflowId: z.string().uuid(),
  version: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export const MetricSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['continuous', 'proportion', 'count', 'rate']),
  goal: z.enum(['maximize', 'minimize']),
  description: z.string().optional(),
  unit: z.string().optional(),
  isPrimary: z.boolean(),
});

export const CreateExperimentInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  workflowId: z.string().uuid(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(500).optional(),
        config: VariantConfigSchema,
        trafficAllocation: z.number().min(0).max(1),
        isControl: z.boolean(),
      }),
    )
    .min(2)
    .refine((variants) => variants.filter((v) => v.isControl).length === 1, {
      message: 'Exactly one variant must be marked as control',
    })
    .refine((variants) => Math.abs(variants.reduce((sum, v) => sum + v.trafficAllocation, 0) - 1) < 0.0001, {
      message: 'Traffic allocations must sum to 1.0',
    }),
  metrics: z.array(MetricSchema).min(1),
  hypothesis: z.string().max(2000).optional(),
  minimumSampleSize: z.number().int().positive().default(100),
  confidenceLevel: z.number().min(0).max(1).default(0.95),
  minimumDetectableEffect: z.number().min(0).max(1).default(0.05),
  segmentId: z.string().uuid().optional(),
});

export const UpdateExperimentInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED']).optional(),
  endDate: z.string().datetime().optional(),
  metrics: z.array(MetricSchema).optional(),
});

export const SegmentCriteriaSchema = z.object({
  userProperties: z.record(z.unknown()).optional(),
  behaviors: z
    .array(
      z.object({
        event: z.string(),
        count: z.number().int().positive().optional(),
        within: z.number().positive().optional(),
      }),
    )
    .optional(),
  cohort: z
    .object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    })
    .optional(),
  customQuery: z.string().optional(),
});

export const GuardrailRuleSchema = z.object({
  metricName: z.string().min(1),
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'neq']),
  threshold: z.number(),
  action: z.enum(['alert', 'pause', 'stop']),
  severity: z.enum(['info', 'warning', 'critical']),
});

export const BanditConfigSchema = z.object({
  algorithm: z.enum(['epsilon-greedy', 'thompson-sampling', 'ucb']),
  explorationRate: z.number().min(0).max(1).optional(),
  priorAlpha: z.number().positive().optional(),
  priorBeta: z.number().positive().optional(),
  confidenceLevel: z.number().min(0).max(1).optional(),
  updateFrequency: z.number().positive(),
});
