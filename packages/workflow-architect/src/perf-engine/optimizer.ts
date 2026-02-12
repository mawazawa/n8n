/**
 * Auto-Optimizer
 * Automatically applies safe optimizations to workflows
 */

import { v4 as uuidv4 } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  OptimizationSuggestion,
  OptimizedWorkflow,
  OptimizationChange,
  OptimizationType,
} from './types';

interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    type: string;
    parameters: Record<string, unknown>;
    position: [number, number];
  }>;
  connections: Array<{ source: string; target: string }>;
  settings?: Record<string, unknown>;
}

export class AutoOptimizer {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Optimize a workflow
   */
  async optimize(
    workflow: WorkflowDefinition,
    suggestions: OptimizationSuggestion[],
    dryRun = true,
  ): Promise<OptimizedWorkflow> {
    const originalWorkflow = { ...workflow };
    let optimizedWorkflow = { ...workflow };

    const appliedOptimizations: OptimizationSuggestion[] = [];

    // Only apply safe optimizations unless explicitly told otherwise
    const safeOptimizations = suggestions.filter((s) => s.safeToAutoApply);

    for (const optimization of safeOptimizations) {
      try {
        optimizedWorkflow = await this.applyOptimization(optimizedWorkflow, optimization);
        appliedOptimizations.push(optimization);
      } catch (error) {
        console.error(`Failed to apply optimization ${optimization.id}:`, error);
      }
    }

    const expectedImprovement = this.calculateExpectedImprovement(appliedOptimizations);

    // Save optimization history
    if (!dryRun) {
      await this.saveOptimizationHistory(workflow.id, appliedOptimizations);
    }

    return {
      workflowId: workflow.id,
      originalWorkflow,
      optimizedWorkflow,
      appliedOptimizations,
      expectedImprovement,
      dryRun,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Apply a single optimization
   */
  private async applyOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): Promise<WorkflowDefinition> {
    switch (optimization.type) {
      case OptimizationType.CACHING:
        return this.applyCachingOptimization(workflow, optimization);

      case OptimizationType.PARALLELIZATION:
        return this.applyParallelizationOptimization(workflow, optimization);

      case OptimizationType.BATCHING:
        return this.applyBatchingOptimization(workflow, optimization);

      case OptimizationType.RESOURCE_ALLOCATION:
        return this.applyResourceOptimization(workflow, optimization);

      case OptimizationType.QUERY_OPTIMIZATION:
        return this.applyQueryOptimization(workflow, optimization);

      case OptimizationType.CODE_OPTIMIZATION:
        return this.applyCodeOptimization(workflow, optimization);

      default:
        return workflow;
    }
  }

  /**
   * Apply caching optimization
   */
  private applyCachingOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    const modifiedWorkflow = { ...workflow };

    for (const nodeId of optimization.affectedNodes) {
      const node = modifiedWorkflow.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Add caching configuration to node
      node.parameters = {
        ...node.parameters,
        cache: {
          enabled: true,
          ttl: 3600, // 1 hour default
          mode: 'after',
        },
      };
    }

    return modifiedWorkflow;
  }

  /**
   * Apply parallelization optimization
   */
  private applyParallelizationOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    // Parallelization requires workflow restructuring
    // This is a simplified version - real implementation would be more complex
    const modifiedWorkflow = { ...workflow };

    // Mark nodes for parallel execution in settings
    modifiedWorkflow.settings = {
      ...modifiedWorkflow.settings,
      executionOrder: 'parallel',
      parallelNodes: optimization.affectedNodes,
    };

    return modifiedWorkflow;
  }

  /**
   * Apply batching optimization
   */
  private applyBatchingOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    const modifiedWorkflow = { ...workflow };

    for (const nodeId of optimization.affectedNodes) {
      const node = modifiedWorkflow.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Add batching configuration
      node.parameters = {
        ...node.parameters,
        batching: {
          enabled: true,
          batchSize: 100,
        },
      };
    }

    return modifiedWorkflow;
  }

  /**
   * Apply resource optimization
   */
  private applyResourceOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    const modifiedWorkflow = { ...workflow };

    // Adjust workflow-level resource settings
    modifiedWorkflow.settings = {
      ...modifiedWorkflow.settings,
      executionTimeout: 300000, // 5 minutes
      maxExecutionTime: 600000, // 10 minutes
    };

    return modifiedWorkflow;
  }

  /**
   * Apply query optimization
   */
  private applyQueryOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    const modifiedWorkflow = { ...workflow };

    for (const nodeId of optimization.affectedNodes) {
      const node = modifiedWorkflow.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Add query optimization hints
      if (node.parameters.operation === 'select' || node.parameters.query) {
        node.parameters = {
          ...node.parameters,
          options: {
            ...((node.parameters.options as Record<string, unknown>) || {}),
            limit: 1000,
            useIndex: true,
          },
        };
      }
    }

    return modifiedWorkflow;
  }

  /**
   * Apply code optimization
   */
  private applyCodeOptimization(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): WorkflowDefinition {
    // Code optimization is typically manual
    // This is a placeholder for future AI-assisted code optimization
    return workflow;
  }

  /**
   * Calculate expected improvement
   */
  private calculateExpectedImprovement(
    optimizations: OptimizationSuggestion[],
  ): OptimizedWorkflow['expectedImprovement'] {
    let totalExecutionTimeGain = 0;
    let totalResourceGain = 0;
    let totalCostGain = 0;
    let count = 0;

    for (const opt of optimizations) {
      const { expectedGain } = opt;
      const improvement =
        ((expectedGain.currentValue - expectedGain.expectedValue) /
          expectedGain.currentValue) *
        100;

      if (expectedGain.metric.includes('time') || expectedGain.metric.includes('duration')) {
        totalExecutionTimeGain += improvement;
      } else if (
        expectedGain.metric.includes('cpu') ||
        expectedGain.metric.includes('memory')
      ) {
        totalResourceGain += improvement;
      } else if (expectedGain.metric.includes('cost')) {
        totalCostGain += improvement;
      }

      count++;
    }

    return {
      executionTime: count > 0 ? totalExecutionTimeGain / count : 0,
      resourceUsage: count > 0 ? totalResourceGain / count : 0,
      cost: count > 0 ? totalCostGain / count : 0,
    };
  }

  /**
   * Save optimization history
   */
  private async saveOptimizationHistory(
    workflowId: string,
    optimizations: OptimizationSuggestion[],
  ): Promise<void> {
    const records = optimizations.map((opt) => ({
      id: uuidv4(),
      workflow_id: workflowId,
      optimization_type: opt.type,
      title: opt.title,
      description: opt.description,
      expected_gain: opt.expectedGain,
      affected_nodes: opt.affectedNodes,
      applied_at: new Date().toISOString(),
      metadata: opt.metadata,
    }));

    const { error } = await this.supabase.from('optimizations').insert(records);

    if (error) {
      console.error('Failed to save optimization history:', error);
    }
  }

  /**
   * Get optimization history for a workflow
   */
  async getHistory(workflowId: string): Promise<OptimizationSuggestion[]> {
    const { data, error } = await this.supabase
      .from('optimizations')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('applied_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch optimization history:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      type: row.optimization_type,
      title: row.title,
      description: row.description,
      expectedGain: row.expected_gain,
      affectedNodes: row.affected_nodes,
      safeToAutoApply: false, // Historical record
      complexity: 'medium' as const,
      metadata: row.metadata,
    }));
  }

  /**
   * Rollback an optimization
   */
  async rollback(
    workflow: WorkflowDefinition,
    optimization: OptimizationSuggestion,
  ): Promise<WorkflowDefinition> {
    if (!optimization.implementation?.rollbackPlan) {
      throw new Error('No rollback plan available for this optimization');
    }

    let rolledBackWorkflow = { ...workflow };

    for (const change of optimization.implementation.rollbackPlan) {
      rolledBackWorkflow = this.applyChange(rolledBackWorkflow, change);
    }

    return rolledBackWorkflow;
  }

  /**
   * Apply a single change to workflow
   */
  private applyChange(
    workflow: WorkflowDefinition,
    change: OptimizationChange,
  ): WorkflowDefinition {
    const modifiedWorkflow = { ...workflow };

    switch (change.action) {
      case 'modify':
        const node = modifiedWorkflow.nodes.find((n) => n.id === change.target);
        if (node && change.after) {
          Object.assign(node, change.after);
        }
        break;

      case 'remove':
        modifiedWorkflow.nodes = modifiedWorkflow.nodes.filter(
          (n) => n.id !== change.target,
        );
        break;

      case 'add':
        if (change.after) {
          modifiedWorkflow.nodes.push(change.after as WorkflowDefinition['nodes'][0]);
        }
        break;
    }

    return modifiedWorkflow;
  }
}
