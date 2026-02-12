/**
 * Feedback Processor
 *
 * Processes user feedback signals (implicit and explicit) to improve
 * recommendations through incremental model updates.
 */

import type { FeedbackSignal } from './types.js';
import { PersonalizationEngine } from './personalization.js';
import { ContextualRecommender } from './context.js';

interface FeedbackBatch {
	signals: FeedbackSignal[];
	processedAt?: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface ModelUpdateResult {
	success: boolean;
	updatedModels: string[];
	errors: string[];
}

export class FeedbackProcessor {
	private personalizationEngine: PersonalizationEngine;
	private contextualRecommender: ContextualRecommender;
	private batchSize = 100;
	private batchInterval = 5000; // 5 seconds
	private pendingSignals: FeedbackSignal[] = [];
	private processingTimer: NodeJS.Timeout | null = null;

	// Feedback weights for implicit signals
	private implicitWeights: Record<string, number> = {
		view: 0.1,
		click: 0.3,
		time_spent: 0.4,
		save: 0.7,
		use: 1.0,
		dismiss: -0.5,
	};

	constructor() {
		this.personalizationEngine = new PersonalizationEngine();
		this.contextualRecommender = new ContextualRecommender();
	}

	/**
	 * Process a single feedback signal
	 */
	async process(signal: FeedbackSignal): Promise<void> {
		// Validate signal
		this.validateSignal(signal);

		// Add to pending batch
		this.pendingSignals.push(signal);

		// Start batch processing timer if not already running
		if (!this.processingTimer) {
			this.startBatchProcessing();
		}

		// If batch size reached, process immediately
		if (this.pendingSignals.length >= this.batchSize) {
			await this.processBatch();
		}
	}

	/**
	 * Process a batch of feedback signals
	 */
	async processBatch(): Promise<ModelUpdateResult> {
		if (this.pendingSignals.length === 0) {
			return { success: true, updatedModels: [], errors: [] };
		}

		const batch: FeedbackBatch = {
			signals: [...this.pendingSignals],
			status: 'processing',
		};

		this.pendingSignals = [];

		const result: ModelUpdateResult = {
			success: true,
			updatedModels: [],
			errors: [],
		};

		try {
			// Group signals by user for efficient processing
			const byUser = this.groupByUser(batch.signals);

			// Update personalization models
			for (const [userId, signals] of byUser) {
				try {
					await this.updatePersonalizationModel(userId, signals);
					result.updatedModels.push(`personalization:${userId}`);
				} catch (error) {
					result.errors.push(`Failed to update personalization for ${userId}: ${error}`);
					result.success = false;
				}
			}

			// Update contextual models
			try {
				await this.updateContextualModels(batch.signals);
				result.updatedModels.push('contextual');
			} catch (error) {
				result.errors.push(`Failed to update contextual models: ${error}`);
				result.success = false;
			}

			// Update collaborative filtering matrix (if applicable)
			try {
				await this.updateCollaborativeMatrix(batch.signals);
				result.updatedModels.push('collaborative');
			} catch (error) {
				result.errors.push(`Failed to update collaborative matrix: ${error}`);
				result.success = false;
			}

			batch.status = 'completed';
			batch.processedAt = new Date().toISOString();
		} catch (error) {
			batch.status = 'failed';
			result.success = false;
			result.errors.push(`Batch processing failed: ${error}`);
		}

		return result;
	}

	/**
	 * Update personalization model for a user
	 */
	private async updatePersonalizationModel(
		userId: string,
		signals: FeedbackSignal[],
	): Promise<void> {
		for (const signal of signals) {
			await this.personalizationEngine.updateProfile(signal);
		}
	}

	/**
	 * Update contextual models
	 */
	private async updateContextualModels(signals: FeedbackSignal[]): Promise<void> {
		for (const signal of signals) {
			// Update context patterns for time-based recommendations
			if (signal.type === 'use' || signal.type === 'save') {
				await this.contextualRecommender.updateContextPatterns(
					signal.userId,
					signal.workflowId,
					signal.timestamp,
				);
			}
		}
	}

	/**
	 * Update collaborative filtering matrix
	 */
	private async updateCollaborativeMatrix(signals: FeedbackSignal[]): Promise<void> {
		// In real implementation, update user-workflow interaction matrix
		// For now, just log
		console.log(`Updating collaborative matrix with ${signals.length} signals`);
	}

	/**
	 * Process explicit feedback (ratings)
	 */
	async processExplicitFeedback(signal: FeedbackSignal): Promise<void> {
		if (signal.type !== 'rate') {
			throw new Error('Signal is not explicit feedback');
		}

		if (signal.value === undefined || signal.value < 1 || signal.value > 5) {
			throw new Error('Invalid rating value');
		}

		// Explicit feedback has higher weight and immediate processing
		await this.personalizationEngine.updateProfile(signal);

		// Store rating in database (in real implementation)
		await this.storeRating(signal);
	}

	/**
	 * Process implicit feedback (clicks, views, time spent)
	 */
	async processImplicitFeedback(signal: FeedbackSignal): Promise<void> {
		// Calculate implicit score
		const weight = this.implicitWeights[signal.type] ?? 0;

		// Add weighted signal to batch
		const weightedSignal: FeedbackSignal = {
			...signal,
			value: weight,
		};

		await this.process(weightedSignal);
	}

	/**
	 * Process time spent signal
	 */
	async processTimeSpent(
		userId: string,
		workflowId: string,
		durationMs: number,
	): Promise<void> {
		// Convert duration to implicit score (longer = better)
		// Cap at 5 minutes = max score
		const maxDuration = 5 * 60 * 1000; // 5 minutes
		const normalizedScore = Math.min(durationMs / maxDuration, 1);

		const signal: FeedbackSignal = {
			userId,
			recommendationId: '', // Not from a specific recommendation
			workflowId,
			type: 'time_spent',
			value: normalizedScore,
			timestamp: new Date().toISOString(),
			context: { durationMs },
		};

		await this.processImplicitFeedback(signal);
	}

	/**
	 * Validate feedback signal
	 */
	private validateSignal(signal: FeedbackSignal): void {
		if (!signal.userId || !signal.workflowId) {
			throw new Error('Missing required fields: userId, workflowId');
		}

		if (!signal.type) {
			throw new Error('Missing feedback type');
		}

		const validTypes: FeedbackSignal['type'][] = [
			'click',
			'save',
			'use',
			'dismiss',
			'rate',
			'view',
			'time_spent',
		];

		if (!validTypes.includes(signal.type)) {
			throw new Error(`Invalid feedback type: ${signal.type}`);
		}
	}

	/**
	 * Group signals by user
	 */
	private groupByUser(signals: FeedbackSignal[]): Map<string, FeedbackSignal[]> {
		const byUser = new Map<string, FeedbackSignal[]>();

		for (const signal of signals) {
			if (!byUser.has(signal.userId)) {
				byUser.set(signal.userId, []);
			}
			byUser.get(signal.userId)!.push(signal);
		}

		return byUser;
	}

	/**
	 * Start batch processing timer
	 */
	private startBatchProcessing(): void {
		this.processingTimer = setInterval(async () => {
			if (this.pendingSignals.length > 0) {
				await this.processBatch();
			}
		}, this.batchInterval);
	}

	/**
	 * Stop batch processing timer
	 */
	stopBatchProcessing(): void {
		if (this.processingTimer) {
			clearInterval(this.processingTimer);
			this.processingTimer = null;
		}
	}

	/**
	 * Flush all pending signals
	 */
	async flush(): Promise<ModelUpdateResult> {
		return await this.processBatch();
	}

	/**
	 * Store rating in database
	 */
	private async storeRating(signal: FeedbackSignal): Promise<void> {
		// In real implementation, store in database
		console.log(`Storing rating: ${signal.userId} rated ${signal.workflowId} as ${signal.value}`);
	}

	/**
	 * Get feedback statistics
	 */
	async getStatistics(userId: string): Promise<{
		totalFeedback: number;
		byType: Record<string, number>;
		avgRating: number;
	}> {
		// In real implementation, query database
		return {
			totalFeedback: 0,
			byType: {},
			avgRating: 0,
		};
	}

	/**
	 * Update feedback weights
	 */
	updateImplicitWeights(weights: Record<string, number>): void {
		this.implicitWeights = { ...this.implicitWeights, ...weights };
	}

	/**
	 * Get current feedback weights
	 */
	getImplicitWeights(): Record<string, number> {
		return { ...this.implicitWeights };
	}

	/**
	 * Update batch configuration
	 */
	updateBatchConfig(config: { batchSize?: number; batchInterval?: number }): void {
		if (config.batchSize !== undefined) {
			this.batchSize = config.batchSize;
		}
		if (config.batchInterval !== undefined) {
			this.batchInterval = config.batchInterval;

			// Restart timer with new interval
			this.stopBatchProcessing();
			this.startBatchProcessing();
		}
	}

	/**
	 * Get pending signals count
	 */
	getPendingCount(): number {
		return this.pendingSignals.length;
	}
}
