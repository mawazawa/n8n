/**
 * Responder Agent
 * Generates user-facing responses about the workflow
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowBuilderStateType } from '../state.js';
import type { CoordinationLogEntry } from '../../types/agent.js';

const RESPONDER_PROMPT = `You are a helpful assistant that explains n8n workflows to users.

## Recent Actions
{recentActions}

## Current Workflow
Name: {workflowName}
Nodes ({nodeCount}): {nodeList}
Connections: {connectionCount}

## User's Original Request
{userMessage}

## Your Task
Provide a clear, concise response that:
1. Summarizes what was done
2. Explains the workflow structure if new nodes were added
3. Suggests next steps (e.g., configure credentials, test the workflow)
4. Answers any questions the user asked

Keep your response concise but informative.`;

export function createResponderAgent(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromTemplate(RESPONDER_PROMPT);

  return async (state: WorkflowBuilderStateType): Promise<Partial<WorkflowBuilderStateType>> => {
    console.log('[Responder] Generating response...');

    // Get the last user message
    const lastUserMessage = state.messages
      .filter(m => m._getType() === 'human')
      .pop();
    const userMessage = lastUserMessage
      ? (typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : JSON.stringify(lastUserMessage.content))
      : 'No message';

    // Format recent actions from coordination log
    const recentActions = state.coordinationLog
      .slice(-5)
      .map(entry => `- ${entry.phase}: ${entry.summary}`)
      .join('\n') || 'No recent actions';

    // Format node list
    const nodeList = state.workflowJSON.nodes.length > 0
      ? state.workflowJSON.nodes.map(n => `${n.name} (${n.type.split('.').pop()})`).join(', ')
      : 'None';

    const formattedPrompt = await prompt.invoke({
      recentActions,
      workflowName: state.workflowJSON.name,
      nodeCount: state.workflowJSON.nodes.length,
      nodeList,
      connectionCount: Object.keys(state.workflowJSON.connections).length,
      userMessage,
    });

    const response = await model.invoke(formattedPrompt);

    console.log('[Responder] Response generated');

    // Create coordination log entry
    const logEntry: CoordinationLogEntry = {
      phase: 'responder',
      status: 'completed',
      timestamp: Date.now(),
      summary: 'Generated user response',
      metadata: {},
    };

    // Add AI response to messages
    const aiMessage = new AIMessage({
      content: typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    });

    return {
      messages: [aiMessage],
      coordinationLog: [logEntry],
      nextPhase: '__end__',
    };
  };
}
