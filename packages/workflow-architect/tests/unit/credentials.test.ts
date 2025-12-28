import { describe, it, expect } from 'vitest';
import {
  getCredentialTypesForNode,
  nodeRequiresCredentials,
  findMatchingCredentials,
  suggestCredential,
} from '../../src/n8n/credentials';
import {
  assignCredentials,
  getRequiredCredentials,
} from '../../src/tools/assign-credentials.tool';
import type { WorkflowDefinition } from '../../src/types/workflow';
import type { AvailableCredential } from '../../src/tools/assign-credentials.tool';

// Test fixtures
const testCredentials: AvailableCredential[] = [
  { name: 'Slack Bot', type: 'slackApi', createdAt: '2024-01-01T00:00:00Z' },
  { name: 'Slack OAuth', type: 'slackOAuth2Api', createdAt: '2024-01-02T00:00:00Z' },
  { name: 'OpenAI', type: 'openAiApi', createdAt: '2024-01-03T00:00:00Z' },
  { name: 'Gmail', type: 'gmailOAuth2', createdAt: '2024-01-04T00:00:00Z' },
  { name: 'Postgres DB', type: 'postgres', createdAt: '2024-01-05T00:00:00Z' },
];

const testWorkflow: WorkflowDefinition = {
  name: 'Test Workflow',
  active: true,
  nodes: [
    {
      id: 'slack_1',
      name: 'Slack',
      type: 'n8n-nodes-base.slack',
      typeVersion: 2,
      position: [250, 300],
      parameters: {},
    },
    {
      id: 'openai_1',
      name: 'OpenAI Chat',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1,
      position: [450, 300],
      parameters: {},
    },
    {
      id: 'webhook_1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [50, 300],
      parameters: {},
    },
  ],
  connections: {},
};

describe('Credential Type Detection', () => {
  it('should return credential types for known nodes', () => {
    const slackCreds = getCredentialTypesForNode('n8n-nodes-base.slack');
    expect(slackCreds).toContain('slackApi');
    expect(slackCreds).toContain('slackOAuth2Api');

    const openaiCreds = getCredentialTypesForNode('@n8n/n8n-nodes-langchain.lmChatOpenAi');
    expect(openaiCreds).toContain('openAiApi');

    const postgresCreds = getCredentialTypesForNode('n8n-nodes-base.postgres');
    expect(postgresCreds).toContain('postgres');
  });

  it('should return empty array for nodes without credentials', () => {
    const webhookCreds = getCredentialTypesForNode('n8n-nodes-base.webhook');
    expect(webhookCreds).toHaveLength(0);
  });

  it('should return empty array for unknown nodes', () => {
    const unknownCreds = getCredentialTypesForNode('n8n-nodes-base.unknownNode');
    expect(unknownCreds).toHaveLength(0);
  });

  it('should correctly check if node requires credentials', () => {
    expect(nodeRequiresCredentials('n8n-nodes-base.slack')).toBe(true);
    expect(nodeRequiresCredentials('n8n-nodes-base.webhook')).toBe(false);
    expect(nodeRequiresCredentials('@n8n/n8n-nodes-langchain.lmChatOpenAi')).toBe(true);
  });
});

describe('Credential Matching', () => {
  it('should find matching credentials for a node', () => {
    const matching = findMatchingCredentials('n8n-nodes-base.slack', testCredentials);

    expect(matching).toHaveLength(2);
    expect(matching.map((c) => c.name)).toContain('Slack Bot');
    expect(matching.map((c) => c.name)).toContain('Slack OAuth');
  });

  it('should return empty array when no credentials match', () => {
    const matching = findMatchingCredentials('n8n-nodes-base.github', testCredentials);
    expect(matching).toHaveLength(0);
  });
});

describe('Credential Suggestion', () => {
  it('should suggest OAuth2 over API key when available', () => {
    const suggestion = suggestCredential('n8n-nodes-base.slack', testCredentials);

    expect(suggestion).not.toBeNull();
    expect(suggestion!.type).toBe('slackOAuth2Api');
    expect(suggestion!.name).toBe('Slack OAuth');
  });

  it('should return null when no credentials match', () => {
    const suggestion = suggestCredential('n8n-nodes-base.github', testCredentials);
    expect(suggestion).toBeNull();
  });

  it('should return the only matching credential when there is one', () => {
    const suggestion = suggestCredential('@n8n/n8n-nodes-langchain.lmChatOpenAi', testCredentials);

    expect(suggestion).not.toBeNull();
    expect(suggestion!.name).toBe('OpenAI');
    expect(suggestion!.type).toBe('openAiApi');
  });
});

describe('Assign Credentials', () => {
  it('should assign credentials to a node', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = assignCredentials(
      workflow,
      {
        node_name: 'Slack',
        credential_type: 'slackOAuth2Api',
        credential_name: 'Slack OAuth',
      },
      testCredentials,
    );

    expect(result.success).toBe(true);
    expect(result.node_name).toBe('Slack');
    expect(result.credential_type).toBe('slackOAuth2Api');

    // Verify credential was added to workflow
    const slackNode = workflow.nodes.find((n) => n.name === 'Slack') as typeof workflow.nodes[0] & {
      credentials?: Record<string, { name: string }>;
    };
    expect(slackNode.credentials).toBeDefined();
    expect(slackNode.credentials!.slackOAuth2Api.name).toBe('Slack OAuth');
  });

  it('should fail for non-existent node', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = assignCredentials(
      workflow,
      {
        node_name: 'NonExistent',
        credential_type: 'slackOAuth2Api',
        credential_name: 'Slack OAuth',
      },
      testCredentials,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail for non-existent credential', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = assignCredentials(
      workflow,
      {
        node_name: 'Slack',
        credential_type: 'slackOAuth2Api',
        credential_name: 'Non Existent Credential',
      },
      testCredentials,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail for incompatible credential type', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = assignCredentials(
      workflow,
      {
        node_name: 'Slack',
        credential_type: 'openAiApi', // Wrong type for Slack
        credential_name: 'OpenAI',
      },
      testCredentials,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not accept');
  });
});

describe('Get Required Credentials', () => {
  it('should identify nodes missing credentials', () => {
    const required = getRequiredCredentials(testWorkflow);

    // Should find Slack and OpenAI (Webhook doesn't need credentials)
    expect(required.length).toBeGreaterThanOrEqual(2);
    expect(required.some((r) => r.node_name === 'Slack')).toBe(true);
    expect(required.some((r) => r.node_name === 'OpenAI Chat')).toBe(true);
  });

  it('should not include nodes that have credentials assigned', () => {
    const workflowWithCreds = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    // Add credentials to Slack node
    const slackNode = workflowWithCreds.nodes.find((n) => n.name === 'Slack') as typeof workflowWithCreds.nodes[0] & {
      credentials?: Record<string, { name: string }>;
    };
    slackNode.credentials = { slackOAuth2Api: { name: 'Slack OAuth' } };

    const required = getRequiredCredentials(workflowWithCreds);

    // Should not include Slack anymore
    expect(required.some((r) => r.node_name === 'Slack')).toBe(false);
    // But should still include OpenAI
    expect(required.some((r) => r.node_name === 'OpenAI Chat')).toBe(true);
  });
});
