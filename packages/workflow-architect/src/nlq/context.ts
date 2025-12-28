/**
 * Conversation Context Manager
 * Manages conversation history and context for reference resolution
 */

import type {
  ConversationContext,
  ConversationTurn,
  NLQuery,
  ParsedQuery,
  QueryResult,
  Entity,
  UserPreferences,
} from './types';

/**
 * Context manager configuration
 */
export interface ContextManagerConfig {
  maxHistorySize?: number;
  sessionTimeout?: number;
  enablePersistence?: boolean;
}

/**
 * Session data
 */
interface SessionData {
  context: ConversationContext;
  lastAccessed: Date;
}

/**
 * ContextManager handles conversation context and history
 */
export class ContextManager {
  private sessions: Map<string, SessionData>;
  private config: Required<ContextManagerConfig>;

  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      maxHistorySize: config.maxHistorySize ?? 50,
      sessionTimeout: config.sessionTimeout ?? 30 * 60 * 1000, // 30 minutes
      enablePersistence: config.enablePersistence ?? false,
    };

    this.sessions = new Map();

    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Update conversation context with new turn
   */
  updateContext(
    userId: string,
    sessionId: string,
    query: NLQuery,
    parsedQuery: ParsedQuery,
    result: QueryResult,
  ): void {
    const context = this.getOrCreateContext(userId, sessionId);

    // Add new turn to history
    const turn: ConversationTurn = {
      query,
      parsedQuery,
      result,
      timestamp: new Date(),
    };

    context.history.push(turn);

    // Trim history if needed
    if (context.history.length > this.config.maxHistorySize) {
      context.history = context.history.slice(-this.config.maxHistorySize);
    }

    // Update entity memory
    this.updateEntityMemory(context, parsedQuery.entities);

    // Update last accessed time
    context.lastUpdated = new Date();
    this.updateSession(sessionId, context);
  }

  /**
   * Get conversation context for a user session
   */
  getContext(userId: string, sessionId: string): ConversationContext {
    return this.getOrCreateContext(userId, sessionId);
  }

  /**
   * Get or create context for session
   */
  private getOrCreateContext(userId: string, sessionId: string): ConversationContext {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.lastAccessed = new Date();
      return session.context;
    }

    // Create new context
    const context: ConversationContext = {
      userId,
      sessionId,
      history: [],
      preferences: this.getDefaultPreferences(),
      entityMemory: new Map(),
      lastUpdated: new Date(),
    };

    this.sessions.set(sessionId, {
      context,
      lastAccessed: new Date(),
    });

    return context;
  }

  /**
   * Update session data
   */
  private updateSession(sessionId: string, context: ConversationContext): void {
    this.sessions.set(sessionId, {
      context,
      lastAccessed: new Date(),
    });

    if (this.config.enablePersistence) {
      this.persistContext(sessionId, context);
    }
  }

  /**
   * Update entity memory
   */
  private updateEntityMemory(context: ConversationContext, entities: Entity[]): void {
    for (const entity of entities) {
      // Store entity with a key based on type
      const key = `${entity.type}:${entity.value}`;
      context.entityMemory.set(key, entity);
    }

    // Keep only recent entities (last 20)
    if (context.entityMemory.size > 20) {
      const entries = Array.from(context.entityMemory.entries());
      context.entityMemory = new Map(entries.slice(-20));
    }
  }

  /**
   * Resolve reference from context (e.g., "it", "that workflow")
   */
  resolveReference(sessionId: string, reference: string): Entity | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const { context } = session;

    // Check if reference matches recent entities
    const lowerRef = reference.toLowerCase();

    // Simple coreference resolution
    if (lowerRef === 'it' || lowerRef === 'that' || lowerRef === 'this') {
      // Return most recent entity
      const entities = Array.from(context.entityMemory.values());
      return entities.length > 0 ? entities[entities.length - 1] : null;
    }

    // Check entity memory for partial match
    for (const [key, entity] of context.entityMemory.entries()) {
      if (entity.value.toLowerCase().includes(lowerRef)) {
        return entity;
      }
    }

    return null;
  }

  /**
   * Get previous queries from session
   */
  getPreviousQueries(sessionId: string, limit = 5): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.context.history
      .slice(-limit)
      .map((turn) => turn.query.text)
      .reverse();
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string, sessionId: string): UserPreferences {
    const context = this.getContext(userId, sessionId);
    return context.preferences;
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(
    userId: string,
    sessionId: string,
    preferences: Partial<UserPreferences>,
  ): void {
    const context = this.getContext(userId, sessionId);
    context.preferences = { ...context.preferences, ...preferences };
    this.updateSession(sessionId, context);
  }

  /**
   * Clear session context
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessed.getTime() > this.config.sessionTimeout) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
    }

    if (expired.length > 0) {
      console.debug(`Cleaned up ${expired.length} expired sessions`);
    }
  }

  /**
   * Persist context to storage
   */
  private async persistContext(sessionId: string, context: ConversationContext): Promise<void> {
    // TODO: Implement persistence to database
    // For now, this is a no-op
    console.debug(`Persisting context for session ${sessionId}`);
  }

  /**
   * Load context from storage
   */
  private async loadContext(sessionId: string): Promise<ConversationContext | null> {
    // TODO: Implement loading from database
    // For now, this is a no-op
    return null;
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      resultFormat: 'natural',
      maxResults: 10,
    };
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(sessionId: string): {
    turnCount: number;
    entityCount: number;
    lastQuery?: string;
    duration: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const { context } = session;
    const firstTurn = context.history[0];
    const lastTurn = context.history[context.history.length - 1];

    return {
      turnCount: context.history.length,
      entityCount: context.entityMemory.size,
      lastQuery: lastTurn?.query.text,
      duration: lastTurn && firstTurn ? lastTurn.timestamp.getTime() - firstTurn.timestamp.getTime() : 0,
    };
  }

  /**
   * Export session data
   */
  exportSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return JSON.stringify(
      {
        context: {
          ...session.context,
          entityMemory: Array.from(session.context.entityMemory.entries()),
        },
        lastAccessed: session.lastAccessed,
      },
      null,
      2,
    );
  }

  /**
   * Import session data
   */
  importSession(sessionId: string, data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      const context: ConversationContext = {
        ...parsed.context,
        entityMemory: new Map(parsed.context.entityMemory),
      };

      this.sessions.set(sessionId, {
        context,
        lastAccessed: new Date(parsed.lastAccessed),
      });

      return true;
    } catch (error) {
      console.error('Failed to import session:', error);
      return false;
    }
  }
}
