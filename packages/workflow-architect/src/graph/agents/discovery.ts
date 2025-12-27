/**
 * Discovery Agent
 * Finds relevant n8n nodes and workflow examples for the user's request
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowBuilderStateType } from '../state.js';
import type { DiscoveryContext, CoordinationLogEntry } from '../../types/agent.js';
import { getRAGStore } from '../../rag/store.js';

const DISCOVERY_PROMPT = `You are a discovery agent that identifies the n8n nodes needed to build a workflow.

## Your Task
Analyze the user's request and identify:
1. Which n8n nodes are needed
2. What connection-changing parameters should be set
3. Relevant best practices

## Available Node Categories
- **Triggers**: Webhook, Schedule, Email Trigger, Slack Trigger, etc.
- **Actions**: HTTP Request, Send Email, Slack, GitHub, Jira, etc.
- **AI/LangChain**: AI Agent, Chat Model, Vector Store, Memory, Tools, etc.
- **Data**: Code, Set, IF, Switch, Merge, Split In Batches, etc.
- **Flow Control**: Wait, Form, Error Trigger, Stop and Error, etc.

## Relevant Examples from RAG
{relevantExamples}

## Current Workflow
{currentWorkflow}

## User Request
{userMessage}

Identify the nodes needed and their key parameters.`;

const NodeSchema = z.object({
  nodeName: z.string().describe('The n8n node type, e.g., "n8n-nodes-base.slack"'),
  version: z.number().default(1).describe('Node version to use'),
  reasoning: z.string().describe('Why this node is needed'),
  connectionChangingParameters: z.array(z.object({
    name: z.string(),
    possibleValues: z.array(z.union([z.string(), z.boolean(), z.number()])),
  })).optional().describe('Parameters that affect how the node connects'),
});

const DiscoveryOutputSchema = z.object({
  nodesFound: z.array(NodeSchema),
  bestPractices: z.string().optional().describe('Relevant best practices'),
  suggestedWorkflowName: z.string().optional().describe('Suggested name for the workflow'),
});

export function createDiscoveryAgent(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromTemplate(DISCOVERY_PROMPT);
  const structuredModel = model.withStructuredOutput(DiscoveryOutputSchema);

  return async (state: WorkflowBuilderStateType): Promise<Partial<WorkflowBuilderStateType>> => {
    console.log('[Discovery] Starting node discovery...');

    // Get the last user message
    const lastMessage = state.messages[state.messages.length - 1];
    const userMessage = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // Search for relevant examples from RAG
    const ragStore = await getRAGStore();
    const relevantExamples = ragStore.search(userMessage, { limit: 3 });

    const examplesText = relevantExamples.length > 0
      ? relevantExamples.map(ex =>
          `- ${ex.name}: ${ex.description}\n  Techniques: ${ex.techniques.join(', ')}`
        ).join('\n')
      : 'No relevant examples found.';

    // Format current workflow
    const currentWorkflow = state.workflowJSON.nodes.length > 0
      ? `Nodes: ${state.workflowJSON.nodes.map(n => n.name).join(', ')}`
      : 'Empty workflow';

    const formattedPrompt = await prompt.invoke({
      relevantExamples: examplesText,
      currentWorkflow,
      userMessage,
    });

    const result = await structuredModel.invoke(formattedPrompt);

    console.log(`[Discovery] Found ${result.nodesFound.length} nodes`);

    // Create coordination log entry
    const logEntry: CoordinationLogEntry = {
      phase: 'discovery',
      status: 'completed',
      timestamp: Date.now(),
      summary: `Found ${result.nodesFound.length} nodes: ${result.nodesFound.map(n => n.nodeName).join(', ')}`,
      metadata: {
        nodesFound: result.nodesFound.length,
        nodeTypes: result.nodesFound.map(n => n.nodeName),
        hasBestPractices: !!result.bestPractices,
      },
    };

    // Create discovery context
    const discoveryContext: DiscoveryContext = {
      nodesFound: result.nodesFound,
      bestPractices: result.bestPractices,
      relevantExamples,
    };

    // Update workflow name if suggested
    const workflowJSON = result.suggestedWorkflowName && state.workflowJSON.name === 'My workflow'
      ? { ...state.workflowJSON, name: result.suggestedWorkflowName }
      : state.workflowJSON;

    return {
      discoveryContext,
      coordinationLog: [logEntry],
      workflowJSON,
      relevantExamples,
      nextPhase: result.nodesFound.length > 0 ? 'builder' : 'responder',
    };
  };
}
