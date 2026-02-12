/**
 * Workflow Intelligence Module
 * Main exports for the intelligence system
 */

// Core Classes
export { WorkflowAnalyzer } from './analyzer.js';
export { InsightGenerator } from './insights.js';
export { RecommendationEngine } from './recommendations.js';
export { SimilarityFinder } from './similarity.js';
export { ClusterAnalyzer } from './clustering.js';
export { TrendDetector } from './trends.js';
export { FailurePredictor } from './predictions.js';
export { BenchmarkService } from './benchmarking.js';
export { CostAnalyzer } from './cost-analysis.js';
export { ImpactAnalyzer } from './impact.js';
export { ReportBuilder } from './reports.js';
export { AlertEngine } from './alerts.js';
export { IntelligenceAPI } from './api.js';

// Types
export type {
  Insight,
  Recommendation,
  TrendData,
  Trend,
  PredictionResult,
  Prediction,
  SimilarWorkflow,
  SimilarityMetrics,
  Cluster,
  ClusteringResult,
  Pattern,
  BenchmarkResult,
  CostAnalysis,
  ImpactReport,
  IntelligenceReport,
  ReportSection,
  Alert,
  AlertRule,
  ValidatedInsight,
  ValidatedRecommendation,
  ValidatedTrendData,
  ValidatedPredictionResult,
  ValidatedAlertRule,
  ValidatedBenchmarkResult,
} from './types.js';

export { InsightType, InsightSeverity } from './types.js';

// Schemas
export {
  InsightSchema,
  RecommendationSchema,
  TrendDataSchema,
  PredictionResultSchema,
  AlertRuleSchema,
  BenchmarkResultSchema,
} from './types.js';

import type { WorkflowDefinition } from '../types/workflow.js';
import type { Insight, Recommendation, BenchmarkResult, CostAnalysis } from './types.js';
import { InsightGenerator } from './insights.js';
import { RecommendationEngine } from './recommendations.js';
import { BenchmarkService } from './benchmarking.js';
import { CostAnalyzer } from './cost-analysis.js';
import { SimilarityFinder } from './similarity.js';
import { FailurePredictor } from './predictions.js';

/**
 * Main WorkflowIntelligence class - convenience wrapper
 */
export class WorkflowIntelligence {
  private insightGenerator: InsightGenerator;
  private recommendationEngine: RecommendationEngine;
  private benchmarkService: BenchmarkService;
  private costAnalyzer: CostAnalyzer;
  private similarityFinder: SimilarityFinder;
  private failurePredictor: FailurePredictor;

  constructor() {
    this.insightGenerator = new InsightGenerator();
    this.recommendationEngine = new RecommendationEngine();
    this.benchmarkService = new BenchmarkService();
    this.costAnalyzer = new CostAnalyzer();
    this.similarityFinder = new SimilarityFinder();
    this.failurePredictor = new FailurePredictor();
  }

  /**
   * Get comprehensive workflow analysis
   */
  async analyze(
    workflow: WorkflowDefinition,
    allWorkflows: WorkflowDefinition[] = [],
  ): Promise<{
    insights: Insight[];
    recommendations: Recommendation[];
    benchmark: BenchmarkResult;
    costAnalysis: CostAnalysis;
  }> {
    const [insights, recommendations, benchmark, costAnalysis] = await Promise.all([
      this.getInsights(workflow),
      this.getRecommendations(workflow),
      this.getBenchmark(workflow, allWorkflows),
      this.getCostAnalysis(workflow),
    ]);

    return {
      insights,
      recommendations,
      benchmark,
      costAnalysis,
    };
  }

  /**
   * Get workflow insights
   */
  async getInsights(workflow: WorkflowDefinition): Promise<Insight[]> {
    return this.insightGenerator.generate(workflow);
  }

  /**
   * Get workflow recommendations
   */
  async getRecommendations(workflow: WorkflowDefinition): Promise<Recommendation[]> {
    return this.recommendationEngine.recommend(workflow);
  }

  /**
   * Get benchmark results
   */
  async getBenchmark(
    workflow: WorkflowDefinition,
    allWorkflows: WorkflowDefinition[],
  ): Promise<BenchmarkResult> {
    return this.benchmarkService.benchmark(workflow, allWorkflows);
  }

  /**
   * Get cost analysis
   */
  async getCostAnalysis(workflow: WorkflowDefinition): Promise<CostAnalysis> {
    return this.costAnalyzer.analyze(workflow);
  }

  /**
   * Find similar workflows
   */
  async findSimilar(
    workflow: WorkflowDefinition,
    k: number,
    allWorkflows: WorkflowDefinition[],
  ) {
    return this.similarityFinder.findSimilar(workflow, k, allWorkflows);
  }

  /**
   * Predict workflow failure
   */
  async predictFailure(workflow: WorkflowDefinition) {
    return this.failurePredictor.predictFailure(workflow);
  }

  /**
   * Get health score
   */
  async getHealthScore(workflow: WorkflowDefinition): Promise<number> {
    const insights = await this.getInsights(workflow);

    let score = 100;

    // Deduct based on severity
    const critical = insights.filter((i) => i.severity === 'critical').length;
    const high = insights.filter((i) => i.severity === 'high').length;
    const medium = insights.filter((i) => i.severity === 'medium').length;

    score -= critical * 15;
    score -= high * 10;
    score -= medium * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get optimization opportunities
   */
  async getOptimizationOpportunities(
    workflow: WorkflowDefinition,
  ): Promise<Recommendation[]> {
    const recommendations = await this.getRecommendations(workflow);

    // Filter for optimizations (performance, cost, reliability)
    return recommendations.filter(
      (r) =>
        r.insight.type === 'performance' ||
        r.insight.type === 'cost' ||
        r.insight.type === 'reliability',
    );
  }

  /**
   * Get quick wins (high impact, low effort)
   */
  async getQuickWins(workflow: WorkflowDefinition): Promise<Recommendation[]> {
    const recommendations = await this.getRecommendations(workflow);

    return recommendations.filter(
      (r) =>
        (r.impact === 'high' || r.impact === 'medium') &&
        (r.effort === 'low' || r.effort === 'medium'),
    );
  }
}
