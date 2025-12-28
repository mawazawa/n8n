/**
 * Recommendation Engine
 *
 * Main recommendation engine that combines multiple strategies to generate
 * personalized workflow recommendations with diversity enforcement and
 * score normalization.
 */

import { z } from 'zod';
import type {
	Recommendation,
	RecommendationContext,
	RecommendationRequest,
	RecommendationResponse,
	RecommendationStrategy,
	RecommendationScore,
} from './types.js';
import { CollaborativeFilter } from './collaborative.js';
import { ContentFilter } from './content.js';
import { HybridRecommender } from './hybrid.js';
import { ContextualRecommender } from './context.js';
import { TrendingCalculator } from './trending.js';
import { PersonalizationEngine } from './personalization.js';
import { DiversityOptimizer } from './diversity.js';
import { ExplanationBuilder } from './explanation.js';

const RecommendationRequestSchema = z.object({
	userId: z.string(),
	context: z
		.object({
			currentWorkflow: z.string().optional(),
			timeOfDay: z.number().optional(),
			dayOfWeek: z.number().optional(),
			userTier: z.enum(['free', 'premium', 'enterprise']).optional(),
			location: z.string().optional(),
		})
		.optional(),
	strategies: z.array(z.string()).optional(),
	limit: z.number().min(1).max(100).default(10),
	excludeWorkflows: z.array(z.string()).optional(),
});

export class RecommendationEngine {
	private collaborativeFilter: CollaborativeFilter;
	private contentFilter: ContentFilter;
	private hybridRecommender: HybridRecommender;
	private contextualRecommender: ContextualRecommender;
	private trendingCalculator: TrendingCalculator;
	private personalizationEngine: PersonalizationEngine;
	private diversityOptimizer: DiversityOptimizer;
	private explanationBuilder: ExplanationBuilder;
	private strategies: Map<string, RecommendationStrategy>;
	private performanceTarget = 500; // ms

	constructor(config?: {
		performanceTarget?: number;
		strategies?: RecommendationStrategy[];
	}) {
		this.collaborativeFilter = new CollaborativeFilter();
		this.contentFilter = new ContentFilter();
		this.hybridRecommender = new HybridRecommender();
		this.contextualRecommender = new ContextualRecommender();
		this.trendingCalculator = new TrendingCalculator();
		this.personalizationEngine = new PersonalizationEngine();
		this.diversityOptimizer = new DiversityOptimizer();
		this.explanationBuilder = new ExplanationBuilder();

		if (config?.performanceTarget) {
			this.performanceTarget = config.performanceTarget;
		}

		this.strategies = new Map(
			(config?.strategies ?? this.getDefaultStrategies()).map((s) => [s.name, s]),
		);
	}

	/**
	 * Generate recommendations for a user
	 */
	async recommend(request: RecommendationRequest): Promise<RecommendationResponse> {
		const startTime = Date.now();

		// Validate request
		const validated = RecommendationRequestSchema.parse(request);

		// Build full context
		const context = await this.buildContext(validated);

		// Get user profile for personalization
		const userProfile = await this.personalizationEngine.buildProfile(validated.userId);

		// Generate recommendations from multiple strategies
		const strategyResults = await this.generateFromStrategies(context, validated.strategies);

		// Combine strategies using hybrid approach
		const combined = this.hybridRecommender.combine(
			strategyResults,
			this.getActiveWeights(validated.strategies),
		);

		// Apply personalization
		const personalized = this.applyPersonalization(combined, userProfile);

		// Normalize scores
		const normalized = this.normalizeScores(personalized);

		// Apply diversity enforcement
		const diversified = this.diversityOptimizer.diversify(normalized);

		// Filter excluded workflows
		const filtered = this.filterExcluded(diversified, validated.excludeWorkflows ?? []);

		// Limit results
		const limited = filtered.slice(0, validated.limit);

		// Generate explanations
		const explanations = await this.generateExplanations(limited, context);

		const performanceMs = Date.now() - startTime;

		// Log if performance target exceeded
		if (performanceMs > this.performanceTarget) {
			console.warn(
				`Recommendation generation exceeded target: ${performanceMs}ms > ${this.performanceTarget}ms`,
			);
		}

		return {
			recommendations: limited,
			explanations,
			requestId: this.generateRequestId(),
			generatedAt: new Date().toISOString(),
			performanceMs,
		};
	}

	/**
	 * Build full recommendation context
	 */
	private async buildContext(request: z.infer<typeof RecommendationRequestSchema>): Promise<RecommendationContext> {
		const now = new Date();

		return {
			userId: request.userId,
			currentWorkflow: request.context?.currentWorkflow,
			recentActivity: [], // Fetched from database in real implementation
			timeOfDay: request.context?.timeOfDay ?? now.getHours(),
			dayOfWeek: request.context?.dayOfWeek ?? now.getDay(),
			userTier: request.context?.userTier ?? 'free',
			location: request.context?.location,
		};
	}

	/**
	 * Generate recommendations from multiple strategies
	 */
	private async generateFromStrategies(
		context: RecommendationContext,
		requestedStrategies?: string[],
	): Promise<Map<string, Recommendation[]>> {
		const results = new Map<string, Recommendation[]>();
		const activeStrategies = this.getActiveStrategies(requestedStrategies);

		// Execute strategies in parallel for performance
		const promises = activeStrategies.map(async (strategy) => {
			try {
				const recommendations = await this.executeStrategy(strategy, context);
				return { name: strategy.name, recommendations };
			} catch (error) {
				console.error(`Strategy ${strategy.name} failed:`, error);
				return { name: strategy.name, recommendations: [] };
			}
		});

		const settled = await Promise.all(promises);

		for (const { name, recommendations } of settled) {
			results.set(name, recommendations);
		}

		return results;
	}

	/**
	 * Execute a specific recommendation strategy
	 */
	private async executeStrategy(
		strategy: RecommendationStrategy,
		context: RecommendationContext,
	): Promise<Recommendation[]> {
		switch (strategy.name) {
			case 'collaborative':
				return await this.collaborativeFilter.recommend(context);
			case 'content':
				return await this.contentFilter.recommend(context);
			case 'contextual':
				return await this.contextualRecommender.recommend(context);
			case 'trending':
				return await this.trendingCalculator.recommend(context);
			case 'personalized':
				return await this.personalizationEngine.recommend(context);
			default:
				return [];
		}
	}

	/**
	 * Apply personalization to recommendations
	 */
	private applyPersonalization(
		recommendations: Recommendation[],
		userProfile: unknown,
	): Recommendation[] {
		// In real implementation, adjust scores based on user profile
		return recommendations;
	}

	/**
	 * Normalize scores to 0-1 range
	 */
	private normalizeScores(recommendations: Recommendation[]): Recommendation[] {
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
	 * Filter excluded workflows
	 */
	private filterExcluded(
		recommendations: Recommendation[],
		excluded: string[],
	): Recommendation[] {
		if (excluded.length === 0) return recommendations;

		const excludedSet = new Set(excluded);
		return recommendations.filter((r) => !excludedSet.has(r.workflowId));
	}

	/**
	 * Generate explanations for recommendations
	 */
	private async generateExplanations(
		recommendations: Recommendation[],
		context: RecommendationContext,
	): Promise<Map<string, any>> {
		const explanations = new Map();

		for (const rec of recommendations) {
			const explanation = await this.explanationBuilder.explain(rec, context);
			explanations.set(rec.id, explanation);
		}

		return explanations;
	}

	/**
	 * Get active strategies based on request
	 */
	private getActiveStrategies(requestedStrategies?: string[]): RecommendationStrategy[] {
		if (requestedStrategies && requestedStrategies.length > 0) {
			return requestedStrategies
				.map((name) => this.strategies.get(name))
				.filter((s): s is RecommendationStrategy => s !== undefined && s.enabled);
		}

		return Array.from(this.strategies.values()).filter((s) => s.enabled);
	}

	/**
	 * Get active weights for strategies
	 */
	private getActiveWeights(requestedStrategies?: string[]): Record<string, number> {
		const activeStrategies = this.getActiveStrategies(requestedStrategies);
		const weights: Record<string, number> = {};

		for (const strategy of activeStrategies) {
			weights[strategy.name] = strategy.weight;
		}

		return weights;
	}

	/**
	 * Get default strategy configuration
	 */
	private getDefaultStrategies(): RecommendationStrategy[] {
		return [
			{
				name: 'collaborative',
				weight: 0.3,
				enabled: true,
				config: {},
			},
			{
				name: 'content',
				weight: 0.25,
				enabled: true,
				config: {},
			},
			{
				name: 'contextual',
				weight: 0.2,
				enabled: true,
				config: {},
			},
			{
				name: 'trending',
				weight: 0.15,
				enabled: true,
				config: {},
			},
			{
				name: 'personalized',
				weight: 0.1,
				enabled: true,
				config: {},
			},
		];
	}

	/**
	 * Generate unique request ID
	 */
	private generateRequestId(): string {
		return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Update strategy weights dynamically
	 */
	updateStrategyWeights(weights: Record<string, number>): void {
		for (const [name, weight] of Object.entries(weights)) {
			const strategy = this.strategies.get(name);
			if (strategy) {
				strategy.weight = weight;
			}
		}
	}

	/**
	 * Enable/disable a strategy
	 */
	setStrategyEnabled(name: string, enabled: boolean): void {
		const strategy = this.strategies.get(name);
		if (strategy) {
			strategy.enabled = enabled;
		}
	}
}
