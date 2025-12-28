/**
 * useWorkflowStream Hook
 * Connects to the workflow architect backend and streams updates
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export type StreamEventType = 'thinking' | 'phase' | 'workflow' | 'response' | 'done' | 'error';

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
  timestamp: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  phase?: string;
}

export interface WorkflowState {
  name: string;
  active: boolean;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    position: [number, number];
    parameters?: Record<string, unknown>;
  }>;
  connections: Record<string, unknown>;
}

export interface UseWorkflowStreamOptions {
  apiUrl?: string;
  threadId?: string;
  onPhaseChange?: (phase: string) => void;
  onWorkflowUpdate?: (workflow: WorkflowState) => void;
  onError?: (error: Error) => void;
}

export interface UseWorkflowStreamReturn {
  messages: Message[];
  workflow: WorkflowState | null;
  currentPhase: string | null;
  isStreaming: boolean;
  isConnected: boolean;
  error: Error | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  retry: () => void;
}

export function useWorkflowStream(options: UseWorkflowStreamOptions = {}): UseWorkflowStreamReturn {
  const {
    apiUrl = '/api/chat',
    threadId,
    onPhaseChange,
    onWorkflowUpdate,
    onError,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentThreadId = useRef(threadId || `session-${Date.now()}`);
  const lastMessageRef = useRef<string>('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      // Cancel any existing stream
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      lastMessageRef.current = message;

      // Reset state
      setIsStreaming(true);
      setError(null);
      setCurrentPhase('thinking');

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            threadId: currentThreadId.current,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        setIsConnected(true);

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let assistantContent = '';
        let assistantMessageId = `assistant-${Date.now()}`;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as StreamEvent;

                switch (event.type) {
                  case 'thinking':
                    setCurrentPhase('thinking');
                    break;

                  case 'phase':
                    const phase = event.data as string;
                    setCurrentPhase(phase);
                    onPhaseChange?.(phase);
                    break;

                  case 'workflow':
                    const newWorkflow = event.data as WorkflowState;
                    setWorkflow(newWorkflow);
                    onWorkflowUpdate?.(newWorkflow);
                    break;

                  case 'response':
                    assistantContent = event.data as string;
                    setMessages((prev) => {
                      const existing = prev.find((m) => m.id === assistantMessageId);
                      if (existing) {
                        return prev.map((m) =>
                          m.id === assistantMessageId ? { ...m, content: assistantContent } : m,
                        );
                      }
                      return [
                        ...prev,
                        {
                          id: assistantMessageId,
                          role: 'assistant' as const,
                          content: assistantContent,
                          timestamp: Date.now(),
                          phase: currentPhase || undefined,
                        },
                      ];
                    });
                    break;

                  case 'done':
                    setCurrentPhase(null);
                    break;

                  case 'error':
                    throw new Error(event.data as string);
                }
              } catch (parseError) {
                // Not JSON, might be partial data
                console.warn('Failed to parse event:', line);
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return; // Intentional abort
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);

        // Add error message
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${error.message}. Please try again.`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        setCurrentPhase(null);
      }
    },
    [apiUrl, onPhaseChange, onWorkflowUpdate, onError],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setWorkflow(null);
    setError(null);
    currentThreadId.current = `session-${Date.now()}`;
  }, []);

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      // Remove last user and assistant messages
      setMessages((prev) => prev.slice(0, -2));
      sendMessage(lastMessageRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    workflow,
    currentPhase,
    isStreaming,
    isConnected,
    error,
    sendMessage,
    clearMessages,
    retry,
  };
}
