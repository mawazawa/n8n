/**
 * Unified Memory Manager API
 * Combines episodic, semantic, and procedural memory with LangGraph integration
 */

import { MemoryStore } from './store.js';
import { EpisodicMemoryManager } from './episodic.js';
import { SemanticMemoryManager } from './semantic.js';
import { ProceduralMemoryManager } from './procedural.js';
import { MemoryConsolidator } from './consolidation.js';
import { ContextualRetriever, type RetrievalContext } from './retrieval.js';
import type {
  MemoryEntry,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemorySession,
  MemoryStats,
  ConsolidationConfig,
} from './types.js';

export * from './types.js';
export { MemoryStore } from './store.js';
export { EpisodicMemoryManager, type EpisodeOptions } from './episodic.js';
export { SemanticMemoryManager, type Relation, type FactOptions } from './semantic.js';
export {
  ProceduralMemoryManager,
  type ProcedureOptions,
  type ProcedureMatch,
} from './procedural.js';
export { MemoryConsolidator } from './consolidation.js';
export { ContextualRetriever, type RetrievalContext, type RankedMemory } from './retrieval.js';

/**
 * Configuration for MemoryManager
 */
export interface MemoryManagerConfig {
  cacheSize?: number;
  cacheTTL?: number;
  consolidationConfig?: Partial<ConsolidationConfig>;
  autoConsolidate?: boolean;
  consolidationInterval?: number; // milliseconds
}

/**
 * Unified Memory Manager
 * Provides high-level API for all memory operations
 */
export class MemoryManager {
  private store: MemoryStore;
  public episodic: EpisodicMemoryManager;
  public semantic: SemanticMemoryManager;
  public procedural: ProceduralMemoryManager;
  public consolidator: MemoryConsolidator;
  public retriever: ContextualRetriever;

  private autoConsolidateTimer?: NodeJS.Timeout;

  constructor(config: MemoryManagerConfig = {}) {
    this.store = new MemoryStore(config.cacheSize, config.cacheTTL);
    this.episodic = new EpisodicMemoryManager(this.store);
    this.semantic = new SemanticMemoryManager(this.store);
    this.procedural = new ProceduralMemoryManager(this.store);
    this.consolidator = new MemoryConsolidator(this.store, config.consolidationConfig);
    this.retriever = new ContextualRetriever(this.store);

    // Setup auto-consolidation if enabled
    if (config.autoConsolidate) {
      this.startAutoConsolidation(config.consolidationInterval || 24 * 60 * 60 * 1000); // Daily by default
    }
  }

  /**
   * Remember something (auto-routes to appropriate memory type)
   */
  async remember(entry: MemoryEntry): Promise<MemoryEntry> {
    switch (entry.type) {
      case 'episodic':
        return await this.store.save(entry);
      case 'semantic':
        return await this.store.save(entry);
      case 'procedural':
        return await this.store.save(entry);
      default:
        throw new Error(`Unknown memory type: ${(entry as MemoryEntry).type}`);
    }
  }

  /**
   * Recall memories based on query
   */
  async recall(
    query: string,
    context?: Partial<RetrievalContext>
  ): Promise<MemoryEntry[]> {
    const retrievalContext: RetrievalContext = {
      query,
      ...context,
    };

    const results = await this.retriever.retrieve(retrievalContext);
    return results.map(r => r.memory);
  }

  /**
   * Forget a memory
   */
  async forget(id: string): Promise<boolean> {
    return await this.store.delete(id);
  }

  /**
   * Get memory by ID
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    return await this.store.get(id);
  }

  /**
   * Start a conversation session
   */
  async startSession(userId: string): Promise<MemorySession> {
    return await this.episodic.startSession(userId);
  }

  /**
   * End current session
   */
  async endSession(summary?: string): Promise<void> {
    await this.episodic.endSession(summary);
  }

  /**
   * Record a conversation turn
   */
  async recordConversation(
    userMessage: string,
    agentResponse: string,
    options?: {
      importance?: number;
      workflowContext?: Record<string, unknown>;
    }
  ): Promise<EpisodicMemory> {
    return await this.episodic.recordEpisode(userMessage, agentResponse, options);
  }

  /**
   * Store a fact
   */
  async storeFact(
    fact: string,
    options?: {
      importance?: number;
      category?: string;
    }
  ): Promise<SemanticMemory> {
    return await this.semantic.storeFact(fact, options);
  }

  /**
   * Learn a procedure
   */
  async learnProcedure(
    skill: string,
    steps: string[],
    options?: {
      importance?: number;
      triggerPatterns?: string[];
    }
  ): Promise<ProceduralMemory> {
    return await this.procedural.learnProcedure(skill, steps, options);
  }

  /**
   * Match procedure for current task
   */
  async matchProcedure(pattern: string, limit = 5) {
    return await this.procedural.matchProcedure(pattern, limit);
  }

  /**
   * Get context-aware recommendations
   */
  async getRecommendations(context: RetrievalContext, limit = 5) {
    return await this.retriever.getRecommendations(context, limit);
  }

  /**
   * Inject memory context into agent prompt
   */
  async injectContext(
    systemPrompt: string,
    context: RetrievalContext,
    options?: {
      maxMemories?: number;
      includeTypes?: Array<'episodic' | 'semantic' | 'procedural'>;
    }
  ): Promise<string> {
    return await this.retriever.injectContext(systemPrompt, context, options);
  }

  /**
   * Run consolidation
   */
  async consolidate() {
    return await this.consolidator.consolidate();
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    return await this.store.getStats();
  }

  /**
   * Export all memories
   */
  async export(): Promise<{
    episodic: EpisodicMemory[];
    semantic: { facts: SemanticMemory[]; knowledgeGraph: unknown };
    procedural: ProceduralMemory[];
    stats: MemoryStats;
  }> {
    const [recentEpisodic, knowledgeGraph, topProcedures, stats] = await Promise.all([
      this.episodic.getRecentEpisodes(100),
      this.semantic.exportKnowledgeGraph(),
      this.procedural.getAllProcedures(100),
      this.getStats(),
    ]);

    return {
      episodic: recentEpisodic,
      semantic: knowledgeGraph,
      procedural: topProcedures,
      stats,
    };
  }

  /**
   * Import memories from export
   */
  async import(data: {
    episodic?: EpisodicMemory[];
    semantic?: SemanticMemory[];
    procedural?: ProceduralMemory[];
  }): Promise<{ imported: number; failed: number }> {
    let imported = 0;
    let failed = 0;

    // Import episodic memories
    if (data.episodic) {
      for (const memory of data.episodic) {
        try {
          await this.store.save(memory);
          imported++;
        } catch (error) {
          console.error('Failed to import episodic memory:', error);
          failed++;
        }
      }
    }

    // Import semantic memories
    if (data.semantic) {
      for (const memory of data.semantic) {
        try {
          await this.store.save(memory);
          imported++;
        } catch (error) {
          console.error('Failed to import semantic memory:', error);
          failed++;
        }
      }
    }

    // Import procedural memories
    if (data.procedural) {
      for (const memory of data.procedural) {
        try {
          await this.store.save(memory);
          imported++;
        } catch (error) {
          console.error('Failed to import procedural memory:', error);
          failed++;
        }
      }
    }

    return { imported, failed };
  }

  /**
   * Clear all memories (use with caution!)
   */
  async clearAll(): Promise<void> {
    this.store.clearCache();
    // Note: Database deletion would need separate implementation
    console.warn('Cache cleared. Database records remain.');
  }

  /**
   * Integration with LangGraph agent state
   */
  async enrichAgentState(
    state: Record<string, unknown>,
    context: Partial<RetrievalContext>
  ): Promise<Record<string, unknown>> {
    // Build retrieval context from state
    const retrievalContext: RetrievalContext = {
      query: this.extractQueryFromState(state),
      workflowContext: state.workflowContext as Record<string, unknown> | undefined,
      sessionId: state.sessionId as string | undefined,
      recentMessages: this.extractRecentMessages(state),
      ...context,
    };

    // Get relevant memories
    const memories = await this.retriever.retrieveDiverse(retrievalContext, { limit: 5 });

    // Enrich state with memory context
    return {
      ...state,
      memoryContext: {
        relevantMemories: memories,
        episodicCount: memories.filter(m => m.memory.type === 'episodic').length,
        semanticCount: memories.filter(m => m.memory.type === 'semantic').length,
        proceduralCount: memories.filter(m => m.memory.type === 'procedural').length,
      },
    };
  }

  /**
   * Start auto-consolidation
   */
  private startAutoConsolidation(interval: number): void {
    this.autoConsolidateTimer = setInterval(async () => {
      try {
        console.log('Running auto-consolidation...');
        const results = await this.consolidate();
        console.log('Auto-consolidation complete:', results);
      } catch (error) {
        console.error('Auto-consolidation failed:', error);
      }
    }, interval);
  }

  /**
   * Stop auto-consolidation
   */
  stopAutoConsolidation(): void {
    if (this.autoConsolidateTimer) {
      clearInterval(this.autoConsolidateTimer);
      this.autoConsolidateTimer = undefined;
    }
  }

  /**
   * Extract query from agent state
   */
  private extractQueryFromState(state: Record<string, unknown>): string {
    // Try to extract from messages
    if (state.messages && Array.isArray(state.messages)) {
      const messages = state.messages as Array<{ content: string }>;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content) {
        return lastMessage.content;
      }
    }

    // Fallback to state description
    return JSON.stringify(state).slice(0, 500);
  }

  /**
   * Extract recent messages from state
   */
  private extractRecentMessages(state: Record<string, unknown>): string[] {
    if (state.messages && Array.isArray(state.messages)) {
      const messages = state.messages as Array<{ content: string }>;
      return messages.slice(-5).map(m => m.content);
    }
    return [];
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      cacheHitRate: number;
      totalMemories: number;
      lastConsolidation?: number;
    };
  }> {
    try {
      const stats = await this.getStats();
      const cacheStats = this.store.getCacheStats();

      return {
        status: 'healthy',
        details: {
          cacheHitRate: cacheStats.hitRate,
          totalMemories: stats.totalEntries,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          cacheHitRate: 0,
          totalMemories: 0,
        },
      };
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stopAutoConsolidation();
    this.store.clearCache();
  }
}

/**
 * Singleton instance for global access
 */
let memoryManagerInstance: MemoryManager | null = null;

/**
 * Get or create singleton memory manager
 */
export function getMemoryManager(config?: MemoryManagerConfig): MemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager(config);
  }
  return memoryManagerInstance;
}

/**
 * Reset singleton (useful for testing)
 */
export function resetMemoryManager(): void {
  if (memoryManagerInstance) {
    void memoryManagerInstance.shutdown();
    memoryManagerInstance = null;
  }
}

/**
 * Create a new isolated memory manager instance
 */
export function createMemoryManager(config?: MemoryManagerConfig): MemoryManager {
  return new MemoryManager(config);
}
