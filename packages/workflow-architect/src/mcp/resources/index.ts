/**
 * MCP Workflow Resources
 * Provides read access to workflow state, executions, and templates
 */

import type { MCPResource, MCPToolResult } from '../types.js';
import type { MCPResourceReader } from '../server.js';
import type { WorkflowDefinition, ExecutionResult, WorkflowCategory } from '../../types/workflow.js';

/**
 * Workflow Resource Context
 * Provides access to workflow data
 */
export interface WorkflowResourceContext {
  getCurrentWorkflow: () => Promise<WorkflowDefinition | null>;
  getWorkflow: (id: string) => Promise<WorkflowDefinition>;
  getLatestExecution: () => Promise<ExecutionResult | null>;
  getExecution: (id: string) => Promise<ExecutionResult>;
  getTemplatesByCategory: (category: string) => Promise<WorkflowDefinition[]>;
}

/**
 * Current Workflow Resource
 * URI: workflow://current
 */
export const currentWorkflowResource: MCPResource = {
  uri: 'workflow://current',
  name: 'Current Workflow',
  description: 'The currently active workflow being edited or built',
  mimeType: 'application/json',
  metadata: {
    dynamic: true,
    subscribable: true,
  },
};

export function createCurrentWorkflowReader(context: WorkflowResourceContext): MCPResourceReader {
  return async (uri: string): Promise<MCPToolResult> => {
    try {
      const workflow = await context.getCurrentWorkflow();

      if (!workflow) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'No current workflow available',
                message: 'There is no workflow currently being edited',
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              workflow: {
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                nodes: workflow.nodes,
                connections: workflow.connections,
                settings: workflow.settings,
                tags: workflow.tags,
              },
              metadata: {
                nodeCount: workflow.nodes.length,
                connectionCount: Object.keys(workflow.connections).length,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading current workflow: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Workflow by ID Resource
 * URI: workflow://{id}
 */
export function createWorkflowResource(id: string): MCPResource {
  return {
    uri: `workflow://${id}`,
    name: `Workflow ${id}`,
    description: `Specific workflow with ID ${id}`,
    mimeType: 'application/json',
    metadata: {
      workflowId: id,
    },
  };
}

export function createWorkflowReader(context: WorkflowResourceContext): MCPResourceReader {
  return async (uri: string): Promise<MCPToolResult> => {
    try {
      // Extract ID from URI: workflow://{id}
      const match = uri.match(/^workflow:\/\/(.+)$/);
      if (!match || match[1] === 'current') {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid workflow URI format. Expected: workflow://{id}',
            },
          ],
          isError: true,
        };
      }

      const workflowId = match[1];
      const workflow = await context.getWorkflow(workflowId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              workflow: {
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                nodes: workflow.nodes,
                connections: workflow.connections,
                settings: workflow.settings,
                tags: workflow.tags,
              },
              metadata: {
                nodeCount: workflow.nodes.length,
                connectionCount: Object.keys(workflow.connections).length,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading workflow: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Latest Execution Resource
 * URI: execution://latest
 */
export const latestExecutionResource: MCPResource = {
  uri: 'execution://latest',
  name: 'Latest Execution',
  description: 'The most recent workflow execution result',
  mimeType: 'application/json',
  metadata: {
    dynamic: true,
    subscribable: true,
  },
};

export function createLatestExecutionReader(context: WorkflowResourceContext): MCPResourceReader {
  return async (uri: string): Promise<MCPToolResult> => {
    try {
      const execution = await context.getLatestExecution();

      if (!execution) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'No executions available',
                message: 'There are no workflow executions yet',
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              execution: {
                id: execution.id,
                status: execution.status,
                finished: execution.finished,
                mode: execution.mode,
                startedAt: execution.startedAt,
                stoppedAt: execution.stoppedAt,
                data: execution.data,
              },
              metadata: {
                hasError: execution.status === 'error',
                errorMessage: execution.data?.resultData?.error?.message,
                errorNode: execution.data?.resultData?.error?.node,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading latest execution: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Execution by ID Resource
 * URI: execution://{id}
 */
export function createExecutionResource(id: string): MCPResource {
  return {
    uri: `execution://${id}`,
    name: `Execution ${id}`,
    description: `Specific workflow execution with ID ${id}`,
    mimeType: 'application/json',
    metadata: {
      executionId: id,
    },
  };
}

export function createExecutionReader(context: WorkflowResourceContext): MCPResourceReader {
  return async (uri: string): Promise<MCPToolResult> => {
    try {
      // Extract ID from URI: execution://{id}
      const match = uri.match(/^execution:\/\/(.+)$/);
      if (!match || match[1] === 'latest') {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid execution URI format. Expected: execution://{id}',
            },
          ],
          isError: true,
        };
      }

      const executionId = match[1];
      const execution = await context.getExecution(executionId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              execution: {
                id: execution.id,
                status: execution.status,
                finished: execution.finished,
                mode: execution.mode,
                startedAt: execution.startedAt,
                stoppedAt: execution.stoppedAt,
                data: execution.data,
              },
              metadata: {
                hasError: execution.status === 'error',
                errorMessage: execution.data?.resultData?.error?.message,
                errorNode: execution.data?.resultData?.error?.node,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading execution: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Template by Category Resource
 * URI: template://{category}
 */
export function createTemplateCategoryResource(category: WorkflowCategory): MCPResource {
  return {
    uri: `template://${category}`,
    name: `${category} Templates`,
    description: `Workflow templates in the ${category} category`,
    mimeType: 'application/json',
    metadata: {
      category,
    },
  };
}

export function createTemplateCategoryReader(context: WorkflowResourceContext): MCPResourceReader {
  return async (uri: string): Promise<MCPToolResult> => {
    try {
      // Extract category from URI: template://{category}
      const match = uri.match(/^template:\/\/(.+)$/);
      if (!match) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid template URI format. Expected: template://{category}',
            },
          ],
          isError: true,
        };
      }

      const category = match[1];
      const templates = await context.getTemplatesByCategory(category);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              category,
              count: templates.length,
              templates: templates.map(t => ({
                id: t.id,
                name: t.name,
                nodes: t.nodes.map(n => ({
                  type: n.type,
                  name: n.name,
                })),
                metadata: {
                  nodeCount: t.nodes.length,
                  connectionCount: Object.keys(t.connections).length,
                  tags: t.tags,
                },
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
            text: `Error reading templates: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Register all workflow resources
 */
export function registerWorkflowResources(
  server: { registerResource: (resource: MCPResource, reader: MCPResourceReader) => void },
  context: WorkflowResourceContext
): void {
  // Static resources
  server.registerResource(currentWorkflowResource, createCurrentWorkflowReader(context));
  server.registerResource(latestExecutionResource, createLatestExecutionReader(context));

  // Dynamic resources (registered with wildcard handlers)
  // Note: In a full implementation, you'd need to dynamically register these
  // based on available workflows/executions or use a pattern-matching system
  const workflowReader = createWorkflowReader(context);
  const executionReader = createExecutionReader(context);
  const templateReader = createTemplateCategoryReader(context);

  // Register common template categories
  const categories: WorkflowCategory[] = [
    'ai-agent',
    'rag-pipeline',
    'data-pipeline',
    'integration',
    'automation',
    'monitoring',
    'approval-flow',
    'error-handling',
    'batch-processing',
  ];

  for (const category of categories) {
    server.registerResource(createTemplateCategoryResource(category), templateReader);
  }
}

/**
 * Helper to dynamically register workflow resource
 */
export function registerWorkflowById(
  server: { registerResource: (resource: MCPResource, reader: MCPResourceReader) => void },
  context: WorkflowResourceContext,
  workflowId: string
): void {
  server.registerResource(createWorkflowResource(workflowId), createWorkflowReader(context));
}

/**
 * Helper to dynamically register execution resource
 */
export function registerExecutionById(
  server: { registerResource: (resource: MCPResource, reader: MCPResourceReader) => void },
  context: WorkflowResourceContext,
  executionId: string
): void {
  server.registerResource(createExecutionResource(executionId), createExecutionReader(context));
}
