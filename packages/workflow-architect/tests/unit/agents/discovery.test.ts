/**
 * Unit Tests for Discovery Agent
 * Tests node discovery and RAG search functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDiscoveryAgent } from '../../../src/graph/agents/discovery';
import type { WorkflowBuilderStateType } from '../../../src/graph/state';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Mock RAG store
vi.mock('../../../src/rag/store', () => ({
  getRAGStore: vi.fn().mockResolvedValue({
    search: vi.fn().mockReturnValue([
      {
        id: 'example-1',
        name: 'Slack Notification Workflow',
        description: 'Send messages to Slack',
        category: 'integration',
        techniques: ['webhook-trigger', 'api-integration'],
        workflow: {
          name: 'Slack Example',
          active: false,
          nodes: [],
          connections: {},
        },
      },
    ]),
  }),
}));

describe('Discovery Agent', () => {
  let mockModel: BaseChatModel;
  let discoveryAgent: ReturnType<typeof createDiscoveryAgent>;

  beforeEach(() => {
    // Create a mock model that returns structured output
    mockModel = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          nodesFound: [
            {
              nodeName: 'n8n-nodes-base.webhook',
              version: 1,
              reasoning: 'Needed to receive HTTP requests',
              connectionChangingParameters: [
                {
                  name: 'httpMethod',
                  possibleValues: ['GET', 'POST', 'PUT', 'DELETE'],
                },
              ],
            },
            {
              nodeName: 'n8n-nodes-base.slack',
              version: 2,
              reasoning: 'Needed to send messages to Slack',
              connectionChangingParameters: [
                {
                  name: 'resource',
                  possibleValues: ['message', 'channel', 'user'],
                },
                {
                  name: 'operation',
                  possibleValues: ['post', 'update', 'delete'],
                },
              ],
            },
          ],
          bestPractices: 'Always validate webhook payloads before processing',
          suggestedWorkflowName: 'Slack Notification System',
        }),
      }),
    } as unknown as BaseChatModel;

    discoveryAgent = createDiscoveryAgent(mockModel);
  });

  describe('basic functionality', () => {
    it('should discover nodes from user request', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow that sends Slack notifications')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.discoveryContext).toBeDefined();
      expect(result.discoveryContext?.nodesFound).toHaveLength(2);
      expect(result.discoveryContext?.nodesFound[0].nodeName).toBe('n8n-nodes-base.webhook');
      expect(result.discoveryContext?.nodesFound[1].nodeName).toBe('n8n-nodes-base.slack');
    });

    it('should include best practices in discovery context', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.discoveryContext?.bestPractices).toBeDefined();
      expect(result.discoveryContext?.bestPractices).toContain('validate');
    });

    it('should include connection-changing parameters', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      const webhookNode = result.discoveryContext?.nodesFound[0];
      expect(webhookNode?.connectionChangingParameters).toBeDefined();
      expect(webhookNode?.connectionChangingParameters?.[0].name).toBe('httpMethod');
      expect(webhookNode?.connectionChangingParameters?.[0].possibleValues).toContain('POST');
    });
  });

  describe('workflow name suggestion', () => {
    it('should update workflow name if suggested', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a Slack notification workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.workflowJSON?.name).toBe('Slack Notification System');
    });

    it('should keep existing name if already set', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'Custom Workflow Name',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      // Should keep custom name if not "My workflow"
      expect(result.workflowJSON?.name).toBe('Custom Workflow Name');
    });
  });

  describe('coordination log', () => {
    it('should create coordination log entry', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.coordinationLog).toBeDefined();
      expect(result.coordinationLog).toHaveLength(1);
      expect(result.coordinationLog![0].phase).toBe('discovery');
      expect(result.coordinationLog![0].status).toBe('completed');
      expect(result.coordinationLog![0].summary).toContain('Found 2 nodes');
    });

    it('should include metadata in log entry', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      const logEntry = result.coordinationLog![0];
      expect(logEntry.metadata).toBeDefined();
      expect(logEntry.metadata?.nodesFound).toBe(2);
      expect(logEntry.metadata?.nodeTypes).toContain('n8n-nodes-base.webhook');
      expect(logEntry.metadata?.hasBestPractices).toBe(true);
    });
  });

  describe('next phase determination', () => {
    it('should set next phase to builder when nodes found', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.nextPhase).toBe('builder');
    });

    it('should set next phase to responder when no nodes found', async () => {
      // Mock model to return no nodes
      const emptyModel = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            nodesFound: [],
            bestPractices: null,
          }),
        }),
      } as unknown as BaseChatModel;

      const emptyAgent = createDiscoveryAgent(emptyModel);

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Hello')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await emptyAgent(state);

      expect(result.nextPhase).toBe('responder');
    });
  });

  describe('RAG integration', () => {
    it('should include relevant examples from RAG', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a Slack workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.relevantExamples).toBeDefined();
      expect(result.relevantExamples).toHaveLength(1);
      expect(result.relevantExamples?.[0].name).toBe('Slack Notification Workflow');
    });

    it('should pass user message to RAG search', async () => {
      const { getRAGStore } = await import('../../../src/rag/store');
      const mockStore = await getRAGStore();

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Send Slack notifications for GitHub events')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      await discoveryAgent(state);

      expect(mockStore.search).toHaveBeenCalledWith(
        'Send Slack notifications for GitHub events',
        { limit: 3 }
      );
    });
  });

  describe('error handling', () => {
    it('should handle model errors gracefully', async () => {
      const errorModel = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockRejectedValue(new Error('Model API error')),
        }),
      } as unknown as BaseChatModel;

      const errorAgent = createDiscoveryAgent(errorModel);

      const state: WorkflowBuilderStateType = {
        messages: [new HumanMessage('Create a workflow')],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      await expect(errorAgent(state)).rejects.toThrow('Model API error');
    });

    it('should handle complex message content', async () => {
      const state: WorkflowBuilderStateType = {
        messages: [
          new HumanMessage([
            { type: 'text' as const, text: 'Create a workflow' },
          ]),
        ],
        workflowJSON: {
          name: 'My workflow',
          nodes: [],
          connections: {},
        },
        coordinationLog: [],
      };

      const result = await discoveryAgent(state);

      expect(result.discoveryContext).toBeDefined();
    });
  });
});
