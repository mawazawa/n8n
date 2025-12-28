/**
 * Hybrid Search Implementation
 * Combines vector similarity search with full-text search (FTS)
 * Uses Reciprocal Rank Fusion (RRF) for result merging
 *
 * Features:
 * - Vector similarity for semantic understanding
 * - Full-text search for keyword matching
 * - RRF algorithm for intelligent result fusion
 * - Query expansion with domain-specific synonyms
 * - Metadata filtering and boosting
 */

import { getSupabaseAdminClient } from '../supabase/client';
import type { WorkflowCategory, HybridSearchResult } from '../supabase/types';
import { reciprocalRankFusion } from './rrf-fusion';
import { expandQuery } from './query-expansion';
import { createMetadataFilter } from './metadata-filter';

export interface HybridSearchOptions {
  limit?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  category?: WorkflowCategory;
  techniques?: string[];
  minScore?: number;
  useQueryExpansion?: boolean;
  rrfK?: number;
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

export interface FullTextSearchResult {
  id: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  techniques: string[];
  workflow_json: Record<string, unknown>;
  fts_rank: number;
  headline: string;
}

/**
 * Perform hybrid search combining semantic and keyword search
 * Uses database-level hybrid search function for optimal performance
 */
export async function hybridSearch(
  query: string,
  queryEmbedding: number[],
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const {
    limit = 10,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    minScore = 0.0,
    category,
  } = options;

  const { data, error } = await (supabase.rpc as Function)('hybrid_search_workflows', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: limit * 2, // Fetch more for filtering
    semantic_weight: semanticWeight,
    keyword_weight: keywordWeight,
    p_category: category || null,
    min_combined_score: minScore,
  });

  if (error) {
    throw new Error(`Hybrid search failed: ${error.message}`);
  }

  let results = (data || []) as HybridSearchResult[];

  // Apply metadata filtering if specified
  if (options.techniques && options.techniques.length > 0) {
    const metadataFilter = createMetadataFilter({
      techniques: options.techniques,
      category: options.category,
    });
    results = results.filter((r) => metadataFilter(r));
  }

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
 * Advanced hybrid search using client-side RRF fusion
 * Provides more control over the fusion process
 */
export async function hybridSearchWithRRF(
  query: string,
  queryEmbedding: number[],
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const {
    limit = 10,
    category,
    minScore = 0.0,
    useQueryExpansion = false,
    rrfK = 60,
  } = options;

  // Expand query if enabled
  const searchQuery = useQueryExpansion ? expandQuery(query).join(' ') : query;

  // Perform vector similarity search
  const vectorPromise = performVectorSearch(supabase, queryEmbedding, limit * 2, category);

  // Perform full-text search
  const ftsPromise = performFullTextSearch(supabase, searchQuery, limit * 2, category);

  const [vectorResults, ftsResults] = await Promise.all([vectorPromise, ftsPromise]);

  // Apply RRF fusion
  const fusedResults = reciprocalRankFusion(
    [vectorResults, ftsResults],
    rrfK,
  );

  // Filter by minimum score and apply metadata filtering
  let filtered = fusedResults
    .filter((r) => r.score >= minScore)
    .map((r) => r.item);

  if (options.techniques && options.techniques.length > 0) {
    const metadataFilter = createMetadataFilter({
      techniques: options.techniques,
      category: options.category,
    });
    filtered = filtered.filter((r) => metadataFilter(r));
  }

  // Take top results
  return filtered.slice(0, limit);
}

/**
 * Perform vector similarity search
 */
async function performVectorSearch(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  embedding: number[],
  limit: number,
  category?: WorkflowCategory,
): Promise<SearchResult[]> {
  let query = supabase
    .from('workflow_examples')
    .select('id, name, description, category, techniques, workflow_json')
    .not('embedding', 'is', null)
    .eq('is_public', true)
    .eq('embedding_status', 'completed')
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await (query as any).rpc('match_workflows', {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    console.error('Vector search error:', error);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    techniques: r.techniques || [],
    semanticScore: r.similarity || 0,
    keywordScore: 0,
    combinedScore: r.similarity || 0,
    workflow: r.workflow_json,
  }));
}

/**
 * Perform full-text search
 */
async function performFullTextSearch(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  query: string,
  limit: number,
  category?: WorkflowCategory,
): Promise<SearchResult[]> {
  const { data, error } = await (supabase.rpc as Function)('fulltext_search_workflows', {
    query_text: query,
    match_count: limit,
    p_category: category || null,
    public_only: true,
  });

  if (error) {
    console.error('Full-text search error:', error);
    return [];
  }

  return (data || []).map((r: FullTextSearchResult) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    techniques: r.techniques || [],
    semanticScore: 0,
    keywordScore: r.fts_rank,
    combinedScore: r.fts_rank,
    workflow: r.workflow_json,
  }));
}

/**
 * Search with autocomplete suggestions
 */
export async function autocompleteSearch(
  prefix: string,
  maxSuggestions: number = 5,
): Promise<Array<{ suggestion: string; category: WorkflowCategory; count: number }>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await (supabase.rpc as Function)('autocomplete_workflows', {
    prefix,
    max_suggestions: maxSuggestions,
  });

  if (error) {
    throw new Error(`Autocomplete failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Boost results based on metadata matching
 * Returns results with adjusted scores
 */
export function boostByMetadata(
  results: SearchResult[],
  preferredTechniques: string[],
  preferredCategory?: WorkflowCategory,
  techniqueBoost: number = 0.1,
  categoryBoost: number = 0.2,
): SearchResult[] {
  return results.map((r) => {
    let boost = 1.0;

    // Boost for matching techniques
    const matchingTechniques = r.techniques.filter((t) =>
      preferredTechniques.some((pt) => pt.toLowerCase() === t.toLowerCase()),
    );
    boost += matchingTechniques.length * techniqueBoost;

    // Boost for matching category
    if (preferredCategory && r.category === preferredCategory) {
      boost += categoryBoost;
    }

    return {
      ...r,
      combinedScore: r.combinedScore * boost,
      semanticScore: r.semanticScore * boost,
      keywordScore: r.keywordScore * boost,
    };
  });
}
