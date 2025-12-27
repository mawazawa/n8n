/**
 * Supervisor Agent
 * Routes requests to appropriate subgraphs based on user intent
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowBuilderStateType } from './state.js';

const SUPERVISOR_PROMPT = `You are a supervisor agent that routes workflow building requests to specialized agents.

Your job is to analyze the user's message and determine which agent should handle it:

1. **discovery** - When the user wants to add NEW node types to the workflow
   - "Add a Slack notification"
   - "I need to send emails"
   - "Connect to a database"

2. **builder** - When the user wants to CONNECT or STRUCTURE existing nodes
   - "Connect the webhook to the AI agent"
   - "Remove the connection between X and Y"
   - "Restructure the workflow"

3. **configurator** - When the user wants to CONFIGURE existing nodes with specific values
   - "Set the API key to..."
   - "Change the email recipient to..."
   - "Update the timeout to 30 seconds"

4. **responder** - When the user asks a QUESTION or needs EXPLANATION
   - "What does this workflow do?"
   - "How do I test this?"
   - "Explain the error"

## Decision Rules

1. If the request mentions NEW integrations/services → discovery
2. If the request is about node connections/structure → builder
3. If the request is about specific VALUES/settings → configurator
4. If the request is a question/conversation → responder

## Current Workflow State
Nodes: {nodeCount}
Connections: {connectionCount}
Recent phases completed: {recentPhases}

## User Message
{userMessage}

Analyze the user's intent and select the appropriate agent.`;

const RoutingSchema = z.object({
  agent: z.enum(['discovery', 'builder', 'configurator', 'responder']),
  reasoning: z.string().describe('Brief explanation of why this agent was selected'),
  confidence: z.number().min(0).max(1).describe('Confidence in the routing decision'),
});

export type RoutingDecision = z.infer<typeof RoutingSchema>;

/**
 * Create the supervisor routing function
 */
export function createSupervisor(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromTemplate(SUPERVISOR_PROMPT);

  const structuredModel = model.withStructuredOutput(RoutingSchema);

  return async (state: WorkflowBuilderStateType): Promise<{ nextPhase: string }> => {
    // Get the last user message
    const lastMessage = state.messages[state.messages.length - 1];
    const userMessage = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // Get recent phases from coordination log
    const recentPhases = state.coordinationLog
      .slice(-5)
      .map(entry => `${entry.phase}: ${entry.status}`)
      .join(', ') || 'none';

    const formattedPrompt = await prompt.invoke({
      nodeCount: state.workflowJSON.nodes.length,
      connectionCount: Object.keys(state.workflowJSON.connections).length,
      recentPhases,
      userMessage,
    });

    const decision = await structuredModel.invoke(formattedPrompt);

    console.log(`[Supervisor] Routing to: ${decision.agent} (confidence: ${decision.confidence})`);
    console.log(`[Supervisor] Reasoning: ${decision.reasoning}`);

    return { nextPhase: decision.agent };
  };
}

/**
 * Determine next phase based on coordination log
 * Uses deterministic rules to prevent infinite loops
 */
export function determineNextPhase(state: WorkflowBuilderStateType): string {
  const log = state.coordinationLog;
  const lastEntry = log[log.length - 1];

  // If no entries yet, start with supervisor
  if (!lastEntry) {
    return 'supervisor';
  }

  // If last phase had an error, go to responder
  if (lastEntry.status === 'error') {
    return 'responder';
  }

  // After discovery, go to builder if nodes were found
  if (lastEntry.phase === 'discovery') {
    const metadata = lastEntry.metadata as { nodesFound?: number } | undefined;
    if (metadata?.nodesFound && metadata.nodesFound > 0) {
      return 'builder';
    }
    return 'responder';
  }

  // After builder, go to configurator if nodes were created
  if (lastEntry.phase === 'builder') {
    const metadata = lastEntry.metadata as { nodesCreated?: number } | undefined;
    if (metadata?.nodesCreated && metadata.nodesCreated > 0) {
      return 'configurator';
    }
    return 'responder';
  }

  // After configurator, always go to responder
  if (lastEntry.phase === 'configurator') {
    return 'responder';
  }

  // After responder, end the turn
  if (lastEntry.phase === 'responder') {
    return '__end__';
  }

  // Default: ask supervisor
  return 'supervisor';
}

/**
 * Create a routing function for the graph edges
 */
export function createRoutingFunction(
  _state: WorkflowBuilderStateType
): 'discovery' | 'builder' | 'configurator' | 'responder' | '__end__' {
  const phase = _state.nextPhase;

  switch (phase) {
    case 'discovery':
      return 'discovery';
    case 'builder':
      return 'builder';
    case 'configurator':
      return 'configurator';
    case 'responder':
      return 'responder';
    default:
      return '__end__';
  }
}
