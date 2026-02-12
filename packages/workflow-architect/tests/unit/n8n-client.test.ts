/**
 * Unit Tests for N8nClient
 * Tests REST API operations against n8n instance
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { N8nClient } from '../../src/n8n/client';
import type { WorkflowDefinition, ExecutionResult, Credential } from '../../src/types/workflow';

describe('N8nClient', () => {
  let client: N8nClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new N8nClient({
      baseUrl: 'http://localhost:5678',
      apiKey: 'test-api-key',
    });

    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeDefined();
    });

    it('should remove trailing slash from baseUrl', () => {
      const clientWithSlash = new N8nClient({
        baseUrl: 'http://localhost:5678/',
        apiKey: 'test-key',
      });
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe('createWorkflow', () => {
    it('should create a new workflow', async () => {
      const workflow: Omit<WorkflowDefinition, 'id'> = {
        name: 'Test Workflow',
        active: false,
        nodes: [],
        connections: {},
      };

      const responseWorkflow: WorkflowDefinition = {
        id: '123',
        ...workflow,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWorkflow,
      });

      const result = await client.createWorkflow(workflow);

      expect(result).toEqual(responseWorkflow);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': 'test-api-key',
          },
          body: JSON.stringify(workflow),
        })
      );
    });

    it('should handle API errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(client.createWorkflow({
        name: 'Test',
        active: false,
        nodes: [],
        connections: {},
      })).rejects.toThrow('n8n API error (400): Bad Request');
    });
  });

  describe('getWorkflow', () => {
    it('should fetch a workflow by id', async () => {
      const workflow: WorkflowDefinition = {
        id: '123',
        name: 'Test Workflow',
        active: true,
        nodes: [],
        connections: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => workflow,
      });

      const result = await client.getWorkflow('123');

      expect(result).toEqual(workflow);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/123',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('updateWorkflow', () => {
    it('should update an existing workflow', async () => {
      const updates = { name: 'Updated Workflow' };
      const updatedWorkflow: WorkflowDefinition = {
        id: '123',
        name: 'Updated Workflow',
        active: true,
        nodes: [],
        connections: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedWorkflow,
      });

      const result = await client.updateWorkflow('123', updates);

      expect(result).toEqual(updatedWorkflow);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        })
      );
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.deleteWorkflow('123');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('listWorkflows', () => {
    it('should list workflows without filters', async () => {
      const workflows: WorkflowDefinition[] = [
        {
          id: '1',
          name: 'Workflow 1',
          active: true,
          nodes: [],
          connections: {},
        },
        {
          id: '2',
          name: 'Workflow 2',
          active: false,
          nodes: [],
          connections: {},
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: workflows }),
      });

      const result = await client.listWorkflows();

      expect(result.data).toEqual(workflows);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows',
        expect.any(Object)
      );
    });

    it('should list workflows with filters', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.listWorkflows({
        active: true,
        tags: ['automation', 'production'],
        limit: 10,
        cursor: 'next-page',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('active=true'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('tags=automation%2Cproduction'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('cursor=next-page'),
        expect.any(Object)
      );
    });
  });

  describe('activateWorkflow', () => {
    it('should activate a workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: '123',
        name: 'Test',
        active: true,
        nodes: [],
        connections: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => workflow,
      });

      const result = await client.activateWorkflow('123');

      expect(result.active).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/123/activate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('deactivateWorkflow', () => {
    it('should deactivate a workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: '123',
        name: 'Test',
        active: false,
        nodes: [],
        connections: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => workflow,
      });

      const result = await client.deactivateWorkflow('123');

      expect(result.active).toBe(false);
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a workflow without data', async () => {
      const execution: ExecutionResult = {
        id: 'exec-1',
        workflowId: '123',
        finished: true,
        mode: 'manual',
        startedAt: new Date(),
        stoppedAt: new Date(),
        status: 'success',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => execution,
      });

      const result = await client.executeWorkflow('123');

      expect(result).toEqual(execution);
    });

    it('should execute a workflow with data', async () => {
      const data = { userId: '456', action: 'test' };
      const execution: ExecutionResult = {
        id: 'exec-2',
        workflowId: '123',
        finished: true,
        mode: 'manual',
        startedAt: new Date(),
        stoppedAt: new Date(),
        status: 'success',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => execution,
      });

      const result = await client.executeWorkflow('123', data);

      expect(result).toEqual(execution);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/123/run',
        expect.objectContaining({
          body: JSON.stringify({ data }),
        })
      );
    });
  });

  describe('getExecution', () => {
    it('should fetch an execution by id', async () => {
      const execution: ExecutionResult = {
        id: 'exec-1',
        workflowId: '123',
        finished: true,
        mode: 'manual',
        startedAt: new Date(),
        stoppedAt: new Date(),
        status: 'success',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => execution,
      });

      const result = await client.getExecution('exec-1');

      expect(result).toEqual(execution);
    });
  });

  describe('listExecutions', () => {
    it('should list all executions', async () => {
      const executions: ExecutionResult[] = [
        {
          id: 'exec-1',
          workflowId: '123',
          finished: true,
          mode: 'manual',
          startedAt: new Date(),
          stoppedAt: new Date(),
          status: 'success',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: executions }),
      });

      const result = await client.listExecutions();

      expect(result.data).toEqual(executions);
    });

    it('should list executions for a specific workflow', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.listExecutions('123', { status: 'success', limit: 5 });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('workflowId=123'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=success'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });
  });

  describe('listCredentials', () => {
    it('should list all credentials', async () => {
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          name: 'Slack Credentials',
          type: 'slackApi',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: credentials }),
      });

      const result = await client.listCredentials();

      expect(result.data).toEqual(credentials);
    });

    it('should list credentials by type', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.listCredentials('slackApi');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('type=slackApi'),
        expect.any(Object)
      );
    });
  });

  describe('getCredential', () => {
    it('should fetch a credential by id', async () => {
      const credential: Credential = {
        id: 'cred-1',
        name: 'Slack Credentials',
        type: 'slackApi',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => credential,
      });

      const result = await client.getCredential('cred-1');

      expect(result).toEqual(credential);
    });
  });

  describe('getNodeTypes', () => {
    it('should fetch available node types', async () => {
      const nodeTypes = {
        data: [
          {
            name: 'n8n-nodes-base.slack',
            displayName: 'Slack',
            description: 'Send messages to Slack',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => nodeTypes,
      });

      const result = await client.getNodeTypes();

      expect(result).toEqual(nodeTypes);
    });

    it('should return empty array if endpoint not available', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Not found'));

      const result = await client.getNodeTypes();

      expect(result.data).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });
});
