/**
 * Agent State and Message Types
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { WorkflowDefinition, WorkflowOperation, WorkflowExample } from './workflow.js';

export interface DiscoveryContext {
  nodesFound: Array<{
    nodeName: string;
    version: number;
    reasoning: string;
    connectionChangingParameters?: Array<{
      name: string;
      possibleValues: (string | boolean | number)[];
    }>;
  }>;
  bestPractices?: string;
  relevantExamples?: WorkflowExample[];
}

export interface WorkflowContext {
  currentWorkflow?: Partial<WorkflowDefinition>;
  executionData?: Record<string, unknown>;
  executionSchema?: Array<{
    nodeName: string;
    schema: Record<string, unknown>;
  }>;
}

export interface CoordinationLogEntry {
  phase: 'discovery' | 'builder' | 'configurator' | 'responder';
  status: 'completed' | 'error';
  timestamp: number;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  // Conversation
  messages: BaseMessage[];
  previousSummary?: string;

  // Workflow state
  workflowJSON: Pick<WorkflowDefinition, 'name' | 'nodes' | 'connections'>;
  workflowOperations: WorkflowOperation[];
  workflowContext?: WorkflowContext;

  // Agent coordination
  nextPhase?: string;
  coordinationLog: CoordinationLogEntry[];
  discoveryContext?: DiscoveryContext;

  // Template matching
  nodeConfigurations?: Record<string, Record<string, unknown>>;
  templateIds?: number[];
}

export type AgentPhase = 'supervisor' | 'discovery' | 'builder' | 'configurator' | 'responder';

export interface AgentConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ChatPayload {
  id: string;
  message: string;
  workflowContext?: WorkflowContext;
}

export interface StreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'workflow_updated' | 'done' | 'error';
  data: unknown;
}
