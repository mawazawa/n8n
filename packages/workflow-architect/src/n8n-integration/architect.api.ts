/**
 * Workflow Architect API Client
 *
 * Handles communication with the backend via SSE (Server-Sent Events) and REST APIs.
 * This provides real-time streaming of AI responses and workflow generation.
 */

/**
 * Stream event types from the backend
 */
export enum StreamEventType {
  THINKING = 'thinking',
  PHASE = 'phase',
  WORKFLOW = 'workflow',
  RESPONSE = 'response',
  DONE = 'done',
  ERROR = 'error',
}

/**
 * Stream event interface
 */
export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
  timestamp?: number;
}

/**
 * Chat request payload
 */
export interface ChatRequest {
  message: string;
  threadId?: string;
  stream?: boolean;
}

/**
 * Chat response (non-streaming)
 */
export interface ChatResponse {
  response: string;
  workflow: unknown;
  phases: string[];
  threadId: string;
}

/**
 * API client configuration
 */
export interface ArchitectApiConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Error types
 */
export class ArchitectApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'ArchitectApiError';
  }
}

/**
 * Workflow Architect API Client
 */
export class WorkflowArchitectApi {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private abortController: AbortController | null = null;

  constructor(config: ArchitectApiConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? 60000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * Send a chat message and get a streaming response
   */
  async *streamChat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.baseUrl}/api/architect/chat/stream`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new ArchitectApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      if (!response.body) {
        throw new ArchitectApiError('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') {
            return;
          }

          try {
            const event = JSON.parse(data) as StreamEvent;
            event.timestamp = Date.now();
            yield event;
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ArchitectApiError('Request aborted', undefined, error);
      }
      throw error;
    }
  }

  /**
   * Send a chat message and get a complete response (non-streaming)
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/architect/chat`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ArchitectApiError(
          `HTTP ${response.status}: ${errorText}`,
          response.status,
        );
      }

      const data = await response.json();
      return data as ChatResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ArchitectApiError('Request timeout', 408, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get chat history for a thread
   */
  async getHistory(threadId: string): Promise<ChatResponse[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/architect/history/${threadId}`,
        {
          method: 'GET',
          headers: this.headers,
        },
      );

      if (!response.ok) {
        throw new ArchitectApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ArchitectApiError) {
        throw error;
      }
      throw new ArchitectApiError(
        'Failed to fetch history',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Clear chat history for a thread
   */
  async clearHistory(threadId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/architect/history/${threadId}`,
        {
          method: 'DELETE',
          headers: this.headers,
        },
      );

      if (!response.ok) {
        throw new ArchitectApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof ArchitectApiError) {
        throw error;
      }
      throw new ArchitectApiError(
        'Failed to clear history',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/architect/health`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        throw new ArchitectApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ArchitectApiError) {
        throw error;
      }
      throw new ArchitectApiError(
        'Failed to check health',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Abort the current request
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ArchitectApiConfig>): void {
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }
    if (config.headers) {
      this.headers = {
        ...this.headers,
        ...config.headers,
      };
    }
  }
}

/**
 * Create a new API client instance
 */
export function createArchitectApi(config: ArchitectApiConfig): WorkflowArchitectApi {
  return new WorkflowArchitectApi(config);
}

/**
 * Default API client instance (for use in n8n)
 * This will use n8n's base URL and authentication
 */
let defaultApiInstance: WorkflowArchitectApi | null = null;

export function getArchitectApi(): WorkflowArchitectApi {
  if (!defaultApiInstance) {
    // In n8n, this will be set based on the backend URL
    const baseUrl = (window as unknown as { BASE_PATH?: string }).BASE_PATH || '';
    defaultApiInstance = createArchitectApi({
      baseUrl,
      timeout: 60000,
    });
  }
  return defaultApiInstance;
}

/**
 * Reset the default API instance (useful for testing)
 */
export function resetArchitectApi(): void {
  defaultApiInstance = null;
}
