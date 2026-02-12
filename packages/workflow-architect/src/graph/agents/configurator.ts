/**
 * Configurator Agent
 * Configures node parameters and assigns credentials to workflow nodes
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { WorkflowDefinition, WorkflowNode } from '../../types/workflow';
import type { WorkflowBuilderStateType, SimpleWorkflow } from '../state';
import { CONFIGURATOR_SYSTEM_PROMPT, formatConfiguratorPrompt } from './configurator.prompt';
import { createUpdateParamsTool } from '../../tools/update-params.tool';
import { createGetParamsTool } from '../../tools/get-params.tool';
import { createAssignCredentialsTool, type AvailableCredential } from '../../tools/assign-credentials.tool';
import { createValidateParamsTool, validateWorkflow } from '../../tools/validate-params';
import { getRequiredCredentials } from '../../tools/assign-credentials.tool';

export interface ConfiguratorContext {
  nodesToConfigure: string[];
  userRequirements: string;
  availableCredentials: AvailableCredential[];
}

export interface ConfiguratorResult {
  configuredNodes: string[];
  assignedCredentials: { node: string; credentialType: string }[];
  validationIssues: { node: string; issues: string[] }[];
  message: string;
}

/**
 * Create the configurator agent function for LangGraph
 */
export function createConfiguratorAgent(
  getCredentials: () => Promise<AvailableCredential[]>,
) {
  // Model for configuration tasks
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-20250514',
    temperature: 0.2, // Lower temperature for more consistent configurations
    maxTokens: 4096,
  });

  return async (state: WorkflowBuilderStateType): Promise<Partial<WorkflowBuilderStateType>> => {
    const currentWorkflow = state.workflowJSON;
    const messages = state.messages;

    if (!currentWorkflow || currentWorkflow.nodes.length === 0) {
      return {
        messages: [
          ...messages,
          new AIMessage('No workflow nodes to configure. Please build a workflow first.'),
        ],
      };
    }

    // Get available credentials
    const availableCredentials = await getCredentials();

    // Convert SimpleWorkflow to WorkflowDefinition for validation
    const workflowForValidation: WorkflowDefinition = {
      ...currentWorkflow,
      active: false,
    };

    // Identify nodes that need configuration
    const requiredCreds = getRequiredCredentials(workflowForValidation);
    const validationResults = validateWorkflow(workflowForValidation);
    const nodesNeedingConfig = validationResults
      .filter((r) => !r.is_valid || r.missing_credentials)
      .map((r) => r.node_name);

    // Create a mutable copy of the workflow
    let workflowCopy: WorkflowDefinition = JSON.parse(JSON.stringify(currentWorkflow));

    // Create tools with workflow access
    const tools = [
      createGetParamsTool(() => workflowCopy),
      createUpdateParamsTool(
        () => workflowCopy,
        (updated) => {
          workflowCopy = updated;
        },
      ),
      createAssignCredentialsTool(
        () => workflowCopy,
        (updated) => {
          workflowCopy = updated;
        },
        async () => availableCredentials,
      ),
      createValidateParamsTool(() => workflowCopy),
    ];

    // Bind tools to model
    const modelWithTools = model.bindTools(tools);

    // Format the task prompt
    const taskPrompt = formatConfiguratorPrompt({
      workflow_json: JSON.stringify(workflowCopy, null, 2),
      nodes_to_configure: nodesNeedingConfig.join(', ') || 'All nodes',
      user_requirements: messages
        .filter((m) => m._getType() === 'human')
        .map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
        .join('\n'),
      available_credentials: availableCredentials.map((c) => `${c.name} (${c.type})`).join('\n'),
    });

    // Run the agent loop
    let response = await modelWithTools.invoke([
      new SystemMessage(CONFIGURATOR_SYSTEM_PROMPT),
      new HumanMessage(taskPrompt),
    ]);

    const configuredNodes: string[] = [];
    const assignedCredentials: { node: string; credentialType: string }[] = [];
    const maxIterations = 10;
    let iterations = 0;

    // Agent loop to handle tool calls
    while (response.tool_calls && response.tool_calls.length > 0 && iterations < maxIterations) {
      iterations++;

      // Execute tool calls
      const toolResults = await Promise.all(
        response.tool_calls.map(async (toolCall) => {
          const tool = tools.find((t) => t.name === toolCall.name);
          if (!tool) {
            return {
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: `Tool ${toolCall.name} not found` }),
            };
          }

          try {
            const result = await tool.invoke(toolCall.args);

            // Track what was configured
            if (toolCall.name === 'update_node_parameters') {
              configuredNodes.push(toolCall.args.node_name);
            }
            if (toolCall.name === 'assign_credentials') {
              assignedCredentials.push({
                node: toolCall.args.node_name,
                credentialType: toolCall.args.credential_type,
              });
            }

            return {
              tool_call_id: toolCall.id,
              output: typeof result === 'string' ? result : JSON.stringify(result),
            };
          } catch (error) {
            return {
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: String(error) }),
            };
          }
        }),
      );

      // Continue the conversation with tool results
      const toolMessages = toolResults.map((r) => ({
        role: 'tool' as const,
        content: r.output,
        tool_call_id: r.tool_call_id,
      }));

      response = await modelWithTools.invoke([
        new SystemMessage(CONFIGURATOR_SYSTEM_PROMPT),
        new HumanMessage(taskPrompt),
        response,
        ...toolMessages,
      ]);
    }

    // Final validation
    const finalValidation = validateWorkflow(workflowCopy);
    const validationIssues = finalValidation
      .filter((r) => r.issues.length > 0)
      .map((r) => ({
        node: r.node_name,
        issues: r.issues.map((i) => i.message),
      }));

    // Generate response message
    const uniqueConfiguredNodes = [...new Set(configuredNodes)];
    let responseMessage = '';

    if (uniqueConfiguredNodes.length > 0) {
      responseMessage += `Configured ${uniqueConfiguredNodes.length} nodes: ${uniqueConfiguredNodes.join(', ')}. `;
    }

    if (assignedCredentials.length > 0) {
      responseMessage += `Assigned credentials to: ${assignedCredentials.map((c) => c.node).join(', ')}. `;
    }

    if (validationIssues.length > 0) {
      responseMessage += `Validation warnings: ${validationIssues.length} nodes have issues.`;
    } else {
      responseMessage += 'All nodes validated successfully.';
    }

    // Extract final response content
    const finalContent = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => 'text' in c ? c.text : '').join('');

    return {
      workflowJSON: workflowCopy as unknown as SimpleWorkflow,
      messages: [
        ...messages,
        new AIMessage(finalContent || responseMessage),
      ],
    };
  };
}

/**
 * Simple configurator for non-agent use cases
 */
export async function configureWorkflowDefaults(
  workflow: WorkflowDefinition,
  credentials: AvailableCredential[],
): Promise<WorkflowDefinition> {
  const result = JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;

  for (const node of result.nodes) {
    // Set default parameters based on node type
    if (node.type.includes('httpRequest') && !node.parameters?.method) {
      node.parameters = { ...node.parameters, method: 'GET' };
    }

    // Auto-assign credentials if only one option available
    const requiredCreds = getRequiredCredentials({ ...workflow, nodes: [node] });
    if (requiredCreds.length > 0) {
      const required = requiredCreds[0];
      for (const credType of required.credential_types) {
        const matching = credentials.filter((c) => c.type === credType);
        if (matching.length === 1) {
          const nodeWithCreds = node as typeof node & {
            credentials?: Record<string, { name: string }>;
          };
          if (!nodeWithCreds.credentials) {
            nodeWithCreds.credentials = {};
          }
          nodeWithCreds.credentials[credType] = { id: matching[0].id, name: matching[0].name };
        }
      }
    }
  }

  return result;
}
