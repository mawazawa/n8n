/**
 * Semantic Memory Manager
 * Stores facts and relationships as a knowledge graph
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import { MemoryStore } from './store.js';
import type { SemanticMemory } from './types.js';

export interface Relation {
  subject: string;
  predicate: string;
  object: string;
}

export interface FactOptions {
  importance?: number;
  category?: string;
  relations?: Relation[];
}

/**
 * Manages semantic memories (facts and relationships)
 */
export class SemanticMemoryManager {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * Store a fact in semantic memory
   */
  async storeFact(
    fact: string,
    options: FactOptions = {}
  ): Promise<SemanticMemory> {
    const category = options.category || this.inferCategory(fact);
    const importance = options.importance ?? this.calculateFactImportance(fact);

    // Check for existing similar facts to avoid duplication
    const existing = await this.findSimilarFacts(fact, 0.9);
    if (existing.length > 0) {
      // Update existing fact instead of creating duplicate
      const existingFact = existing[0];
      existingFact.facts.push(fact);
      existingFact.importance = Math.max(existingFact.importance, importance);
      if (options.relations) {
        existingFact.relations.push(...options.relations);
      }
      return await this.store.save(existingFact) as SemanticMemory;
    }

    const memory: SemanticMemory = {
      id: uuidv4(),
      type: 'semantic',
      content: fact,
      metadata: {
        source: 'user-input',
        verified: false,
      },
      importance,
      accessCount: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
      category,
      facts: [fact],
      relations: options.relations || [],
    };

    await this.store.save(memory);
    return memory;
  }

  /**
   * Store a relationship (triple: subject-predicate-object)
   */
  async storeRelation(
    subject: string,
    predicate: string,
    object: string,
    options: { importance?: number; category?: string } = {}
  ): Promise<SemanticMemory> {
    const relation: Relation = { subject, predicate, object };
    const fact = `${subject} ${predicate} ${object}`;

    return await this.storeFact(fact, {
      ...options,
      relations: [relation],
    });
  }

  /**
   * Store multiple facts in batch
   */
  async storeFacts(facts: Array<{ fact: string; options?: FactOptions }>): Promise<SemanticMemory[]> {
    const memories = facts.map(({ fact, options = {} }) => {
      const category = options.category || this.inferCategory(fact);
      const importance = options.importance ?? this.calculateFactImportance(fact);

      return {
        id: uuidv4(),
        type: 'semantic' as const,
        content: fact,
        metadata: {
          source: 'batch-input',
          verified: false,
        },
        importance,
        accessCount: 0,
        lastAccessed: Date.now(),
        createdAt: Date.now(),
        category,
        facts: [fact],
        relations: options.relations || [],
      };
    });

    return await this.store.saveBatch(memories) as SemanticMemory[];
  }

  /**
   * Query facts using natural language
   */
  async queryFacts(
    query: string,
    options: {
      category?: string;
      limit?: number;
      minImportance?: number;
    } = {}
  ): Promise<SemanticMemory[]> {
    const supabase = getSupabaseClient();

    // Search using vector similarity
    const results = await this.store.search(query, {
      type: 'semantic',
      limit: options.limit || 10,
      minImportance: options.minImportance || 0.2,
    });

    let memories = results.map(r => r.memory as SemanticMemory);

    // Filter by category if specified
    if (options.category) {
      memories = memories.filter(m => m.category === options.category);
    }

    return memories;
  }

  /**
   * Find facts by category
   */
  async getFactsByCategory(category: string, limit = 20): Promise<SemanticMemory[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'semantic')
      .eq('category', category)
      .order('importance', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get facts by category: ${error.message}`);
    }

    return data.map(row => this.rowToSemantic(row));
  }

  /**
   * Find relations matching pattern
   */
  async findRelations(
    pattern: {
      subject?: string;
      predicate?: string;
      object?: string;
    },
    limit = 20
  ): Promise<Relation[]> {
    const supabase = getSupabaseClient();

    // Build query
    let query = supabase
      .from('memory_entries')
      .select('relations')
      .eq('type', 'semantic')
      .not('relations', 'is', null)
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to find relations: ${error.message}`);
    }

    // Extract and filter relations
    const allRelations: Relation[] = [];
    for (const row of data) {
      const relations = row.relations as Relation[];
      if (Array.isArray(relations)) {
        allRelations.push(...relations);
      }
    }

    // Filter by pattern
    return allRelations.filter(rel => {
      if (pattern.subject && rel.subject !== pattern.subject) return false;
      if (pattern.predicate && rel.predicate !== pattern.predicate) return false;
      if (pattern.object && rel.object !== pattern.object) return false;
      return true;
    });
  }

  /**
   * Traverse knowledge graph starting from entity
   */
  async traverse(
    startEntity: string,
    maxDepth = 2
  ): Promise<{ entities: Set<string>; relations: Relation[] }> {
    const entities = new Set<string>([startEntity]);
    const relations: Relation[] = [];
    const visited = new Set<string>();

    const queue: Array<{ entity: string; depth: number }> = [
      { entity: startEntity, depth: 0 },
    ];

    while (queue.length > 0) {
      const { entity, depth } = queue.shift()!;

      if (visited.has(entity) || depth >= maxDepth) {
        continue;
      }

      visited.add(entity);

      // Find relations where this entity is subject or object
      const subjectRelations = await this.findRelations({ subject: entity });
      const objectRelations = await this.findRelations({ object: entity });

      for (const rel of [...subjectRelations, ...objectRelations]) {
        relations.push(rel);

        // Add connected entities to queue
        if (rel.subject === entity && !entities.has(rel.object)) {
          entities.add(rel.object);
          queue.push({ entity: rel.object, depth: depth + 1 });
        }
        if (rel.object === entity && !entities.has(rel.subject)) {
          entities.add(rel.subject);
          queue.push({ entity: rel.subject, depth: depth + 1 });
        }
      }
    }

    return { entities, relations };
  }

  /**
   * Verify fact against existing knowledge
   */
  async verifyFact(fact: string): Promise<{
    verified: boolean;
    confidence: number;
    supportingFacts: SemanticMemory[];
    conflictingFacts: SemanticMemory[];
  }> {
    // Find similar facts
    const similar = await this.findSimilarFacts(fact, 0.7);

    // Separate supporting and conflicting facts
    const supportingFacts: SemanticMemory[] = [];
    const conflictingFacts: SemanticMemory[] = [];

    for (const memory of similar) {
      // Simple heuristic: check for negation words
      const hasNegation = this.containsNegation(memory.content) !== this.containsNegation(fact);

      if (hasNegation) {
        conflictingFacts.push(memory);
      } else {
        supportingFacts.push(memory);
      }
    }

    const confidence = supportingFacts.length / Math.max(similar.length, 1);
    const verified = confidence > 0.6 && conflictingFacts.length === 0;

    return {
      verified,
      confidence,
      supportingFacts,
      conflictingFacts,
    };
  }

  /**
   * Resolve conflicting facts
   */
  async resolveConflict(
    fact1Id: string,
    fact2Id: string,
    resolution: 'keep-first' | 'keep-second' | 'keep-both' | 'merge'
  ): Promise<void> {
    const fact1 = await this.store.get(fact1Id) as SemanticMemory | null;
    const fact2 = await this.store.get(fact2Id) as SemanticMemory | null;

    if (!fact1 || !fact2) {
      throw new Error('One or both facts not found');
    }

    switch (resolution) {
      case 'keep-first':
        await this.store.delete(fact2Id);
        break;

      case 'keep-second':
        await this.store.delete(fact1Id);
        break;

      case 'merge':
        // Merge facts into one
        fact1.facts.push(...fact2.facts);
        fact1.relations.push(...fact2.relations);
        fact1.importance = Math.max(fact1.importance, fact2.importance);
        fact1.content = fact1.facts.join('; ');
        await this.store.save(fact1);
        await this.store.delete(fact2Id);
        break;

      case 'keep-both':
        // Mark conflict in metadata
        fact1.metadata.conflictsWith = fact2Id;
        fact2.metadata.conflictsWith = fact1Id;
        await this.store.save(fact1);
        await this.store.save(fact2);
        break;
    }
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('category')
      .eq('type', 'semantic')
      .not('category', 'is', null);

    if (error) {
      throw new Error(`Failed to get categories: ${error.message}`);
    }

    const counts = new Map<string, number>();
    for (const row of data) {
      const category = row.category;
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Export knowledge graph in JSON format
   */
  async exportKnowledgeGraph(): Promise<{
    facts: SemanticMemory[];
    relations: Relation[];
    categories: string[];
  }> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'semantic');

    if (error) {
      throw new Error(`Failed to export knowledge graph: ${error.message}`);
    }

    const facts = data.map(row => this.rowToSemantic(row));
    const allRelations: Relation[] = [];
    const categories = new Set<string>();

    for (const fact of facts) {
      allRelations.push(...fact.relations);
      categories.add(fact.category);
    }

    return {
      facts,
      relations: allRelations,
      categories: Array.from(categories),
    };
  }

  /**
   * Calculate fact importance
   */
  private calculateFactImportance(fact: string): number {
    let importance = 0.5;

    // Increase for workflow-specific knowledge
    const workflowTerms = ['node', 'workflow', 'trigger', 'parameter', 'connection'];
    const matchCount = workflowTerms.filter(term =>
      fact.toLowerCase().includes(term)
    ).length;
    importance += matchCount * 0.1;

    // Increase for specific, detailed facts
    if (fact.length > 100) importance += 0.1;
    if (fact.includes('=') || fact.includes(':')) importance += 0.05;

    return Math.min(importance, 1.0);
  }

  /**
   * Infer category from fact content
   */
  private inferCategory(fact: string): string {
    const lower = fact.toLowerCase();

    if (lower.includes('node') || lower.includes('trigger')) return 'workflows';
    if (lower.includes('user') || lower.includes('preference')) return 'user-preferences';
    if (lower.includes('api') || lower.includes('endpoint')) return 'integrations';
    if (lower.includes('error') || lower.includes('bug')) return 'troubleshooting';
    if (lower.includes('best practice') || lower.includes('should')) return 'best-practices';

    return 'general';
  }

  /**
   * Find similar facts
   */
  private async findSimilarFacts(
    fact: string,
    threshold: number
  ): Promise<SemanticMemory[]> {
    const results = await this.store.search(fact, {
      type: 'semantic',
      limit: 10,
    });

    return results
      .filter(r => r.score >= threshold)
      .map(r => r.memory as SemanticMemory);
  }

  /**
   * Check if text contains negation
   */
  private containsNegation(text: string): boolean {
    const negationWords = ['not', 'never', 'no', "don't", "doesn't", "didn't", 'cannot', "can't"];
    const lower = text.toLowerCase();
    return negationWords.some(word => lower.includes(word));
  }

  /**
   * Convert database row to semantic memory
   */
  private rowToSemantic(row: Record<string, unknown>): SemanticMemory {
    return {
      id: row.id as string,
      type: 'semantic',
      content: row.content as string,
      embedding: row.embedding as number[] | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      importance: row.importance as number,
      accessCount: row.access_count as number,
      lastAccessed: new Date(row.last_accessed as string).getTime(),
      createdAt: new Date(row.created_at as string).getTime(),
      expiresAt: row.expires_at ? new Date(row.expires_at as string).getTime() : undefined,
      category: row.category as string,
      facts: row.facts as string[],
      relations: (row.relations as Relation[]) || [],
    };
  }
}
