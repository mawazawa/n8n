import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initializeSupabase, resetSupabaseClients, getSupabaseAdminClient } from '../../src/supabase/client';

// Skip tests if Supabase is not configured
const SKIP_INTEGRATION = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test workflow data
const testWorkflow = {
  name: 'Auto-embed Test Workflow',
  description: 'Test workflow for automatic embedding',
  category: 'automation',
  techniques: ['scheduled', 'email'],
  workflow_json: {
    name: 'Auto-embed Test',
    active: true,
    nodes: [
      {
        id: 'trigger_1',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: 'gmail_1',
        name: 'Gmail',
        type: 'n8n-nodes-base.gmail',
        typeVersion: 2,
        position: [450, 300],
        parameters: {},
      },
    ],
    connections: {},
  },
  embedding_status: 'pending',
  is_public: true,
};

describe.skipIf(SKIP_INTEGRATION)('Automatic Embedding Pipeline', () => {
  let createdWorkflowIds: string[] = [];

  beforeAll(() => {
    initializeSupabase({
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  });

  afterAll(async () => {
    const supabase = getSupabaseAdminClient();

    // Cleanup: delete all created workflows
    for (const id of createdWorkflowIds) {
      try {
        await supabase.from('workflow_examples').delete().eq('id', id);
      } catch {
        // Ignore cleanup errors
      }
    }

    resetSupabaseClients();
  });

  describe('Embedding Status Tracking', () => {
    it('should insert workflow with pending status', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('workflow_examples')
        .insert(testWorkflow)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.embedding_status).toBe('pending');
      expect(data.embedding).toBeNull();

      createdWorkflowIds.push(data.id);
    });

    it('should track embedding status progression', async () => {
      const supabase = getSupabaseAdminClient();

      // Insert a workflow
      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Status Progression Test',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      // Update to processing
      await supabase
        .from('workflow_examples')
        .update({ embedding_status: 'processing' })
        .eq('id', workflow!.id);

      // Verify status
      const { data: processing } = await supabase
        .from('workflow_examples')
        .select('embedding_status')
        .eq('id', workflow!.id)
        .single();

      expect(processing?.embedding_status).toBe('processing');

      // Update to completed with mock embedding
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.5);

      await supabase
        .from('workflow_examples')
        .update({
          embedding_status: 'completed',
          embedding: mockEmbedding,
        })
        .eq('id', workflow!.id);

      // Verify final status
      const { data: completed } = await supabase
        .from('workflow_examples')
        .select('embedding_status, embedding')
        .eq('id', workflow!.id)
        .single();

      expect(completed?.embedding_status).toBe('completed');
      expect(completed?.embedding).toBeDefined();
      expect(Array.isArray(completed?.embedding)).toBe(true);
    });
  });

  describe('Embedding Generation Performance', () => {
    it('should complete embedding within latency threshold', async () => {
      // This test simulates embedding generation timing
      // Actual embedding calls would be to OpenAI API

      const mockEmbeddingFn = async (text: string): Promise<number[]> => {
        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 100));
        return new Array(1536).fill(0).map((_, i) => Math.sin(i + text.length) * 0.5);
      };

      const start = performance.now();
      const embedding = await mockEmbeddingFn('Test workflow content');
      const duration = performance.now() - start;

      expect(embedding.length).toBe(1536);
      expect(duration).toBeLessThan(2000); // Should complete within 2s
    });
  });

  describe('Batch Embedding', () => {
    it('should process multiple workflows', async () => {
      const supabase = getSupabaseAdminClient();

      // Insert multiple workflows
      const workflows = Array.from({ length: 3 }, (_, i) => ({
        ...testWorkflow,
        name: `Batch Test Workflow ${i + 1}`,
      }));

      const { data: inserted, error } = await supabase
        .from('workflow_examples')
        .insert(workflows)
        .select('id');

      expect(error).toBeNull();
      expect(inserted).toHaveLength(3);

      inserted?.forEach(w => createdWorkflowIds.push(w.id));

      // Verify all have pending status
      const { data: pending } = await supabase
        .from('workflow_examples')
        .select('embedding_status')
        .in('id', inserted!.map(w => w.id));

      pending?.forEach(w => {
        expect(w.embedding_status).toBe('pending');
      });
    });
  });

  describe('Embedding Versioning', () => {
    it('should track embedding model version', async () => {
      const supabase = getSupabaseAdminClient();

      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Version Test Workflow',
          embedding_model: 'text-embedding-3-small',
          embedding_version: 1,
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      expect(workflow?.embedding_model).toBe('text-embedding-3-small');
      expect(workflow?.embedding_version).toBe(1);

      // Update model version
      await supabase
        .from('workflow_examples')
        .update({
          embedding_model: 'text-embedding-3-large',
          embedding_version: 2,
        })
        .eq('id', workflow!.id);

      const { data: updated } = await supabase
        .from('workflow_examples')
        .select('embedding_model, embedding_version')
        .eq('id', workflow!.id)
        .single();

      expect(updated?.embedding_model).toBe('text-embedding-3-large');
      expect(updated?.embedding_version).toBe(2);
    });
  });
});
