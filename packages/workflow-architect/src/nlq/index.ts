/**
 * Natural Language Query Service
 * Main service orchestrating all NLQ components
 */

import { QueryParser } from './parser';
import { IntentClassifier } from './intent';
import { EntityExtractor } from './entity';
import { QueryTranslator } from './translator';
import { QueryExecutor } from './executor';
import { ResultFormatter } from './formatter';
import { ContextManager } from './context';
import { ClarificationEngine } from './clarification';
import { SuggestionEngine } from './suggestions';
import { HistoryManager } from './history';
import { QueryCache } from './caching';
import { QueryAnalytics } from './analytics';
import { FeedbackCollector } from './feedback';

import type {
  NLQuery,
  QueryResult,
  Suggestion,
  Feedback,
  ParsedQuery,
  StructuredQuery,
} from './types';
import type { QueryHistoryEntry } from './history';
import type { AnalyticsReport } from './analytics';
import type { ClarificationRequest } from './clarification';

/**
 * NLQ Service configuration
 */
export interface NLQueryServiceConfig {
  enableCache?: boolean;
  enableAnalytics?: boolean;
  enableHistory?: boolean;
  enableSuggestions?: boolean;
  cacheSize?: number;
  maxHistorySize?: number;
  defaultTimeout?: number;
}

/**
 * Streaming chunk for progressive results
 */
export interface StreamChunk {
  type: 'parsing' | 'translating' | 'executing' | 'formatting' | 'result' | 'error';
  data?: unknown;
  message?: string;
}

/**
 * NLQueryService is the main orchestrator for natural language queries
 */
export class NLQueryService {
  private parser: QueryParser;
  private intentClassifier: IntentClassifier;
  private entityExtractor: EntityExtractor;
  private translator: QueryTranslator;
  private executor: QueryExecutor;
  private formatter: ResultFormatter;
  private contextManager: ContextManager;
  private clarificationEngine: ClarificationEngine;
  private suggestionEngine: SuggestionEngine;
  private historyManager: HistoryManager;
  private cache: QueryCache;
  private analytics: QueryAnalytics;
  private feedbackCollector: FeedbackCollector;
  private config: Required<NLQueryServiceConfig>;
  private initialized: boolean = false;

  constructor(config: NLQueryServiceConfig = {}) {
    this.config = {
      enableCache: config.enableCache ?? true,
      enableAnalytics: config.enableAnalytics ?? true,
      enableHistory: config.enableHistory ?? true,
      enableSuggestions: config.enableSuggestions ?? true,
      cacheSize: config.cacheSize ?? 1000,
      maxHistorySize: config.maxHistorySize ?? 1000,
      defaultTimeout: config.defaultTimeout ?? 5000,
    };

    // Initialize components
    this.parser = new QueryParser();
    this.intentClassifier = new IntentClassifier();
    this.entityExtractor = new EntityExtractor();
    this.translator = new QueryTranslator();
    this.executor = new QueryExecutor({ timeout: this.config.defaultTimeout });
    this.formatter = new ResultFormatter();
    this.contextManager = new ContextManager();
    this.clarificationEngine = new ClarificationEngine();
    this.suggestionEngine = new SuggestionEngine();
    this.historyManager = new HistoryManager({ maxHistorySize: this.config.maxHistorySize });
    this.cache = new QueryCache({ maxSize: this.config.cacheSize });
    this.analytics = new QueryAnalytics();
    this.feedbackCollector = new FeedbackCollector();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize executor (sets up RAG store)
    await this.executor.initialize();

    this.initialized = true;
    console.log('NLQueryService initialized');
  }

  /**
   * Execute a natural language query
   */
  async query(nlQuery: NLQuery): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Ensure initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // Parse the query
      const parsed = await this.parser.parse(nlQuery);

      // Classify intent (refine parser's basic classification)
      const intentClassification = await this.intentClassifier.classify(parsed);
      parsed.intent = intentClassification.intent;
      parsed.intentConfidence = intentClassification.confidence;

      // Get context
      const sessionId = nlQuery.sessionId || this.generateSessionId();
      const userId = nlQuery.userId || 'anonymous';
      const conversationContext = this.contextManager.getContext(userId, sessionId);

      // Extract entities with context
      const queryContext = nlQuery.context || {
        previousQueries: conversationContext.history.map((h) => h.query.text),
        userPreferences: conversationContext.preferences,
        referencedEntities: conversationContext.entityMemory,
      };
      const entities = await this.entityExtractor.extract(parsed, queryContext);
      parsed.entities = entities;

      // Check if clarification is needed
      if (this.clarificationEngine.needsClarification(parsed)) {
        const clarification = this.clarificationEngine.generateQuestion(parsed);
        if (clarification) {
          return this.createClarificationResult(clarification);
        }
      }

      // Translate to structured query
      const structured = await this.translator.translate(parsed);

      // Check cache if enabled
      if (this.config.enableCache) {
        const cached = await this.cache.get(nlQuery.text, structured);
        if (cached) {
          this.trackQueryExecution(nlQuery, parsed, cached.result, true, Date.now() - startTime);
          return cached.result;
        }
      }

      // Execute the query
      const executionResult = await this.executor.execute(structured);

      // Format the result
      const result = await this.formatter.format(
        executionResult,
        parsed.intent,
        nlQuery.context?.userPreferences,
      );

      // Cache the result
      if (this.config.enableCache && executionResult.success) {
        await this.cache.set(nlQuery.text, structured, result);
      }

      // Update context
      this.contextManager.updateContext(userId, sessionId, nlQuery, parsed, result);

      // Track query execution
      this.trackQueryExecution(nlQuery, parsed, result, false, Date.now() - startTime);

      // Save to history
      if (this.config.enableHistory) {
        await this.historyManager.save(
          userId,
          nlQuery,
          parsed,
          result,
          Date.now() - startTime,
        );
      }

      // Track in suggestions
      if (this.config.enableSuggestions) {
        this.suggestionEngine.trackQuery(nlQuery.text, userId);
      }

      return result;
    } catch (error) {
      console.error('Query execution failed:', error);

      const errorResult: QueryResult = {
        answer: `I encountered an error processing your query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sources: [],
        confidence: 0,
      };

      return errorResult;
    }
  }

  /**
   * Execute query with streaming response
   */
  async queryStream(
    nlQuery: NLQuery,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    try {
      onChunk({ type: 'parsing', message: 'Parsing your query...' });
      const parsed = await this.parser.parse(nlQuery);

      onChunk({ type: 'translating', message: 'Understanding your intent...' });
      const intentClassification = await this.intentClassifier.classify(parsed);
      parsed.intent = intentClassification.intent;
      parsed.intentConfidence = intentClassification.confidence;

      const userId = nlQuery.userId || 'anonymous';
      const sessionId = nlQuery.sessionId || this.generateSessionId();
      const conversationContext = this.contextManager.getContext(userId, sessionId);

      const queryContext = nlQuery.context || {
        previousQueries: conversationContext.history.map((h) => h.query.text),
        userPreferences: conversationContext.preferences,
        referencedEntities: conversationContext.entityMemory,
      };
      const entities = await this.entityExtractor.extract(parsed, queryContext);
      parsed.entities = entities;

      onChunk({ type: 'translating', message: 'Translating to structured query...' });
      const structured = await this.translator.translate(parsed);

      onChunk({ type: 'executing', message: 'Executing query...' });
      const executionResult = await this.executor.execute(structured);

      onChunk({ type: 'formatting', message: 'Formatting results...' });
      const result = await this.formatter.format(
        executionResult,
        parsed.intent,
        nlQuery.context?.userPreferences,
      );

      onChunk({ type: 'result', data: result, message: 'Query completed' });

      // Post-processing (same as regular query)
      this.contextManager.updateContext(userId, sessionId, nlQuery, parsed, result);
      this.trackQueryExecution(nlQuery, parsed, result, false, 0);

      if (this.config.enableHistory) {
        await this.historyManager.save(userId, nlQuery, parsed, result, 0);
      }
    } catch (error) {
      onChunk({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get query suggestions
   */
  async getSuggestions(partial: string, userId?: string): Promise<Suggestion[]> {
    if (!this.config.enableSuggestions) {
      return [];
    }

    return this.suggestionEngine.suggest(partial, userId);
  }

  /**
   * Get query history
   */
  async getHistory(userId: string, limit = 20, offset = 0): Promise<QueryHistoryEntry[]> {
    if (!this.config.enableHistory) {
      return [];
    }

    return this.historyManager.getHistory(userId, limit, offset);
  }

  /**
   * Submit feedback
   */
  async submitFeedback(feedback: Feedback): Promise<void> {
    const feedbackId = await this.feedbackCollector.collect(
      feedback.queryId,
      feedback.userId,
      feedback.rating,
      feedback.helpful,
      feedback.comment,
    );

    // Update analytics
    if (this.config.enableAnalytics) {
      await this.analytics.updateFeedback(feedback.queryId, feedback);
    }
  }

  /**
   * Get popular queries
   */
  async getPopularQueries(limit = 10): Promise<Array<{ query: string; count: number }>> {
    if (this.config.enableSuggestions) {
      const popular = this.suggestionEngine.getPopularQueries(limit);
      return popular.map((item) => ({ query: item.text, count: item.count }));
    }
    return [];
  }

  /**
   * Get analytics report
   */
  async getAnalyticsReport(timeRange?: { start: Date; end: Date }): Promise<AnalyticsReport> {
    if (!this.config.enableAnalytics) {
      throw new Error('Analytics is disabled');
    }

    return this.analytics.generateReport(timeRange);
  }

  /**
   * Get favorites
   */
  async getFavorites(userId: string, limit = 20): Promise<QueryHistoryEntry[]> {
    if (!this.config.enableHistory) {
      return [];
    }

    return this.historyManager.getFavorites(userId, limit);
  }

  /**
   * Add favorite
   */
  async addFavorite(userId: string, queryId: string): Promise<boolean> {
    if (!this.config.enableHistory) {
      return false;
    }

    return this.historyManager.addFavorite(userId, queryId);
  }

  /**
   * Remove favorite
   */
  async removeFavorite(userId: string, queryId: string): Promise<boolean> {
    if (!this.config.enableHistory) {
      return false;
    }

    return this.historyManager.removeFavorite(userId, queryId);
  }

  /**
   * Track query execution for analytics
   */
  private trackQueryExecution(
    nlQuery: NLQuery,
    parsed: ParsedQuery,
    result: QueryResult,
    cached: boolean,
    executionTime: number,
  ): void {
    if (!this.config.enableAnalytics) return;

    this.analytics.track({
      userId: nlQuery.userId || 'anonymous',
      queryText: nlQuery.text,
      intent: parsed.intent,
      success: result.confidence > 0.5,
      executionTime,
      resultCount: Array.isArray(result.data) ? result.data.length : 0,
      confidence: result.confidence,
      cached,
    });
  }

  /**
   * Create clarification result
   */
  private createClarificationResult(clarification: ClarificationRequest): QueryResult {
    return {
      answer: clarification.question,
      sources: [],
      confidence: 0.5,
      clarificationNeeded: true,
      clarificationQuestion: clarification.question,
      clarificationOptions: clarification.options,
    };
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    cache: ReturnType<QueryCache['getStats']>;
    activeSessions: number;
    totalQueries: number;
  }> {
    const cacheStats = this.cache.getStats();
    const activeSessions = this.contextManager.getActiveSessionsCount();

    return {
      cache: cacheStats,
      activeSessions,
      totalQueries: cacheStats.size,
    };
  }
}

// Re-export types and components
export * from './types';
export { QueryParser } from './parser';
export { IntentClassifier } from './intent';
export { EntityExtractor } from './entity';
export { QueryTranslator } from './translator';
export { QueryExecutor } from './executor';
export { ResultFormatter } from './formatter';
export { ContextManager } from './context';
export { ClarificationEngine } from './clarification';
export { SuggestionEngine } from './suggestions';
export { HistoryManager } from './history';
export { QueryCache } from './caching';
export { QueryAnalytics } from './analytics';
export { FeedbackCollector } from './feedback';
export { createNLQAPI } from './api';

// Default export
export default NLQueryService;
