/**
 * Complexity Estimator
 * Analyzes and scores workflow complexity
 */

import type { WorkflowBlueprint, ComplexityScore } from './types';

export class ComplexityEstimator {
  /**
   * Estimate overall workflow complexity
   */
  estimate(workflow: WorkflowBlueprint): ComplexityScore {
    const factors = {
      nodeCount: this.calculateNodeCountScore(workflow),
      branchingFactor: this.calculateBranchingScore(workflow),
      loopCount: this.calculateLoopScore(workflow),
      externalCallCount: this.calculateExternalCallScore(workflow),
      credentialCount: this.calculateCredentialScore(workflow),
      conditionalLogicComplexity: this.calculateConditionalComplexity(workflow),
    };

    // Calculate weighted overall score (0-100)
    const overall =
      factors.nodeCount * 0.2 +
      factors.branchingFactor * 0.25 +
      factors.loopCount * 0.15 +
      factors.externalCallCount * 0.2 +
      factors.credentialCount * 0.1 +
      factors.conditionalLogicComplexity * 0.1;

    const rating = this.getRating(overall);
    const bottlenecks = this.identifyBottlenecks(workflow, factors);
    const optimizationSuggestions = this.suggestOptimizations(workflow, factors);

    return {
      overall,
      factors,
      rating,
      bottlenecks,
      optimizationSuggestions,
    };
  }

  /**
   * Suggest simplifications
   */
  suggestSimplifications(workflow: WorkflowBlueprint): string[] {
    const suggestions: string[] = [];

    // Too many nodes
    if (workflow.nodes.length > 15) {
      suggestions.push('Consider breaking into multiple sub-workflows');
    }

    // Too many branches
    const branches = this.countBranches(workflow);
    if (branches > 5) {
      suggestions.push('Simplify branching logic or use Switch node instead of multiple IFs');
    }

    // Redundant transformations
    const transformNodes = workflow.nodes.filter((n) =>
      n.type.includes('set') || n.type.includes('code'),
    );
    if (transformNodes.length > 4) {
      suggestions.push('Combine multiple Set/Code nodes into single transformation');
    }

    // Missing error handling
    const hasErrorHandling = workflow.nodes.some((n) => n.type.includes('error'));
    if (!hasErrorHandling && workflow.nodes.length > 5) {
      suggestions.push('Add error handling for better reliability');
    }

    return suggestions;
  }

  /**
   * Warn on high complexity
   */
  warnOnHighComplexity(score: ComplexityScore): string[] {
    const warnings: string[] = [];

    if (score.overall > 80) {
      warnings.push('Very high complexity - workflow may be difficult to maintain');
    }

    if (score.factors.branchingFactor > 70) {
      warnings.push('Excessive branching detected - consider simplifying logic');
    }

    if (score.factors.loopCount > 50) {
      warnings.push('Multiple loops detected - may impact performance');
    }

    if (score.factors.externalCallCount > 60) {
      warnings.push('Many external API calls - consider caching or batching');
    }

    return warnings;
  }

  // ============================================
  // Private Methods
  // ============================================

  private calculateNodeCountScore(workflow: WorkflowBlueprint): number {
    const count = workflow.nodes.length;

    // Score: 0-100 based on node count
    if (count <= 3) return 10;
    if (count <= 5) return 25;
    if (count <= 10) return 50;
    if (count <= 15) return 75;
    return 100;
  }

  private calculateBranchingScore(workflow: WorkflowBlueprint): number {
    const branches = this.countBranches(workflow);

    // Score based on branching complexity
    if (branches === 0) return 0;
    if (branches <= 2) return 30;
    if (branches <= 5) return 60;
    return 100;
  }

  private calculateLoopScore(workflow: WorkflowBlueprint): number {
    const loops = this.detectLoops(workflow);

    // Loops add significant complexity
    if (loops === 0) return 0;
    if (loops === 1) return 50;
    return 100;
  }

  private calculateExternalCallScore(workflow: WorkflowBlueprint): number {
    const externalCalls = workflow.nodes.filter(
      (n) =>
        n.type.includes('http') ||
        n.type.includes('api') ||
        n.type.includes('webhook') ||
        this.isExternalService(n.type),
    ).length;

    if (externalCalls === 0) return 0;
    if (externalCalls <= 2) return 30;
    if (externalCalls <= 5) return 60;
    return 100;
  }

  private calculateCredentialScore(workflow: WorkflowBlueprint): number {
    const credentialTypes = new Set(
      workflow.nodes.flatMap((n) => (n.credentials ? Object.keys(n.credentials) : [])),
    );

    const count = credentialTypes.size;

    if (count === 0) return 0;
    if (count <= 2) return 25;
    if (count <= 4) return 50;
    return 75;
  }

  private calculateConditionalComplexity(workflow: WorkflowBlueprint): number {
    const conditionals = workflow.nodes.filter(
      (n) => n.type.includes('if') || n.type.includes('switch') || n.type.includes('filter'),
    );

    if (conditionals.length === 0) return 0;
    if (conditionals.length <= 2) return 40;
    if (conditionals.length <= 4) return 70;
    return 100;
  }

  private getRating(overall: number): 'simple' | 'moderate' | 'complex' | 'very-complex' {
    if (overall <= 25) return 'simple';
    if (overall <= 50) return 'moderate';
    if (overall <= 75) return 'complex';
    return 'very-complex';
  }

  private identifyBottlenecks(
    workflow: WorkflowBlueprint,
    factors: ComplexityScore['factors'],
  ): string[] {
    const bottlenecks: string[] = [];

    // Identify nodes that might be bottlenecks
    workflow.nodes.forEach((node) => {
      // External API calls are potential bottlenecks
      if (node.type.includes('http') || this.isExternalService(node.type)) {
        bottlenecks.push(`External call in node: ${node.name}`);
      }

      // Code nodes might be slow
      if (node.type.includes('code')) {
        bottlenecks.push(`Custom code execution in: ${node.name}`);
      }

      // Database queries
      if (node.type.includes('postgres') || node.type.includes('mysql')) {
        bottlenecks.push(`Database query in: ${node.name}`);
      }
    });

    return bottlenecks;
  }

  private suggestOptimizations(
    workflow: WorkflowBlueprint,
    factors: ComplexityScore['factors'],
  ): string[] {
    const suggestions: string[] = [];

    // Optimize external calls
    if (factors.externalCallCount > 60) {
      suggestions.push('Batch multiple API calls or use parallel execution');
      suggestions.push('Add caching for frequently accessed data');
    }

    // Optimize branches
    if (factors.branchingFactor > 60) {
      suggestions.push('Use Switch node instead of nested IF conditions');
      suggestions.push('Consider using Filter node to reduce branching');
    }

    // Optimize loops
    if (factors.loopCount > 0) {
      suggestions.push('Review loop logic for potential optimization');
      suggestions.push('Consider using batch operations instead of loops');
    }

    // General optimizations
    if (factors.nodeCount > 70) {
      suggestions.push('Break workflow into sub-workflows for better modularity');
    }

    return suggestions;
  }

  private countBranches(workflow: WorkflowBlueprint): number {
    // Count nodes with multiple outgoing connections
    const outgoingCounts = new Map<string, number>();

    workflow.connections.forEach((conn) => {
      const count = outgoingCounts.get(conn.source) || 0;
      outgoingCounts.set(conn.source, count + 1);
    });

    let branches = 0;
    outgoingCounts.forEach((count) => {
      if (count > 1) branches++;
    });

    return branches;
  }

  private detectLoops(workflow: WorkflowBlueprint): number {
    // Simple cycle detection using DFS
    const graph = new Map<string, string[]>();

    workflow.nodes.forEach((node) => {
      graph.set(node.id, []);
    });

    workflow.connections.forEach((conn) => {
      const edges = graph.get(conn.source);
      if (edges) {
        edges.push(conn.target);
      }
    });

    let loopCount = 0;
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const detectCycle = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);

      const edges = graph.get(node) || [];
      for (const neighbor of edges) {
        if (!visited.has(neighbor)) {
          if (detectCycle(neighbor)) {
            loopCount++;
            return true;
          }
        } else if (recStack.has(neighbor)) {
          loopCount++;
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    workflow.nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        detectCycle(node.id);
      }
    });

    return loopCount;
  }

  private isExternalService(nodeType: string): boolean {
    const externalServices = [
      'gmail',
      'slack',
      'github',
      'stripe',
      'salesforce',
      'hubspot',
      'sheets',
      'airtable',
      'notion',
      'discord',
    ];

    return externalServices.some((service) => nodeType.toLowerCase().includes(service));
  }
}

/**
 * Convenience function to estimate complexity
 */
export function estimateComplexity(workflow: WorkflowBlueprint): ComplexityScore {
  const estimator = new ComplexityEstimator();
  return estimator.estimate(workflow);
}
