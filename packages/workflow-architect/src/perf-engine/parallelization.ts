/**
 * Parallelization Advisor
 * Analyzes workflows to identify parallelization opportunities
 */

import { v4 as uuidv4 } from 'uuid';
import { ParallelOpportunity, ProfileResult } from './types';

interface WorkflowDefinition {
  id: string;
  nodes: Array<{
    id: string;
    type: string;
    name: string;
  }>;
  connections: Array<{
    source: string;
    sourceOutput?: string;
    target: string;
    targetInput?: string;
  }>;
}

interface DependencyGraph {
  [nodeId: string]: {
    dependencies: string[];
    dependents: string[];
  };
}

export class ParallelizationAdvisor {
  /**
   * Analyze workflow for parallelization opportunities
   */
  async analyze(
    workflow: WorkflowDefinition,
    profile?: ProfileResult,
  ): Promise<ParallelOpportunity[]> {
    const opportunities: ParallelOpportunity[] = [];

    // Build dependency graph
    const depGraph = this.buildDependencyGraph(workflow);

    // Find independent branches
    const independentBranches = this.findIndependentBranches(workflow, depGraph);

    for (const branches of independentBranches) {
      if (branches.length < 2) continue; // Need at least 2 branches to parallelize

      const opportunity = this.createOpportunity(branches, workflow, depGraph, profile);
      opportunities.push(opportunity);
    }

    // Find parallelizable loops
    const loopOpportunities = this.findParallelizableLoops(workflow, depGraph, profile);
    opportunities.push(...loopOpportunities);

    // Sort by estimated speedup
    opportunities.sort((a, b) => b.estimatedSpeedup - a.estimatedSpeedup);

    return opportunities;
  }

  /**
   * Build dependency graph from workflow
   */
  private buildDependencyGraph(workflow: WorkflowDefinition): DependencyGraph {
    const graph: DependencyGraph = {};

    // Initialize all nodes
    for (const node of workflow.nodes) {
      graph[node.id] = {
        dependencies: [],
        dependents: [],
      };
    }

    // Add edges
    for (const conn of workflow.connections) {
      if (!graph[conn.source] || !graph[conn.target]) continue;

      graph[conn.target].dependencies.push(conn.source);
      graph[conn.source].dependents.push(conn.target);
    }

    return graph;
  }

  /**
   * Find independent branches that can run in parallel
   */
  private findIndependentBranches(
    workflow: WorkflowDefinition,
    depGraph: DependencyGraph,
  ): string[][][] {
    const allBranches: string[][][] = [];
    const visited = new Set<string>();

    // Find all split points (nodes with multiple outputs)
    for (const node of workflow.nodes) {
      const dependents = depGraph[node.id]?.dependents || [];

      if (dependents.length > 1 && !visited.has(node.id)) {
        // This is a split point
        const branches: string[][] = [];

        for (const dependent of dependents) {
          const branch = this.traceBranch(dependent, depGraph, new Set());
          branches.push(branch);
          branch.forEach((n) => visited.add(n));
        }

        if (this.areBranchesIndependent(branches, depGraph)) {
          allBranches.push(branches);
        }
      }
    }

    return allBranches;
  }

  /**
   * Trace a branch from a starting node
   */
  private traceBranch(
    startNode: string,
    depGraph: DependencyGraph,
    visited: Set<string>,
  ): string[] {
    const branch: string[] = [startNode];
    visited.add(startNode);

    const dependents = depGraph[startNode]?.dependents || [];

    // Follow the branch until it splits or merges
    if (dependents.length === 1 && !visited.has(dependents[0])) {
      const nextNode = dependents[0];
      const deps = depGraph[nextNode]?.dependencies || [];

      // If next node only depends on current node, continue branch
      if (deps.length === 1) {
        branch.push(...this.traceBranch(nextNode, depGraph, visited));
      }
    }

    return branch;
  }

  /**
   * Check if branches are truly independent
   */
  private areBranchesIndependent(branches: string[][], depGraph: DependencyGraph): boolean {
    // Check that no branch depends on another
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches.length; j++) {
        if (i === j) continue;

        // Check if branch i depends on any node in branch j
        for (const nodeI of branches[i]) {
          const deps = depGraph[nodeI]?.dependencies || [];
          if (deps.some((dep) => branches[j].includes(dep))) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Create parallelization opportunity
   */
  private createOpportunity(
    branches: string[][],
    workflow: WorkflowDefinition,
    depGraph: DependencyGraph,
    profile?: ProfileResult,
  ): ParallelOpportunity {
    const dependencies = this.extractDependencies(branches, depGraph);
    const estimatedSpeedup = this.estimateSpeedup(branches, profile);
    const complexity = this.assessComplexity(branches, workflow);
    const risks = this.identifyRisks(branches, workflow);

    return {
      id: uuidv4(),
      branchNodes: branches,
      estimatedSpeedup,
      dependencies,
      requiresRefactoring: complexity !== 'low',
      complexity,
      risks,
      metadata: {
        branchCount: branches.length,
        nodeCount: branches.reduce((sum, b) => sum + b.length, 0),
      },
    };
  }

  /**
   * Extract dependencies between branches
   */
  private extractDependencies(
    branches: string[][],
    depGraph: DependencyGraph,
  ): Array<{ from: string; to: string }> {
    const dependencies: Array<{ from: string; to: string }> = [];

    for (const branch of branches) {
      for (const node of branch) {
        const deps = depGraph[node]?.dependencies || [];
        for (const dep of deps) {
          if (!branch.includes(dep)) {
            dependencies.push({ from: dep, to: node });
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Estimate speedup from parallelization
   */
  private estimateSpeedup(branches: string[][], profile?: ProfileResult): number {
    if (!profile) {
      return branches.length * 0.8; // Conservative estimate
    }

    // Calculate total sequential time
    let totalSequentialTime = 0;
    let maxParallelTime = 0;

    for (const branch of branches) {
      let branchTime = 0;

      for (const nodeId of branch) {
        const metric = profile.nodeMetrics.find((m) => m.nodeId === nodeId);
        branchTime += metric?.executionTime || 0;
      }

      totalSequentialTime += branchTime;
      maxParallelTime = Math.max(maxParallelTime, branchTime);
    }

    if (maxParallelTime === 0) {
      return 1;
    }

    // Speedup = sequential time / parallel time
    // Account for overhead (10%)
    return (totalSequentialTime / maxParallelTime) * 0.9;
  }

  /**
   * Assess complexity of parallelization
   */
  private assessComplexity(
    branches: string[][],
    workflow: WorkflowDefinition,
  ): 'low' | 'medium' | 'high' {
    const totalNodes = branches.reduce((sum, b) => sum + b.length, 0);

    // Simple parallelization
    if (branches.length <= 3 && totalNodes <= 10) {
      return 'low';
    }

    // Moderate complexity
    if (branches.length <= 5 && totalNodes <= 20) {
      return 'medium';
    }

    // Complex parallelization
    return 'high';
  }

  /**
   * Identify risks of parallelization
   */
  private identifyRisks(branches: string[][], workflow: WorkflowDefinition): string[] {
    const risks: string[] = [];

    // Check for shared resources
    const nodeTypes = new Set<string>();
    for (const branch of branches) {
      for (const nodeId of branch) {
        const node = workflow.nodes.find((n) => n.id === nodeId);
        if (node) nodeTypes.add(node.type);
      }
    }

    if (
      nodeTypes.has('database') ||
      nodeTypes.has('postgres') ||
      nodeTypes.has('mysql')
    ) {
      risks.push('Parallel database access may cause connection pool exhaustion');
    }

    if (nodeTypes.has('file') || nodeTypes.has('spreadsheet')) {
      risks.push('Parallel file access may cause conflicts');
    }

    // Check for rate-limited APIs
    if (
      nodeTypes.has('http') ||
      nodeTypes.has('webhook') ||
      nodeTypes.has('api')
    ) {
      risks.push('Parallel API calls may hit rate limits');
    }

    // Check for memory-intensive operations
    const totalNodes = branches.reduce((sum, b) => sum + b.length, 0);
    if (totalNodes > 20) {
      risks.push('High parallelism may increase memory usage significantly');
    }

    return risks;
  }

  /**
   * Find loops that can be parallelized
   */
  private findParallelizableLoops(
    workflow: WorkflowDefinition,
    depGraph: DependencyGraph,
    profile?: ProfileResult,
  ): ParallelOpportunity[] {
    const opportunities: ParallelOpportunity[] = [];

    // Find loop nodes (nodes that process arrays)
    for (const node of workflow.nodes) {
      if (this.isLoopNode(node)) {
        const opportunity = this.createLoopOpportunity(node, workflow, depGraph, profile);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      }
    }

    return opportunities;
  }

  /**
   * Check if node is a loop
   */
  private isLoopNode(node: WorkflowDefinition['nodes'][0]): boolean {
    const loopTypes = ['splitinbatches', 'loop', 'foreach'];
    return loopTypes.some((type) => node.type.toLowerCase().includes(type));
  }

  /**
   * Create loop parallelization opportunity
   */
  private createLoopOpportunity(
    loopNode: WorkflowDefinition['nodes'][0],
    workflow: WorkflowDefinition,
    depGraph: DependencyGraph,
    profile?: ProfileResult,
  ): ParallelOpportunity | null {
    const metric = profile?.nodeMetrics.find((m) => m.nodeId === loopNode.id);

    if (!metric || metric.inputItems < 10) {
      return null; // Not worth parallelizing small loops
    }

    // Estimate speedup based on number of iterations
    const estimatedSpeedup = Math.min(metric.inputItems / 10, 8); // Cap at 8x

    return {
      id: uuidv4(),
      branchNodes: [[loopNode.id]],
      estimatedSpeedup,
      dependencies: [],
      requiresRefactoring: true,
      complexity: 'medium',
      risks: [
        'Loop parallelization requires refactoring to process batches in parallel',
        'May require changes to downstream nodes to handle parallel outputs',
      ],
      metadata: {
        loopIterations: metric.inputItems,
        suggestedBatchSize: Math.ceil(metric.inputItems / 10),
      },
    };
  }
}
