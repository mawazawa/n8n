/**
 * MCP Workflow Prompts
 * Pre-defined prompt templates for common workflow operations
 */

import type { MCPPrompt } from '../types.js';
import type { MCPPromptGenerator } from '../server.js';

/**
 * Build Workflow Prompt
 * Guides AI assistants through the workflow building process
 */
export const buildWorkflowPrompt: MCPPrompt = {
  name: 'build_workflow',
  description: 'Guide for building n8n workflows from natural language descriptions',
  arguments: [
    {
      name: 'description',
      description: 'What the workflow should accomplish',
      required: true,
    },
    {
      name: 'constraints',
      description: 'Any constraints or preferences (e.g., specific nodes to use, performance requirements)',
      required: false,
    },
  ],
};

export function createBuildWorkflowGenerator(): MCPPromptGenerator {
  return async (args?: Record<string, unknown>) => {
    const description = args?.description || 'a workflow';
    const constraints = args?.constraints || 'none specified';

    return {
      messages: [
        {
          role: 'user',
          content: `You are helping build an n8n workflow. Here's what you need to know:

## Workflow Goal
${description}

## Constraints
${constraints}

## Building Process

### 1. Node Discovery
- Identify which n8n nodes are needed for this workflow
- Consider both trigger nodes (Webhook, Schedule, Manual) and action nodes
- Think about data transformation needs (Code, Set, IF nodes)
- Consider error handling (Error Trigger, Stop and Error nodes)

### 2. Workflow Structure
- Plan the logical flow of data between nodes
- Identify any branching logic or conditional paths
- Consider loops or iterations if needed
- Plan error handling strategy

### 3. Node Configuration
- For each node, identify required parameters
- Consider authentication/credentials needed
- Think about data mapping between nodes
- Plan for testing and validation

### 4. Best Practices
- Keep workflows simple and maintainable
- Use meaningful node names
- Add notes for complex logic
- Consider workflow settings (execution order, data retention)
- Plan for monitoring and error notifications

## Available Node Types

### Triggers
- **Webhook**: Receive HTTP requests
- **Schedule**: Time-based triggers
- **Manual Trigger**: Manual execution
- **Email Trigger**: React to incoming emails

### AI & LangChain
- **AI Agent**: LangChain agents with tools
- **Chat Model**: LLM interactions
- **Vector Store**: RAG and embeddings
- **Document Loader**: Load documents
- **Text Splitter**: Split text for processing

### Data Processing
- **Code**: JavaScript/Python execution
- **Set**: Manipulate data
- **Merge**: Combine data from multiple sources
- **Split**: Divide data into batches
- **Aggregate**: Group and transform data

### Integration
- **HTTP Request**: Call APIs
- **Database**: SQL queries
- **Google Sheets**: Spreadsheet operations
- **Slack**: Messaging
- **Email**: Send emails

### Control Flow
- **IF**: Conditional branching
- **Switch**: Multiple condition routing
- **Loop**: Iterate over items
- **Wait**: Pause execution

### Utilities
- **Error Trigger**: Handle errors
- **Stop and Error**: Halt on conditions
- **Respond to Webhook**: Send HTTP responses

## Output Format

Describe your workflow plan in this format:

1. **Overview**: One paragraph explaining the workflow
2. **Nodes**: List each node with:
   - Node type
   - Purpose
   - Key configuration needs
3. **Connections**: Describe how nodes connect
4. **Special Considerations**: Any important notes

Then use the create_workflow tool to build it!`,
        },
      ],
    };
  };
}

/**
 * Debug Workflow Prompt
 * Guides AI assistants through debugging workflow issues
 */
export const debugWorkflowPrompt: MCPPrompt = {
  name: 'debug_workflow',
  description: 'Guide for debugging n8n workflow errors and issues',
  arguments: [
    {
      name: 'error',
      description: 'The error message or issue description',
      required: true,
    },
    {
      name: 'workflow',
      description: 'Current workflow JSON or description',
      required: false,
    },
    {
      name: 'execution',
      description: 'Execution data or error details',
      required: false,
    },
  ],
};

export function createDebugWorkflowGenerator(): MCPPromptGenerator {
  return async (args?: Record<string, unknown>) => {
    const error = args?.error || 'unknown error';
    const workflow = args?.workflow ? JSON.stringify(args.workflow, null, 2) : 'not provided';
    const execution = args?.execution ? JSON.stringify(args.execution, null, 2) : 'not provided';

    return {
      messages: [
        {
          role: 'user',
          content: `You are helping debug an n8n workflow issue.

## Error/Issue
${error}

## Current Workflow
${workflow}

## Execution Data
${execution}

## Debugging Checklist

### 1. Common Issues

#### Authentication Errors
- Check if credentials are configured
- Verify credential permissions and scopes
- Test credentials in isolation
- Check for expired tokens

#### Data Mapping Issues
- Inspect input data structure
- Verify JSON paths and expressions
- Check for null/undefined values
- Validate data types

#### Connection Errors
- Verify API endpoints and URLs
- Check network connectivity
- Review rate limits and quotas
- Test with API client (Postman)

#### Node Configuration
- Review required parameters
- Check parameter syntax
- Validate expressions and variables
- Test with sample data

### 2. Error Analysis

#### Read the Error Message
- Identify the failing node
- Note the error type (auth, validation, network)
- Check error details and stack traces
- Look for helpful error codes

#### Check Execution Data
- Review input to failing node
- Inspect previous node outputs
- Validate data transformations
- Check for missing fields

#### Test Incrementally
- Disable nodes after failure point
- Test with minimal configuration
- Add complexity gradually
- Validate at each step

### 3. Common Fixes

#### Missing Data
- Use IF node to check data existence
- Add default values with Set node
- Handle null cases explicitly
- Validate data before processing

#### Expression Errors
- Test expressions in Code node first
- Use JSON.stringify() for debugging
- Check bracket notation vs dot notation
- Validate variable names

#### Rate Limiting
- Add Wait node between requests
- Implement exponential backoff
- Use Queue mode for workflows
- Consider bulk operations

#### Memory Issues
- Limit items per execution
- Use pagination for large datasets
- Enable "Execute Once" mode
- Clear unnecessary data early

### 4. Resources

Use these tools to debug:
- **get_execution_status**: Get full execution details
- **modify_workflow**: Make fixes to the workflow
- **search_templates**: Find working examples

Read these resources:
- **execution://latest**: Latest execution data
- **workflow://current**: Current workflow state

## Next Steps

1. Analyze the error details above
2. Identify the most likely cause
3. Propose a fix or workaround
4. Test the fix incrementally

Describe your diagnosis and recommended fixes!`,
        },
      ],
    };
  };
}

/**
 * Optimize Workflow Prompt
 * Guides AI assistants through workflow optimization
 */
export const optimizeWorkflowPrompt: MCPPrompt = {
  name: 'optimize_workflow',
  description: 'Guide for optimizing n8n workflow performance and reliability',
  arguments: [
    {
      name: 'workflow',
      description: 'Current workflow JSON or description',
      required: true,
    },
    {
      name: 'goals',
      description: 'Optimization goals (speed, reliability, cost, maintainability)',
      required: false,
    },
  ],
};

export function createOptimizeWorkflowGenerator(): MCPPromptGenerator {
  return async (args?: Record<string, unknown>) => {
    const workflow = args?.workflow ? JSON.stringify(args.workflow, null, 2) : 'not provided';
    const goals = args?.goals || 'general optimization';

    return {
      messages: [
        {
          role: 'user',
          content: `You are helping optimize an n8n workflow.

## Current Workflow
${workflow}

## Optimization Goals
${goals}

## Optimization Guide

### 1. Performance Optimization

#### Reduce Execution Time
- **Parallel Processing**: Use Split in Batches for concurrent operations
- **Minimize HTTP Requests**: Batch API calls when possible
- **Efficient Queries**: Optimize database queries and filters
- **Caching**: Store frequently accessed data
- **Code Efficiency**: Optimize JavaScript/Python code

#### Memory Optimization
- **Limit Data**: Only fetch/process necessary fields
- **Clear Data**: Remove unused data early with Set node
- **Pagination**: Process large datasets in chunks
- **Stream Processing**: Avoid loading entire datasets

### 2. Reliability Optimization

#### Error Handling
- **Add Error Triggers**: Catch and handle errors gracefully
- **Retry Logic**: Configure node retry settings
- **Validation**: Validate data before processing
- **Fallbacks**: Provide alternative paths for failures
- **Notifications**: Alert on critical failures

#### Data Quality
- **Input Validation**: Check data types and formats
- **Schema Validation**: Enforce expected structures
- **Null Handling**: Handle missing/null values
- **Data Cleaning**: Normalize and sanitize inputs

### 3. Cost Optimization

#### Reduce API Calls
- **Conditional Execution**: Use IF nodes to skip unnecessary calls
- **Deduplication**: Remove duplicate requests
- **Caching**: Store API responses temporarily
- **Bulk Operations**: Batch multiple operations

#### Resource Usage
- **Execution Mode**: Choose appropriate trigger (webhook vs polling)
- **Data Retention**: Configure minimal data storage
- **Workflow Splitting**: Separate concerns into multiple workflows
- **Scheduled Optimization**: Run heavy tasks during off-peak hours

### 4. Maintainability Optimization

#### Code Organization
- **Naming Conventions**: Use clear, descriptive node names
- **Documentation**: Add notes to complex nodes
- **Modularity**: Break complex workflows into sub-workflows
- **Consistency**: Use consistent patterns across workflows

#### Testing & Debugging
- **Test Data**: Use pinned data for testing
- **Logging**: Add strategic logging points
- **Monitoring**: Set up execution tracking
- **Version Control**: Track workflow changes

### 5. Specific Optimizations

#### For AI Workflows
- **Model Selection**: Use appropriate model for task (speed vs quality)
- **Prompt Optimization**: Make prompts concise and clear
- **Context Management**: Limit context window size
- **Caching**: Cache embeddings and frequent queries

#### For Data Pipelines
- **Incremental Processing**: Process only new/changed data
- **Indexing**: Add database indexes for queries
- **Compression**: Compress large payloads
- **Async Processing**: Use webhooks for long operations

#### For Integrations
- **Webhook vs Polling**: Prefer webhooks over polling
- **Connection Pooling**: Reuse connections when possible
- **Timeout Configuration**: Set appropriate timeouts
- **Rate Limit Management**: Respect API rate limits

## Analysis Framework

1. **Current State**: What's the workflow doing now?
2. **Bottlenecks**: Where are the slowdowns or failures?
3. **Quick Wins**: What's easy to optimize immediately?
4. **Strategic Improvements**: What needs architectural changes?
5. **Trade-offs**: What are the costs of each optimization?

## Recommended Actions

Provide:
1. Top 3 optimization opportunities
2. Expected impact of each (high/medium/low)
3. Implementation difficulty (easy/medium/hard)
4. Specific changes to make

Use the modify_workflow tool to implement optimizations!`,
        },
      ],
    };
  };
}

/**
 * Register all workflow prompts
 */
export function registerWorkflowPrompts(
  server: { registerPrompt: (prompt: MCPPrompt, generator: MCPPromptGenerator) => void }
): void {
  server.registerPrompt(buildWorkflowPrompt, createBuildWorkflowGenerator());
  server.registerPrompt(debugWorkflowPrompt, createDebugWorkflowGenerator());
  server.registerPrompt(optimizeWorkflowPrompt, createOptimizeWorkflowGenerator());
}
