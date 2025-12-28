/**
 * Diversity Optimizer
 *
 * Ensures recommendation diversity to avoid filter bubbles by balancing
 * categories, promoting novelty, and maintaining variety in results.
 */

import type { Recommendation, DiversityConfig } from './types.js';

interface DiversityMetrics {
	categoryDistribution: Map<string, number>;
	typeDistribution: Map<string, number>;
	avgNovelty: number;
	diversityScore: number;
}

export class DiversityOptimizer {
	private config: DiversityConfig = {
		categoryThreshold: 0.5, // Max 50% from same category
		typeThreshold: 0.6, // Max 60% of same type
		noveltyWeight: 0.2,
		minNovelty: 0.1,
	};

	/**
	 * Diversify recommendations to avoid filter bubbles
	 */
	diversify(recommendations: Recommendation[]): Recommendation[] {
		if (recommendations.length === 0) return recommendations;

		// Sort by score initially
		const sorted = [...recommendations].sort((a, b) => b.score - a.score);

		// Apply diversity optimization
		const diversified = this.greedyDiversification(sorted);

		// Apply novelty boost
		const withNovelty = this.applyNoveltyBoost(diversified);

		// Re-sort by adjusted scores
		return withNovelty.sort((a, b) => b.score - a.score);
	}

	/**
	 * Greedy diversification algorithm
	 */
	private greedyDiversification(recommendations: Recommendation[]): Recommendation[] {
		const result: Recommendation[] = [];
		const categoryCount = new Map<string, number>();
		const typeCount = new Map<string, number>();

		let totalSelected = 0;

		for (const rec of recommendations) {
			// Get category and type
			const category = (rec.metadata.category as string) ?? 'general';
			const type = rec.type;

			// Check if adding this would violate diversity constraints
			const categoryRatio = (categoryCount.get(category) ?? 0) / (totalSelected + 1);
			const typeRatio = (typeCount.get(type) ?? 0) / (totalSelected + 1);

			if (categoryRatio >= this.config.categoryThreshold || typeRatio >= this.config.typeThreshold) {
				// Try to find alternative with similar score but different category/type
				continue; // Skip for now, could implement swap logic
			}

			// Add to result
			result.push(rec);

			// Update counts
			categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
			typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
			totalSelected++;
		}

		// If we haven't filled enough, add remaining recommendations
		if (result.length < Math.min(recommendations.length, 20)) {
			const remaining = recommendations.filter((r) => !result.includes(r));
			result.push(...remaining.slice(0, 20 - result.length));
		}

		return result;
	}

	/**
	 * Apply novelty boost to scores
	 */
	private applyNoveltyBoost(recommendations: Recommendation[]): Recommendation[] {
		return recommendations.map((rec) => {
			const novelty = this.calculateNovelty(rec);
			const noveltyBoost = novelty * this.config.noveltyWeight;

			return {
				...rec,
				score: Math.min(rec.score + noveltyBoost, 1),
				metadata: {
					...rec.metadata,
					novelty,
					noveltyBoost,
				},
			};
		});
	}

	/**
	 * Calculate novelty score for a recommendation
	 */
	private calculateNovelty(rec: Recommendation): number {
		// Factors for novelty:
		// 1. How different from user's typical preferences
		// 2. How unique the workflow is
		// 3. How recently created

		// For now, use a simple heuristic based on metadata
		const baseNovelty = this.config.minNovelty;

		// Check if workflow is from a different category than typical
		const categoryNovelty = this.getCategoryNovelty(rec);

		// Check if workflow uses uncommon nodes
		const nodeNovelty = this.getNodeNovelty(rec);

		// Combine novelty factors
		return Math.min(baseNovelty + categoryNovelty * 0.4 + nodeNovelty * 0.4, 1);
	}

	/**
	 * Get category novelty
	 */
	private getCategoryNovelty(rec: Recommendation): number {
		// In real implementation, compare against user's typical categories
		// For now, return neutral score
		return 0.5;
	}

	/**
	 * Get node novelty
	 */
	private getNodeNovelty(rec: Recommendation): number {
		// In real implementation, check if workflow uses uncommon nodes
		// For now, return neutral score
		return 0.5;
	}

	/**
	 * Calculate diversity metrics for a set of recommendations
	 */
	calculateMetrics(recommendations: Recommendation[]): DiversityMetrics {
		if (recommendations.length === 0) {
			return {
				categoryDistribution: new Map(),
				typeDistribution: new Map(),
				avgNovelty: 0,
				diversityScore: 0,
			};
		}

		const categoryDistribution = new Map<string, number>();
		const typeDistribution = new Map<string, number>();
		let totalNovelty = 0;

		for (const rec of recommendations) {
			const category = (rec.metadata.category as string) ?? 'general';
			const type = rec.type;

			categoryDistribution.set(category, (categoryDistribution.get(category) ?? 0) + 1);
			typeDistribution.set(type, (typeDistribution.get(type) ?? 0) + 1);

			totalNovelty += (rec.metadata.novelty as number) ?? 0.5;
		}

		const avgNovelty = totalNovelty / recommendations.length;

		// Calculate diversity score (Shannon entropy)
		const categoryEntropy = this.calculateEntropy(categoryDistribution, recommendations.length);
		const typeEntropy = this.calculateEntropy(typeDistribution, recommendations.length);

		const diversityScore = (categoryEntropy + typeEntropy) / 2;

		return {
			categoryDistribution,
			typeDistribution,
			avgNovelty,
			diversityScore,
		};
	}

	/**
	 * Calculate Shannon entropy
	 */
	private calculateEntropy(distribution: Map<string, number>, total: number): number {
		let entropy = 0;

		for (const count of distribution.values()) {
			const probability = count / total;
			entropy -= probability * Math.log2(probability);
		}

		return entropy;
	}

	/**
	 * Ensure minimum diversity across categories
	 */
	ensureMinimumDiversity(
		recommendations: Recommendation[],
		minCategories = 3,
	): Recommendation[] {
		const categoryDistribution = new Map<string, number>();

		for (const rec of recommendations) {
			const category = (rec.metadata.category as string) ?? 'general';
			categoryDistribution.set(category, (categoryDistribution.get(category) ?? 0) + 1);
		}

		if (categoryDistribution.size >= minCategories) {
			return recommendations; // Already diverse enough
		}

		// Need to find more diverse recommendations
		// In real implementation, would fetch additional recommendations from different categories
		return recommendations;
	}

	/**
	 * Balance category representation
	 */
	balanceCategories(recommendations: Recommendation[]): Recommendation[] {
		const categorized = new Map<string, Recommendation[]>();

		// Group by category
		for (const rec of recommendations) {
			const category = (rec.metadata.category as string) ?? 'general';
			if (!categorized.has(category)) {
				categorized.set(category, []);
			}
			categorized.get(category)!.push(rec);
		}

		// Sort categories by size
		const categories = Array.from(categorized.entries()).sort(
			(a, b) => b[1].length - a[1].length,
		);

		// Round-robin selection from each category
		const balanced: Recommendation[] = [];
		let categoryIndex = 0;

		while (balanced.length < recommendations.length) {
			const category = categories[categoryIndex % categories.length];

			if (category[1].length > 0) {
				const rec = category[1].shift()!;
				balanced.push(rec);
			}

			categoryIndex++;

			// Break if all categories are empty
			if (categories.every(([_, recs]) => recs.length === 0)) {
				break;
			}
		}

		return balanced;
	}

	/**
	 * Update diversity configuration
	 */
	updateConfig(config: Partial<DiversityConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): DiversityConfig {
		return { ...this.config };
	}

	/**
	 * Check if recommendations meet diversity requirements
	 */
	meetsRequirements(recommendations: Recommendation[]): boolean {
		const metrics = this.calculateMetrics(recommendations);

		// Check category distribution
		for (const count of metrics.categoryDistribution.values()) {
			if (count / recommendations.length > this.config.categoryThreshold) {
				return false;
			}
		}

		// Check type distribution
		for (const count of metrics.typeDistribution.values()) {
			if (count / recommendations.length > this.config.typeThreshold) {
				return false;
			}
		}

		// Check minimum novelty
		if (metrics.avgNovelty < this.config.minNovelty) {
			return false;
		}

		return true;
	}
}
