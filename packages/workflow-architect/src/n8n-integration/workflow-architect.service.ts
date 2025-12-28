/**
 * Workflow Architect Backend Service
 *
 * This service handles the backend logic for the Workflow Architect feature in n8n.
 * It integrates with the workflow-architect package and manages chat sessions.
 */

import { createWorkflowArchitect, streamChat, chat, type ChatInput } from '../graph/index.js';
import { getBackendFeatureConfig, validateBackendFeatureConfig } from './feature-flags';

/**
 * Chat session storage
 * In production, this should use a proper database or cache (Redis)
 */
const chatSessions = new Map<string, { messages: unknown[]; lastActivity: number }>();

/**
 * Session timeout (30 minutes)
 */
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Workflow Architect Service
 */
export class WorkflowArchitectService {
  private graph: ReturnType<typeof createWorkflowArchitect> | null = null;
  private isEnabled: boolean;

  constructor() {
    const config = getBackendFeatureConfig();
    this.isEnabled = validateBackendFeatureConfig(config);

    if (this.isEnabled) {
      this.initialize();
    }
  }

  /**
   * Initialize the service
   */
  private initialize(): void {
    try {
      this.graph = createWorkflowArchitect();
      console.log('[WorkflowArchitect] Service initialized');

      // Clean up old sessions periodically
      setInterval(() => this.cleanupSessions(), 5 * 60 * 1000); // Every 5 minutes
    } catch (error) {
      console.error('[WorkflowArchitect] Failed to initialize:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Check if the service is enabled and ready
   */
  isReady(): boolean {
    return this.isEnabled && this.graph !== null;
  }

  /**
   * Send a chat message and get a streaming response
   */
  async *streamChatMessage(
    message: string,
    threadId?: string,
  ): AsyncGenerator<{
    type: 'thinking' | 'phase' | 'workflow' | 'response' | 'done' | 'error';
    data: unknown;
  }> {
    if (!this.isReady()) {
      yield {
        type: 'error',
        data: 'Workflow Architect service is not available',
      };
      return;
    }

    const sessionId = threadId || this.createSessionId();

    try {
      // Update session activity
      this.updateSession(sessionId);

      const input: ChatInput = {
        message,
        threadId: sessionId,
      };

      // Stream from the graph
      for await (const event of streamChat(input)) {
        yield event;

        // Update session with response data
        if (event.type === 'response' || event.type === 'done') {
          this.updateSession(sessionId);
        }
      }
    } catch (error) {
      console.error('[WorkflowArchitect] Stream error:', error);
      yield {
        type: 'error',
        data: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a chat message and get a complete response (non-streaming)
   */
  async chatMessage(
    message: string,
    threadId?: string,
  ): Promise<{
    response: string;
    workflow: unknown;
    phases: string[];
    threadId: string;
  }> {
    if (!this.isReady()) {
      throw new Error('Workflow Architect service is not available');
    }

    const sessionId = threadId || this.createSessionId();

    try {
      // Update session activity
      this.updateSession(sessionId);

      const input: ChatInput = {
        message,
        threadId: sessionId,
      };

      const result = await chat(input);

      // Update session with response
      this.updateSession(sessionId);

      return {
        ...result,
        threadId: sessionId,
      };
    } catch (error) {
      console.error('[WorkflowArchitect] Chat error:', error);
      throw error;
    }
  }

  /**
   * Get chat history for a session
   */
  getHistory(threadId: string): unknown[] {
    const session = chatSessions.get(threadId);
    return session?.messages || [];
  }

  /**
   * Clear chat history for a session
   */
  clearHistory(threadId: string): void {
    chatSessions.delete(threadId);
  }

  /**
   * Create a new session ID
   */
  private createSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Update session activity
   */
  private updateSession(sessionId: string): void {
    const session = chatSessions.get(sessionId) || {
      messages: [],
      lastActivity: Date.now(),
    };

    session.lastActivity = Date.now();
    chatSessions.set(sessionId, session);
  }

  /**
   * Clean up old sessions
   */
  private cleanupSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of chatSessions.entries()) {
      if (now - session.lastActivity > SESSION_TIMEOUT) {
        chatSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[WorkflowArchitect] Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Get service health status
   */
  getHealth(): {
    status: 'ok' | 'error';
    version: string;
    enabled: boolean;
    activeSessions: number;
  } {
    return {
      status: this.isReady() ? 'ok' : 'error',
      version: '0.1.0',
      enabled: this.isEnabled,
      activeSessions: chatSessions.size,
    };
  }
}

/**
 * Singleton instance
 */
let serviceInstance: WorkflowArchitectService | null = null;

/**
 * Get the service instance
 */
export function getWorkflowArchitectService(): WorkflowArchitectService {
  if (!serviceInstance) {
    serviceInstance = new WorkflowArchitectService();
  }
  return serviceInstance;
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetWorkflowArchitectService(): void {
  serviceInstance = null;
}
