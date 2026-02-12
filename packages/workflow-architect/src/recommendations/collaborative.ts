/**
 * Collaborative Filtering
 *
 * Implements collaborative filtering for workflow recommendations using
 * matrix factorization and user similarity calculations. Handles cold start
 * problem for new users with hybrid fallback.
 */

import type {
	Recommendation,
	RecommendationContext,
	SimilarUser,
	UserPreference,
} from './types.js';

interface UserWorkflowMatrix {
	userId: string;
	workflowId: string;
	rating: number; // Implicit rating from interactions
}

interface MatrixFactorization {
	userFactors: Map<string, number[]>;
	workflowFactors: Map<string, number[]>;
	latentDimensions: number;
}

export class CollaborativeFilter {
	private userWorkflowMatrix: UserWorkflowMatrix[] = [];
	private factorization: MatrixFactorization | null = null;
	private similarityCache: Map<string, SimilarUser[]> = new Map();
	private cacheTimeout = 3600000; // 1 hour
	private minInteractions = 3; // Minimum interactions to avoid cold start
	private latentDimensions = 50;

	/**
	 * Generate collaborative filtering recommendations
	 */
	async recommend(context: RecommendationContext): Promise<Recommendation[]> {
		const { userId } = context;

		// Check for cold start problem
		const userInteractions = await this.getUserInteractionCount(userId);
		if (userInteractions < this.minInteractions) {
			return this.handleColdStart(context);
		}

		// Find similar users
		const similarUsers = await this.findSimilarUsers(userId);

		// Get workflows from similar users that this user hasn't interacted with
		const candidateWorkflows = await this.getCandidateWorkflows(userId, similarUsers);

		// Score each candidate
		const scored = await this.scoreWorkflows(userId, candidateWorkflows, similarUsers);

		// Convert to recommendations
		return scored.map((item) => ({
			id: this.generateRecommendationId(),
			workflowId: item.workflowId,
			type: 'similar' as const,
			score: item.score,
			reason: `Users similar to you enjoyed this workflow`,
			confidence: item.confidence,
			metadata: {
				similarUserCount: item.similarUsers.length,
				avgSimilarUserRating: item.avgRating,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Find similar users based on interaction patterns
	 */
	async findSimilarUsers(userId: string, limit = 50): Promise<SimilarUser[]> {
		// Check cache first
		const cached = this.similarityCache.get(userId);
		if (cached) {
			return cached;
		}

		// Get user's preferences
		const userPrefs = await this.getUserPreferences(userId);

		// Get all other users
		const allUsers = await this.getAllUsers();

		// Calculate similarity with each user
		const similarities: SimilarUser[] = [];

		for (const otherUserId of allUsers) {
			if (otherUserId === userId) continue;

			const otherPrefs = await this.getUserPreferences(otherUserId);
			const similarity = this.calculateUserSimilarity(userPrefs, otherPrefs);

			if (similarity > 0.1) {
				// Threshold for relevance
				const commonWorkflows = await this.getCommonWorkflows(userId, otherUserId);
				const commonCategories = this.getCommonCategories(userPrefs, otherPrefs);

				similarities.push({
					userId: otherUserId,
					similarity,
					commonWorkflows,
					commonCategories,
				});
			}
		}

		// Sort by similarity and limit
		const sorted = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit);

		// Cache results
		this.similarityCache.set(userId, sorted);
		setTimeout(() => this.similarityCache.delete(userId), this.cacheTimeout);

		return sorted;
	}

	/**
	 * Get user preferences based on interaction history
	 */
	async getUserPreferences(userId: string): Promise<UserPreference> {
		// In real implementation, fetch from database
		// Here we return a mock structure
		return {
			userId,
			categories: [],
			tags: [],
			complexity: 'intermediate',
			usagePatterns: [],
			explicitPreferences: {},
			implicitPreferences: {},
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Calculate similarity between two users using cosine similarity
	 */
	private calculateUserSimilarity(user1: UserPreference, user2: UserPreference): number {
		// Use matrix factorization if available
		if (this.factorization) {
			const factors1 = this.factorization.userFactors.get(user1.userId);
			const factors2 = this.factorization.userFactors.get(user2.userId);

			if (factors1 && factors2) {
				return this.cosineSimilarity(factors1, factors2);
			}
		}

		// Fallback to preference-based similarity
		return this.preferenceBasedSimilarity(user1, user2);
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			throw new Error('Vectors must have same length');
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Calculate preference-based similarity
	 */
	private preferenceBasedSimilarity(user1: UserPreference, user2: UserPreference): number {
		// Compare categories
		const categoryOverlap = this.jaccard(user1.categories, user2.categories);

		// Compare tags
		const tagOverlap = this.jaccard(user1.tags, user2.tags);

		// Compare implicit preferences
		const prefSimilarity = this.dictionarySimilarity(
			user1.implicitPreferences,
			user2.implicitPreferences,
		);

		// Weighted combination
		return categoryOverlap * 0.4 + tagOverlap * 0.3 + prefSimilarity * 0.3;
	}

	/**
	 * Calculate Jaccard similarity
	 */
	private jaccard(set1: string[], set2: string[]): number {
		const s1 = new Set(set1);
		const s2 = new Set(set2);

		const intersection = new Set([...s1].filter((x) => s2.has(x)));
		const union = new Set([...s1, ...s2]);

		return union.size === 0 ? 0 : intersection.size / union.size;
	}

	/**
	 * Calculate dictionary similarity
	 */
	private dictionarySimilarity(
		dict1: Record<string, number>,
		dict2: Record<string, number>,
	): number {
		const keys = new Set([...Object.keys(dict1), ...Object.keys(dict2)]);
		if (keys.size === 0) return 0;

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		for (const key of keys) {
			const val1 = dict1[key] ?? 0;
			const val2 = dict2[key] ?? 0;

			dotProduct += val1 * val2;
			norm1 += val1 * val1;
			norm2 += val2 * val2;
		}

		const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Get common workflows between two users
	 */
	private async getCommonWorkflows(userId1: string, userId2: string): Promise<string[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Get common categories
	 */
	private getCommonCategories(user1: UserPreference, user2: UserPreference): string[] {
		const set1 = new Set(user1.categories);
		return user2.categories.filter((c) => set1.has(c));
	}

	/**
	 * Get candidate workflows from similar users
	 */
	private async getCandidateWorkflows(
		userId: string,
		similarUsers: SimilarUser[],
	): Promise<string[]> {
		// Get workflows the user has already interacted with
		const userWorkflows = await this.getUserWorkflows(userId);
		const userWorkflowSet = new Set(userWorkflows);

		// Collect workflows from similar users
		const candidates = new Set<string>();

		for (const similarUser of similarUsers) {
			const workflows = await this.getUserWorkflows(similarUser.userId);
			for (const workflowId of workflows) {
				if (!userWorkflowSet.has(workflowId)) {
					candidates.add(workflowId);
				}
			}
		}

		return Array.from(candidates);
	}

	/**
	 * Score candidate workflows
	 */
	private async scoreWorkflows(
		userId: string,
		candidates: string[],
		similarUsers: SimilarUser[],
	): Promise<Array<{
		workflowId: string;
		score: number;
		confidence: number;
		similarUsers: string[];
		avgRating: number;
	}>> {
		const scored = [];

		for (const workflowId of candidates) {
			let weightedSum = 0;
			let totalWeight = 0;
			const contributingUsers: string[] = [];

			for (const similarUser of similarUsers) {
				const rating = await this.getUserWorkflowRating(similarUser.userId, workflowId);
				if (rating > 0) {
					weightedSum += rating * similarUser.similarity;
					totalWeight += similarUser.similarity;
					contributingUsers.push(similarUser.userId);
				}
			}

			if (totalWeight > 0) {
				const score = weightedSum / totalWeight;
				const avgRating = contributingUsers.length > 0 ? weightedSum / contributingUsers.length : 0;
				const confidence = Math.min(contributingUsers.length / 10, 1); // More users = higher confidence

				scored.push({
					workflowId,
					score,
					confidence,
					similarUsers: contributingUsers,
					avgRating,
				});
			}
		}

		return scored.sort((a, b) => b.score - a.score);
	}

	/**
	 * Handle cold start problem for new users
	 */
	private async handleColdStart(context: RecommendationContext): Promise<Recommendation[]> {
		// Return popular workflows or trending workflows
		// This will be delegated to trending calculator in real implementation
		return [];
	}

	/**
	 * Get user interaction count
	 */
	private async getUserInteractionCount(userId: string): Promise<number> {
		// In real implementation, query database
		return 10; // Mock value
	}

	/**
	 * Get all users
	 */
	private async getAllUsers(): Promise<string[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Get user workflows
	 */
	private async getUserWorkflows(userId: string): Promise<string[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Get user's rating for a workflow (implicit from interactions)
	 */
	private async getUserWorkflowRating(userId: string, workflowId: string): Promise<number> {
		// In real implementation, calculate from interactions
		// Views = 1, Uses = 3, Saves = 5
		return 0;
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Train matrix factorization model
	 */
	async trainMatrixFactorization(iterations = 100): Promise<void> {
		const matrix = await this.loadUserWorkflowMatrix();

		// Initialize factors randomly
		const userIds = new Set(matrix.map((m) => m.userId));
		const workflowIds = new Set(matrix.map((m) => m.workflowId));

		const userFactors = new Map<string, number[]>();
		const workflowFactors = new Map<string, number[]>();

		for (const userId of userIds) {
			userFactors.set(userId, this.randomVector(this.latentDimensions));
		}

		for (const workflowId of workflowIds) {
			workflowFactors.set(workflowId, this.randomVector(this.latentDimensions));
		}

		// Alternating Least Squares (ALS)
		const learningRate = 0.01;
		const regularization = 0.1;

		for (let iter = 0; iter < iterations; iter++) {
			// Update user factors
			for (const userId of userIds) {
				const userVector = userFactors.get(userId)!;
				const userInteractions = matrix.filter((m) => m.userId === userId);

				for (let dim = 0; dim < this.latentDimensions; dim++) {
					let gradient = 0;

					for (const interaction of userInteractions) {
						const workflowVector = workflowFactors.get(interaction.workflowId)!;
						const predicted = this.dotProduct(userVector, workflowVector);
						const error = interaction.rating - predicted;
						gradient += error * workflowVector[dim];
					}

					userVector[dim] += learningRate * (gradient - regularization * userVector[dim]);
				}
			}

			// Update workflow factors
			for (const workflowId of workflowIds) {
				const workflowVector = workflowFactors.get(workflowId)!;
				const workflowInteractions = matrix.filter((m) => m.workflowId === workflowId);

				for (let dim = 0; dim < this.latentDimensions; dim++) {
					let gradient = 0;

					for (const interaction of workflowInteractions) {
						const userVector = userFactors.get(interaction.userId)!;
						const predicted = this.dotProduct(userVector, workflowVector);
						const error = interaction.rating - predicted;
						gradient += error * userVector[dim];
					}

					workflowVector[dim] += learningRate * (gradient - regularization * workflowVector[dim]);
				}
			}
		}

		this.factorization = {
			userFactors,
			workflowFactors,
			latentDimensions: this.latentDimensions,
		};
	}

	/**
	 * Load user-workflow interaction matrix
	 */
	private async loadUserWorkflowMatrix(): Promise<UserWorkflowMatrix[]> {
		// In real implementation, load from database
		return this.userWorkflowMatrix;
	}

	/**
	 * Generate random vector
	 */
	private randomVector(size: number): number[] {
		return Array.from({ length: size }, () => Math.random() * 0.1);
	}

	/**
	 * Calculate dot product
	 */
	private dotProduct(a: number[], b: number[]): number {
		return a.reduce((sum, val, i) => sum + val * b[i], 0);
	}
}
