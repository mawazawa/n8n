/**
 * Agent Graph State Definition
 * Uses LangGraph's Annotation system for type-safe state management
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  WorkflowDefinition,
  WorkflowOperation,
  WorkflowExample,
} from '../types/workflow.js';
import type {
  DiscoveryContext,
  WorkflowContext,
  CoordinationLogEntry,
} from '../types/agent.js';

/**
 * Simple workflow type (minimal structure for generation)
 */
export type SimpleWorkflow = Pick<WorkflowDefinition, 'name' | 'nodes' | 'connections'>;

/**
 * Coordination log reducer - appends new entries
 */
function coordinationLogReducer(
  current: CoordinationLogEntry[],
  update: CoordinationLogEntry | CoordinationLogEntry[]
): CoordinationLogEntry[] {
  const updates = Array.isArray(update) ? update : [update];
  return [...current, ...updates];
}

/**
 * Workflow operations reducer - replaces or appends
 */
function workflowOperationsReducer(
  current: WorkflowOperation[] | null,
  update: WorkflowOperation[] | null
): WorkflowOperation[] | null {
  if (update === null) return null;
  if (current === null) return update;
  return [...current, ...update];
}

/**
 * Discovery context reducer - merges contexts
 */
function discoveryContextReducer(
  current: DiscoveryContext | undefined,
  update: DiscoveryContext | undefined
): DiscoveryContext | undefined {
  if (!update) return current;
  if (!current) return update;

  return {
    nodesFound: [...current.nodesFound, ...update.nodesFound],
    bestPractices: update.bestPractices || current.bestPractices,
    relevantExamples: [
      ...(current.relevantExamples || []),
      ...(update.relevantExamples || []),
    ],
  };
}

/**
 * Parent Graph State Annotation
 * Defines the full state structure for the workflow builder agent
 */
export const WorkflowBuilderState = Annotation.Root({
  // Conversation history with automatic message merging
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Current workflow being built
  workflowJSON: Annotation<SimpleWorkflow>({
    reducer: (_, update) => update,
    default: () => ({ name: 'My workflow', nodes: [], connections: {} }),
  }),

  // Pending workflow operations to apply
  workflowOperations: Annotation<WorkflowOperation[] | null>({
    reducer: workflowOperationsReducer,
    default: () => null,
  }),

  // Context from execution data
  workflowContext: Annotation<WorkflowContext | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // Routing decision for next phase
  nextPhase: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // Track completed phases for deterministic routing
  coordinationLog: Annotation<CoordinationLogEntry[]>({
    reducer: coordinationLogReducer,
    default: () => [],
  }),

  // Discovery agent output
  discoveryContext: Annotation<DiscoveryContext | undefined>({
    reducer: discoveryContextReducer,
    default: () => undefined,
  }),

  // Node configurations from matched templates
  nodeConfigurations: Annotation<Record<string, Record<string, unknown>> | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // Compacted conversation summary
  previousSummary: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // Template IDs used (for telemetry)
  templateIds: Annotation<number[] | undefined>({
    reducer: (current, update) => {
      if (!update) return current;
      if (!current) return update;
      return [...new Set([...current, ...update])];
    },
    default: () => undefined,
  }),

  // RAG examples retrieved
  relevantExamples: Annotation<WorkflowExample[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
});

/**
 * Type for the workflow builder state
 */
export type WorkflowBuilderStateType = typeof WorkflowBuilderState.State;

/**
 * Apply operations to workflow state
 */
export function applyOperations(
  workflow: SimpleWorkflow,
  operations: WorkflowOperation[]
): SimpleWorkflow {
  let result = { ...workflow };

  for (const op of operations) {
    switch (op.type) {
      case 'clear':
        result = { name: result.name, nodes: [], connections: {} };
        break;

      case 'addNodes':
        if (op.nodes) {
          result = {
            ...result,
            nodes: [...result.nodes, ...op.nodes],
          };
        }
        break;

      case 'removeNode':
        if (op.nodeIds) {
          result = {
            ...result,
            nodes: result.nodes.filter(n => !op.nodeIds!.includes(n.id)),
            // Also clean up connections
            connections: cleanConnectionsForRemovedNodes(result.connections, op.nodeIds),
          };
        }
        break;

      case 'updateNode':
        if (op.nodeId && op.updates) {
          result = {
            ...result,
            nodes: result.nodes.map(n =>
              n.id === op.nodeId ? { ...n, ...op.updates } : n
            ),
          };
        }
        break;

      case 'setConnections':
        if (op.connections) {
          result = { ...result, connections: op.connections };
        }
        break;

      case 'mergeConnections':
        if (op.connections) {
          result = {
            ...result,
            connections: mergeConnections(result.connections, op.connections),
          };
        }
        break;

      case 'removeConnection':
        if (op.sourceNode && op.targetNode) {
          result = {
            ...result,
            connections: removeConnection(
              result.connections,
              op.sourceNode,
              op.targetNode
            ),
          };
        }
        break;

      case 'setName':
        if (op.name) {
          result = { ...result, name: op.name };
        }
        break;
    }
  }

  return result;
}

function cleanConnectionsForRemovedNodes(
  connections: SimpleWorkflow['connections'],
  nodeIds: string[]
): SimpleWorkflow['connections'] {
  const result: SimpleWorkflow['connections'] = {};

  for (const [sourceNode, outputs] of Object.entries(connections)) {
    // Skip if source node was removed
    if (nodeIds.includes(sourceNode)) continue;

    result[sourceNode] = {};
    for (const [connectionType, targets] of Object.entries(outputs)) {
      result[sourceNode][connectionType] = targets.map(targetArray =>
        targetArray.filter(target => !nodeIds.includes(target.node))
      ).filter(arr => arr.length > 0);

      if (result[sourceNode][connectionType].length === 0) {
        delete result[sourceNode][connectionType];
      }
    }

    if (Object.keys(result[sourceNode]).length === 0) {
      delete result[sourceNode];
    }
  }

  return result;
}

function mergeConnections(
  existing: SimpleWorkflow['connections'],
  newConnections: SimpleWorkflow['connections']
): SimpleWorkflow['connections'] {
  const result = { ...existing };

  for (const [sourceNode, outputs] of Object.entries(newConnections)) {
    if (!result[sourceNode]) {
      result[sourceNode] = outputs;
    } else {
      for (const [connectionType, targets] of Object.entries(outputs)) {
        if (!result[sourceNode][connectionType]) {
          result[sourceNode][connectionType] = targets;
        } else {
          result[sourceNode][connectionType] = [
            ...result[sourceNode][connectionType],
            ...targets,
          ];
        }
      }
    }
  }

  return result;
}

function removeConnection(
  connections: SimpleWorkflow['connections'],
  sourceNode: string,
  targetNode: string
): SimpleWorkflow['connections'] {
  const result = { ...connections };

  if (result[sourceNode]) {
    for (const connectionType of Object.keys(result[sourceNode])) {
      result[sourceNode][connectionType] = result[sourceNode][connectionType]
        .map(targets => targets.filter(t => t.node !== targetNode))
        .filter(arr => arr.length > 0);

      if (result[sourceNode][connectionType].length === 0) {
        delete result[sourceNode][connectionType];
      }
    }

    if (Object.keys(result[sourceNode]).length === 0) {
      delete result[sourceNode];
    }
  }

  return result;
}
