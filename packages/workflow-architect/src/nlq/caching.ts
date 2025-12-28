/**
 * Query Cache
 * Caches query results with semantic similarity matching
 */

import type { CachedResult, QueryResult, StructuredQuery } from './types';
import { createHash } from 'crypto';

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  queryHash: string;
  queryText: string;
  structuredQuery: StructuredQuery;
  result: QueryResult;
  timestamp: Date;
  ttl: number;
  hitCount: number;
  lastAccessed: Date;
}

/**
 * Query cache configuration
 */
export interface QueryCacheConfig {
  maxSize?: number;
  defaultTTL?: number;
  enableSemanticMatch?: boolean;
  semanticThreshold?: number;
}

/**
 * QueryCache provides caching with semantic similarity matching
 */
export class QueryCache {
  private config: Required<QueryCacheConfig>;
  private cache: Map<string, CacheEntry>;
  private queryEmbeddings: Map<string, number[]>; // For semantic matching

  constructor(config: QueryCacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      defaultTTL: config.defaultTTL ?? 3600000, // 1 hour
      enableSemanticMatch: config.enableSemanticMatch ?? false,
      semanticThreshold: config.semanticThreshold ?? 0.85,
    };

    this.cache = new Map();
    this.queryEmbeddings = new Map();

    // Set up periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Get cached result for query
   */
  async get(
    queryText: string,
    structuredQuery: StructuredQuery,
  ): Promise<(CachedResult & { result: QueryResult }) | null> {
    const queryHash = this.hashQuery(structuredQuery);

    // Try exact match first
    const exactMatch = this.cache.get(queryHash);
    if (exactMatch && this.isValid(exactMatch)) {
      exactMatch.hitCount++;
      exactMatch.lastAccessed = new Date();

      return {
        queryHash,
        result: exactMatch.result,
        timestamp: exactMatch.timestamp,
        ttl: exactMatch.ttl,
        hitCount: exactMatch.hitCount,
      };
    }

    // Try semantic match if enabled
    if (this.config.enableSemanticMatch) {
      const semanticMatch = await this.findSemanticMatch(queryText, structuredQuery);
      if (semanticMatch) {
        semanticMatch.hitCount++;
        semanticMatch.lastAccessed = new Date();

        return {
          queryHash: semanticMatch.queryHash,
          result: semanticMatch.result,
          timestamp: semanticMatch.timestamp,
          ttl: semanticMatch.ttl,
          hitCount: semanticMatch.hitCount,
        };
      }
    }

    return null;
  }

  /**
   * Set cache entry
   */
  async set(
    queryText: string,
    structuredQuery: StructuredQuery,
    result: QueryResult,
    ttl?: number,
  ): Promise<void> {
    const queryHash = this.hashQuery(structuredQuery);

    const entry: CacheEntry = {
      queryHash,
      queryText,
      structuredQuery,
      result,
      timestamp: new Date(),
      ttl: ttl ?? this.config.defaultTTL,
      hitCount: 0,
      lastAccessed: new Date(),
    };

    // Add to cache
    this.cache.set(queryHash, entry);

    // Evict if cache is too large
    if (this.cache.size > this.config.maxSize) {
      this.evict();
    }

    // Store embedding for semantic matching if enabled
    if (this.config.enableSemanticMatch) {
      await this.storeEmbedding(queryHash, queryText);
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(queryHash: string): Promise<boolean> {
    const deleted = this.cache.delete(queryHash);
    this.queryEmbeddings.delete(queryHash);
    return deleted;
  }

  /**
   * Invalidate all cache entries matching pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<number> {
    let count = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (pattern.test(entry.queryText)) {
        this.cache.delete(hash);
        this.queryEmbeddings.delete(hash);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.queryEmbeddings.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    avgHitCount: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.cache.values());

    const totalHits = entries.reduce((sum, entry) => sum + entry.hitCount, 0);
    const avgHitCount = entries.length > 0 ? totalHits / entries.length : 0;

    // Calculate hit rate (rough approximation)
    const hitRate = entries.length > 0 ? Math.min(avgHitCount / 10, 1) : 0;

    const timestamps = entries.map((e) => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? new Date(Math.min(...timestamps.map((t) => t.getTime()))) : undefined;
    const newestEntry = timestamps.length > 0 ? new Date(Math.max(...timestamps.map((t) => t.getTime()))) : undefined;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      avgHitCount,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Hash structured query for cache key
   */
  private hashQuery(query: StructuredQuery): string {
    // Create a deterministic hash from the query
    const queryStr = JSON.stringify(query, Object.keys(query).sort());
    return createHash('sha256').update(queryStr).digest('hex');
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp.getTime();
    return age < entry.ttl;
  }

  /**
   * Find semantic match in cache
   */
  private async findSemanticMatch(
    queryText: string,
    structuredQuery: StructuredQuery,
  ): Promise<CacheEntry | null> {
    // TODO: Implement semantic similarity matching
    // This would require embedding generation and similarity calculation
    // For now, return null
    return null;
  }

  /**
   * Store query embedding for semantic matching
   */
  private async storeEmbedding(queryHash: string, queryText: string): Promise<void> {
    // TODO: Generate and store embedding
    // For now, this is a no-op
    console.debug(`Storing embedding for query: ${queryHash}`);
  }

  /**
   * Calculate semantic similarity between queries
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    // Cosine similarity
    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Evict least recently used entries
   */
  private evict(): void {
    // Remove expired entries first
    this.cleanup();

    // If still over limit, remove LRU entries
    if (this.cache.size > this.config.maxSize) {
      const entries = Array.from(this.cache.entries());

      // Sort by last accessed time
      entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

      // Remove oldest entries
      const toRemove = entries.slice(0, Math.ceil(this.config.maxSize * 0.1)); // Remove 10%
      for (const [hash] of toRemove) {
        this.cache.delete(hash);
        this.queryEmbeddings.delete(hash);
      }
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [hash, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        toRemove.push(hash);
      }
    }

    for (const hash of toRemove) {
      this.cache.delete(hash);
      this.queryEmbeddings.delete(hash);
    }

    if (toRemove.length > 0) {
      console.debug(`Cleaned up ${toRemove.length} expired cache entries`);
    }
  }

  /**
   * Get most popular cached queries
   */
  getMostPopular(limit = 10): Array<{ query: string; hitCount: number }> {
    const entries = Array.from(this.cache.values());

    return entries
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, limit)
      .map((entry) => ({
        query: entry.queryText,
        hitCount: entry.hitCount,
      }));
  }

  /**
   * Warm cache with popular queries
   */
  async warmCache(queries: Array<{ text: string; query: StructuredQuery; result: QueryResult }>): Promise<number> {
    let count = 0;

    for (const { text, query, result } of queries) {
      await this.set(text, query, result);
      count++;
    }

    return count;
  }

  /**
   * Export cache for analysis
   */
  exportCache(): string {
    const entries = Array.from(this.cache.values()).map((entry) => ({
      queryHash: entry.queryHash,
      queryText: entry.queryText,
      timestamp: entry.timestamp,
      hitCount: entry.hitCount,
      lastAccessed: entry.lastAccessed,
    }));

    return JSON.stringify(entries, null, 2);
  }
}
