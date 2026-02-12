/**
 * Debugger WebSocket API
 * Real-time debugging communication via WebSocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type {
  DebugCommand,
  DebugEvent,
  DebugCommandType,
  DebugEventType,
  CreateBreakpointInput,
  CreateWatchInput,
} from './types.js';
import { DebugCommandSchema } from './types.js';
import { DebugManager } from './manager.js';
import { BreakpointManager } from './breakpoints.js';
import { StepController } from './stepping.js';
import { WatchManager } from './watch.js';
import { DataInspector } from './inspector.js';

export interface DebuggerServerConfig {
  server?: HttpServer;
  port?: number;
  path?: string;
}

export interface ConnectedDebugClient {
  ws: WebSocket;
  sessionId: string;
  connectedAt: number;
}

export class DebuggerServer {
  private wss!: WebSocketServer;
  private clients = new Map<string, ConnectedDebugClient>();
  private sessionClients = new Map<string, Set<string>>();

  constructor(
    private debugManager: DebugManager,
    private breakpointManager: BreakpointManager,
    private stepController: StepController,
    private watchManager: WatchManager,
    private dataInspector: DataInspector,
  ) {}

  /**
   * Start the WebSocket server
   */
  start(config: DebuggerServerConfig = {}): void {
    const { path = '/debug', port = 3082 } = config;

    this.wss = config.server
      ? new WebSocketServer({ server: config.server, path })
      : new WebSocketServer({ port, path });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log(`[Debugger] WebSocket server started on ${config.server ? path : `port ${port}${path}`}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: { url?: string; headers: { host?: string } }): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      ws.send(JSON.stringify({ type: 'error', error: 'sessionId required' }));
      ws.close();
      return;
    }

    const clientId = `${sessionId}-${Date.now()}`;

    const client: ConnectedDebugClient = {
      ws,
      sessionId,
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);

    // Track session clients
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(clientId);

    console.log(`[Debugger] Client connected: ${clientId}`);

    // Send welcome message
    this.sendEvent(clientId, {
      type: 'SESSION_CREATED',
      sessionId,
      timestamp: Date.now(),
    });

    // Handle messages
    ws.on('message', async (data) => {
      await this.handleMessage(clientId, data);
    });

    // Handle disconnect
    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[Debugger] Client error: ${clientId}`, error);
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(clientId: string, data: Buffer | string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(data.toString());

      // Validate command
      const result = DebugCommandSchema.safeParse(message);
      if (!result.success) {
        this.sendError(clientId, 'Invalid command format');
        return;
      }

      const command = result.data;

      // Execute command
      await this.executeCommand(clientId, command);
    } catch (error) {
      console.error('[Debugger] Error handling message:', error);
      this.sendError(clientId, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Execute debug command
   */
  private async executeCommand(clientId: string, command: DebugCommand): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { type, sessionId, payload } = command;

    try {
      switch (type) {
        case 'PAUSE':
          await this.debugManager.pauseSession(sessionId);
          this.broadcastToSession(sessionId, {
            type: 'SESSION_PAUSED',
            sessionId,
            timestamp: Date.now(),
          });
          break;

        case 'RESUME':
          await this.debugManager.resumeSession(sessionId);
          this.broadcastToSession(sessionId, {
            type: 'SESSION_RESUMED',
            sessionId,
            timestamp: Date.now(),
          });
          break;

        case 'STEP_INTO':
          {
            const result = await this.stepController.stepInto(sessionId);
            this.broadcastToSession(sessionId, {
              type: 'STEP_COMPLETED',
              sessionId,
              timestamp: Date.now(),
              data: result,
            });
          }
          break;

        case 'STEP_OVER':
          {
            const result = await this.stepController.stepOver(sessionId);
            this.broadcastToSession(sessionId, {
              type: 'STEP_COMPLETED',
              sessionId,
              timestamp: Date.now(),
              data: result,
            });
          }
          break;

        case 'STEP_OUT':
          {
            const result = await this.stepController.stepOut(sessionId);
            this.broadcastToSession(sessionId, {
              type: 'STEP_COMPLETED',
              sessionId,
              timestamp: Date.now(),
              data: result,
            });
          }
          break;

        case 'ADD_BREAKPOINT':
          {
            const breakpoint = await this.breakpointManager.addBreakpoint(
              sessionId,
              payload as CreateBreakpointInput,
            );
            this.broadcastToSession(sessionId, {
              type: 'SESSION_UPDATED',
              sessionId,
              timestamp: Date.now(),
              data: { breakpoint },
            });
          }
          break;

        case 'REMOVE_BREAKPOINT':
          await this.breakpointManager.removeBreakpoint(sessionId, (payload as { id: string }).id);
          this.broadcastToSession(sessionId, {
            type: 'SESSION_UPDATED',
            sessionId,
            timestamp: Date.now(),
            data: { breakpointRemoved: (payload as { id: string }).id },
          });
          break;

        case 'ENABLE_BREAKPOINT':
          await this.breakpointManager.enableBreakpoint(sessionId, (payload as { id: string }).id);
          this.broadcastToSession(sessionId, {
            type: 'SESSION_UPDATED',
            sessionId,
            timestamp: Date.now(),
          });
          break;

        case 'DISABLE_BREAKPOINT':
          await this.breakpointManager.disableBreakpoint(sessionId, (payload as { id: string }).id);
          this.broadcastToSession(sessionId, {
            type: 'SESSION_UPDATED',
            sessionId,
            timestamp: Date.now(),
          });
          break;

        case 'ADD_WATCH':
          {
            const watch = await this.watchManager.addWatch(sessionId, payload as CreateWatchInput);
            this.broadcastToSession(sessionId, {
              type: 'WATCH_UPDATED',
              sessionId,
              timestamp: Date.now(),
              data: { watch },
            });
          }
          break;

        case 'REMOVE_WATCH':
          await this.watchManager.removeWatch(sessionId, (payload as { id: string }).id);
          this.broadcastToSession(sessionId, {
            type: 'WATCH_UPDATED',
            sessionId,
            timestamp: Date.now(),
            data: { watchRemoved: (payload as { id: string }).id },
          });
          break;

        case 'INSPECT_DATA':
          {
            const inspection = this.dataInspector.inspect((payload as { data: unknown }).data);
            this.sendEvent(clientId, {
              type: 'SESSION_UPDATED',
              sessionId,
              timestamp: Date.now(),
              data: { inspection },
            });
          }
          break;

        case 'GET_STACK':
          {
            const session = await this.debugManager.getSession(sessionId);
            this.sendEvent(clientId, {
              type: 'SESSION_UPDATED',
              sessionId,
              timestamp: Date.now(),
              data: { stack: session.stack },
            });
          }
          break;

        case 'GET_SESSION':
          {
            const session = await this.debugManager.getSession(sessionId);
            this.sendEvent(clientId, {
              type: 'SESSION_UPDATED',
              sessionId,
              timestamp: Date.now(),
              data: { session },
            });
          }
          break;

        default:
          this.sendError(clientId, `Unknown command type: ${type as string}`);
      }
    } catch (error) {
      console.error('[Debugger] Error executing command:', error);
      this.sendError(clientId, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from clients
    this.clients.delete(clientId);

    // Remove from session clients
    const sessionClients = this.sessionClients.get(client.sessionId);
    if (sessionClients) {
      sessionClients.delete(clientId);
      if (sessionClients.size === 0) {
        this.sessionClients.delete(client.sessionId);
      }
    }

    console.log(`[Debugger] Client disconnected: ${clientId}`);
  }

  /**
   * Send event to a specific client
   */
  private sendEvent(clientId: string, event: DebugEvent): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    client.ws.send(JSON.stringify(event));
  }

  /**
   * Send error to a specific client
   */
  private sendError(clientId: string, error: string): void {
    this.sendEvent(clientId, {
      type: 'ERROR',
      sessionId: this.clients.get(clientId)?.sessionId || '',
      timestamp: Date.now(),
      data: { error },
    });
  }

  /**
   * Broadcast event to all clients in a session
   */
  broadcastToSession(sessionId: string, event: DebugEvent): void {
    const clientIds = this.sessionClients.get(sessionId);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      this.sendEvent(clientId, event);
    }
  }

  /**
   * Broadcast event to all clients
   */
  broadcast(event: DebugEvent): void {
    for (const clientId of this.clients.keys()) {
      this.sendEvent(clientId, event);
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for a session
   */
  getSessionClientCount(sessionId: string): number {
    return this.sessionClients.get(sessionId)?.size || 0;
  }

  /**
   * Stop the server
   */
  stop(): void {
    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }

    // Close server
    this.wss.close();

    console.log('[Debugger] WebSocket server stopped');
  }
}

/**
 * Create a debugger server instance
 */
export function createDebuggerServer(
  debugManager: DebugManager,
  breakpointManager: BreakpointManager,
  stepController: StepController,
  watchManager: WatchManager,
  dataInspector: DataInspector,
): DebuggerServer {
  return new DebuggerServer(
    debugManager,
    breakpointManager,
    stepController,
    watchManager,
    dataInspector,
  );
}
