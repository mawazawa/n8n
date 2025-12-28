/**
 * Workflow Optimization Type Definitions
 * Defines types for analyzing, detecting, and applying optimizations to n8n workflows
 */

export type OptimizationType = 'performance' | 'reliability' | 'cost' | 'maintainability';
export type OptimizationImpact = 'low' | 'medium' | 'high';

export interface Optimization {
  id: string;
  type: OptimizationType;
  title: string;
  description: string;
  impact: OptimizationImpact;
  effort: 'low' | 'medium' | 'high';
  affectedNodes: string[];
  estimatedImprovement?: {
    metric: string;
    currentValue: number;
    projectedValue: number;
    unit: string;
  };
  action: OptimizationAction;
}

export interface OptimizationAction {
  type: 'add_node' | 'remove_node' | 'modify_node' | 'reorder' | 'parallelize' | 'batch' | 'cache';
  params: Record<string, unknown>;
  autoApplicable: boolean;
}

export interface OptimizationResult {
  workflowId: string;
  analyzedAt: string;
  optimizations: Optimization[];
  overallScore: number; // 0-100
  scores: Record<OptimizationType, number>;
}

export interface BenchmarkResult {
  workflowId: string;
  iterations: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  memoryUsage: number;
  nodeTimings: Record<string, number>;
}

export interface OptimizationContext {
  workflowId: string;
  nodeCount: number;
  connectionCount: number;
  hasLoops: boolean;
  hasConditionals: boolean;
  hasErrorHandling: boolean;
  externalCallCount: number;
  estimatedComplexity: number;
}

export interface DetectorResult {
  optimizations: Optimization[];
  context: Partial<OptimizationContext>;
}

export interface AppliedOptimization {
  optimization: Optimization;
  appliedAt: string;
  status: 'success' | 'failed' | 'partial';
  changes: OptimizationChange[];
  error?: string;
}

export interface OptimizationChange {
  type: 'node_added' | 'node_removed' | 'node_modified' | 'connection_added' | 'connection_removed' | 'setting_changed';
  nodeId?: string;
  before?: unknown;
  after?: unknown;
}

export interface OptimizationPreview {
  optimization: Optimization;
  changes: OptimizationChange[];
  estimatedImpact: {
    performanceGain?: string;
    costReduction?: string;
    reliabilityImprovement?: string;
  };
  warnings: string[];
}

export interface RollbackData {
  optimizationId: string;
  changes: OptimizationChange[];
  timestamp: string;
}
