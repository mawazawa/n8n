/**
 * General Optimization Detectors
 * Detects common optimization opportunities across workflows
 */

import type { WorkflowDefinition, WorkflowNode } from '../../types/workflow.js';
import type { Optimization, OptimizationContext } from '../types.js';
import { randomUUID } from 'crypto';

/**
 * Detect redundant operations (duplicate nodes doing the same thing)
 */
export async function detectRedundancy(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Group nodes by type and parameters
  const nodeGroups = new Map<string, WorkflowNode[]>();

  for (const node of nodes) {
    if (node.disabled) continue;

    const key = `${node.type}-${JSON.stringify(node.parameters)}`;
    if (!nodeGroups.has(key)) {
      nodeGroups.set(key, []);
    }
    nodeGroups.get(key)!.push(node);
  }

  // Find duplicates
  for (const [key, group] of Array.from(nodeGroups.entries())) {
    if (group.length > 1) {
      // Check if these nodes are truly redundant (not in different branches)
      const areRedundant = checkIfRedundant(group, workflow);

      if (areRedundant) {
        optimizations.push({
          id: randomUUID(),
          type: 'performance',
          title: `Remove ${group.length - 1} redundant ${group[0].type} node(s)`,
          description: `Found ${group.length} identical nodes performing the same operation. Consider consolidating them or using variables to share results.`,
          impact: 'medium',
          effort: 'low',
          affectedNodes: group.map(n => n.id),
          estimatedImprovement: {
            metric: 'execution_time',
            currentValue: group.length,
            projectedValue: 1,
            unit: 'nodes',
          },
          action: {
            type: 'remove_node',
            params: {
              nodesToRemove: group.slice(1).map(n => n.id),
              keepNode: group[0].id,
            },
            autoApplicable: false, // Requires manual verification
          },
        });
      }
    }
  }

  return optimizations;
}

/**
 * Detect opportunities for parallelization
 */
export async function detectParallelization(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const connections = workflow.connections;
  const nodes = workflow.nodes;

  // Find nodes that have multiple independent outputs
  for (const sourceId in connections) {
    const outputs = connections[sourceId].main ?? [];

    for (const outputConnections of outputs) {
      if (outputConnections.length > 1) {
        // Multiple connections from same output - check if they're independent
        const targetNodes = outputConnections.map(conn => conn.node);
        const areIndependent = checkBranchIndependence(targetNodes, workflow);

        if (areIndependent && targetNodes.length > 2) {
          const affectedNodes = [sourceId, ...targetNodes];

          optimizations.push({
            id: randomUUID(),
            type: 'performance',
            title: `Parallelize ${targetNodes.length} independent branches`,
            description: `Found ${targetNodes.length} independent branches that can run in parallel. Consider using a Split In Batches or parallel execution pattern.`,
            impact: 'high',
            effort: 'medium',
            affectedNodes,
            estimatedImprovement: {
              metric: 'execution_time',
              currentValue: targetNodes.length * 100,
              projectedValue: 100,
              unit: 'ms',
            },
            action: {
              type: 'parallelize',
              params: {
                sourceNode: sourceId,
                branches: targetNodes,
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
 * Detect repeated API calls that could be cached
 */
export async function detectCaching(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find HTTP/API nodes
  const apiNodes = nodes.filter(node =>
    node.type.includes('http') ||
    node.type.includes('webhook') ||
    isAPINode(node)
  );

  // Group by endpoint
  const endpointGroups = new Map<string, WorkflowNode[]>();

  for (const node of apiNodes) {
    const endpoint = extractEndpoint(node);
    if (endpoint) {
      if (!endpointGroups.has(endpoint)) {
        endpointGroups.set(endpoint, []);
      }
      endpointGroups.get(endpoint)!.push(node);
    }
  }

  // Detect repeated calls
  for (const [endpoint, group] of Array.from(endpointGroups.entries())) {
    if (group.length > 1) {
      optimizations.push({
        id: randomUUID(),
        type: 'cost',
        title: `Cache repeated API calls to ${endpoint}`,
        description: `Found ${group.length} calls to the same endpoint. Consider implementing caching to reduce API costs and improve performance.`,
        impact: 'high',
        effort: 'medium',
        affectedNodes: group.map(n => n.id),
        estimatedImprovement: {
          metric: 'api_calls',
          currentValue: group.length,
          projectedValue: 1,
          unit: 'calls',
        },
        action: {
          type: 'cache',
          params: {
            endpoint,
            nodes: group.map(n => n.id),
            cacheStrategy: 'memory',
            ttl: 300, // 5 minutes default
          },
          autoApplicable: false,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect loops that could use batching
 */
export async function detectBatching(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find loop nodes (Split In Batches, Loop Over Items)
  const loopNodes = nodes.filter(node =>
    node.type === 'n8n-nodes-base.splitInBatches' ||
    node.type === 'n8n-nodes-base.loop' ||
    node.type === 'n8n-nodes-base.itemLists'
  );

  for (const loopNode of loopNodes) {
    // Check if loop contains API calls
    const loopContent = getLoopContent(loopNode, workflow);
    const hasAPICall = loopContent.some(node =>
      node.type.includes('http') || isAPINode(node)
    );

    if (hasAPICall) {
      // Check batch size
      const batchSize = (loopNode.parameters.batchSize as number) ?? 1;

      if (batchSize === 1) {
        optimizations.push({
          id: randomUUID(),
          type: 'performance',
          title: `Increase batch size for ${loopNode.name}`,
          description: `Loop is processing items one at a time. Consider increasing batch size to reduce API calls and improve performance.`,
          impact: 'high',
          effort: 'low',
          affectedNodes: [loopNode.id],
          estimatedImprovement: {
            metric: 'execution_time',
            currentValue: 100,
            projectedValue: 20,
            unit: 'percent',
          },
          action: {
            type: 'modify_node',
            params: {
              nodeId: loopNode.id,
              parameter: 'batchSize',
              newValue: 10,
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
 * Detect missing error handling
 */
export async function detectErrorHandling(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find nodes with external calls that lack error handling
  const externalNodes = nodes.filter(node =>
    (node.type.includes('http') || isAPINode(node)) &&
    !node.parameters.continueOnFail
  );

  if (externalNodes.length > 0) {
    const nodesWithoutErrorHandling = externalNodes.filter(node => {
      return !hasErrorHandlingDownstream(node, workflow);
    });

    if (nodesWithoutErrorHandling.length > 0) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add error handling to ${nodesWithoutErrorHandling.length} external node(s)`,
        description: `Found ${nodesWithoutErrorHandling.length} nodes making external calls without proper error handling. This can cause workflow failures.`,
        impact: 'high',
        effort: 'medium',
        affectedNodes: nodesWithoutErrorHandling.map(n => n.id),
        action: {
          type: 'add_node',
          params: {
            nodeType: 'n8n-nodes-base.errorTrigger',
            connectTo: nodesWithoutErrorHandling.map(n => n.id),
          },
          autoApplicable: false,
        },
      });
    }
  }

  return optimizations;
}

// Helper functions

function checkIfRedundant(nodes: WorkflowNode[], workflow: WorkflowDefinition): boolean {
  // Simple heuristic: if nodes have same parameters and type, they're likely redundant
  // More sophisticated check would analyze execution context
  return nodes.length > 1;
}

function checkBranchIndependence(nodeIds: string[], workflow: WorkflowDefinition): boolean {
  // Check if branches don't share dependencies
  // Simplified: assume they're independent if they don't connect to each other
  const connections = workflow.connections;

  for (const nodeId of nodeIds) {
    const nodeConnections = connections[nodeId];
    if (nodeConnections) {
      for (const type in nodeConnections) {
        for (const connArray of nodeConnections[type]) {
          for (const conn of connArray) {
            if (nodeIds.includes(conn.node)) {
              return false; // Branches are connected
            }
          }
        }
      }
    }
  }

  return true;
}

function isAPINode(node: WorkflowNode): boolean {
  const apiPatterns = [
    'slack', 'gmail', 'github', 'jira', 'salesforce', 'hubspot',
    'stripe', 'shopify', 'airtable', 'notion', 'rest', 'graphql',
  ];

  const nodeType = node.type.toLowerCase();
  return apiPatterns.some(pattern => nodeType.includes(pattern));
}

function extractEndpoint(node: WorkflowNode): string | null {
  // Extract endpoint from HTTP Request or similar nodes
  const url = node.parameters.url as string ?? '';
  const method = node.parameters.method as string ?? 'GET';

  if (url) {
    return `${method}:${url}`;
  }

  return null;
}

function getLoopContent(loopNode: WorkflowNode, workflow: WorkflowDefinition): WorkflowNode[] {
  // Get all nodes within the loop
  const connections = workflow.connections;
  const loopContent: WorkflowNode[] = [];
  const visited = new Set<string>();

  const traverse = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = workflow.nodes.find(n => n.id === nodeId);
    if (node && node.id !== loopNode.id) {
      loopContent.push(node);
    }

    const nodeConnections = connections[nodeId];
    if (nodeConnections) {
      for (const type in nodeConnections) {
        for (const connArray of nodeConnections[type]) {
          for (const conn of connArray) {
            // Stop if we hit the loop node again (end of loop)
            if (conn.node !== loopNode.id) {
              traverse(conn.node);
            }
          }
        }
      }
    }
  };

  // Start from loop node
  const loopConnections = connections[loopNode.id];
  if (loopConnections) {
    for (const type in loopConnections) {
      for (const connArray of loopConnections[type]) {
        for (const conn of connArray) {
          traverse(conn.node);
        }
      }
    }
  }

  return loopContent;
}

function hasErrorHandlingDownstream(node: WorkflowNode, workflow: WorkflowDefinition): boolean {
  // Check if there's an Error Trigger or try-catch pattern downstream
  const connections = workflow.connections;
  const visited = new Set<string>();

  const checkDownstream = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);

    const currentNode = workflow.nodes.find(n => n.id === nodeId);
    if (!currentNode) return false;

    // Check if this node is an error handler
    if (currentNode.type === 'n8n-nodes-base.errorTrigger') {
      return true;
    }

    // Check downstream nodes
    const nodeConnections = connections[nodeId];
    if (nodeConnections) {
      for (const type in nodeConnections) {
        for (const connArray of nodeConnections[type]) {
          for (const conn of connArray) {
            if (checkDownstream(conn.node)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  };

  return checkDownstream(node.id);
}
