/**
 * Feedback Collector
 * Collects and manages user feedback on query results
 */

import type { Feedback } from './types';
import { FeedbackSchema } from './types';

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  totalFeedback: number;
  avgRating: number;
  helpfulPercentage: number;
  ratingDistribution: Record<number, number>;
  recentFeedback: Feedback[];
}

/**
 * Feedback collector configuration
 */
export interface FeedbackCollectorConfig {
  enablePersistence?: boolean;
  maxFeedbackSize?: number;
  enableAnalytics?: boolean;
}

/**
 * Feedback entry with metadata
 */
interface FeedbackEntry extends Feedback {
  id: string;
  processed: boolean;
}

/**
 * FeedbackCollector manages user feedback on queries
 */
export class FeedbackCollector {
  private config: Required<FeedbackCollectorConfig>;
  private feedback: Map<string, FeedbackEntry>; // feedbackId -> entry
  private queryFeedback: Map<string, string>; // queryId -> feedbackId

  constructor(config: FeedbackCollectorConfig = {}) {
    this.config = {
      enablePersistence: config.enablePersistence ?? false,
      maxFeedbackSize: config.maxFeedbackSize ?? 10000,
      enableAnalytics: config.enableAnalytics ?? true,
    };

    this.feedback = new Map();
    this.queryFeedback = new Map();
  }

  /**
   * Collect feedback for a query
   */
  async collect(
    queryId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4 | 5,
    helpful: boolean,
    comment?: string,
  ): Promise<string> {
    // Validate input
    const feedbackData: Feedback = {
      queryId,
      userId,
      rating,
      helpful,
      comment,
      timestamp: new Date(),
    };

    const validated = FeedbackSchema.parse(feedbackData);

    // Create feedback entry
    const id = this.generateId();
    const entry: FeedbackEntry = {
      queryId: validated.queryId,
      userId: validated.userId,
      rating: validated.rating,
      helpful: validated.helpful,
      comment: validated.comment,
      timestamp: validated.timestamp,
      id,
      processed: false,
    };

    // Store feedback
    this.feedback.set(id, entry);
    this.queryFeedback.set(queryId, id);

    // Trim if exceeds max size
    if (this.feedback.size > this.config.maxFeedbackSize) {
      this.evictOldest();
    }

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(entry);
    }

    return id;
  }

  /**
   * Get feedback for a query
   */
  async getFeedback(queryId: string): Promise<Feedback | null> {
    const feedbackId = this.queryFeedback.get(queryId);
    if (!feedbackId) return null;

    const entry = this.feedback.get(feedbackId);
    if (!entry) return null;

    const { id, processed, ...feedback } = entry;
    return feedback;
  }

  /**
   * Get all feedback for a user
   */
  async getUserFeedback(userId: string, limit = 50): Promise<Feedback[]> {
    const userFeedback = Array.from(this.feedback.values())
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return userFeedback.map(({ id, processed, ...feedback }) => feedback);
  }

  /**
   * Get feedback statistics
   */
  async getStats(timeRange?: { start: Date; end: Date }): Promise<FeedbackStats> {
    let entries = Array.from(this.feedback.values());

    // Filter by time range if provided
    if (timeRange) {
      entries = entries.filter(
        (entry) => entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end,
      );
    }

    if (entries.length === 0) {
      return {
        totalFeedback: 0,
        avgRating: 0,
        helpfulPercentage: 0,
        ratingDistribution: {},
        recentFeedback: [],
      };
    }

    // Calculate metrics
    const totalFeedback = entries.length;
    const avgRating = entries.reduce((sum, entry) => sum + entry.rating, 0) / totalFeedback;

    const helpfulCount = entries.filter((entry) => entry.helpful).length;
    const helpfulPercentage = (helpfulCount / totalFeedback) * 100;

    // Rating distribution
    const ratingDistribution: Record<number, number> = {};
    for (const entry of entries) {
      ratingDistribution[entry.rating] = (ratingDistribution[entry.rating] || 0) + 1;
    }

    // Recent feedback
    const recentFeedback = entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
      .map(({ id, processed, ...feedback }) => feedback);

    return {
      totalFeedback,
      avgRating,
      helpfulPercentage,
      ratingDistribution,
      recentFeedback,
    };
  }

  /**
   * Get low-rated queries for improvement
   */
  async getLowRatedQueries(threshold = 2, limit = 20): Promise<
    Array<{
      queryId: string;
      rating: number;
      comment?: string;
      timestamp: Date;
    }>
  > {
    return Array.from(this.feedback.values())
      .filter((entry) => entry.rating <= threshold)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map((entry) => ({
        queryId: entry.queryId,
        rating: entry.rating,
        comment: entry.comment,
        timestamp: entry.timestamp,
      }));
  }

  /**
   * Get queries that need improvement
   */
  async getQueriesForImprovement(limit = 20): Promise<
    Array<{
      queryId: string;
      avgRating: number;
      feedbackCount: number;
      unhelpfulCount: number;
    }>
  > {
    // Group feedback by queryId
    const queryGroups = new Map<
      string,
      Array<{ rating: number; helpful: boolean }>
    >();

    for (const entry of this.feedback.values()) {
      const group = queryGroups.get(entry.queryId) || [];
      group.push({ rating: entry.rating, helpful: entry.helpful });
      queryGroups.set(entry.queryId, group);
    }

    // Calculate metrics for each query
    const results = Array.from(queryGroups.entries())
      .map(([queryId, feedback]) => {
        const avgRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;
        const unhelpfulCount = feedback.filter((f) => !f.helpful).length;

        return {
          queryId,
          avgRating,
          feedbackCount: feedback.length,
          unhelpfulCount,
        };
      })
      .filter((item) => item.avgRating < 3 || item.unhelpfulCount > 0)
      .sort((a, b) => a.avgRating - b.avgRating);

    return results.slice(0, limit);
  }

  /**
   * Mark feedback as processed
   */
  async markProcessed(feedbackId: string): Promise<boolean> {
    const entry = this.feedback.get(feedbackId);
    if (!entry) return false;

    entry.processed = true;
    return true;
  }

  /**
   * Get unprocessed feedback
   */
  async getUnprocessed(limit = 50): Promise<Feedback[]> {
    return Array.from(this.feedback.values())
      .filter((entry) => !entry.processed)
      .slice(0, limit)
      .map(({ id, processed, ...feedback }) => feedback);
  }

  /**
   * Update feedback comment
   */
  async updateComment(feedbackId: string, comment: string): Promise<boolean> {
    const entry = this.feedback.get(feedbackId);
    if (!entry) return false;

    entry.comment = comment;

    // Persist if enabled
    if (this.config.enablePersistence) {
      await this.persist(entry);
    }

    return true;
  }

  /**
   * Delete feedback
   */
  async deleteFeedback(feedbackId: string): Promise<boolean> {
    const entry = this.feedback.get(feedbackId);
    if (!entry) return false;

    this.feedback.delete(feedbackId);
    this.queryFeedback.delete(entry.queryId);

    return true;
  }

  /**
   * Clear all feedback
   */
  async clear(): Promise<void> {
    this.feedback.clear();
    this.queryFeedback.clear();
  }

  /**
   * Export feedback data
   */
  async exportFeedback(): Promise<string> {
    const data = Array.from(this.feedback.values()).map(({ id, processed, ...feedback }) => ({
      ...feedback,
      id,
      processed,
    }));

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import feedback data
   */
  async importFeedback(data: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(data);

      for (const item of parsed) {
        const entry: FeedbackEntry = {
          id: item.id,
          queryId: item.queryId,
          userId: item.userId,
          rating: item.rating,
          helpful: item.helpful,
          comment: item.comment,
          timestamp: new Date(item.timestamp),
          processed: item.processed || false,
        };

        this.feedback.set(entry.id, entry);
        this.queryFeedback.set(entry.queryId, entry.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to import feedback:', error);
      return false;
    }
  }

  /**
   * Get feedback trends over time
   */
  async getTrends(interval: 'day' | 'week' | 'month'): Promise<
    Array<{
      period: Date;
      avgRating: number;
      feedbackCount: number;
      helpfulPercentage: number;
    }>
  > {
    // Group feedback by time period
    const groups = new Map<string, Feedback[]>();

    for (const entry of this.feedback.values()) {
      const key = this.getPeriodKey(entry.timestamp, interval);
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    }

    // Calculate metrics for each period
    return Array.from(groups.entries())
      .map(([key, feedback]) => {
        const avgRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;
        const helpfulCount = feedback.filter((f) => f.helpful).length;
        const helpfulPercentage = (helpfulCount / feedback.length) * 100;

        return {
          period: feedback[0].timestamp,
          avgRating,
          feedbackCount: feedback.length,
          helpfulPercentage,
        };
      })
      .sort((a, b) => a.period.getTime() - b.period.getTime());
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Evict oldest feedback entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.feedback.entries());
    entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    // Remove oldest 10%
    const toRemove = entries.slice(0, Math.ceil(this.config.maxFeedbackSize * 0.1));
    for (const [id, entry] of toRemove) {
      this.feedback.delete(id);
      this.queryFeedback.delete(entry.queryId);
    }
  }

  /**
   * Persist feedback to storage
   */
  private async persist(entry: FeedbackEntry): Promise<void> {
    // TODO: Implement database persistence
    console.debug(`Persisting feedback ${entry.id}`);
  }

  /**
   * Get period key for grouping
   */
  private getPeriodKey(date: Date, interval: 'day' | 'week' | 'month'): string {
    const d = new Date(date);

    switch (interval) {
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
    }

    return d.toISOString();
  }
}
