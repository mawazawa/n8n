/**
 * Unit Tests for WorkflowRAGStore
 * Tests workflow indexing and semantic search
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowRAGStore } from '../../src/rag/store';
import type { WorkflowDefinition, WorkflowExample } from '../../src/types/workflow';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe('WorkflowRAGStore', () => {
  let store: WorkflowRAGStore;

  beforeEach(() => {
    store = new WorkflowRAGStore({
      indexPath: '/tmp/test-rag-index.json',
      workflowsPath: '/tmp/test-workflows',
    });
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create store with default paths', () => {
      const defaultStore = new WorkflowRAGStore();
      expect(defaultStore).toBeDefined();
    });

    it('should create store with custom paths', () => {
      const customStore = new WorkflowRAGStore({
        indexPath: '/custom/index.json',
        workflowsPath: '/custom/workflows',
      });
      expect(customStore).toBeDefined();
    });
  });

  describe('load', () => {
    it('should load existing index', async () => {
      const mockIndex = [
        {
          id: 'workflow-1',
          embedding: new Array(256).fill(0.1),
          metadata: {
            id: 'workflow-1',
            name: 'Test Workflow',
            description: 'A test workflow',
            category: 'automation' as const,
            techniques: ['webhook-trigger'],
            workflow: {
              name: 'Test',
              active: false,
              nodes: [],
              connections: {},
            },
          },
        },
      ];

      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(mockIndex));

      await store.load();

      expect(readFile).toHaveBeenCalledWith('/tmp/test-rag-index.json', 'utf-8');
    });

    it('should handle missing index file', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

      await store.load();

      // Should not throw, just start with empty index
      expect(store.getAll()).toEqual([]);
    });
  });

  describe('save', () => {
    it('should save index to disk', async () => {
      const { mkdir, writeFile } = await import('fs/promises');
      vi.mocked(mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(writeFile).mockResolvedValueOnce(undefined);

      await store.save();

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/test-rag-index.json',
        expect.any(String)
      );
    });
  });

  describe('addExample', () => {
    it('should add a workflow example', async () => {
      const example: WorkflowExample = {
        id: 'test-1',
        name: 'Test Workflow',
        description: 'Test description',
        category: 'automation',
        techniques: ['webhook-trigger', 'custom-code'],
        workflow: {
          name: 'Test',
          active: false,
          nodes: [
            {
              id: 'webhook',
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 1,
              position: [250, 300],
              parameters: {},
            },
          ],
          connections: {},
        },
      };

      await store.addExample(example);

      const all = store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('test-1');
    });

    it('should replace existing example with same id', async () => {
      const example1: WorkflowExample = {
        id: 'test-1',
        name: 'Version 1',
        description: 'First version',
        category: 'automation',
        techniques: [],
        workflow: {
          name: 'V1',
          active: false,
          nodes: [],
          connections: {},
        },
      };

      const example2: WorkflowExample = {
        id: 'test-1',
        name: 'Version 2',
        description: 'Second version',
        category: 'automation',
        techniques: [],
        workflow: {
          name: 'V2',
          active: false,
          nodes: [],
          connections: {},
        },
      };

      await store.addExample(example1);
      await store.addExample(example2);

      const all = store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Version 2');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Add some test examples
      await store.addExample({
        id: 'slack-workflow',
        name: 'Slack Notification',
        description: 'Send message to Slack channel',
        category: 'integration',
        techniques: ['webhook-trigger', 'api-integration'],
        workflow: {
          name: 'Slack',
          active: false,
          nodes: [
            {
              id: 'slack',
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              typeVersion: 1,
              position: [250, 300],
              parameters: {},
            },
          ],
          connections: {},
        },
      });

      await store.addExample({
        id: 'ai-workflow',
        name: 'AI Agent Workflow',
        description: 'RAG pipeline with vector search',
        category: 'rag-pipeline',
        techniques: ['ai-agent', 'vector-search', 'rag'],
        workflow: {
          name: 'AI',
          active: false,
          nodes: [
            {
              id: 'agent',
              name: 'AI Agent',
              type: 'n8n-nodes-langchain.agent',
              typeVersion: 1,
              position: [250, 300],
              parameters: {},
            },
          ],
          connections: {},
        },
      });

      await store.addExample({
        id: 'data-workflow',
        name: 'Data Processing',
        description: 'Transform and aggregate data',
        category: 'data-pipeline',
        techniques: ['custom-code', 'aggregation'],
        workflow: {
          name: 'Data',
          active: false,
          nodes: [],
          connections: {},
        },
      });
    });

    it('should search for similar workflows', () => {
      const results = store.search('slack notification', { limit: 3 });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('slack-workflow');
    });

    it('should limit search results', () => {
      const results = store.search('workflow', { limit: 1 });

      expect(results).toHaveLength(1);
    });

    it('should filter by category', () => {
      const results = store.search('workflow', {
        category: 'rag-pipeline',
        limit: 5,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ai-workflow');
    });

    it('should filter by techniques', () => {
      const results = store.search('workflow', {
        techniques: ['vector-search'],
        limit: 5,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ai-workflow');
    });

    it('should handle empty query', () => {
      const results = store.search('', { limit: 5 });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return relevant results for AI queries', () => {
      const results = store.search('AI agent vector database', { limit: 3 });

      expect(results[0].category).toBe('rag-pipeline');
    });
  });

  describe('getByCategory', () => {
    beforeEach(async () => {
      await store.addExample({
        id: 'int-1',
        name: 'Integration 1',
        description: 'Test',
        category: 'integration',
        techniques: [],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });

      await store.addExample({
        id: 'int-2',
        name: 'Integration 2',
        description: 'Test',
        category: 'integration',
        techniques: [],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });

      await store.addExample({
        id: 'ai-1',
        name: 'AI Agent',
        description: 'Test',
        category: 'ai-agent',
        techniques: [],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });
    });

    it('should get workflows by category', () => {
      const results = store.getByCategory('integration');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.category === 'integration')).toBe(true);
    });

    it('should limit results', () => {
      const results = store.getByCategory('integration', 1);

      expect(results).toHaveLength(1);
    });

    it('should return empty for unknown category', () => {
      const results = store.getByCategory('unknown-category' as any);

      expect(results).toHaveLength(0);
    });
  });

  describe('getByTechniques', () => {
    beforeEach(async () => {
      await store.addExample({
        id: 'wh-1',
        name: 'Webhook Workflow',
        description: 'Test',
        category: 'automation',
        techniques: ['webhook-trigger', 'custom-code'],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });

      await store.addExample({
        id: 'ai-1',
        name: 'AI Workflow',
        description: 'Test',
        category: 'ai-agent',
        techniques: ['ai-agent', 'custom-code'],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });
    });

    it('should get workflows by techniques', () => {
      const results = store.getByTechniques(['custom-code']);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.techniques.includes('custom-code'))).toBe(true);
    });

    it('should match any technique', () => {
      const results = store.getByTechniques(['webhook-trigger', 'ai-agent']);

      expect(results).toHaveLength(2);
    });

    it('should limit results', () => {
      const results = store.getByTechniques(['custom-code'], 1);

      expect(results).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await store.addExample({
        id: '1',
        name: 'Test 1',
        description: 'Test',
        category: 'integration',
        techniques: ['webhook-trigger', 'api'],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });

      await store.addExample({
        id: '2',
        name: 'Test 2',
        description: 'Test',
        category: 'integration',
        techniques: ['scheduled', 'api'],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });

      await store.addExample({
        id: '3',
        name: 'Test 3',
        description: 'Test',
        category: 'ai-agent',
        techniques: ['ai-agent', 'rag'],
        workflow: { name: 'Test', active: false, nodes: [], connections: {} },
      });
    });

    it('should return statistics', () => {
      const stats = store.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byCategory.integration).toBe(2);
      expect(stats.byCategory['ai-agent']).toBe(1);
      expect(stats.techniques).toContain('webhook-trigger');
      expect(stats.techniques).toContain('api');
      expect(stats.techniques).toContain('ai-agent');
      expect(stats.techniques).toContain('rag');
    });

    it('should handle empty store', () => {
      const emptyStore = new WorkflowRAGStore();
      const stats = emptyStore.getStats();

      expect(stats.total).toBe(0);
      expect(Object.keys(stats.byCategory)).toHaveLength(0);
      expect(stats.techniques).toHaveLength(0);
    });
  });

  describe('workflow categorization', () => {
    it('should categorize AI agent workflows', async () => {
      const workflow: WorkflowDefinition = {
        name: 'AI Agent',
        active: false,
        nodes: [
          {
            id: 'agent',
            name: 'AI Agent',
            type: 'n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [250, 300],
            parameters: {},
          },
        ],
        connections: {},
      };

      // Use private method through addExample
      const example = {
        id: 'test',
        name: workflow.name,
        description: 'test',
        category: 'ai-agent' as const,
        techniques: [],
        workflow,
      };

      await store.addExample(example);
      const all = store.getAll();

      expect(all[0].category).toBe('ai-agent');
    });

    it('should categorize RAG pipelines', async () => {
      const workflow: WorkflowDefinition = {
        name: 'RAG Pipeline',
        active: false,
        nodes: [
          {
            id: 'agent',
            name: 'AI Agent',
            type: 'n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [250, 300],
            parameters: {},
          },
          {
            id: 'vector',
            name: 'Vector Store',
            type: 'n8n-nodes-langchain.vectorstore',
            typeVersion: 1,
            position: [450, 300],
            parameters: {},
          },
        ],
        connections: {},
      };

      const example = {
        id: 'test',
        name: workflow.name,
        description: 'test',
        category: 'rag-pipeline' as const,
        techniques: [],
        workflow,
      };

      await store.addExample(example);
      const all = store.getAll();

      expect(all[0].category).toBe('rag-pipeline');
    });
  });
});
