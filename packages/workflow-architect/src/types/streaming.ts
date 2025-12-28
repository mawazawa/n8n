/**
 * Streaming Protocol Types
 * Defines the protocol for real-time workflow updates
 */

import type { WorkflowNode } from './workflow';

// Event types for streaming
export type StreamEventType =
  | 'thinking'
  | 'phase_start'
  | 'phase_end'
  | 'node_added'
  | 'node_updated'
  | 'node_removed'
  | 'connection_added'
  | 'connection_removed'
  | 'workflow_complete'
  | 'error';

// Base event interface
export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  timestamp: number;
  data: T;
}

// Specific event types
export interface ThinkingEvent extends StreamEvent<{ message: string }> {
  type: 'thinking';
}

export interface PhaseStartEvent extends StreamEvent<{ phase: string; description: string }> {
  type: 'phase_start';
}

export interface PhaseEndEvent extends StreamEvent<{ phase: string; success: boolean }> {
  type: 'phase_end';
}

export interface NodeAddedEvent extends StreamEvent<{
  node: WorkflowNode;
  index: number;
  total: number;
}> {
  type: 'node_added';
}

export interface NodeUpdatedEvent extends StreamEvent<{
  nodeId: string;
  changes: Partial<WorkflowNode>;
}> {
  type: 'node_updated';
}

export interface NodeRemovedEvent extends StreamEvent<{ nodeId: string }> {
  type: 'node_removed';
}

export interface ConnectionAddedEvent extends StreamEvent<{
  source: string;
  target: string;
  connectionType: string;
}> {
  type: 'connection_added';
}

export interface ConnectionRemovedEvent extends StreamEvent<{
  source: string;
  target: string;
}> {
  type: 'connection_removed';
}

export interface WorkflowCompleteEvent extends StreamEvent<{
  workflow: { name: string; nodeCount: number };
  summary: string;
}> {
  type: 'workflow_complete';
}

export interface ErrorEvent extends StreamEvent<{
  code: string;
  message: string;
  recoverable: boolean;
}> {
  type: 'error';
}

// Union type for all events
export type WorkflowStreamEvent =
  | ThinkingEvent
  | PhaseStartEvent
  | PhaseEndEvent
  | NodeAddedEvent
  | NodeUpdatedEvent
  | NodeRemovedEvent
  | ConnectionAddedEvent
  | ConnectionRemovedEvent
  | WorkflowCompleteEvent
  | ErrorEvent;

// Event emitter interface
export interface StreamEmitter {
  emit<T extends WorkflowStreamEvent>(event: T): void;
  subscribe(callback: (event: WorkflowStreamEvent) => void): () => void;
}

// Create a simple event emitter
export function createStreamEmitter(): StreamEmitter {
  const listeners: Set<(event: WorkflowStreamEvent) => void> = new Set();

  return {
    emit<T extends WorkflowStreamEvent>(event: T) {
      const enrichedEvent = {
        ...event,
        timestamp: event.timestamp || Date.now(),
      };
      listeners.forEach((listener) => listener(enrichedEvent));
    },

    subscribe(callback: (event: WorkflowStreamEvent) => void) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}

// Helper to create events
export const events = {
  thinking: (message: string): ThinkingEvent => ({
    type: 'thinking',
    timestamp: Date.now(),
    data: { message },
  }),

  phaseStart: (phase: string, description: string): PhaseStartEvent => ({
    type: 'phase_start',
    timestamp: Date.now(),
    data: { phase, description },
  }),

  phaseEnd: (phase: string, success: boolean): PhaseEndEvent => ({
    type: 'phase_end',
    timestamp: Date.now(),
    data: { phase, success },
  }),

  nodeAdded: (node: WorkflowNode, index: number, total: number): NodeAddedEvent => ({
    type: 'node_added',
    timestamp: Date.now(),
    data: { node, index, total },
  }),

  nodeUpdated: (nodeId: string, changes: Partial<WorkflowNode>): NodeUpdatedEvent => ({
    type: 'node_updated',
    timestamp: Date.now(),
    data: { nodeId, changes },
  }),

  nodeRemoved: (nodeId: string): NodeRemovedEvent => ({
    type: 'node_removed',
    timestamp: Date.now(),
    data: { nodeId },
  }),

  connectionAdded: (
    source: string,
    target: string,
    connectionType: string,
  ): ConnectionAddedEvent => ({
    type: 'connection_added',
    timestamp: Date.now(),
    data: { source, target, connectionType },
  }),

  connectionRemoved: (source: string, target: string): ConnectionRemovedEvent => ({
    type: 'connection_removed',
    timestamp: Date.now(),
    data: { source, target },
  }),

  workflowComplete: (
    workflow: { name: string; nodeCount: number },
    summary: string,
  ): WorkflowCompleteEvent => ({
    type: 'workflow_complete',
    timestamp: Date.now(),
    data: { workflow, summary },
  }),

  error: (code: string, message: string, recoverable = true): ErrorEvent => ({
    type: 'error',
    timestamp: Date.now(),
    data: { code, message, recoverable },
  }),
};
