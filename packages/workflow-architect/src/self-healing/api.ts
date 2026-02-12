import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { z } from 'zod';
import { AnomalyDetector } from './detector.js';
import { DiagnosticEngine } from './diagnostics.js';
import { HealingExecutor } from './executor.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { RetryManager } from './retry.js';
import { FallbackManager } from './fallback.js';
import { RollbackTrigger } from './rollback.js';
import { FailureLearner } from './learning.js';
import { HealthMonitor } from './monitoring.js';
import { HealingNotifier } from './notifications.js';
import {
  HealingPolicySchema,
  HealingActionSchema,
  NotificationConfigSchema,
  FallbackConfigSchema,
  RollbackPolicySchema,
} from './types.js';
import type { HealingPolicy, HealingAction, HealingContext } from './types.js';

/**
 * Self-Healing REST API
 *
 * Provides endpoints for managing and monitoring self-healing workflows.
 */
export class SelfHealingAPI {
  private readonly router: Router;
  private readonly detector: AnomalyDetector;
  private readonly diagnostics: DiagnosticEngine;
  private readonly executor: HealingExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  private readonly fallbackManager: FallbackManager;
  private readonly rollbackTrigger: RollbackTrigger;
  private readonly learner: FailureLearner;
  private readonly monitor: HealthMonitor;
  private readonly notifier: HealingNotifier;
  private readonly policies: Map<string, HealingPolicy> = new Map();

  constructor() {
    this.router = createRouter();
    this.detector = new AnomalyDetector();
    this.diagnostics = new DiagnosticEngine();
    this.executor = new HealingExecutor();
    this.circuitBreaker = new CircuitBreaker();
    this.retryManager = new RetryManager();
    this.fallbackManager = new FallbackManager();
    this.rollbackTrigger = new RollbackTrigger();
    this.learner = new FailureLearner();
    this.monitor = new HealthMonitor(this.detector);
    this.notifier = new HealingNotifier();

    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health Status
    this.router.get('/healing/:workflowId/status', this.getHealthStatus.bind(this));

    // Healing History
    this.router.get('/healing/:workflowId/history', this.getHealingHistory.bind(this));

    // Configure Policies
    this.router.post('/healing/:workflowId/policies', this.configurePolicies.bind(this));
    this.router.get('/healing/:workflowId/policies', this.getPolicies.bind(this));
    this.router.delete('/healing/:workflowId/policies', this.deletePolicies.bind(this));

    // Manual Trigger
    this.router.post('/healing/:workflowId/trigger', this.manualTrigger.bind(this));

    // Health Metrics
    this.router.get('/healing/:workflowId/metrics', this.getHealthMetrics.bind(this));

    // Circuit Breaker
    this.router.get('/healing/:workflowId/circuit-breaker', this.getCircuitBreakerState.bind(this));
    this.router.post('/healing/:workflowId/circuit-breaker/reset', this.resetCircuitBreaker.bind(this));

    // Fallback Configuration
    this.router.post('/healing/:workflowId/fallback', this.configureFallback.bind(this));
    this.router.get('/healing/:workflowId/fallback', this.getFallbacks.bind(this));

    // Rollback
    this.router.post('/healing/:workflowId/rollback', this.configureRollback.bind(this));
    this.router.post('/healing/:workflowId/rollback/trigger', this.triggerRollback.bind(this));

    // Learning
    this.router.get('/healing/:workflowId/patterns', this.getFailurePatterns.bind(this));
    this.router.get('/healing/patterns/statistics', this.getPatternStatistics.bind(this));

    // Notifications
    this.router.post('/healing/:workflowId/notifications', this.configureNotifications.bind(this));
    this.router.get('/healing/:workflowId/notifications/history', this.getNotificationHistory.bind(this));
  }

  /**
   * GET /healing/:workflowId/status - Get health status
   */
  private async getHealthStatus(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      const currentHealth = await this.monitor.getCurrentHealth(workflowId);
      const circuitState = this.circuitBreaker.getState(workflowId);
      const policy = this.policies.get(workflowId);

      res.json({
        workflowId,
        health: currentHealth,
        circuitBreaker: circuitState,
        policyEnabled: policy?.enabled || false,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get health status',
      });
    }
  }

  /**
   * GET /healing/:workflowId/history - Get healing history
   */
  private async getHealingHistory(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const executionHistory = this.executor.getHistory(limit);
      const rollbackHistory = this.rollbackTrigger.getHistory(workflowId, limit);
      const failureHistory = this.learner.getFailureHistory(limit);

      res.json({
        workflowId,
        executions: executionHistory,
        rollbacks: rollbackHistory,
        failures: failureHistory,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get healing history',
      });
    }
  }

  /**
   * POST /healing/:workflowId/policies - Configure healing policies
   */
  private async configurePolicies(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      // Validate policy
      const policy = HealingPolicySchema.parse({
        ...req.body,
        workflowId,
      });

      this.policies.set(workflowId, policy);

      res.json({
        success: true,
        policy,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid policy configuration',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to configure policies',
        });
      }
    }
  }

  /**
   * GET /healing/:workflowId/policies - Get policies
   */
  private async getPolicies(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const policy = this.policies.get(workflowId);

      if (!policy) {
        res.status(404).json({
          error: 'No policy configured for this workflow',
        });
        return;
      }

      res.json({
        policy,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get policies',
      });
    }
  }

  /**
   * DELETE /healing/:workflowId/policies - Delete policies
   */
  private async deletePolicies(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const deleted = this.policies.delete(workflowId);

      res.json({
        success: deleted,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete policies',
      });
    }
  }

  /**
   * POST /healing/:workflowId/trigger - Manual trigger healing
   */
  private async manualTrigger(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;

      // Validate action
      const action = HealingActionSchema.parse(req.body.action);
      const policy = this.policies.get(workflowId);

      if (!policy) {
        res.status(404).json({
          error: 'No policy configured for this workflow',
        });
        return;
      }

      // Create context
      const context: HealingContext = {
        workflowId,
        anomaly: req.body.anomaly,
        policy,
        previousAttempts: [],
      };

      // Execute healing action
      const result = await this.executor.execute(action, context);

      res.json({
        success: result.success,
        result,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid action',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to trigger healing',
        });
      }
    }
  }

  /**
   * GET /healing/:workflowId/metrics - Get health metrics
   */
  private async getHealthMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const metrics = this.monitor.getMetricHistory(workflowId, limit);
      const currentHealth = await this.monitor.getCurrentHealth(workflowId);

      res.json({
        workflowId,
        current: currentHealth,
        history: metrics,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get health metrics',
      });
    }
  }

  /**
   * GET /healing/:workflowId/circuit-breaker - Get circuit breaker state
   */
  private async getCircuitBreakerState(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const state = this.circuitBreaker.getState(workflowId);
      const statistics = this.circuitBreaker.getStatistics(workflowId);

      res.json({
        workflowId,
        state,
        statistics,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get circuit breaker state',
      });
    }
  }

  /**
   * POST /healing/:workflowId/circuit-breaker/reset - Reset circuit breaker
   */
  private async resetCircuitBreaker(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      this.circuitBreaker.reset(workflowId);

      res.json({
        success: true,
        workflowId,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to reset circuit breaker',
      });
    }
  }

  /**
   * POST /healing/:workflowId/fallback - Configure fallback
   */
  private async configureFallback(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const config = FallbackConfigSchema.parse(req.body);

      this.fallbackManager.registerFallback(config.nodeId, config);

      res.json({
        success: true,
        config,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid fallback configuration',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to configure fallback',
        });
      }
    }
  }

  /**
   * GET /healing/:workflowId/fallback - Get fallbacks
   */
  private async getFallbacks(req: Request, res: Response): Promise<void> {
    try {
      const fallbacks = this.fallbackManager.getAllFallbacks();

      res.json({
        fallbacks: Array.from(fallbacks.entries()).map(([nodeId, config]) => ({
          nodeId,
          config,
        })),
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get fallbacks',
      });
    }
  }

  /**
   * POST /healing/:workflowId/rollback - Configure rollback
   */
  private async configureRollback(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const policy = RollbackPolicySchema.parse({
        ...req.body,
        workflowId,
      });

      this.rollbackTrigger.configureRollback(workflowId, policy);

      res.json({
        success: true,
        policy,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid rollback policy',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to configure rollback',
        });
      }
    }
  }

  /**
   * POST /healing/:workflowId/rollback/trigger - Trigger rollback
   */
  private async triggerRollback(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const { executionId } = req.body;

      const result = await this.rollbackTrigger.triggerRollback(workflowId, executionId);

      res.json({
        success: result.success,
        result,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to trigger rollback',
      });
    }
  }

  /**
   * GET /healing/:workflowId/patterns - Get failure patterns
   */
  private async getFailurePatterns(req: Request, res: Response): Promise<void> {
    try {
      const patterns = this.learner.getAllPatterns();

      res.json({
        patterns,
        count: patterns.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get failure patterns',
      });
    }
  }

  /**
   * GET /healing/patterns/statistics - Get pattern statistics
   */
  private async getPatternStatistics(req: Request, res: Response): Promise<void> {
    try {
      const statistics = this.learner.getPatternStatistics();

      res.json({
        statistics,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get pattern statistics',
      });
    }
  }

  /**
   * POST /healing/:workflowId/notifications - Configure notifications
   */
  private async configureNotifications(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const config = NotificationConfigSchema.parse(req.body);

      this.notifier.configure(workflowId, config);

      res.json({
        success: true,
        config,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid notification configuration',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to configure notifications',
        });
      }
    }
  }

  /**
   * GET /healing/:workflowId/notifications/history - Get notification history
   */
  private async getNotificationHistory(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const history = this.notifier.getHistory(workflowId, limit);

      res.json({
        workflowId,
        history,
        count: history.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get notification history',
      });
    }
  }

  /**
   * Get Express router
   */
  getRouter(): Router {
    return this.router;
  }
}
