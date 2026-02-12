/**
 * Memory Store with Supabase Persistence and Vector Search
 * Provides LRU caching and batch operations for efficiency
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import type {
  MemoryEntry,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemoryRetrievalOptions,
  MemorySearchResult,
  CacheEntry,
  MemoryStats,
} from './types.js';

const DEFAULT_CACHE_SIZE = 1000; // Number of entries
const DEFAULT_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * LRU Cache for memory entries
 */
class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = DEFAULT_CACHE_SIZE, ttl = DEFAULT_CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.lastAccessed > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access time and move to end (most recently used)
    entry.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry.value;
  }

  set(key: string, value: T, size = 1): void {
    // Remove if already exists
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
      size,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Memory Store with Supabase backend and LRU cache
 */
export class MemoryStore {
  private cache: LRUCache<MemoryEntry>;
  private batchQueue: MemoryEntry[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly batchSize = 10;
  private readonly batchDelay = 1000; // 1 second

  constructor(cacheSize?: number, cacheTTL?: number) {
    this.cache = new LRUCache(cacheSize, cacheTTL);
  }

  /**
   * Generate embedding for content using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const supabase = getSupabaseClient();

    // Call Supabase edge function for embedding generation
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: { text },
    });

    if (error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }

    return data.embedding;
  }

  /**
   * Save a memory entry
   */
  async save(entry: MemoryEntry): Promise<MemoryEntry> {
    const supabase = getSupabaseClient();

    // Generate embedding if not provided
    if (!entry.embedding) {
      entry.embedding = await this.generateEmbedding(entry.content);
    }

    // Ensure ID exists
    if (!entry.id) {
      entry.id = uuidv4();
    }

    // Prepare database row
    const row = this.entryToRow(entry);

    // Upsert to database
    const { data, error } = await supabase
      .from('memory_entries')
      .upsert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save memory: ${error.message}`);
    }

    const savedEntry = this.rowToEntry(data);

    // Update cache
    this.cache.set(savedEntry.id, savedEntry);

    return savedEntry;
  }

  /**
   * Save multiple entries in batch
   */
  async saveBatch(entries: MemoryEntry[]): Promise<MemoryEntry[]> {
    const supabase = getSupabaseClient();

    // Generate embeddings for entries without them
    const entriesWithEmbeddings = await Promise.all(
      entries.map(async (entry) => {
        if (!entry.embedding) {
          entry.embedding = await this.generateEmbedding(entry.content);
        }
        if (!entry.id) {
          entry.id = uuidv4();
        }
        return entry;
      })
    );

    // Convert to database rows
    const rows = entriesWithEmbeddings.map(e => this.entryToRow(e));

    // Batch insert
    const { data, error } = await supabase
      .from('memory_entries')
      .upsert(rows)
      .select();

    if (error) {
      throw new Error(`Failed to batch save memories: ${error.message}`);
    }

    const savedEntries = data.map(row => this.rowToEntry(row));

    // Update cache
    savedEntries.forEach(entry => {
      this.cache.set(entry.id, entry);
    });

    return savedEntries;
  }

  /**
   * Queue entry for batch save
   */
  queueSave(entry: MemoryEntry): void {
    this.batchQueue.push(entry);

    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Flush immediately if batch size reached
    if (this.batchQueue.length >= this.batchSize) {
      void this.flushBatch();
      return;
    }

    // Otherwise schedule flush
    this.batchTimeout = setTimeout(() => {
      void this.flushBatch();
    }, this.batchDelay);
  }

  /**
   * Flush queued batch saves
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    const toSave = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = null;

    try {
      await this.saveBatch(toSave);
    } catch (error) {
      console.error('Batch save failed:', error);
      // Re-queue on failure
      this.batchQueue.unshift(...toSave);
    }
  }

  /**
   * Get memory entry by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      // Update access metadata
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      void this.updateAccessMetadata(id, cached.accessCount, cached.lastAccessed);
      return cached;
    }

    // Fetch from database
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    const entry = this.rowToEntry(data);

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    void this.updateAccessMetadata(id, entry.accessCount, entry.lastAccessed);

    // Cache it
    this.cache.set(id, entry);

    return entry;
  }

  /**
   * Update access metadata (fire and forget)
   */
  private async updateAccessMetadata(
    id: string,
    accessCount: number,
    lastAccessed: number
  ): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase
      .from('memory_entries')
      .update({
        access_count: accessCount,
        last_accessed: lastAccessed,
      })
      .eq('id', id);
  }

  /**
   * Search memories by vector similarity
   */
  async search(
    query: string,
    options: MemoryRetrievalOptions = {}
  ): Promise<MemorySearchResult[]> {
    const supabase = getSupabaseClient();

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Build RPC call for vector search
    const { data, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: options.limit || 10,
      memory_type: options.type || null,
      min_importance: options.minImportance || 0,
      max_age_ms: options.maxAge || null,
      session_id: options.sessionId || null,
    });

    if (error) {
      throw new Error(`Memory search failed: ${error.message}`);
    }

    return data.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        memory: this.rowToEntry(r),
        score: r.similarity as number,
        relevance: this.calculateRelevance(
          r.similarity as number,
          r.importance as number,
          r.access_count as number,
          r.created_at as number
        ),
      };
    });
  }

  /**
   * Calculate combined relevance score
   */
  private calculateRelevance(
    similarity: number,
    importance: number,
    accessCount: number,
    createdAt: number
  ): number {
    const recencyScore = this.calculateRecencyScore(createdAt);
    const popularityScore = Math.min(accessCount / 100, 1); // Cap at 100 accesses

    // Weighted combination
    return (
      similarity * 0.6 +
      importance * 0.2 +
      recencyScore * 0.1 +
      popularityScore * 0.1
    );
  }

  /**
   * Calculate recency score (decays exponentially)
   */
  private calculateRecencyScore(createdAt: number): number {
    const ageMs = Date.now() - createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    // Decay with half-life of 30 days
    return Math.exp(-ageDays / 30);
  }

  /**
   * Delete memory entry
   */
  async delete(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete memory: ${error.message}`);
    }

    // Remove from cache
    this.cache.delete(id);

    return true;
  }

  /**
   * Delete multiple entries
   */
  async deleteBatch(ids: string[]): Promise<number> {
    const supabase = getSupabaseClient();

    const { error, count } = await supabase
      .from('memory_entries')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to batch delete memories: ${error.message}`);
    }

    // Remove from cache
    ids.forEach(id => this.cache.delete(id));

    return count || 0;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('get_memory_stats');

    if (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }

    return {
      totalEntries: data.total_entries,
      byType: {
        episodic: data.episodic_count,
        semantic: data.semantic_count,
        procedural: data.procedural_count,
      },
      avgImportance: data.avg_importance,
      avgAccessCount: data.avg_access_count,
      cacheHitRate: this.cache.getHitRate(),
      oldestEntry: data.oldest_entry,
      newestEntry: data.newest_entry,
    };
  }

  /**
   * Convert memory entry to database row
   */
  private entryToRow(entry: MemoryEntry): Record<string, unknown> {
    const base = {
      id: entry.id,
      type: entry.type,
      content: entry.content,
      embedding: entry.embedding,
      metadata: entry.metadata,
      importance: entry.importance,
      access_count: entry.accessCount,
      last_accessed: entry.lastAccessed,
      created_at: entry.createdAt,
      expires_at: entry.expiresAt,
    };

    // Add type-specific fields
    if (entry.type === 'episodic') {
      const episodic = entry as EpisodicMemory;
      return {
        ...base,
        session_id: episodic.sessionId,
        conversation_turn: episodic.conversationTurn,
        user_message: episodic.userMessage,
        agent_response: episodic.agentResponse,
        workflow_context: episodic.workflowContext,
      };
    }

    if (entry.type === 'semantic') {
      const semantic = entry as SemanticMemory;
      return {
        ...base,
        category: semantic.category,
        facts: semantic.facts,
        relations: semantic.relations,
      };
    }

    if (entry.type === 'procedural') {
      const procedural = entry as ProceduralMemory;
      return {
        ...base,
        skill: procedural.skill,
        steps: procedural.steps,
        trigger_patterns: procedural.triggerPatterns,
        success_rate: procedural.successRate,
        usage_count: procedural.usageCount,
      };
    }

    return base;
  }

  /**
   * Convert database row to memory entry
   */
  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    const base = {
      id: row.id as string,
      type: row.type as 'episodic' | 'semantic' | 'procedural',
      content: row.content as string,
      embedding: row.embedding as number[] | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      importance: row.importance as number,
      accessCount: row.access_count as number,
      lastAccessed: row.last_accessed as number,
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number | undefined,
    };

    if (base.type === 'episodic') {
      return {
        ...base,
        type: 'episodic',
        sessionId: row.session_id as string,
        conversationTurn: row.conversation_turn as number,
        userMessage: row.user_message as string,
        agentResponse: row.agent_response as string,
        workflowContext: row.workflow_context as Record<string, unknown> | undefined,
      } as EpisodicMemory;
    }

    if (base.type === 'semantic') {
      return {
        ...base,
        type: 'semantic',
        category: row.category as string,
        facts: row.facts as string[],
        relations: row.relations as Array<{ subject: string; predicate: string; object: string }>,
      } as SemanticMemory;
    }

    if (base.type === 'procedural') {
      return {
        ...base,
        type: 'procedural',
        skill: row.skill as string,
        steps: row.steps as string[],
        triggerPatterns: row.trigger_patterns as string[],
        successRate: row.success_rate as number,
        usageCount: row.usage_count as number,
      } as ProceduralMemory;
    }

    return base;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size(),
      hitRate: this.cache.getHitRate(),
    };
  }
}
