/**
 * Contextual Recommender
 *
 * Generates context-aware recommendations based on time-of-day patterns,
 * current task context, and recent workflow usage patterns.
 */

import type { Recommendation, RecommendationContext } from './types.js';

interface ContextPattern {
	timeOfDay: number;
	dayOfWeek: number;
	workflowId: string;
	frequency: number;
	lastUsed: string;
}

interface TaskContext {
	category: string;
	intent: string;
	relatedWorkflows: string[];
}

export class ContextualRecommender {
	private contextPatterns: Map<string, ContextPattern[]> = new Map();
	private timeSlots = {
		morning: [6, 12],
		afternoon: [12, 18],
		evening: [18, 24],
		night: [0, 6],
	};

	/**
	 * Generate contextual recommendations
	 */
	async recommend(context: RecommendationContext): Promise<Recommendation[]> {
		const { userId, timeOfDay, dayOfWeek, currentWorkflow } = context;

		// Get recommendations based on different contextual factors
		const timeBasedRecs = await this.getTimeBasedRecommendations(
			userId,
			timeOfDay,
			dayOfWeek,
		);

		const taskBasedRecs = currentWorkflow
			? await this.getTaskBasedRecommendations(userId, currentWorkflow)
			: [];

		const recencyBasedRecs = await this.getRecencyBasedRecommendations(context);

		// Combine and deduplicate
		const combined = this.combineContextualRecommendations([
			...timeBasedRecs,
			...taskBasedRecs,
			...recencyBasedRecs,
		]);

		return combined;
	}

	/**
	 * Get time-based recommendations
	 */
	private async getTimeBasedRecommendations(
		userId: string,
		timeOfDay: number,
		dayOfWeek: number,
	): Promise<Recommendation[]> {
		// Get user's historical patterns
		const patterns = await this.getUserContextPatterns(userId);

		// Filter patterns matching current time
		const timeSlot = this.getTimeSlot(timeOfDay);
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

		const relevantPatterns = patterns.filter((pattern) => {
			const patternTimeSlot = this.getTimeSlot(pattern.timeOfDay);
			const patternIsWeekend = pattern.dayOfWeek === 0 || pattern.dayOfWeek === 6;

			return patternTimeSlot === timeSlot && patternIsWeekend === isWeekend;
		});

		// Sort by frequency
		const sorted = relevantPatterns.sort((a, b) => b.frequency - a.frequency);

		return sorted.slice(0, 5).map((pattern) => ({
			id: this.generateRecommendationId(),
			workflowId: pattern.workflowId,
			type: 'complementary' as const,
			score: this.calculateTimeScore(pattern, timeOfDay, dayOfWeek),
			reason: this.generateTimeReason(pattern, timeSlot, isWeekend),
			confidence: Math.min(pattern.frequency / 10, 1),
			metadata: {
				timeSlot,
				isWeekend,
				frequency: pattern.frequency,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Get task-based recommendations
	 */
	private async getTaskBasedRecommendations(
		userId: string,
		currentWorkflow: string,
	): Promise<Recommendation[]> {
		// Analyze current workflow to understand task context
		const taskContext = await this.analyzeTaskContext(currentWorkflow);

		// Find complementary workflows
		const complementary = await this.findComplementaryWorkflows(taskContext);

		return complementary.map((workflowId, index) => ({
			id: this.generateRecommendationId(),
			workflowId,
			type: 'complementary' as const,
			score: 1 - index * 0.1, // Decreasing scores
			reason: `Complements your current ${taskContext.category} workflow`,
			confidence: 0.8,
			metadata: {
				currentWorkflow,
				taskCategory: taskContext.category,
				taskIntent: taskContext.intent,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Get recency-based recommendations
	 */
	private async getRecencyBasedRecommendations(
		context: RecommendationContext,
	): Promise<Recommendation[]> {
		const { userId, recentActivity } = context;

		if (recentActivity.length === 0) {
			return [];
		}

		// Get workflows related to recent activity
		const recentWorkflowIds = recentActivity
			.filter((activity) => activity.action === 'view' || activity.action === 'edit')
			.map((activity) => activity.workflowId);

		// Find workflows frequently used after these workflows
		const sequential = await this.findSequentialWorkflows(userId, recentWorkflowIds);

		return sequential.map((item) => ({
			id: this.generateRecommendationId(),
			workflowId: item.workflowId,
			type: 'complementary' as const,
			score: item.score,
			reason: 'Based on your recent activity',
			confidence: item.confidence,
			metadata: {
				recentWorkflows: recentWorkflowIds,
				sequentialProbability: item.score,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Get time slot for hour
	 */
	private getTimeSlot(hour: number): string {
		if (hour >= this.timeSlots.morning[0] && hour < this.timeSlots.morning[1]) {
			return 'morning';
		}
		if (hour >= this.timeSlots.afternoon[0] && hour < this.timeSlots.afternoon[1]) {
			return 'afternoon';
		}
		if (hour >= this.timeSlots.evening[0] && hour < this.timeSlots.evening[1]) {
			return 'evening';
		}
		return 'night';
	}

	/**
	 * Calculate time-based score
	 */
	private calculateTimeScore(
		pattern: ContextPattern,
		currentHour: number,
		currentDay: number,
	): number {
		// Base score from frequency
		let score = Math.min(pattern.frequency / 10, 1);

		// Boost for exact hour match
		if (pattern.timeOfDay === currentHour) {
			score *= 1.2;
		}

		// Boost for exact day match
		if (pattern.dayOfWeek === currentDay) {
			score *= 1.1;
		}

		// Penalize for staleness
		const daysSinceUsed = this.getDaysSince(pattern.lastUsed);
		const recencyPenalty = Math.exp(-daysSinceUsed / 30); // Exponential decay
		score *= recencyPenalty;

		return Math.min(score, 1);
	}

	/**
	 * Generate time-based reason
	 */
	private generateTimeReason(
		pattern: ContextPattern,
		timeSlot: string,
		isWeekend: boolean,
	): string {
		const timeDesc = timeSlot.charAt(0).toUpperCase() + timeSlot.slice(1);
		const dayDesc = isWeekend ? 'weekend' : 'weekday';

		return `You often use this ${timeDesc.toLowerCase()} on ${dayDesc}s`;
	}

	/**
	 * Get days since timestamp
	 */
	private getDaysSince(timestamp: string): number {
		const then = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - then.getTime();
		return Math.floor(diffMs / (1000 * 60 * 60 * 24));
	}

	/**
	 * Get user context patterns
	 */
	private async getUserContextPatterns(userId: string): Promise<ContextPattern[]> {
		// Check cache
		if (this.contextPatterns.has(userId)) {
			return this.contextPatterns.get(userId)!;
		}

		// In real implementation, query database for user's historical patterns
		const patterns: ContextPattern[] = [];

		this.contextPatterns.set(userId, patterns);
		return patterns;
	}

	/**
	 * Analyze task context from current workflow
	 */
	private async analyzeTaskContext(workflowId: string): Promise<TaskContext> {
		// In real implementation, fetch and analyze workflow
		return {
			category: 'general',
			intent: 'automation',
			relatedWorkflows: [],
		};
	}

	/**
	 * Find complementary workflows
	 */
	private async findComplementaryWorkflows(context: TaskContext): Promise<string[]> {
		// In real implementation, find workflows that complement the task context
		return [];
	}

	/**
	 * Find workflows frequently used in sequence
	 */
	private async findSequentialWorkflows(
		userId: string,
		recentWorkflowIds: string[],
	): Promise<Array<{ workflowId: string; score: number; confidence: number }>> {
		// In real implementation, analyze sequential patterns
		return [];
	}

	/**
	 * Combine contextual recommendations
	 */
	private combineContextualRecommendations(
		recommendations: Recommendation[],
	): Recommendation[] {
		// Deduplicate by workflow ID, keeping highest scored version
		const byWorkflow = new Map<string, Recommendation>();

		for (const rec of recommendations) {
			const existing = byWorkflow.get(rec.workflowId);

			if (!existing || rec.score > existing.score) {
				byWorkflow.set(rec.workflowId, rec);
			}
		}

		return Array.from(byWorkflow.values()).sort((a, b) => b.score - a.score);
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Update context patterns from new data
	 */
	async updateContextPatterns(
		userId: string,
		workflowId: string,
		timestamp: string,
	): Promise<void> {
		const date = new Date(timestamp);
		const timeOfDay = date.getHours();
		const dayOfWeek = date.getDay();

		const patterns = await this.getUserContextPatterns(userId);

		// Find existing pattern or create new one
		const existing = patterns.find(
			(p) =>
				p.workflowId === workflowId &&
				p.timeOfDay === timeOfDay &&
				p.dayOfWeek === dayOfWeek,
		);

		if (existing) {
			existing.frequency += 1;
			existing.lastUsed = timestamp;
		} else {
			patterns.push({
				timeOfDay,
				dayOfWeek,
				workflowId,
				frequency: 1,
				lastUsed: timestamp,
			});
		}

		this.contextPatterns.set(userId, patterns);
	}
}
