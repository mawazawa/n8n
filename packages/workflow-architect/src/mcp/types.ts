/**
 * MCP (Model Context Protocol) Type Definitions
 * Based on Anthropic's MCP specification
 * Reference: https://modelcontextprotocol.io
 */

/**
 * JSON Schema Property Definition
 */
export interface JSONSchemaProperty {
  type: string;
  description: string;
  enum?: unknown[];
  items?: Record<string, unknown>;
  properties?: Record<string, JSONSchemaProperty>;
  required?: boolean;
}

/**
 * MCP Tool Definition
 * Represents a tool that can be invoked by the AI model
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };
}

/**
 * MCP Resource Definition
 * Represents a resource that can be read by the AI model
 */
export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP Prompt Definition
 * Represents a prompt template that can be used by the AI model
 */
export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

/**
 * MCP Tool Call Request
 * Represents a request to invoke a tool
 */
export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * MCP Tool Result Response
 * Represents the result of a tool invocation
 */
export interface MCPToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: MCPResource }
  >;
  isError?: boolean;
}

/**
 * MCP Server Configuration
 * Defines the capabilities and metadata of the MCP server
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  capabilities: {
    tools?: boolean;
    resources?: {
      subscribe?: boolean;
      list?: boolean;
    };
    prompts?: boolean;
    logging?: boolean;
  };
}

/**
 * JSON-RPC 2.0 Request
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

/**
 * JSON-RPC 2.0 Response (Success)
 */
export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JSONRPCError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC Error Codes
 */
export const JSONRPCErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

/**
 * MCP Message Types
 */
export type MCPMessage =
  | { type: 'request'; data: JSONRPCRequest }
  | { type: 'response'; data: JSONRPCResponse }
  | { type: 'notification'; data: JSONRPCNotification };

/**
 * JSON-RPC 2.0 Notification (no response expected)
 */
export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

/**
 * MCP Resource Subscription
 */
export interface MCPResourceSubscription {
  uri: string;
  callback: (resource: MCPResource) => void;
}

/**
 * MCP Logging Levels
 */
export type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * MCP Log Entry
 */
export interface MCPLogEntry {
  level: MCPLogLevel;
  logger?: string;
  data: unknown;
  timestamp?: string;
}
