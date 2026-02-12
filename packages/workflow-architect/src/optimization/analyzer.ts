/**
 * Workflow Optimization Analyzer
 * Analyzes workflows for optimization opportunities and calculates quality scores
 */

import type { WorkflowDefinition, WorkflowNode } from '../types/workflow.js';
import type {
  Optimization,
  OptimizationResult,
  OptimizationType,
  OptimizationContext,
} from './types.js';
import * as detectors from './detectors/index.js';
import * as performanceDetectors from './detectors/performance.js';
import * as reliabilityDetectors from './detectors/reliability.js';

export class WorkflowOptimizer {
  /**
   * Performs comprehensive workflow analysis
   */
  async analyze(workflow: WorkflowDefinition): Promise<OptimizationResult> {
    const context = this.buildContext(workflow);
    const optimizations = await this.getOptimizations(workflow, context);
    const scores = this.calculateScores(workflow, optimizations, context);
    const overallScore = this.calculateOverallScore(scores);

    return {
      workflowId: workflow.id ?? 'unknown',
      analyzedAt: new Date().toISOString(),
      optimizations: this.prioritizeOptimizations(optimizations),
      overallScore,
      scores,
    };
  }

  /**
   * Get all optimizations for a workflow
   */
  async getOptimizations(
    workflow: WorkflowDefinition,
    context?: OptimizationContext,
  ): Promise<Optimization[]> {
    const ctx = context ?? this.buildContext(workflow);
    const allOptimizations: Optimization[] = [];

    // Run all detectors
    const detectorResults = await Promise.all([
      // General detectors
      detectors.detectRedundancy(workflow, ctx),
      detectors.detectParallelization(workflow, ctx),
      detectors.detectCaching(workflow, ctx),
      detectors.detectBatching(workflow, ctx),
      detectors.detectErrorHandling(workflow, ctx),

      // Performance detectors
      performanceDetectors.detectSlowPatterns(workflow, ctx),
      performanceDetectors.detectUnnecessaryTransformations(workflow, ctx),
      performanceDetectors.detectSuboptimalOrdering(workflow, ctx),
      performanceDetectors.detectMissingPagination(workflow, ctx),
      performanceDetectors.detectHeavyPayloads(workflow, ctx),

      // Reliability detectors
      reliabilityDetectors.detectMissingRetry(workflow, ctx),
      reliabilityDetectors.detectMissingErrorHandling(workflow, ctx),
      reliabilityDetectors.detectMissingTimeouts(workflow, ctx),
      reliabilityDetectors.detectMissingFallbacks(workflow, ctx),
      reliabilityDetectors.detectInsufficientValidation(workflow, ctx),
    ]);

    // Flatten results
    for (const result of detectorResults) {
      allOptimizations.push(...result);
    }

    // Remove duplicates based on affected nodes and type
    return this.deduplicateOptimizations(allOptimizations);
  }

  /**
   * Calculate scores for each optimization type
   */
  calculateScores(
    workflow: WorkflowDefinition,
    optimizations: Optimization[],
    context: OptimizationContext,
  ): Record<OptimizationType, number> {
    const baseScores: Record<OptimizationType, number> = {
      performance: 100,
      reliability: 100,
      cost: 100,
      maintainability: 100,
    };

    // Deduct points based on optimizations found
    for (const opt of optimizations) {
      const penalty = this.calculatePenalty(opt, context);
      baseScores[opt.type] = Math.max(0, baseScores[opt.type] - penalty);
    }

    // Additional context-based penalties
    if (!context.hasErrorHandling) {
      baseScores.reliability = Math.max(0, baseScores.reliability - 20);
    }

    if (context.nodeCount > 50) {
      baseScores.maintainability = Math.max(0, baseScores.maintainability - 10);
    }

    if (context.estimatedComplexity > 100) {
      baseScores.performance = Math.max(0, baseScores.performance - 15);
    }

    return baseScores;
  }

  /**
   * Build optimization context from workflow
   */
  private buildContext(workflow: WorkflowDefinition): OptimizationContext {
    const nodes = workflow.nodes;
    const connections = workflow.connections;

    // Count connections
    let connectionCount = 0;
    for (const sourceNode in connections) {
      for (const type in connections[sourceNode]) {
        connectionCount += connections[sourceNode][type].length;
      }
    }

    // Detect loops (simplified - checks for backward connections)
    const hasLoops = this.detectLoops(workflow);

    // Detect conditionals (IF, Switch nodes)
    const hasConditionals = nodes.some(node =>
      node.type === 'n8n-nodes-base.if' ||
      node.type === 'n8n-nodes-base.switch'
    );

    // Detect error handling (Error Trigger nodes or try-catch patterns)
    const hasErrorHandling = nodes.some(node =>
      node.type === 'n8n-nodes-base.errorTrigger' ||
      node.parameters.continueOnFail === true
    );

    // Count external API calls
    const externalCallCount = nodes.filter(node =>
      node.type.includes('http') ||
      node.type.includes('webhook') ||
      this.isExternalServiceNode(node)
    ).length;

    // Estimate complexity
    const estimatedComplexity =
      nodes.length * 1 +
      connectionCount * 0.5 +
      (hasLoops ? 20 : 0) +
      (hasConditionals ? 10 : 0) +
      externalCallCount * 5;

    return {
      workflowId: workflow.id ?? 'unknown',
      nodeCount: nodes.length,
      connectionCount,
      hasLoops,
      hasConditionals,
      hasErrorHandling,
      externalCallCount,
      estimatedComplexity,
    };
  }

  /**
   * Detect loops in workflow (simplified cycle detection)
   */
  private detectLoops(workflow: WorkflowDefinition): boolean {
    const connections = workflow.connections;
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const nodeConnections = connections[node];
      if (nodeConnections) {
        for (const type in nodeConnections) {
          for (const connArray of nodeConnections[type]) {
            for (const conn of connArray) {
              if (!visited.has(conn.node)) {
                if (hasCycle(conn.node)) {
                  return true;
                }
              } else if (recursionStack.has(conn.node)) {
                return true;
              }
            }
          }
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const nodeId in connections) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if node is an external service node
   */
  private isExternalServiceNode(node: WorkflowNode): boolean {
    const externalPatterns = [
      'slack', 'gmail', 'github', 'jira', 'salesforce', 'hubspot',
      'stripe', 'shopify', 'airtable', 'notion', 'asana', 'trello',
      'discord', 'telegram', 'twitter', 'linkedin', 'facebook',
    ];

    const nodeType = node.type.toLowerCase();
    return externalPatterns.some(pattern => nodeType.includes(pattern));
  }

  /**
   * Calculate penalty for an optimization
   */
  private calculatePenalty(opt: Optimization, context: OptimizationContext): number {
    let basePenalty = 0;

    // Impact-based penalty
    switch (opt.impact) {
      case 'high':
        basePenalty = 15;
        break;
      case 'medium':
        basePenalty = 8;
        break;
      case 'low':
        basePenalty = 3;
        break;
    }

    // Scale penalty based on affected nodes
    const affectedRatio = opt.affectedNodes.length / context.nodeCount;
    basePenalty *= (1 + affectedRatio);

    return Math.round(basePenalty);
  }

  /**
   * Calculate overall score from type scores
   */
  private calculateOverallScore(scores: Record<OptimizationType, number>): number {
    // Weighted average
    const weights = {
      performance: 0.3,
      reliability: 0.35,
      cost: 0.2,
      maintainability: 0.15,
    };

    let totalScore = 0;
    for (const type in scores) {
      const optimizationType = type as OptimizationType;
      totalScore += scores[optimizationType] * weights[optimizationType];
    }

    return Math.round(totalScore);
  }

  /**
   * Prioritize optimizations by impact/effort ratio
   */
  private prioritizeOptimizations(optimizations: Optimization[]): Optimization[] {
    const impactScore = (impact: string): number => {
      switch (impact) {
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
      }
    };

    const effortScore = (effort: string): number => {
      switch (effort) {
        case 'low': return 3;
        case 'medium': return 2;
        case 'high': return 1;
        default: return 0;
      }
    };

    return [...optimizations].sort((a, b) => {
      const scoreA = impactScore(a.impact) * effortScore(a.effort);
      const scoreB = impactScore(b.impact) * effortScore(b.effort);
      return scoreB - scoreA;
    });
  }

  /**
   * Remove duplicate optimizations
   */
  private deduplicateOptimizations(optimizations: Optimization[]): Optimization[] {
    const seen = new Set<string>();
    const unique: Optimization[] = [];

    for (const opt of optimizations) {
      const key = `${opt.type}-${opt.affectedNodes.sort().join(',')}-${opt.action.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(opt);
      }
    }

    return unique;
  }
}
