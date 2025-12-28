/**
 * Execution Monitor
 * Subscribes to n8n webhook events for real-time execution monitoring
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ExecutionResult, ExecutionEvent, ExecutionStatus } from './types.js';

export interface ExecutionMonitorConfig {
  n8nBaseUrl: string;
  n8nApiKey: string;
  retentionHours?: number;
  maxStoredExecutions?: number;
  reconnectInterval?: number;
  reconnectMaxAttempts?: number;
}

interface PushMessage {
  type: string;
  data: {
    executionId?: string;
    workflowId?: string;
    nodeName?: string;
    [key: string]: unknown;
  };
}

export class ExecutionMonitor extends EventEmitter {
  private config: ExecutionMonitorConfig;
  private ws: WebSocket | null = null;
  private executions: Map<string, ExecutionResult> = new Map();
  private events: ExecutionEvent[] = [];
  private isMonitoring = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;

  constructor(config: ExecutionMonitorConfig) {
    super();
    this.config = {
      retentionHours: 24,
      maxStoredExecutions: 1000,
      reconnectInterval: 5000,
      reconnectMaxAttempts: 10,
      ...config,
    };
  }

  /**
   * Start monitoring executions via WebSocket
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.reconnectAttempts = 0;

    // Start cleanup timer for old executions
    this.startCleanupTimer();

    // Establish WebSocket connection
    await this.connect();
  }

  /**
   * Stop monitoring and cleanup resources
   */
  stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.sessionId = null;
    this.emit('monitoring_stopped');
  }

  /**
   * Get execution by ID
   */
  getExecution(id: string): ExecutionResult | undefined {
    return this.executions.get(id);
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit = 50): ExecutionResult[] {
    const executions = Array.from(this.executions.values());
    return executions
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get all stored events
   */
  getEvents(executionId?: string): ExecutionEvent[] {
    if (executionId) {
      return this.events.filter(e => e.executionId === executionId);
    }
    return [...this.events];
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.executions.clear();
    this.events = [];
    this.emit('data_cleared');
  }

  /**
   * Get monitoring status
   */
  getStatus(): { isMonitoring: boolean; executionCount: number; eventCount: number; isConnected: boolean } {
    return {
      isMonitoring: this.isMonitoring,
      executionCount: this.executions.size,
      eventCount: this.events.length,
      isConnected: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  /**
   * Establish WebSocket connection to n8n
   */
  private async connect(): Promise<void> {
    try {
      // First, get session ID via REST API
      await this.authenticate();

      if (!this.sessionId) {
        throw new Error('Failed to get session ID');
      }

      // Connect to WebSocket endpoint
      const wsUrl = this.config.n8nBaseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
      const pushUrl = `${wsUrl}/push?sessionId=${this.sessionId}`;

      this.ws = new WebSocket(pushUrl, {
        headers: {
          'X-N8N-API-KEY': this.config.n8nApiKey,
        },
      });

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        this.emit('disconnected');
        this.handleReconnect();
      });

    } catch (error) {
      this.emit('error', error);
      this.handleReconnect();
    }
  }

  /**
   * Authenticate and get session ID
   */
  private async authenticate(): Promise<void> {
    const url = `${this.config.n8nBaseUrl}/rest/login`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': this.config.n8nApiKey,
        },
      });

      if (response.ok) {
        const data = await response.json() as { data?: { sessionId?: string } };
        this.sessionId = data?.data?.sessionId || null;
      } else {
        // If login endpoint doesn't work, generate a session ID
        this.sessionId = this.generateSessionId();
      }
    } catch {
      // Fallback: generate session ID
      this.sessionId = this.generateSessionId();
    }
  }

  /**
   * Generate a session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (!this.isMonitoring) {
      return;
    }

    const maxAttempts = this.config.reconnectMaxAttempts || 10;
    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('error', new Error(`Failed to reconnect after ${maxAttempts} attempts`));
      this.stopMonitoring();
      return;
    }

    this.reconnectAttempts++;
    const interval = (this.config.reconnectInterval || 5000) * this.reconnectAttempts;

    this.emit('reconnecting', { attempt: this.reconnectAttempts, maxAttempts });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, interval);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as PushMessage;

      if (message.type === 'executionStarted') {
        this.handleExecutionStarted(message.data);
      } else if (message.type === 'executionFinished') {
        this.handleExecutionFinished(message.data);
      } else if (message.type === 'nodeExecuteBefore') {
        this.handleNodeStarted(message.data);
      } else if (message.type === 'nodeExecuteAfter') {
        this.handleNodeFinished(message.data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle execution started event
   */
  private handleExecutionStarted(data: Record<string, unknown>): void {
    const executionId = data.executionId as string;
    const workflowId = data.workflowId as string;

    const execution: ExecutionResult = {
      id: executionId,
      workflowId,
      workflowName: (data.workflowName as string) || 'Unknown',
      status: 'running',
      startedAt: new Date().toISOString(),
      mode: (data.mode as ExecutionResult['mode']) || 'manual',
      nodes: [],
    };

    this.executions.set(executionId, execution);

    const event: ExecutionEvent = {
      id: this.generateEventId(),
      workflowId,
      executionId,
      timestamp: Date.now(),
      type: 'started',
      data,
    };

    this.events.push(event);
    this.emit('execution_started', execution);
  }

  /**
   * Handle execution finished event
   */
  private handleExecutionFinished(data: Record<string, unknown>): void {
    const executionId = data.executionId as string;
    const execution = this.executions.get(executionId);

    if (execution) {
      execution.finishedAt = new Date().toISOString();
      execution.status = (data.status as ExecutionStatus) || 'success';
      execution.duration = Date.now() - new Date(execution.startedAt).getTime();

      if (data.error) {
        const error = data.error as { message: string; node?: string; stack?: string };
        execution.error = error;
        execution.status = 'error';
      }

      const event: ExecutionEvent = {
        id: this.generateEventId(),
        workflowId: execution.workflowId,
        executionId,
        timestamp: Date.now(),
        type: 'finished',
        data,
      };

      this.events.push(event);
      this.emit('execution_finished', execution);
    }
  }

  /**
   * Handle node started event
   */
  private handleNodeStarted(data: Record<string, unknown>): void {
    const executionId = data.executionId as string;
    const execution = this.executions.get(executionId);

    if (execution) {
      const nodeName = data.nodeName as string;
      const nodeType = data.nodeType as string;

      const existingNode = execution.nodes.find(n => n.nodeName === nodeName);
      if (!existingNode) {
        execution.nodes.push({
          nodeName,
          nodeType: nodeType || 'unknown',
          startTime: Date.now(),
          status: 'running',
          inputItems: (data.inputItems as number) || 0,
          outputItems: 0,
        });
      }

      const event: ExecutionEvent = {
        id: this.generateEventId(),
        workflowId: execution.workflowId,
        executionId,
        timestamp: Date.now(),
        type: 'node_started',
        data,
      };

      this.events.push(event);
      this.emit('node_started', { execution, nodeName });
    }
  }

  /**
   * Handle node finished event
   */
  private handleNodeFinished(data: Record<string, unknown>): void {
    const executionId = data.executionId as string;
    const execution = this.executions.get(executionId);

    if (execution) {
      const nodeName = data.nodeName as string;
      const node = execution.nodes.find(n => n.nodeName === nodeName);

      if (node) {
        node.endTime = Date.now();
        node.status = (data.error ? 'error' : 'success') as ExecutionStatus;
        node.outputItems = (data.outputItems as number) || 0;

        if (data.error) {
          node.error = (data.error as { message: string }).message;
        }
      }

      const event: ExecutionEvent = {
        id: this.generateEventId(),
        workflowId: execution.workflowId,
        executionId,
        timestamp: Date.now(),
        type: 'node_finished',
        data,
      };

      this.events.push(event);
      this.emit('node_finished', { execution, nodeName });
    }
  }

  /**
   * Start cleanup timer for old executions
   */
  private startCleanupTimer(): void {
    const intervalMs = 60 * 60 * 1000; // Run every hour

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldExecutions();
    }, intervalMs);
  }

  /**
   * Cleanup old executions based on retention policy
   */
  private cleanupOldExecutions(): void {
    const retentionMs = (this.config.retentionHours || 24) * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;
    const maxExecutions = this.config.maxStoredExecutions || 1000;

    // Remove executions older than retention period
    for (const [id, execution] of this.executions.entries()) {
      const executionTime = new Date(execution.startedAt).getTime();
      if (executionTime < cutoffTime) {
        this.executions.delete(id);
      }
    }

    // If still over max, remove oldest
    if (this.executions.size > maxExecutions) {
      const sorted = Array.from(this.executions.entries())
        .sort((a, b) => new Date(a[1].startedAt).getTime() - new Date(b[1].startedAt).getTime());

      const toRemove = sorted.slice(0, this.executions.size - maxExecutions);
      for (const [id] of toRemove) {
        this.executions.delete(id);
      }
    }

    // Cleanup events
    this.events = this.events.filter(event => event.timestamp >= cutoffTime);

    this.emit('cleanup_completed', {
      executionCount: this.executions.size,
      eventCount: this.events.length,
    });
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Factory function to create ExecutionMonitor from environment variables
 */
export function createExecutionMonitor(overrides?: Partial<ExecutionMonitorConfig>): ExecutionMonitor {
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!baseUrl) {
    throw new Error('N8N_BASE_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('N8N_API_KEY environment variable is required');
  }

  return new ExecutionMonitor({
    n8nBaseUrl: baseUrl,
    n8nApiKey: apiKey,
    ...overrides,
  });
}
