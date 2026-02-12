# MCP (Model Context Protocol) Server Integration

This directory contains the implementation of an MCP server for the workflow-architect package, enabling AI models to interact with n8n workflows through Anthropic's Model Context Protocol.

## Overview

The MCP server provides a standardized JSON-RPC 2.0 interface for AI assistants to:
- Create and modify n8n workflows from natural language
- Execute workflows and retrieve results
- Search workflow templates
- Access workflow state and execution data
- Get contextual prompts for common tasks

## Architecture

```
mcp/
├── types.ts         # MCP protocol type definitions
├── server.ts        # MCPServer class (JSON-RPC 2.0 transport)
├── tools/           # Workflow manipulation tools
├── resources/       # Read-only workflow data access
├── prompts/         # Contextual prompt templates
└── index.ts         # Public API exports
```

## Usage

### Creating an MCP Server

```typescript
import { MCPServer } from '@n8n/workflow-architect/mcp';
import {
  registerWorkflowTools,
  registerWorkflowResources,
  registerWorkflowPrompts
} from '@n8n/workflow-architect/mcp';

// Create server
const server = new MCPServer({
  name: 'n8n-workflow-architect',
  version: '0.1.0',
  capabilities: {
    tools: true,
    resources: { subscribe: true, list: true },
    prompts: true,
    logging: true,
  },
});

// Register workflow operations
registerWorkflowTools(server, {
  createWorkflow: async (description, context) => {
    // Implement workflow creation
  },
  modifyWorkflow: async (workflowId, instructions, context) => {
    // Implement workflow modification
  },
  executeWorkflow: async (workflowId, inputData) => {
    // Implement workflow execution
  },
  getExecution: async (executionId) => {
    // Implement execution retrieval
  },
  searchTemplates: async (query, category) => {
    // Implement template search
  },
});

// Register workflow resources
registerWorkflowResources(server, {
  getCurrentWorkflow: async () => {
    // Return current workflow
  },
  getWorkflow: async (id) => {
    // Return workflow by ID
  },
  getLatestExecution: async () => {
    // Return latest execution
  },
  getExecution: async (id) => {
    // Return execution by ID
  },
  getTemplatesByCategory: async (category) => {
    // Return templates in category
  },
});

// Register prompts
registerWorkflowPrompts(server);

// Start server
await server.start();

// Handle incoming messages
const response = await server.handleMessage(jsonRpcRequest);
```

### Event Handling

The MCP server emits events for monitoring and logging:

```typescript
server.on('start', () => {
  console.log('MCP server started');
});

server.on('initialized', (clientInfo) => {
  console.log('Client connected:', clientInfo);
});

server.on('tool_executed', ({ name, result }) => {
  console.log(`Tool ${name} executed:`, result);
});

server.on('log', (entry) => {
  console.log(`[${entry.level}]`, entry.data);
});

server.on('notification_sent', (notification) => {
  // Send notification to client
});
```

## Available Tools

### create_workflow

Create a new n8n workflow from natural language description.

**Input:**
```json
{
  "description": "Create a workflow that sends a Slack message when a webhook is triggered",
  "context": {
    "executionData": {},
    "currentWorkflow": { "id": "123" }
  }
}
```

**Output:**
```json
{
  "success": true,
  "workflow": {
    "id": "456",
    "name": "Webhook to Slack",
    "nodes": 2,
    "active": false
  },
  "message": "Successfully created workflow..."
}
```

### modify_workflow

Modify an existing workflow based on instructions.

**Input:**
```json
{
  "workflowId": "123",
  "instructions": "Add error handling and send notifications on failure",
  "context": {}
}
```

### search_templates

Search the workflow template library.

**Input:**
```json
{
  "query": "AI agent with RAG",
  "category": "ai-agent",
  "limit": 10
}
```

### execute_workflow

Execute a workflow and optionally wait for completion.

**Input:**
```json
{
  "workflowId": "123",
  "inputData": { "message": "Hello" },
  "waitForCompletion": true
}
```

### get_execution_status

Check the status of a workflow execution.

**Input:**
```json
{
  "executionId": "789",
  "includeData": true
}
```

## Available Resources

Resources provide read-only access to workflow data and support subscriptions for real-time updates.

### workflow://current

The currently active workflow being edited.

### workflow://{id}

A specific workflow by ID.

### execution://latest

The most recent workflow execution result.

### execution://{id}

A specific execution by ID.

### template://{category}

Templates in a specific category:
- `ai-agent`
- `rag-pipeline`
- `data-pipeline`
- `integration`
- `automation`
- `monitoring`
- `approval-flow`
- `error-handling`
- `batch-processing`

## Available Prompts

Prompts provide contextual guidance for common workflow tasks.

### build_workflow

Comprehensive guide for building workflows from scratch.

**Arguments:**
- `description` (required): What the workflow should do
- `constraints` (optional): Preferences or limitations

### debug_workflow

Step-by-step debugging guide for workflow issues.

**Arguments:**
- `error` (required): Error message or issue description
- `workflow` (optional): Current workflow JSON
- `execution` (optional): Execution data

### optimize_workflow

Guide for optimizing workflow performance and reliability.

**Arguments:**
- `workflow` (required): Current workflow JSON
- `goals` (optional): Optimization objectives

## JSON-RPC 2.0 Protocol

The MCP server implements JSON-RPC 2.0:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_workflow",
    "arguments": {
      "description": "..."
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ]
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {}
  }
}
```

## Supported Methods

- `initialize` - Initialize the MCP connection
- `tools/list` - List available tools
- `tools/call` - Invoke a tool
- `resources/list` - List available resources
- `resources/read` - Read a resource
- `resources/subscribe` - Subscribe to resource updates
- `resources/unsubscribe` - Unsubscribe from updates
- `prompts/list` - List available prompts
- `prompts/get` - Get a prompt template
- `ping` - Health check

## Input Validation

All tools use Zod schemas for runtime validation:

```typescript
import { z } from 'zod';

const schema = z.object({
  description: z.string().min(10),
  context: z.object({
    executionData: z.record(z.unknown()).optional(),
  }).optional(),
});

const validated = schema.parse(args);
```

## Error Handling

Tools return errors in the MCP format:

```typescript
return {
  content: [
    {
      type: 'text',
      text: 'Error message here',
    },
  ],
  isError: true,
};
```

## Integration with Workflow Architect

The MCP server integrates with the existing workflow-architect graph:

```typescript
import { createWorkflowArchitect } from '@n8n/workflow-architect';
import { MCPServer, registerWorkflowTools } from '@n8n/workflow-architect/mcp';

const architect = createWorkflowArchitect({
  modelId: 'claude-opus-4',
});

const server = new MCPServer({
  name: 'n8n-workflow-architect',
  version: '0.1.0',
});

registerWorkflowTools(server, {
  createWorkflow: async (description, context) => {
    const result = await architect.chat({
      message: description,
      workflowContext: context,
    });
    return result.workflow;
  },
  // ... other handlers
});
```

## Reference

- [MCP Specification](https://modelcontextprotocol.io)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Workflow Architect Documentation](../README.md)
