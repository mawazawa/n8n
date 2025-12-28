/**
 * WebSocket Server for Real-time Workflow Updates
 * Streams workflow building events to connected clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { WorkflowStreamEvent, StreamEmitter } from '../types/streaming';
import { createStreamEmitter } from '../types/streaming';

export interface WebSocketServerConfig {
  server?: HttpServer;
  port?: number;
  path?: string;
  heartbeatInterval?: number;
}

export interface ConnectedClient {
  ws: WebSocket;
  sessionId: string;
  isAlive: boolean;
  connectedAt: number;
}

export function createWebSocketServer(config: WebSocketServerConfig = {}) {
  const { path = '/ws', heartbeatInterval = 30000 } = config;

  const wss = config.server
    ? new WebSocketServer({ server: config.server, path })
    : new WebSocketServer({ port: config.port || 3081, path });

  const clients = new Map<string, ConnectedClient>();
  const sessionEmitters = new Map<string, StreamEmitter>();

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    clients.forEach((client, id) => {
      if (!client.isAlive) {
        client.ws.terminate();
        clients.delete(id);
        return;
      }
      client.isAlive = false;
      client.ws.ping();
    });
  }, heartbeatInterval);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws, req) => {
    // Extract session ID from URL query
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId') || `client-${Date.now()}`;
    const clientId = `${sessionId}-${Date.now()}`;

    // Register client
    const client: ConnectedClient = {
      ws,
      sessionId,
      isAlive: true,
      connectedAt: Date.now(),
    };
    clients.set(clientId, client);

    console.log(`[WS] Client connected: ${clientId} (session: ${sessionId})`);

    // Get or create emitter for this session
    if (!sessionEmitters.has(sessionId)) {
      sessionEmitters.set(sessionId, createStreamEmitter());
    }
    const emitter = sessionEmitters.get(sessionId)!;

    // Subscribe to events for this session
    const unsubscribe = emitter.subscribe((event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    });

    // Handle pong (heartbeat response)
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle different message types
        switch (message.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;

          case 'subscribe':
            // Client wants to subscribe to a different session
            if (message.sessionId) {
              client.sessionId = message.sessionId;
            }
            break;

          default:
            console.log(`[WS] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
      }
    });

    // Handle close
    ws.on('close', () => {
      unsubscribe();
      clients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId}`);

      // Clean up empty session emitters
      const sessionClients = Array.from(clients.values()).filter(
        (c) => c.sessionId === sessionId,
      );
      if (sessionClients.length === 0) {
        sessionEmitters.delete(sessionId);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WS] Client error: ${clientId}`, error);
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        sessionId,
        timestamp: Date.now(),
      }),
    );
  });

  // Public API
  return {
    wss,

    /**
     * Get the emitter for a session
     */
    getEmitter(sessionId: string): StreamEmitter {
      if (!sessionEmitters.has(sessionId)) {
        sessionEmitters.set(sessionId, createStreamEmitter());
      }
      return sessionEmitters.get(sessionId)!;
    },

    /**
     * Broadcast an event to all clients in a session
     */
    broadcast(sessionId: string, event: WorkflowStreamEvent) {
      const emitter = this.getEmitter(sessionId);
      emitter.emit(event);
    },

    /**
     * Get connected client count
     */
    getClientCount(): number {
      return clients.size;
    },

    /**
     * Get clients for a session
     */
    getSessionClients(sessionId: string): ConnectedClient[] {
      return Array.from(clients.values()).filter((c) => c.sessionId === sessionId);
    },

    /**
     * Close the server
     */
    close() {
      clearInterval(heartbeat);
      wss.close();
    },
  };
}

export type WebSocketServerInstance = ReturnType<typeof createWebSocketServer>;
