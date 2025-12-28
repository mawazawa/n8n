/**
 * StatisticalAnalyzer - Comprehensive statistical analysis for A/B tests
 * Performs mean comparison, variance analysis, and effect size calculation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnalysisResult,
  VariantAnalysis,
  ComparisonResult,
  StatisticalSummary,
  Experiment,
  Variant,
} from './types.js';
import { SignificanceTester } from './significance.js';
import { MetricCollector } from './metrics.js';

export class StatisticalAnalyzer {
  private supabase: SupabaseClient;
  private significanceTester: SignificanceTester;
  private metricCollector: MetricCollector;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.significanceTester = new SignificanceTester();
    this.metricCollector = new MetricCollector(supabase, 0); // No auto-aggregation
  }

  /**
   * Analyze an experiment
   * Detects 5%+ differences with 95% confidence
   */
  async analyze(experimentId: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Get experiment details
    const experiment = await this.getExperiment(experimentId);

    // Analyze each variant
    const variantAnalyses = await Promise.all(
      experiment.variants.map((variant) => this.analyzeVariant(variant, experiment)),
    );

    // Perform pairwise comparisons with control
    const controlVariant = experiment.variants.find((v) => v.isControl);
    if (!controlVariant) {
      throw new Error('No control variant found');
    }

    const controlAnalysis = variantAnalyses.find((va) => va.variantId === controlVariant.id);
    if (!controlAnalysis) {
      throw new Error('Control analysis not found');
    }

    const comparisons: ComparisonResult[] = [];
    for (const variant of experiment.variants) {
      if (variant.id === controlVariant.id) continue;

      const treatmentAnalysis = variantAnalyses.find((va) => va.variantId === variant.id);
      if (!treatmentAnalysis) continue;

      for (const metric of experiment.metrics) {
        const comparison = await this.compareVariants(
          metric.name,
          controlAnalysis,
          treatmentAnalysis,
          experiment.confidenceLevel,
          metric.type,
        );
        comparisons.push(comparison);
      }
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      variantAnalyses,
      comparisons,
      experiment,
    );

    const totalSampleSize = variantAnalyses.reduce((sum, va) => sum + va.sampleSize, 0);

    return {
      experimentId: experiment.id,
      experimentName: experiment.name,
      status: experiment.status,
      duration: experiment.startDate ? Date.now() - new Date(experiment.startDate).getTime() : 0,
      totalSampleSize,
      variants: variantAnalyses,
      comparisons,
      recommendation,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyze a single variant
   */
  private async analyzeVariant(
    variant: Variant,
    experiment: Experiment,
  ): Promise<VariantAnalysis> {
    const statistics = new Map<string, StatisticalSummary>();

    // Get metric data for this variant
    for (const metric of experiment.metrics) {
      const metricData = await this.getMetricData(experiment.id, variant.id, metric.name);

      if (metricData.length > 0) {
        const summary = this.calculateStatisticalSummary(metricData, experiment.confidenceLevel);
        statistics.set(metric.name, summary);
      }
    }

    // Get sample size (number of unique users assigned to this variant)
    const sampleSize = await this.getVariantSampleSize(experiment.id, variant.id);

    return {
      variantId: variant.id,
      variantName: variant.name,
      isControl: variant.isControl,
      statistics,
      sampleSize,
    };
  }

  /**
   * Compare two variants for a specific metric
   */
  private async compareVariants(
    metricName: string,
    control: VariantAnalysis,
    treatment: VariantAnalysis,
    confidenceLevel: number,
    metricType: 'continuous' | 'proportion' | 'count' | 'rate',
  ): Promise<ComparisonResult> {
    const controlStats = control.statistics.get(metricName);
    const treatmentStats = treatment.statistics.get(metricName);

    if (!controlStats || !treatmentStats) {
      throw new Error(`Missing statistics for metric: ${metricName}`);
    }

    // Determine appropriate test type
    const testType = metricType === 'proportion' ? 'chi-square' : 't-test';

    // Perform significance test
    const significance = this.significanceTester.test(
      {
        mean: controlStats.mean,
        variance: controlStats.variance,
        sampleSize: controlStats.sampleSize,
      },
      {
        mean: treatmentStats.mean,
        variance: treatmentStats.variance,
        sampleSize: treatmentStats.sampleSize,
      },
      confidenceLevel,
      testType,
    );

    // Calculate relative improvement
    const absoluteDifference = treatmentStats.mean - controlStats.mean;
    const relativeImprovement =
      controlStats.mean !== 0 ? (absoluteDifference / controlStats.mean) * 100 : 0;

    return {
      metricName,
      control,
      treatment,
      significance,
      relativeImprovement,
      absoluteDifference,
    };
  }

  /**
   * Calculate statistical summary for a dataset
   */
  private calculateStatisticalSummary(
    data: number[],
    confidenceLevel: number,
  ): StatisticalSummary {
    const n = data.length;
    const mean = data.reduce((sum, x) => sum + x, 0) / n;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
    const standardDeviation = Math.sqrt(variance);
    const standardError = standardDeviation / Math.sqrt(n);

    // Calculate confidence interval
    const zScore = this.getZScore(confidenceLevel);
    const marginOfError = zScore * standardError;

    return {
      mean,
      variance,
      standardDeviation,
      standardError,
      sampleSize: n,
      confidenceInterval: {
        lower: mean - marginOfError,
        upper: mean + marginOfError,
        level: confidenceLevel,
      },
    };
  }

  /**
   * Generate recommendation based on analysis
   */
  private generateRecommendation(
    variants: VariantAnalysis[],
    comparisons: ComparisonResult[],
    experiment: Experiment,
  ): AnalysisResult['recommendation'] {
    // Find primary metric
    const primaryMetric = experiment.metrics.find((m) => m.isPrimary);
    if (!primaryMetric) {
      return undefined;
    }

    // Find best performing variant for primary metric
    const primaryComparisons = comparisons.filter((c) => c.metricName === primaryMetric.name);

    // Filter significant improvements
    const significantImprovements = primaryComparisons.filter(
      (c) => c.significance.isSignificant && c.relativeImprovement > 0,
    );

    if (significantImprovements.length === 0) {
      return {
        winningVariantId: variants.find((v) => v.isControl)?.variantId || '',
        confidence: 0.5,
        reason: 'No significant improvements detected. Recommend staying with control variant.',
      };
    }

    // Find best improvement
    const bestImprovement = significantImprovements.reduce((best, current) =>
      Math.abs(current.relativeImprovement) > Math.abs(best.relativeImprovement)
        ? current
        : best,
    );

    return {
      winningVariantId: bestImprovement.treatment.variantId,
      confidence: 1 - bestImprovement.significance.pValue,
      reason: `Variant "${bestImprovement.treatment.variantName}" shows ${bestImprovement.relativeImprovement.toFixed(1)}% improvement in ${primaryMetric.name} with ${((1 - bestImprovement.significance.pValue) * 100).toFixed(1)}% confidence (p=${bestImprovement.significance.pValue.toFixed(4)}).`,
    };
  }

  /**
   * Get metric data for a variant
   */
  private async getMetricData(
    experimentId: string,
    variantId: string,
    metricName: string,
  ): Promise<number[]> {
    const { data, error } = await this.supabase
      .from('metric_events')
      .select('value')
      .eq('experiment_id', experimentId)
      .eq('variant_id', variantId)
      .eq('metric_name', metricName);

    if (error) {
      throw new Error(`Failed to fetch metric data: ${error.message}`);
    }

    return (data || []).map((row) => row.value as number);
  }

  /**
   * Get sample size for a variant (unique users)
   */
  private async getVariantSampleSize(experimentId: string, variantId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', experimentId)
      .eq('variant_id', variantId);

    if (error) {
      throw new Error(`Failed to get sample size: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Get experiment details
   */
  private async getExperiment(experimentId: string): Promise<Experiment> {
    const { data: expData, error: expError } = await this.supabase
      .from('experiments')
      .select('*')
      .eq('id', experimentId)
      .single();

    if (expError || !expData) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const { data: varData, error: varError } = await this.supabase
      .from('variants')
      .select('*')
      .eq('experiment_id', experimentId);

    if (varError) {
      throw new Error(`Failed to fetch variants: ${varError.message}`);
    }

    const { data: metricData, error: metricError } = await this.supabase
      .from('experiment_metrics')
      .select('*')
      .eq('experiment_id', experimentId);

    if (metricError) {
      throw new Error(`Failed to fetch metrics: ${metricError.message}`);
    }

    return this.mapToExperiment(expData, varData || [], metricData || []);
  }

  /**
   * Get Z-score for confidence level
   */
  private getZScore(confidenceLevel: number): number {
    // Common Z-scores
    const zScores: Record<string, number> = {
      '0.90': 1.645,
      '0.95': 1.96,
      '0.99': 2.576,
    };

    const key = confidenceLevel.toFixed(2);
    return zScores[key] || 1.96; // Default to 95%
  }

  /**
   * Map database records to Experiment
   */
  private mapToExperiment(
    expData: Record<string, unknown>,
    varData: Record<string, unknown>[],
    metricData: Record<string, unknown>[],
  ): Experiment {
    const variants: Variant[] = varData.map((v) => ({
      id: v.id as string,
      experimentId: v.experiment_id as string,
      name: v.name as string,
      description: v.description as string | undefined,
      config: v.config as Variant['config'],
      trafficAllocation: v.traffic_allocation as number,
      isControl: v.is_control as boolean,
      enabled: v.enabled as boolean,
      createdAt: v.created_at as string,
      updatedAt: v.updated_at as string,
    }));

    const metrics = metricData.map((m) => ({
      name: m.name as string,
      type: m.type as Experiment['metrics'][number]['type'],
      goal: m.goal as Experiment['metrics'][number]['goal'],
      description: m.description as string | undefined,
      unit: m.unit as string | undefined,
      isPrimary: m.is_primary as boolean,
    }));

    return {
      id: expData.id as string,
      name: expData.name as string,
      description: expData.description as string | undefined,
      workflowId: expData.workflow_id as string,
      status: expData.status as Experiment['status'],
      variants,
      metrics,
      hypothesis: expData.hypothesis as string | undefined,
      startDate: expData.start_date as string | undefined,
      endDate: expData.end_date as string | undefined,
      minimumSampleSize: expData.minimum_sample_size as number,
      confidenceLevel: expData.confidence_level as number,
      minimumDetectableEffect: expData.minimum_detectable_effect as number,
      segmentId: expData.segment_id as string | undefined,
      createdBy: expData.created_by as string,
      createdAt: expData.created_at as string,
      updatedAt: expData.updated_at as string,
    };
  }
}
