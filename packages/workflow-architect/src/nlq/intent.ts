/**
 * Intent Classification
 * Multi-label intent classification with confidence scoring
 */

import type { ParsedQuery } from './types';
import { Intent } from './types';

/**
 * Intent pattern for rule-based classification
 */
interface IntentPattern {
  intent: Intent;
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

/**
 * Classification result with confidence
 */
export interface IntentClassification {
  intent: Intent;
  confidence: number;
  alternatives?: Array<{ intent: Intent; confidence: number }>;
}

/**
 * Intent patterns for rule-based classification
 */
const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: Intent.SEARCH,
    keywords: ['find', 'search', 'get', 'show', 'display', 'retrieve', 'lookup'],
    patterns: [
      /^(find|search|show|get|display)\s+/i,
      /\b(find|search)\s+(me\s+)?(?:the\s+)?/i,
      /^what\s+(?:are|is)\s+(?:the\s+)?/i,
    ],
    weight: 1.0,
  },
  {
    intent: Intent.AGGREGATE,
    keywords: ['count', 'total', 'sum', 'average', 'avg', 'min', 'max', 'how many'],
    patterns: [
      /^(count|how\s+many)/i,
      /\b(total|sum|average|avg)\s+(?:of\s+)?/i,
      /^what\s+is\s+the\s+(total|count|average|sum)/i,
    ],
    weight: 1.0,
  },
  {
    intent: Intent.COMPARE,
    keywords: ['compare', 'difference', 'versus', 'vs', 'between'],
    patterns: [/^compare\s+/i, /\bversus\b|\bvs\b/i, /\bdifference\s+between\b/i],
    weight: 1.0,
  },
  {
    intent: Intent.EXPLAIN,
    keywords: ['explain', 'why', 'how', 'what is', 'what does', 'describe'],
    patterns: [
      /^(explain|describe|why|how)/i,
      /^what\s+(is|does|are)\s+/i,
      /\bhow\s+does\b/i,
      /\bwhy\s+(is|are|did|does)\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: Intent.CREATE,
    keywords: ['create', 'make', 'build', 'generate', 'add', 'new'],
    patterns: [/^(create|make|build|generate)\s+/i, /^add\s+(a\s+)?new\s+/i],
    weight: 1.0,
  },
  {
    intent: Intent.UPDATE,
    keywords: ['update', 'modify', 'change', 'edit', 'set'],
    patterns: [/^(update|modify|change|edit)\s+/i, /^set\s+\w+\s+to\s+/i],
    weight: 1.0,
  },
  {
    intent: Intent.DELETE,
    keywords: ['delete', 'remove', 'drop', 'clear'],
    patterns: [/^(delete|remove|drop|clear)\s+/i],
    weight: 1.0,
  },
  {
    intent: Intent.LIST,
    keywords: ['list', 'show all', 'list all', 'enumerate'],
    patterns: [/^list\s+(all\s+)?/i, /^show\s+all\s+/i, /^enumerate\s+/i],
    weight: 1.0,
  },
  {
    intent: Intent.COUNT,
    keywords: ['count', 'how many', 'number of'],
    patterns: [/^(count|how\s+many)/i, /\bnumber\s+of\b/i],
    weight: 1.0,
  },
  {
    intent: Intent.ANALYZE,
    keywords: ['analyze', 'report', 'statistics', 'stats', 'insights'],
    patterns: [/^(analyze|report|statistics)\s+/i, /\binsights\s+(on|about)\b/i],
    weight: 1.0,
  },
];

/**
 * Intent classifier configuration
 */
export interface IntentClassifierConfig {
  confidenceThreshold?: number;
  maxAlternatives?: number;
  useMLModel?: boolean;
}

/**
 * IntentClassifier determines the user's intent from a parsed query
 */
export class IntentClassifier {
  private config: Required<IntentClassifierConfig>;

  constructor(config: IntentClassifierConfig = {}) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      maxAlternatives: config.maxAlternatives ?? 3,
      useMLModel: config.useMLModel ?? false,
    };
  }

  /**
   * Classify the intent of a parsed query
   */
  async classify(query: ParsedQuery): Promise<IntentClassification> {
    // If using ML model (future enhancement)
    if (this.config.useMLModel) {
      return this.classifyWithML(query);
    }

    // Use rule-based classification
    return this.classifyWithRules(query);
  }

  /**
   * Rule-based intent classification
   */
  private classifyWithRules(query: ParsedQuery): IntentClassification {
    const scores = new Map<Intent, number>();

    // Initialize scores
    for (const intent of Object.values(Intent)) {
      scores.set(intent, 0);
    }

    // Score based on patterns
    for (const pattern of INTENT_PATTERNS) {
      let score = 0;

      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(query.normalizedText)) {
          score += pattern.weight * 0.6;
        }
      }

      // Check keyword presence
      const keywordMatches = pattern.keywords.filter((keyword) =>
        query.normalizedText.includes(keyword.toLowerCase()),
      );
      score += (keywordMatches.length / pattern.keywords.length) * pattern.weight * 0.4;

      // Update score
      const currentScore = scores.get(pattern.intent) || 0;
      scores.set(pattern.intent, currentScore + score);
    }

    // Use basic intent from parser if available
    if (query.intent && query.intentConfidence > 0.5) {
      const currentScore = scores.get(query.intent) || 0;
      scores.set(query.intent, currentScore + query.intentConfidence);
    }

    // Sort by score
    const sortedIntents = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([intent, score]) => ({ intent, confidence: this.normalizeScore(score) }));

    // Get primary intent and alternatives
    const primary = sortedIntents[0];
    const alternatives = sortedIntents
      .slice(1, this.config.maxAlternatives + 1)
      .filter((item) => item.confidence >= this.config.confidenceThreshold);

    // Apply fallback if confidence is too low
    if (primary.confidence < this.config.confidenceThreshold) {
      return this.getFallbackIntent(query);
    }

    return {
      intent: primary.intent,
      confidence: primary.confidence,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * ML-based intent classification (future enhancement)
   */
  private async classifyWithML(query: ParsedQuery): Promise<IntentClassification> {
    // TODO: Implement ML-based classification
    // For now, fall back to rule-based
    console.warn('ML-based classification not yet implemented, falling back to rules');
    return this.classifyWithRules(query);
  }

  /**
   * Normalize score to 0-1 range
   */
  private normalizeScore(score: number): number {
    // Simple normalization using sigmoid function
    return 1 / (1 + Math.exp(-score));
  }

  /**
   * Get fallback intent when confidence is low
   */
  private getFallbackIntent(query: ParsedQuery): IntentClassification {
    // Check if query is a question
    if (query.normalizedText.includes('?') || query.normalizedText.startsWith('what')) {
      return {
        intent: Intent.EXPLAIN,
        confidence: 0.4,
      };
    }

    // Default to search
    return {
      intent: Intent.SEARCH,
      confidence: 0.3,
    };
  }

  /**
   * Detect if query has multiple intents
   */
  async detectMultiIntent(query: ParsedQuery): Promise<Intent[]> {
    const classification = await this.classify(query);
    const intents = [classification.intent];

    if (classification.alternatives) {
      // Add alternatives that are close in confidence
      const primaryConfidence = classification.confidence;
      for (const alt of classification.alternatives) {
        if (alt.confidence >= primaryConfidence * 0.8) {
          intents.push(alt.intent);
        }
      }
    }

    return intents;
  }

  /**
   * Get confidence threshold for a specific intent
   */
  getThresholdForIntent(intent: Intent): number {
    // Different intents may have different confidence thresholds
    const thresholds: Partial<Record<Intent, number>> = {
      [Intent.DELETE]: 0.8, // Higher threshold for destructive operations
      [Intent.UPDATE]: 0.7,
      [Intent.CREATE]: 0.6,
      [Intent.SEARCH]: 0.4, // Lower threshold for searches
    };

    return thresholds[intent] ?? this.config.confidenceThreshold;
  }

  /**
   * Validate if intent is appropriate for query context
   */
  validateIntent(intent: Intent, query: ParsedQuery): boolean {
    // Validate based on query structure and entities

    // DELETE requires specific entity references
    if (intent === Intent.DELETE && query.entities.length === 0) {
      return false;
    }

    // COMPARE requires at least 2 entities or time ranges
    if (intent === Intent.COMPARE && query.entities.length < 2 && !query.timeRange) {
      return false;
    }

    return true;
  }
}
