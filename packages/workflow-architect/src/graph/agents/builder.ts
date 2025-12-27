/**
 * Builder Agent
 * Creates and connects nodes in the workflow
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowBuilderStateType, SimpleWorkflow } from '../state.js';
import type { CoordinationLogEntry } from '../../types/agent.js';
import type { WorkflowNode, WorkflowConnections } from '../../types/workflow.js';

const BUILDER_PROMPT = `You are a builder agent that creates n8n workflow structures.

## Your Task
1. Create nodes from the discovery context
2. Connect them in logical order
3. Position them on the canvas

## Discovery Context
{discoveryContext}

## Relevant Examples
{examples}

## Current Workflow
{currentWorkflow}

## Rules
1. Triggers go first (leftmost)
2. Data flows left to right
3. AI nodes connect via special connection types (ai_languageModel, ai_tool, etc.)
4. Position nodes with 200px horizontal spacing, 100px vertical spacing
5. Use descriptive node names

## Connection Types
- main: Standard data flow
- ai_languageModel: Connect LLM to agent
- ai_tool: Connect tool to agent
- ai_memory: Connect memory to agent
- ai_vectorStore: Connect vector store to retriever

Generate the nodes and connections.`;

const NodeOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number().default(1),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).default({}),
});

const ConnectionSchema = z.object({
  sourceNode: z.string(),
  targetNode: z.string(),
  sourceOutput: z.number().default(0),
  targetInput: z.number().default(0),
  connectionType: z.string().default('main'),
});

const BuilderOutputSchema = z.object({
  nodes: z.array(NodeOutputSchema),
  connections: z.array(ConnectionSchema),
  reasoning: z.string().describe('Explanation of the workflow structure'),
});

export function createBuilderAgent(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromTemplate(BUILDER_PROMPT);
  const structuredModel = model.withStructuredOutput(BuilderOutputSchema);

  return async (state: WorkflowBuilderStateType): Promise<Partial<WorkflowBuilderStateType>> => {
    console.log('[Builder] Creating workflow structure...');

    // Get discovery context
    const discoveryContext = state.discoveryContext;
    if (!discoveryContext || discoveryContext.nodesFound.length === 0) {
      console.log('[Builder] No nodes to build');
      return {
        coordinationLog: [{
          phase: 'builder',
          status: 'completed',
          timestamp: Date.now(),
          summary: 'No nodes to build',
          metadata: { nodesCreated: 0 },
        }],
        nextPhase: 'responder',
      };
    }

    // Format discovery context
    const discoveryText = discoveryContext.nodesFound
      .map(n => `- ${n.nodeName} (v${n.version}): ${n.reasoning}`)
      .join('\n');

    // Format examples
    const examplesText = state.relevantExamples?.slice(0, 2)
      .map(ex => {
        const nodes = ex.workflow.nodes.map(n => n.type).join(', ');
        return `${ex.name}: ${nodes}`;
      }).join('\n') || 'No examples';

    // Format current workflow
    const currentWorkflow = JSON.stringify({
      nodes: state.workflowJSON.nodes.map(n => ({ name: n.name, type: n.type })),
      connections: Object.keys(state.workflowJSON.connections),
    }, null, 2);

    const formattedPrompt = await prompt.invoke({
      discoveryContext: discoveryText,
      examples: examplesText,
      currentWorkflow,
    });

    const result = await structuredModel.invoke(formattedPrompt);

    console.log(`[Builder] Created ${result.nodes.length} nodes with ${result.connections.length} connections`);

    // Convert result to workflow format
    const nodes: WorkflowNode[] = result.nodes.map(n => ({
      id: n.id || uuid(),
      name: n.name,
      type: n.type,
      typeVersion: n.typeVersion,
      position: n.position,
      parameters: n.parameters as Record<string, unknown>,
    }));

    // Build connections object
    const connections = buildConnections(result.connections, nodes);

    // Merge with existing workflow
    const workflowJSON: SimpleWorkflow = {
      name: state.workflowJSON.name,
      nodes: [...state.workflowJSON.nodes, ...nodes],
      connections: mergeConnections(state.workflowJSON.connections, connections),
    };

    // Create coordination log entry
    const logEntry: CoordinationLogEntry = {
      phase: 'builder',
      status: 'completed',
      timestamp: Date.now(),
      summary: `Created ${nodes.length} nodes: ${nodes.map(n => n.name).join(', ')}`,
      metadata: {
        nodesCreated: nodes.length,
        connectionsCreated: result.connections.length,
        nodeNames: nodes.map(n => n.name),
      },
    };

    return {
      workflowJSON,
      coordinationLog: [logEntry],
      nextPhase: 'configurator',
    };
  };
}

function buildConnections(
  connections: z.infer<typeof ConnectionSchema>[],
  nodes: WorkflowNode[]
): WorkflowConnections {
  const result: WorkflowConnections = {};

  // Create a map of node id to name
  const nodeIdToName = new Map(nodes.map(n => [n.id, n.name]));

  for (const conn of connections) {
    // Resolve node names (might be id or name)
    const sourceName = nodeIdToName.get(conn.sourceNode) || conn.sourceNode;
    const targetName = nodeIdToName.get(conn.targetNode) || conn.targetNode;

    if (!result[sourceName]) {
      result[sourceName] = {};
    }

    if (!result[sourceName][conn.connectionType]) {
      result[sourceName][conn.connectionType] = [];
    }

    // Ensure we have enough output arrays
    while (result[sourceName][conn.connectionType].length <= conn.sourceOutput) {
      result[sourceName][conn.connectionType].push([]);
    }

    result[sourceName][conn.connectionType][conn.sourceOutput].push({
      node: targetName,
      type: conn.connectionType,
      index: conn.targetInput,
    });
  }

  return result;
}

function mergeConnections(
  existing: WorkflowConnections,
  newConnections: WorkflowConnections
): WorkflowConnections {
  const result = { ...existing };

  for (const [sourceNode, outputs] of Object.entries(newConnections)) {
    if (!result[sourceNode]) {
      result[sourceNode] = {};
    }

    for (const [connectionType, targets] of Object.entries(outputs)) {
      if (!result[sourceNode][connectionType]) {
        result[sourceNode][connectionType] = targets;
      } else {
        // Merge targets arrays
        for (let i = 0; i < targets.length; i++) {
          if (!result[sourceNode][connectionType][i]) {
            result[sourceNode][connectionType][i] = targets[i];
          } else {
            result[sourceNode][connectionType][i] = [
              ...result[sourceNode][connectionType][i],
              ...targets[i],
            ];
          }
        }
      }
    }
  }

  return result;
}
