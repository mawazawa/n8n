/**
 * A/B Testing Module - Main Exports
 * Comprehensive A/B testing system for workflow optimization
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Router } from 'express';

// Export all types
export * from './types.js';

// Export all managers and services
export { ExperimentManager } from './manager.js';
export { AssignmentManager } from './assignment.js';
export { VariantManager } from './variants.js';
export { MetricCollector, PREDEFINED_METRICS } from './metrics.js';
export { StatisticalAnalyzer } from './analysis.js';
export { SignificanceTester } from './significance.js';
export { SegmentManager } from './segmentation.js';
export { RolloutManager } from './rollout.js';
export { GuardrailManager } from './guardrails.js';
export { ReportGenerator } from './reports.js';
export { AutoOptimizer } from './automation.js';
export { setupABTestingRoutes } from './api.js';

// Import for service
import { ExperimentManager } from './manager.js';
import { AssignmentManager } from './assignment.js';
import { VariantManager } from './variants.js';
import { MetricCollector } from './metrics.js';
import { StatisticalAnalyzer } from './analysis.js';
import { SignificanceTester } from './significance.js';
import { SegmentManager } from './segmentation.js';
import { RolloutManager } from './rollout.js';
import { GuardrailManager } from './guardrails.js';
import { ReportGenerator } from './reports.js';
import { AutoOptimizer } from './automation.js';
import { setupABTestingRoutes } from './api.js';

/**
 * Main A/B Testing Service
 * Unified interface for all A/B testing functionality
 */
export class ABTestingService {
  public experiments: ExperimentManager;
  public assignments: AssignmentManager;
  public variants: VariantManager;
  public metrics: MetricCollector;
  public analysis: StatisticalAnalyzer;
  public significance: SignificanceTester;
  public segments: SegmentManager;
  public rollout: RolloutManager;
  public guardrails: GuardrailManager;
  public reports: ReportGenerator;
  public autoOptimize: AutoOptimizer;

  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;

    // Initialize all managers
    this.experiments = new ExperimentManager(supabase);
    this.assignments = new AssignmentManager(supabase);
    this.variants = new VariantManager(supabase);
    this.metrics = new MetricCollector(supabase);
    this.analysis = new StatisticalAnalyzer(supabase);
    this.significance = new SignificanceTester();
    this.segments = new SegmentManager(supabase);
    this.rollout = new RolloutManager(supabase);
    this.guardrails = new GuardrailManager(supabase);
    this.reports = new ReportGenerator(supabase);
    this.autoOptimize = new AutoOptimizer(supabase);
  }

  /**
   * Setup API routes
   */
  setupRoutes(router: Router): void {
    setupABTestingRoutes(router, this.supabase);
  }

  /**
   * Cleanup resources on shutdown
   */
  cleanup(): void {
    this.metrics.stopAggregation();
    this.rollout.cleanup();
    this.guardrails.cleanup();
    this.autoOptimize.cleanup();
    this.assignments.clearCache();
  }
}

/**
 * SDK Helper Functions
 * Simplified API for common operations
 */

/**
 * Create and start a simple A/B test
 */
export async function createSimpleABTest(
  service: ABTestingService,
  options: {
    name: string;
    workflowId: string;
    controlWorkflowId: string;
    treatmentWorkflowId: string;
    userId: string;
  },
) {
  // Create experiment with two variants
  const experiment = await service.experiments.create(
    {
      name: options.name,
      workflowId: options.workflowId,
      variants: [
        {
          name: 'Control',
          config: { workflowId: options.controlWorkflowId },
          trafficAllocation: 0.5,
          isControl: true,
        },
        {
          name: 'Treatment',
          config: { workflowId: options.treatmentWorkflowId },
          trafficAllocation: 0.5,
          isControl: false,
        },
      ],
      metrics: [
        {
          name: 'success_rate',
          type: 'proportion',
          goal: 'maximize',
          isPrimary: true,
        },
        {
          name: 'latency',
          type: 'continuous',
          goal: 'minimize',
          unit: 'ms',
          isPrimary: false,
        },
      ],
    },
    options.userId,
  );

  // Start experiment
  await service.experiments.start(experiment.id);

  return experiment;
}

/**
 * Get variant for user and track execution
 */
export async function executeWithABTest(
  service: ABTestingService,
  options: {
    experimentId: string;
    userId: string;
    execute: (workflowId: string) => Promise<{ success: boolean; duration: number }>;
  },
) {
  // Assign user to variant
  const variant = await service.assignments.assign(options.userId, options.experimentId);

  // Execute workflow
  const startTime = performance.now();
  let result: { success: boolean; duration: number };

  try {
    result = await options.execute(variant.config.workflowId);
  } catch (error) {
    result = {
      success: false,
      duration: performance.now() - startTime,
    };
  }

  // Track metrics
  await service.metrics.trackSuccess(
    options.experimentId,
    variant.id,
    result.success,
    options.userId,
  );

  await service.metrics.trackLatency(
    options.experimentId,
    variant.id,
    result.duration,
    options.userId,
  );

  return {
    variant,
    result,
  };
}

/**
 * Run experiment until statistical significance
 */
export async function runUntilSignificant(
  service: ABTestingService,
  experimentId: string,
  options: {
    checkIntervalMs?: number;
    maxDuration?: number;
    onUpdate?: (analysis: Awaited<ReturnType<typeof service.analysis.analyze>>) => void;
  } = {},
): Promise<Awaited<ReturnType<typeof service.analysis.analyze>>> {
  const checkInterval = options.checkIntervalMs || 60000; // 1 minute
  const maxDuration = options.maxDuration || 7 * 24 * 60 * 60 * 1000; // 7 days
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const analysis = await service.analysis.analyze(experimentId);

        // Call update callback if provided
        if (options.onUpdate) {
          options.onUpdate(analysis);
        }

        // Check if we have a significant result
        const hasSignificantResult = analysis.comparisons.some((c) => c.significance.isSignificant);

        if (hasSignificantResult) {
          clearInterval(interval);
          await service.experiments.stop(experimentId);
          resolve(analysis);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > maxDuration) {
          clearInterval(interval);
          reject(new Error('Experiment timeout - no significant results found'));
          return;
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    };

    const interval = setInterval(check, checkInterval);
    check(); // Run immediately
  });
}

/**
 * Quick experiment report
 */
export async function getQuickReport(service: ABTestingService, experimentId: string) {
  const analysis = await service.analysis.analyze(experimentId);
  const experiment = await service.experiments.getExperiment(experimentId);

  const summary = {
    experimentName: experiment.name,
    status: experiment.status,
    duration: analysis.duration,
    totalUsers: analysis.totalSampleSize,
    hasWinner: !!analysis.recommendation,
    winner: analysis.recommendation
      ? analysis.variants.find((v) => v.variantId === analysis.recommendation?.winningVariantId)
          ?.variantName
      : null,
    confidence: analysis.recommendation?.confidence || 0,
    improvements: analysis.comparisons
      .filter((c) => c.significance.isSignificant)
      .map((c) => ({
        metric: c.metricName,
        improvement: `${c.relativeImprovement.toFixed(1)}%`,
        variant: c.treatment.variantName,
      })),
  };

  return summary;
}

/**
 * Default export
 */
export default ABTestingService;
