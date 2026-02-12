/**
 * Memory Type Definitions
 * Defines the structure for episodic, semantic, and procedural memory
 */

export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  importance: number; // 0-1
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
  expiresAt?: number;
}

export interface EpisodicMemory extends MemoryEntry {
  type: 'episodic';
  sessionId: string;
  conversationTurn: number;
  userMessage: string;
  agentResponse: string;
  workflowContext?: Record<string, unknown>;
}

export interface SemanticMemory extends MemoryEntry {
  type: 'semantic';
  category: string;
  facts: string[];
  relations: Array<{ subject: string; predicate: string; object: string }>;
}

export interface ProceduralMemory extends MemoryEntry {
  type: 'procedural';
  skill: string;
  steps: string[];
  triggerPatterns: string[];
  successRate: number;
  usageCount: number;
}

export interface MemorySession {
  id: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
  summary?: string;
  episodeCount: number;
}

export interface MemoryRetrievalOptions {
  type?: MemoryType;
  limit?: number;
  minImportance?: number;
  maxAge?: number;
  sessionId?: string;
}

/**
 * Memory search result with relevance score
 */
export interface MemorySearchResult {
  memory: MemoryEntry | EpisodicMemory | SemanticMemory | ProceduralMemory;
  score: number;
  relevance: number;
}

/**
 * Configuration for memory consolidation
 */
export interface ConsolidationConfig {
  importanceDecayFactor: number; // How much importance decays over time
  similarityThreshold: number; // Threshold for merging similar memories
  minImportanceThreshold: number; // Minimum importance to keep
  maxAge: number; // Maximum age in milliseconds
}

/**
 * LRU Cache entry for in-memory storage
 */
export interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
  size: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  avgAccessCount: number;
  cacheHitRate: number;
  oldestEntry: number;
  newestEntry: number;
}
