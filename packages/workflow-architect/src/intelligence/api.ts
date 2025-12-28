/**
 * Intelligence REST API
 * Express routes for workflow intelligence endpoints
 */

import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { InsightGenerator } from './insights.js';
import { RecommendationEngine } from './recommendations.js';
import { SimilarityFinder } from './similarity.js';
import { BenchmarkService } from './benchmarking.js';
import { ReportBuilder } from './reports.js';
import { CostAnalyzer } from './cost-analysis.js';
import { TrendDetector } from './trends.js';
import { FailurePredictor } from './predictions.js';
import { ClusterAnalyzer } from './clustering.js';
import { ImpactAnalyzer } from './impact.js';
import { AlertEngine } from './alerts.js';

/**
 * Intelligence API Router
 */
export class IntelligenceAPI {
  private insightGenerator: InsightGenerator;
  private recommendationEngine: RecommendationEngine;
  private similarityFinder: SimilarityFinder;
  private benchmarkService: BenchmarkService;
  private reportBuilder: ReportBuilder;
  private costAnalyzer: CostAnalyzer;
  private trendDetector: TrendDetector;
  private failurePredictor: FailurePredictor;
  private clusterAnalyzer: ClusterAnalyzer;
  private impactAnalyzer: ImpactAnalyzer;
  private alertEngine: AlertEngine;

  constructor() {
    this.insightGenerator = new InsightGenerator();
    this.recommendationEngine = new RecommendationEngine();
    this.similarityFinder = new SimilarityFinder();
    this.benchmarkService = new BenchmarkService();
    this.reportBuilder = new ReportBuilder();
    this.costAnalyzer = new CostAnalyzer();
    this.trendDetector = new TrendDetector();
    this.failurePredictor = new FailurePredictor();
    this.clusterAnalyzer = new ClusterAnalyzer();
    this.impactAnalyzer = new ImpactAnalyzer();
    this.alertEngine = new AlertEngine();
  }

  /**
   * Register routes with Express router
   */
  registerRoutes(router: Router): void {
    // Insights
    router.get('/intelligence/:workflowId/insights', this.getInsights.bind(this));

    // Recommendations
    router.get('/intelligence/:workflowId/recommendations', this.getRecommendations.bind(this));

    // Similar workflows
    router.get('/intelligence/:workflowId/similar', this.getSimilar.bind(this));

    // Benchmark
    router.get('/intelligence/:workflowId/benchmark', this.getBenchmark.bind(this));

    // Cost analysis
    router.get('/intelligence/:workflowId/cost-analysis', this.getCostAnalysis.bind(this));

    // Predictions
    router.get('/intelligence/:workflowId/predictions', this.getPredictions.bind(this));

    // Impact analysis
    router.post('/intelligence/:workflowId/impact', this.analyzeImpact.bind(this));

    // Reports
    router.post('/intelligence/:workflowId/report', this.generateReport.bind(this));

    // Alerts
    router.get('/intelligence/alerts', this.getAlerts.bind(this));
    router.post('/intelligence/alerts', this.createAlert.bind(this));
    router.put('/intelligence/alerts/:alertId', this.updateAlert.bind(this));
    router.delete('/intelligence/alerts/:alertId', this.deleteAlert.bind(this));
    router.post('/intelligence/alerts/:alertId/acknowledge', this.acknowledgeAlert.bind(this));

    // Clustering
    router.post('/intelligence/cluster', this.clusterWorkflows.bind(this));

    // Trends
    router.post('/intelligence/trends', this.detectTrends.bind(this));
  }

  /**
   * GET /intelligence/:workflowId/insights
   * Get insights for a workflow
   */
  private async getInsights(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      // In production, fetch workflow from database
      const workflow = await this.fetchWorkflow(workflowId);

      const insights = await this.insightGenerator.generate(workflow);

      res.json({
        workflowId,
        insights,
        count: insights.length,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/:workflowId/recommendations
   * Get recommendations for a workflow
   */
  private async getRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const workflow = await this.fetchWorkflow(workflowId);
      const recommendations = await this.recommendationEngine.recommend(workflow);

      res.json({
        workflowId,
        recommendations,
        count: recommendations.length,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/:workflowId/similar
   * Find similar workflows
   */
  private async getSimilar(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const k = parseInt(req.query.k as string) || 10;

      const workflow = await this.fetchWorkflow(workflowId);
      const allWorkflows = await this.fetchAllWorkflows();

      const similar = await this.similarityFinder.findSimilar(workflow, k, allWorkflows);

      res.json({
        workflowId,
        similar,
        count: similar.length,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/:workflowId/benchmark
   * Get performance benchmark
   */
  private async getBenchmark(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const workflow = await this.fetchWorkflow(workflowId);
      const allWorkflows = await this.fetchAllWorkflows();

      const benchmark = await this.benchmarkService.benchmark(workflow, allWorkflows);

      res.json(benchmark);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/:workflowId/cost-analysis
   * Get cost analysis
   */
  private async getCostAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const workflow = await this.fetchWorkflow(workflowId);
      const analysis = await this.costAnalyzer.analyze(workflow);

      res.json(analysis);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/:workflowId/predictions
   * Get failure predictions
   */
  private async getPredictions(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const workflow = await this.fetchWorkflow(workflowId);
      const prediction = await this.failurePredictor.predictFailure(workflow);

      res.json(prediction);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/:workflowId/impact
   * Analyze impact of changes
   */
  private async analyzeImpact(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const ImpactRequestSchema = z.object({
        workflowBefore: z.object({}).passthrough(),
        workflowAfter: z.object({}).passthrough(),
      });

      const { workflowBefore, workflowAfter } = ImpactRequestSchema.parse(req.body);

      const impact = await this.impactAnalyzer.analyzeImpact(
        workflowBefore as any,
        workflowAfter as any,
      );

      res.json(impact);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/:workflowId/report
   * Generate intelligence report
   */
  private async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const ReportRequestSchema = z.object({
        type: z.enum(['executive', 'detailed', 'technical']),
        format: z.enum(['json', 'html', 'pdf']).optional(),
        period: z
          .object({
            start: z.number(),
            end: z.number(),
          })
          .optional(),
      });

      const options = ReportRequestSchema.parse(req.body);

      const workflow = await this.fetchWorkflow(workflowId);
      const allWorkflows = await this.fetchAllWorkflows();

      const report = await this.reportBuilder.buildReport(
        workflow,
        { type: options.type, period: options.period },
        allWorkflows,
      );

      const format = options.format || 'json';

      if (format === 'html') {
        const html = await this.reportBuilder.exportHTML(report);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else if (format === 'pdf') {
        const pdf = await this.reportBuilder.exportPDF(report);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdf);
      } else {
        res.json(report);
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /intelligence/alerts
   * Get all alerts
   */
  private async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.query;

      const alerts = this.alertEngine.getAlerts(workflowId as string | undefined);

      res.json({
        alerts,
        count: alerts.length,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/alerts
   * Create alert rule
   */
  private async createAlert(req: Request, res: Response): Promise<void> {
    try {
      const rule = await this.alertEngine.configureAlert(req.body);

      res.status(201).json(rule);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * PUT /intelligence/alerts/:alertId
   * Update alert rule
   */
  private async updateAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;

      const rule = await this.alertEngine.updateAlert(alertId, req.body);

      res.json(rule);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * DELETE /intelligence/alerts/:alertId
   * Delete alert rule
   */
  private async deleteAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;

      await this.alertEngine.deleteAlert(alertId);

      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  private async acknowledgeAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;

      const AckSchema = z.object({
        acknowledgedBy: z.string(),
      });

      const { acknowledgedBy } = AckSchema.parse(req.body);

      this.alertEngine.acknowledgeAlert(alertId, acknowledgedBy);

      res.status(200).json({ success: true });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/cluster
   * Cluster workflows
   */
  private async clusterWorkflows(req: Request, res: Response): Promise<void> {
    try {
      const ClusterRequestSchema = z.object({
        workflowIds: z.array(z.string()).optional(),
        k: z.number().optional(),
      });

      const { workflowIds, k } = ClusterRequestSchema.parse(req.body);

      let workflows = await this.fetchAllWorkflows();

      if (workflowIds) {
        workflows = workflows.filter((w) => workflowIds.includes(w.id!));
      }

      const result = await this.clusterAnalyzer.cluster(workflows, k);

      res.json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * POST /intelligence/trends
   * Detect trends in metrics
   */
  private async detectTrends(req: Request, res: Response): Promise<void> {
    try {
      const TrendRequestSchema = z.object({
        metrics: z.array(
          z.object({
            metric: z.string(),
            period: z.enum(['hour', 'day', 'week', 'month']),
            dataPoints: z.array(
              z.object({
                timestamp: z.number(),
                value: z.number(),
              }),
            ),
            aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count']),
          }),
        ),
        windowMs: z.number().optional(),
      });

      const { metrics, windowMs } = TrendRequestSchema.parse(req.body);

      const trends = await this.trendDetector.detectTrends(metrics, windowMs);

      res.json({
        trends,
        count: trends.length,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Error handler
   */
  private handleError(res: Response, error: unknown): void {
    console.error('Intelligence API Error:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else if (error instanceof Error) {
      res.status(500).json({
        error: error.message,
      });
    } else {
      res.status(500).json({
        error: 'Unknown error',
      });
    }
  }

  /**
   * Mock workflow fetcher (in production, fetch from database)
   */
  private async fetchWorkflow(workflowId: string): Promise<any> {
    // Mock implementation - in production, fetch from database
    return {
      id: workflowId,
      name: `Workflow ${workflowId}`,
      active: true,
      nodes: [],
      connections: {},
    };
  }

  /**
   * Mock all workflows fetcher
   */
  private async fetchAllWorkflows(): Promise<any[]> {
    // Mock implementation - in production, fetch from database
    return [];
  }
}
