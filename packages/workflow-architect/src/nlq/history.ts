/**
 * Query History Manager
 * Manages user query history and favorites
 */

import type { NLQuery, QueryResult, ParsedQuery } from './types';

/**
 * Query history entry
 */
export interface QueryHistoryEntry {
  id: string;
  userId: string;
  query: NLQuery;
  parsedQuery?: ParsedQuery;
  result?: QueryResult;
  timestamp: Date;
  executionTime: number;
  favorite: boolean;
}

/**
 * History manager configuration
 */
export interface HistoryManagerConfig {
  maxHistorySize?: number;
  enablePersistence?: boolean;
  persistenceInterval?: number;
}

/**
 * HistoryManager manages user query history
 */
export class HistoryManager {
  private config: Required<HistoryManagerConfig>;
  private history: Map<string, QueryHistoryEntry[]>; // userId -> entries
  private favorites: Map<string, Set<string>>; // userId -> queryIds

  constructor(config: HistoryManagerConfig = {}) {
    this.config = {
      maxHistorySize: config.maxHistorySize ?? 1000,
      enablePersistence: config.enablePersistence ?? false,
      persistenceInterval: config.persistenceInterval ?? 60000, // 1 minute
    };

    this.history = new Map();
    this.favorites = new Map();

    // Set up periodic persistence
    if (this.config.enablePersistence) {
      setInterval(() => this.persistAll(), this.config.persistenceInterval);
    }
  }

  /**
   * Save a query to history
   */
  async save(
    userId: string,
    query: NLQuery,
    parsedQuery?: ParsedQuery,
    result?: QueryResult,
    executionTime = 0,
  ): Promise<string> {
    const id = this.generateId();
    const entry: QueryHistoryEntry = {
      id,
      userId,
      query,
      parsedQuery,
      result,
      timestamp: new Date(),
      executionTime,
      favorite: false,
    };

    // Get or create user history
    let userHistory = this.history.get(userId);
    if (!userHistory) {
      userHistory = [];
      this.history.set(userId, userHistory);
    }

    // Add entry
    userHistory.push(entry);

    // Trim if exceeds max size
    if (userHistory.length > this.config.maxHistorySize) {
      userHistory.shift();
    }

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(userId);
    }

    return id;
  }

  /**
   * Get query history for user
   */
  async getHistory(userId: string, limit = 20, offset = 0): Promise<QueryHistoryEntry[]> {
    const userHistory = this.history.get(userId) || [];

    // Return in reverse chronological order
    return userHistory.slice().reverse().slice(offset, offset + limit);
  }

  /**
   * Get a specific query by ID
   */
  async getQuery(userId: string, queryId: string): Promise<QueryHistoryEntry | null> {
    const userHistory = this.history.get(userId) || [];
    return userHistory.find((entry) => entry.id === queryId) || null;
  }

  /**
   * Search query history
   */
  async searchHistory(userId: string, searchText: string, limit = 20): Promise<QueryHistoryEntry[]> {
    const userHistory = this.history.get(userId) || [];
    const lowerSearch = searchText.toLowerCase();

    return userHistory
      .filter((entry) => entry.query.text.toLowerCase().includes(lowerSearch))
      .reverse()
      .slice(0, limit);
  }

  /**
   * Add query to favorites
   */
  async addFavorite(userId: string, queryId: string): Promise<boolean> {
    const entry = await this.getQuery(userId, queryId);
    if (!entry) return false;

    // Mark as favorite
    entry.favorite = true;

    // Add to favorites set
    let userFavorites = this.favorites.get(userId);
    if (!userFavorites) {
      userFavorites = new Set();
      this.favorites.set(userId, userFavorites);
    }
    userFavorites.add(queryId);

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(userId);
    }

    return true;
  }

  /**
   * Remove query from favorites
   */
  async removeFavorite(userId: string, queryId: string): Promise<boolean> {
    const entry = await this.getQuery(userId, queryId);
    if (!entry) return false;

    // Unmark as favorite
    entry.favorite = false;

    // Remove from favorites set
    const userFavorites = this.favorites.get(userId);
    if (userFavorites) {
      userFavorites.delete(queryId);
    }

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(userId);
    }

    return true;
  }

  /**
   * Get favorite queries
   */
  async getFavorites(userId: string, limit = 20): Promise<QueryHistoryEntry[]> {
    const userFavorites = this.favorites.get(userId);
    if (!userFavorites || userFavorites.size === 0) {
      return [];
    }

    const userHistory = this.history.get(userId) || [];
    const favorites = userHistory
      .filter((entry) => userFavorites.has(entry.id))
      .reverse()
      .slice(0, limit);

    return favorites;
  }

  /**
   * Delete a query from history
   */
  async deleteQuery(userId: string, queryId: string): Promise<boolean> {
    const userHistory = this.history.get(userId);
    if (!userHistory) return false;

    const index = userHistory.findIndex((entry) => entry.id === queryId);
    if (index === -1) return false;

    userHistory.splice(index, 1);

    // Remove from favorites if needed
    const userFavorites = this.favorites.get(userId);
    if (userFavorites) {
      userFavorites.delete(queryId);
    }

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(userId);
    }

    return true;
  }

  /**
   * Clear all history for user
   */
  async clearHistory(userId: string): Promise<void> {
    this.history.delete(userId);
    this.favorites.delete(userId);

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(userId);
    }
  }

  /**
   * Get history statistics
   */
  async getStatistics(userId: string): Promise<{
    totalQueries: number;
    favoriteCount: number;
    avgExecutionTime: number;
    mostRecentQuery?: Date;
  }> {
    const userHistory = this.history.get(userId) || [];
    const userFavorites = this.favorites.get(userId);

    const totalQueries = userHistory.length;
    const favoriteCount = userFavorites?.size || 0;
    const avgExecutionTime =
      totalQueries > 0
        ? userHistory.reduce((sum, entry) => sum + entry.executionTime, 0) / totalQueries
        : 0;
    const mostRecentQuery = totalQueries > 0 ? userHistory[userHistory.length - 1].timestamp : undefined;

    return {
      totalQueries,
      favoriteCount,
      avgExecutionTime,
      mostRecentQuery,
    };
  }

  /**
   * Export user history
   */
  async exportHistory(userId: string): Promise<string> {
    const userHistory = this.history.get(userId) || [];
    const userFavorites = this.favorites.get(userId);

    const data = {
      userId,
      history: userHistory,
      favorites: Array.from(userFavorites || []),
      exportedAt: new Date(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import user history
   */
  async importHistory(data: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(data);
      const { userId, history, favorites } = parsed;

      this.history.set(userId, history);
      this.favorites.set(userId, new Set(favorites));

      return true;
    } catch (error) {
      console.error('Failed to import history:', error);
      return false;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Persist user history to storage
   */
  private async persist(userId: string): Promise<void> {
    // TODO: Implement database persistence
    // For now, this is a no-op
    console.debug(`Persisting history for user ${userId}`);
  }

  /**
   * Persist all user histories
   */
  private async persistAll(): Promise<void> {
    for (const userId of this.history.keys()) {
      await this.persist(userId);
    }
  }

  /**
   * Load history from storage
   */
  private async load(userId: string): Promise<void> {
    // TODO: Implement database loading
    // For now, this is a no-op
    console.debug(`Loading history for user ${userId}`);
  }

  /**
   * Get recent queries
   */
  async getRecentQueries(userId: string, limit = 10): Promise<string[]> {
    const userHistory = this.history.get(userId) || [];
    return userHistory
      .slice(-limit)
      .reverse()
      .map((entry) => entry.query.text);
  }

  /**
   * Get query count for time period
   */
  async getQueryCount(userId: string, since?: Date): Promise<number> {
    const userHistory = this.history.get(userId) || [];

    if (!since) {
      return userHistory.length;
    }

    return userHistory.filter((entry) => entry.timestamp >= since).length;
  }
}
