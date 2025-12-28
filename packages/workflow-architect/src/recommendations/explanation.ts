/**
 * Explanation Builder
 *
 * Generates human-readable explanations for recommendations to provide
 * transparency and help users understand why workflows were recommended.
 */

import type {
	Recommendation,
	RecommendationContext,
	RecommendationExplanation,
} from './types.js';

interface ExplanationTemplate {
	pattern: RegExp;
	generator: (rec: Recommendation, context: RecommendationContext) => string;
}

export class ExplanationBuilder {
	private templates: Map<string, ExplanationTemplate[]> = new Map();

	constructor() {
		this.initializeTemplates();
	}

	/**
	 * Generate explanation for a recommendation
	 */
	async explain(
		rec: Recommendation,
		context: RecommendationContext,
	): Promise<RecommendationExplanation> {
		const primaryReason = await this.generatePrimaryReason(rec, context);
		const supportingReasons = await this.generateSupportingReasons(rec, context);
		const userFacing = this.generateUserFacingExplanation(rec, context);
		const transparency = this.calculateTransparency(rec);

		return {
			recommendationId: rec.id,
			primaryReason,
			supportingReasons,
			transparency,
			userFacing,
		};
	}

	/**
	 * Generate primary reason
	 */
	private async generatePrimaryReason(
		rec: Recommendation,
		context: RecommendationContext,
	): Promise<string> {
		switch (rec.type) {
			case 'similar':
				return this.explainSimilar(rec, context);
			case 'complementary':
				return this.explainComplementary(rec, context);
			case 'trending':
				return this.explainTrending(rec, context);
			case 'personalized':
				return this.explainPersonalized(rec, context);
			default:
				return rec.reason;
		}
	}

	/**
	 * Explain similar recommendations
	 */
	private explainSimilar(rec: Recommendation, context: RecommendationContext): string {
		const strategies = rec.metadata.strategies as string[] | undefined;

		if (strategies?.includes('collaborative')) {
			return 'Users with similar interests enjoyed this workflow';
		}

		if (strategies?.includes('content')) {
			const features = rec.metadata.matchingFeatures as string[] | undefined;
			if (features && features.length > 0) {
				const featureDesc = this.formatFeatures(features);
				return `Similar to workflows you've used: ${featureDesc}`;
			}
			return 'Similar to workflows you\'ve used';
		}

		return 'Similar to your preferences';
	}

	/**
	 * Explain complementary recommendations
	 */
	private explainComplementary(rec: Recommendation, context: RecommendationContext): string {
		if (context.currentWorkflow) {
			const category = rec.metadata.taskCategory as string | undefined;
			return category
				? `Complements your current ${category} workflow`
				: 'Complements your current workflow';
		}

		const timeSlot = rec.metadata.timeSlot as string | undefined;
		if (timeSlot) {
			return `You often use this in the ${timeSlot}`;
		}

		return 'Complements your workflow patterns';
	}

	/**
	 * Explain trending recommendations
	 */
	private explainTrending(rec: Recommendation, context: RecommendationContext): string {
		const velocity = rec.metadata.velocity as number | undefined;
		const growthRate = rec.metadata.growthRate as number | undefined;
		const recentViews = rec.metadata.recentViews as number | undefined;

		if (growthRate && growthRate > 1.5) {
			return `Rapidly growing in popularity (${Math.round((growthRate - 1) * 100)}% growth)`;
		}

		if (velocity && velocity > 10) {
			return `Trending now with ${Math.round(velocity)} interactions per hour`;
		}

		if (recentViews && recentViews > 100) {
			return `Popular with ${recentViews} recent views`;
		}

		const category = rec.metadata.category as string | undefined;
		return category ? `Trending in ${category}` : 'Trending now';
	}

	/**
	 * Explain personalized recommendations
	 */
	private explainPersonalized(rec: Recommendation, context: RecommendationContext): string {
		const matchingPrefs = rec.metadata.matchingPreferences as string[] | undefined;

		if (matchingPrefs?.includes('explicit_rating')) {
			return 'Based on your ratings of similar workflows';
		}

		if (matchingPrefs?.includes('past_interactions')) {
			return 'Based on your usage history';
		}

		const segment = rec.metadata.userSegment as string | undefined;
		if (segment) {
			return `Popular with ${segment.replace(/_/g, ' ')}`;
		}

		return 'Personalized for you';
	}

	/**
	 * Generate supporting reasons
	 */
	private async generateSupportingReasons(
		rec: Recommendation,
		context: RecommendationContext,
	): Promise<string[]> {
		const reasons: string[] = [];

		// Add popularity info
		const popularity = rec.metadata.popularity as number | undefined;
		if (popularity && popularity > 100) {
			reasons.push(`Used by ${popularity}+ users`);
		}

		// Add rating info
		const rating = rec.metadata.rating as number | undefined;
		if (rating && rating >= 4) {
			reasons.push(`Highly rated (${rating.toFixed(1)}/5)`);
		}

		// Add recency info
		const isNew = rec.metadata.isNew as boolean | undefined;
		if (isNew) {
			reasons.push('Recently added');
		}

		// Add category info
		const category = rec.metadata.category as string | undefined;
		if (category && category !== 'general') {
			reasons.push(`In ${category} category`);
		}

		// Add complexity match
		const complexity = rec.metadata.complexity as string | undefined;
		if (complexity) {
			reasons.push(`${complexity.charAt(0).toUpperCase() + complexity.slice(1)} level`);
		}

		return reasons.slice(0, 3); // Limit to top 3
	}

	/**
	 * Generate user-facing explanation
	 */
	private generateUserFacingExplanation(
		rec: Recommendation,
		context: RecommendationContext,
	): string {
		const primary = rec.reason || 'Recommended for you';
		const supportingReasons = this.getSupportingReasonsSync(rec);

		if (supportingReasons.length === 0) {
			return primary;
		}

		return `${primary} • ${supportingReasons.join(' • ')}`;
	}

	/**
	 * Get supporting reasons synchronously (from metadata)
	 */
	private getSupportingReasonsSync(rec: Recommendation): string[] {
		const reasons: string[] = [];

		const popularity = rec.metadata.popularity as number | undefined;
		if (popularity && popularity > 100) {
			reasons.push(`${popularity}+ users`);
		}

		const rating = rec.metadata.rating as number | undefined;
		if (rating && rating >= 4) {
			reasons.push(`${rating.toFixed(1)}⭐`);
		}

		return reasons.slice(0, 2);
	}

	/**
	 * Calculate transparency score
	 */
	private calculateTransparency(rec: Recommendation): number {
		let score = 0.5; // Base transparency

		// More transparent if we have specific reasons
		if (rec.reason && rec.reason.length > 0) {
			score += 0.2;
		}

		// More transparent if we have metadata
		const metadataKeys = Object.keys(rec.metadata);
		if (metadataKeys.length > 0) {
			score += Math.min(metadataKeys.length * 0.05, 0.2);
		}

		// More transparent if we have high confidence
		if (rec.confidence > 0.7) {
			score += 0.1;
		}

		return Math.min(score, 1);
	}

	/**
	 * Format features for display
	 */
	private formatFeatures(features: string[]): string {
		const formatted = features
			.slice(0, 3)
			.map((f) => {
				const [type, value] = f.split(':');
				return value ?? type;
			})
			.join(', ');

		return formatted;
	}

	/**
	 * Initialize explanation templates
	 */
	private initializeTemplates(): void {
		// Collaborative filtering templates
		this.templates.set('collaborative', [
			{
				pattern: /similar.*users/i,
				generator: (rec) => {
					const count = rec.metadata.similarUserCount as number | undefined;
					return count
						? `${count} users with similar interests enjoyed this`
						: 'Users like you enjoyed this';
				},
			},
		]);

		// Content-based templates
		this.templates.set('content', [
			{
				pattern: /matching.*features/i,
				generator: (rec) => {
					const features = rec.metadata.matchingFeatures as string[] | undefined;
					return features
						? `Matches your workflows: ${this.formatFeatures(features)}`
						: 'Similar to your workflows';
				},
			},
		]);

		// Trending templates
		this.templates.set('trending', [
			{
				pattern: /trending/i,
				generator: (rec) => {
					const velocity = rec.metadata.velocity as number | undefined;
					return velocity
						? `Trending with ${Math.round(velocity)} interactions/hour`
						: 'Trending now';
				},
			},
		]);
	}

	/**
	 * Get explanation template for recommendation
	 */
	private getTemplate(rec: Recommendation): ExplanationTemplate | null {
		const type = rec.type;
		const templates = this.templates.get(type);

		if (!templates) return null;

		for (const template of templates) {
			if (template.pattern.test(rec.reason)) {
				return template;
			}
		}

		return null;
	}

	/**
	 * Generate detailed explanation with all factors
	 */
	async explainDetailed(
		rec: Recommendation,
		context: RecommendationContext,
	): Promise<{
		summary: string;
		factors: Array<{ name: string; contribution: number; explanation: string }>;
		confidence: string;
	}> {
		const factors = [];

		// Extract contribution factors from metadata
		const contributions = rec.metadata.contributions as Record<string, number> | undefined;

		if (contributions) {
			for (const [strategy, contribution] of Object.entries(contributions)) {
				factors.push({
					name: strategy,
					contribution,
					explanation: this.explainStrategy(strategy, rec),
				});
			}
		}

		// Sort by contribution
		factors.sort((a, b) => b.contribution - a.contribution);

		const confidenceLevel =
			rec.confidence > 0.8 ? 'High' : rec.confidence > 0.5 ? 'Medium' : 'Low';

		return {
			summary: rec.reason,
			factors,
			confidence: `${confidenceLevel} (${Math.round(rec.confidence * 100)}%)`,
		};
	}

	/**
	 * Explain strategy contribution
	 */
	private explainStrategy(strategy: string, rec: Recommendation): string {
		switch (strategy) {
			case 'collaborative':
				return 'Similar users also used this workflow';
			case 'content':
				return 'Workflow content matches your interests';
			case 'contextual':
				return 'Relevant to your current context';
			case 'trending':
				return 'Currently popular among all users';
			case 'personalized':
				return 'Based on your personal preferences';
			default:
				return `Based on ${strategy} analysis`;
		}
	}
}
