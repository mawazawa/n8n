/**
 * Parameter Validation Utilities
 * Validates node parameters against expected types and constraints
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { WorkflowDefinition } from '../types/workflow';
import { getNodeParameterReference } from '../graph/agents/configurator.prompt';

export const ValidateParamsInputSchema = z.object({
  node_name: z.string().describe('The name of the node to validate'),
});

export type ValidateParamsInput = z.infer<typeof ValidateParamsInputSchema>;

export interface ValidationIssue {
  parameter: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  node_name: string;
  node_type: string;
  is_valid: boolean;
  issues: ValidationIssue[];
  missing_credentials: boolean;
}

// Parameter type definitions for common node types
const PARAMETER_VALIDATORS: Record<string, Record<string, z.ZodType<unknown>>> = {
  'n8n-nodes-base.httpRequest': {
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    url: z.string().url().or(z.string().startsWith('=')), // Allow expressions
    authentication: z.enum(['none', 'predefinedCredentialType', 'genericCredentialType']).optional(),
  },
  'n8n-nodes-base.slack': {
    resource: z.enum(['channel', 'message', 'reaction', 'star', 'file', 'user']),
    operation: z.string().min(1),
    channel: z.string().optional(),
  },
  'n8n-nodes-base.gmail': {
    resource: z.enum(['message', 'draft', 'label', 'thread']),
    operation: z.string().min(1),
    subject: z.string().optional(),
  },
  'n8n-nodes-base.postgres': {
    operation: z.enum(['executeQuery', 'insert', 'update', 'upsert', 'delete', 'select']),
    query: z.string().optional(),
    table: z.string().optional(),
  },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': {
    model: z.string().min(1),
  },
  '@n8n/n8n-nodes-langchain.agent': {
    promptType: z.enum(['define', 'auto']).optional(),
    text: z.string().optional(),
  },
};

/**
 * Validate parameters for a node
 */
export function validateNodeParameters(
  workflow: WorkflowDefinition,
  nodeName: string,
): ValidationResult {
  const node = workflow.nodes.find((n) => n.name === nodeName);

  if (!node) {
    return {
      node_name: nodeName,
      node_type: 'unknown',
      is_valid: false,
      issues: [{ parameter: 'node', message: 'Node not found', severity: 'error' }],
      missing_credentials: false,
    };
  }

  const issues: ValidationIssue[] = [];
  const parameters = node.parameters || {};

  // Check against known validators
  const validators = PARAMETER_VALIDATORS[node.type];
  if (validators) {
    for (const [param, validator] of Object.entries(validators)) {
      const value = parameters[param];

      // Skip optional parameters that are not set
      if (value === undefined) {
        if (!validator.isOptional()) {
          issues.push({
            parameter: param,
            message: `Required parameter "${param}" is missing`,
            severity: 'warning', // Warning because it might be set dynamically
          });
        }
        continue;
      }

      // Validate the value
      const result = validator.safeParse(value);
      if (!result.success) {
        issues.push({
          parameter: param,
          message: `Invalid value for "${param}": ${result.error.issues[0].message}`,
          severity: 'error',
        });
      }
    }
  }

  // Check for credentials
  const reference = getNodeParameterReference(node.type);
  const nodeWithCreds = node as typeof node & { credentials?: Record<string, unknown> };
  const hasCredentials = nodeWithCreds.credentials && Object.keys(nodeWithCreds.credentials).length > 0;
  const needsCredentials = reference && reference.credentials.length > 0;
  const missingCredentials = needsCredentials && !hasCredentials;

  if (missingCredentials) {
    issues.push({
      parameter: 'credentials',
      message: `Node requires credentials (${reference!.credentials.join(', ')})`,
      severity: 'warning',
    });
  }

  // Check for empty required fields
  for (const [key, value] of Object.entries(parameters)) {
    if (value === '' || value === null) {
      issues.push({
        parameter: key,
        message: `Parameter "${key}" is empty`,
        severity: 'warning',
      });
    }
  }

  return {
    node_name: nodeName,
    node_type: node.type,
    is_valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    missing_credentials: missingCredentials,
  };
}

/**
 * Validate all nodes in a workflow
 */
export function validateWorkflow(workflow: WorkflowDefinition): ValidationResult[] {
  return workflow.nodes.map((node) => validateNodeParameters(workflow, node.name));
}

/**
 * Create the validate_parameters tool for LangGraph
 */
export function createValidateParamsTool(
  getWorkflow: () => WorkflowDefinition,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'validate_parameters',
    description: 'Validate parameters for a specific node. Returns validation issues if any.',
    schema: ValidateParamsInputSchema,
    func: async (input: ValidateParamsInput): Promise<string> => {
      const workflow = getWorkflow();
      const result = validateNodeParameters(workflow, input.node_name);

      return JSON.stringify(result);
    },
  });
}

/**
 * Check if workflow is ready for deployment
 */
export function isWorkflowReady(workflow: WorkflowDefinition): {
  ready: boolean;
  blockers: string[];
  warnings: string[];
} {
  const results = validateWorkflow(workflow);
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const result of results) {
    for (const issue of result.issues) {
      const message = `${result.node_name}: ${issue.message}`;
      if (issue.severity === 'error') {
        blockers.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}
