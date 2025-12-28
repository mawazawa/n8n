/**
 * n8n Credentials Management
 * Fetches and manages credentials from the n8n instance
 */

import type { AvailableCredential } from '../tools/assign-credentials.tool';

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialTypeInfo {
  name: string;
  displayName: string;
  documentationUrl?: string;
  properties: CredentialProperty[];
}

export interface CredentialProperty {
  name: string;
  displayName: string;
  type: string;
  required?: boolean;
  default?: unknown;
}

// Map of node types to required credential types
const NODE_CREDENTIAL_MAP: Record<string, string[]> = {
  // Communication
  'n8n-nodes-base.slack': ['slackApi', 'slackOAuth2Api'],
  'n8n-nodes-base.gmail': ['gmailOAuth2'],
  'n8n-nodes-base.discord': ['discordApi', 'discordBotApi', 'discordWebhookApi'],
  'n8n-nodes-base.telegram': ['telegramApi'],
  'n8n-nodes-base.microsoftTeams': ['microsoftTeamsOAuth2Api'],

  // Databases
  'n8n-nodes-base.postgres': ['postgres'],
  'n8n-nodes-base.mysql': ['mySql'],
  'n8n-nodes-base.mongodb': ['mongoDb'],
  'n8n-nodes-base.redis': ['redis'],
  'n8n-nodes-base.elasticsearch': ['elasticsearchApi'],

  // AI/LangChain
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': ['openAiApi'],
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': ['anthropicApi'],
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': ['googleAi'],
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi': ['openAiApi'],
  '@n8n/n8n-nodes-langchain.vectorStoreSupabase': ['supabaseApi'],
  '@n8n/n8n-nodes-langchain.vectorStorePinecone': ['pineconeApi'],

  // Cloud Storage
  'n8n-nodes-base.googleDrive': ['googleDriveOAuth2Api'],
  'n8n-nodes-base.s3': ['s3'],
  'n8n-nodes-base.dropbox': ['dropboxOAuth2Api'],
  'n8n-nodes-base.oneDrive': ['microsoftOneDriveOAuth2Api'],

  // Productivity
  'n8n-nodes-base.notion': ['notionApi'],
  'n8n-nodes-base.airtable': ['airtableApi', 'airtableTokenApi'],
  'n8n-nodes-base.googleSheets': ['googleSheetsOAuth2Api'],
  'n8n-nodes-base.googleCalendar': ['googleCalendarOAuth2Api'],

  // CRM
  'n8n-nodes-base.hubspot': ['hubspotApi', 'hubspotAppToken', 'hubspotOAuth2Api'],
  'n8n-nodes-base.salesforce': ['salesforceOAuth2Api'],
  'n8n-nodes-base.pipedrive': ['pipedriveApi', 'pipedriveOAuth2Api'],

  // Development
  'n8n-nodes-base.github': ['githubApi', 'githubOAuth2Api'],
  'n8n-nodes-base.gitlab': ['gitlabApi', 'gitlabOAuth2Api'],
  'n8n-nodes-base.jira': ['jiraSoftwareCloudApi', 'jiraSoftwareServerApi'],

  // Marketing
  'n8n-nodes-base.mailchimp': ['mailchimpApi', 'mailchimpOAuth2Api'],
  'n8n-nodes-base.sendgrid': ['sendGridApi'],
  'n8n-nodes-base.twilio': ['twilioApi'],

  // HTTP
  'n8n-nodes-base.httpRequest': [
    'httpBasicAuth',
    'httpDigestAuth',
    'httpHeaderAuth',
    'oAuth1Api',
    'oAuth2Api',
  ],
};

/**
 * Get required credential types for a node type
 */
export function getCredentialTypesForNode(nodeType: string): string[] {
  return NODE_CREDENTIAL_MAP[nodeType] || [];
}

/**
 * Check if a node type requires credentials
 */
export function nodeRequiresCredentials(nodeType: string): boolean {
  const types = getCredentialTypesForNode(nodeType);
  return types.length > 0;
}

/**
 * Fetch credentials from n8n API
 */
export async function fetchCredentials(
  baseUrl: string,
  apiKey: string,
): Promise<AvailableCredential[]> {
  const response = await fetch(`${baseUrl}/api/v1/credentials`, {
    headers: {
      'X-N8N-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch credentials: ${response.statusText}`);
  }

  const data = await response.json();
  const credentials: N8nCredential[] = data.data || data;

  return credentials.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    createdAt: c.createdAt,
  }));
}

/**
 * Fetch credential type information
 */
export async function fetchCredentialTypes(
  baseUrl: string,
  apiKey: string,
): Promise<CredentialTypeInfo[]> {
  const response = await fetch(`${baseUrl}/api/v1/credential-types`, {
    headers: {
      'X-N8N-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch credential types: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || data;
}

/**
 * Find matching credentials for a node
 */
export function findMatchingCredentials(
  nodeType: string,
  availableCredentials: AvailableCredential[],
): AvailableCredential[] {
  const requiredTypes = getCredentialTypesForNode(nodeType);
  return availableCredentials.filter((c) => requiredTypes.includes(c.type));
}

/**
 * Suggest best credential for a node based on available options
 */
export function suggestCredential(
  nodeType: string,
  availableCredentials: AvailableCredential[],
): AvailableCredential | null {
  const matching = findMatchingCredentials(nodeType, availableCredentials);

  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  // Prefer OAuth2 over API key when available
  const oauth2 = matching.find((c) => c.type.includes('OAuth2'));
  if (oauth2) return oauth2;

  // Return most recently created
  return matching.sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];
}

/**
 * Create a credentials provider function
 */
export function createCredentialsProvider(
  baseUrl: string,
  apiKey: string,
): () => Promise<AvailableCredential[]> {
  let cachedCredentials: AvailableCredential[] | null = null;
  let cacheTime = 0;
  const CACHE_TTL = 60000; // 1 minute cache

  return async () => {
    const now = Date.now();
    if (cachedCredentials && now - cacheTime < CACHE_TTL) {
      return cachedCredentials;
    }

    cachedCredentials = await fetchCredentials(baseUrl, apiKey);
    cacheTime = now;
    return cachedCredentials;
  };
}
