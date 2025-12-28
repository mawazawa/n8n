/**
 * Hybrid Search Implementation
 * Combines vector similarity search with full-text search
 * Uses Reciprocal Rank Fusion (RRF) for result merging
 */

import { getSupabaseAdminClient } from '../supabase/client';
import type { WorkflowCategory, HybridSearchResult } from '../supabase/types';

export interface HybridSearchOptions {
  limit?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  category?: WorkflowCategory;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  techniques: string[];
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
  workflow: Record<string, unknown>;
}

/**
 * Perform hybrid search combining semantic and keyword search
 */
export async function hybridSearch(
  query: string,
  queryEmbedding: number[],
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const {
    limit = 5,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    minScore = 0.1,
  } = options;

  const { data, error } = await (supabase.rpc as Function)('hybrid_search_workflows', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: limit * 2, // Fetch more for filtering
    semantic_weight: semanticWeight,
    keyword_weight: keywordWeight,
  });

  if (error) {
    throw new Error(`Hybrid search failed: ${error.message}`);
  }

  // Filter by minimum score and category if provided
  let results = (data || []) as HybridSearchResult[];

  if (options.category) {
    results = results.filter((r) => r.category === options.category);
  }

  results = results.filter((r) => r.combined_score >= minScore);

  // Take only the requested limit
  results = results.slice(0, limit);

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    techniques: r.techniques,
    semanticScore: r.semantic_score,
    keywordScore: r.keyword_score,
    combinedScore: r.combined_score,
    workflow: r.workflow_json,
  }));
}

/**
 * Reciprocal Rank Fusion (RRF) for merging ranked lists
 * RRF(d) = Σ 1 / (k + rank(d)) for each ranking
 */
export function reciprocalRankFusion<T extends { id: string }>(
  rankedLists: T[][],
  k: number = 60,
): { item: T; score: number }[] {
  const scores = new Map<string, { item: T; score: number }>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = 1 / (k + rank + 1);

      const existing = scores.get(item.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(item.id, { item, score: rrfScore });
      }
    }
  }

  // Sort by RRF score descending
  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}

/**
 * Query expansion with synonyms and related terms
 */
export function expandQuery(query: string): string[] {
  const expansions: Record<string, string[]> = {
    email: ['smtp', 'gmail', 'outlook', 'sendgrid', 'mailchimp'],
    database: ['sql', 'postgres', 'mysql', 'mongodb', 'supabase'],
    ai: ['openai', 'gpt', 'claude', 'anthropic', 'langchain', 'agent'],
    chat: ['slack', 'discord', 'teams', 'telegram', 'whatsapp'],
    file: ['google drive', 's3', 'dropbox', 'storage', 'upload'],
    webhook: ['trigger', 'http', 'api', 'endpoint'],
    schedule: ['cron', 'timer', 'interval', 'periodic'],
    notification: ['alert', 'message', 'notify', 'push'],
    transform: ['convert', 'parse', 'format', 'extract'],
    api: ['rest', 'graphql', 'http request', 'fetch'],
  };

  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>(words);

  for (const word of words) {
    if (expansions[word]) {
      expansions[word].forEach((synonym) => expandedTerms.add(synonym));
    }
  }

  return Array.from(expandedTerms);
}

/**
 * Boost results based on metadata matching
 */
export function boostByMetadata<T extends { techniques: string[]; category: string }>(
  results: T[],
  preferredTechniques: string[],
  preferredCategory?: string,
): T[] {
  return results.map((r) => {
    let boost = 1.0;

    // Boost for matching techniques
    const matchingTechniques = r.techniques.filter((t) =>
      preferredTechniques.includes(t.toLowerCase()),
    );
    boost += matchingTechniques.length * 0.1;

    // Boost for matching category
    if (preferredCategory && r.category === preferredCategory) {
      boost += 0.2;
    }

    return { ...r, _boost: boost };
  });
}
