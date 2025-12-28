/**
 * Performance Optimization Detectors
 * Detects performance-related issues in workflows
 */

import type { WorkflowDefinition, WorkflowNode } from '../../types/workflow.js';
import type { Optimization, OptimizationContext } from '../types.js';
import { randomUUID } from 'crypto';

/**
 * Detect slow node patterns that could be optimized
 */
export async function detectSlowPatterns(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Known slow patterns
  const slowPatterns = [
    {
      type: 'n8n-nodes-base.code',
      check: (node: WorkflowNode) => {
        const code = (node.parameters.jsCode as string) ?? '';
        // Check for synchronous loops or heavy operations
        return code.includes('for (') || code.includes('while (');
      },
      suggestion: 'Consider using async/await or batch processing',
    },
    {
      type: 'n8n-nodes-base.function',
      check: (node: WorkflowNode) => {
        const code = (node.parameters.functionCode as string) ?? '';
        return code.length > 1000; // Large code blocks
      },
      suggestion: 'Consider breaking down into smaller nodes',
    },
    {
      type: 'n8n-nodes-base.set',
      check: (node: WorkflowNode) => {
        const values = node.parameters.values as Record<string, unknown>;
        return values && Object.keys(values).length > 20;
      },
      suggestion: 'Large set operations can be slow, consider chunking',
    },
  ];

  for (const node of nodes) {
    if (node.disabled) continue;

    for (const pattern of slowPatterns) {
      if (node.type === pattern.type && pattern.check(node)) {
        optimizations.push({
          id: randomUUID(),
          type: 'performance',
          title: `Optimize potentially slow ${node.name}`,
          description: `This node may cause performance issues. ${pattern.suggestion}.`,
          impact: 'medium',
          effort: 'medium',
          affectedNodes: [node.id],
          estimatedImprovement: {
            metric: 'execution_time',
            currentValue: 100,
            projectedValue: 50,
            unit: 'percent',
          },
          action: {
            type: 'modify_node',
            params: {
              nodeId: node.id,
              suggestion: pattern.suggestion,
            },
            autoApplicable: false,
          },
        });
      }
    }
  }

  return optimizations;
}

/**
 * Detect unnecessary data transformations
 */
export async function detectUnnecessaryTransformations(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;
  const connections = workflow.connections;

  // Find chains of Set/Function/Code nodes
  for (const node of nodes) {
    if (node.disabled) continue;

    if (isTransformationNode(node)) {
      const downstreamTransformations = getDownstreamTransformations(node, workflow);

      if (downstreamTransformations.length > 2) {
        const affectedNodes = [node.id, ...downstreamTransformations.map(n => n.id)];

        optimizations.push({
          id: randomUUID(),
          type: 'performance',
          title: `Consolidate ${downstreamTransformations.length + 1} transformation nodes`,
          description: `Found a chain of ${downstreamTransformations.length + 1} consecutive transformation nodes. Consider combining them into a single operation.`,
          impact: 'medium',
          effort: 'low',
          affectedNodes,
          estimatedImprovement: {
            metric: 'execution_time',
            currentValue: downstreamTransformations.length + 1,
            projectedValue: 1,
            unit: 'nodes',
          },
          action: {
            type: 'modify_node',
            params: {
              consolidateNodes: affectedNodes,
            },
            autoApplicable: false,
          },
        });
      }
    }
  }

  return optimizations;
}

/**
 * Detect suboptimal node ordering
 */
export async function detectSuboptimalOrdering(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;
  const connections = workflow.connections;

  // Find filter operations that come after expensive operations
  for (const node of nodes) {
    if (node.disabled) continue;

    if (isExpensiveOperation(node)) {
      const upstreamNodes = getUpstreamNodes(node, workflow);
      const hasUpstreamFilter = upstreamNodes.some(isFilterNode);
      const downstreamNodes = getDownstreamNodes(node, workflow, 1);
      const hasDownstreamFilter = downstreamNodes.some(isFilterNode);

      if (hasDownstreamFilter && !hasUpstreamFilter) {
        const filterNode = downstreamNodes.find(isFilterNode);

        if (filterNode) {
          optimizations.push({
            id: randomUUID(),
            type: 'performance',
            title: `Move filter before expensive operation`,
            description: `Filter operation "${filterNode.name}" comes after expensive operation "${node.name}". Moving the filter earlier can improve performance.`,
            impact: 'high',
            effort: 'low',
            affectedNodes: [node.id, filterNode.id],
            estimatedImprovement: {
              metric: 'execution_time',
              currentValue: 100,
              projectedValue: 30,
              unit: 'percent',
            },
            action: {
              type: 'reorder',
              params: {
                moveNode: filterNode.id,
                before: node.id,
              },
              autoApplicable: true,
            },
          });
        }
      }
    }
  }

  return optimizations;
}

/**
 * Detect missing pagination in API calls
 */
export async function detectMissingPagination(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find HTTP/API nodes without pagination
  const apiNodes = nodes.filter(node =>
    (node.type === 'n8n-nodes-base.httpRequest' ||
     node.type.includes('http')) &&
    !node.disabled
  );

  for (const node of apiNodes) {
    const hasPagination = checkPaginationConfig(node);
    const isListEndpoint = checkIfListEndpoint(node);

    if (isListEndpoint && !hasPagination) {
      optimizations.push({
        id: randomUUID(),
        type: 'performance',
        title: `Add pagination to ${node.name}`,
        description: `This API call appears to fetch a list but doesn't use pagination. This can cause timeouts and memory issues with large datasets.`,
        impact: 'high',
        effort: 'medium',
        affectedNodes: [node.id],
        estimatedImprovement: {
          metric: 'memory_usage',
          currentValue: 100,
          projectedValue: 20,
          unit: 'percent',
        },
        action: {
          type: 'modify_node',
          params: {
            nodeId: node.id,
            addPagination: true,
            paginationType: 'offset',
          },
          autoApplicable: false,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect heavy payload transfers between nodes
 */
export async function detectHeavyPayloads(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;
  const connections = workflow.connections;

  // Find nodes that likely produce large outputs
  for (const node of nodes) {
    if (node.disabled) continue;

    const producesLargeOutput = checkLargeOutputPotential(node);

    if (producesLargeOutput) {
      const downstreamNodes = getDownstreamNodes(node, workflow, 1);

      // Check if downstream nodes actually need all the data
      const unnecessaryDataTransfer = downstreamNodes.some(downstream => {
        return onlyNeedsSubsetOfData(downstream);
      });

      if (unnecessaryDataTransfer) {
        optimizations.push({
          id: randomUUID(),
          type: 'performance',
          title: `Reduce payload size from ${node.name}`,
          description: `This node produces large outputs, but downstream nodes only use a subset. Consider filtering or selecting only needed fields.`,
          impact: 'medium',
          effort: 'low',
          affectedNodes: [node.id],
          estimatedImprovement: {
            metric: 'data_transfer',
            currentValue: 100,
            projectedValue: 20,
            unit: 'percent',
          },
          action: {
            type: 'add_node',
            params: {
              nodeType: 'n8n-nodes-base.set',
              insertAfter: node.id,
              selectFields: true,
            },
            autoApplicable: false,
          },
        });
      }
    }
  }

  return optimizations;
}

// Helper functions

function isTransformationNode(node: WorkflowNode): boolean {
  return (
    node.type === 'n8n-nodes-base.set' ||
    node.type === 'n8n-nodes-base.function' ||
    node.type === 'n8n-nodes-base.code' ||
    node.type === 'n8n-nodes-base.functionItem'
  );
}

function getDownstreamTransformations(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
): WorkflowNode[] {
  const transformations: WorkflowNode[] = [];
  const connections = workflow.connections;

  const traverse = (currentNode: WorkflowNode) => {
    const nodeConnections = connections[currentNode.id];
    if (!nodeConnections?.main) return;

    for (const connArray of nodeConnections.main) {
      for (const conn of connArray) {
        const nextNode = workflow.nodes.find(n => n.id === conn.node);
        if (nextNode && isTransformationNode(nextNode)) {
          transformations.push(nextNode);
          traverse(nextNode);
        }
      }
    }
  };

  traverse(node);
  return transformations;
}

function isExpensiveOperation(node: WorkflowNode): boolean {
  const expensiveTypes = [
    'http', 'webhook', 'function', 'code',
    'slack', 'gmail', 'github', 'openai',
  ];

  return expensiveTypes.some(type => node.type.toLowerCase().includes(type));
}

function isFilterNode(node: WorkflowNode): boolean {
  return (
    node.type === 'n8n-nodes-base.filter' ||
    node.type === 'n8n-nodes-base.if' ||
    node.type === 'n8n-nodes-base.switch'
  );
}

function getUpstreamNodes(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
): WorkflowNode[] {
  const upstream: WorkflowNode[] = [];
  const connections = workflow.connections;

  for (const sourceId in connections) {
    const sourceConnections = connections[sourceId];
    for (const type in sourceConnections) {
      for (const connArray of sourceConnections[type]) {
        for (const conn of connArray) {
          if (conn.node === node.id) {
            const sourceNode = workflow.nodes.find(n => n.id === sourceId);
            if (sourceNode) {
              upstream.push(sourceNode);
            }
          }
        }
      }
    }
  }

  return upstream;
}

function getDownstreamNodes(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
  depth: number = 1,
): WorkflowNode[] {
  const downstream: WorkflowNode[] = [];
  const connections = workflow.connections;
  const visited = new Set<string>();

  const traverse = (nodeId: string, currentDepth: number) => {
    if (currentDepth > depth || visited.has(nodeId)) return;
    visited.add(nodeId);

    const nodeConnections = connections[nodeId];
    if (!nodeConnections) return;

    for (const type in nodeConnections) {
      for (const connArray of nodeConnections[type]) {
        for (const conn of connArray) {
          const nextNode = workflow.nodes.find(n => n.id === conn.node);
          if (nextNode) {
            downstream.push(nextNode);
            traverse(conn.node, currentDepth + 1);
          }
        }
      }
    }
  };

  traverse(node.id, 0);
  return downstream;
}

function checkPaginationConfig(node: WorkflowNode): boolean {
  const params = node.parameters;

  return !!(
    params.pagination ||
    params.paginate ||
    params.limit ||
    params.returnAll === false
  );
}

function checkIfListEndpoint(node: WorkflowNode): boolean {
  const url = (node.parameters.url as string ?? '').toLowerCase();
  const method = (node.parameters.method as string ?? 'GET').toUpperCase();

  // Heuristic: GET requests with plural nouns or list-like paths
  return (
    method === 'GET' &&
    (url.includes('/list') ||
     url.includes('/all') ||
     url.endsWith('s') ||
     url.includes('search'))
  );
}

function checkLargeOutputPotential(node: WorkflowNode): boolean {
  return (
    node.type === 'n8n-nodes-base.httpRequest' ||
    node.type.includes('database') ||
    node.type.includes('spreadsheet') ||
    node.type.includes('airtable') ||
    checkIfListEndpoint(node)
  );
}

function onlyNeedsSubsetOfData(node: WorkflowNode): boolean {
  // Check if node parameters reference specific fields
  const params = JSON.stringify(node.parameters);

  // Look for field references like {{ $json.fieldName }}
  const fieldReferences = params.match(/\{\{\s*\$json\.\w+\s*\}\}/g);

  return !!(fieldReferences && fieldReferences.length < 5);
}
