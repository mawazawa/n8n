/**
 * MCP Server Implementation
 * Implements JSON-RPC 2.0 transport for Model Context Protocol
 */

import { EventEmitter } from 'events';
import type {
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPServerConfig,
  MCPToolCall,
  MCPToolResult,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  MCPResourceSubscription,
  MCPLogEntry,
  MCPLogLevel,
} from './types.js';
import { JSONRPCErrorCode } from './types.js';

/**
 * Tool handler function type
 */
export type MCPToolHandler = (args: Record<string, unknown>) => Promise<MCPToolResult>;

/**
 * Resource reader function type
 */
export type MCPResourceReader = (uri: string) => Promise<MCPToolResult>;

/**
 * Prompt generator function type
 */
export type MCPPromptGenerator = (args?: Record<string, unknown>) => Promise<{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}>;

/**
 * MCP Server Options
 */
export interface MCPServerOptions {
  name: string;
  version: string;
  capabilities?: MCPServerConfig['capabilities'];
}

/**
 * MCP Server Class
 * Handles JSON-RPC 2.0 message routing and protocol implementation
 */
export class MCPServer extends EventEmitter {
  private config: MCPServerConfig;
  private tools: Map<string, { definition: MCPTool; handler: MCPToolHandler }> = new Map();
  private resources: Map<string, { definition: MCPResource; reader: MCPResourceReader }> = new Map();
  private prompts: Map<string, { definition: MCPPrompt; generator: MCPPromptGenerator }> = new Map();
  private subscriptions: Map<string, Set<MCPResourceSubscription>> = new Map();
  private isInitialized = false;

  constructor(options: MCPServerOptions) {
    super();
    this.config = {
      name: options.name,
      version: options.version,
      capabilities: {
        tools: true,
        resources: {
          subscribe: true,
          list: true,
        },
        prompts: true,
        logging: true,
        ...options.capabilities,
      },
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.emit('start');
    this.log('info', 'MCP Server started', { config: this.config });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.isInitialized = false;
    this.subscriptions.clear();
    this.emit('stop');
    this.log('info', 'MCP Server stopped');
  }

  /**
   * Register a tool
   */
  registerTool(definition: MCPTool, handler: MCPToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    this.log('debug', 'Tool registered', { tool: definition.name });
  }

  /**
   * Register a resource
   */
  registerResource(definition: MCPResource, reader: MCPResourceReader): void {
    this.resources.set(definition.uri, { definition, reader });
    this.log('debug', 'Resource registered', { uri: definition.uri });
  }

  /**
   * Register a prompt
   */
  registerPrompt(definition: MCPPrompt, generator: MCPPromptGenerator): void {
    this.prompts.set(definition.name, { definition, generator });
    this.log('debug', 'Prompt registered', { prompt: definition.name });
  }

  /**
   * Handle incoming JSON-RPC message
   */
  async handleMessage(message: string): Promise<string | null> {
    let request: JSONRPCRequest;

    try {
      request = JSON.parse(message) as JSONRPCRequest;
    } catch (error) {
      return this.createErrorResponse(null, JSONRPCErrorCode.ParseError, 'Parse error', error);
    }

    // Validate JSON-RPC 2.0 format
    if (request.jsonrpc !== '2.0') {
      return this.createErrorResponse(
        request.id ?? null,
        JSONRPCErrorCode.InvalidRequest,
        'Invalid JSON-RPC version'
      );
    }

    // Handle notification (no response expected)
    if (request.id === undefined) {
      await this.handleNotification(request as JSONRPCNotification);
      return null;
    }

    try {
      const result = await this.handleMethod(request);
      return this.createSuccessResponse(request.id, result);
    } catch (error) {
      return this.createErrorResponse(
        request.id,
        JSONRPCErrorCode.InternalError,
        'Internal error',
        error
      );
    }
  }

  /**
   * Handle JSON-RPC notification
   */
  private async handleNotification(notification: JSONRPCNotification): Promise<void> {
    this.log('debug', 'Received notification', { method: notification.method });
    this.emit('notification', notification);
  }

  /**
   * Handle JSON-RPC method
   */
  private async handleMethod(request: JSONRPCRequest): Promise<unknown> {
    const { method, params } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params as Record<string, unknown>);

      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(params as { name: string; arguments: Record<string, unknown> });

      case 'resources/list':
        return this.handleResourcesList();

      case 'resources/read':
        return this.handleResourcesRead(params as { uri: string });

      case 'resources/subscribe':
        return this.handleResourcesSubscribe(params as { uri: string });

      case 'resources/unsubscribe':
        return this.handleResourcesUnsubscribe(params as { uri: string });

      case 'prompts/list':
        return this.handlePromptsList();

      case 'prompts/get':
        return this.handlePromptsGet(params as { name: string; arguments?: Record<string, unknown> });

      case 'ping':
        return { status: 'ok' };

      default:
        throw this.createMethodNotFoundError(method);
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: Record<string, unknown>): Promise<MCPServerConfig> {
    this.isInitialized = true;
    this.log('info', 'Client initialized', { clientInfo: params.clientInfo });
    this.emit('initialized', params);
    return this.config;
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<{ tools: MCPTool[] }> {
    const tools = Array.from(this.tools.values()).map(t => t.definition);
    return { tools };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: { name: string; arguments: Record<string, unknown> }): Promise<MCPToolResult> {
    const tool = this.tools.get(params.name);
    if (!tool) {
      throw this.createMethodNotFoundError(`Tool not found: ${params.name}`);
    }

    this.log('debug', 'Tool called', { tool: params.name, arguments: params.arguments });

    try {
      const result = await tool.handler(params.arguments);
      this.emit('tool_executed', { name: params.name, result });
      return result;
    } catch (error) {
      this.log('error', 'Tool execution failed', { tool: params.name, error });
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle resources/list request
   */
  private async handleResourcesList(): Promise<{ resources: MCPResource[] }> {
    const resources = Array.from(this.resources.values()).map(r => r.definition);
    return { resources };
  }

  /**
   * Handle resources/read request
   */
  private async handleResourcesRead(params: { uri: string }): Promise<MCPToolResult> {
    const resource = this.resources.get(params.uri);
    if (!resource) {
      throw this.createMethodNotFoundError(`Resource not found: ${params.uri}`);
    }

    this.log('debug', 'Resource read', { uri: params.uri });

    try {
      return await resource.reader(params.uri);
    } catch (error) {
      this.log('error', 'Resource read failed', { uri: params.uri, error });
      return {
        content: [
          {
            type: 'text',
            text: `Resource read failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle resources/subscribe request
   */
  private async handleResourcesSubscribe(params: { uri: string }): Promise<{ subscribed: boolean }> {
    if (!this.subscriptions.has(params.uri)) {
      this.subscriptions.set(params.uri, new Set());
    }
    this.log('info', 'Resource subscribed', { uri: params.uri });
    return { subscribed: true };
  }

  /**
   * Handle resources/unsubscribe request
   */
  private async handleResourcesUnsubscribe(params: { uri: string }): Promise<{ unsubscribed: boolean }> {
    this.subscriptions.delete(params.uri);
    this.log('info', 'Resource unsubscribed', { uri: params.uri });
    return { unsubscribed: true };
  }

  /**
   * Handle prompts/list request
   */
  private async handlePromptsList(): Promise<{ prompts: MCPPrompt[] }> {
    const prompts = Array.from(this.prompts.values()).map(p => p.definition);
    return { prompts };
  }

  /**
   * Handle prompts/get request
   */
  private async handlePromptsGet(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }> {
    const prompt = this.prompts.get(params.name);
    if (!prompt) {
      throw this.createMethodNotFoundError(`Prompt not found: ${params.name}`);
    }

    this.log('debug', 'Prompt requested', { prompt: params.name, arguments: params.arguments });

    try {
      return await prompt.generator(params.arguments);
    } catch (error) {
      this.log('error', 'Prompt generation failed', { prompt: params.name, error });
      throw error;
    }
  }

  /**
   * Notify subscribers of resource update
   */
  notifyResourceUpdate(uri: string, resource: MCPResource): void {
    const subscribers = this.subscriptions.get(uri);
    if (!subscribers || subscribers.size === 0) return;

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method: 'notifications/resources/updated',
      params: { uri, resource },
    };

    this.emit('notification_sent', notification);
    this.log('debug', 'Resource update notification sent', { uri });
  }

  /**
   * Log a message
   */
  log(level: MCPLogLevel, message: string, data?: unknown): void {
    const entry: MCPLogEntry = {
      level,
      logger: this.config.name,
      data: data ?? message,
      timestamp: new Date().toISOString(),
    };

    this.emit('log', entry);

    // Also emit as notification if server is initialized
    if (this.isInitialized && this.config.capabilities.logging) {
      const notification: JSONRPCNotification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: entry as unknown as Record<string, unknown>,
      };
      this.emit('notification_sent', notification);
    }
  }

  /**
   * Create success response
   */
  private createSuccessResponse(id: string | number, result: unknown): string {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    return JSON.stringify(response);
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): string {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data: data instanceof Error ? { message: data.message, stack: data.stack } : data,
      },
    };
    return JSON.stringify(response);
  }

  /**
   * Create method not found error
   */
  private createMethodNotFoundError(method: string): Error {
    const error = new Error(`Method not found: ${method}`);
    (error as any).code = JSONRPCErrorCode.MethodNotFound;
    return error;
  }

  /**
   * Get server info
   */
  getInfo(): MCPServerConfig {
    return this.config;
  }

  /**
   * Get registered tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get registered resources
   */
  getResources(): MCPResource[] {
    return Array.from(this.resources.values()).map(r => r.definition);
  }

  /**
   * Get registered prompts
   */
  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map(p => p.definition);
  }
}
