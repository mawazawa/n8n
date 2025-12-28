/**
 * Entity Extraction
 * Extracts and classifies entities from natural language queries
 */

import type { ParsedQuery, Entity, QueryContext } from './types';
import { EntityType } from './types';

/**
 * Entity pattern for rule-based extraction
 */
interface EntityPattern {
  type: EntityType;
  patterns: RegExp[];
  normalizer?: (value: string) => string | number | Date;
}

/**
 * Coreference for entity resolution
 */
interface CoreferenceLink {
  mention: string;
  referent: Entity;
  distance: number;
}

/**
 * Entity patterns for rule-based extraction
 */
const ENTITY_PATTERNS: EntityPattern[] = [
  {
    type: EntityType.DATE,
    patterns: [
      /\b(today|yesterday|tomorrow)\b/gi,
      /\b(this|last|next)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}\b/gi,
    ],
    normalizer: (value: string): Date => {
      const lower = value.toLowerCase();
      const now = new Date();

      // Handle relative dates
      if (lower === 'today') return now;
      if (lower === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      }
      if (lower === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }

      // Try parsing as date
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? now : parsed;
    },
  },
  {
    type: EntityType.NUMBER,
    patterns: [/\b\d+(?:\.\d+)?\b/g],
    normalizer: (value: string): number => parseFloat(value),
  },
  {
    type: EntityType.STATUS,
    patterns: [
      /\b(active|inactive|running|stopped|paused)\b/gi,
      /\b(success|successful|failed|error|warning)\b/gi,
      /\b(completed|pending|in-progress|cancelled)\b/gi,
    ],
    normalizer: (value: string): string => value.toLowerCase(),
  },
  {
    type: EntityType.CATEGORY,
    patterns: [
      /\bcategory\s+(?:is\s+)?["']?([a-z-]+)["']?/gi,
      /\b(ai-agent|rag-pipeline|data-pipeline|integration|automation|monitoring|approval-flow|error-handling|batch-processing)\b/gi,
    ],
    normalizer: (value: string): string => value.toLowerCase(),
  },
  {
    type: EntityType.WORKFLOW,
    patterns: [
      /\bworkflow\s+(?:named\s+)?["']([^"']+)["']/gi,
      /\bflow\s+(?:named\s+)?["']([^"']+)["']/gi,
    ],
  },
  {
    type: EntityType.NODE,
    patterns: [/\bnode\s+(?:named\s+)?["']([^"']+)["']/gi, /\bstep\s+(?:named\s+)?["']([^"']+)["']/gi],
  },
  {
    type: EntityType.TAG,
    patterns: [/\btag(?:ged)?\s+(?:with\s+)?["']?([a-z0-9-]+)["']?/gi, /\b#([a-z0-9-]+)\b/gi],
  },
  {
    type: EntityType.METRIC,
    patterns: [
      /\b(execution\s+time|duration|latency|throughput|success\s+rate|error\s+rate)\b/gi,
      /\b(cpu|memory|disk)\s+usage\b/gi,
    ],
  },
];

/**
 * Entity extractor configuration
 */
export interface EntityExtractorConfig {
  enableCoreference?: boolean;
  confidenceThreshold?: number;
  maxEntityDistance?: number;
}

/**
 * EntityExtractor identifies and extracts entities from queries
 */
export class EntityExtractor {
  private config: Required<EntityExtractorConfig>;
  private knownWorkflows: Map<string, string>; // lowercase name -> id
  private knownNodes: Map<string, string>; // lowercase name -> id

  constructor(config: EntityExtractorConfig = {}) {
    this.config = {
      enableCoreference: config.enableCoreference ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 0.6,
      maxEntityDistance: config.maxEntityDistance ?? 50,
    };

    this.knownWorkflows = new Map();
    this.knownNodes = new Map();
  }

  /**
   * Extract entities from a parsed query
   */
  async extract(query: ParsedQuery, context?: QueryContext): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Extract using pattern matching
    const patternEntities = this.extractWithPatterns(query.normalizedText);
    entities.push(...patternEntities);

    // Extract workflow and node names from known entities
    const knownEntities = await this.extractKnownEntities(query.normalizedText);
    entities.push(...knownEntities);

    // Resolve coreferences if enabled
    if (this.config.enableCoreference && context) {
      const resolvedEntities = this.resolveCoreferences(entities, context);
      entities.push(...resolvedEntities);
    }

    // Deduplicate entities
    const deduped = this.deduplicateEntities(entities);

    // Filter by confidence
    return deduped.filter((entity) => entity.confidence >= this.config.confidenceThreshold);
  }

  /**
   * Extract entities using regex patterns
   */
  private extractWithPatterns(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of ENTITY_PATTERNS) {
      for (const regex of pattern.patterns) {
        const matches = text.matchAll(regex);
        for (const match of matches) {
          if (match.index === undefined) continue;

          const value = match[1] || match[0];
          const normalized = pattern.normalizer ? pattern.normalizer(value) : undefined;

          entities.push({
            type: pattern.type,
            value,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            confidence: 0.8,
            normalized,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract known workflow and node names
   */
  private async extractKnownEntities(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Search for known workflows
    for (const [name, id] of this.knownWorkflows.entries()) {
      const index = text.toLowerCase().indexOf(name);
      if (index !== -1) {
        entities.push({
          type: EntityType.WORKFLOW,
          value: name,
          position: {
            start: index,
            end: index + name.length,
          },
          confidence: 0.9,
          normalized: id,
        });
      }
    }

    // Search for known nodes
    for (const [name, id] of this.knownNodes.entries()) {
      const index = text.toLowerCase().indexOf(name);
      if (index !== -1) {
        entities.push({
          type: EntityType.NODE,
          value: name,
          position: {
            start: index,
            end: index + name.length,
          },
          confidence: 0.9,
          normalized: id,
        });
      }
    }

    return entities;
  }

  /**
   * Resolve coreferences (e.g., "it", "that workflow")
   */
  private resolveCoreferences(entities: Entity[], context: QueryContext): Entity[] {
    const resolved: Entity[] = [];

    // Common coreference patterns
    const coreferencePatterns = [
      /\b(it|its|that|this|those|these)\b/gi,
      /\bthe\s+(?:same\s+)?(workflow|node|execution)\b/gi,
    ];

    // Look for coreferences in the query
    for (const pattern of coreferencePatterns) {
      // If we find a coreference, link it to the most recent entity of the same type
      if (context.referencedEntities && context.referencedEntities.size > 0) {
        // Get most recent entity from context
        const recentEntities = Array.from(context.referencedEntities.values());
        if (recentEntities.length > 0) {
          const mostRecent = recentEntities[recentEntities.length - 1];
          resolved.push({
            ...mostRecent,
            confidence: mostRecent.confidence * 0.7, // Lower confidence for coreference
          });
        }
      }
    }

    return resolved;
  }

  /**
   * Deduplicate overlapping entities
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    // Sort by position
    const sorted = entities.sort((a, b) => a.position.start - b.position.start);

    const deduped: Entity[] = [];
    let lastEnd = -1;

    for (const entity of sorted) {
      // Skip if overlaps with previous entity
      if (entity.position.start < lastEnd) {
        // Keep entity with higher confidence
        const prev = deduped[deduped.length - 1];
        if (entity.confidence > prev.confidence) {
          deduped.pop();
          deduped.push(entity);
          lastEnd = entity.position.end;
        }
        continue;
      }

      deduped.push(entity);
      lastEnd = entity.position.end;
    }

    return deduped;
  }

  /**
   * Update known workflows for better entity recognition
   */
  updateKnownWorkflows(workflows: Array<{ id: string; name: string }>): void {
    this.knownWorkflows.clear();
    for (const workflow of workflows) {
      this.knownWorkflows.set(workflow.name.toLowerCase(), workflow.id);
    }
  }

  /**
   * Update known nodes for better entity recognition
   */
  updateKnownNodes(nodes: Array<{ id: string; name: string }>): void {
    this.knownNodes.clear();
    for (const node of nodes) {
      this.knownNodes.set(node.name.toLowerCase(), node.id);
    }
  }

  /**
   * Extract entity of specific type
   */
  async extractByType(query: ParsedQuery, type: EntityType): Promise<Entity[]> {
    const allEntities = await this.extract(query);
    return allEntities.filter((entity) => entity.type === type);
  }

  /**
   * Validate extracted entity
   */
  validateEntity(entity: Entity): boolean {
    // Check confidence threshold
    if (entity.confidence < this.config.confidenceThreshold) {
      return false;
    }

    // Type-specific validation
    switch (entity.type) {
      case EntityType.DATE:
        if (entity.normalized && entity.normalized instanceof Date) {
          return !isNaN(entity.normalized.getTime());
        }
        return false;

      case EntityType.NUMBER:
        if (typeof entity.normalized === 'number') {
          return !isNaN(entity.normalized);
        }
        return false;

      default:
        return true;
    }
  }
}
