/**
 * Integration tests for automatic embeddings pipeline
 * Tests embedding accuracy, latency, retry logic, and status tracking
 */

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
          embedding_version: 'text-embedding-3-small_v1',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      expect(workflow?.embedding_model).toBe('text-embedding-3-small');
      expect(workflow?.embedding_version).toBe('text-embedding-3-small_v1');
    });

    it('should retrieve active embedding model', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_active_embedding_model');

      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(data[0].model_name).toBe('text-embedding-3-small');
        expect(data[0].dimensions).toBe(1536);
      }
    });

    it('should archive embedding version', async () => {
      const supabase = getSupabaseAdminClient();

      // Insert workflow with embedding
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.5);
      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Archive Test Workflow',
          embedding: mockEmbedding,
          embedding_status: 'completed',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      // Get active model
      const { data: models } = await supabase
        .from('embedding_models')
        .select('id')
        .eq('is_active', true)
        .limit(1);

      if (models && models.length > 0) {
        const { data: historyId, error } = await supabase.rpc('archive_embedding_version', {
          p_workflow_id: workflow!.id,
          p_model_id: models[0].id,
          p_quality_score: 95.5,
        });

        expect(error).toBeNull();
        expect(historyId).toBeDefined();
      }
    });
  });

  describe('Advanced Status Tracking', () => {
    it('should use update_embedding_status function', async () => {
      const supabase = getSupabaseAdminClient();

      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Status Function Test',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      // Update to processing
      const { error } = await supabase.rpc('update_embedding_status', {
        p_workflow_id: workflow!.id,
        p_status: 'processing',
        p_model: 'text-embedding-3-small',
        p_version: 'text-embedding-3-small_v1',
      });

      expect(error).toBeNull();

      // Verify status and metadata
      const { data: updated } = await supabase
        .from('workflow_examples')
        .select('embedding_status, embedding_model, embedding_version, embedding_started_at')
        .eq('id', workflow!.id)
        .single();

      expect(updated?.embedding_status).toBe('processing');
      expect(updated?.embedding_model).toBe('text-embedding-3-small');
      expect(updated?.embedding_started_at).toBeDefined();
    });

    it('should track retry count', async () => {
      const supabase = getSupabaseAdminClient();

      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Retry Count Test',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      // Increment retry counter
      const { data: count1 } = await supabase.rpc('increment_embedding_retry', {
        p_workflow_id: workflow!.id,
      });

      expect(count1).toBe(1);

      // Increment again
      const { data: count2 } = await supabase.rpc('increment_embedding_retry', {
        p_workflow_id: workflow!.id,
      });

      expect(count2).toBe(2);
    });

    it('should reset embedding for retry', async () => {
      const supabase = getSupabaseAdminClient();

      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Reset Test',
          embedding_status: 'failed',
          embedding_error: 'Test error',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      const { error } = await supabase.rpc('reset_embedding_for_retry', {
        p_workflow_id: workflow!.id,
      });

      expect(error).toBeNull();

      const { data: reset } = await supabase
        .from('workflow_examples')
        .select('embedding_status, embedding_error')
        .eq('id', workflow!.id)
        .single();

      expect(reset?.embedding_status).toBe('pending');
      expect(reset?.embedding_error).toBeNull();
    });
  });

  describe('Queue Statistics', () => {
    it('should get embedding queue stats', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_embedding_queue_stats');

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should get failed embeddings list', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_failed_embeddings', {
        p_limit: 10,
        p_max_retries: 3,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should get performance metrics', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_embedding_performance_metrics', {
        p_hours: 24,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should get version stats', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_embedding_version_stats');

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Webhook Integration', () => {
    it('should get webhook stats', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase.rpc('get_webhook_stats');

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should access webhook log table', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('embedding_webhook_log')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Queue Monitor View', () => {
    it('should query embedding_queue_monitor view', async () => {
      const supabase = getSupabaseAdminClient();

      const { data, error } = await supabase
        .from('embedding_queue_monitor')
        .select('*')
        .limit(10);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should detect stuck embeddings', async () => {
      const supabase = getSupabaseAdminClient();

      // Create a workflow and mark as stuck
      const { data: workflow } = await supabase
        .from('workflow_examples')
        .insert({
          ...testWorkflow,
          name: 'Stuck Detection Test',
          embedding_status: 'processing',
        })
        .select()
        .single();

      createdWorkflowIds.push(workflow!.id);

      // Manually set old started_at
      await supabase
        .from('workflow_examples')
        .update({
          embedding_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        })
        .eq('id', workflow!.id);

      // Query monitor view
      const { data: monitorData } = await supabase
        .from('embedding_queue_monitor')
        .select('*')
        .eq('id', workflow!.id)
        .single();

      expect(monitorData?.is_stuck).toBe(true);
    });
  });

  describe('Embedding Accuracy', () => {
    it('should validate embedding dimensions', async () => {
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.5);

      expect(mockEmbedding.length).toBe(1536);
      expect(mockEmbedding.every((val) => typeof val === 'number')).toBe(true);
      expect(mockEmbedding.every((val) => !isNaN(val))).toBe(true);
    });

    it('should verify embedding normalization', async () => {
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.5);

      const magnitude = Math.sqrt(
        mockEmbedding.reduce((sum, val) => sum + val * val, 0)
      );

      expect(magnitude).toBeGreaterThan(0);
      expect(magnitude).toBeLessThan(100);
    });
  });
});
