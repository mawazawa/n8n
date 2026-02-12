/**
 * Streaming Performance Tests
 * Tests WebSocket streaming performance with 20+ nodes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { createWebSocketServer } from '../../src/server/websocket';
import { events } from '../../src/types/streaming';
import type { WorkflowNode } from '../../src/types/workflow';

describe('Streaming Performance', () => {
  let wsServer: ReturnType<typeof createWebSocketServer>;
  let testClient: WebSocket;
  const TEST_PORT = 3082;

  beforeEach(() => {
    // Create WebSocket server for testing
    wsServer = createWebSocketServer({ port: TEST_PORT });
  });

  afterEach(() => {
    if (testClient) {
      testClient.close();
    }
    if (wsServer) {
      wsServer.close();
    }
  });

  it('should handle streaming 20 nodes without lag', async () => {
    const sessionId = 'perf-test-20-nodes';
    const nodeCount = 20;
    const receivedEvents: any[] = [];
    const startTime = Date.now();

    // Connect test client
    await new Promise<void>((resolve, reject) => {
      testClient = new WebSocket(`ws://localhost:${TEST_PORT}/ws?sessionId=${sessionId}`);

      testClient.on('open', () => resolve());
      testClient.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Listen for events
    testClient.on('message', (data) => {
      const event = JSON.parse(data.toString());
      receivedEvents.push(event);
    });

    // Get emitter for this session
    const emitter = wsServer.getEmitter(sessionId);

    // Emit phase start
    emitter.emit(events.phaseStart('builder', 'Creating workflow structure'));

    // Simulate streaming 20 nodes
    for (let i = 0; i < nodeCount; i++) {
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: `Node ${i}`,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [i * 200, Math.floor(i / 5) * 150],
        parameters: {},
      };

      emitter.emit(events.nodeAdded(node, i, nodeCount));

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Emit connections
    for (let i = 0; i < nodeCount - 1; i++) {
      emitter.emit(events.connectionAdded(`Node ${i}`, `Node ${i + 1}`, 'main'));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Emit phase end
    emitter.emit(events.phaseEnd('builder', true));

    // Wait for all events to be received
    await new Promise((resolve) => setTimeout(resolve, 100));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Performance assertions
    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(5000); // Should complete in less than 5 seconds

    // Verify all nodes were received
    const nodeEvents = receivedEvents.filter((e) => e.type === 'node_added');
    expect(nodeEvents).toHaveLength(nodeCount);

    // Verify all connections were received
    const connectionEvents = receivedEvents.filter((e) => e.type === 'connection_added');
    expect(connectionEvents).toHaveLength(nodeCount - 1);

    console.log(`[Perf] Streamed ${nodeCount} nodes and ${nodeCount - 1} connections in ${duration}ms`);
    console.log(`[Perf] Average time per event: ${(duration / receivedEvents.length).toFixed(2)}ms`);
  }, 10000); // 10 second timeout

  it('should handle streaming 50 nodes efficiently', async () => {
    const sessionId = 'perf-test-50-nodes';
    const nodeCount = 50;
    const receivedEvents: any[] = [];
    const startTime = Date.now();

    // Connect test client
    await new Promise<void>((resolve, reject) => {
      testClient = new WebSocket(`ws://localhost:${TEST_PORT}/ws?sessionId=${sessionId}`);

      testClient.on('open', () => resolve());
      testClient.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Listen for events
    testClient.on('message', (data) => {
      const event = JSON.parse(data.toString());
      receivedEvents.push(event);
    });

    // Get emitter for this session
    const emitter = wsServer.getEmitter(sessionId);

    // Emit phase start
    emitter.emit(events.phaseStart('builder', 'Creating large workflow'));

    // Simulate streaming 50 nodes rapidly
    for (let i = 0; i < nodeCount; i++) {
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: `Node ${i}`,
        type: i % 3 === 0 ? '@n8n/n8n-nodes-langchain.agent' : 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [i * 200, Math.floor(i / 10) * 150],
        parameters: {},
      };

      emitter.emit(events.nodeAdded(node, i, nodeCount));
    }

    // Emit connections (create a more complex graph)
    for (let i = 0; i < nodeCount - 1; i++) {
      emitter.emit(events.connectionAdded(`Node ${i}`, `Node ${i + 1}`, 'main'));

      // Add some branching
      if (i % 5 === 0 && i + 5 < nodeCount) {
        emitter.emit(events.connectionAdded(`Node ${i}`, `Node ${i + 5}`, 'main'));
      }
    }

    // Emit phase end
    emitter.emit(events.phaseEnd('builder', true));

    // Wait for all events to be received
    await new Promise((resolve) => setTimeout(resolve, 200));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Performance assertions
    expect(receivedEvents.length).toBeGreaterThan(50);
    expect(duration).toBeLessThan(10000); // Should complete in less than 10 seconds

    // Verify all nodes were received
    const nodeEvents = receivedEvents.filter((e) => e.type === 'node_added');
    expect(nodeEvents).toHaveLength(nodeCount);

    console.log(`[Perf] Streamed ${nodeCount} nodes in ${duration}ms`);
    console.log(`[Perf] Throughput: ${((nodeCount / duration) * 1000).toFixed(2)} nodes/second`);
  }, 15000);

  it('should handle multiple concurrent clients streaming simultaneously', async () => {
    const sessionId = 'perf-test-concurrent';
    const clientCount = 5;
    const nodesPerClient = 10;
    const clients: WebSocket[] = [];
    const receivedEventsCounts: number[] = Array(clientCount).fill(0);

    const startTime = Date.now();

    // Connect multiple clients
    for (let i = 0; i < clientCount; i++) {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}/ws?sessionId=${sessionId}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => resolve());
        client.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const clientIndex = i;
      client.on('message', () => {
        receivedEventsCounts[clientIndex]++;
      });

      clients.push(client);
    }

    // Get emitter for this session
    const emitter = wsServer.getEmitter(sessionId);

    // Emit events rapidly
    for (let i = 0; i < nodesPerClient; i++) {
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: `Node ${i}`,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [i * 200, 0],
        parameters: {},
      };

      emitter.emit(events.nodeAdded(node, i, nodesPerClient));
    }

    // Wait for all events to be received
    await new Promise((resolve) => setTimeout(resolve, 200));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // All clients should receive the same events
    receivedEventsCounts.forEach((count, index) => {
      expect(count).toBeGreaterThan(0);
      console.log(`[Perf] Client ${index} received ${count} events`);
    });

    // Verify all clients received similar number of events (within 10% variance)
    const avgCount = receivedEventsCounts.reduce((a, b) => a + b, 0) / clientCount;
    receivedEventsCounts.forEach((count) => {
      expect(Math.abs(count - avgCount) / avgCount).toBeLessThan(0.1);
    });

    console.log(`[Perf] ${clientCount} concurrent clients handled in ${duration}ms`);

    // Cleanup
    clients.forEach((c) => c.close());
  }, 15000);

  it('should handle rapid event emission without message loss', async () => {
    const sessionId = 'perf-test-rapid-fire';
    const eventCount = 100;
    const receivedEvents: any[] = [];

    // Connect test client
    await new Promise<void>((resolve, reject) => {
      testClient = new WebSocket(`ws://localhost:${TEST_PORT}/ws?sessionId=${sessionId}`);

      testClient.on('open', () => resolve());
      testClient.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Listen for events
    testClient.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (event.type !== 'connected') {
        receivedEvents.push(event);
      }
    });

    // Get emitter for this session
    const emitter = wsServer.getEmitter(sessionId);

    const startTime = Date.now();

    // Emit events as fast as possible
    for (let i = 0; i < eventCount; i++) {
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: `Node ${i}`,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [i * 200, 0],
        parameters: {},
      };

      emitter.emit(events.nodeAdded(node, i, eventCount));
    }

    const emitTime = Date.now() - startTime;

    // Wait for all events to be received
    await new Promise((resolve) => setTimeout(resolve, 500));

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Verify no message loss
    expect(receivedEvents).toHaveLength(eventCount);

    console.log(`[Perf] Emitted ${eventCount} events in ${emitTime}ms`);
    console.log(`[Perf] Received all ${eventCount} events in ${totalDuration}ms`);
    console.log(`[Perf] Emission rate: ${((eventCount / emitTime) * 1000).toFixed(2)} events/second`);
  }, 15000);

  it('should measure latency for individual events', async () => {
    const sessionId = 'perf-test-latency';
    const eventCount = 20;
    const latencies: number[] = [];

    // Connect test client
    await new Promise<void>((resolve, reject) => {
      testClient = new WebSocket(`ws://localhost:${TEST_PORT}/ws?sessionId=${sessionId}`);

      testClient.on('open', () => resolve());
      testClient.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Listen for events and measure latency
    testClient.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === 'node_added') {
        const latency = Date.now() - event.timestamp;
        latencies.push(latency);
      }
    });

    // Get emitter for this session
    const emitter = wsServer.getEmitter(sessionId);

    // Emit events with timing
    for (let i = 0; i < eventCount; i++) {
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: `Node ${i}`,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [i * 200, 0],
        parameters: {},
      };

      emitter.emit(events.nodeAdded(node, i, eventCount));

      // Small delay between events
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Wait for all events to be received
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Calculate latency statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);

    expect(avgLatency).toBeLessThan(100); // Average latency should be < 100ms
    expect(maxLatency).toBeLessThan(500); // Max latency should be < 500ms

    console.log(`[Perf] Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`[Perf] Min latency: ${minLatency}ms`);
    console.log(`[Perf] Max latency: ${maxLatency}ms`);
  }, 15000);
});
