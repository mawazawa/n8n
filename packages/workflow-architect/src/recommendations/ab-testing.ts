/**
 * A/B Testing Manager
 *
 * Manages A/B experiments for recommendation strategies with variant
 * assignment, conversion tracking, and statistical analysis.
 */

import { z } from 'zod';
import type { ABExperiment, ABVariant, ABAssignment, ABMetric } from './types.js';

const ExperimentConfigSchema = z.object({
	name: z.string().min(1),
	description: z.string(),
	variants: z.array(
		z.object({
			name: z.string(),
			description: z.string(),
			config: z.record(z.unknown()),
			weight: z.number().min(0).max(1),
		}),
	),
	targetMetric: z.string(),
	sampleSize: z.number().min(1),
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
});

interface StatisticalResult {
	significant: boolean;
	pValue: number;
	confidenceLevel: number;
	winner?: string;
	recommendation: string;
}

export class ABTestManager {
	private experiments: Map<string, ABExperiment> = new Map();
	private assignments: Map<string, Map<string, ABAssignment>> = new Map(); // userId -> experimentId -> assignment
	private metrics: Map<string, ABMetric[]> = new Map(); // experimentId -> metrics

	private readonly defaultConfidenceLevel = 0.95;
	private readonly minSampleSize = 100;

	/**
	 * Create a new A/B experiment
	 */
	async createExperiment(config: z.infer<typeof ExperimentConfigSchema>): Promise<ABExperiment> {
		// Validate config
		const validated = ExperimentConfigSchema.parse(config);

		// Validate variant weights sum to 1
		const totalWeight = validated.variants.reduce((sum, v) => sum + v.weight, 0);
		if (Math.abs(totalWeight - 1) > 0.01) {
			throw new Error('Variant weights must sum to 1');
		}

		// Create experiment
		const experiment: ABExperiment = {
			id: this.generateExperimentId(),
			name: validated.name,
			description: validated.description,
			variants: validated.variants.map((v) => ({
				id: this.generateVariantId(),
				name: v.name,
				description: v.description,
				config: v.config,
				weight: v.weight,
				conversions: 0,
				impressions: 0,
			})),
			startDate: validated.startDate ?? new Date().toISOString(),
			endDate: validated.endDate,
			status: 'draft',
			targetMetric: validated.targetMetric,
			sampleSize: validated.sampleSize,
			createdAt: new Date().toISOString(),
		};

		this.experiments.set(experiment.id, experiment);
		this.metrics.set(experiment.id, []);

		return experiment;
	}

	/**
	 * Assign a user to an experiment variant
	 */
	async assignVariant(userId: string, experimentId: string): Promise<ABVariant> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		if (experiment.status !== 'active') {
			throw new Error(`Experiment ${experimentId} is not active`);
		}

		// Check if user already has assignment
		const userAssignments = this.assignments.get(userId) ?? new Map();
		const existing = userAssignments.get(experimentId);

		if (existing) {
			const variant = experiment.variants.find((v) => v.id === existing.variantId);
			if (!variant) {
				throw new Error(`Variant ${existing.variantId} not found`);
			}
			return variant;
		}

		// Assign variant using weighted random selection
		const variant = this.selectVariant(experiment.variants, userId);

		// Record assignment
		const assignment: ABAssignment = {
			userId,
			experimentId,
			variantId: variant.id,
			assignedAt: new Date().toISOString(),
		};

		userAssignments.set(experimentId, assignment);
		this.assignments.set(userId, userAssignments);

		// Increment impressions
		variant.impressions += 1;

		return variant;
	}

	/**
	 * Track a conversion event
	 */
	async trackConversion(
		userId: string,
		experimentId: string,
		event: string,
		value?: number,
	): Promise<void> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		// Get user's variant assignment
		const userAssignments = this.assignments.get(userId);
		const assignment = userAssignments?.get(experimentId);

		if (!assignment) {
			throw new Error(`User ${userId} not assigned to experiment ${experimentId}`);
		}

		// Find variant
		const variant = experiment.variants.find((v) => v.id === assignment.variantId);

		if (!variant) {
			throw new Error(`Variant ${assignment.variantId} not found`);
		}

		// Increment conversions if this is the target metric
		if (event === experiment.targetMetric) {
			variant.conversions += 1;
		}

		// Record metric
		const metric: ABMetric = {
			experimentId,
			variantId: variant.id,
			metric: event,
			value: value ?? 1,
			count: 1,
			updatedAt: new Date().toISOString(),
		};

		const experimentMetrics = this.metrics.get(experimentId) ?? [];
		experimentMetrics.push(metric);
		this.metrics.set(experimentId, experimentMetrics);
	}

	/**
	 * Analyze experiment results
	 */
	async analyzeExperiment(experimentId: string): Promise<StatisticalResult> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		// Check if we have enough data
		const totalImpressions = experiment.variants.reduce((sum, v) => sum + v.impressions, 0);

		if (totalImpressions < this.minSampleSize) {
			return {
				significant: false,
				pValue: 1,
				confidenceLevel: 0,
				recommendation: `Need more data. Current: ${totalImpressions}, Required: ${this.minSampleSize}`,
			};
		}

		// Compare variants using chi-square test
		const result = this.performChiSquareTest(experiment.variants);

		return result;
	}

	/**
	 * Perform chi-square test
	 */
	private performChiSquareTest(variants: ABVariant[]): StatisticalResult {
		if (variants.length !== 2) {
			// For simplicity, only handle two-variant tests
			return {
				significant: false,
				pValue: 1,
				confidenceLevel: 0,
				recommendation: 'Multi-variant testing not yet implemented',
			};
		}

		const [variantA, variantB] = variants;

		// Calculate conversion rates
		const rateA = variantA.impressions > 0 ? variantA.conversions / variantA.impressions : 0;
		const rateB = variantB.impressions > 0 ? variantB.conversions / variantB.impressions : 0;

		// Chi-square statistic
		const totalImpressions = variantA.impressions + variantB.impressions;
		const totalConversions = variantA.conversions + variantB.conversions;
		const expectedRate = totalConversions / totalImpressions;

		const expectedA = variantA.impressions * expectedRate;
		const expectedB = variantB.impressions * expectedRate;

		const chiSquare =
			Math.pow(variantA.conversions - expectedA, 2) / expectedA +
			Math.pow(variantB.conversions - expectedB, 2) / expectedB;

		// Degrees of freedom = 1 for 2x2 contingency table
		const df = 1;

		// Critical value for 95% confidence level with df=1 is 3.841
		const criticalValue = 3.841;
		const significant = chiSquare > criticalValue;

		// Approximate p-value
		const pValue = this.chiSquareToPValue(chiSquare, df);

		// Determine winner
		let winner: string | undefined;
		if (significant) {
			winner = rateA > rateB ? variantA.name : variantB.name;
		}

		return {
			significant,
			pValue,
			confidenceLevel: this.defaultConfidenceLevel,
			winner,
			recommendation: this.generateRecommendation(significant, winner, rateA, rateB),
		};
	}

	/**
	 * Convert chi-square to p-value (approximation)
	 */
	private chiSquareToPValue(chiSquare: number, df: number): number {
		// Simple approximation for df=1
		if (df === 1) {
			if (chiSquare < 0.004) return 0.95;
			if (chiSquare < 0.02) return 0.9;
			if (chiSquare < 0.45) return 0.5;
			if (chiSquare < 2.71) return 0.1;
			if (chiSquare < 3.84) return 0.05;
			if (chiSquare < 6.63) return 0.01;
			return 0.001;
		}
		return 0.5; // Default for other df
	}

	/**
	 * Generate recommendation text
	 */
	private generateRecommendation(
		significant: boolean,
		winner: string | undefined,
		rateA: number,
		rateB: number,
	): string {
		if (!significant) {
			return 'No significant difference found. Consider running the test longer or with more traffic.';
		}

		const improvement = Math.abs(rateA - rateB) / Math.min(rateA, rateB);
		return `${winner} is the clear winner with ${(improvement * 100).toFixed(1)}% improvement. Recommend implementing this variant.`;
	}

	/**
	 * Select variant using weighted random selection
	 */
	private selectVariant(variants: ABVariant[], userId: string): ABVariant {
		// Use deterministic hash for consistent assignment
		const hash = this.hashUserId(userId);
		const random = hash / 0xffffffff; // Normalize to 0-1

		let cumulative = 0;
		for (const variant of variants) {
			cumulative += variant.weight;
			if (random < cumulative) {
				return variant;
			}
		}

		// Fallback to last variant
		return variants[variants.length - 1];
	}

	/**
	 * Hash user ID for deterministic variant assignment
	 */
	private hashUserId(userId: string): number {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			const char = userId.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash);
	}

	/**
	 * Start an experiment
	 */
	async startExperiment(experimentId: string): Promise<void> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		experiment.status = 'active';
		experiment.startDate = new Date().toISOString();
	}

	/**
	 * Pause an experiment
	 */
	async pauseExperiment(experimentId: string): Promise<void> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		experiment.status = 'paused';
	}

	/**
	 * Complete an experiment
	 */
	async completeExperiment(experimentId: string): Promise<void> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		experiment.status = 'completed';
		experiment.endDate = new Date().toISOString();
	}

	/**
	 * Get experiment results
	 */
	async getResults(experimentId: string): Promise<{
		experiment: ABExperiment;
		analysis: StatisticalResult;
		variantMetrics: Array<{
			variant: ABVariant;
			conversionRate: number;
			metrics: Record<string, number>;
		}>;
	}> {
		const experiment = this.experiments.get(experimentId);

		if (!experiment) {
			throw new Error(`Experiment ${experimentId} not found`);
		}

		const analysis = await this.analyzeExperiment(experimentId);
		const experimentMetrics = this.metrics.get(experimentId) ?? [];

		const variantMetrics = experiment.variants.map((variant) => {
			const conversionRate =
				variant.impressions > 0 ? variant.conversions / variant.impressions : 0;

			// Aggregate metrics for this variant
			const variantMetricData = experimentMetrics.filter((m) => m.variantId === variant.id);

			const metrics: Record<string, number> = {};
			for (const metric of variantMetricData) {
				metrics[metric.metric] = (metrics[metric.metric] ?? 0) + metric.value;
			}

			return {
				variant,
				conversionRate,
				metrics,
			};
		});

		return {
			experiment,
			analysis,
			variantMetrics,
		};
	}

	/**
	 * List all experiments
	 */
	async listExperiments(status?: ABExperiment['status']): Promise<ABExperiment[]> {
		const experiments = Array.from(this.experiments.values());

		if (status) {
			return experiments.filter((e) => e.status === status);
		}

		return experiments;
	}

	/**
	 * Generate unique experiment ID
	 */
	private generateExperimentId(): string {
		return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generate unique variant ID
	 */
	private generateVariantId(): string {
		return `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Clear all assignments (for testing)
	 */
	clearAssignments(): void {
		this.assignments.clear();
	}
}
