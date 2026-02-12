/**
 * Main Graph Orchestrator
 * Combines all agents into a single LangGraph workflow
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { WorkflowBuilderState, type WorkflowBuilderStateType, applyOperations } from './state.js';
import { createSupervisor, createRoutingFunction } from './supervisor.js';
import { createDiscoveryAgent } from './agents/discovery.js';
import { createBuilderAgent } from './agents/builder.js';
import { createConfiguratorAgent } from './agents/configurator.js';
import { createResponderAgent } from './agents/responder.js';
import { getModelRouter } from '../models/router.js';
import { getRAGStore } from '../rag/store.js';
import { createCredentialsProvider } from '../n8n/credentials.js';

export interface WorkflowArchitectConfig {
  model?: BaseChatModel;
  checkpointer?: MemorySaver;
}

export interface ChatInput {
  message: string;
  threadId?: string;
}

export interface ChatOutput {
  response: string;
  workflow: WorkflowBuilderStateType['workflowJSON'];
  phases: string[];
}

/**
 * Create the workflow architect graph
 */
export function createWorkflowArchitect(config: WorkflowArchitectConfig = {}) {
  // Get model from router if not provided
  const router = getModelRouter();
  const model = config.model || router.getModel('claude-opus-4-5');

  // Create checkpointer for session persistence
  const checkpointer = config.checkpointer || new MemorySaver();

  // Create credentials provider
  const n8nBaseUrl = process.env.N8N_BASE_URL || 'http://localhost:5678';
  const n8nApiKey = process.env.N8N_API_KEY || '';
  const getCredentials = n8nApiKey
    ? createCredentialsProvider(n8nBaseUrl, n8nApiKey)
    : async () => [];

  // Create agents
  const supervisor = createSupervisor(model);
  const discoveryAgent = createDiscoveryAgent(model);
  const builderAgent = createBuilderAgent(model);
  const configuratorAgent = createConfiguratorAgent(getCredentials);
  const responderAgent = createResponderAgent(model);

  // Process operations node
  const processOperations = async (state: WorkflowBuilderStateType): Promise<Partial<WorkflowBuilderStateType>> => {
    if (!state.workflowOperations || state.workflowOperations.length === 0) {
      return {};
    }

    const updatedWorkflow = applyOperations(state.workflowJSON, state.workflowOperations);

    return {
      workflowJSON: updatedWorkflow,
      workflowOperations: null,
    };
  };

  // Build the graph
  const graph = new StateGraph(WorkflowBuilderState)
    // Add nodes
    .addNode('supervisor', supervisor)
    .addNode('discovery', discoveryAgent)
    .addNode('builder', builderAgent)
    .addNode('configurator', configuratorAgent)
    .addNode('responder', responderAgent)
    .addNode('process_operations', processOperations)

    // Define edges
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', createRoutingFunction, {
      discovery: 'discovery',
      builder: 'builder',
      configurator: 'configurator',
      responder: 'responder',
      __end__: END,
    })
    .addEdge('discovery', 'process_operations')
    .addEdge('builder', 'process_operations')
    .addEdge('process_operations', 'configurator')
    .addEdge('configurator', 'responder')
    .addEdge('responder', END);

  // Compile with checkpointer
  return graph.compile({ checkpointer });
}

/**
 * High-level chat function
 */
export async function chat(input: ChatInput): Promise<ChatOutput> {
  const graph = createWorkflowArchitect();

  // Initialize RAG store
  const ragStore = await getRAGStore();
  const stats = ragStore.getStats();
  console.log(`[RAG] Loaded ${stats.total} workflow examples`);

  // Create thread ID for session persistence
  const threadId = input.threadId || `session-${Date.now()}`;

  // Run the graph
  const result = await graph.invoke(
    {
      messages: [new HumanMessage(input.message)],
    },
    {
      configurable: { thread_id: threadId },
    }
  );

  // Extract response from last AI message
  const lastAiMessage = result.messages
    .filter((m: { _getType: () => string }) => m._getType() === 'ai')
    .pop();

  const response = lastAiMessage
    ? (typeof lastAiMessage.content === 'string'
        ? lastAiMessage.content
        : JSON.stringify(lastAiMessage.content))
    : 'Workflow created successfully.';

  // Extract phases from coordination log
  const phases = result.coordinationLog.map(
    (entry: { phase: string; status: string }) => `${entry.phase}:${entry.status}`
  );

  return {
    response,
    workflow: result.workflowJSON,
    phases,
  };
}

/**
 * Stream chat function for real-time updates
 */
export async function* streamChat(input: ChatInput): AsyncGenerator<{
  type: 'thinking' | 'phase' | 'workflow' | 'response' | 'done';
  data: unknown;
}> {
  const graph = createWorkflowArchitect();

  const threadId = input.threadId || `session-${Date.now()}`;

  yield { type: 'thinking', data: 'Analyzing your request...' };

  const stream = await graph.stream(
    {
      messages: [new HumanMessage(input.message)],
    },
    {
      configurable: { thread_id: threadId },
      streamMode: 'updates',
    }
  );

  let lastWorkflow = null;

  for await (const update of stream) {
    // Extract the node name and state update
    for (const [nodeName, nodeOutput] of Object.entries(update)) {
      yield { type: 'phase', data: nodeName };

      // Check for workflow updates
      const output = nodeOutput as Partial<WorkflowBuilderStateType>;
      if (output.workflowJSON) {
        lastWorkflow = output.workflowJSON;
        yield { type: 'workflow', data: output.workflowJSON };
      }

      // Check for messages (responses)
      if (output.messages && output.messages.length > 0) {
        const lastMessage = output.messages[output.messages.length - 1];
        if (lastMessage._getType() === 'ai') {
          yield {
            type: 'response',
            data: typeof lastMessage.content === 'string'
              ? lastMessage.content
              : JSON.stringify(lastMessage.content),
          };
        }
      }
    }
  }

  yield { type: 'done', data: lastWorkflow };
}

// Re-export types and utilities
export { WorkflowBuilderState, type WorkflowBuilderStateType } from './state.js';
export { getModelRouter } from '../models/router.js';
export { getRAGStore } from '../rag/store.js';
