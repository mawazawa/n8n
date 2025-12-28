/**
 * A/B Testing Framework for Search Quality
 *
 * Enables systematic experimentation with different search configurations:
 * - Variant definition and configuration
 * - Traffic splitting and assignment
 * - Metric collection and analysis
 * - Statistical significance testing
 *
 * Use cases:
 * - Compare semantic weights (0.7 vs 0.8)
 * - Test reranking models (Cohere vs local)
 * - Evaluate query expansion strategies
 * - Test different RRF k values
 */

import { searchAnalytics } from './analytics';
import type { SearchQueryLog } from './analytics';

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  config: SearchVariantConfig;
  trafficAllocation: number; // 0-1, percentage of traffic
}

export interface SearchVariantConfig {
  // Hybrid search weights
  semanticWeight?: number;
  keywordWeight?: number;

  // RRF configuration
  rrfK?: number;
  useRRF?: boolean;

  // Reranking
  useReranking?: boolean;
  rerankerModel?: string;
  rerankTopK?: number;

  // Query expansion
  useQueryExpansion?: boolean;
  maxExpansions?: number;

  // Metadata boosting
  useTechniqueBoost?: boolean;
  useCategoryBoost?: boolean;

  // Other parameters
  minScore?: number;
  maxResults?: number;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: ExperimentVariant[];
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  controlVariantId: string; // Baseline variant
}

export interface ExperimentResults {
  experimentId: string;
  variantResults: VariantResults[];
  winner?: string;
  confidenceLevel: number;
  recommendation: string;
}

export interface VariantResults {
  variantId: string;
  variantName: string;
  metrics: {
    totalSearches: number;
    avgLatencyMs: number;
    clickThroughRate: number;
    mrr: number;
    zeroResultRate: number;
    avgResultCount: number;
  };
  improvement: {
    latency: number; // % change vs control
    ctr: number;
    mrr: number;
  };
}

/**
 * A/B Test Manager
 */
export class ABTestManager {
  private experiments: Map<string, Experiment> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map(); // userId -> experimentId -> variantId

  /**
   * Create a new experiment
   */
  createExperiment(experiment: Experiment): void {
    // Validate traffic allocation sums to ~1.0
    const totalAllocation = experiment.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    if (Math.abs(totalAllocation - 1.0) > 0.01) {
      throw new Error(`Traffic allocation must sum to 1.0, got ${totalAllocation}`);
    }

    this.experiments.set(experiment.id, experiment);
  }

  /**
   * Get experiment by ID
   */
  getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * Assign user to a variant (sticky assignment)
   */
  assignVariant(experimentId: string, userId: string): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.isActive) {
      return null;
    }

    // Check for existing assignment
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Map());
    }

    const userExperiments = this.userAssignments.get(userId)!;
    if (userExperiments.has(experimentId)) {
      return userExperiments.get(experimentId)!;
    }

    // Assign based on hash and traffic allocation
    const hash = this.hashString(`${userId}-${experimentId}`);
    const random = (hash % 10000) / 10000; // 0-1

    let cumulativeAllocation = 0;
    for (const variant of experiment.variants) {
      cumulativeAllocation += variant.trafficAllocation;
      if (random < cumulativeAllocation) {
        userExperiments.set(experimentId, variant.id);
        return variant.id;
      }
    }

    // Fallback to control
    userExperiments.set(experimentId, experiment.controlVariantId);
    return experiment.controlVariantId;
  }

  /**
   * Get variant configuration
   */
  getVariantConfig(experimentId: string, variantId: string): SearchVariantConfig | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const variant = experiment.variants.find((v) => v.id === variantId);
    return variant?.config || null;
  }

  /**
   * Log experiment participation
   */
  async logExperimentSearch(
    experimentId: string,
    variantId: string,
    searchLog: SearchQueryLog,
  ): Promise<void> {
    const enhancedLog = {
      ...searchLog,
      experimentId,
      variantId,
    };

    await searchAnalytics.logQuery(enhancedLog);
  }

  /**
   * Analyze experiment results
   */
  async analyzeExperiment(
    experimentId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ExperimentResults | null> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const variantResults: VariantResults[] = [];
    let controlMetrics: VariantResults['metrics'] | null = null;

    // Collect metrics for each variant
    for (const variant of experiment.variants) {
      const metrics = await this.getVariantMetrics(experimentId, variant.id, startDate, endDate);

      const result: VariantResults = {
        variantId: variant.id,
        variantName: variant.name,
        metrics,
        improvement: {
          latency: 0,
          ctr: 0,
          mrr: 0,
        },
      };

      if (variant.id === experiment.controlVariantId) {
        controlMetrics = metrics;
      }

      variantResults.push(result);
    }

    // Calculate improvements vs control
    if (controlMetrics) {
      for (const result of variantResults) {
        if (result.variantId !== experiment.controlVariantId) {
          result.improvement = {
            latency: this.calculatePercentChange(
              controlMetrics.avgLatencyMs,
              result.metrics.avgLatencyMs,
            ),
            ctr: this.calculatePercentChange(
              controlMetrics.clickThroughRate,
              result.metrics.clickThroughRate,
            ),
            mrr: this.calculatePercentChange(
              controlMetrics.mrr,
              result.metrics.mrr,
            ),
          };
        }
      }
    }

    // Determine winner (simplified - based on MRR * CTR composite score)
    const winner = this.determineWinner(variantResults, experiment.controlVariantId);

    // Calculate confidence (simplified)
    const confidence = this.calculateConfidence(variantResults);

    return {
      experimentId,
      variantResults,
      winner: winner.variantId,
      confidenceLevel: confidence,
      recommendation: this.generateRecommendation(winner, confidence, variantResults),
    };
  }

  /**
   * Get metrics for a specific variant
   */
  private async getVariantMetrics(
    experimentId: string,
    variantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<VariantResults['metrics']> {
    // This would query the analytics data filtered by experiment and variant
    // For now, returning mock structure
    // In production, this would call analytics functions with filters

    try {
      const summary = await searchAnalytics.getAnalyticsSummary(startDate, endDate);
      if (!summary) {
        return this.getEmptyMetrics();
      }

      // Note: In production, filter by experimentId and variantId
      return {
        totalSearches: summary.totalSearches,
        avgLatencyMs: summary.avgLatencyMs,
        clickThroughRate: summary.clickThroughRate,
        mrr: summary.mrr,
        zeroResultRate: summary.zeroResultRate,
        avgResultCount: 5, // Would calculate from data
      };
    } catch (error) {
      console.error('Error getting variant metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  private getEmptyMetrics(): VariantResults['metrics'] {
    return {
      totalSearches: 0,
      avgLatencyMs: 0,
      clickThroughRate: 0,
      mrr: 0,
      zeroResultRate: 0,
      avgResultCount: 0,
    };
  }

  /**
   * Calculate percent change
   */
  private calculatePercentChange(baseline: number, value: number): number {
    if (baseline === 0) return 0;
    return ((value - baseline) / baseline) * 100;
  }

  /**
   * Determine winner based on composite score
   */
  private determineWinner(
    results: VariantResults[],
    controlId: string,
  ): VariantResults {
    // Score = MRR * CTR * (1 - zeroResultRate) / (latency / 1000)
    // Higher is better
    let bestScore = -1;
    let winner = results.find((r) => r.variantId === controlId)!;

    for (const result of results) {
      const { mrr, clickThroughRate, zeroResultRate, avgLatencyMs } = result.metrics;
      const score =
        (mrr * clickThroughRate * (1 - zeroResultRate)) /
        Math.max(avgLatencyMs / 1000, 0.1);

      if (score > bestScore) {
        bestScore = score;
        winner = result;
      }
    }

    return winner;
  }

  /**
   * Calculate statistical confidence (simplified)
   * In production, use proper statistical tests (t-test, chi-square, etc.)
   */
  private calculateConfidence(results: VariantResults[]): number {
    // Simplified: based on sample size
    const totalSearches = results.reduce((sum, r) => sum + r.metrics.totalSearches, 0);

    if (totalSearches < 100) return 0.5;
    if (totalSearches < 500) return 0.7;
    if (totalSearches < 1000) return 0.85;
    if (totalSearches < 5000) return 0.95;
    return 0.99;
  }

  /**
   * Generate recommendation text
   */
  private generateRecommendation(
    winner: VariantResults,
    confidence: number,
    allResults: VariantResults[],
  ): string {
    const control = allResults.find((r) => r.improvement.mrr === 0);

    if (!control || winner.variantId === control.variantId) {
      return `Continue with control variant. No significant improvement detected (confidence: ${(confidence * 100).toFixed(0)}%).`;
    }

    const mrrImprovement = winner.improvement.mrr;
    const ctrImprovement = winner.improvement.ctr;
    const latencyChange = winner.improvement.latency;

    let rec = `Recommend deploying variant "${winner.variantName}" (confidence: ${(confidence * 100).toFixed(0)}%). `;

    if (mrrImprovement > 5) {
      rec += `Significant MRR improvement: +${mrrImprovement.toFixed(1)}%. `;
    }

    if (ctrImprovement > 10) {
      rec += `Strong CTR increase: +${ctrImprovement.toFixed(1)}%. `;
    }

    if (latencyChange < -10) {
      rec += `Notable latency reduction: ${latencyChange.toFixed(1)}%. `;
    } else if (latencyChange > 20) {
      rec += `Warning: Latency increased by ${latencyChange.toFixed(1)}%. Consider optimization. `;
    }

    return rec;
  }

  /**
   * Simple hash function for consistent user assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Stop an experiment
   */
  stopExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.isActive = false;
      experiment.endDate = new Date();
    }
  }

  /**
   * Get all active experiments
   */
  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.isActive);
  }
}

/**
 * Pre-defined experiment templates
 */
export const ExperimentTemplates = {
  /**
   * Test different semantic/keyword weight ratios
   */
  semanticWeights: (): Experiment => ({
    id: 'semantic-weights-001',
    name: 'Semantic vs Keyword Weight Test',
    description: 'Compare 70/30, 80/20, and 60/40 semantic/keyword weight ratios',
    controlVariantId: 'control-70-30',
    isActive: true,
    startDate: new Date(),
    variants: [
      {
        id: 'control-70-30',
        name: 'Control (70/30)',
        description: 'Baseline 0.7 semantic, 0.3 keyword',
        trafficAllocation: 0.33,
        config: { semanticWeight: 0.7, keywordWeight: 0.3 },
      },
      {
        id: 'variant-80-20',
        name: 'High Semantic (80/20)',
        description: 'Emphasize semantic search',
        trafficAllocation: 0.33,
        config: { semanticWeight: 0.8, keywordWeight: 0.2 },
      },
      {
        id: 'variant-60-40',
        name: 'Balanced (60/40)',
        description: 'More balanced semantic/keyword',
        trafficAllocation: 0.34,
        config: { semanticWeight: 0.6, keywordWeight: 0.4 },
      },
    ],
  }),

  /**
   * Test reranking impact
   */
  rerankingTest: (): Experiment => ({
    id: 'reranking-001',
    name: 'Reranking Impact Test',
    description: 'Compare with and without Cohere reranking',
    controlVariantId: 'no-rerank',
    isActive: true,
    startDate: new Date(),
    variants: [
      {
        id: 'no-rerank',
        name: 'No Reranking',
        description: 'Baseline without reranking',
        trafficAllocation: 0.5,
        config: { useReranking: false },
      },
      {
        id: 'with-rerank',
        name: 'Cohere Rerank',
        description: 'Using Cohere rerank-english-v3.0',
        trafficAllocation: 0.5,
        config: {
          useReranking: true,
          rerankerModel: 'rerank-english-v3.0',
          rerankTopK: 10,
        },
      },
    ],
  }),

  /**
   * Test RRF k parameter
   */
  rrfKTest: (): Experiment => ({
    id: 'rrf-k-001',
    name: 'RRF K Parameter Test',
    description: 'Compare different RRF k values',
    controlVariantId: 'rrf-60',
    isActive: true,
    startDate: new Date(),
    variants: [
      {
        id: 'rrf-60',
        name: 'Standard (k=60)',
        description: 'Standard RRF k value',
        trafficAllocation: 0.33,
        config: { rrfK: 60 },
      },
      {
        id: 'rrf-30',
        name: 'Low (k=30)',
        description: 'Lower k, more weight on top results',
        trafficAllocation: 0.33,
        config: { rrfK: 30 },
      },
      {
        id: 'rrf-100',
        name: 'High (k=100)',
        description: 'Higher k, more distributed weighting',
        trafficAllocation: 0.34,
        config: { rrfK: 100 },
      },
    ],
  }),
};

/**
 * Create a singleton instance
 */
export const abTestManager = new ABTestManager();
