/**
 * Workflow Architect
 * OSS Agentic Workflow Builder for n8n
 *
 * @packageDocumentation
 */

// Main exports
export { createWorkflowArchitect, chat, streamChat } from './graph/index.js';
export { getModelRouter, type ModelId, type ModelConfig } from './models/router.js';
export { getRAGStore, WorkflowRAGStore } from './rag/store.js';
export { N8nClient, createN8nClient } from './n8n/client.js';

// Types
export type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnections,
  WorkflowExample,
  WorkflowCategory,
  ExecutionResult,
  Credential,
} from './types/workflow.js';

export type {
  AgentState,
  DiscoveryContext,
  WorkflowContext,
  CoordinationLogEntry,
  ChatPayload,
  StreamEvent,
} from './types/agent.js';

// State management
export {
  WorkflowBuilderState,
  type WorkflowBuilderStateType,
  applyOperations,
} from './graph/state.js';

// Version
export const VERSION = '0.1.0';
