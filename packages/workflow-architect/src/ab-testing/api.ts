/**
 * A/B Testing REST API
 * Express routes for experiment management
 */

import type { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExperimentManager } from './manager.js';
import { AssignmentManager } from './assignment.js';
import { MetricCollector } from './metrics.js';
import { StatisticalAnalyzer } from './analysis.js';
import { ReportGenerator } from './reports.js';
import { SegmentManager } from './segmentation.js';
import { RolloutManager } from './rollout.js';
import { GuardrailManager } from './guardrails.js';
import { AutoOptimizer } from './automation.js';
import type {
  CreateExperimentInput,
  UpdateExperimentInput,
  GuardrailRule,
  BanditConfig,
} from './types.js';

export function setupABTestingRoutes(router: Router, supabase: SupabaseClient): void {
  const experimentManager = new ExperimentManager(supabase);
  const assignmentManager = new AssignmentManager(supabase);
  const metricCollector = new MetricCollector(supabase);
  const analyzer = new StatisticalAnalyzer(supabase);
  const reportGenerator = new ReportGenerator(supabase);
  const segmentManager = new SegmentManager(supabase);
  const rolloutManager = new RolloutManager(supabase);
  const guardrailManager = new GuardrailManager(supabase);
  const autoOptimizer = new AutoOptimizer(supabase);

  /**
   * POST /ab-testing/experiments
   * Create a new experiment
   */
  router.post('/ab-testing/experiments', async (req: Request, res: Response) => {
    try {
      const input = req.body as CreateExperimentInput;
      const userId = (req as Request & { user?: { id: string } }).user?.id || 'anonymous';

      const experiment = await experimentManager.create(input, userId);
      res.status(201).json(experiment);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create experiment',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id
   * Get experiment details
   */
  router.get('/ab-testing/experiments/:id', async (req: Request, res: Response) => {
    try {
      const experiment = await experimentManager.getExperiment(req.params.id);
      res.json(experiment);
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Experiment not found',
      });
    }
  });

  /**
   * GET /ab-testing/experiments
   * List experiments
   */
  router.get('/ab-testing/experiments', async (req: Request, res: Response) => {
    try {
      const { workflowId, status, limit, offset } = req.query;

      const experiments = await experimentManager.listExperiments({
        workflowId: workflowId as string | undefined,
        status: status as CreateExperimentInput['metrics'][number]['goal'] | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(experiments);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list experiments',
      });
    }
  });

  /**
   * PATCH /ab-testing/experiments/:id
   * Update experiment
   */
  router.patch('/ab-testing/experiments/:id', async (req: Request, res: Response) => {
    try {
      const input = req.body as UpdateExperimentInput;
      const experiment = await experimentManager.update(req.params.id, input);
      res.json(experiment);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update experiment',
      });
    }
  });

  /**
   * DELETE /ab-testing/experiments/:id
   * Delete experiment
   */
  router.delete('/ab-testing/experiments/:id', async (req: Request, res: Response) => {
    try {
      await experimentManager.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete experiment',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/start
   * Start an experiment
   */
  router.post('/ab-testing/experiments/:id/start', async (req: Request, res: Response) => {
    try {
      await experimentManager.start(req.params.id);
      res.json({ message: 'Experiment started successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to start experiment',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/pause
   * Pause an experiment
   */
  router.post('/ab-testing/experiments/:id/pause', async (req: Request, res: Response) => {
    try {
      await experimentManager.pause(req.params.id);
      res.json({ message: 'Experiment paused successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to pause experiment',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/stop
   * Stop an experiment
   */
  router.post('/ab-testing/experiments/:id/stop', async (req: Request, res: Response) => {
    try {
      await experimentManager.stop(req.params.id);
      res.json({ message: 'Experiment stopped successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to stop experiment',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id/results
   * Get experiment analysis results
   */
  router.get('/ab-testing/experiments/:id/results', async (req: Request, res: Response) => {
    try {
      const results = await analyzer.analyze(req.params.id);
      res.json(results);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to analyze experiment',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id/report
   * Get experiment report
   */
  router.get('/ab-testing/experiments/:id/report', async (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string) || 'json';

      if (format === 'markdown') {
        const markdown = await reportGenerator.exportMarkdown(req.params.id);
        res.type('text/markdown').send(markdown);
      } else {
        const report = await reportGenerator.generate(req.params.id);
        res.json(report);
      }
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate report',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/track
   * Track a metric event
   */
  router.post('/ab-testing/experiments/:id/track', async (req: Request, res: Response) => {
    try {
      const { variantId, metricName, value, userId, metadata } = req.body;

      await metricCollector.track(
        req.params.id,
        variantId,
        metricName,
        value,
        userId,
        metadata,
      );

      res.status(201).json({ message: 'Metric tracked successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to track metric',
      });
    }
  });

  /**
   * POST /ab-testing/assign
   * Assign user to variant
   */
  router.post('/ab-testing/assign', async (req: Request, res: Response) => {
    try {
      const { userId, experimentId } = req.body;

      const variant = await assignmentManager.assign(userId, experimentId);
      res.json(variant);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to assign variant',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id/assignments
   * Get experiment assignments
   */
  router.get('/ab-testing/experiments/:id/assignments', async (req: Request, res: Response) => {
    try {
      const assignments = await assignmentManager.getExperimentAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch assignments',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id/distribution
   * Get variant traffic distribution
   */
  router.get('/ab-testing/experiments/:id/distribution', async (req: Request, res: Response) => {
    try {
      const distribution = await assignmentManager.getVariantDistribution(req.params.id);
      res.json(distribution);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get distribution',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/guardrails
   * Configure guardrails
   */
  router.post('/ab-testing/experiments/:id/guardrails', async (req: Request, res: Response) => {
    try {
      const rules = req.body.rules as GuardrailRule[];
      await guardrailManager.configure(req.params.id, rules);
      res.json({ message: 'Guardrails configured successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to configure guardrails',
      });
    }
  });

  /**
   * GET /ab-testing/experiments/:id/alerts
   * Get active alerts
   */
  router.get('/ab-testing/experiments/:id/alerts', async (req: Request, res: Response) => {
    try {
      const alerts = await guardrailManager.getActiveAlerts(req.params.id);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch alerts',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/rollout
   * Configure gradual rollout
   */
  router.post('/ab-testing/experiments/:id/rollout', async (req: Request, res: Response) => {
    try {
      const config = await rolloutManager.configureRollout(req.body);
      res.status(201).json(config);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to configure rollout',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/rollout/start
   * Start rollout
   */
  router.post('/ab-testing/experiments/:id/rollout/start', async (req: Request, res: Response) => {
    try {
      const rollout = await rolloutManager.getRolloutByExperiment(req.params.id);
      if (!rollout) {
        throw new Error('No rollout configured');
      }
      await rolloutManager.startRollout(rollout.id);
      res.json({ message: 'Rollout started successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to start rollout',
      });
    }
  });

  /**
   * POST /ab-testing/experiments/:id/auto-optimize
   * Enable auto-optimization
   */
  router.post('/ab-testing/experiments/:id/auto-optimize', async (req: Request, res: Response) => {
    try {
      const { banditConfig, earlyStoppingConfig } = req.body as {
        banditConfig: BanditConfig;
        earlyStoppingConfig?: Parameters<typeof autoOptimizer.enable>[2];
      };

      const config = await autoOptimizer.enable(
        req.params.id,
        banditConfig,
        earlyStoppingConfig,
      );

      res.status(201).json(config);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to enable auto-optimization',
      });
    }
  });

  /**
   * DELETE /ab-testing/experiments/:id/auto-optimize
   * Disable auto-optimization
   */
  router.delete('/ab-testing/experiments/:id/auto-optimize', async (req: Request, res: Response) => {
    try {
      await autoOptimizer.disable(req.params.id);
      res.json({ message: 'Auto-optimization disabled successfully' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to disable auto-optimization',
      });
    }
  });

  /**
   * POST /ab-testing/segments
   * Create a user segment
   */
  router.post('/ab-testing/segments', async (req: Request, res: Response) => {
    try {
      const segment = await segmentManager.createSegment(req.body);
      res.status(201).json(segment);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create segment',
      });
    }
  });

  /**
   * GET /ab-testing/segments
   * List segments
   */
  router.get('/ab-testing/segments', async (req: Request, res: Response) => {
    try {
      const { limit, offset } = req.query;

      const segments = await segmentManager.listSegments({
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(segments);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list segments',
      });
    }
  });
}
