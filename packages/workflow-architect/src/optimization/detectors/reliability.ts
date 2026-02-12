/**
 * Reliability Optimization Detectors
 * Detects reliability and resilience issues in workflows
 */

import type { WorkflowDefinition, WorkflowNode } from '../../types/workflow.js';
import type { Optimization, OptimizationContext } from '../types.js';
import { randomUUID } from 'crypto';

/**
 * Detect missing retry logic on external calls
 */
export async function detectMissingRetry(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find external API/HTTP nodes without retry configuration
  const externalNodes = nodes.filter(node =>
    isExternalCallNode(node) && !node.disabled
  );

  for (const node of externalNodes) {
    const hasRetry = checkRetryConfiguration(node);

    if (!hasRetry) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add retry logic to ${node.name}`,
        description: `External API call without retry logic. Network issues or temporary failures can cause workflow failures.`,
        impact: 'high',
        effort: 'low',
        affectedNodes: [node.id],
        estimatedImprovement: {
          metric: 'success_rate',
          currentValue: 95,
          projectedValue: 99,
          unit: 'percent',
        },
        action: {
          type: 'modify_node',
          params: {
            nodeId: node.id,
            addRetry: true,
            maxRetries: 3,
            retryInterval: 1000,
          },
          autoApplicable: true,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect missing error handling on external calls
 */
export async function detectMissingErrorHandling(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find nodes without continueOnFail or error handling
  const vulnerableNodes = nodes.filter(node =>
    isExternalCallNode(node) &&
    !node.disabled &&
    !node.parameters.continueOnFail
  );

  for (const node of vulnerableNodes) {
    const hasErrorHandler = hasErrorHandlingDownstream(node, workflow);
    const isCriticalPath = isOnCriticalPath(node, workflow);

    if (!hasErrorHandler && isCriticalPath) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add error handling to ${node.name}`,
        description: `Critical external call without error handling. Failures here will stop the entire workflow.`,
        impact: 'high',
        effort: 'medium',
        affectedNodes: [node.id],
        action: {
          type: 'modify_node',
          params: {
            nodeId: node.id,
            continueOnFail: true,
            addErrorBranch: true,
          },
          autoApplicable: false,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect missing timeout configurations
 */
export async function detectMissingTimeouts(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find HTTP/external nodes without timeouts
  const externalNodes = nodes.filter(node =>
    isExternalCallNode(node) && !node.disabled
  );

  for (const node of externalNodes) {
    const hasTimeout = checkTimeoutConfiguration(node);

    if (!hasTimeout) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add timeout to ${node.name}`,
        description: `External call without timeout configuration. Slow responses can hang the workflow indefinitely.`,
        impact: 'medium',
        effort: 'low',
        affectedNodes: [node.id],
        estimatedImprovement: {
          metric: 'reliability',
          currentValue: 90,
          projectedValue: 98,
          unit: 'percent',
        },
        action: {
          type: 'modify_node',
          params: {
            nodeId: node.id,
            timeout: 30000, // 30 seconds default
          },
          autoApplicable: true,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect missing fallback strategies
 */
export async function detectMissingFallbacks(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;

  // Find critical external calls without fallbacks
  const criticalNodes = nodes.filter(node =>
    isExternalCallNode(node) &&
    !node.disabled &&
    isCriticalService(node)
  );

  for (const node of criticalNodes) {
    const hasFallback = checkFallbackStrategy(node, workflow);

    if (!hasFallback) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add fallback for ${node.name}`,
        description: `Critical service call without fallback. Consider adding alternative data sources or cached responses.`,
        impact: 'high',
        effort: 'high',
        affectedNodes: [node.id],
        action: {
          type: 'add_node',
          params: {
            nodeType: 'n8n-nodes-base.if',
            insertAfter: node.id,
            addFallbackBranch: true,
          },
          autoApplicable: false,
        },
      });
    }
  }

  return optimizations;
}

/**
 * Detect insufficient data validation
 */
export async function detectInsufficientValidation(
  workflow: WorkflowDefinition,
  context: OptimizationContext,
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];
  const nodes = workflow.nodes;
  const connections = workflow.connections;

  // Find trigger nodes (workflow entry points)
  const triggerNodes = nodes.filter(node =>
    node.type.includes('trigger') ||
    node.type.includes('webhook')
  );

  for (const triggerNode of triggerNodes) {
    const hasValidation = checkInputValidation(triggerNode, workflow);

    if (!hasValidation) {
      optimizations.push({
        id: randomUUID(),
        type: 'reliability',
        title: `Add input validation after ${triggerNode.name}`,
        description: `Workflow entry point without input validation. Invalid data can cause errors downstream.`,
        impact: 'medium',
        effort: 'medium',
        affectedNodes: [triggerNode.id],
        action: {
          type: 'add_node',
          params: {
            nodeType: 'n8n-nodes-base.if',
            insertAfter: triggerNode.id,
            addValidation: true,
          },
          autoApplicable: false,
        },
      });
    }
  }

  // Check for database operations without validation
  const dbNodes = nodes.filter(node =>
    node.type.includes('postgres') ||
    node.type.includes('mysql') ||
    node.type.includes('mongodb') ||
    node.type.includes('database')
  );

  for (const dbNode of dbNodes) {
    const operation = dbNode.parameters.operation as string;

    if (operation === 'insert' || operation === 'update') {
      const hasValidationBefore = hasValidationUpstream(dbNode, workflow);

      if (!hasValidationBefore) {
        optimizations.push({
          id: randomUUID(),
          type: 'reliability',
          title: `Add validation before ${dbNode.name}`,
          description: `Database ${operation} operation without prior validation. Invalid data can corrupt your database.`,
          impact: 'high',
          effort: 'medium',
          affectedNodes: [dbNode.id],
          action: {
            type: 'add_node',
            params: {
              nodeType: 'n8n-nodes-base.if',
              insertBefore: dbNode.id,
              validateSchema: true,
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

function isExternalCallNode(node: WorkflowNode): boolean {
  const externalPatterns = [
    'http', 'webhook', 'slack', 'gmail', 'github', 'jira',
    'salesforce', 'hubspot', 'stripe', 'shopify', 'airtable',
    'notion', 'openai', 'anthropic', 'rest', 'graphql',
  ];

  const nodeType = node.type.toLowerCase();
  return externalPatterns.some(pattern => nodeType.includes(pattern));
}

function checkRetryConfiguration(node: WorkflowNode): boolean {
  const params = node.parameters;

  return !!(
    params.retry ||
    params.retryOnFail ||
    params.maxRetries ||
    (params.options as Record<string, unknown>)?.retry
  );
}

function checkTimeoutConfiguration(node: WorkflowNode): boolean {
  const params = node.parameters;

  return !!(
    params.timeout ||
    (params.options as Record<string, unknown>)?.timeout
  );
}

function hasErrorHandlingDownstream(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
): boolean {
  const connections = workflow.connections;
  const nodeConnections = connections[node.id];

  if (!nodeConnections) return false;

  // Check for error output connections
  if (nodeConnections.error) {
    return true;
  }

  // Check if there's an Error Trigger node in the workflow
  return workflow.nodes.some(n => n.type === 'n8n-nodes-base.errorTrigger');
}

function isOnCriticalPath(node: WorkflowNode, workflow: WorkflowDefinition): boolean {
  // Heuristic: a node is on critical path if it's not in a parallel branch
  const connections = workflow.connections;

  // Find all nodes that have multiple outputs (branching)
  const branchingNodes = new Set<string>();
  for (const sourceId in connections) {
    const nodeConnections = connections[sourceId];
    for (const type in nodeConnections) {
      const connArrays = nodeConnections[type];
      for (const connArray of connArrays) {
        if (connArray.length > 1) {
          branchingNodes.add(sourceId);
        }
      }
    }
  }

  // If node is not in a branch, it's on critical path
  return !isInBranch(node, workflow, branchingNodes);
}

function isInBranch(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
  branchingNodes: Set<string>,
): boolean {
  const connections = workflow.connections;

  // Check if any upstream node is a branching node
  for (const sourceId in connections) {
    const nodeConnections = connections[sourceId];
    for (const type in nodeConnections) {
      for (const connArray of nodeConnections[type]) {
        for (const conn of connArray) {
          if (conn.node === node.id && branchingNodes.has(sourceId)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function isCriticalService(node: WorkflowNode): boolean {
  const criticalPatterns = [
    'database', 'postgres', 'mysql', 'mongodb',
    'payment', 'stripe', 'auth', 'authentication',
  ];

  const nodeType = node.type.toLowerCase();
  return criticalPatterns.some(pattern => nodeType.includes(pattern));
}

function checkFallbackStrategy(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
): boolean {
  const connections = workflow.connections;
  const nodeConnections = connections[node.id];

  if (!nodeConnections) return false;

  // Check for multiple output branches (fallback pattern)
  for (const type in nodeConnections) {
    const connArrays = nodeConnections[type];
    for (const connArray of connArrays) {
      if (connArray.length > 1) {
        return true;
      }
    }
  }

  return false;
}

function checkInputValidation(
  triggerNode: WorkflowNode,
  workflow: WorkflowDefinition,
): boolean {
  const connections = workflow.connections;
  const triggerConnections = connections[triggerNode.id];

  if (!triggerConnections?.main) return false;

  // Check immediate downstream nodes for validation patterns
  for (const connArray of triggerConnections.main) {
    for (const conn of connArray) {
      const nextNode = workflow.nodes.find(n => n.id === conn.node);
      if (nextNode && isValidationNode(nextNode)) {
        return true;
      }
    }
  }

  return false;
}

function isValidationNode(node: WorkflowNode): boolean {
  return (
    node.type === 'n8n-nodes-base.if' ||
    node.type === 'n8n-nodes-base.switch' ||
    node.type === 'n8n-nodes-base.filter' ||
    node.name.toLowerCase().includes('validate') ||
    node.name.toLowerCase().includes('check')
  );
}

function hasValidationUpstream(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
): boolean {
  const connections = workflow.connections;

  // Find upstream nodes
  for (const sourceId in connections) {
    const nodeConnections = connections[sourceId];
    for (const type in nodeConnections) {
      for (const connArray of nodeConnections[type]) {
        for (const conn of connArray) {
          if (conn.node === node.id) {
            const sourceNode = workflow.nodes.find(n => n.id === sourceId);
            if (sourceNode && isValidationNode(sourceNode)) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}
