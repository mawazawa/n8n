/**
 * Assign Credentials Tool
 * Allows the configurator agent to assign credentials to nodes
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { WorkflowDefinition, WorkflowNode } from '../types/workflow';
import { getNodeParameterReference } from '../graph/agents/configurator.prompt';

export const AssignCredentialsInputSchema = z.object({
  node_name: z.string().describe('The name of the node to assign credentials to'),
  credential_type: z.string().describe('The type of credential (e.g., "openAiApi", "slackOAuth2Api")'),
  credential_name: z.string().describe('The name of the credential to use'),
});

export type AssignCredentialsInput = z.infer<typeof AssignCredentialsInputSchema>;

export interface AvailableCredential {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
}

export interface AssignCredentialsResult {
  success: boolean;
  node_name: string;
  credential_type: string;
  credential_name: string;
  error?: string;
}

/**
 * Assign credentials to a node
 */
export function assignCredentials(
  workflow: WorkflowDefinition,
  input: AssignCredentialsInput,
  availableCredentials: AvailableCredential[],
): AssignCredentialsResult {
  const node = workflow.nodes.find((n) => n.name === input.node_name) as WorkflowNode & {
    credentials?: Record<string, { id?: string; name: string }>;
  };

  if (!node) {
    return {
      success: false,
      node_name: input.node_name,
      credential_type: input.credential_type,
      credential_name: input.credential_name,
      error: `Node "${input.node_name}" not found in workflow`,
    };
  }

  // Check if credential exists
  const credential = availableCredentials.find(
    (c) => c.name === input.credential_name && c.type === input.credential_type,
  );

  if (!credential) {
    return {
      success: false,
      node_name: input.node_name,
      credential_type: input.credential_type,
      credential_name: input.credential_name,
      error: `Credential "${input.credential_name}" of type "${input.credential_type}" not found`,
    };
  }

  // Check if node type accepts this credential type
  const reference = getNodeParameterReference(node.type);
  if (reference && !reference.credentials.includes(input.credential_type)) {
    return {
      success: false,
      node_name: input.node_name,
      credential_type: input.credential_type,
      credential_name: input.credential_name,
      error: `Node type "${node.type}" does not accept credential type "${input.credential_type}". Valid types: ${reference.credentials.join(', ')}`,
    };
  }

  // Initialize credentials object if not present
  if (!node.credentials) {
    node.credentials = {};
  }

  // Assign the credential
  node.credentials[input.credential_type] = {
    id: credential.id,
    name: input.credential_name,
  };

  return {
    success: true,
    node_name: input.node_name,
    credential_type: input.credential_type,
    credential_name: input.credential_name,
  };
}

/**
 * Create the assign_credentials tool for LangGraph
 */
export function createAssignCredentialsTool(
  getWorkflow: () => WorkflowDefinition,
  updateWorkflow: (workflow: WorkflowDefinition) => void,
  getAvailableCredentials: () => Promise<AvailableCredential[]>,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'assign_credentials',
    description:
      'Assign credentials to a node. Specify the node name, credential type, and credential name.',
    schema: AssignCredentialsInputSchema,
    func: async (input: AssignCredentialsInput): Promise<string> => {
      const workflow = getWorkflow();
      const availableCredentials = await getAvailableCredentials();
      const result = assignCredentials(workflow, input, availableCredentials);

      if (result.success) {
        updateWorkflow(workflow);
        return JSON.stringify({
          success: true,
          message: `Assigned credential "${input.credential_name}" (${input.credential_type}) to node "${input.node_name}"`,
        });
      }

      return JSON.stringify({
        success: false,
        error: result.error,
      });
    },
  });
}

/**
 * Get credentials required by nodes in workflow
 */
export function getRequiredCredentials(
  workflow: WorkflowDefinition,
): { node_name: string; node_type: string; credential_types: string[] }[] {
  const requirements: { node_name: string; node_type: string; credential_types: string[] }[] = [];

  for (const node of workflow.nodes) {
    const reference = getNodeParameterReference(node.type);
    if (reference && reference.credentials.length > 0) {
      const nodeWithCreds = node as WorkflowNode & {
        credentials?: Record<string, unknown>;
      };
      const hasCredentials = nodeWithCreds.credentials && Object.keys(nodeWithCreds.credentials).length > 0;

      if (!hasCredentials) {
        requirements.push({
          node_name: node.name,
          node_type: node.type,
          credential_types: reference.credentials,
        });
      }
    }
  }

  return requirements;
}
