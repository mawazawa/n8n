/**
 * MCP (Model Context Protocol) Server Integration
 * Main exports for the MCP server implementation
 */

// Core server
export { MCPServer } from './server.js';
export type {
  MCPToolHandler,
  MCPResourceReader,
  MCPPromptGenerator,
  MCPServerOptions,
} from './server.js';

// Types
export type {
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolCall,
  MCPToolResult,
  MCPServerConfig,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  MCPMessage,
  MCPResourceSubscription,
  MCPLogLevel,
  MCPLogEntry,
} from './types.js';

export { JSONRPCErrorCode } from './types.js';

// Tools
export {
  createWorkflowTool,
  modifyWorkflowTool,
  searchTemplatesTool,
  executeWorkflowTool,
  getExecutionStatusTool,
  registerWorkflowTools,
  createWorkflowHandler,
  modifyWorkflowHandler,
  searchTemplatesHandler,
  executeWorkflowHandler,
  getExecutionStatusHandler,
} from './tools/index.js';

export type { WorkflowToolContext } from './tools/index.js';

// Resources
export {
  currentWorkflowResource,
  latestExecutionResource,
  createWorkflowResource,
  createExecutionResource,
  createTemplateCategoryResource,
  registerWorkflowResources,
  registerWorkflowById,
  registerExecutionById,
  createCurrentWorkflowReader,
  createWorkflowReader,
  createLatestExecutionReader,
  createExecutionReader,
  createTemplateCategoryReader,
} from './resources/index.js';

export type { WorkflowResourceContext } from './resources/index.js';

// Prompts
export {
  buildWorkflowPrompt,
  debugWorkflowPrompt,
  optimizeWorkflowPrompt,
  registerWorkflowPrompts,
  createBuildWorkflowGenerator,
  createDebugWorkflowGenerator,
  createOptimizeWorkflowGenerator,
} from './prompts/index.js';
