import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SupabaseVectorStore } from '../../src/rag/supabase-store';
import { initializeSupabase, resetSupabaseClients } from '../../src/supabase/client';
import type { WorkflowDefinition } from '../../src/types/workflow';

// Skip tests if Supabase is not configured
const SKIP_INTEGRATION = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mock embedding function for testing
const mockEmbeddingFn = async (text: string): Promise<number[]> => {
  // Simple deterministic embedding based on text hash
  const hash = text.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);

  // Generate 1536-dimensional vector
  const embedding = new Array(1536).fill(0).map((_, i) => {
    return Math.sin(hash + i * 0.1) * 0.5 + 0.5;
  });

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / magnitude);
};

// Sample workflow for testing
const testWorkflow: WorkflowDefinition = {
  name: 'Test Email Automation',
  active: true,
  nodes: [
    {
      id: 'trigger_1',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
    },
    {
      id: 'gmail_1',
      name: 'Gmail',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2,
      position: [450, 300],
      parameters: { resource: 'message', operation: 'getAll' },
    },
    {
      id: 'code_1',
      name: 'Process Emails',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [650, 300],
      parameters: { jsCode: 'return items;' },
    },
  ],
  connections: {
    'Schedule Trigger': {
      main: [[{ node: 'Gmail', type: 'main', index: 0 }]],
    },
    Gmail: {
      main: [[{ node: 'Process Emails', type: 'main', index: 0 }]],
    },
  },
};

describe.skipIf(SKIP_INTEGRATION)('Supabase RAG Integration', () => {
  let store: SupabaseVectorStore;
  let createdWorkflowIds: string[] = [];

  beforeAll(() => {
    // Initialize Supabase client
    initializeSupabase({
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    store = new SupabaseVectorStore({}, mockEmbeddingFn);
  });

  afterAll(async () => {
    // Cleanup: delete all created workflows
    for (const id of createdWorkflowIds) {
      try {
        await store.deleteWorkflow(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    resetSupabaseClients();
  });

  beforeEach(() => {
    // Reset created workflows for each test
    createdWorkflowIds = [];
  });

  describe('addWorkflow', () => {
    it('should add a workflow and return an ID', async () => {
      const id = await store.addWorkflow(testWorkflow, {
        name: 'Test Email Automation',
        description: 'Automated email processing workflow',
        category: 'automation',
        techniques: ['scheduled', 'email'],
        isPublic: true,
      });

      createdWorkflowIds.push(id);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should index workflow nodes', async () => {
      const id = await store.addWorkflow(testWorkflow, {
        name: 'Node Indexing Test',
        description: 'Test workflow for node indexing',
        category: 'automation',
        techniques: ['scheduled'],
        isPublic: true,
      });

      createdWorkflowIds.push(id);

      // Search for nodes should find our workflow's nodes
      const nodeResults = await store.searchNodes('Gmail email', { limit: 5 });

      // Should find some nodes (may include other workflows)
      expect(nodeResults).toBeDefined();
      expect(Array.isArray(nodeResults)).toBe(true);
    });
  });

  describe('searchWorkflows', () => {
    beforeAll(async () => {
      // Add test workflows for search
      const id1 = await store.addWorkflow(testWorkflow, {
        name: 'Email Processing Pipeline',
        description: 'Process incoming emails and extract data',
        category: 'automation',
        techniques: ['scheduled', 'email', 'data-extraction'],
        isPublic: true,
      });
      createdWorkflowIds.push(id1);

      const aiWorkflow: WorkflowDefinition = {
        name: 'AI Customer Support',
        active: true,
        nodes: [
          {
            id: 'webhook_1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: {},
          },
          {
            id: 'agent_1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [450, 300],
            parameters: {},
          },
        ],
        connections: {},
      };

      const id2 = await store.addWorkflow(aiWorkflow, {
        name: 'AI Customer Support',
        description: 'AI-powered customer support agent',
        category: 'ai-agent',
        techniques: ['ai-agent', 'webhook', 'tool-use'],
        isPublic: true,
      });
      createdWorkflowIds.push(id2);
    });

    it('should find similar workflows by semantic search', async () => {
      const results = await store.searchWorkflows('email automation processing', {
        limit: 5,
        threshold: 0.3, // Lower threshold for mock embeddings
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter by category', async () => {
      const results = await store.searchWorkflows('customer support', {
        limit: 5,
        category: 'ai-agent',
        threshold: 0.3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // All results should be ai-agent category
      results.forEach((r) => {
        expect(r.category).toBe('ai-agent');
      });
    });

    it('should return results within latency threshold', async () => {
      const start = performance.now();
      await store.searchWorkflows('workflow automation', { limit: 5 });
      const duration = performance.now() - start;

      // Should complete within 200ms for good UX
      expect(duration).toBeLessThan(2000); // Allow more time for test environment
    });
  });

  describe('hybridSearch', () => {
    it('should combine semantic and keyword search', async () => {
      const results = await store.hybridSearch('email Gmail schedule', {
        limit: 5,
        semanticWeight: 0.7,
        keywordWeight: 0.3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Results should have both scores
      results.forEach((r) => {
        expect(r.semantic_score).toBeDefined();
        expect(r.keyword_score).toBeDefined();
        expect(r.combined_score).toBeDefined();
      });
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow and its node chunks', async () => {
      const id = await store.addWorkflow(testWorkflow, {
        name: 'Delete Test Workflow',
        category: 'automation',
        isPublic: true,
      });

      // Delete the workflow
      await store.deleteWorkflow(id);

      // Search should not find it
      const results = await store.searchWorkflows('Delete Test Workflow', {
        limit: 1,
        threshold: 0.9,
      });

      const found = results.find((r) => r.id === id);
      expect(found).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return store statistics', async () => {
      const stats = await store.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalWorkflows).toBe('number');
      expect(typeof stats.totalNodeChunks).toBe('number');
      expect(typeof stats.pendingEmbeddings).toBe('number');
      expect(typeof stats.failedEmbeddings).toBe('number');
    });
  });
});
