/**
 * Clarification Engine
 * Detects ambiguities and generates clarifying questions
 */

import type { ParsedQuery, QueryAmbiguity } from './types';
import { Intent, EntityType } from './types';

/**
 * Clarification strategy
 */
export type ClarificationStrategy = 'multiple_choice' | 'yes_no' | 'open_ended' | 'suggestion';

/**
 * Clarification request
 */
export interface ClarificationRequest {
  ambiguity: QueryAmbiguity;
  question: string;
  strategy: ClarificationStrategy;
  options?: string[];
  suggestedAnswer?: string;
}

/**
 * Clarification engine configuration
 */
export interface ClarificationEngineConfig {
  confidenceThreshold?: number;
  maxOptions?: number;
  enableAutoSuggestions?: boolean;
}

/**
 * ClarificationEngine detects ambiguities and generates clarifying questions
 */
export class ClarificationEngine {
  private config: Required<ClarificationEngineConfig>;

  constructor(config: ClarificationEngineConfig = {}) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.6,
      maxOptions: config.maxOptions ?? 5,
      enableAutoSuggestions: config.enableAutoSuggestions ?? true,
    };
  }

  /**
   * Check if query needs clarification
   */
  needsClarification(query: ParsedQuery): boolean {
    const ambiguities = this.detectAmbiguities(query);
    return ambiguities.length > 0;
  }

  /**
   * Generate clarifying question
   */
  generateQuestion(query: ParsedQuery): ClarificationRequest | null {
    const ambiguities = this.detectAmbiguities(query);

    if (ambiguities.length === 0) {
      return null;
    }

    // Handle the first ambiguity
    const ambiguity = ambiguities[0];

    return this.createClarificationRequest(ambiguity);
  }

  /**
   * Generate multiple clarifying questions
   */
  generateQuestions(query: ParsedQuery, maxQuestions = 3): ClarificationRequest[] {
    const ambiguities = this.detectAmbiguities(query);
    return ambiguities
      .slice(0, maxQuestions)
      .map((ambiguity) => this.createClarificationRequest(ambiguity))
      .filter((req): req is ClarificationRequest => req !== null);
  }

  /**
   * Detect ambiguities in query
   */
  private detectAmbiguities(query: ParsedQuery): QueryAmbiguity[] {
    const ambiguities: QueryAmbiguity[] = [];

    // Check for low intent confidence
    if (query.intentConfidence < this.config.confidenceThreshold) {
      ambiguities.push({
        type: 'intent',
        description: 'Unclear what action you want to perform',
        options: this.suggestIntentOptions(query),
        confidence: 1 - query.intentConfidence,
      });
    }

    // Check for ambiguous entities
    const entityAmbiguities = this.detectEntityAmbiguities(query);
    ambiguities.push(...entityAmbiguities);

    // Check for missing required entities
    const missingEntities = this.detectMissingEntities(query);
    ambiguities.push(...missingEntities);

    // Check for ambiguous references
    const referenceAmbiguities = this.detectReferenceAmbiguities(query);
    ambiguities.push(...referenceAmbiguities);

    // Check for scope ambiguities
    const scopeAmbiguities = this.detectScopeAmbiguities(query);
    ambiguities.push(...scopeAmbiguities);

    return ambiguities;
  }

  /**
   * Detect entity ambiguities
   */
  private detectEntityAmbiguities(query: ParsedQuery): QueryAmbiguity[] {
    const ambiguities: QueryAmbiguity[] = [];

    // Check for low-confidence entities
    for (const entity of query.entities) {
      if (entity.confidence < this.config.confidenceThreshold) {
        ambiguities.push({
          type: 'entity',
          description: `Unclear ${entity.type}: "${entity.value}"`,
          options: [entity.value, 'Something else'],
          confidence: 1 - entity.confidence,
        });
      }
    }

    // Check for multiple entities of the same type
    const entityTypes = new Map<EntityType, number>();
    for (const entity of query.entities) {
      entityTypes.set(entity.type, (entityTypes.get(entity.type) || 0) + 1);
    }

    for (const [type, count] of entityTypes.entries()) {
      if (count > 1 && type !== EntityType.TAG) {
        ambiguities.push({
          type: 'entity',
          description: `Multiple ${type}s mentioned`,
          options: query.entities
            .filter((e) => e.type === type)
            .map((e) => e.value)
            .slice(0, this.config.maxOptions),
          confidence: 0.7,
        });
      }
    }

    return ambiguities;
  }

  /**
   * Detect missing required entities
   */
  private detectMissingEntities(query: ParsedQuery): QueryAmbiguity[] {
    const ambiguities: QueryAmbiguity[] = [];

    // Check based on intent
    switch (query.intent) {
      case Intent.UPDATE:
      case Intent.DELETE:
        // These require a specific workflow or entity reference
        if (!query.entities.some((e) => e.type === EntityType.WORKFLOW)) {
          ambiguities.push({
            type: 'entity',
            description: 'Which workflow do you want to modify?',
            options: [],
            confidence: 0.9,
          });
        }
        break;

      case Intent.COMPARE:
        // Requires at least 2 entities
        if (query.entities.length < 2) {
          ambiguities.push({
            type: 'entity',
            description: 'What do you want to compare?',
            options: [],
            confidence: 0.8,
          });
        }
        break;
    }

    return ambiguities;
  }

  /**
   * Detect reference ambiguities
   */
  private detectReferenceAmbiguities(query: ParsedQuery): QueryAmbiguity[] {
    const ambiguities: QueryAmbiguity[] = [];

    // Check for pronouns without clear antecedent
    const pronouns = ['it', 'that', 'this', 'those', 'these', 'them'];
    const lowerText = query.normalizedText.toLowerCase();

    for (const pronoun of pronouns) {
      if (lowerText.includes(pronoun) && query.entities.length === 0) {
        ambiguities.push({
          type: 'reference',
          description: `What does "${pronoun}" refer to?`,
          options: [],
          confidence: 0.8,
        });
      }
    }

    return ambiguities;
  }

  /**
   * Detect scope ambiguities
   */
  private detectScopeAmbiguities(query: ParsedQuery): QueryAmbiguity[] {
    const ambiguities: QueryAmbiguity[] = [];

    // Check for unclear time scope
    if (
      (query.intent === Intent.SEARCH || query.intent === Intent.LIST) &&
      !query.timeRange &&
      !query.filters.some((f) => f.field === 'createdAt' || f.field === 'updatedAt')
    ) {
      // This is actually okay - don't need to ask about time range unless it's unclear
      // Only ask if query mentions time but we couldn't parse it
      if (
        query.normalizedText.includes('recent') ||
        query.normalizedText.includes('old') ||
        query.normalizedText.includes('new')
      ) {
        ambiguities.push({
          type: 'scope',
          description: 'What time period are you interested in?',
          options: ['Last 7 days', 'Last 30 days', 'Last year', 'All time'],
          confidence: 0.6,
        });
      }
    }

    return ambiguities;
  }

  /**
   * Suggest intent options
   */
  private suggestIntentOptions(query: ParsedQuery): string[] {
    // Based on query keywords, suggest likely intents
    const options: string[] = [];

    if (query.normalizedText.includes('find') || query.normalizedText.includes('show')) {
      options.push('Search for workflows');
    }

    if (query.normalizedText.includes('how many') || query.normalizedText.includes('count')) {
      options.push('Count workflows');
    }

    if (query.normalizedText.includes('create') || query.normalizedText.includes('make')) {
      options.push('Create a new workflow');
    }

    if (query.normalizedText.includes('explain') || query.normalizedText.includes('what')) {
      options.push('Get explanation');
    }

    // Default options
    if (options.length === 0) {
      options.push('Search', 'List all', 'Get statistics');
    }

    return options.slice(0, this.config.maxOptions);
  }

  /**
   * Create clarification request from ambiguity
   */
  private createClarificationRequest(ambiguity: QueryAmbiguity): ClarificationRequest {
    let strategy: ClarificationStrategy;
    let question: string;
    let options: string[] | undefined;
    let suggestedAnswer: string | undefined;

    switch (ambiguity.type) {
      case 'intent':
        strategy = 'multiple_choice';
        question = 'What would you like to do?';
        options = ambiguity.options;
        break;

      case 'entity':
        if (ambiguity.options.length > 0) {
          strategy = 'multiple_choice';
          question = `${ambiguity.description}. Please choose:`;
          options = ambiguity.options;
        } else {
          strategy = 'open_ended';
          question = ambiguity.description;
        }
        break;

      case 'reference':
        strategy = 'open_ended';
        question = ambiguity.description;
        break;

      case 'scope':
        strategy = 'multiple_choice';
        question = ambiguity.description;
        options = ambiguity.options;
        if (this.config.enableAutoSuggestions && options && options.length > 0) {
          suggestedAnswer = options[0];
        }
        break;

      default:
        strategy = 'open_ended';
        question = ambiguity.description;
    }

    return {
      ambiguity,
      question,
      strategy,
      options,
      suggestedAnswer,
    };
  }

  /**
   * Process clarification response
   */
  processClarificationResponse(
    request: ClarificationRequest,
    response: string,
  ): Partial<ParsedQuery> {
    const updates: Partial<ParsedQuery> = {};

    switch (request.ambiguity.type) {
      case 'intent':
        // Map response to intent
        const intentMap: Record<string, Intent> = {
          search: Intent.SEARCH,
          'search for workflows': Intent.SEARCH,
          'list all': Intent.LIST,
          'count workflows': Intent.COUNT,
          'get statistics': Intent.AGGREGATE,
          'create a new workflow': Intent.CREATE,
          'get explanation': Intent.EXPLAIN,
        };
        const intent = intentMap[response.toLowerCase()];
        if (intent) {
          updates.intent = intent;
          updates.intentConfidence = 0.9;
        }
        break;

      case 'entity':
        // Add or update entity
        // This would be handled by the caller
        break;

      case 'scope':
        // Update time range based on response
        // This would be handled by the caller
        break;
    }

    return updates;
  }

  /**
   * Generate disambiguation options
   */
  generateDisambiguationOptions(query: ParsedQuery, maxOptions = 5): string[] {
    const options: string[] = [];

    // Generate options based on query
    if (query.entities.length > 0) {
      const entity = query.entities[0];
      options.push(`Search for ${entity.value}`);
      options.push(`Get details about ${entity.value}`);
    }

    return options.slice(0, maxOptions);
  }
}
