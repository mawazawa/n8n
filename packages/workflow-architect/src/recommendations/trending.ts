/**
 * Trending Calculator
 *
 * Calculates trending workflows using velocity scoring, recency weighting,
 * and category-based trending analysis.
 */

import type { Recommendation, RecommendationContext, TrendingWorkflow } from './types.js';

interface WorkflowMetrics {
	workflowId: string;
	views: number;
	uses: number;
	saves: number;
	shares: number;
	timestamp: string;
}

interface TrendingConfig {
	timeWindow: number; // hours
	velocityWeight: number;
	recencyWeight: number;
	minInteractions: number;
}

export class TrendingCalculator {
	private config: TrendingConfig = {
		timeWindow: 24, // Last 24 hours
		velocityWeight: 0.6,
		recencyWeight: 0.4,
		minInteractions: 5,
	};

	private trendingCache: Map<string, TrendingWorkflow[]> = new Map();
	private cacheTimeout = 600000; // 10 minutes

	/**
	 * Generate trending recommendations
	 */
	async recommend(context: RecommendationContext): Promise<Recommendation[]> {
		const { userId } = context;

		// Get trending workflows
		const trending = await this.calculateTrending(this.config.timeWindow);

		// Filter out workflows user has already interacted with
		const userWorkflows = await this.getUserWorkflows(userId);
		const userWorkflowSet = new Set(userWorkflows);

		const filtered = trending.filter((t) => !userWorkflowSet.has(t.workflowId));

		// Convert to recommendations
		return filtered.slice(0, 10).map((item) => ({
			id: this.generateRecommendationId(),
			workflowId: item.workflowId,
			type: 'trending' as const,
			score: item.trendingScore,
			reason: this.generateTrendingReason(item),
			confidence: this.calculateConfidence(item),
			metadata: {
				velocity: item.velocity,
				recentViews: item.recentViews,
				recentUses: item.recentUses,
				growthRate: item.growthRate,
				category: item.category,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Calculate trending workflows
	 */
	async calculateTrending(windowHours: number): Promise<TrendingWorkflow[]> {
		const cacheKey = `trending_${windowHours}`;

		// Check cache
		const cached = this.trendingCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		// Get metrics for time window
		const now = new Date();
		const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

		const metrics = await this.getMetricsInWindow(windowStart, now);

		// Aggregate by workflow
		const aggregated = this.aggregateMetrics(metrics);

		// Calculate trending scores
		const trending: TrendingWorkflow[] = [];

		for (const [workflowId, data] of aggregated) {
			// Skip if below minimum interactions
			if (data.totalInteractions < this.config.minInteractions) {
				continue;
			}

			const velocity = this.calculateVelocity(data, windowHours);
			const recencyScore = this.calculateRecencyScore(data.latestTimestamp, now);
			const growthRate = this.calculateGrowthRate(workflowId, data, windowHours);

			const trendingScore =
				velocity * this.config.velocityWeight +
				recencyScore * this.config.recencyWeight;

			trending.push({
				workflowId,
				trendingScore,
				velocity,
				recentViews: data.views,
				recentUses: data.uses,
				growthRate,
				category: data.category,
				calculatedAt: new Date().toISOString(),
			});
		}

		// Sort by trending score
		const sorted = trending.sort((a, b) => b.trendingScore - a.trendingScore);

		// Cache results
		this.trendingCache.set(cacheKey, sorted);
		setTimeout(() => this.trendingCache.delete(cacheKey), this.cacheTimeout);

		return sorted;
	}

	/**
	 * Calculate velocity (interactions per hour)
	 */
	private calculateVelocity(data: AggregatedMetrics, windowHours: number): number {
		const totalInteractions = data.totalInteractions;
		return totalInteractions / windowHours;
	}

	/**
	 * Calculate recency score
	 */
	private calculateRecencyScore(latestTimestamp: Date, now: Date): number {
		const hoursSinceLatest = (now.getTime() - latestTimestamp.getTime()) / (1000 * 60 * 60);

		// Exponential decay - more recent = higher score
		return Math.exp(-hoursSinceLatest / 6); // Half-life of 6 hours
	}

	/**
	 * Calculate growth rate
	 */
	private async calculateGrowthRate(
		workflowId: string,
		currentData: AggregatedMetrics,
		windowHours: number,
	): Promise<number> {
		// Get previous period metrics for comparison
		const now = new Date();
		const previousStart = new Date(now.getTime() - 2 * windowHours * 60 * 60 * 1000);
		const previousEnd = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

		const previousMetrics = await this.getMetricsInWindow(previousStart, previousEnd);
		const previousData = this.aggregateMetrics(previousMetrics).get(workflowId);

		if (!previousData) {
			return 1; // New workflows get default growth
		}

		const currentInteractions = currentData.totalInteractions;
		const previousInteractions = previousData.totalInteractions;

		if (previousInteractions === 0) {
			return currentInteractions > 0 ? 2 : 1;
		}

		return currentInteractions / previousInteractions;
	}

	/**
	 * Get metrics within time window
	 */
	private async getMetricsInWindow(
		start: Date,
		end: Date,
	): Promise<WorkflowMetrics[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Aggregate metrics by workflow
	 */
	private aggregateMetrics(
		metrics: WorkflowMetrics[],
	): Map<string, AggregatedMetrics> {
		const aggregated = new Map<string, AggregatedMetrics>();

		for (const metric of metrics) {
			if (!aggregated.has(metric.workflowId)) {
				aggregated.set(metric.workflowId, {
					workflowId: metric.workflowId,
					views: 0,
					uses: 0,
					saves: 0,
					shares: 0,
					totalInteractions: 0,
					latestTimestamp: new Date(metric.timestamp),
					category: 'general',
				});
			}

			const data = aggregated.get(metric.workflowId)!;

			data.views += metric.views;
			data.uses += metric.uses;
			data.saves += metric.saves;
			data.shares += metric.shares;
			data.totalInteractions += metric.views + metric.uses * 2 + metric.saves * 3 + metric.shares * 4;

			const timestamp = new Date(metric.timestamp);
			if (timestamp > data.latestTimestamp) {
				data.latestTimestamp = timestamp;
			}
		}

		return aggregated;
	}

	/**
	 * Generate trending reason
	 */
	private generateTrendingReason(trending: TrendingWorkflow): string {
		const { velocity, growthRate, recentViews, category } = trending;

		if (growthRate > 1.5) {
			return `Rapidly growing in popularity (${Math.round(growthRate * 100)}% growth)`;
		}

		if (velocity > 10) {
			return `Trending now with ${Math.round(velocity)} interactions/hour`;
		}

		if (recentViews > 100) {
			return `Popular with ${recentViews} recent views`;
		}

		return `Trending in ${category}`;
	}

	/**
	 * Calculate confidence
	 */
	private calculateConfidence(trending: TrendingWorkflow): number {
		const { velocity, recentViews, growthRate } = trending;

		// Higher confidence for more interactions and stable growth
		let confidence = 0.5;

		if (velocity > 5) confidence += 0.2;
		if (recentViews > 50) confidence += 0.2;
		if (growthRate > 1.2 && growthRate < 5) confidence += 0.1; // Stable growth

		return Math.min(confidence, 1);
	}

	/**
	 * Get user workflows
	 */
	private async getUserWorkflows(userId: string): Promise<string[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_trending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get trending by category
	 */
	async getTrendingByCategory(category: string, limit = 10): Promise<TrendingWorkflow[]> {
		const trending = await this.calculateTrending(this.config.timeWindow);
		return trending.filter((t) => t.category === category).slice(0, limit);
	}

	/**
	 * Update trending config
	 */
	updateConfig(config: Partial<TrendingConfig>): void {
		this.config = { ...this.config, ...config };
		this.trendingCache.clear(); // Clear cache when config changes
	}

	/**
	 * Get current config
	 */
	getConfig(): TrendingConfig {
		return { ...this.config };
	}
}

interface AggregatedMetrics {
	workflowId: string;
	views: number;
	uses: number;
	saves: number;
	shares: number;
	totalInteractions: number;
	latestTimestamp: Date;
	category: string;
}
