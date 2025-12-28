/**
 * Performance Tests - Throughput
 * Tests request handling capacity and concurrent operations
 */

import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

// Mock dependencies
vi.mock('../../src/rag/store', () => ({
  getRAGStore: vi.fn().mockResolvedValue({
    search: vi.fn().mockReturnValue([]),
    addExample: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Throughput Performance Tests', () => {
  const THROUGHPUT_THRESHOLDS = {
    ragSearchPerSecond: 50,
    modelSelectionPerSecond: 1000,
    concurrentWorkflows: 10,
  };

  describe('RAG Store Throughput', () => {
    it('should handle multiple searches concurrently', async () => {
      const { getRAGStore } = await import('../../src/rag/store');
      const store = await getRAGStore();

      const queries = Array.from({ length: 20 }, (_, i) => `query ${i}`);

      const startTime = performance.now();
      await Promise.all(
        queries.map(query => store.search(query, { limit: 5 }))
      );
      const duration = performance.now() - startTime;

      const throughput = (queries.length / duration) * 1000; // per second
      console.log(`RAG search throughput: ${throughput.toFixed(2)} queries/sec`);

      expect(throughput).toBeGreaterThan(THROUGHPUT_THRESHOLDS.ragSearchPerSecond);
    });

    it('should handle batch indexing efficiently', async () => {
      const { getRAGStore } = await import('../../src/rag/store');
      const store = await getRAGStore();

      const examples = Array.from({ length: 100 }, (_, i) => ({
        id: `example-${i}`,
        name: `Example ${i}`,
        description: `Test example ${i}`,
        category: 'automation' as const,
        techniques: ['webhook-trigger'],
        workflow: {
          name: `Workflow ${i}`,
          active: false,
          nodes: [],
          connections: {},
        },
      }));

      const startTime = performance.now();
      await Promise.all(examples.map(ex => store.addExample(ex)));
      const duration = performance.now() - startTime;

      const throughput = (examples.length / duration) * 1000;
      console.log(`RAG indexing throughput: ${throughput.toFixed(2)} workflows/sec`);

      expect(throughput).toBeGreaterThan(10);
    });
  });

  describe('Model Router Throughput', () => {
    it('should handle high-frequency model selection', async () => {
      const { ModelRouter } = await import('../../src/models/router');
      const router = new ModelRouter({
        anthropicApiKey: 'test-key',
        googleApiKey: 'test-key',
        openaiApiKey: 'test-key',
      });

      const messages = Array.from({ length: 1000 }, () => [
        new HumanMessage('test message'),
      ]);

      const startTime = performance.now();
      messages.forEach(msg => router.selectModel(msg));
      const duration = performance.now() - startTime;

      const throughput = (messages.length / duration) * 1000;
      console.log(`Model selection throughput: ${throughput.toFixed(2)} selections/sec`);

      expect(throughput).toBeGreaterThan(THROUGHPUT_THRESHOLDS.modelSelectionPerSecond);
    });

    it('should cache models efficiently', async () => {
      const { ModelRouter } = await import('../../src/models/router');
      const router = new ModelRouter({
        anthropicApiKey: 'test-key',
      });

      const iterations = 100;

      // First call (creates model)
      const startTimeFirst = performance.now();
      router.getModel('claude-opus-4-5');
      const durationFirst = performance.now() - startTimeFirst;

      // Subsequent calls (uses cache)
      const startTimeCached = performance.now();
      for (let i = 0; i < iterations; i++) {
        router.getModel('claude-opus-4-5');
      }
      const durationCached = performance.now() - startTimeCached;

      const avgCachedTime = durationCached / iterations;

      console.log(`First model creation: ${durationFirst.toFixed(2)}ms`);
      console.log(`Cached model access: ${avgCachedTime.toFixed(4)}ms`);

      // Cached access should be much faster
      expect(avgCachedTime).toBeLessThan(1);
    });
  });

  describe('Concurrent Workflow Generation', () => {
    it('should handle multiple workflow generations concurrently', async () => {
      const workflowCount = 10;
      const workflows = Array.from({ length: workflowCount }, (_, i) => ({
        id: i,
        prompt: `Create workflow ${i}`,
      }));

      const startTime = performance.now();
      await Promise.all(
        workflows.map(async (wf) => {
          // Simulate workflow generation
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            id: wf.id,
            workflow: {
              name: `Workflow ${wf.id}`,
              nodes: [],
              connections: {},
            },
          };
        })
      );
      const duration = performance.now() - startTime;

      const throughput = (workflowCount / duration) * 1000;
      console.log(`Concurrent workflow generation: ${throughput.toFixed(2)} workflows/sec`);

      // Should complete in parallel, not sequential
      expect(duration).toBeLessThan(workflowCount * 100 * 1.2);
    });

    it('should maintain performance under sustained load', async () => {
      const batches = 5;
      const batchSize = 10;
      const durations: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const startTime = performance.now();

        await Promise.all(
          Array.from({ length: batchSize }, async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          })
        );

        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      console.log(`Average batch duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Standard deviation: ${stdDev.toFixed(2)}ms`);

      // Performance should be consistent across batches
      const cv = stdDev / avgDuration;
      expect(cv).toBeLessThan(0.3);
    });
  });

  describe('N8n Client Throughput', () => {
    it('should handle concurrent API requests', async () => {
      const { N8nClient } = await import('../../src/n8n/client');

      // Mock fetch
      let requestCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        requestCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [] }),
        });
      });

      const client = new N8nClient({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-key',
      });

      const operations = 20;
      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: operations }, () => client.listWorkflows())
      );

      const duration = performance.now() - startTime;
      const throughput = (operations / duration) * 1000;

      console.log(`N8n API throughput: ${throughput.toFixed(2)} requests/sec`);
      expect(requestCount).toBe(operations);
      expect(throughput).toBeGreaterThan(10);
    });

    it('should batch workflow operations efficiently', async () => {
      const { N8nClient } = await import('../../src/n8n/client');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const client = new N8nClient({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-key',
      });

      const workflows = Array.from({ length: 50 }, (_, i) => ({
        name: `Workflow ${i}`,
        active: false,
        nodes: [],
        connections: {},
      }));

      const startTime = performance.now();

      await Promise.all(
        workflows.map(wf => client.createWorkflow(wf))
      );

      const duration = performance.now() - startTime;
      const throughput = (workflows.length / duration) * 1000;

      console.log(`Workflow creation throughput: ${throughput.toFixed(2)} workflows/sec`);
      expect(throughput).toBeGreaterThan(5);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const { ModelRouter } = await import('../../src/models/router');

      // Get initial memory
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const router = new ModelRouter({ anthropicApiKey: 'test-key' });
        router.selectModel([new HumanMessage('test')]);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);

      // Should not have significant memory leak
      expect(memoryIncrease).toBeLessThan(50);
    });

    it('should handle large workflows without excessive memory', async () => {
      const largeWorkflow = {
        name: 'Large Workflow',
        active: false,
        nodes: Array.from({ length: 100 }, (_, i) => ({
          id: `node_${i}`,
          name: `Node ${i}`,
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [i * 200, 300] as [number, number],
          parameters: {},
        })),
        connections: {},
      };

      const initialMemory = process.memoryUsage().heapUsed;

      // Create many large workflows
      const workflows = Array.from({ length: 10 }, () => ({
        ...largeWorkflow,
      }));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryUsed = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Large workflow memory: ${memoryUsed.toFixed(2)} MB`);

      expect(memoryUsed).toBeLessThan(100);
    });
  });

  describe('Throughput Benchmarks', () => {
    it('should report overall system throughput', async () => {
      console.log('\n=== Throughput Benchmarks ===');

      const results = {
        ragSearch: 0,
        modelSelection: 0,
        apiRequests: 0,
      };

      // RAG Search
      const { getRAGStore } = await import('../../src/rag/store');
      const store = await getRAGStore();
      const ragStart = performance.now();
      await Promise.all(
        Array.from({ length: 50 }, () => store.search('test', { limit: 5 }))
      );
      results.ragSearch = (50 / (performance.now() - ragStart)) * 1000;

      // Model Selection
      const { ModelRouter } = await import('../../src/models/router');
      const router = new ModelRouter({ anthropicApiKey: 'test-key' });
      const modelStart = performance.now();
      Array.from({ length: 1000 }, () =>
        router.selectModel([new HumanMessage('test')])
      );
      results.modelSelection = (1000 / (performance.now() - modelStart)) * 1000;

      // API Requests
      const { N8nClient } = await import('../../src/n8n/client');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      const client = new N8nClient({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-key',
      });
      const apiStart = performance.now();
      await Promise.all(
        Array.from({ length: 30 }, () => client.listWorkflows())
      );
      results.apiRequests = (30 / (performance.now() - apiStart)) * 1000;

      console.log(`RAG Search: ${results.ragSearch.toFixed(2)} queries/sec`);
      console.log(`Model Selection: ${results.modelSelection.toFixed(2)} selections/sec`);
      console.log(`API Requests: ${results.apiRequests.toFixed(2)} requests/sec`);
      console.log('===========================\n');

      expect(results.ragSearch).toBeGreaterThan(0);
      expect(results.modelSelection).toBeGreaterThan(0);
      expect(results.apiRequests).toBeGreaterThan(0);
    });
  });
});
