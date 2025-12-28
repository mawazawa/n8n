/**
 * Execution Monitoring Type Definitions
 * Detailed types for monitoring and analyzing workflow executions
 */

export type ExecutionStatus = 'running' | 'success' | 'error' | 'waiting' | 'canceled';

export interface ExecutionNode {
  nodeName: string;
  nodeType: string;
  startTime: number;
  endTime?: number;
  status: ExecutionStatus;
  error?: string;
  inputItems: number;
  outputItems: number;
}

export interface ExecutionEvent {
  id: string;
  workflowId: string;
  executionId: string;
  timestamp: number;
  type: 'started' | 'node_started' | 'node_finished' | 'finished' | 'error';
  data: Record<string, unknown>;
}

export interface ExecutionResult {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  mode: 'manual' | 'trigger' | 'webhook' | 'retry';
  nodes: ExecutionNode[];
  error?: { message: string; node?: string; stack?: string };
  retryOf?: string;
  retrySuccessId?: string;
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  errorsByNode: Record<string, number>;
  executionsByHour: Record<string, number>;
}
