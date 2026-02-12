/**
 * Query Suggestion Engine
 * Provides autocomplete, corrections, and popular query suggestions
 */

import type { Suggestion } from './types';

/**
 * Suggestion engine configuration
 */
export interface SuggestionEngineConfig {
  maxSuggestions?: number;
  minPrefixLength?: number;
  enablePopularQueries?: boolean;
  enablePersonalization?: boolean;
}

/**
 * Popular query tracking
 */
interface PopularQuery {
  text: string;
  count: number;
  lastUsed: Date;
}

/**
 * User query history for personalization
 */
interface UserQueryHistory {
  userId: string;
  queries: Array<{ text: string; timestamp: Date }>;
}

/**
 * SuggestionEngine provides query suggestions and autocomplete
 */
export class SuggestionEngine {
  private config: Required<SuggestionEngineConfig>;
  private popularQueries: Map<string, PopularQuery>;
  private userHistory: Map<string, UserQueryHistory>;
  private templateQueries: string[];

  constructor(config: SuggestionEngineConfig = {}) {
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 5,
      minPrefixLength: config.minPrefixLength ?? 2,
      enablePopularQueries: config.enablePopularQueries ?? true,
      enablePersonalization: config.enablePersonalization ?? true,
    };

    this.popularQueries = new Map();
    this.userHistory = new Map();
    this.templateQueries = this.initializeTemplateQueries();
  }

  /**
   * Get query suggestions for partial input
   */
  async suggest(partial: string, userId?: string): Promise<Suggestion[]> {
    if (partial.length < this.config.minPrefixLength) {
      return this.getDefaultSuggestions(userId);
    }

    const suggestions: Suggestion[] = [];

    // Get completion suggestions
    const completions = this.getCompletions(partial);
    suggestions.push(...completions);

    // Get correction suggestions if input might have typos
    const corrections = this.getCorrections(partial);
    suggestions.push(...corrections);

    // Get similar queries
    const similar = this.getSimilarQueries(partial);
    suggestions.push(...similar);

    // Get personalized suggestions
    if (this.config.enablePersonalization && userId) {
      const personalized = this.getPersonalizedSuggestions(partial, userId);
      suggestions.push(...personalized);
    }

    // Get popular queries
    if (this.config.enablePopularQueries) {
      const popular = this.getPopularSuggestions(partial);
      suggestions.push(...popular);
    }

    // Sort by confidence and deduplicate
    return this.rankAndDeduplicate(suggestions).slice(0, this.config.maxSuggestions);
  }

  /**
   * Get default suggestions when no input
   */
  private getDefaultSuggestions(userId?: string): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Add popular queries
    if (this.config.enablePopularQueries) {
      const popular = Array.from(this.popularQueries.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(
          (query): Suggestion => ({
            text: query.text,
            type: 'popular',
            confidence: 0.8,
            metadata: { usageCount: query.count },
          }),
        );

      suggestions.push(...popular);
    }

    // Add template queries
    const templates = this.templateQueries.slice(0, 3).map(
      (text): Suggestion => ({
        text,
        type: 'similar',
        confidence: 0.7,
      }),
    );

    suggestions.push(...templates);

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get completion suggestions
   */
  private getCompletions(partial: string): Suggestion[] {
    const completions: Suggestion[] = [];
    const lowerPartial = partial.toLowerCase();

    // Match against template queries
    for (const template of this.templateQueries) {
      if (template.toLowerCase().startsWith(lowerPartial)) {
        completions.push({
          text: template,
          type: 'completion',
          confidence: 0.9,
        });
      }
    }

    // Match against popular queries
    for (const [text, query] of this.popularQueries.entries()) {
      if (text.toLowerCase().startsWith(lowerPartial)) {
        completions.push({
          text,
          type: 'completion',
          confidence: 0.85,
          metadata: { usageCount: query.count },
        });
      }
    }

    return completions;
  }

  /**
   * Get correction suggestions for potential typos
   */
  private getCorrections(partial: string): Suggestion[] {
    const corrections: Suggestion[] = [];

    // Check if partial contains common typos
    const typos: Record<string, string> = {
      worklow: 'workflow',
      worflow: 'workflow',
      exection: 'execution',
      serch: 'search',
      retreive: 'retrieve',
    };

    const words = partial.toLowerCase().split(' ');
    let hasCorrectionts = false;
    const correctedWords = words.map((word) => {
      if (typos[word]) {
        hasCorrectionts = true;
        return typos[word];
      }
      return word;
    });

    if (hasCorrectionts) {
      corrections.push({
        text: correctedWords.join(' '),
        type: 'correction',
        confidence: 0.8,
      });
    }

    return corrections;
  }

  /**
   * Get similar query suggestions
   */
  private getSimilarQueries(partial: string): Suggestion[] {
    const similar: Suggestion[] = [];
    const lowerPartial = partial.toLowerCase();

    // Find queries containing partial as substring
    for (const template of this.templateQueries) {
      if (
        template.toLowerCase().includes(lowerPartial) &&
        !template.toLowerCase().startsWith(lowerPartial)
      ) {
        similar.push({
          text: template,
          type: 'similar',
          confidence: 0.7,
        });
      }
    }

    return similar;
  }

  /**
   * Get personalized suggestions based on user history
   */
  private getPersonalizedSuggestions(partial: string, userId: string): Suggestion[] {
    const history = this.userHistory.get(userId);
    if (!history) return [];

    const suggestions: Suggestion[] = [];
    const lowerPartial = partial.toLowerCase();

    // Find matching queries from user history
    for (const query of history.queries) {
      if (query.text.toLowerCase().includes(lowerPartial)) {
        suggestions.push({
          text: query.text,
          type: 'similar',
          confidence: 0.75,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get popular query suggestions
   */
  private getPopularSuggestions(partial: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const lowerPartial = partial.toLowerCase();

    // Get popular queries that match partial
    const popular = Array.from(this.popularQueries.entries())
      .filter(([text]) => text.toLowerCase().includes(lowerPartial))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(
        ([text, query]): Suggestion => ({
          text,
          type: 'popular',
          confidence: 0.8,
          metadata: { usageCount: query.count },
        }),
      );

    suggestions.push(...popular);

    return suggestions;
  }

  /**
   * Rank and deduplicate suggestions
   */
  private rankAndDeduplicate(suggestions: Suggestion[]): Suggestion[] {
    const seen = new Set<string>();
    const unique: Suggestion[] = [];

    // Sort by confidence and type priority
    const typePriority: Record<string, number> = {
      completion: 4,
      correction: 3,
      popular: 2,
      similar: 1,
    };

    suggestions.sort((a, b) => {
      // First by type priority
      const priorityDiff = (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by confidence
      return b.confidence - a.confidence;
    });

    // Deduplicate
    for (const suggestion of suggestions) {
      const key = suggestion.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }

    return unique;
  }

  /**
   * Track query usage for popular queries
   */
  trackQuery(query: string, userId?: string): void {
    // Update popular queries
    const existing = this.popularQueries.get(query);
    if (existing) {
      existing.count++;
      existing.lastUsed = new Date();
    } else {
      this.popularQueries.set(query, {
        text: query,
        count: 1,
        lastUsed: new Date(),
      });
    }

    // Update user history
    if (userId && this.config.enablePersonalization) {
      let history = this.userHistory.get(userId);
      if (!history) {
        history = { userId, queries: [] };
        this.userHistory.set(userId, history);
      }

      history.queries.push({ text: query, timestamp: new Date() });

      // Keep only last 50 queries
      if (history.queries.length > 50) {
        history.queries = history.queries.slice(-50);
      }
    }
  }

  /**
   * Get popular queries
   */
  getPopularQueries(limit = 10): Array<{ text: string; count: number }> {
    return Array.from(this.popularQueries.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((query) => ({ text: query.text, count: query.count }));
  }

  /**
   * Clear user history
   */
  clearUserHistory(userId: string): void {
    this.userHistory.delete(userId);
  }

  /**
   * Initialize template queries
   */
  private initializeTemplateQueries(): string[] {
    return [
      'Show me all workflows',
      'Find workflows in the automation category',
      'How many workflows are active?',
      'Show me recent workflows',
      'Find workflows with AI',
      'List workflows created today',
      'Show me failed executions',
      'Count workflows by category',
      'Find workflows with HTTP Request node',
      'Show me workflows using webhooks',
      'List all active workflows',
      'Find workflows created this week',
      'Show me workflows with errors',
      'Count successful executions',
      'Find data pipeline workflows',
      'Show me workflows with Schedule trigger',
      'List workflows by popularity',
      'Find RAG pipeline workflows',
      'Show me AI agent workflows',
      'Count workflows created this month',
    ];
  }

  /**
   * Add custom template query
   */
  addTemplate(query: string): void {
    if (!this.templateQueries.includes(query)) {
      this.templateQueries.push(query);
    }
  }

  /**
   * Remove template query
   */
  removeTemplate(query: string): void {
    const index = this.templateQueries.indexOf(query);
    if (index !== -1) {
      this.templateQueries.splice(index, 1);
    }
  }

  /**
   * Export popular queries for analysis
   */
  exportPopularQueries(): string {
    const data = Array.from(this.popularQueries.entries()).map(([text, query]) => ({
      text,
      count: query.count,
      lastUsed: query.lastUsed,
    }));

    return JSON.stringify(data, null, 2);
  }
}
