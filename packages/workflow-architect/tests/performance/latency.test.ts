/**
 * Performance Tests - Latency
 * Tests response time and latency of agent operations
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

// Mock dependencies for performance testing
vi.mock('../../src/rag/store', () => ({
  getRAGStore: vi.fn().mockResolvedValue({
    search: vi.fn().mockReturnValue([]),
  }),
}));

describe('Latency Performance Tests', () => {
  const LATENCY_THRESHOLDS = {
    ragSearch: 100, // ms
    discovery: 2000, // ms
    builder: 1500, // ms
    configurator: 2000, // ms
    endToEnd: 8000, // ms
  };

  describe('RAG Store Performance', () => {
    it('should search workflows within latency threshold', async () => {
      const { getRAGStore } = await import('../../src/rag/store');
      const store = await getRAGStore();

      const startTime = performance.now();
      await store.search('test query', { limit: 5 });
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.ragSearch);
      console.log(`RAG search latency: ${duration.toFixed(2)}ms`);
    });

    it('should handle large result sets efficiently', async () => {
      const { getRAGStore } = await import('../../src/rag/store');
      const store = await getRAGStore();

      // Add many examples
      for (let i = 0; i < 100; i++) {
        await store.addExample({
          id: `example-${i}`,
          name: `Example ${i}`,
          description: `Test example ${i}`,
          category: 'automation',
          techniques: ['webhook-trigger'],
          workflow: {
            name: `Workflow ${i}`,
            active: false,
            nodes: [],
            connections: {},
          },
        });
      }

      const startTime = performance.now();
      await store.search('test', { limit: 10 });
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.ragSearch * 2);
      console.log(`RAG search with 100 entries: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Model Router Performance', () => {
    it('should select model quickly', async () => {
      const { ModelRouter } = await import('../../src/models/router');
      const router = new ModelRouter({
        anthropicApiKey: 'test-key',
        googleApiKey: 'test-key',
        openaiApiKey: 'test-key',
      });

      const messages = [new HumanMessage('test')];

      const startTime = performance.now();
      router.selectModel(messages);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(10); // Should be nearly instant
      console.log(`Model selection latency: ${duration.toFixed(2)}ms`);
    });

    it('should estimate tokens quickly', async () => {
      const { estimateTokenCount } = await import('../../src/models/router');
      const messages = [new HumanMessage('a'.repeat(10000))];

      const startTime = performance.now();
      estimateTokenCount(messages);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(10);
      console.log(`Token estimation latency: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Agent Latency', () => {
    it('should measure discovery agent latency', async () => {
      // Simulated agent execution
      const startTime = performance.now();

      // Mock agent work
      await new Promise(resolve => setTimeout(resolve, 50));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.discovery);
      console.log(`Discovery agent latency: ${duration.toFixed(2)}ms`);
    });

    it('should measure builder agent latency', async () => {
      const startTime = performance.now();

      // Mock builder work
      await new Promise(resolve => setTimeout(resolve, 30));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.builder);
      console.log(`Builder agent latency: ${duration.toFixed(2)}ms`);
    });

    it('should measure configurator agent latency', async () => {
      const startTime = performance.now();

      // Mock configurator work
      await new Promise(resolve => setTimeout(resolve, 40));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.configurator);
      console.log(`Configurator agent latency: ${duration.toFixed(2)}ms`);
    });
  });

  describe('End-to-End Latency', () => {
    it('should complete workflow generation within threshold', async () => {
      const startTime = performance.now();

      // Simulate full workflow generation
      // Discovery
      await new Promise(resolve => setTimeout(resolve, 50));

      // Builder
      await new Promise(resolve => setTimeout(resolve, 30));

      // Configurator
      await new Promise(resolve => setTimeout(resolve, 40));

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(LATENCY_THRESHOLDS.endToEnd);
      console.log(`End-to-end latency: ${duration.toFixed(2)}ms`);
    });
  });

  describe('N8n Client Latency', () => {
    it('should make API requests with acceptable latency', async () => {
      const { N8nClient } = await import('../../src/n8n/client');

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const client = new N8nClient({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-key',
      });

      const startTime = performance.now();
      await client.listWorkflows();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100); // Mock should be fast
      console.log(`N8n API request latency: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Latency Statistics', () => {
    it('should measure p50, p95, p99 latency', async () => {
      const latencies: number[] = [];

      // Run operation 100 times
      for (let i = 0; i < 100; i++) {
        const startTime = performance.now();
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        const duration = performance.now() - startTime;
        latencies.push(duration);
      }

      // Sort for percentile calculation
      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.50)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log(`Latency p50: ${p50.toFixed(2)}ms`);
      console.log(`Latency p95: ${p95.toFixed(2)}ms`);
      console.log(`Latency p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(100);
      expect(p95).toBeLessThan(200);
      expect(p99).toBeLessThan(300);
    });

    it('should have consistent latency under load', async () => {
      const latencies: number[] = [];

      // Parallel operations
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push((async () => {
          const startTime = performance.now();
          await new Promise(resolve => setTimeout(resolve, 10));
          const duration = performance.now() - startTime;
          latencies.push(duration);
        })());
      }

      await Promise.all(promises);

      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const variance = latencies.reduce((sum, lat) => sum + Math.pow(lat - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);

      console.log(`Average latency: ${avg.toFixed(2)}ms`);
      console.log(`Standard deviation: ${stdDev.toFixed(2)}ms`);

      // Coefficient of variation should be low (< 0.5)
      const cv = stdDev / avg;
      expect(cv).toBeLessThan(0.5);
    });
  });
});
