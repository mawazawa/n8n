/**
 * Get Node Parameters Tool
 * Allows the configurator agent to retrieve current node parameters
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { WorkflowDefinition } from '../types/workflow';
import { getNodeParameterReference } from '../graph/agents/configurator.prompt';

export const GetParamsInputSchema = z.object({
  node_name: z.string().describe('The name of the node to get parameters for'),
  include_reference: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include parameter reference for this node type'),
});

export type GetParamsInput = z.infer<typeof GetParamsInputSchema>;

export interface NodeParameterInfo {
  node_name: string;
  node_type: string;
  current_parameters: Record<string, unknown>;
  available_parameters?: string[];
  required_credentials?: string[];
  has_credentials: boolean;
}

/**
 * Get parameters for a node in the workflow
 */
export function getNodeParameters(
  workflow: WorkflowDefinition,
  input: GetParamsInput,
): NodeParameterInfo | null {
  const node = workflow.nodes.find((n) => n.name === input.node_name);

  if (!node) {
    return null;
  }

  const result: NodeParameterInfo = {
    node_name: node.name,
    node_type: node.type,
    current_parameters: node.parameters || {},
    has_credentials: !!(node as { credentials?: unknown }).credentials,
  };

  // Add parameter reference if requested
  if (input.include_reference) {
    const reference = getNodeParameterReference(node.type);
    if (reference) {
      result.available_parameters = reference.parameters;
      result.required_credentials = reference.credentials;
    }
  }

  return result;
}

/**
 * Create the get_node_parameters tool for LangGraph
 */
export function createGetParamsTool(
  getWorkflow: () => WorkflowDefinition,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_node_parameters',
    description:
      'Get current parameters for a specific node, including available parameters and required credentials for its type.',
    schema: GetParamsInputSchema,
    func: async (input: GetParamsInput): Promise<string> => {
      const workflow = getWorkflow();
      const result = getNodeParameters(workflow, input);

      if (!result) {
        return JSON.stringify({
          success: false,
          error: `Node "${input.node_name}" not found in workflow`,
        });
      }

      return JSON.stringify({
        success: true,
        ...result,
      });
    },
  });
}

/**
 * Get all nodes in the workflow with their parameter status
 */
export function getAllNodesStatus(workflow: WorkflowDefinition): NodeParameterInfo[] {
  return workflow.nodes.map((node) => ({
    node_name: node.name,
    node_type: node.type,
    current_parameters: node.parameters || {},
    has_credentials: !!(node as { credentials?: unknown }).credentials,
  }));
}
