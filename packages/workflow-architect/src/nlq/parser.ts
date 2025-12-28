/**
 * Natural Language Query Parser
 * Handles tokenization, normalization, and basic parsing of NL queries
 */

import type { ParsedQuery, NLQuery, Entity, QueryFilter } from './types';
import { Intent, EntityType } from './types';

/**
 * Stop words to filter out during tokenization
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
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
  'should',
  'could',
  'may',
  'might',
  'can',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'to',
  'from',
  'up',
  'down',
  'in',
  'out',
  'on',
  'off',
  'over',
  'under',
]);

/**
 * Common typo corrections
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  worklow: 'workflow',
  workflo: 'workflow',
  worflow: 'workflow',
  exection: 'execution',
  excution: 'execution',
  executon: 'execution',
  retreive: 'retrieve',
  retrive: 'retrieve',
  seach: 'search',
  serch: 'search',
  wich: 'which',
  whch: 'which',
  recieve: 'receive',
  recive: 'receive',
};

/**
 * Synonym mapping for query expansion
 */
const SYNONYMS: Record<string, string[]> = {
  workflow: ['flow', 'automation', 'process'],
  node: ['step', 'action', 'task'],
  execution: ['run', 'trigger', 'invocation'],
  failed: ['error', 'unsuccessful', 'broken'],
  successful: ['completed', 'finished', 'done'],
  recent: ['latest', 'newest', 'current'],
  old: ['oldest', 'previous', 'past'],
};

/**
 * Query parser configuration
 */
export interface QueryParserConfig {
  correctTypos?: boolean;
  expandSynonyms?: boolean;
  removeStopWords?: boolean;
  caseSensitive?: boolean;
  minTokenLength?: number;
}

/**
 * QueryParser handles the initial parsing and normalization of natural language queries
 */
export class QueryParser {
  private config: Required<QueryParserConfig>;

  constructor(config: QueryParserConfig = {}) {
    this.config = {
      correctTypos: config.correctTypos ?? true,
      expandSynonyms: config.expandSynonyms ?? false,
      removeStopWords: config.removeStopWords ?? false,
      caseSensitive: config.caseSensitive ?? false,
      minTokenLength: config.minTokenLength ?? 1,
    };
  }

  /**
   * Parse a natural language query into structured components
   */
  async parse(query: NLQuery): Promise<ParsedQuery> {
    const startTime = Date.now();

    // Normalize the query text
    const normalizedText = this.normalize(query.text);

    // Tokenize
    const tokens = this.tokenize(normalizedText);

    // Apply corrections and expansions
    const processedTokens = this.processTokens(tokens);

    // Initial intent detection (will be refined by IntentClassifier)
    const { intent, confidence } = this.detectBasicIntent(normalizedText, processedTokens);

    // Extract basic entities (will be refined by EntityExtractor)
    const entities = await this.extractBasicEntities(normalizedText);

    // Extract filters
    const filters = this.extractFilters(normalizedText);

    const parseTime = Date.now() - startTime;
    console.debug(`Query parsed in ${parseTime}ms`);

    return {
      originalText: query.text,
      normalizedText,
      tokens: processedTokens,
      intent,
      intentConfidence: confidence,
      entities,
      filters,
    };
  }

  /**
   * Normalize query text
   */
  private normalize(text: string): string {
    let normalized = text.trim();

    // Convert to lowercase unless case sensitive
    if (!this.config.caseSensitive) {
      normalized = normalized.toLowerCase();
    }

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Remove special characters but keep alphanumeric, spaces, and basic punctuation
    normalized = normalized.replace(/[^\w\s.,?!-]/g, '');

    return normalized;
  }

  /**
   * Tokenize normalized text
   */
  private tokenize(text: string): string[] {
    // Split on whitespace and punctuation
    const tokens = text.split(/[\s,.?!-]+/).filter((token) => token.length >= this.config.minTokenLength);

    return tokens;
  }

  /**
   * Process tokens: correct typos, expand synonyms, remove stop words
   */
  private processTokens(tokens: string[]): string[] {
    let processed = tokens;

    // Correct typos
    if (this.config.correctTypos) {
      processed = processed.map((token) => TYPO_CORRECTIONS[token] || token);
    }

    // Remove stop words
    if (this.config.removeStopWords) {
      processed = processed.filter((token) => !STOP_WORDS.has(token));
    }

    // Expand synonyms (optional, may be better handled elsewhere)
    if (this.config.expandSynonyms) {
      const expanded: string[] = [];
      for (const token of processed) {
        expanded.push(token);
        const syns = SYNONYMS[token];
        if (syns) {
          expanded.push(...syns);
        }
      }
      processed = expanded;
    }

    return processed;
  }

  /**
   * Detect basic intent from query patterns
   * This is a simple rule-based approach that will be refined by ML-based IntentClassifier
   */
  private detectBasicIntent(text: string, tokens: string[]): { intent: Intent; confidence: number } {
    const lowerText = text.toLowerCase();

    // Search patterns
    if (
      lowerText.includes('find') ||
      lowerText.includes('search') ||
      lowerText.includes('show') ||
      lowerText.includes('get') ||
      lowerText.includes('list')
    ) {
      return { intent: Intent.SEARCH, confidence: 0.7 };
    }

    // Aggregate patterns
    if (
      lowerText.includes('count') ||
      lowerText.includes('how many') ||
      lowerText.includes('total') ||
      lowerText.includes('sum') ||
      lowerText.includes('average')
    ) {
      return { intent: Intent.AGGREGATE, confidence: 0.7 };
    }

    // Compare patterns
    if (lowerText.includes('compare') || lowerText.includes('difference') || lowerText.includes('versus')) {
      return { intent: Intent.COMPARE, confidence: 0.7 };
    }

    // Explain patterns
    if (
      lowerText.includes('explain') ||
      lowerText.includes('why') ||
      lowerText.includes('how does') ||
      lowerText.includes('what is')
    ) {
      return { intent: Intent.EXPLAIN, confidence: 0.7 };
    }

    // Create patterns
    if (lowerText.includes('create') || lowerText.includes('make') || lowerText.includes('build')) {
      return { intent: Intent.CREATE, confidence: 0.7 };
    }

    // Update patterns
    if (lowerText.includes('update') || lowerText.includes('modify') || lowerText.includes('change')) {
      return { intent: Intent.UPDATE, confidence: 0.7 };
    }

    // Delete patterns
    if (lowerText.includes('delete') || lowerText.includes('remove') || lowerText.includes('drop')) {
      return { intent: Intent.DELETE, confidence: 0.7 };
    }

    // List patterns
    if (lowerText.includes('list all') || lowerText.includes('show all')) {
      return { intent: Intent.LIST, confidence: 0.7 };
    }

    // Analyze patterns
    if (lowerText.includes('analyze') || lowerText.includes('analyze') || lowerText.includes('report')) {
      return { intent: Intent.ANALYZE, confidence: 0.7 };
    }

    // Default to search with low confidence
    return { intent: Intent.SEARCH, confidence: 0.3 };
  }

  /**
   * Extract basic entities (will be refined by EntityExtractor)
   */
  private async extractBasicEntities(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Simple pattern matching for dates
    const datePatterns = [
      /\b(today|yesterday|tomorrow)\b/gi,
      /\b(last|past|previous)\s+(week|month|year|day)\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    for (const pattern of datePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          entities.push({
            type: EntityType.DATE,
            value: match[0],
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            confidence: 0.8,
          });
        }
      }
    }

    // Simple pattern matching for numbers
    const numberPattern = /\b\d+\b/g;
    const numberMatches = text.matchAll(numberPattern);
    for (const match of numberMatches) {
      if (match.index !== undefined) {
        entities.push({
          type: EntityType.NUMBER,
          value: match[0],
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
          confidence: 0.9,
          normalized: parseInt(match[0], 10),
        });
      }
    }

    return entities;
  }

  /**
   * Extract basic filters from query
   */
  private extractFilters(text: string): QueryFilter[] {
    const filters: QueryFilter[] = [];
    const lowerText = text.toLowerCase();

    // Status filters
    if (lowerText.includes('active')) {
      filters.push({ field: 'active', operator: 'eq', value: 'true' });
    }
    if (lowerText.includes('inactive')) {
      filters.push({ field: 'active', operator: 'eq', value: 'false' });
    }
    if (lowerText.includes('failed')) {
      filters.push({ field: 'status', operator: 'eq', value: 'error' });
    }
    if (lowerText.includes('successful') || lowerText.includes('completed')) {
      filters.push({ field: 'status', operator: 'eq', value: 'success' });
    }

    // Category filters
    const categoryMatch = lowerText.match(/category\s+(is|equals?)\s+([a-z-]+)/);
    if (categoryMatch) {
      filters.push({ field: 'category', operator: 'eq', value: categoryMatch[2] });
    }

    return filters;
  }

  /**
   * Check if query contains multi-language content
   */
  async detectLanguage(text: string): Promise<string> {
    // Simple heuristic: check for non-ASCII characters
    const hasNonAscii = /[^\x00-\x7F]/.test(text);
    if (!hasNonAscii) {
      return 'en';
    }

    // In production, use a proper language detection library
    // For now, return 'unknown'
    return 'unknown';
  }
}
