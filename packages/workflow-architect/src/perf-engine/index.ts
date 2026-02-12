/**
 * Performance Optimization Engine
 * Main entry point for performance profiling, analysis, and optimization
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Profiler } from './profiler';
import { PerformanceAnalyzer } from './analyzer';
import { BottleneckDetector } from './bottlenecks';
import { AutoOptimizer } from './optimizer';
import { BenchmarkRunner } from './benchmarks';
import { RegressionDetector } from './regression';
import { ReportBuilder } from './reports';
import { AlertManager } from './alerts';
import { CacheAdvisor } from './caching';
import { ParallelizationAdvisor } from './parallelization';
import { ResourceAllocator } from './resource';
import { createPerformanceRouter } from './api';

// Export all types
export * from './types';

// Export all classes
export {
  Profiler,
  PerformanceAnalyzer,
  BottleneckDetector,
  AutoOptimizer,
  BenchmarkRunner,
  RegressionDetector,
  ReportBuilder,
  AlertManager,
  CacheAdvisor,
  ParallelizationAdvisor,
  ResourceAllocator,
  createPerformanceRouter,
};

/**
 * Main Performance Engine class
 * Provides unified access to all performance optimization features
 */
export class PerformanceEngine {
  public readonly profiler: Profiler;
  public readonly analyzer: PerformanceAnalyzer;
  public readonly bottleneckDetector: BottleneckDetector;
  public readonly optimizer: AutoOptimizer;
  public readonly benchmarkRunner: BenchmarkRunner;
  public readonly regressionDetector: RegressionDetector;
  public readonly reportBuilder: ReportBuilder;
  public readonly alertManager: AlertManager;
  public readonly cacheAdvisor: CacheAdvisor;
  public readonly parallelizationAdvisor: ParallelizationAdvisor;
  public readonly resourceAllocator: ResourceAllocator;

  constructor(private supabase: SupabaseClient) {
    this.profiler = new Profiler();
    this.analyzer = new PerformanceAnalyzer(supabase);
    this.bottleneckDetector = new BottleneckDetector();
    this.optimizer = new AutoOptimizer(supabase);
    this.benchmarkRunner = new BenchmarkRunner();
    this.regressionDetector = new RegressionDetector(supabase);
    this.reportBuilder = new ReportBuilder(supabase);
    this.alertManager = new AlertManager(supabase);
    this.cacheAdvisor = new CacheAdvisor();
    this.parallelizationAdvisor = new ParallelizationAdvisor();
    this.resourceAllocator = new ResourceAllocator();
  }

  /**
   * Create Express router for performance API
   */
  createRouter() {
    return createPerformanceRouter(this.supabase);
  }

  /**
   * Quick analysis of a workflow
   * Returns comprehensive performance insights
   */
  async quickAnalysis(workflowId: string) {
    // Get workflow data (mock for now)
    const workflow = {
      id: workflowId,
      name: 'Workflow',
      nodes: [],
      connections: [],
    };

    // Run analysis
    const analysis = await this.analyzer.analyze(workflow);

    // Get latest profile if available
    const { data: profiles } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: false })
      .limit(1);

    let profile = null;
    if (profiles && profiles.length > 0) {
      profile = profiles[0];
    }

    // Get cache recommendations
    const cacheRecommendations = await this.cacheAdvisor.analyze(workflow, profile);

    // Get parallelization opportunities
    const parallelOpportunities = await this.parallelizationAdvisor.analyze(workflow, profile);

    // Get resource plan
    const resourcePlan = await this.resourceAllocator.allocate(workflow);

    return {
      analysis,
      cacheRecommendations: cacheRecommendations.slice(0, 5), // Top 5
      parallelOpportunities: parallelOpportunities.slice(0, 3), // Top 3
      resourcePlan,
      profile,
    };
  }

  /**
   * Profile and analyze an execution
   */
  async profileExecution(execution: {
    id: string;
    workflowId: string;
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      startTime: number;
      endTime: number;
      inputItems: number;
      outputItems: number;
      error?: string;
    }>;
    startTime: number;
    endTime: number;
  }) {
    // Profile the execution
    const profile = await this.profiler.profile(execution, {
      includeFlameGraph: true,
      captureMemory: true,
      captureNetwork: true,
      captureDisk: true,
    });

    // Save profile
    await this.supabase.from('performance_profiles').insert({
      id: profile.id,
      workflow_id: profile.workflowId,
      execution_id: profile.executionId,
      start_time: new Date(profile.startTime).toISOString(),
      end_time: new Date(profile.endTime).toISOString(),
      duration: profile.duration,
      node_metrics: profile.nodeMetrics,
      total_resource_usage: profile.totalResourceUsage,
      flame_graph: profile.flameGraph,
      metadata: profile.metadata,
    });

    // Detect bottlenecks
    const bottlenecks = await this.bottleneckDetector.detect(profile);

    // Save bottlenecks
    if (bottlenecks.length > 0) {
      await this.supabase.from('bottlenecks').insert(
        bottlenecks.map((b) => ({
          id: b.id,
          profile_id: profile.id,
          workflow_id: profile.workflowId,
          execution_id: profile.executionId,
          node_id: b.nodeId,
          node_name: b.nodeName,
          type: b.type,
          severity: b.severity,
          impact: b.impact,
          description: b.description,
          root_cause: b.rootCause,
          evidence: b.evidence,
          detected_at: b.detectedAt,
          metadata: b.metadata,
        })),
      );
    }

    // Check for regressions
    const regressions = await this.regressionDetector.detectFromHistory(
      profile.workflowId,
      profile.executionId,
    );

    return {
      profile,
      bottlenecks,
      regressions,
    };
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(
    workflowId: string,
    period: { start: string; end: string },
  ) {
    // Get analysis
    const workflow = {
      id: workflowId,
      name: 'Workflow',
      nodes: [],
      connections: [],
    };
    const analysis = await this.analyzer.analyze(workflow);

    // Build report
    const report = await this.reportBuilder.build(workflowId, period, analysis);

    // Save report
    await this.supabase.from('performance_reports').insert({
      id: report.id,
      workflow_id: report.workflowId,
      period_start: report.period.start,
      period_end: report.period.end,
      summary: report.summary,
      metrics: report.metrics,
      bottlenecks: report.bottlenecks,
      optimizations: report.optimizations,
      trends: report.trends,
      regressions: report.regressions,
      visualizations: report.visualizations,
      generated_at: report.generatedAt,
      metadata: report.metadata,
    });

    return report;
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(
    workflowId: string,
    executeWorkflow: () => Promise<{ duration: number; success: boolean; error?: string }>,
    options: {
      iterations?: number;
      warmupRuns?: number;
      timeout?: number;
    } = {},
  ) {
    const config = {
      iterations: options.iterations || 10,
      warmupRuns: options.warmupRuns || 2,
      timeout: options.timeout,
    };

    const result = await this.benchmarkRunner.run(workflowId, executeWorkflow, config);

    // Save benchmark
    await this.supabase.from('benchmarks').insert({
      id: result.id,
      workflow_id: result.workflowId,
      iterations: result.iterations,
      warmup_runs: result.warmupRuns,
      metrics: result.metrics,
      outliers: result.outliers,
      comparisons: result.comparisons,
      timestamp: result.timestamp,
      metadata: result.metadata,
    });

    return result;
  }

  /**
   * Configure performance monitoring
   */
  configureMonitoring(
    workflowId: string,
    options: {
      thresholds?: Array<{
        metric: string;
        operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
        value: number;
        severity: 'info' | 'warning' | 'error' | 'critical';
        duration?: number;
        cooldown?: number;
      }>;
      enableAnomalyDetection?: boolean;
    },
  ) {
    this.alertManager.configure({
      workflowId,
      thresholds: options.thresholds || [],
      enableAnomalyDetection: options.enableAnomalyDetection ?? true,
    });
  }

  /**
   * Get performance metrics for a workflow
   */
  async getMetrics(
    workflowId: string,
    period?: { start: string; end: string },
  ) {
    let query = this.supabase
      .from('performance_profiles')
      .select('duration, total_resource_usage, start_time')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: false });

    if (period) {
      query = query.gte('start_time', period.start).lte('start_time', period.end);
    } else {
      query = query.limit(100);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }

    return data || [];
  }
}

/**
 * Convenience function to create a PerformanceEngine instance
 */
export function createPerformanceEngine(supabase: SupabaseClient): PerformanceEngine {
  return new PerformanceEngine(supabase);
}
