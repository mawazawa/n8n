/**
 * Search Analytics Tracking
 *
 * Tracks and analyzes search behavior for continuous improvement:
 * - Query logging with performance metrics
 * - Click-through tracking
 * - Search quality metrics (MRR, NDCG, CTR)
 * - Performance monitoring
 */

import { getSupabaseAdminClient } from '../supabase/client';
import type { WorkflowCategory } from '../supabase/types';

export interface SearchQueryLog {
  id?: string;
  queryText: string;
  searchType: 'hybrid' | 'vector' | 'fulltext';
  userId?: string;
  sessionId?: string;
  category?: WorkflowCategory;
  resultCount: number;
  latencyMs: number;
  embeddingLatencyMs?: number;
  searchLatencyMs?: number;
  rerankLatencyMs?: number;
  experimentId?: string;
  variantId?: string;
}

export interface SearchClickLog {
  queryId: string;
  workflowId: string;
  resultPosition: number;
  resultScore?: number;
  timeToClickMs?: number;
  sessionId?: string;
  userId?: string;
}

export interface SearchAnalyticsSummary {
  totalSearches: number;
  uniqueUsers: number;
  avgLatencyMs: number;
  totalClicks: number;
  clickThroughRate: number;
  mrr: number; // Mean Reciprocal Rank
  zeroResultRate: number;
  topQueries: Array<{ query: string; count: number }>;
}

export interface SearchPerformanceMetrics {
  queryId: string;
  latencyMs: number;
  resultCount: number;
  clicked: boolean;
  clickPosition?: number;
  timeToClick?: number;
}

/**
 * Analytics tracker class
 */
export class SearchAnalytics {
  private supabase = getSupabaseAdminClient();

  /**
   * Log a search query with performance metrics
   */
  async logQuery(log: SearchQueryLog): Promise<string | null> {
    try {
      const { data, error } = await (this.supabase.rpc as Function)('log_search_query', {
        p_query_text: log.queryText,
        p_search_type: log.searchType,
        p_user_id: log.userId || null,
        p_session_id: log.sessionId || null,
        p_result_count: log.resultCount,
        p_latency_ms: log.latencyMs,
        p_category: log.category || null,
        p_experiment_id: log.experimentId || null,
        p_variant_id: log.variantId || null,
      });

      if (error) {
        console.error('Failed to log search query:', error);
        return null;
      }

      return data as string;
    } catch (error) {
      console.error('Error logging search query:', error);
      return null;
    }
  }

  /**
   * Log a click-through event
   */
  async logClick(click: SearchClickLog): Promise<string | null> {
    try {
      const { data, error } = await (this.supabase.rpc as Function)('log_search_click', {
        p_query_id: click.queryId,
        p_workflow_id: click.workflowId,
        p_result_position: click.resultPosition,
        p_result_score: click.resultScore || null,
        p_session_id: click.sessionId || null,
        p_user_id: click.userId || null,
      });

      if (error) {
        console.error('Failed to log search click:', error);
        return null;
      }

      return data as string;
    } catch (error) {
      console.error('Error logging search click:', error);
      return null;
    }
  }

  /**
   * Get comprehensive analytics summary for a time period
   */
  async getAnalyticsSummary(
    startTime: Date,
    endTime: Date,
  ): Promise<SearchAnalyticsSummary | null> {
    try {
      const { data, error } = await (this.supabase.rpc as Function)('get_search_analytics', {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      });

      if (error) {
        console.error('Failed to get analytics summary:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return {
          totalSearches: 0,
          uniqueUsers: 0,
          avgLatencyMs: 0,
          totalClicks: 0,
          clickThroughRate: 0,
          mrr: 0,
          zeroResultRate: 0,
          topQueries: [],
        };
      }

      const row = data[0];
      return {
        totalSearches: parseInt(row.total_searches, 10),
        uniqueUsers: parseInt(row.unique_users, 10),
        avgLatencyMs: parseFloat(row.avg_latency_ms),
        totalClicks: parseInt(row.total_clicks, 10),
        clickThroughRate: parseFloat(row.click_through_rate),
        mrr: parseFloat(row.mrr),
        zeroResultRate: parseFloat(row.zero_result_rate),
        topQueries: row.top_queries || [],
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      return null;
    }
  }

  /**
   * Calculate Mean Reciprocal Rank (MRR)
   * MRR = average of (1 / rank of first relevant result)
   * Range: [0, 1], higher is better
   */
  async calculateMRR(startTime: Date, endTime: Date): Promise<number> {
    try {
      const { data, error } = await (this.supabase.rpc as Function)('calculate_mrr', {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      });

      if (error) {
        console.error('Failed to calculate MRR:', error);
        return 0;
      }

      return parseFloat(data) || 0;
    } catch (error) {
      console.error('Error calculating MRR:', error);
      return 0;
    }
  }

  /**
   * Get click-through rate for a time period
   */
  async getClickThroughRate(startTime: Date, endTime: Date): Promise<number> {
    try {
      const { data: searches, error: searchError } = await this.supabase
        .from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());

      if (searchError) {
        console.error('Failed to get search count:', searchError);
        return 0;
      }

      const searchCount = searches?.length || 0;
      if (searchCount === 0) return 0;

      const { data: clicks, error: clickError } = await this.supabase
        .from('search_clicks')
        .select('id, query_id!inner(created_at)', { count: 'exact', head: true })
        .gte('query_id.created_at', startTime.toISOString())
        .lte('query_id.created_at', endTime.toISOString());

      if (clickError) {
        console.error('Failed to get click count:', clickError);
        return 0;
      }

      const clickCount = clicks?.length || 0;
      return clickCount / searchCount;
    } catch (error) {
      console.error('Error calculating CTR:', error);
      return 0;
    }
  }

  /**
   * Get latency percentiles
   */
  async getLatencyPercentiles(
    startTime: Date,
    endTime: Date,
  ): Promise<{ p50: number; p95: number; p99: number }> {
    try {
      const { data, error } = await this.supabase
        .from('search_queries')
        .select('latency_ms')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .order('latency_ms', { ascending: true });

      if (error || !data || data.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      const latencies = data.map((d) => d.latency_ms).filter((l) => l !== null);
      if (latencies.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      const getPercentile = (arr: number[], percentile: number): number => {
        const index = Math.ceil((percentile / 100) * arr.length) - 1;
        return arr[Math.max(0, index)];
      };

      return {
        p50: getPercentile(latencies, 50),
        p95: getPercentile(latencies, 95),
        p99: getPercentile(latencies, 99),
      };
    } catch (error) {
      console.error('Error calculating latency percentiles:', error);
      return { p50: 0, p95: 0, p99: 0 };
    }
  }

  /**
   * Get zero-result rate (searches with no results)
   */
  async getZeroResultRate(startTime: Date, endTime: Date): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('search_queries')
        .select('result_count')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());

      if (error || !data || data.length === 0) {
        return 0;
      }

      const totalSearches = data.length;
      const zeroResults = data.filter((d) => d.result_count === 0).length;

      return zeroResults / totalSearches;
    } catch (error) {
      console.error('Error calculating zero result rate:', error);
      return 0;
    }
  }

  /**
   * Get most popular queries
   */
  async getTopQueries(
    startTime: Date,
    endTime: Date,
    limit: number = 10,
  ): Promise<Array<{ query: string; count: number; avgLatency: number }>> {
    try {
      const { data, error } = await this.supabase
        .from('search_queries')
        .select('query_text, latency_ms')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());

      if (error || !data) {
        return [];
      }

      // Aggregate by query text
      const queryMap = new Map<string, { count: number; totalLatency: number }>();

      for (const row of data) {
        const existing = queryMap.get(row.query_text);
        if (existing) {
          existing.count++;
          existing.totalLatency += row.latency_ms || 0;
        } else {
          queryMap.set(row.query_text, {
            count: 1,
            totalLatency: row.latency_ms || 0,
          });
        }
      }

      // Convert to array and sort
      const results = Array.from(queryMap.entries())
        .map(([query, stats]) => ({
          query,
          count: stats.count,
          avgLatency: stats.totalLatency / stats.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return results;
    } catch (error) {
      console.error('Error getting top queries:', error);
      return [];
    }
  }

  /**
   * Get queries with zero results (candidates for improvement)
   */
  async getZeroResultQueries(
    startTime: Date,
    endTime: Date,
    limit: number = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    try {
      const { data, error } = await this.supabase
        .from('search_queries')
        .select('query_text')
        .eq('result_count', 0)
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());

      if (error || !data) {
        return [];
      }

      // Count occurrences
      const queryCount = new Map<string, number>();
      for (const row of data) {
        queryCount.set(row.query_text, (queryCount.get(row.query_text) || 0) + 1);
      }

      return Array.from(queryCount.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting zero result queries:', error);
      return [];
    }
  }
}

/**
 * Client-side NDCG calculation
 * Normalized Discounted Cumulative Gain
 * Measures ranking quality considering position
 */
export function calculateNDCG(
  relevanceScores: number[],
  k?: number,
): number {
  const scores = k ? relevanceScores.slice(0, k) : relevanceScores;

  if (scores.length === 0) return 0;

  // Calculate DCG
  const dcg = scores.reduce((sum, score, index) => {
    const position = index + 1;
    return sum + score / Math.log2(position + 1);
  }, 0);

  // Calculate ideal DCG (sorted by relevance)
  const sortedScores = [...scores].sort((a, b) => b - a);
  const idealDcg = sortedScores.reduce((sum, score, index) => {
    const position = index + 1;
    return sum + score / Math.log2(position + 1);
  }, 0);

  // Normalize
  return idealDcg > 0 ? dcg / idealDcg : 0;
}

/**
 * Calculate Mean Average Precision (MAP)
 */
export function calculateMAP(
  relevantPositions: number[][],
): number {
  if (relevantPositions.length === 0) return 0;

  const averagePrecisions = relevantPositions.map((positions) => {
    if (positions.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      const precision = (i + 1) / (position + 1);
      sum += precision;
    }

    return sum / positions.length;
  });

  return averagePrecisions.reduce((sum, ap) => sum + ap, 0) / averagePrecisions.length;
}

/**
 * Create a singleton instance
 */
export const searchAnalytics = new SearchAnalytics();
