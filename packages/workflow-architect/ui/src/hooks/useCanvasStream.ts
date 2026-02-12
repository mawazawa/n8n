/**
 * useCanvasStream Hook
 * Connects to WebSocket for real-time workflow canvas updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkflowNode } from '../../../src/types/workflow';

export type StreamEventType =
  | 'connected'
  | 'thinking'
  | 'phase_start'
  | 'phase_end'
  | 'node_added'
  | 'node_updated'
  | 'node_removed'
  | 'connection_added'
  | 'workflow_complete'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  data: unknown;
}

export interface CanvasNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  isAnimating?: boolean;
  animationDelay?: number;
}

export interface CanvasConnection {
  source: string;
  target: string;
  type: string;
  isAnimating?: boolean;
}

export interface UseCanvasStreamOptions {
  wsUrl?: string;
  sessionId?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  onNodeAdded?: (node: CanvasNode) => void;
  onConnectionAdded?: (connection: CanvasConnection) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
}

export interface UseCanvasStreamReturn {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  currentPhase: string | null;
  progress: { current: number; total: number } | null;
  isConnected: boolean;
  isBuilding: boolean;
  isReconnecting: boolean;
  reconnectAttempt: number;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  clearState: () => void;
}

export function useCanvasStream(options: UseCanvasStreamOptions = {}): UseCanvasStreamReturn {
  const {
    wsUrl = `ws://${window.location.host}/ws`,
    sessionId,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    onNodeAdded,
    onConnectionAdded,
    onComplete,
    onError,
    onReconnecting,
    onReconnected,
  } = options;

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const eventHistoryRef = useRef<StreamEvent[]>([]);
  const lastEventTimestampRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = sessionId ? `${wsUrl}?sessionId=${sessionId}` : wsUrl;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        setError(null);
        setReconnectAttempt(0);
        reconnectAttemptsRef.current = 0;
        console.log('[Canvas] WebSocket connected');

        // Request state recovery if reconnecting
        if (lastEventTimestampRef.current > 0) {
          ws.send(
            JSON.stringify({
              type: 'recover_state',
              lastEventTimestamp: lastEventTimestampRef.current,
              sessionId,
            })
          );
          onReconnected?.();
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const attempt = reconnectAttemptsRef.current;
          const delay = Math.min(reconnectDelay * Math.pow(2, attempt), maxReconnectDelay);

          setIsReconnecting(true);
          setReconnectAttempt(attempt + 1);
          onReconnecting?.(attempt + 1);

          console.log(`[Canvas] Reconnecting in ${delay}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setIsReconnecting(false);
          const err = new Error('Max reconnection attempts reached');
          setError(err);
          onError?.(err);
        }
      };

      ws.onerror = (event) => {
        const err = new Error('WebSocket connection error');
        setError(err);
        onError?.(err);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as StreamEvent;

          // Store event in history for state recovery
          eventHistoryRef.current.push(data);
          lastEventTimestampRef.current = data.timestamp;

          // Keep only last 100 events
          if (eventHistoryRef.current.length > 100) {
            eventHistoryRef.current.shift();
          }

          handleEvent(data);
        } catch (err) {
          console.error('[Canvas] Error parsing message:', err);
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    }
  }, [
    wsUrl,
    sessionId,
    autoReconnect,
    maxReconnectAttempts,
    reconnectDelay,
    maxReconnectDelay,
    onError,
    onReconnecting,
    onReconnected,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsReconnecting(false);
  }, []);

  const clearState = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setCurrentPhase(null);
    setProgress(null);
    setIsBuilding(false);
    setError(null);
    eventHistoryRef.current = [];
    lastEventTimestampRef.current = 0;
  }, []);

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'phase_start':
          const phaseData = event.data as { phase: string };
          setCurrentPhase(phaseData.phase);
          if (phaseData.phase === 'builder') {
            setIsBuilding(true);
          }
          break;

        case 'phase_end':
          const endData = event.data as { phase: string };
          if (endData.phase === 'builder') {
            setIsBuilding(false);
          }
          break;

        case 'node_added':
          const nodeData = event.data as {
            node: WorkflowNode;
            index: number;
            total: number;
          };

          const canvasNode: CanvasNode = {
            id: nodeData.node.id || `node-${nodeData.index}`,
            name: nodeData.node.name,
            type: nodeData.node.type,
            position: nodeData.node.position,
            isAnimating: true,
            animationDelay: nodeData.index * 100,
          };

          setNodes((prev) => [...prev, canvasNode]);
          setProgress({ current: nodeData.index + 1, total: nodeData.total });
          onNodeAdded?.(canvasNode);

          // Remove animation flag after animation completes
          setTimeout(() => {
            setNodes((prev) =>
              prev.map((n) => (n.id === canvasNode.id ? { ...n, isAnimating: false } : n)),
            );
          }, 500);
          break;

        case 'connection_added':
          const connData = event.data as {
            source: string;
            target: string;
            connectionType: string;
          };

          const canvasConn: CanvasConnection = {
            source: connData.source,
            target: connData.target,
            type: connData.connectionType,
            isAnimating: true,
          };

          setConnections((prev) => [...prev, canvasConn]);
          onConnectionAdded?.(canvasConn);

          // Remove animation flag
          setTimeout(() => {
            setConnections((prev) =>
              prev.map((c) =>
                c.source === canvasConn.source && c.target === canvasConn.target
                  ? { ...c, isAnimating: false }
                  : c,
              ),
            );
          }, 300);
          break;

        case 'workflow_complete':
          setIsBuilding(false);
          setCurrentPhase(null);
          setProgress(null);
          onComplete?.();
          break;

        case 'error':
          const errData = event.data as { message: string };
          const error = new Error(errData.message);
          setError(error);
          onError?.(error);
          break;
      }
    },
    [onNodeAdded, onConnectionAdded, onComplete, onError],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    nodes,
    connections,
    currentPhase,
    progress,
    isConnected,
    isBuilding,
    isReconnecting,
    reconnectAttempt,
    error,
    connect,
    disconnect,
    clearState,
  };
}
