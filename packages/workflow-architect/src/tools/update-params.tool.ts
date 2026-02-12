/**
 * Update Node Parameters Tool
 * Allows the configurator agent to update node parameters in a workflow
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { WorkflowDefinition, WorkflowNode } from '../types/workflow';

export const UpdateParamsInputSchema = z.object({
  node_name: z.string().describe('The name of the node to update'),
  parameters: z.record(z.unknown()).describe('Object of parameter key-value pairs to set'),
});

export type UpdateParamsInput = z.infer<typeof UpdateParamsInputSchema>;

export interface UpdateParamsResult {
  success: boolean;
  node_name: string;
  updated_parameters: string[];
  error?: string;
}

/**
 * Update parameters for a node in the workflow
 */
export function updateNodeParameters(
  workflow: WorkflowDefinition,
  input: UpdateParamsInput,
): UpdateParamsResult {
  const node = workflow.nodes.find((n) => n.name === input.node_name);

  if (!node) {
    return {
      success: false,
      node_name: input.node_name,
      updated_parameters: [],
      error: `Node "${input.node_name}" not found in workflow`,
    };
  }

  // Initialize parameters if not present
  if (!node.parameters) {
    node.parameters = {};
  }

  const updatedParams: string[] = [];

  // Update each parameter
  for (const [key, value] of Object.entries(input.parameters)) {
    node.parameters[key] = value;
    updatedParams.push(key);
  }

  return {
    success: true,
    node_name: input.node_name,
    updated_parameters: updatedParams,
  };
}

/**
 * Create the update_node_parameters tool for LangGraph
 */
export function createUpdateParamsTool(
  getWorkflow: () => WorkflowDefinition,
  updateWorkflow: (workflow: WorkflowDefinition) => void,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'update_node_parameters',
    description:
      'Update parameters for a specific node in the workflow. Pass the node name and an object of parameter key-value pairs.',
    schema: UpdateParamsInputSchema,
    func: async (input: UpdateParamsInput): Promise<string> => {
      const workflow = getWorkflow();
      const result = updateNodeParameters(workflow, input);

      if (result.success) {
        updateWorkflow(workflow);
        return JSON.stringify({
          success: true,
          message: `Updated ${result.updated_parameters.length} parameters for node "${input.node_name}"`,
          updated: result.updated_parameters,
        });
      }

      return JSON.stringify({
        success: false,
        error: result.error,
      });
    },
  });
}
