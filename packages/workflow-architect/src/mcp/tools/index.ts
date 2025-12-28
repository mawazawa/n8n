/**
 * MCP Workflow Tools
 * Built-in tools for workflow creation, modification, and execution
 */

import { z } from 'zod';
import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from '../server.js';
import type { WorkflowDefinition, ExecutionResult } from '../../types/workflow.js';
import type { WorkflowContext } from '../../types/agent.js';

/**
 * Workflow Tool Context
 * Provides access to workflow operations
 */
export interface WorkflowToolContext {
  createWorkflow: (description: string, context?: WorkflowContext) => Promise<WorkflowDefinition>;
  modifyWorkflow: (workflowId: string, instructions: string, context?: WorkflowContext) => Promise<WorkflowDefinition>;
  executeWorkflow: (workflowId: string, inputData?: Record<string, unknown>) => Promise<ExecutionResult>;
  getExecution: (executionId: string) => Promise<ExecutionResult>;
  searchTemplates: (query: string, category?: string) => Promise<Array<{ id: string; name: string; description: string }>>;
}

/**
 * Create Workflow Tool
 */
const createWorkflowSchema = z.object({
  description: z.string().min(10).describe('Natural language description of the workflow to create'),
  context: z.object({
    executionData: z.record(z.unknown()).optional(),
    currentWorkflow: z.object({
      id: z.string().optional(),
      name: z.string().optional(),
    }).optional(),
  }).optional().describe('Optional context about current workflow or execution data'),
});

export const createWorkflowTool: MCPTool = {
  name: 'create_workflow',
  description: 'Create a new n8n workflow from a natural language description. This tool uses AI agents to discover nodes, configure parameters, and build a complete workflow.',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description of the workflow to create (minimum 10 characters)',
      },
      context: {
        type: 'object',
        description: 'Optional context about current workflow or execution data',
        properties: {
          executionData: {
            type: 'object',
            description: 'Data from a previous workflow execution',
          },
          currentWorkflow: {
            type: 'object',
            description: 'Current workflow being modified',
            properties: {
              id: { type: 'string', description: 'Workflow ID' },
              name: { type: 'string', description: 'Workflow name' },
            },
          },
        },
      },
    },
    required: ['description'],
  },
};

export function createWorkflowHandler(context: WorkflowToolContext): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const validated = createWorkflowSchema.parse(args);
      const workflow = await context.createWorkflow(validated.description, validated.context);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              workflow: {
                id: workflow.id,
                name: workflow.name,
                nodes: workflow.nodes.length,
                active: workflow.active,
              },
              message: `Successfully created workflow "${workflow.name}" with ${workflow.nodes.length} nodes`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating workflow: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Modify Workflow Tool
 */
const modifyWorkflowSchema = z.object({
  workflowId: z.string().min(1).describe('ID of the workflow to modify'),
  instructions: z.string().min(10).describe('Natural language instructions for modifying the workflow'),
  context: z.object({
    executionData: z.record(z.unknown()).optional(),
    currentWorkflow: z.object({
      nodes: z.array(z.any()).optional(),
      connections: z.record(z.any()).optional(),
    }).optional(),
  }).optional().describe('Optional context about current workflow state or execution data'),
});

export const modifyWorkflowTool: MCPTool = {
  name: 'modify_workflow',
  description: 'Modify an existing n8n workflow based on natural language instructions. Can add, remove, or update nodes and connections.',
  inputSchema: {
    type: 'object',
    properties: {
      workflowId: {
        type: 'string',
        description: 'ID of the workflow to modify',
      },
      instructions: {
        type: 'string',
        description: 'Natural language instructions for modifying the workflow (minimum 10 characters)',
      },
      context: {
        type: 'object',
        description: 'Optional context about current workflow state or execution data',
        properties: {
          executionData: {
            type: 'object',
            description: 'Data from a previous workflow execution',
          },
          currentWorkflow: {
            type: 'object',
            description: 'Current workflow state',
            properties: {
              nodes: {
                type: 'array',
                description: 'Current workflow nodes',
              },
              connections: {
                type: 'object',
                description: 'Current workflow connections',
              },
            },
          },
        },
      },
    },
    required: ['workflowId', 'instructions'],
  },
};

export function modifyWorkflowHandler(context: WorkflowToolContext): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const validated = modifyWorkflowSchema.parse(args);
      const workflow = await context.modifyWorkflow(validated.workflowId, validated.instructions, validated.context);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              workflow: {
                id: workflow.id,
                name: workflow.name,
                nodes: workflow.nodes.length,
                active: workflow.active,
              },
              message: `Successfully modified workflow "${workflow.name}"`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error modifying workflow: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Search Templates Tool
 */
const searchTemplatesSchema = z.object({
  query: z.string().min(3).describe('Search query for finding workflow templates'),
  category: z.enum([
    'ai-agent',
    'rag-pipeline',
    'data-pipeline',
    'integration',
    'automation',
    'monitoring',
    'approval-flow',
    'error-handling',
    'batch-processing',
  ]).optional().describe('Optional category to filter templates'),
  limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return'),
});

export const searchTemplatesTool: MCPTool = {
  name: 'search_templates',
  description: 'Search the workflow template library for pre-built workflows. Templates can be used as starting points or examples.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for finding workflow templates (minimum 3 characters)',
      },
      category: {
        type: 'string',
        description: 'Optional category to filter templates',
        enum: [
          'ai-agent',
          'rag-pipeline',
          'data-pipeline',
          'integration',
          'automation',
          'monitoring',
          'approval-flow',
          'error-handling',
          'batch-processing',
        ],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default: 10)',
      },
    },
    required: ['query'],
  },
};

export function searchTemplatesHandler(context: WorkflowToolContext): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const validated = searchTemplatesSchema.parse(args);
      const templates = await context.searchTemplates(validated.query, validated.category);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: templates.length,
              templates: templates.map(t => ({
                id: t.id,
                name: t.name,
                description: t.description,
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching templates: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Execute Workflow Tool
 */
const executeWorkflowSchema = z.object({
  workflowId: z.string().min(1).describe('ID of the workflow to execute'),
  inputData: z.record(z.unknown()).optional().describe('Optional input data for the workflow execution'),
  waitForCompletion: z.boolean().default(true).describe('Whether to wait for the workflow to complete before returning'),
});

export const executeWorkflowTool: MCPTool = {
  name: 'execute_workflow',
  description: 'Execute a workflow and optionally wait for completion. Returns the execution ID and status.',
  inputSchema: {
    type: 'object',
    properties: {
      workflowId: {
        type: 'string',
        description: 'ID of the workflow to execute',
      },
      inputData: {
        type: 'object',
        description: 'Optional input data for the workflow execution',
      },
      waitForCompletion: {
        type: 'boolean',
        description: 'Whether to wait for the workflow to complete before returning (default: true)',
      },
    },
    required: ['workflowId'],
  },
};

export function executeWorkflowHandler(context: WorkflowToolContext): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const validated = executeWorkflowSchema.parse(args);
      const execution = await context.executeWorkflow(validated.workflowId, validated.inputData);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              execution: {
                id: execution.id,
                status: execution.status,
                finished: execution.finished,
                startedAt: execution.startedAt,
                stoppedAt: execution.stoppedAt,
              },
              message: `Workflow execution ${execution.finished ? 'completed' : 'started'} with status: ${execution.status}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing workflow: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Get Execution Status Tool
 */
const getExecutionStatusSchema = z.object({
  executionId: z.string().min(1).describe('ID of the execution to check'),
  includeData: z.boolean().default(false).describe('Whether to include full execution data in the response'),
});

export const getExecutionStatusTool: MCPTool = {
  name: 'get_execution_status',
  description: 'Check the status of a workflow execution. Optionally retrieve the full execution data including node outputs.',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'ID of the execution to check',
      },
      includeData: {
        type: 'boolean',
        description: 'Whether to include full execution data in the response (default: false)',
      },
    },
    required: ['executionId'],
  },
};

export function getExecutionStatusHandler(context: WorkflowToolContext): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const validated = getExecutionStatusSchema.parse(args);
      const execution = await context.getExecution(validated.executionId);

      const response: any = {
        success: true,
        execution: {
          id: execution.id,
          status: execution.status,
          finished: execution.finished,
          startedAt: execution.startedAt,
          stoppedAt: execution.stoppedAt,
          mode: execution.mode,
        },
      };

      if (validated.includeData && execution.data) {
        response.execution.data = execution.data;
      }

      if (execution.data?.resultData?.error) {
        response.error = execution.data.resultData.error;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting execution status: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Register all workflow tools
 */
export function registerWorkflowTools(
  server: { registerTool: (tool: MCPTool, handler: MCPToolHandler) => void },
  context: WorkflowToolContext
): void {
  server.registerTool(createWorkflowTool, createWorkflowHandler(context));
  server.registerTool(modifyWorkflowTool, modifyWorkflowHandler(context));
  server.registerTool(searchTemplatesTool, searchTemplatesHandler(context));
  server.registerTool(executeWorkflowTool, executeWorkflowHandler(context));
  server.registerTool(getExecutionStatusTool, getExecutionStatusHandler(context));
}
