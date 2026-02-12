/**
 * Pattern Analyzer
 * Analyzes workflows to detect patterns, anti-patterns, and optimization opportunities
 */

import type { WorkflowDefinition, WorkflowNode } from '../types/workflow.js';
import type { Pattern } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowAnalyzer {
  /**
   * Analyze workflow to detect patterns
   */
  async analyzePatterns(workflow: WorkflowDefinition): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    patterns.push(...this.detectAntiPatterns(workflow));
    patterns.push(...this.detectOptimizationOpportunities(workflow));
    patterns.push(...this.detectBestPractices(workflow));

    return patterns;
  }

  /**
   * Detect common anti-patterns in workflow
   */
  private detectAntiPatterns(workflow: WorkflowDefinition): Pattern[] {
    const antiPatterns: Pattern[] = [];

    // Anti-pattern: No error handling
    const noErrorHandling = this.findNoErrorHandling(workflow);
    if (noErrorHandling.length > 0) {
      antiPatterns.push({
        id: uuidv4(),
        name: 'Missing Error Handling',
        description: 'Workflow lacks error handling nodes, making it vulnerable to failures',
        type: 'anti_pattern',
        occurrences: [
          {
            nodeIds: noErrorHandling,
            confidence: 0.9,
          },
        ],
        recommendation: 'Add error handling nodes or configure error workflows to handle failures gracefully',
        impact: 'high',
      });
    }

    // Anti-pattern: Sequential API calls (should be parallel)
    const sequentialCalls = this.findSequentialApiCalls(workflow);
    if (sequentialCalls.length > 0) {
      antiPatterns.push({
        id: uuidv4(),
        name: 'Sequential API Calls',
        description: 'Independent API calls are executed sequentially instead of in parallel',
        type: 'anti_pattern',
        occurrences: sequentialCalls.map((nodeIds) => ({
          nodeIds,
          confidence: 0.85,
        })),
        recommendation: 'Use parallel execution or Split In Batches node to execute independent calls concurrently',
        impact: 'high',
      });
    }

    // Anti-pattern: Large data processing without pagination
    const noPagination = this.findNoPagination(workflow);
    if (noPagination.length > 0) {
      antiPatterns.push({
        id: uuidv4(),
        name: 'Missing Pagination',
        description: 'Large data sets are processed without pagination, risking memory issues',
        type: 'anti_pattern',
        occurrences: [
          {
            nodeIds: noPagination,
            confidence: 0.8,
          },
        ],
        recommendation: 'Implement pagination using Loop nodes or Split In Batches for large data sets',
        impact: 'medium',
      });
    }

    // Anti-pattern: Credentials hardcoded or exposed
    const exposedCredentials = this.findExposedCredentials(workflow);
    if (exposedCredentials.length > 0) {
      antiPatterns.push({
        id: uuidv4(),
        name: 'Exposed Credentials',
        description: 'Credentials or sensitive data may be exposed in node parameters',
        type: 'anti_pattern',
        occurrences: [
          {
            nodeIds: exposedCredentials,
            confidence: 0.7,
          },
        ],
        recommendation: 'Use n8n credentials system instead of hardcoding sensitive information',
        impact: 'high',
      });
    }

    // Anti-pattern: Deeply nested conditionals
    const deepNesting = this.findDeepNesting(workflow);
    if (deepNesting.length > 0) {
      antiPatterns.push({
        id: uuidv4(),
        name: 'Deeply Nested Logic',
        description: 'Workflow has deeply nested conditional logic, reducing maintainability',
        type: 'anti_pattern',
        occurrences: deepNesting.map((nodeIds) => ({
          nodeIds,
          confidence: 0.75,
        })),
        recommendation: 'Refactor to use Switch nodes or split into sub-workflows for better readability',
        impact: 'medium',
      });
    }

    return antiPatterns;
  }

  /**
   * Detect optimization opportunities
   */
  private detectOptimizationOpportunities(workflow: WorkflowDefinition): Pattern[] {
    const opportunities: Pattern[] = [];

    // Opportunity: Can use caching
    const cachingOpportunities = this.findCachingOpportunities(workflow);
    if (cachingOpportunities.length > 0) {
      opportunities.push({
        id: uuidv4(),
        name: 'Caching Opportunity',
        description: 'Repeated API calls or computations can benefit from caching',
        type: 'optimization_opportunity',
        occurrences: [
          {
            nodeIds: cachingOpportunities,
            confidence: 0.85,
          },
        ],
        recommendation: 'Add caching layer for repeated operations to reduce execution time and costs',
        impact: 'high',
      });
    }

    // Opportunity: Batch processing
    const batchingOpportunities = this.findBatchingOpportunities(workflow);
    if (batchingOpportunities.length > 0) {
      opportunities.push({
        id: uuidv4(),
        name: 'Batching Opportunity',
        description: 'Multiple similar operations can be batched together',
        type: 'optimization_opportunity',
        occurrences: [
          {
            nodeIds: batchingOpportunities,
            confidence: 0.8,
          },
        ],
        recommendation: 'Use batch operations to reduce API calls and improve performance',
        impact: 'high',
      });
    }

    // Opportunity: Data transformation consolidation
    const consolidationOpportunities = this.findConsolidationOpportunities(workflow);
    if (consolidationOpportunities.length > 0) {
      opportunities.push({
        id: uuidv4(),
        name: 'Transformation Consolidation',
        description: 'Multiple sequential data transformations can be consolidated',
        type: 'optimization_opportunity',
        occurrences: consolidationOpportunities.map((nodeIds) => ({
          nodeIds,
          confidence: 0.75,
        })),
        recommendation: 'Combine multiple transformation steps into a single Code node for efficiency',
        impact: 'medium',
      });
    }

    // Opportunity: Parallel execution
    const parallelizationOpportunities = this.findParallelizationOpportunities(workflow);
    if (parallelizationOpportunities.length > 0) {
      opportunities.push({
        id: uuidv4(),
        name: 'Parallelization Opportunity',
        description: 'Independent operations can be executed in parallel',
        type: 'optimization_opportunity',
        occurrences: parallelizationOpportunities.map((nodeIds) => ({
          nodeIds,
          confidence: 0.9,
        })),
        recommendation: 'Use parallel branches to execute independent operations concurrently',
        impact: 'high',
      });
    }

    return opportunities;
  }

  /**
   * Detect best practices being followed
   */
  private detectBestPractices(workflow: WorkflowDefinition): Pattern[] {
    const bestPractices: Pattern[] = [];

    // Best practice: Has error workflow configured
    if (workflow.settings?.errorWorkflow) {
      bestPractices.push({
        id: uuidv4(),
        name: 'Error Workflow Configured',
        description: 'Workflow has a dedicated error workflow for handling failures',
        type: 'best_practice',
        occurrences: [
          {
            nodeIds: [],
            confidence: 1.0,
          },
        ],
        impact: 'high',
      });
    }

    // Best practice: Uses descriptive node names
    const descriptiveNames = workflow.nodes.filter(
      (node) => node.name !== node.type && node.name.length > 5,
    );
    if (descriptiveNames.length / workflow.nodes.length > 0.7) {
      bestPractices.push({
        id: uuidv4(),
        name: 'Descriptive Node Names',
        description: 'Most nodes have descriptive names, improving workflow readability',
        type: 'best_practice',
        occurrences: [
          {
            nodeIds: descriptiveNames.map((n) => n.id),
            confidence: 0.9,
          },
        ],
        impact: 'low',
      });
    }

    // Best practice: Has documentation (notes)
    const documentedNodes = workflow.nodes.filter((node) => node.notes && node.notes.length > 10);
    if (documentedNodes.length > 0) {
      bestPractices.push({
        id: uuidv4(),
        name: 'Workflow Documentation',
        description: 'Workflow includes documentation through node notes',
        type: 'best_practice',
        occurrences: [
          {
            nodeIds: documentedNodes.map((n) => n.id),
            confidence: 0.85,
          },
        ],
        impact: 'medium',
      });
    }

    return bestPractices;
  }

  // Helper methods for pattern detection

  private findNoErrorHandling(workflow: WorkflowDefinition): string[] {
    const hasErrorHandling = workflow.nodes.some(
      (node) =>
        node.type.includes('Error') ||
        node.type === 'n8n-nodes-base.if' ||
        workflow.settings?.errorWorkflow,
    );

    if (hasErrorHandling) {
      return [];
    }

    // Return nodes that could fail (HTTP, API calls, etc.)
    return workflow.nodes
      .filter(
        (node) =>
          node.type.includes('Http') ||
          node.type.includes('Api') ||
          node.type.includes('Webhook') ||
          node.type.includes('Database'),
      )
      .map((node) => node.id);
  }

  private findSequentialApiCalls(workflow: WorkflowDefinition): string[][] {
    const sequences: string[][] = [];
    const apiNodes = workflow.nodes.filter(
      (node) =>
        node.type.includes('Http') || node.type.includes('Api') || node.type.includes('Request'),
    );

    if (apiNodes.length < 2) {
      return sequences;
    }

    // Find sequential API calls that could be parallel
    for (let i = 0; i < apiNodes.length - 1; i++) {
      const current = apiNodes[i];
      const next = apiNodes[i + 1];

      // Check if nodes are connected sequentially
      const isSequential = this.areNodesSequential(current.id, next.id, workflow);
      const areIndependent = !this.areNodesDependent(current.id, next.id, workflow);

      if (isSequential && areIndependent) {
        sequences.push([current.id, next.id]);
      }
    }

    return sequences;
  }

  private findNoPagination(workflow: WorkflowDefinition): string[] {
    const nodes = workflow.nodes.filter(
      (node) =>
        (node.type.includes('Http') || node.type.includes('Database')) &&
        !this.hasPagination(node) &&
        !this.hasLimit(node),
    );

    return nodes.map((n) => n.id);
  }

  private findExposedCredentials(workflow: WorkflowDefinition): string[] {
    const exposed: string[] = [];

    for (const node of workflow.nodes) {
      const params = JSON.stringify(node.parameters);
      // Check for common patterns of exposed credentials
      if (
        params.includes('password') ||
        params.includes('apiKey') ||
        params.includes('secret') ||
        params.includes('token')
      ) {
        // If not using credentials object
        if (!node.credentials) {
          exposed.push(node.id);
        }
      }
    }

    return exposed;
  }

  private findDeepNesting(workflow: WorkflowDefinition): string[][] {
    const nesting: string[][] = [];
    const ifNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.if');

    // Find chains of IF nodes (nesting depth > 3)
    for (const ifNode of ifNodes) {
      const chain = this.findIfChain(ifNode.id, workflow);
      if (chain.length > 3) {
        nesting.push(chain);
      }
    }

    return nesting;
  }

  private findCachingOpportunities(workflow: WorkflowDefinition): string[] {
    // Find nodes that make repeated identical calls
    const apiNodes = workflow.nodes.filter((node) => node.type.includes('Http'));
    const opportunities: string[] = [];

    // Simple heuristic: same node type with similar parameters
    const nodeGroups = new Map<string, WorkflowNode[]>();
    for (const node of apiNodes) {
      const key = `${node.type}:${JSON.stringify(node.parameters)}`;
      if (!nodeGroups.has(key)) {
        nodeGroups.set(key, []);
      }
      nodeGroups.get(key)!.push(node);
    }

    for (const [, nodes] of nodeGroups) {
      if (nodes.length > 1) {
        opportunities.push(...nodes.map((n) => n.id));
      }
    }

    return opportunities;
  }

  private findBatchingOpportunities(workflow: WorkflowDefinition): string[] {
    // Find loops that could use batch operations
    const loopNodes = workflow.nodes.filter(
      (node) =>
        node.type === 'n8n-nodes-base.splitInBatches' || node.type.toLowerCase().includes('loop'),
    );

    const opportunities: string[] = [];
    for (const loopNode of loopNodes) {
      const descendants = this.findDescendants(loopNode.id, workflow);
      const hasApiCalls = descendants.some((id) => {
        const node = workflow.nodes.find((n) => n.id === id);
        return node && node.type.includes('Http');
      });

      if (hasApiCalls) {
        opportunities.push(loopNode.id);
      }
    }

    return opportunities;
  }

  private findConsolidationOpportunities(workflow: WorkflowDefinition): string[][] {
    const opportunities: string[][] = [];
    const transformNodes = workflow.nodes.filter(
      (node) =>
        node.type === 'n8n-nodes-base.set' ||
        node.type === 'n8n-nodes-base.function' ||
        node.type === 'n8n-nodes-base.code',
    );

    // Find sequences of 3+ transform nodes
    for (let i = 0; i < transformNodes.length - 2; i++) {
      const sequence = [transformNodes[i].id];
      let current = transformNodes[i];

      for (let j = i + 1; j < transformNodes.length; j++) {
        if (this.areNodesSequential(current.id, transformNodes[j].id, workflow)) {
          sequence.push(transformNodes[j].id);
          current = transformNodes[j];
        } else {
          break;
        }
      }

      if (sequence.length >= 3) {
        opportunities.push(sequence);
      }
    }

    return opportunities;
  }

  private findParallelizationOpportunities(workflow: WorkflowDefinition): string[][] {
    const opportunities: string[][] = [];

    // Find nodes that have multiple independent paths
    for (const node of workflow.nodes) {
      const children = this.findDirectChildren(node.id, workflow);
      if (children.length >= 2) {
        // Check if children are independent
        let allIndependent = true;
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            if (this.areNodesDependent(children[i], children[j], workflow)) {
              allIndependent = false;
              break;
            }
          }
          if (!allIndependent) break;
        }

        if (allIndependent && children.length >= 2) {
          opportunities.push(children);
        }
      }
    }

    return opportunities;
  }

  // Utility methods

  private areNodesSequential(nodeId1: string, nodeId2: string, workflow: WorkflowDefinition): boolean {
    const connections = workflow.connections[nodeId1];
    if (!connections) return false;

    for (const connType of Object.values(connections)) {
      for (const connArray of connType) {
        for (const conn of connArray) {
          if (conn.node === nodeId2) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private areNodesDependent(nodeId1: string, nodeId2: string, workflow: WorkflowDefinition): boolean {
    // Check if nodeId2 depends on nodeId1 (data flow)
    const descendants = this.findDescendants(nodeId1, workflow);
    return descendants.includes(nodeId2);
  }

  private findDescendants(nodeId: string, workflow: WorkflowDefinition): string[] {
    const descendants: string[] = [];
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const connections = workflow.connections[current];
      if (!connections) continue;

      for (const connType of Object.values(connections)) {
        for (const connArray of connType) {
          for (const conn of connArray) {
            if (!visited.has(conn.node)) {
              descendants.push(conn.node);
              queue.push(conn.node);
            }
          }
        }
      }
    }

    return descendants;
  }

  private findDirectChildren(nodeId: string, workflow: WorkflowDefinition): string[] {
    const children: string[] = [];
    const connections = workflow.connections[nodeId];

    if (!connections) return children;

    for (const connType of Object.values(connections)) {
      for (const connArray of connType) {
        for (const conn of connArray) {
          if (!children.includes(conn.node)) {
            children.push(conn.node);
          }
        }
      }
    }

    return children;
  }

  private findIfChain(ifNodeId: string, workflow: WorkflowDefinition): string[] {
    const chain = [ifNodeId];
    let current = ifNodeId;

    while (true) {
      const children = this.findDirectChildren(current, workflow);
      const nextIf = children.find((childId) => {
        const node = workflow.nodes.find((n) => n.id === childId);
        return node && node.type === 'n8n-nodes-base.if';
      });

      if (!nextIf) break;
      chain.push(nextIf);
      current = nextIf;
    }

    return chain;
  }

  private hasPagination(node: WorkflowNode): boolean {
    const params = JSON.stringify(node.parameters);
    return (
      params.includes('pagination') ||
      params.includes('nextPageToken') ||
      params.includes('cursor') ||
      params.includes('offset')
    );
  }

  private hasLimit(node: WorkflowNode): boolean {
    const params = JSON.stringify(node.parameters);
    return params.includes('limit') || params.includes('maxResults');
  }
}
