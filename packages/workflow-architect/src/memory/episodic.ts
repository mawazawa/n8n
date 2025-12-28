/**
 * Episodic Memory Manager
 * Stores and retrieves conversation episodes with workflow context
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import { MemoryStore } from './store.js';
import type { EpisodicMemory, MemorySession } from './types.js';

export interface EpisodeOptions {
  importance?: number;
  workflowContext?: Record<string, unknown>;
  expiresIn?: number; // milliseconds
}

/**
 * Manages episodic memories (conversation episodes)
 */
export class EpisodicMemoryManager {
  private store: MemoryStore;
  private currentSession: MemorySession | null = null;
  private conversationTurn = 0;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * Start a new session
   */
  async startSession(userId: string): Promise<MemorySession> {
    const supabase = getSupabaseClient();

    const session: MemorySession = {
      id: uuidv4(),
      userId,
      startedAt: Date.now(),
      episodeCount: 0,
    };

    // Insert into database
    const { error } = await supabase.from('memory_sessions').insert({
      id: session.id,
      user_id: session.userId,
      started_at: session.startedAt,
    });

    if (error) {
      throw new Error(`Failed to start session: ${error.message}`);
    }

    this.currentSession = session;
    this.conversationTurn = 0;

    return session;
  }

  /**
   * End the current session with optional summary
   */
  async endSession(summary?: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const supabase = getSupabaseClient();

    this.currentSession.endedAt = Date.now();
    this.currentSession.summary = summary;

    const { error } = await supabase
      .from('memory_sessions')
      .update({
        ended_at: this.currentSession.endedAt,
        summary: this.currentSession.summary,
      })
      .eq('id', this.currentSession.id);

    if (error) {
      throw new Error(`Failed to end session: ${error.message}`);
    }

    this.currentSession = null;
    this.conversationTurn = 0;
  }

  /**
   * Get current session
   */
  getCurrentSession(): MemorySession | null {
    return this.currentSession;
  }

  /**
   * Load existing session
   */
  async loadSession(sessionId: string): Promise<MemorySession> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.currentSession = {
      id: data.id,
      userId: data.user_id,
      startedAt: new Date(data.started_at).getTime(),
      endedAt: data.ended_at ? new Date(data.ended_at).getTime() : undefined,
      summary: data.summary,
      episodeCount: data.episode_count,
    };

    // Count existing episodes to set conversation turn
    const { count } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('type', 'episodic');

    this.conversationTurn = count || 0;

    return this.currentSession;
  }

  /**
   * Record a conversation episode
   */
  async recordEpisode(
    userMessage: string,
    agentResponse: string,
    options: EpisodeOptions = {}
  ): Promise<EpisodicMemory> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession() first.');
    }

    this.conversationTurn++;

    // Create episode content combining user and agent messages
    const content = `User: ${userMessage}\nAgent: ${agentResponse}`;

    // Calculate importance (can be overridden)
    const importance = options.importance ?? this.calculateImportance(userMessage, agentResponse);

    // Set expiration if specified
    const expiresAt = options.expiresIn ? Date.now() + options.expiresIn : undefined;

    const episode: EpisodicMemory = {
      id: uuidv4(),
      type: 'episodic',
      content,
      metadata: {
        messageLength: userMessage.length + agentResponse.length,
        hasWorkflowContext: !!options.workflowContext,
      },
      importance,
      accessCount: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
      expiresAt,
      sessionId: this.currentSession.id,
      conversationTurn: this.conversationTurn,
      userMessage,
      agentResponse,
      workflowContext: options.workflowContext,
    };

    // Save to store (which will generate embedding and persist)
    await this.store.save(episode);

    return episode;
  }

  /**
   * Calculate episode importance based on content
   */
  private calculateImportance(userMessage: string, agentResponse: string): number {
    let importance = 0.5; // Base importance

    // Increase importance for workflow-related keywords
    const workflowKeywords = [
      'workflow',
      'node',
      'connection',
      'trigger',
      'execute',
      'error',
      'fix',
      'configure',
      'parameter',
    ];

    const combinedText = (userMessage + ' ' + agentResponse).toLowerCase();
    const keywordMatches = workflowKeywords.filter(kw => combinedText.includes(kw)).length;
    importance += keywordMatches * 0.05;

    // Increase for longer, more detailed exchanges
    const totalLength = userMessage.length + agentResponse.length;
    if (totalLength > 500) importance += 0.1;
    if (totalLength > 1000) importance += 0.1;

    // Increase for questions (user learning)
    if (userMessage.includes('?')) importance += 0.05;

    // Increase for confirmation of actions
    if (
      agentResponse.toLowerCase().includes('created') ||
      agentResponse.toLowerCase().includes('updated') ||
      agentResponse.toLowerCase().includes('configured')
    ) {
      importance += 0.1;
    }

    // Cap at 1.0
    return Math.min(importance, 1.0);
  }

  /**
   * Retrieve relevant episodes from past conversations
   */
  async retrieveRelevantEpisodes(
    query: string,
    options: {
      limit?: number;
      sessionId?: string;
      minImportance?: number;
      maxAge?: number;
    } = {}
  ): Promise<EpisodicMemory[]> {
    const results = await this.store.search(query, {
      type: 'episodic',
      limit: options.limit || 5,
      sessionId: options.sessionId,
      minImportance: options.minImportance || 0.3,
      maxAge: options.maxAge,
    });

    return results.map(r => r.memory as EpisodicMemory);
  }

  /**
   * Get all episodes in a session
   */
  async getSessionEpisodes(sessionId: string): Promise<EpisodicMemory[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'episodic')
      .order('conversation_turn', { ascending: true });

    if (error) {
      throw new Error(`Failed to get session episodes: ${error.message}`);
    }

    return data.map(row => this.rowToEpisode(row));
  }

  /**
   * Get recent episodes across all sessions
   */
  async getRecentEpisodes(limit = 10): Promise<EpisodicMemory[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'episodic')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent episodes: ${error.message}`);
    }

    return data.map(row => this.rowToEpisode(row));
  }

  /**
   * Summarize session for consolidation
   */
  async summarizeSession(sessionId: string): Promise<string> {
    const episodes = await this.getSessionEpisodes(sessionId);

    if (episodes.length === 0) {
      return 'No episodes in session';
    }

    // Extract key topics and actions
    const topics = new Set<string>();
    const actions: string[] = [];

    for (const episode of episodes) {
      // Extract workflow context if present
      if (episode.workflowContext) {
        const context = episode.workflowContext;
        if (context.workflowName) {
          topics.add(`workflow: ${context.workflowName}`);
        }
        if (context.nodeType) {
          topics.add(`node: ${context.nodeType}`);
        }
      }

      // Extract action verbs from agent responses
      const actionVerbs = ['created', 'updated', 'configured', 'fixed', 'added', 'removed'];
      for (const verb of actionVerbs) {
        if (episode.agentResponse.toLowerCase().includes(verb)) {
          const match = episode.agentResponse.match(
            new RegExp(`${verb}\\s+([^.]+)`, 'i')
          );
          if (match) {
            actions.push(`${verb} ${match[1]}`);
          }
        }
      }
    }

    // Build summary
    const summary = [
      `Session with ${episodes.length} episodes.`,
      topics.size > 0 ? `Topics: ${Array.from(topics).join(', ')}.` : '',
      actions.length > 0 ? `Actions: ${actions.slice(0, 5).join('; ')}.` : '',
    ]
      .filter(s => s)
      .join(' ');

    // Update session with summary
    const supabase = getSupabaseClient();
    await supabase
      .from('memory_sessions')
      .update({ summary })
      .eq('id', sessionId);

    return summary;
  }

  /**
   * Delete old episodes based on importance and age
   */
  async pruneOldEpisodes(
    maxAge: number,
    minImportanceThreshold = 0.3
  ): Promise<number> {
    const supabase = getSupabaseClient();

    const cutoffTime = Date.now() - maxAge;

    const { data, error } = await supabase
      .from('memory_entries')
      .select('id')
      .eq('type', 'episodic')
      .lt('created_at', cutoffTime)
      .lt('importance', minImportanceThreshold);

    if (error) {
      throw new Error(`Failed to find old episodes: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return 0;
    }

    const ids = data.map(row => row.id);
    return await this.store.deleteBatch(ids);
  }

  /**
   * Convert database row to episode
   */
  private rowToEpisode(row: Record<string, unknown>): EpisodicMemory {
    return {
      id: row.id as string,
      type: 'episodic',
      content: row.content as string,
      embedding: row.embedding as number[] | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      importance: row.importance as number,
      accessCount: row.access_count as number,
      lastAccessed: new Date(row.last_accessed as string).getTime(),
      createdAt: new Date(row.created_at as string).getTime(),
      expiresAt: row.expires_at ? new Date(row.expires_at as string).getTime() : undefined,
      sessionId: row.session_id as string,
      conversationTurn: row.conversation_turn as number,
      userMessage: row.user_message as string,
      agentResponse: row.agent_response as string,
      workflowContext: row.workflow_context as Record<string, unknown> | undefined,
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    episodeCount: number;
    avgImportance: number;
    duration: number;
    topics: string[];
  }> {
    const episodes = await this.getSessionEpisodes(sessionId);

    if (episodes.length === 0) {
      return {
        episodeCount: 0,
        avgImportance: 0,
        duration: 0,
        topics: [],
      };
    }

    const avgImportance =
      episodes.reduce((sum, ep) => sum + ep.importance, 0) / episodes.length;

    const duration = episodes[episodes.length - 1].createdAt - episodes[0].createdAt;

    // Extract topics from workflow context
    const topics = new Set<string>();
    for (const episode of episodes) {
      if (episode.workflowContext?.workflowName) {
        topics.add(episode.workflowContext.workflowName as string);
      }
    }

    return {
      episodeCount: episodes.length,
      avgImportance,
      duration,
      topics: Array.from(topics),
    };
  }
}
