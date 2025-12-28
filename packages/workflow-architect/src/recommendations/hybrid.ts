/**
 * Hybrid Recommender
 *
 * Combines multiple recommendation strategies (collaborative, content-based,
 * contextual, trending) with dynamic weight adjustment and A/B testable
 * configurations for optimal performance.
 */

import type { Recommendation } from './types.js';

interface StrategyWeights {
	[strategyName: string]: number;
}

interface CombinationConfig {
	method: 'weighted' | 'rank_fusion' | 'cascade';
	normalizeScores: boolean;
	diversityBoost: number;
}

export class HybridRecommender {
	private defaultWeights: StrategyWeights = {
		collaborative: 0.3,
		content: 0.25,
		contextual: 0.2,
		trending: 0.15,
		personalized: 0.1,
	};

	private config: CombinationConfig = {
		method: 'weighted',
		normalizeScores: true,
		diversityBoost: 0.1,
	};

	/**
	 * Combine recommendations from multiple strategies
	 */
	combine(
		strategyResults: Map<string, Recommendation[]>,
		weights?: StrategyWeights,
	): Recommendation[] {
		const activeWeights = weights ?? this.defaultWeights;

		switch (this.config.method) {
			case 'weighted':
				return this.weightedCombination(strategyResults, activeWeights);
			case 'rank_fusion':
				return this.rankFusion(strategyResults, activeWeights);
			case 'cascade':
				return this.cascadeCombination(strategyResults, activeWeights);
			default:
				return this.weightedCombination(strategyResults, activeWeights);
		}
	}

	/**
	 * Weighted combination of strategies
	 */
	private weightedCombination(
		strategyResults: Map<string, Recommendation[]>,
		weights: StrategyWeights,
	): Recommendation[] {
		// Collect all unique workflow IDs
		const workflowScores = new Map<string, {
			totalScore: number;
			contributions: Map<string, number>;
			recommendations: Recommendation[];
		}>();

		// Normalize weights
		const normalizedWeights = this.normalizeWeights(weights);

		// Aggregate scores from each strategy
		for (const [strategy, recommendations] of strategyResults) {
			const weight = normalizedWeights[strategy] ?? 0;
			if (weight === 0) continue;

			// Normalize scores within strategy if needed
			const normalized = this.config.normalizeScores
				? this.normalizeScoresWithinStrategy(recommendations)
				: recommendations;

			for (const rec of normalized) {
				const workflowId = rec.workflowId;

				if (!workflowScores.has(workflowId)) {
					workflowScores.set(workflowId, {
						totalScore: 0,
						contributions: new Map(),
						recommendations: [],
					});
				}

				const entry = workflowScores.get(workflowId)!;
				const weightedScore = rec.score * weight;

				entry.totalScore += weightedScore;
				entry.contributions.set(strategy, rec.score);
				entry.recommendations.push(rec);
			}
		}

		// Convert to recommendations
		const combined: Recommendation[] = [];

		for (const [workflowId, entry] of workflowScores) {
			// Use the first recommendation as base
			const baseRec = entry.recommendations[0];

			// Calculate average confidence
			const avgConfidence = entry.recommendations.reduce((sum, r) => sum + r.confidence, 0) / entry.recommendations.length;

			// Determine primary type based on highest contributing strategy
			const primaryStrategy = this.getPrimaryStrategy(entry.contributions);

			combined.push({
				id: this.generateRecommendationId(),
				workflowId,
				type: this.mapStrategyToType(primaryStrategy),
				score: entry.totalScore,
				reason: this.combineReasons(entry.recommendations),
				confidence: avgConfidence,
				metadata: {
					contributions: Object.fromEntries(entry.contributions),
					strategies: Array.from(entry.contributions.keys()),
				},
				createdAt: new Date().toISOString(),
			});
		}

		return combined.sort((a, b) => b.score - a.score);
	}

	/**
	 * Rank fusion (Borda count)
	 */
	private rankFusion(
		strategyResults: Map<string, Recommendation[]>,
		weights: StrategyWeights,
	): Recommendation[] {
		const workflowRanks = new Map<string, {
			totalRank: number;
			count: number;
			recommendations: Recommendation[];
		}>();

		const normalizedWeights = this.normalizeWeights(weights);

		for (const [strategy, recommendations] of strategyResults) {
			const weight = normalizedWeights[strategy] ?? 0;
			if (weight === 0) continue;

			// Assign ranks (higher rank = better)
			recommendations.forEach((rec, index) => {
				const rank = (recommendations.length - index) * weight;

				if (!workflowRanks.has(rec.workflowId)) {
					workflowRanks.set(rec.workflowId, {
						totalRank: 0,
						count: 0,
						recommendations: [],
					});
				}

				const entry = workflowRanks.get(rec.workflowId)!;
				entry.totalRank += rank;
				entry.count += 1;
				entry.recommendations.push(rec);
			});
		}

		const combined: Recommendation[] = [];

		for (const [workflowId, entry] of workflowRanks) {
			const baseRec = entry.recommendations[0];
			const avgRank = entry.totalRank / entry.count;

			combined.push({
				id: this.generateRecommendationId(),
				workflowId,
				type: baseRec.type,
				score: avgRank / 100, // Normalize to 0-1 range
				reason: this.combineReasons(entry.recommendations),
				confidence: entry.count / strategyResults.size, // More strategies = higher confidence
				metadata: {
					rank: avgRank,
					strategyCount: entry.count,
				},
				createdAt: new Date().toISOString(),
			});
		}

		return combined.sort((a, b) => b.score - a.score);
	}

	/**
	 * Cascade combination (waterfall approach)
	 */
	private cascadeCombination(
		strategyResults: Map<string, Recommendation[]>,
		weights: StrategyWeights,
	): Recommendation[] {
		// Sort strategies by weight (descending)
		const sortedStrategies = Array.from(strategyResults.entries())
			.sort((a, b) => (weights[b[0]] ?? 0) - (weights[a[0]] ?? 0));

		const combined: Recommendation[] = [];
		const seenWorkflows = new Set<string>();
		const targetCount = 20; // Target number of recommendations

		// Take top recommendations from each strategy in order
		for (const [strategy, recommendations] of sortedStrategies) {
			for (const rec of recommendations) {
				if (seenWorkflows.has(rec.workflowId)) continue;
				if (combined.length >= targetCount) break;

				combined.push({
					...rec,
					id: this.generateRecommendationId(),
					metadata: {
						...rec.metadata,
						primaryStrategy: strategy,
					},
				});

				seenWorkflows.add(rec.workflowId);
			}

			if (combined.length >= targetCount) break;
		}

		return combined;
	}

	/**
	 * Normalize weights to sum to 1
	 */
	private normalizeWeights(weights: StrategyWeights): StrategyWeights {
		const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

		if (total === 0) return weights;

		const normalized: StrategyWeights = {};
		for (const [strategy, weight] of Object.entries(weights)) {
			normalized[strategy] = weight / total;
		}

		return normalized;
	}

	/**
	 * Normalize scores within a strategy to 0-1 range
	 */
	private normalizeScoresWithinStrategy(recommendations: Recommendation[]): Recommendation[] {
		if (recommendations.length === 0) return recommendations;

		const scores = recommendations.map((r) => r.score);
		const min = Math.min(...scores);
		const max = Math.max(...scores);
		const range = max - min;

		if (range === 0) {
			return recommendations.map((r) => ({ ...r, score: 1 }));
		}

		return recommendations.map((r) => ({
			...r,
			score: (r.score - min) / range,
		}));
	}

	/**
	 * Get primary strategy (highest contribution)
	 */
	private getPrimaryStrategy(contributions: Map<string, number>): string {
		let maxScore = 0;
		let primaryStrategy = 'hybrid';

		for (const [strategy, score] of contributions) {
			if (score > maxScore) {
				maxScore = score;
				primaryStrategy = strategy;
			}
		}

		return primaryStrategy;
	}

	/**
	 * Map strategy name to recommendation type
	 */
	private mapStrategyToType(strategy: string): 'similar' | 'complementary' | 'trending' | 'personalized' {
		switch (strategy) {
			case 'collaborative':
			case 'content':
				return 'similar';
			case 'contextual':
				return 'complementary';
			case 'trending':
				return 'trending';
			case 'personalized':
				return 'personalized';
			default:
				return 'personalized';
		}
	}

	/**
	 * Combine reasons from multiple recommendations
	 */
	private combineReasons(recommendations: Recommendation[]): string {
		// Use the most specific reason available
		const reasons = recommendations.map((r) => r.reason).filter((r) => r.length > 0);

		if (reasons.length === 0) {
			return 'Recommended for you';
		}

		// If all reasons are the same, use one
		if (new Set(reasons).size === 1) {
			return reasons[0];
		}

		// Otherwise, create a combined reason
		return `Recommended based on multiple factors`;
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_hybrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Update combination method
	 */
	setCombinationMethod(method: 'weighted' | 'rank_fusion' | 'cascade'): void {
		this.config.method = method;
	}

	/**
	 * Update default weights
	 */
	updateDefaultWeights(weights: StrategyWeights): void {
		this.defaultWeights = { ...weights };
	}

	/**
	 * Enable/disable score normalization
	 */
	setNormalizeScores(normalize: boolean): void {
		this.config.normalizeScores = normalize;
	}

	/**
	 * Set diversity boost
	 */
	setDiversityBoost(boost: number): void {
		this.config.diversityBoost = Math.max(0, Math.min(1, boost));
	}

	/**
	 * Get current configuration
	 */
	getConfig(): CombinationConfig & { weights: StrategyWeights } {
		return {
			...this.config,
			weights: { ...this.defaultWeights },
		};
	}
}
