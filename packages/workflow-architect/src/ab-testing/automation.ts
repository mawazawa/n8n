/**
 * AutoOptimizer - Automatic experiment optimization
 * Multi-armed bandit algorithms with early stopping
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { AutoOptimizationConfig, BanditConfig, Variant } from './types.js';
import { BanditConfigSchema } from './types.js';
import { MetricCollector } from './metrics.js';
import { VariantManager } from './variants.js';
import { StatisticalAnalyzer } from './analysis.js';

export class AutoOptimizer {
  private supabase: SupabaseClient;
  private metricCollector: MetricCollector;
  private variantManager: VariantManager;
  private analyzer: StatisticalAnalyzer;
  private optimizationIntervals: Map<string, NodeJS.Timeout>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.metricCollector = new MetricCollector(supabase, 0);
    this.variantManager = new VariantManager(supabase);
    this.analyzer = new StatisticalAnalyzer(supabase);
    this.optimizationIntervals = new Map();
  }

  /**
   * Enable auto-optimization for an experiment
   */
  async enable(
    experimentId: string,
    banditConfig: BanditConfig,
    earlyStoppingConfig?: AutoOptimizationConfig['earlyStoppingRules'],
  ): Promise<AutoOptimizationConfig> {
    // Validate bandit config
    BanditConfigSchema.parse(banditConfig);

    const now = new Date().toISOString();
    const config = {
      id: uuidv4(),
      experiment_id: experimentId,
      enabled: true,
      bandit_config: banditConfig,
      early_stopping_rules: earlyStoppingConfig || {
        minSampleSize: 100,
        checkFrequency: 3600000, // 1 hour
        probabilityThreshold: 0.95,
      },
      status: 'active' as const,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.supabase
      .from('auto_optimization_configs')
      .insert(config)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to enable auto-optimization: ${error.message}`);
    }

    // Start optimization loop
    this.startOptimization(experimentId, banditConfig.updateFrequency);

    return this.mapToAutoOptimizationConfig(data);
  }

  /**
   * Disable auto-optimization
   */
  async disable(experimentId: string): Promise<void> {
    // Stop optimization loop
    this.stopOptimization(experimentId);

    // Update config status
    const { error } = await this.supabase
      .from('auto_optimization_configs')
      .update({
        enabled: false,
        status: 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('experiment_id', experimentId);

    if (error) {
      throw new Error(`Failed to disable auto-optimization: ${error.message}`);
    }
  }

  /**
   * Update traffic allocation using multi-armed bandit
   */
  async optimizeTraffic(experimentId: string): Promise<void> {
    const config = await this.getConfig(experimentId);
    if (!config || !config.enabled) {
      return;
    }

    const variants = await this.variantManager.getExperimentVariants(experimentId);

    // Get performance data for each variant
    const performances = await Promise.all(
      variants.map(async (variant) => {
        const aggregated = await this.metricCollector.getAggregatedMetrics(
          experimentId,
          variant.id,
        );

        // Use primary metric (assume first metric is primary)
        const primaryMetric = aggregated[0];

        return {
          variantId: variant.id,
          mean: primaryMetric?.mean || 0,
          count: primaryMetric?.count || 0,
          variance: primaryMetric?.variance || 0,
        };
      }),
    );

    // Calculate new allocations based on bandit algorithm
    let newAllocations: Array<{ variantId: string; allocation: number }>;

    switch (config.banditConfig.algorithm) {
      case 'epsilon-greedy':
        newAllocations = this.epsilonGreedy(
          variants,
          performances,
          config.banditConfig.explorationRate || 0.1,
        );
        break;

      case 'thompson-sampling':
        newAllocations = this.thompsonSampling(
          variants,
          performances,
          config.banditConfig.priorAlpha || 1,
          config.banditConfig.priorBeta || 1,
        );
        break;

      case 'ucb':
        newAllocations = this.upperConfidenceBound(
          variants,
          performances,
          config.banditConfig.confidenceLevel || 0.95,
        );
        break;

      default:
        throw new Error(`Unsupported bandit algorithm: ${config.banditConfig.algorithm}`);
    }

    // Update variant allocations
    await this.variantManager.updateTrafficAllocations(newAllocations);

    // Check early stopping conditions
    await this.checkEarlyStopping(experimentId, config);
  }

  /**
   * Epsilon-greedy algorithm
   */
  private epsilonGreedy(
    variants: Variant[],
    performances: Array<{ variantId: string; mean: number; count: number }>,
    epsilon: number,
  ): Array<{ variantId: string; allocation: number }> {
    // Find best performing variant
    const bestVariant = performances.reduce((best, current) =>
      current.mean > best.mean ? current : best,
    );

    // Allocate epsilon to exploration (uniform), 1-epsilon to exploitation (best variant)
    const explorationPerVariant = epsilon / variants.length;
    const exploitation = 1 - epsilon;

    return variants.map((variant) => ({
      variantId: variant.id,
      allocation:
        variant.id === bestVariant.variantId
          ? exploitation + explorationPerVariant
          : explorationPerVariant,
    }));
  }

  /**
   * Thompson Sampling algorithm
   */
  private thompsonSampling(
    variants: Variant[],
    performances: Array<{ variantId: string; mean: number; count: number }>,
    priorAlpha: number,
    priorBeta: number,
  ): Array<{ variantId: string; allocation: number }> {
    // Sample from Beta distribution for each variant
    const samples = performances.map((perf) => {
      const successes = perf.mean * perf.count;
      const failures = perf.count - successes;

      const alpha = priorAlpha + successes;
      const beta = priorBeta + failures;

      // Sample from Beta(alpha, beta)
      const sample = this.betaSample(alpha, beta);

      return {
        variantId: perf.variantId,
        sample,
      };
    });

    // Calculate softmax probabilities
    const maxSample = Math.max(...samples.map((s) => s.sample));
    const expSamples = samples.map((s) => ({
      variantId: s.variantId,
      exp: Math.exp(s.sample - maxSample), // Numerical stability
    }));

    const sumExp = expSamples.reduce((sum, s) => sum + s.exp, 0);

    return expSamples.map((s) => ({
      variantId: s.variantId,
      allocation: s.exp / sumExp,
    }));
  }

  /**
   * Upper Confidence Bound (UCB) algorithm
   */
  private upperConfidenceBound(
    variants: Variant[],
    performances: Array<{ variantId: string; mean: number; count: number; variance: number }>,
    confidenceLevel: number,
  ): Array<{ variantId: string; allocation: number }> {
    const totalCount = performances.reduce((sum, p) => sum + p.count, 0);

    // Calculate UCB for each variant
    const ucbScores = performances.map((perf) => {
      if (perf.count === 0) {
        return {
          variantId: perf.variantId,
          ucb: Infinity,
        };
      }

      // UCB1 formula
      const exploration = Math.sqrt((2 * Math.log(totalCount)) / perf.count);
      const ucb = perf.mean + confidenceLevel * exploration;

      return {
        variantId: perf.variantId,
        ucb,
      };
    });

    // Find variant with highest UCB
    const bestVariant = ucbScores.reduce((best, current) =>
      current.ucb > best.ucb ? current : best,
    );

    // Allocate more traffic to variants with higher UCB
    const softmaxScores = ucbScores.map((s) => ({
      variantId: s.variantId,
      score: s.ucb === Infinity ? 1 : Math.exp(s.ucb),
    }));

    const sumScores = softmaxScores.reduce((sum, s) => sum + s.score, 0);

    return softmaxScores.map((s) => ({
      variantId: s.variantId,
      allocation: s.score / sumScores,
    }));
  }

  /**
   * Check early stopping conditions
   */
  private async checkEarlyStopping(
    experimentId: string,
    config: AutoOptimizationConfig,
  ): Promise<void> {
    const analysis = await this.analyzer.analyze(experimentId);

    // Check minimum sample size
    if (analysis.totalSampleSize < config.earlyStoppingRules.minSampleSize) {
      return;
    }

    // Check if we have a clear winner with high confidence
    if (analysis.recommendation) {
      if (analysis.recommendation.confidence >= config.earlyStoppingRules.probabilityThreshold) {
        console.log(
          `Early stopping triggered for experiment ${experimentId}: ${analysis.recommendation.reason}`,
        );

        // Stop optimization
        await this.disable(experimentId);

        // Mark config as completed
        await this.supabase
          .from('auto_optimization_configs')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
      }
    }
  }

  /**
   * Sample from Beta distribution
   */
  private betaSample(alpha: number, beta: number): number {
    const x = this.gammaSample(alpha, 1);
    const y = this.gammaSample(beta, 1);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution
   */
  private gammaSample(shape: number, scale: number): number {
    if (shape < 1) {
      return this.gammaSample(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.normalSample();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return scale * d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return scale * d * v;
      }
    }
  }

  /**
   * Sample from standard normal distribution
   */
  private normalSample(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Start optimization loop
   */
  private startOptimization(experimentId: string, updateFrequency: number): void {
    this.stopOptimization(experimentId);

    const interval = setInterval(async () => {
      try {
        await this.optimizeTraffic(experimentId);
      } catch (error) {
        console.error(`Auto-optimization error for ${experimentId}:`, error);
      }
    }, updateFrequency);

    this.optimizationIntervals.set(experimentId, interval);
  }

  /**
   * Stop optimization loop
   */
  private stopOptimization(experimentId: string): void {
    const interval = this.optimizationIntervals.get(experimentId);
    if (interval) {
      clearInterval(interval);
      this.optimizationIntervals.delete(experimentId);
    }
  }

  /**
   * Get optimization config
   */
  private async getConfig(experimentId: string): Promise<AutoOptimizationConfig | null> {
    const { data, error } = await this.supabase
      .from('auto_optimization_configs')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToAutoOptimizationConfig(data);
  }

  /**
   * Map database record to AutoOptimizationConfig
   */
  private mapToAutoOptimizationConfig(data: Record<string, unknown>): AutoOptimizationConfig {
    return {
      id: data.id as string,
      experimentId: data.experiment_id as string,
      enabled: data.enabled as boolean,
      banditConfig: data.bandit_config as BanditConfig,
      earlyStoppingRules: data.early_stopping_rules as AutoOptimizationConfig['earlyStoppingRules'],
      status: data.status as AutoOptimizationConfig['status'],
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup(): void {
    this.optimizationIntervals.forEach((interval) => clearInterval(interval));
    this.optimizationIntervals.clear();
  }
}
