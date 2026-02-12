/**
 * Reciprocal Rank Fusion (RRF) Algorithm
 *
 * RRF is a method for combining multiple ranked result lists into a single ranking.
 * It's particularly effective for hybrid search combining different ranking algorithms.
 *
 * Formula: RRF(d) = Σ 1 / (k + rank(d))
 * where k is a constant (typically 60) and rank(d) is the rank of document d
 *
 * References:
 * - Cormack, G. V., Clarke, C. L., & Buettcher, S. (2009).
 *   "Reciprocal rank fusion outperforms condorcet and individual rank learning methods"
 */

export interface RankedItem {
  id: string;
  [key: string]: unknown;
}

export interface FusionResult<T extends RankedItem> {
  item: T;
  score: number;
  rrfScore: number;
  ranks: number[]; // Rank positions in each list
  sourceCount: number; // How many lists contained this item
}

export interface RRFOptions {
  /**
   * RRF constant k (default: 60)
   * Higher values reduce the impact of top-ranked documents
   */
  k?: number;

  /**
   * Minimum number of lists an item must appear in to be included
   * Useful for requiring consensus across multiple rankers
   */
  minListsRequired?: number;

  /**
   * Normalize scores to [0, 1] range
   */
  normalizeScores?: boolean;
}

/**
 * Reciprocal Rank Fusion - Basic implementation
 * Merges multiple ranked lists using RRF algorithm
 *
 * @param rankedLists - Array of ranked lists (each list ordered by relevance)
 * @param k - RRF constant (default: 60)
 * @returns Fused results sorted by RRF score
 */
export function reciprocalRankFusion<T extends RankedItem>(
  rankedLists: T[][],
  k: number = 60,
): FusionResult<T>[] {
  if (rankedLists.length === 0) {
    return [];
  }

  // Map to store aggregated scores
  const itemMap = new Map<string, FusionResult<T>>();

  // Process each ranked list
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = 1 / (k + rank + 1);

      const existing = itemMap.get(item.id);
      if (existing) {
        // Item already seen in another list - add to score
        existing.score += rrfScore;
        existing.rrfScore += rrfScore;
        existing.ranks.push(rank);
        existing.sourceCount++;
      } else {
        // First time seeing this item
        itemMap.set(item.id, {
          item,
          score: rrfScore,
          rrfScore,
          ranks: [rank],
          sourceCount: 1,
        });
      }
    }
  }

  // Sort by RRF score (descending)
  return Array.from(itemMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Advanced RRF with additional options
 */
export function reciprocalRankFusionAdvanced<T extends RankedItem>(
  rankedLists: T[][],
  options: RRFOptions = {},
): FusionResult<T>[] {
  const {
    k = 60,
    minListsRequired = 1,
    normalizeScores = false,
  } = options;

  const results = reciprocalRankFusion(rankedLists, k);

  // Filter by minimum lists requirement
  let filtered = results.filter((r) => r.sourceCount >= minListsRequired);

  // Normalize scores if requested
  if (normalizeScores && filtered.length > 0) {
    const maxScore = Math.max(...filtered.map((r) => r.score));
    const minScore = Math.min(...filtered.map((r) => r.score));
    const range = maxScore - minScore;

    if (range > 0) {
      filtered = filtered.map((r) => ({
        ...r,
        score: (r.score - minScore) / range,
      }));
    }
  }

  return filtered;
}

/**
 * Weighted RRF - Different weights for different ranking sources
 *
 * @param rankedLists - Array of ranked lists
 * @param weights - Weight for each list (must match length of rankedLists)
 * @param k - RRF constant
 */
export function weightedReciprocalRankFusion<T extends RankedItem>(
  rankedLists: T[][],
  weights: number[],
  k: number = 60,
): FusionResult<T>[] {
  if (rankedLists.length !== weights.length) {
    throw new Error('Number of weights must match number of ranked lists');
  }

  if (rankedLists.length === 0) {
    return [];
  }

  const itemMap = new Map<string, FusionResult<T>>();

  // Process each ranked list with its weight
  for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
    const list = rankedLists[listIdx];
    const weight = weights[listIdx];

    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = weight / (k + rank + 1);

      const existing = itemMap.get(item.id);
      if (existing) {
        existing.score += rrfScore;
        existing.rrfScore += rrfScore;
        existing.ranks.push(rank);
        existing.sourceCount++;
      } else {
        itemMap.set(item.id, {
          item,
          score: rrfScore,
          rrfScore,
          ranks: [rank],
          sourceCount: 1,
        });
      }
    }
  }

  return Array.from(itemMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * RRF with position-based variance penalty
 * Penalizes items that have high variance in their ranks across lists
 * This favors items that consistently rank well across all sources
 */
export function rrfWithConsistencyBonus<T extends RankedItem>(
  rankedLists: T[][],
  k: number = 60,
  consistencyWeight: number = 0.1,
): FusionResult<T>[] {
  const results = reciprocalRankFusion(rankedLists, k);

  return results.map((result) => {
    if (result.ranks.length < 2) {
      // No variance calculation needed for single source
      return result;
    }

    // Calculate rank variance
    const mean = result.ranks.reduce((sum, r) => sum + r, 0) / result.ranks.length;
    const variance = result.ranks.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / result.ranks.length;
    const stdDev = Math.sqrt(variance);

    // Penalize high variance (inconsistent rankings)
    // Lower variance = higher bonus
    const consistencyBonus = consistencyWeight * (1 / (1 + stdDev));
    const adjustedScore = result.score + consistencyBonus;

    return {
      ...result,
      score: adjustedScore,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Analyze RRF fusion results to understand contribution of each source
 */
export function analyzeRRFFusion<T extends RankedItem>(
  rankedLists: T[][],
  fusionResults: FusionResult<T>[],
): {
  totalItems: number;
  uniqueItems: number;
  consensusItems: number; // Items appearing in all lists
  sourceContributions: number[]; // Unique items from each source
  averageRankVariance: number;
} {
  const uniqueItems = fusionResults.length;
  const totalItems = rankedLists.reduce((sum, list) => sum + list.length, 0);
  const consensusItems = fusionResults.filter((r) => r.sourceCount === rankedLists.length).length;

  // Calculate unique contributions from each source
  const sourceContributions = rankedLists.map((list, idx) => {
    const itemIds = new Set(list.map((item) => item.id));
    // Count items that appear in this list but not in others
    let uniqueCount = 0;
    for (const id of itemIds) {
      const isUnique = rankedLists.every((otherList, otherIdx) => {
        if (idx === otherIdx) return true;
        return !otherList.some((item) => item.id === id);
      });
      if (isUnique) uniqueCount++;
    }
    return uniqueCount;
  });

  // Calculate average rank variance
  const variances = fusionResults
    .filter((r) => r.ranks.length > 1)
    .map((r) => {
      const mean = r.ranks.reduce((sum, rank) => sum + rank, 0) / r.ranks.length;
      return r.ranks.reduce((sum, rank) => sum + Math.pow(rank - mean, 2), 0) / r.ranks.length;
    });

  const averageRankVariance = variances.length > 0
    ? variances.reduce((sum, v) => sum + v, 0) / variances.length
    : 0;

  return {
    totalItems,
    uniqueItems,
    consensusItems,
    sourceContributions,
    averageRankVariance,
  };
}

/**
 * Combine RRF with score-based fusion
 * Uses both rank position and original scores from each ranker
 */
export function hybridRRFScoreFusion<T extends RankedItem & { score?: number }>(
  rankedLists: T[][],
  k: number = 60,
  rankWeight: number = 0.6,
  scoreWeight: number = 0.4,
): FusionResult<T>[] {
  if (rankWeight + scoreWeight !== 1.0) {
    throw new Error('rankWeight + scoreWeight must equal 1.0');
  }

  const itemMap = new Map<string, FusionResult<T> & { scoreSum: number; scoreCount: number }>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = 1 / (k + rank + 1);
      const itemScore = item.score || 0;

      const existing = itemMap.get(item.id);
      if (existing) {
        existing.rrfScore += rrfScore;
        existing.scoreSum += itemScore;
        existing.scoreCount++;
        existing.ranks.push(rank);
        existing.sourceCount++;
      } else {
        itemMap.set(item.id, {
          item,
          score: 0, // Will be calculated below
          rrfScore,
          scoreSum: itemScore,
          scoreCount: 1,
          ranks: [rank],
          sourceCount: 1,
        });
      }
    }
  }

  // Calculate combined scores
  const results = Array.from(itemMap.values()).map((entry) => {
    const avgScore = entry.scoreSum / entry.scoreCount;
    const combinedScore = rankWeight * entry.rrfScore + scoreWeight * avgScore;

    return {
      item: entry.item,
      score: combinedScore,
      rrfScore: entry.rrfScore,
      ranks: entry.ranks,
      sourceCount: entry.sourceCount,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}
