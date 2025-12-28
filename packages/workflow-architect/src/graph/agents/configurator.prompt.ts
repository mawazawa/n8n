/**
 * Configurator Agent Prompt Template
 * Configures node parameters, assigns credentials, and validates workflow settings
 */

export const CONFIGURATOR_SYSTEM_PROMPT = `You are the Configurator Agent for n8n workflow automation.
Your role is to configure node parameters and assign credentials based on user requirements.

## Your Capabilities
1. **Update Node Parameters**: Set values for node-specific settings (operation, resource, fields, etc.)
2. **Assign Credentials**: Link appropriate credentials to nodes that require authentication
3. **Validate Settings**: Ensure parameters are valid for the node type

## Available Tools
- \`get_node_parameters\`: Retrieve current parameters for a node
- \`update_node_parameters\`: Update one or more parameters for a node
- \`assign_credentials\`: Assign credentials to a node
- \`validate_parameters\`: Check if parameters are valid for a node type

## Node Parameter Guidelines

### Common Parameter Types
- **resource**: The type of resource to operate on (e.g., "user", "message", "sheet")
- **operation**: The action to perform (e.g., "create", "read", "update", "delete")
- **options**: Additional configuration options
- **fields**: Specific fields to include/exclude
- **filters**: Conditions for querying data

### Credential Assignment Rules
1. Match credential type to node requirements
2. Use environment-appropriate credentials (dev/staging/prod)
3. Prefer service accounts over personal credentials for automation
4. Never hardcode sensitive values - always use credentials

## Response Format
After configuring a node, summarize:
1. What parameters were set
2. What credentials were assigned (if any)
3. Any validation issues found

Always aim for complete, production-ready configurations.`;

export const CONFIGURATOR_TASK_PROMPT = `## Current Workflow State
{workflow_json}

## Nodes Requiring Configuration
{nodes_to_configure}

## User Requirements
{user_requirements}

## Available Credentials
{available_credentials}

## Your Task
Configure the listed nodes according to user requirements:
1. Set appropriate parameter values
2. Assign matching credentials
3. Validate the configuration

Use the tools provided to make changes. Explain your configuration choices.`;

export const NODE_PARAMETER_REFERENCE: Record<string, { parameters: string[]; credentials: string[] }> = {
  // Communication
  'n8n-nodes-base.slack': {
    parameters: ['resource', 'operation', 'channel', 'text', 'attachments'],
    credentials: ['slackApi', 'slackOAuth2Api'],
  },
  'n8n-nodes-base.gmail': {
    parameters: ['resource', 'operation', 'subject', 'message', 'toList', 'ccList', 'bccList'],
    credentials: ['gmailOAuth2'],
  },
  'n8n-nodes-base.discord': {
    parameters: ['resource', 'operation', 'guildId', 'channelId', 'content'],
    credentials: ['discordApi', 'discordBotApi'],
  },

  // Databases
  'n8n-nodes-base.postgres': {
    parameters: ['operation', 'query', 'table', 'columns', 'where'],
    credentials: ['postgres'],
  },
  'n8n-nodes-base.mysql': {
    parameters: ['operation', 'query', 'table', 'columns', 'where'],
    credentials: ['mySql'],
  },
  'n8n-nodes-base.mongodb': {
    parameters: ['operation', 'collection', 'query', 'fields'],
    credentials: ['mongoDb'],
  },

  // AI/LangChain
  '@n8n/n8n-nodes-langchain.agent': {
    parameters: ['promptType', 'text', 'systemMessage', 'options'],
    credentials: [],
  },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': {
    parameters: ['model', 'options'],
    credentials: ['openAiApi'],
  },
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': {
    parameters: ['model', 'options'],
    credentials: ['anthropicApi'],
  },

  // HTTP/API
  'n8n-nodes-base.httpRequest': {
    parameters: ['method', 'url', 'authentication', 'headers', 'queryParameters', 'body'],
    credentials: ['httpBasicAuth', 'httpDigestAuth', 'httpHeaderAuth', 'oAuth2Api'],
  },
  'n8n-nodes-base.webhook': {
    parameters: ['httpMethod', 'path', 'authentication', 'responseMode', 'responseData'],
    credentials: [],
  },

  // Storage
  'n8n-nodes-base.googleDrive': {
    parameters: ['resource', 'operation', 'fileId', 'folderId', 'name'],
    credentials: ['googleDriveOAuth2Api'],
  },
  'n8n-nodes-base.s3': {
    parameters: ['resource', 'operation', 'bucketName', 'fileName', 'region'],
    credentials: ['s3'],
  },

  // Productivity
  'n8n-nodes-base.notion': {
    parameters: ['resource', 'operation', 'databaseId', 'pageId', 'properties'],
    credentials: ['notionApi'],
  },
  'n8n-nodes-base.airtable': {
    parameters: ['operation', 'baseId', 'tableId', 'fields'],
    credentials: ['airtableApi'],
  },
  'n8n-nodes-base.googleSheets': {
    parameters: ['resource', 'operation', 'documentId', 'sheetName', 'range'],
    credentials: ['googleSheetsOAuth2Api'],
  },
};

/**
 * Get parameter reference for a node type
 */
export function getNodeParameterReference(
  nodeType: string,
): { parameters: string[]; credentials: string[] } | null {
  return NODE_PARAMETER_REFERENCE[nodeType] || null;
}

/**
 * Format prompt with variables
 */
export function formatConfiguratorPrompt(variables: {
  workflow_json: string;
  nodes_to_configure: string;
  user_requirements: string;
  available_credentials: string;
}): string {
  return CONFIGURATOR_TASK_PROMPT.replace('{workflow_json}', variables.workflow_json)
    .replace('{nodes_to_configure}', variables.nodes_to_configure)
    .replace('{user_requirements}', variables.user_requirements)
    .replace('{available_credentials}', variables.available_credentials);
}
