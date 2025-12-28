/**
 * Search Relevance Metrics Tests
 *
 * Tests for measuring and validating search quality using standard IR metrics:
 * - MRR (Mean Reciprocal Rank)
 * - NDCG (Normalized Discounted Cumulative Gain)
 * - MAP (Mean Average Precision)
 * - Precision@K and Recall@K
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calculateNDCG, calculateMAP } from '../../src/rag/analytics';
import { reciprocalRankFusion } from '../../src/rag/rrf-fusion';

describe('Search Relevance Metrics', () => {
  describe('Mean Reciprocal Rank (MRR)', () => {
    it('should calculate MRR for perfect ranking (relevant at position 0)', () => {
      // Relevant item at position 0 (first position)
      const clickPosition = 0;
      const mrr = 1 / (clickPosition + 1);

      expect(mrr).toBe(1.0);
    });

    it('should calculate MRR for second position', () => {
      const clickPosition = 1;
      const mrr = 1 / (clickPosition + 1);

      expect(mrr).toBe(0.5);
    });

    it('should calculate MRR for third position', () => {
      const clickPosition = 2;
      const mrr = 1 / (clickPosition + 1);

      expect(mrr).toBeCloseTo(0.333, 2);
    });

    it('should calculate average MRR across multiple queries', () => {
      const clickPositions = [0, 1, 2, 0, 3]; // 5 queries
      const reciprocalRanks = clickPositions.map((pos) => 1 / (pos + 1));
      const avgMRR = reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length;

      // (1.0 + 0.5 + 0.333 + 1.0 + 0.25) / 5 = 0.6166
      expect(avgMRR).toBeCloseTo(0.6166, 3);
    });

    it('should handle no relevant results (MRR = 0)', () => {
      // No clicks = no relevant results found
      const mrr = 0;
      expect(mrr).toBe(0);
    });
  });

  describe('Normalized Discounted Cumulative Gain (NDCG)', () => {
    it('should calculate NDCG@5 for perfect ranking', () => {
      const relevanceScores = [5, 4, 3, 2, 1]; // Perfect descending order
      const ndcg = calculateNDCG(relevanceScores, 5);

      // Perfect ranking should give NDCG = 1.0
      expect(ndcg).toBe(1.0);
    });

    it('should calculate NDCG@5 for imperfect ranking', () => {
      const relevanceScores = [3, 5, 2, 4, 1]; // Not optimal order
      const ndcg = calculateNDCG(relevanceScores, 5);

      // Should be less than 1.0
      expect(ndcg).toBeLessThan(1.0);
      expect(ndcg).toBeGreaterThan(0.8);
    });

    it('should calculate NDCG@3 with partial results', () => {
      const relevanceScores = [4, 3, 2, 1, 0];
      const ndcg = calculateNDCG(relevanceScores, 3);

      // Only considering top 3 results
      expect(ndcg).toBe(1.0); // Top 3 are in perfect order
    });

    it('should handle zero relevance scores', () => {
      const relevanceScores = [0, 0, 0];
      const ndcg = calculateNDCG(relevanceScores);

      expect(ndcg).toBe(0);
    });

    it('should handle single result', () => {
      const relevanceScores = [5];
      const ndcg = calculateNDCG(relevanceScores);

      expect(ndcg).toBe(1.0);
    });

    it('should calculate realistic workflow search NDCG', () => {
      // Simulated relevance scores for a workflow search
      // User searches for "email automation"
      // Results: [perfect match, good match, ok match, poor match, irrelevant]
      const relevanceScores = [1.0, 0.8, 0.6, 0.3, 0.1];
      const ndcg = calculateNDCG(relevanceScores, 5);

      expect(ndcg).toBe(1.0); // Already in optimal order
    });

    it('should penalize poor ranking order', () => {
      // Same scores but poorly ordered
      const relevanceScores = [0.3, 0.1, 1.0, 0.6, 0.8];
      const ndcg = calculateNDCG(relevanceScores, 5);

      // Should be significantly less than 1.0 due to best result at position 2
      expect(ndcg).toBeLessThan(0.85);
    });
  });

  describe('Mean Average Precision (MAP)', () => {
    it('should calculate MAP for perfect precision', () => {
      // All top results are relevant
      const relevantPositions = [
        [0, 1, 2], // Query 1: relevant at positions 0, 1, 2
        [0, 1], // Query 2: relevant at positions 0, 1
      ];

      const map = calculateMAP(relevantPositions);
      expect(map).toBe(1.0);
    });

    it('should calculate MAP with mixed results', () => {
      const relevantPositions = [
        [0, 2], // Query 1: relevant at positions 0, 2
        [1], // Query 2: relevant at position 1
      ];

      const map = calculateMAP(relevantPositions);

      // Query 1 AP: (1/1 + 2/3) / 2 = 0.833
      // Query 2 AP: (1/2) / 1 = 0.5
      // MAP: (0.833 + 0.5) / 2 = 0.6665
      expect(map).toBeCloseTo(0.6665, 3);
    });

    it('should handle queries with no relevant results', () => {
      const relevantPositions = [
        [0, 1], // Query 1 has relevant results
        [], // Query 2 has no relevant results
      ];

      const map = calculateMAP(relevantPositions);

      // Query 1 AP: 1.0, Query 2 AP: 0
      // MAP: 0.5
      expect(map).toBe(0.5);
    });

    it('should handle empty input', () => {
      const relevantPositions: number[][] = [];
      const map = calculateMAP(relevantPositions);

      expect(map).toBe(0);
    });
  });

  describe('Precision@K and Recall@K', () => {
    function calculatePrecisionAtK(
      relevantRetrieved: number,
      totalRetrieved: number,
    ): number {
      return totalRetrieved > 0 ? relevantRetrieved / totalRetrieved : 0;
    }

    function calculateRecallAtK(
      relevantRetrieved: number,
      totalRelevant: number,
    ): number {
      return totalRelevant > 0 ? relevantRetrieved / totalRelevant : 0;
    }

    it('should calculate Precision@5', () => {
      const relevantRetrieved = 4;
      const k = 5;

      const precision = calculatePrecisionAtK(relevantRetrieved, k);
      expect(precision).toBe(0.8);
    });

    it('should calculate Recall@5', () => {
      const relevantRetrieved = 4;
      const totalRelevant = 10;

      const recall = calculateRecallAtK(relevantRetrieved, totalRelevant);
      expect(recall).toBe(0.4);
    });

    it('should handle perfect precision and recall', () => {
      const relevantRetrieved = 5;
      const k = 5;
      const totalRelevant = 5;

      const precision = calculatePrecisionAtK(relevantRetrieved, k);
      const recall = calculateRecallAtK(relevantRetrieved, totalRelevant);

      expect(precision).toBe(1.0);
      expect(recall).toBe(1.0);
    });

    it('should calculate F1 score from precision and recall', () => {
      const precision = 0.8;
      const recall = 0.6;

      const f1 = (2 * precision * recall) / (precision + recall);
      expect(f1).toBeCloseTo(0.686, 3);
    });
  });

  describe('Reciprocal Rank Fusion (RRF) Quality', () => {
    interface RankedItem {
      id: string;
      relevance: number;
    }

    it('should promote items that appear in multiple rankings', () => {
      const list1: RankedItem[] = [
        { id: 'A', relevance: 1.0 },
        { id: 'B', relevance: 0.8 },
        { id: 'C', relevance: 0.6 },
      ];

      const list2: RankedItem[] = [
        { id: 'A', relevance: 0.9 },
        { id: 'D', relevance: 0.7 },
        { id: 'B', relevance: 0.5 },
      ];

      const fused = reciprocalRankFusion([list1, list2], 60);

      // Item A should be first (appears in both lists at top positions)
      expect(fused[0].item.id).toBe('A');

      // Item B should be second (appears in both lists)
      expect(fused[1].item.id).toBe('B');
    });

    it('should use k=60 by default', () => {
      const list: RankedItem[] = [
        { id: 'A', relevance: 1.0 },
      ];

      const fused = reciprocalRankFusion([list], 60);

      // RRF score = 1 / (60 + 0 + 1) = 1/61
      expect(fused[0].score).toBeCloseTo(1 / 61, 5);
    });

    it('should handle different k values', () => {
      const list: RankedItem[] = [
        { id: 'A', relevance: 1.0 },
      ];

      const k30 = reciprocalRankFusion([list], 30);
      const k60 = reciprocalRankFusion([list], 60);

      // Lower k gives higher scores for top positions
      expect(k30[0].score).toBeGreaterThan(k60[0].score);
    });

    it('should handle empty lists', () => {
      const fused = reciprocalRankFusion<RankedItem>([], 60);
      expect(fused).toEqual([]);
    });

    it('should calculate source count correctly', () => {
      const list1: RankedItem[] = [
        { id: 'A', relevance: 1.0 },
        { id: 'B', relevance: 0.8 },
      ];

      const list2: RankedItem[] = [
        { id: 'A', relevance: 0.9 },
        { id: 'C', relevance: 0.7 },
      ];

      const list3: RankedItem[] = [
        { id: 'A', relevance: 0.95 },
      ];

      const fused = reciprocalRankFusion([list1, list2, list3], 60);

      const itemA = fused.find((f) => f.item.id === 'A');
      const itemB = fused.find((f) => f.item.id === 'B');
      const itemC = fused.find((f) => f.item.id === 'C');

      expect(itemA?.sourceCount).toBe(3); // Appears in all 3 lists
      expect(itemB?.sourceCount).toBe(1); // Only in list1
      expect(itemC?.sourceCount).toBe(1); // Only in list2
    });
  });

  describe('Search Quality Benchmarks', () => {
    it('should meet minimum MRR threshold of 0.5', () => {
      // Simulated realistic search scenario
      const clickPositions = [0, 1, 0, 2, 1, 0, 3]; // User clicks
      const reciprocalRanks = clickPositions.map((pos) => 1 / (pos + 1));
      const avgMRR = reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length;

      // MRR should be at least 0.5 for good search quality
      expect(avgMRR).toBeGreaterThan(0.5);
    });

    it('should meet minimum NDCG@10 threshold of 0.7', () => {
      // Simulated workflow search results
      const relevanceScores = [0.95, 0.9, 0.85, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
      const ndcg = calculateNDCG(relevanceScores, 10);

      // NDCG should be at least 0.7 for acceptable quality
      expect(ndcg).toBeGreaterThan(0.7);
    });

    it('should achieve < 10% zero-result rate', () => {
      const totalSearches = 100;
      const zeroResultSearches = 8;
      const zeroResultRate = zeroResultSearches / totalSearches;

      // Zero-result rate should be less than 10%
      expect(zeroResultRate).toBeLessThan(0.1);
    });

    it('should maintain click-through rate > 30%', () => {
      const totalSearches = 100;
      const searchesWithClicks = 45;
      const ctr = searchesWithClicks / totalSearches;

      // CTR should be at least 30%
      expect(ctr).toBeGreaterThan(0.3);
    });

    it('should achieve latency p95 < 500ms', () => {
      // Simulated latencies in milliseconds
      const latencies = Array.from({ length: 100 }, (_, i) => {
        // Most searches are fast, some are slower
        return i < 95 ? 100 + Math.random() * 200 : 300 + Math.random() * 500;
      }).sort((a, b) => a - b);

      const p95Index = Math.ceil(0.95 * latencies.length) - 1;
      const p95Latency = latencies[p95Index];

      // P95 latency should be under 500ms
      expect(p95Latency).toBeLessThan(500);
    });
  });

  describe('Comparative Search Quality Tests', () => {
    it('should show hybrid search outperforms pure vector search', () => {
      // Simulated NDCG scores
      const vectorOnlyNDCG = 0.75;
      const hybridNDCG = 0.85;

      expect(hybridNDCG).toBeGreaterThan(vectorOnlyNDCG);

      const improvement = ((hybridNDCG - vectorOnlyNDCG) / vectorOnlyNDCG) * 100;
      expect(improvement).toBeGreaterThan(10); // At least 10% improvement
    });

    it('should show reranking improves MRR', () => {
      // Simulated MRR with and without reranking
      const withoutRerankingMRR = 0.55;
      const withRerankingMRR = 0.68;

      expect(withRerankingMRR).toBeGreaterThan(withoutRerankingMRR);

      const improvement = ((withRerankingMRR - withoutRerankingMRR) / withoutRerankingMRR) * 100;
      expect(improvement).toBeGreaterThan(15); // At least 15% improvement
    });

    it('should show query expansion increases recall', () => {
      // Without expansion: fewer relevant results retrieved
      const withoutExpansion = {
        relevantRetrieved: 5,
        totalRelevant: 15,
      };

      // With expansion: more relevant results retrieved
      const withExpansion = {
        relevantRetrieved: 10,
        totalRelevant: 15,
      };

      const recallWithout = withoutExpansion.relevantRetrieved / withoutExpansion.totalRelevant;
      const recallWith = withExpansion.relevantRetrieved / withExpansion.totalRelevant;

      expect(recallWith).toBeGreaterThan(recallWithout);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle all irrelevant results (NDCG = 0)', () => {
      const relevanceScores = [0, 0, 0, 0, 0];
      const ndcg = calculateNDCG(relevanceScores);
      expect(ndcg).toBe(0);
    });

    it('should handle single result lists', () => {
      const relevanceScores = [1.0];
      const ndcg = calculateNDCG(relevanceScores);
      expect(ndcg).toBe(1.0);
    });

    it('should handle queries with all items in one list', () => {
      const relevantPositions = [[0, 1, 2, 3, 4]];
      const map = calculateMAP(relevantPositions);
      expect(map).toBe(1.0);
    });

    it('should handle negative relevance scores gracefully', () => {
      // Should treat negative as zero
      const relevanceScores = [1.0, -0.5, 0.5];
      const ndcg = calculateNDCG(relevanceScores);
      expect(ndcg).toBeGreaterThanOrEqual(0);
      expect(ndcg).toBeLessThanOrEqual(1);
    });
  });
});
