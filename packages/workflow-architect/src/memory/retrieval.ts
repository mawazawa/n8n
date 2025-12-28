/**
 * Contextual Memory Retriever
 * Retrieves relevant memories using hybrid search and intelligent ranking
 */

import { MemoryStore } from './store.js';
import type {
  MemoryEntry,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemorySearchResult,
  MemoryRetrievalOptions,
} from './types.js';

export interface RetrievalContext {
  query: string;
  workflowContext?: Record<string, unknown>;
  sessionId?: string;
  userPreferences?: Record<string, unknown>;
  recentMessages?: string[];
}

export interface RankedMemory extends MemorySearchResult {
  rankScore: number;
  reasons: string[];
}

/**
 * Retrieves and ranks memories based on context
 */
export class ContextualRetriever {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * Retrieve relevant memories for given context
   */
  async retrieve(
    context: RetrievalContext,
    options: MemoryRetrievalOptions = {}
  ): Promise<RankedMemory[]> {
    // 1. Vector search
    const vectorResults = await this.vectorSearch(context.query, options);

    // 2. Keyword search (if applicable)
    const keywordResults = await this.keywordSearch(context, options);

    // 3. Recency-based retrieval
    const recentResults = await this.recentSearch(context, options);

    // 4. Combine and deduplicate
    const combined = this.combineResults([vectorResults, keywordResults, recentResults]);

    // 5. Rank by relevance to context
    const ranked = this.rankByRelevance(combined, context);

    // 6. Apply limit
    const limit = options.limit || 10;
    return ranked.slice(0, limit);
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    query: string,
    options: MemoryRetrievalOptions
  ): Promise<MemorySearchResult[]> {
    return await this.store.search(query, {
      ...options,
      limit: (options.limit || 10) * 2, // Get more for better ranking
    });
  }

  /**
   * Keyword-based search
   */
  private async keywordSearch(
    context: RetrievalContext,
    options: MemoryRetrievalOptions
  ): Promise<MemorySearchResult[]> {
    // Extract keywords from query
    const keywords = this.extractKeywords(context.query);

    if (keywords.length === 0) {
      return [];
    }

    // Build keyword query
    const keywordQuery = keywords.join(' ');

    return await this.store.search(keywordQuery, {
      ...options,
      limit: options.limit || 10,
    });
  }

  /**
   * Recent memories search
   */
  private async recentSearch(
    context: RetrievalContext,
    options: MemoryRetrievalOptions
  ): Promise<MemorySearchResult[]> {
    // For episodic memories, prioritize recent session
    if (context.sessionId) {
      return await this.store.search(context.query, {
        ...options,
        sessionId: context.sessionId,
        limit: 5,
      });
    }

    return [];
  }

  /**
   * Combine and deduplicate results
   */
  private combineResults(
    resultSets: MemorySearchResult[][]
  ): MemorySearchResult[] {
    const seen = new Set<string>();
    const combined: MemorySearchResult[] = [];

    for (const results of resultSets) {
      for (const result of results) {
        if (!seen.has(result.memory.id)) {
          seen.add(result.memory.id);
          combined.push(result);
        }
      }
    }

    return combined;
  }

  /**
   * Rank memories by relevance to context
   */
  rankByRelevance(
    memories: MemorySearchResult[],
    context: RetrievalContext
  ): RankedMemory[] {
    const ranked: RankedMemory[] = memories.map(result => {
      const reasons: string[] = [];
      let rankScore = result.relevance;

      // 1. Boost for same session (episodic)
      if (
        context.sessionId &&
        result.memory.type === 'episodic' &&
        (result.memory as EpisodicMemory).sessionId === context.sessionId
      ) {
        rankScore += 0.2;
        reasons.push('same session');
      }

      // 2. Boost for workflow context match
      if (context.workflowContext && result.memory.type === 'episodic') {
        const episodic = result.memory as EpisodicMemory;
        if (
          episodic.workflowContext &&
          this.matchWorkflowContext(context.workflowContext, episodic.workflowContext)
        ) {
          rankScore += 0.15;
          reasons.push('workflow context match');
        }
      }

      // 3. Boost for high importance
      if (result.memory.importance > 0.7) {
        rankScore += 0.1;
        reasons.push('high importance');
      }

      // 4. Boost for frequently accessed
      if (result.memory.accessCount > 10) {
        rankScore += 0.05;
        reasons.push('frequently accessed');
      }

      // 5. Boost for procedural with high success rate
      if (result.memory.type === 'procedural') {
        const procedural = result.memory as ProceduralMemory;
        if (procedural.successRate > 0.8) {
          rankScore += 0.1;
          reasons.push('high success rate');
        }
      }

      // 6. Boost for recent messages similarity
      if (context.recentMessages && context.recentMessages.length > 0) {
        const recentSimilarity = this.calculateRecentMessageSimilarity(
          result.memory.content,
          context.recentMessages
        );
        rankScore += recentSimilarity * 0.1;
        if (recentSimilarity > 0.5) {
          reasons.push('similar to recent messages');
        }
      }

      // 7. Penalize very old memories (unless high importance)
      const ageInDays = (Date.now() - result.memory.createdAt) / (24 * 60 * 60 * 1000);
      if (ageInDays > 90 && result.memory.importance < 0.7) {
        rankScore -= 0.1;
        reasons.push('older memory');
      }

      return {
        ...result,
        rankScore: Math.max(0, Math.min(1, rankScore)), // Clamp to [0, 1]
        reasons,
      };
    });

    // Sort by rank score
    ranked.sort((a, b) => b.rankScore - a.rankScore);

    return ranked;
  }

  /**
   * Retrieve diverse set of memories (avoid redundancy)
   */
  async retrieveDiverse(
    context: RetrievalContext,
    options: MemoryRetrievalOptions & { diversityThreshold?: number } = {}
  ): Promise<RankedMemory[]> {
    const allMemories = await this.retrieve(context, {
      ...options,
      limit: (options.limit || 10) * 3, // Get more for diversity filtering
    });

    const diversityThreshold = options.diversityThreshold || 0.85;
    const diverse: RankedMemory[] = [];

    for (const memory of allMemories) {
      // Check if too similar to already selected memories
      const isTooSimilar = diverse.some(selected => {
        const similarity = this.calculateContentSimilarity(
          memory.memory.content,
          selected.memory.content
        );
        return similarity > diversityThreshold;
      });

      if (!isTooSimilar) {
        diverse.push(memory);
      }

      if (diverse.length >= (options.limit || 10)) {
        break;
      }
    }

    return diverse;
  }

  /**
   * Retrieve memories by type with context
   */
  async retrieveByType(
    type: 'episodic' | 'semantic' | 'procedural',
    context: RetrievalContext,
    limit = 10
  ): Promise<RankedMemory[]> {
    return await this.retrieve(context, { type, limit });
  }

  /**
   * Context injection for agent prompts
   */
  async injectContext(
    systemPrompt: string,
    context: RetrievalContext,
    options: {
      maxMemories?: number;
      includeTypes?: Array<'episodic' | 'semantic' | 'procedural'>;
    } = {}
  ): Promise<string> {
    const maxMemories = options.maxMemories || 5;
    const includeTypes = options.includeTypes || ['episodic', 'semantic', 'procedural'];

    // Retrieve relevant memories
    const memories = await this.retrieveDiverse(context, { limit: maxMemories });

    // Filter by type if specified
    const filteredMemories = memories.filter(m =>
      includeTypes.includes(m.memory.type)
    );

    if (filteredMemories.length === 0) {
      return systemPrompt;
    }

    // Format memories for injection
    const memoryContext = this.formatMemoriesForPrompt(filteredMemories);

    // Inject into prompt
    const injectedPrompt = `${systemPrompt}

## Relevant Context from Memory

${memoryContext}

Use the above context to inform your responses, but prioritize the current conversation.`;

    return injectedPrompt;
  }

  /**
   * Format memories for prompt injection
   */
  private formatMemoriesForPrompt(memories: RankedMemory[]): string {
    const sections: string[] = [];

    // Group by type
    const episodic = memories.filter(m => m.memory.type === 'episodic');
    const semantic = memories.filter(m => m.memory.type === 'semantic');
    const procedural = memories.filter(m => m.memory.type === 'procedural');

    if (episodic.length > 0) {
      sections.push('### Past Conversations\n');
      episodic.forEach((m, i) => {
        const ep = m.memory as EpisodicMemory;
        sections.push(
          `${i + 1}. User: "${ep.userMessage}"\n   Agent: "${ep.agentResponse}"\n`
        );
      });
    }

    if (semantic.length > 0) {
      sections.push('\n### Known Facts\n');
      semantic.forEach((m, i) => {
        const sem = m.memory as SemanticMemory;
        sections.push(`${i + 1}. ${sem.facts.join('; ')}\n`);
      });
    }

    if (procedural.length > 0) {
      sections.push('\n### Learned Procedures\n');
      procedural.forEach((m, i) => {
        const proc = m.memory as ProceduralMemory;
        sections.push(
          `${i + 1}. ${proc.skill} (success rate: ${(proc.successRate * 100).toFixed(0)}%)\n` +
            `   Steps: ${proc.steps.join(' → ')}\n`
        );
      });
    }

    return sections.join('');
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)]; // Remove duplicates
  }

  /**
   * Match workflow contexts
   */
  private matchWorkflowContext(
    context1: Record<string, unknown>,
    context2: Record<string, unknown>
  ): boolean {
    // Simple matching: check if key properties match
    const keys = ['workflowName', 'workflowId', 'nodeType', 'nodeId'];

    for (const key of keys) {
      if (context1[key] && context2[key] && context1[key] === context2[key]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate similarity to recent messages
   */
  private calculateRecentMessageSimilarity(
    content: string,
    recentMessages: string[]
  ): number {
    if (recentMessages.length === 0) {
      return 0;
    }

    // Simple word overlap similarity
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    let maxOverlap = 0;

    for (const message of recentMessages) {
      const messageWords = new Set(message.toLowerCase().split(/\s+/));
      const overlap = [...contentWords].filter(w => messageWords.has(w)).length;
      const similarity = overlap / Math.max(contentWords.size, messageWords.size);
      maxOverlap = Math.max(maxOverlap, similarity);
    }

    return maxOverlap;
  }

  /**
   * Calculate content similarity (simple word overlap)
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Get memory recommendations based on current context
   */
  async getRecommendations(
    context: RetrievalContext,
    limit = 5
  ): Promise<{
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
    procedural: ProceduralMemory[];
  }> {
    // Get recommendations for each type
    const [episodic, semantic, procedural] = await Promise.all([
      this.retrieveByType('episodic', context, limit),
      this.retrieveByType('semantic', context, limit),
      this.retrieveByType('procedural', context, limit),
    ]);

    return {
      episodic: episodic.map(r => r.memory as EpisodicMemory),
      semantic: semantic.map(r => r.memory as SemanticMemory),
      procedural: procedural.map(r => r.memory as ProceduralMemory),
    };
  }

  /**
   * Explain why memories were retrieved
   */
  explainRetrieval(rankedMemories: RankedMemory[]): string {
    const explanations: string[] = [];

    rankedMemories.forEach((ranked, i) => {
      const reasons = ranked.reasons.join(', ');
      explanations.push(
        `${i + 1}. ${ranked.memory.type} memory (score: ${ranked.rankScore.toFixed(2)}): ${reasons}`
      );
    });

    return explanations.join('\n');
  }
}
