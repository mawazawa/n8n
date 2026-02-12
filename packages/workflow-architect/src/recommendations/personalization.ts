/**
 * Personalization Engine
 *
 * Builds and maintains user profiles with interest decay, explicit preferences,
 * and personalized recommendations based on user behavior patterns.
 */

import type {
	Recommendation,
	RecommendationContext,
	UserProfile,
	UserPreference,
	FeedbackSignal,
} from './types.js';

interface InterestDecayConfig {
	halfLife: number; // days
	minWeight: number;
}

export class PersonalizationEngine {
	private userProfiles: Map<string, UserProfile> = new Map();
	private decayConfig: InterestDecayConfig = {
		halfLife: 14, // 2 weeks
		minWeight: 0.1,
	};

	/**
	 * Generate personalized recommendations
	 */
	async recommend(context: RecommendationContext): Promise<Recommendation[]> {
		const { userId } = context;

		// Build or get user profile
		const profile = await this.buildProfile(userId);

		// Get candidate workflows based on user preferences
		const candidates = await this.getCandidateWorkflows(profile);

		// Score candidates based on personalization
		const scored = this.scoreWorkflows(candidates, profile);

		// Convert to recommendations
		return scored.map((item) => ({
			id: this.generateRecommendationId(),
			workflowId: item.workflowId,
			type: 'personalized' as const,
			score: item.score,
			reason: this.generatePersonalizedReason(item, profile),
			confidence: item.confidence,
			metadata: {
				matchingPreferences: item.matchingPreferences,
				userSegment: profile.cohort,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Build user profile from interaction history
	 */
	async buildProfile(userId: string): Promise<UserProfile> {
		// Check cache
		if (this.userProfiles.has(userId)) {
			return this.userProfiles.get(userId)!;
		}

		// Fetch user interactions
		const interactions = await this.getUserInteractions(userId);

		// Build preferences from interactions
		const preferences = this.buildPreferences(interactions);

		// Determine user segmentations
		const segmentations = this.determineSegmentations(preferences, interactions);

		// Assign to cohort
		const cohort = this.assignCohort(preferences, segmentations);

		const profile: UserProfile = {
			userId,
			preferences,
			interactionHistory: interactions,
			segmentations,
			cohort,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		this.userProfiles.set(userId, profile);
		return profile;
	}

	/**
	 * Update user profile with new feedback signal
	 */
	async updateProfile(signal: FeedbackSignal): Promise<void> {
		const { userId } = signal;

		// Get or create profile
		const profile = await this.buildProfile(userId);

		// Add to interaction history
		profile.interactionHistory.push({
			workflowId: signal.workflowId,
			type: signal.type,
			timestamp: signal.timestamp,
			value: signal.value,
			context: signal.context,
		});

		// Update preferences
		await this.updatePreferences(profile, signal);

		// Update segmentations
		profile.segmentations = this.determineSegmentations(
			profile.preferences,
			profile.interactionHistory,
		);

		// Update cohort
		profile.cohort = this.assignCohort(profile.preferences, profile.segmentations);

		profile.updatedAt = new Date().toISOString();

		this.userProfiles.set(userId, profile);
	}

	/**
	 * Build preferences from interactions
	 */
	private buildPreferences(interactions: UserProfile['interactionHistory']): UserPreference {
		const categories = new Map<string, number>();
		const tags = new Map<string, number>();
		const explicitPrefs = new Map<string, number>();
		const implicitPrefs = new Map<string, number>();

		for (const interaction of interactions) {
			// Apply time decay
			const weight = this.calculateTimeDecay(interaction.timestamp);

			// Update implicit preferences based on interaction type
			const implicitScore = this.getImplicitScore(interaction.type);
			const current = implicitPrefs.get(interaction.workflowId) ?? 0;
			implicitPrefs.set(interaction.workflowId, current + implicitScore * weight);

			// Update explicit preferences if rating exists
			if (interaction.type === 'rate' && interaction.value !== undefined) {
				explicitPrefs.set(interaction.workflowId, interaction.value);
			}

			// Extract categories and tags (would fetch from workflow in real implementation)
			// For now, using placeholder logic
		}

		// Infer complexity preference
		const complexity = this.inferComplexityPreference(interactions);

		// Build usage patterns
		const usagePatterns = this.buildUsagePatterns(interactions);

		return {
			userId: interactions[0]?.userId ?? '',
			categories: Array.from(categories.keys()),
			tags: Array.from(tags.keys()),
			complexity,
			usagePatterns,
			explicitPreferences: Object.fromEntries(explicitPrefs),
			implicitPreferences: Object.fromEntries(implicitPrefs),
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Update preferences with new signal
	 */
	private async updatePreferences(
		profile: UserProfile,
		signal: FeedbackSignal,
	): Promise<void> {
		const { preferences } = profile;

		// Update implicit preferences
		const implicitScore = this.getImplicitScore(signal.type);
		const current = preferences.implicitPreferences[signal.workflowId] ?? 0;
		preferences.implicitPreferences[signal.workflowId] = current + implicitScore;

		// Update explicit preferences
		if (signal.type === 'rate' && signal.value !== undefined) {
			preferences.explicitPreferences[signal.workflowId] = signal.value;
		}

		// Update usage patterns
		preferences.usagePatterns = this.buildUsagePatterns(profile.interactionHistory);

		preferences.updatedAt = new Date().toISOString();
	}

	/**
	 * Calculate time decay weight
	 */
	private calculateTimeDecay(timestamp: string): number {
		const now = new Date();
		const then = new Date(timestamp);
		const daysSince = (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);

		// Exponential decay
		const weight = Math.exp(-Math.LN2 * daysSince / this.decayConfig.halfLife);

		return Math.max(weight, this.decayConfig.minWeight);
	}

	/**
	 * Get implicit score for interaction type
	 */
	private getImplicitScore(type: string): number {
		const scores: Record<string, number> = {
			view: 1,
			click: 2,
			time_spent: 3,
			save: 5,
			use: 7,
			dismiss: -2,
		};

		return scores[type] ?? 0;
	}

	/**
	 * Infer complexity preference
	 */
	private inferComplexityPreference(
		interactions: UserProfile['interactionHistory'],
	): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
		// In real implementation, analyze workflow complexities from interactions
		// For now, return intermediate as default
		return 'intermediate';
	}

	/**
	 * Build usage patterns
	 */
	private buildUsagePatterns(interactions: UserProfile['interactionHistory']): UserPreference['usagePatterns'] {
		// In real implementation, analyze interaction patterns by category
		return [];
	}

	/**
	 * Determine user segmentations
	 */
	private determineSegmentations(
		preferences: UserPreference,
		interactions: UserProfile['interactionHistory'],
	): string[] {
		const segments: string[] = [];

		// Activity level
		if (interactions.length > 100) {
			segments.push('power_user');
		} else if (interactions.length > 20) {
			segments.push('active_user');
		} else {
			segments.push('casual_user');
		}

		// Complexity preference
		segments.push(`complexity_${preferences.complexity}`);

		// Category preferences
		if (preferences.categories.length > 0) {
			segments.push(`category_${preferences.categories[0]}`);
		}

		return segments;
	}

	/**
	 * Assign user to cohort
	 */
	private assignCohort(preferences: UserPreference, segmentations: string[]): string {
		// Simple cohort assignment based on primary characteristics
		if (segmentations.includes('power_user')) {
			return 'power_users';
		}
		if (segmentations.includes('complexity_beginner')) {
			return 'beginners';
		}
		if (segmentations.includes('complexity_expert')) {
			return 'experts';
		}
		return 'general';
	}

	/**
	 * Get candidate workflows based on preferences
	 */
	private async getCandidateWorkflows(profile: UserProfile): Promise<string[]> {
		// In real implementation, query workflows matching user preferences
		return [];
	}

	/**
	 * Score workflows based on personalization
	 */
	private scoreWorkflows(
		workflowIds: string[],
		profile: UserProfile,
	): Array<{
		workflowId: string;
		score: number;
		confidence: number;
		matchingPreferences: string[];
	}> {
		const scored = [];

		for (const workflowId of workflowIds) {
			let score = 0;
			const matchingPreferences: string[] = [];

			// Check explicit preferences
			const explicitScore = profile.preferences.explicitPreferences[workflowId];
			if (explicitScore !== undefined) {
				score += explicitScore * 0.4;
				matchingPreferences.push('explicit_rating');
			}

			// Check implicit preferences
			const implicitScore = profile.preferences.implicitPreferences[workflowId];
			if (implicitScore !== undefined) {
				score += Math.min(implicitScore / 10, 1) * 0.3;
				matchingPreferences.push('past_interactions');
			}

			// Check category match (would fetch workflow category in real implementation)
			// score += categoryMatchScore * 0.2;

			// Check complexity match
			// score += complexityMatchScore * 0.1;

			const confidence = matchingPreferences.length / 4; // More matching factors = higher confidence

			scored.push({
				workflowId,
				score: Math.min(score, 1),
				confidence,
				matchingPreferences,
			});
		}

		return scored.sort((a, b) => b.score - a.score);
	}

	/**
	 * Generate personalized reason
	 */
	private generatePersonalizedReason(
		item: { matchingPreferences: string[] },
		profile: UserProfile,
	): string {
		if (item.matchingPreferences.includes('explicit_rating')) {
			return 'Based on your ratings';
		}
		if (item.matchingPreferences.includes('past_interactions')) {
			return 'Based on your usage history';
		}
		return 'Personalized for you';
	}

	/**
	 * Get user interactions
	 */
	private async getUserInteractions(userId: string): Promise<UserProfile['interactionHistory']> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_personal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Update decay configuration
	 */
	updateDecayConfig(config: Partial<InterestDecayConfig>): void {
		this.decayConfig = { ...this.decayConfig, ...config };
		this.userProfiles.clear(); // Clear cache when config changes
	}

	/**
	 * Get decay configuration
	 */
	getDecayConfig(): InterestDecayConfig {
		return { ...this.decayConfig };
	}

	/**
	 * Clear user profile cache
	 */
	clearProfileCache(userId?: string): void {
		if (userId) {
			this.userProfiles.delete(userId);
		} else {
			this.userProfiles.clear();
		}
	}
}
