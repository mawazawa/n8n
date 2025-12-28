/**
 * Similarity Finder
 * Finds similar workflows using vector embeddings and structural analysis
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { SimilarWorkflow, SimilarityMetrics } from './types.js';

export class SimilarityFinder {
  /**
   * Find similar workflows
   * @param workflow - The workflow to compare
   * @param k - Number of similar workflows to return
   * @param candidates - Pool of workflows to search
   */
  async findSimilar(
    workflow: WorkflowDefinition,
    k: number,
    candidates: WorkflowDefinition[],
  ): Promise<SimilarWorkflow[]> {
    const similarities: Array<{
      workflow: WorkflowDefinition;
      metrics: SimilarityMetrics;
    }> = [];

    for (const candidate of candidates) {
      // Skip self-comparison
      if (candidate.id === workflow.id) continue;

      const metrics = await this.calculateSimilarity(workflow, candidate);
      similarities.push({ workflow: candidate, metrics });
    }

    // Sort by overall similarity
    similarities.sort((a, b) => b.metrics.overall - a.metrics.overall);

    // Take top k and convert to SimilarWorkflow format
    const topK = similarities.slice(0, k);

    return Promise.all(
      topK.map(async (item) => {
        const similarWorkflow: SimilarWorkflow = {
          workflow: item.workflow,
          similarity: item.metrics.overall,
          matchedFeatures: this.identifyMatchedFeatures(workflow, item.workflow),
          differences: this.identifyDifferences(workflow, item.workflow),
          metrics: await this.getWorkflowMetrics(item.workflow),
        };
        return similarWorkflow;
      }),
    );
  }

  /**
   * Calculate similarity metrics between two workflows
   */
  private async calculateSimilarity(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): Promise<SimilarityMetrics> {
    const structural = this.calculateStructuralSimilarity(workflow1, workflow2);
    const functional = this.calculateFunctionalSimilarity(workflow1, workflow2);
    const semantic = await this.calculateSemanticSimilarity(workflow1, workflow2);

    // Weighted average
    const overall = structural * 0.3 + functional * 0.4 + semantic * 0.3;

    return {
      structural,
      functional,
      semantic,
      overall,
    };
  }

  /**
   * Calculate structural similarity (graph structure)
   */
  private calculateStructuralSimilarity(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): number {
    let score = 0;

    // Node count similarity
    const nodeCountDiff = Math.abs(workflow1.nodes.length - workflow2.nodes.length);
    const maxNodes = Math.max(workflow1.nodes.length, workflow2.nodes.length);
    const nodeCountScore = maxNodes > 0 ? (1 - nodeCountDiff / maxNodes) * 100 : 0;
    score += nodeCountScore * 0.3;

    // Connection count similarity
    const conn1Count = this.countConnections(workflow1);
    const conn2Count = this.countConnections(workflow2);
    const connDiff = Math.abs(conn1Count - conn2Count);
    const maxConn = Math.max(conn1Count, conn2Count);
    const connScore = maxConn > 0 ? (1 - connDiff / maxConn) * 100 : 0;
    score += connScore * 0.3;

    // Graph shape similarity (branching factor, depth)
    const shape1 = this.analyzeGraphShape(workflow1);
    const shape2 = this.analyzeGraphShape(workflow2);
    const shapeScore = this.compareGraphShapes(shape1, shape2);
    score += shapeScore * 0.4;

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate functional similarity (node types, operations)
   */
  private calculateFunctionalSimilarity(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): number {
    let score = 0;

    // Node type overlap
    const types1 = new Set(workflow1.nodes.map((n) => n.type));
    const types2 = new Set(workflow2.nodes.map((n) => n.type));
    const intersection = new Set([...types1].filter((t) => types2.has(t)));
    const union = new Set([...types1, ...types2]);
    const jaccardScore = union.size > 0 ? (intersection.size / union.size) * 100 : 0;
    score += jaccardScore * 0.5;

    // Operation pattern similarity
    const patterns1 = this.extractOperationPatterns(workflow1);
    const patterns2 = this.extractOperationPatterns(workflow2);
    const patternScore = this.comparePatterns(patterns1, patterns2);
    score += patternScore * 0.3;

    // Settings similarity
    const settingsScore = this.compareSettings(
      workflow1.settings || {},
      workflow2.settings || {},
    );
    score += settingsScore * 0.2;

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate semantic similarity (purpose, naming, descriptions)
   */
  private async calculateSemanticSimilarity(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): Promise<number> {
    let score = 0;

    // Name similarity (simple string comparison)
    const nameScore = this.compareStrings(workflow1.name, workflow2.name);
    score += nameScore * 0.3;

    // Tag similarity
    const tags1 = new Set((workflow1.tags || []).map((t) => t.name));
    const tags2 = new Set((workflow2.tags || []).map((t) => t.name));
    const tagIntersection = new Set([...tags1].filter((t) => tags2.has(t)));
    const tagUnion = new Set([...tags1, ...tags2]);
    const tagScore = tagUnion.size > 0 ? (tagIntersection.size / tagUnion.size) * 100 : 0;
    score += tagScore * 0.4;

    // Node name patterns
    const nodeNames1 = workflow1.nodes.map((n) => n.name).join(' ');
    const nodeNames2 = workflow2.nodes.map((n) => n.name).join(' ');
    const nodeNameScore = this.compareStrings(nodeNames1, nodeNames2);
    score += nodeNameScore * 0.3;

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Identify matched features between workflows
   */
  private identifyMatchedFeatures(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): string[] {
    const features: string[] = [];

    // Common node types
    const types1 = new Set(workflow1.nodes.map((n) => n.type));
    const types2 = new Set(workflow2.nodes.map((n) => n.type));
    const commonTypes = [...types1].filter((t) => types2.has(t));
    if (commonTypes.length > 0) {
      features.push(`Common node types: ${commonTypes.slice(0, 3).join(', ')}`);
    }

    // Similar size
    const sizeDiff = Math.abs(workflow1.nodes.length - workflow2.nodes.length);
    if (sizeDiff <= 3) {
      features.push(`Similar workflow size (~${workflow1.nodes.length} nodes)`);
    }

    // Common tags
    const tags1 = new Set((workflow1.tags || []).map((t) => t.name));
    const tags2 = new Set((workflow2.tags || []).map((t) => t.name));
    const commonTags = [...tags1].filter((t) => tags2.has(t));
    if (commonTags.length > 0) {
      features.push(`Common tags: ${commonTags.join(', ')}`);
    }

    // Similar patterns
    const hasTrigger1 = workflow1.nodes.some((n) => n.type.includes('Trigger'));
    const hasTrigger2 = workflow2.nodes.some((n) => n.type.includes('Trigger'));
    if (hasTrigger1 && hasTrigger2) {
      features.push('Both use triggers');
    }

    const hasWebhook1 = workflow1.nodes.some((n) => n.type.includes('Webhook'));
    const hasWebhook2 = workflow2.nodes.some((n) => n.type.includes('Webhook'));
    if (hasWebhook1 && hasWebhook2) {
      features.push('Both use webhooks');
    }

    const hasConditional1 = workflow1.nodes.some(
      (n) => n.type.includes('If') || n.type.includes('Switch'),
    );
    const hasConditional2 = workflow2.nodes.some(
      (n) => n.type.includes('If') || n.type.includes('Switch'),
    );
    if (hasConditional1 && hasConditional2) {
      features.push('Both use conditional logic');
    }

    return features;
  }

  /**
   * Identify differences between workflows
   */
  private identifyDifferences(
    workflow1: WorkflowDefinition,
    workflow2: WorkflowDefinition,
  ): string[] {
    const differences: string[] = [];

    // Size difference
    const sizeDiff = Math.abs(workflow1.nodes.length - workflow2.nodes.length);
    if (sizeDiff > 3) {
      differences.push(
        `Size: ${workflow1.nodes.length} vs ${workflow2.nodes.length} nodes`,
      );
    }

    // Unique node types
    const types1 = new Set(workflow1.nodes.map((n) => n.type));
    const types2 = new Set(workflow2.nodes.map((n) => n.type));
    const uniqueTo1 = [...types1].filter((t) => !types2.has(t));
    const uniqueTo2 = [...types2].filter((t) => !types1.has(t));

    if (uniqueTo1.length > 0) {
      differences.push(`Unique to first: ${uniqueTo1.slice(0, 2).join(', ')}`);
    }
    if (uniqueTo2.length > 0) {
      differences.push(`Unique to second: ${uniqueTo2.slice(0, 2).join(', ')}`);
    }

    // Active status
    if (workflow1.active !== workflow2.active) {
      differences.push(
        `Active status: ${workflow1.active ? 'active' : 'inactive'} vs ${workflow2.active ? 'active' : 'inactive'}`,
      );
    }

    return differences;
  }

  /**
   * Get workflow metrics (mock implementation - would integrate with analytics)
   */
  private async getWorkflowMetrics(
    workflow: WorkflowDefinition,
  ): Promise<SimilarWorkflow['metrics']> {
    // Mock metrics - in production, this would query actual analytics data
    return {
      avgExecutionTime: 1000 + Math.random() * 5000,
      successRate: 85 + Math.random() * 15,
      cost: 10 + Math.random() * 90,
    };
  }

  // Helper methods

  private countConnections(workflow: WorkflowDefinition): number {
    let count = 0;
    for (const source of Object.values(workflow.connections)) {
      for (const connType of Object.values(source)) {
        for (const connArray of connType) {
          count += connArray.length;
        }
      }
    }
    return count;
  }

  private analyzeGraphShape(workflow: WorkflowDefinition): {
    depth: number;
    branchingFactor: number;
    parallelBranches: number;
  } {
    const depth = this.calculateMaxDepth(workflow);
    const branchingFactor = this.calculateAvgBranchingFactor(workflow);
    const parallelBranches = this.countParallelBranches(workflow);

    return { depth, branchingFactor, parallelBranches };
  }

  private calculateMaxDepth(workflow: WorkflowDefinition): number {
    const visited = new Set<string>();
    let maxDepth = 0;

    const dfs = (nodeId: string, depth: number): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      maxDepth = Math.max(maxDepth, depth);

      const connections = workflow.connections[nodeId];
      if (!connections) return;

      for (const connType of Object.values(connections)) {
        for (const connArray of connType) {
          for (const conn of connArray) {
            dfs(conn.node, depth + 1);
          }
        }
      }
    };

    // Start from nodes with no inputs (triggers, webhooks)
    const startNodes = workflow.nodes.filter((node) => {
      return !Object.values(workflow.connections).some((conns) =>
        Object.values(conns).some((connType) =>
          connType.some((connArray) => connArray.some((c) => c.node === node.id)),
        ),
      );
    });

    for (const node of startNodes) {
      dfs(node.id, 1);
    }

    return maxDepth;
  }

  private calculateAvgBranchingFactor(workflow: WorkflowDefinition): number {
    let totalOutputs = 0;
    let nodesWithOutputs = 0;

    for (const [, connections] of Object.entries(workflow.connections)) {
      const outputs = Object.values(connections)
        .flat()
        .flat()
        .length;
      if (outputs > 0) {
        totalOutputs += outputs;
        nodesWithOutputs++;
      }
    }

    return nodesWithOutputs > 0 ? totalOutputs / nodesWithOutputs : 0;
  }

  private countParallelBranches(workflow: WorkflowDefinition): number {
    let maxParallel = 0;

    for (const connections of Object.values(workflow.connections)) {
      for (const connType of Object.values(connections)) {
        const parallelCount = connType.length;
        maxParallel = Math.max(maxParallel, parallelCount);
      }
    }

    return maxParallel;
  }

  private compareGraphShapes(
    shape1: ReturnType<typeof this.analyzeGraphShape>,
    shape2: ReturnType<typeof this.analyzeGraphShape>,
  ): number {
    const depthDiff = Math.abs(shape1.depth - shape2.depth);
    const maxDepth = Math.max(shape1.depth, shape2.depth);
    const depthScore = maxDepth > 0 ? (1 - depthDiff / maxDepth) * 100 : 100;

    const branchDiff = Math.abs(shape1.branchingFactor - shape2.branchingFactor);
    const maxBranch = Math.max(shape1.branchingFactor, shape2.branchingFactor);
    const branchScore = maxBranch > 0 ? (1 - branchDiff / maxBranch) * 100 : 100;

    const parallelDiff = Math.abs(shape1.parallelBranches - shape2.parallelBranches);
    const maxParallel = Math.max(shape1.parallelBranches, shape2.parallelBranches);
    const parallelScore = maxParallel > 0 ? (1 - parallelDiff / maxParallel) * 100 : 100;

    return (depthScore + branchScore + parallelScore) / 3;
  }

  private extractOperationPatterns(workflow: WorkflowDefinition): string[] {
    const patterns: string[] = [];

    // Extract common operation sequences
    for (const node of workflow.nodes) {
      const pattern = this.getNodePattern(node.type);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private getNodePattern(nodeType: string): string | undefined {
    if (nodeType.includes('Http')) return 'http';
    if (nodeType.includes('Database') || nodeType.includes('Postgres') || nodeType.includes('MySQL'))
      return 'database';
    if (nodeType.includes('If') || nodeType.includes('Switch')) return 'conditional';
    if (nodeType.includes('Code') || nodeType.includes('Function')) return 'transform';
    if (nodeType.includes('Webhook') || nodeType.includes('Trigger')) return 'trigger';
    return undefined;
  }

  private comparePatterns(patterns1: string[], patterns2: string[]): number {
    const set1 = new Set(patterns1);
    const set2 = new Set(patterns2);
    const intersection = new Set([...set1].filter((p) => set2.has(p)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? (intersection.size / union.size) * 100 : 0;
  }

  private compareSettings(
    settings1: Record<string, unknown>,
    settings2: Record<string, unknown>,
  ): number {
    const keys1 = Object.keys(settings1);
    const keys2 = Object.keys(settings2);

    if (keys1.length === 0 && keys2.length === 0) return 100;

    const commonKeys = keys1.filter((k) => keys2.includes(k));
    let matchingValues = 0;

    for (const key of commonKeys) {
      if (settings1[key] === settings2[key]) {
        matchingValues++;
      }
    }

    const allKeys = new Set([...keys1, ...keys2]);
    return allKeys.size > 0 ? (matchingValues / allKeys.size) * 100 : 0;
  }

  private compareStrings(str1: string, str2: string): number {
    // Simple Levenshtein-based similarity
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 100;

    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 100;

    const distance = this.levenshteinDistance(s1, s2);
    return ((maxLen - distance) / maxLen) * 100;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
