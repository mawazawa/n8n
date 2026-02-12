/**
 * Unit Tests for Builder Agent
 * Tests workflow structure creation and node connections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBuilderAgent } from '../../../src/graph/agents/builder';
import type { WorkflowBuilderStateType } from '../../../src/graph/state';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { DiscoveryContext } from '../../../src/types/agent';

describe('Builder Agent', () => {
  let mockModel: BaseChatModel;
  let builderAgent: ReturnType<typeof createBuilderAgent>;

  beforeEach(() => {
    // Create a mock model that returns structured output
    mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          nodes: [
            {
              id: 'webhook_1',
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 1,
              position: [250, 300],
              parameters: {
                httpMethod: 'POST',
                path: 'slack-notifications',
              },
            },
            {
              id: 'slack_1',
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              typeVersion: 2,
              position: [450, 300],
              parameters: {
                resource: 'message',
                operation: 'post',
              },
            },
          ],
          connections: [
            {
              sourceNode: 'webhook_1',
              targetNode: 'slack_1',
              sourceOutput: 0,
              targetInput: 0,
              connectionType: 'main',
            },
          ],
          reasoning: 'Created a webhook trigger that passes data to Slack node for posting messages',
        }),
      }),
    } as unknown as BaseChatModel;

    builderAgent = createBuilderAgent(mockModel);
  });

  describe('basic functionality', () => {
    it('should create workflow nodes from discovery context', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          {
            nodeName: 'n8n-nodes-base.webhook',
            version: 1,
            reasoning: 'Trigger for incoming requests',
          },
          {
            nodeName: 'n8n-nodes-base.slack',
            version: 2,
            reasoning: 'Send notifications',
          },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test Workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.workflowJSON).toBeDefined();
      expect(result.workflowJSON?.nodes).toHaveLength(2);
      expect(result.workflowJSON?.nodes[0].name).toBe('Webhook');
      expect(result.workflowJSON?.nodes[1].name).toBe('Slack');
    });

    it('should create connections between nodes', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
          { nodeName: 'n8n-nodes-base.slack', version: 2, reasoning: 'Action' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.workflowJSON?.connections).toBeDefined();
      expect(result.workflowJSON?.connections['Webhook']).toBeDefined();
      expect(result.workflowJSON?.connections['Webhook'].main).toBeDefined();
      expect(result.workflowJSON?.connections['Webhook'].main[0]).toContainEqual({
        node: 'Slack',
        type: 'main',
        index: 0,
      });
    });

    it('should set node positions', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      const node = result.workflowJSON?.nodes[0];
      expect(node?.position).toBeDefined();
      expect(node?.position).toHaveLength(2);
      expect(typeof node?.position[0]).toBe('number');
      expect(typeof node?.position[1]).toBe('number');
    });
  });

  describe('node parameters', () => {
    it('should include node parameters', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      const webhookNode = result.workflowJSON?.nodes[0];
      expect(webhookNode?.parameters).toBeDefined();
      expect(webhookNode?.parameters?.httpMethod).toBe('POST');
      expect(webhookNode?.parameters?.path).toBe('slack-notifications');
    });
  });

  describe('merging with existing workflow', () => {
    it('should merge new nodes with existing nodes', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.slack', version: 2, reasoning: 'Add Slack' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Add Slack node')],
        workflowJSON: {
          name: 'Existing Workflow',
          nodes: [
            {
              id: 'existing_1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              typeVersion: 1,
              position: [250, 300],
              parameters: {},
            },
          ],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.workflowJSON?.nodes).toHaveLength(3); // 1 existing + 2 new
      expect(result.workflowJSON?.nodes.some(n => n.name === 'HTTP Request')).toBe(true);
      expect(result.workflowJSON?.nodes.some(n => n.name === 'Slack')).toBe(true);
    });

    it('should merge new connections with existing connections', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
          { nodeName: 'n8n-nodes-base.slack', version: 2, reasoning: 'Action' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {
            'Existing Node': {
              main: [[{ node: 'Another Node', type: 'main', index: 0 }]],
            },
          },
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.workflowJSON?.connections['Existing Node']).toBeDefined();
      expect(result.workflowJSON?.connections['Webhook']).toBeDefined();
    });
  });

  describe('coordination log', () => {
    it('should create coordination log entry', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.coordinationLog).toBeDefined();
      expect(result.coordinationLog).toHaveLength(1);
      expect(result.coordinationLog![0].phase).toBe('builder');
      expect(result.coordinationLog![0].status).toBe('completed');
    });

    it('should include metadata in log entry', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
          { nodeName: 'n8n-nodes-base.slack', version: 2, reasoning: 'Action' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      const logEntry = result.coordinationLog![0];
      expect(logEntry.metadata).toBeDefined();
      expect(logEntry.metadata?.nodesCreated).toBe(2);
      expect(logEntry.metadata?.connectionsCreated).toBe(1);
      expect(logEntry.metadata?.nodeNames).toContain('Webhook');
      expect(logEntry.metadata?.nodeNames).toContain('Slack');
    });
  });

  describe('next phase determination', () => {
    it('should set next phase to configurator', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await builderAgent(state);

      expect(result.nextPhase).toBe('configurator');
    });
  });

  describe('edge cases', () => {
    it('should handle empty discovery context', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext: {
          nodesFound: [],
        },
      };

      const result = await builderAgent(state);

      expect(result.coordinationLog).toBeDefined();
      expect(result.coordinationLog![0].summary).toContain('No nodes to build');
      expect(result.nextPhase).toBe('responder');
    });

    it('should handle missing discovery context', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await builderAgent(state);

      expect(result.nextPhase).toBe('responder');
    });

    it('should handle AI connection types', async () => {
      // Mock AI agent workflow
      const aiModel = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            nodes: [
              {
                id: 'agent_1',
                name: 'AI Agent',
                type: 'n8n-nodes-langchain.agent',
                typeVersion: 1,
                position: [250, 300],
                parameters: {},
              },
              {
                id: 'llm_1',
                name: 'Chat Model',
                type: 'n8n-nodes-langchain.chatModel',
                typeVersion: 1,
                position: [450, 300],
                parameters: {},
              },
            ],
            connections: [
              {
                sourceNode: 'llm_1',
                targetNode: 'agent_1',
                sourceOutput: 0,
                targetInput: 0,
                connectionType: 'ai_languageModel',
              },
            ],
            reasoning: 'AI agent with language model',
          }),
        }),
      } as unknown as BaseChatModel;

      const aiBuilderAgent = createBuilderAgent(aiModel);

      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-langchain.agent', version: 1, reasoning: 'AI Agent' },
          { nodeName: 'n8n-nodes-langchain.chatModel', version: 1, reasoning: 'LLM' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create AI workflow')],
        workflowJSON: {
          name: 'AI Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
      };

      const result = await aiBuilderAgent(state);

      expect(result.workflowJSON?.connections['Chat Model']).toBeDefined();
      expect(result.workflowJSON?.connections['Chat Model'].ai_languageModel).toBeDefined();
    });
  });

  describe('relevant examples integration', () => {
    it('should use relevant examples if available', async () => {
      const discoveryContext: DiscoveryContext = {
        nodesFound: [
          { nodeName: 'n8n-nodes-base.webhook', version: 1, reasoning: 'Trigger' },
        ],
      };

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create workflow')],
        workflowJSON: {
          name: 'Test',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
        discoveryContext,
        relevantExamples: [
          {
            id: 'example-1',
            name: 'Example Workflow',
            description: 'Example',
            category: 'automation',
            techniques: [],
            workflow: {
              name: 'Example',
              active: false,
              nodes: [
                {
                  id: 'ex_1',
                  name: 'Example Node',
                  type: 'n8n-nodes-base.webhook',
                  typeVersion: 1,
                  position: [250, 300],
                  parameters: {},
                },
              ],
              connections: {},
            },
          },
        ],
      };

      const result = await builderAgent(state);

      expect(result.workflowJSON).toBeDefined();
    });
  });
});
