/**
 * Performance Engine REST API
 * Express routes for performance optimization operations
 */

import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
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
import {
  ProfilingOptionsSchema,
  BenchmarkConfigSchema,
  RegressionDetectionConfigSchema,
  AlertThresholdSchema,
} from './types';

export function createPerformanceRouter(supabase: SupabaseClient): Router {
  const router = Router();

  // Initialize components
  const profiler = new Profiler();
  const analyzer = new PerformanceAnalyzer(supabase);
  const bottleneckDetector = new BottleneckDetector();
  const optimizer = new AutoOptimizer(supabase);
  const benchmarkRunner = new BenchmarkRunner();
  const regressionDetector = new RegressionDetector(supabase);
  const reportBuilder = new ReportBuilder(supabase);
  const alertManager = new AlertManager(supabase);
  const cacheAdvisor = new CacheAdvisor();
  const parallelizationAdvisor = new ParallelizationAdvisor();
  const resourceAllocator = new ResourceAllocator();

  // ============================================================================
  // PROFILING ENDPOINTS
  // ============================================================================

  /**
   * Profile a workflow execution
   * POST /perf/profile
   */
  router.post('/profile', async (req, res) => {
    try {
      const { execution, options } = req.body;

      if (!execution) {
        return res.status(400).json({ error: 'Execution data is required' });
      }

      const validatedOptions = options ? ProfilingOptionsSchema.parse(options) : {};
      const profile = await profiler.profile(execution, validatedOptions);

      // Save profile to database
      await supabase.from('performance_profiles').insert({
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

      res.json({ profile });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get profile by ID
   * GET /perf/profile/:id
   */
  router.get('/profile/:id', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('performance_profiles')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.json({ profile: data });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // ANALYSIS ENDPOINTS
  // ============================================================================

  /**
   * Analyze workflow performance
   * GET /perf/analyze/:workflowId
   */
  router.get('/analyze/:workflowId', async (req, res) => {
    try {
      const workflowId = req.params.workflowId;

      // Mock workflow data - would fetch from n8n in production
      const workflow = {
        id: workflowId,
        name: 'Workflow',
        nodes: [],
        connections: [],
      };

      const analysis = await analyzer.analyze(workflow);

      res.json({ analysis });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Detect bottlenecks
   * POST /perf/bottlenecks
   */
  router.post('/bottlenecks', async (req, res) => {
    try {
      const { profileId } = req.body;

      if (!profileId) {
        return res.status(400).json({ error: 'Profile ID is required' });
      }

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('performance_profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (profileError || !profileData) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const bottlenecks = await bottleneckDetector.detect(profileData as any);

      res.json({ bottlenecks });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // OPTIMIZATION ENDPOINTS
  // ============================================================================

  /**
   * Get optimization suggestions
   * POST /perf/optimize
   */
  router.post('/optimize', async (req, res) => {
    try {
      const { workflowId, dryRun = true } = req.body;

      if (!workflowId) {
        return res.status(400).json({ error: 'Workflow ID is required' });
      }

      // Mock workflow and suggestions - would fetch real data in production
      const workflow = {
        id: workflowId,
        name: 'Workflow',
        nodes: [],
        connections: [],
      };

      const suggestions = []; // Would get from analyzer

      const result = await optimizer.optimize(workflow, suggestions, dryRun);

      res.json({ optimization: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get caching recommendations
   * GET /perf/caching/:workflowId
   */
  router.get('/caching/:workflowId', async (req, res) => {
    try {
      const workflowId = req.params.workflowId;

      // Mock workflow - would fetch from n8n in production
      const workflow = {
        id: workflowId,
        nodes: [],
      };

      const recommendations = await cacheAdvisor.analyze(workflow);

      res.json({ recommendations });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get parallelization opportunities
   * GET /perf/parallelization/:workflowId
   */
  router.get('/parallelization/:workflowId', async (req, res) => {
    try {
      const workflowId = req.params.workflowId;

      // Mock workflow - would fetch from n8n in production
      const workflow = {
        id: workflowId,
        nodes: [],
        connections: [],
      };

      const opportunities = await parallelizationAdvisor.analyze(workflow);

      res.json({ opportunities });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get resource allocation plan
   * GET /perf/resources/:workflowId
   */
  router.get('/resources/:workflowId', async (req, res) => {
    try {
      const workflowId = req.params.workflowId;

      // Mock workflow - would fetch from n8n in production
      const workflow = {
        id: workflowId,
        nodes: [],
      };

      const plan = await resourceAllocator.allocate(workflow);

      res.json({ plan });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // BENCHMARK ENDPOINTS
  // ============================================================================

  /**
   * Run performance benchmark
   * POST /perf/benchmark
   */
  router.post('/benchmark', async (req, res) => {
    try {
      const { workflowId, config } = req.body;

      if (!workflowId) {
        return res.status(400).json({ error: 'Workflow ID is required' });
      }

      const validatedConfig = BenchmarkConfigSchema.parse(config || {
        iterations: 10,
        warmupRuns: 2,
      });

      // Mock execution function - would execute real workflow in production
      const executeWorkflow = async () => ({
        duration: Math.random() * 1000,
        success: true,
      });

      const result = await benchmarkRunner.run(workflowId, executeWorkflow, validatedConfig);

      // Save benchmark result
      await supabase.from('benchmarks').insert({
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

      res.json({ benchmark: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get benchmark history
   * GET /perf/benchmark/:workflowId
   */
  router.get('/benchmark/:workflowId', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('benchmarks')
        .select('*')
        .eq('workflow_id', req.params.workflowId)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      res.json({ benchmarks: data || [] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // REGRESSION ENDPOINTS
  // ============================================================================

  /**
   * Check for performance regressions
   * GET /perf/regressions/:workflowId
   */
  router.get('/regressions/:workflowId', async (req, res) => {
    try {
      const workflowId = req.params.workflowId;
      const { executionId } = req.query;

      if (!executionId) {
        return res.status(400).json({ error: 'Execution ID is required' });
      }

      const regressions = await regressionDetector.detectFromHistory(
        workflowId,
        executionId as string,
      );

      res.json({ regressions });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // REPORT ENDPOINTS
  // ============================================================================

  /**
   * Generate performance report
   * POST /perf/report
   */
  router.post('/report', async (req, res) => {
    try {
      const { workflowId, period } = req.body;

      if (!workflowId || !period) {
        return res.status(400).json({ error: 'Workflow ID and period are required' });
      }

      const report = await reportBuilder.build(workflowId, period);

      res.json({ report });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Export report
   * GET /perf/report/:reportId/export
   */
  router.get('/report/:reportId/export', async (req, res) => {
    try {
      const { format = 'json' } = req.query;

      // Mock report - would fetch from database in production
      const report = {
        id: req.params.reportId,
        workflowId: 'test',
        period: { start: '', end: '' },
        summary: { totalExecutions: 0, avgDuration: 0, successRate: 0, performanceScore: 0 },
        metrics: [],
        bottlenecks: [],
        optimizations: [],
        trends: [],
        regressions: [],
        visualizations: [],
        generatedAt: new Date().toISOString(),
      };

      if (format === 'csv') {
        const csv = await reportBuilder.exportCsv(report);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="report-${report.id}.csv"`);
        res.send(csv);
      } else {
        const json = await reportBuilder.exportJson(report);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="report-${report.id}.json"`);
        res.send(json);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // ALERT ENDPOINTS
  // ============================================================================

  /**
   * Configure alerts
   * POST /perf/alerts/configure
   */
  router.post('/alerts/configure', async (req, res) => {
    try {
      const { workflowId, thresholds, enableAnomalyDetection } = req.body;

      if (!thresholds) {
        return res.status(400).json({ error: 'Thresholds are required' });
      }

      const validatedThresholds = thresholds.map((t: unknown) => AlertThresholdSchema.parse(t));

      alertManager.configure({
        workflowId,
        thresholds: validatedThresholds,
        enableAnomalyDetection,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get active alerts
   * GET /perf/alerts/:workflowId
   */
  router.get('/alerts/:workflowId', async (req, res) => {
    try {
      const alerts = await alertManager.getActiveAlerts(req.params.workflowId);

      res.json({ alerts });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Acknowledge alert
   * POST /perf/alerts/:alertId/acknowledge
   */
  router.post('/alerts/:alertId/acknowledge', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      await alertManager.acknowledge(req.params.alertId, userId);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
