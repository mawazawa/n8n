/**
 * Webhook API
 * REST API endpoints for webhook management
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { WebhookManager } from './manager.js';
import { DeliveryManager } from './delivery.js';
import { WebhookMonitor } from './monitoring.js';
import { WebhookRateLimiter } from './rate-limiting.js';
import { WebhookLogger } from './logs.js';
import { PayloadTransformer } from './transforms.js';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookEvent } from './types.js';

// Extend Express Request to include userId
interface AuthenticatedRequest extends Request {
  userId?: string;
}

export interface WebhookAPIConfig {
  /** Enable authentication middleware */
  requireAuth?: boolean;
  /** Custom authentication function */
  authenticate?: (req: Request) => Promise<string | null>; // Returns userId or null
  /** Enable rate limiting on API endpoints */
  enableRateLimiting?: boolean;
  /** Max requests per minute per user */
  rateLimitPerMinute?: number;
}

export class WebhookAPI {
  private router: Router;
  private manager: WebhookManager;
  private deliveryManager: DeliveryManager;
  private monitor: WebhookMonitor;
  private rateLimiter: WebhookRateLimiter;
  private logger: WebhookLogger;
  private transformer: PayloadTransformer;
  private config: WebhookAPIConfig;

  constructor(config: WebhookAPIConfig = {}) {
    this.config = {
      requireAuth: true,
      enableRateLimiting: true,
      rateLimitPerMinute: 60,
      ...config,
    };

    this.router = Router();
    this.manager = new WebhookManager();
    this.deliveryManager = new DeliveryManager();
    this.monitor = new WebhookMonitor();
    this.rateLimiter = new WebhookRateLimiter();
    this.logger = new WebhookLogger();
    this.transformer = new PayloadTransformer();

    this.setupRoutes();
  }

  /**
   * Get Express router with all webhook endpoints
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all API routes
   */
  private setupRoutes(): void {
    // Middleware
    if (this.config.requireAuth) {
      this.router.use(this.authMiddleware.bind(this));
    }

    // Webhook CRUD
    this.router.post('/webhooks', this.createWebhook.bind(this));
    this.router.get('/webhooks', this.listWebhooks.bind(this));
    this.router.get('/webhooks/:id', this.getWebhook.bind(this));
    this.router.put('/webhooks/:id', this.updateWebhook.bind(this));
    this.router.delete('/webhooks/:id', this.deleteWebhook.bind(this));

    // Webhook actions
    this.router.post('/webhooks/:id/enable', this.enableWebhook.bind(this));
    this.router.post('/webhooks/:id/disable', this.disableWebhook.bind(this));
    this.router.post('/webhooks/:id/pause', this.pauseWebhook.bind(this));
    this.router.post('/webhooks/:id/rotate-secret', this.rotateSecret.bind(this));

    // Delivery management
    this.router.post('/webhooks/:id/trigger', this.triggerWebhook.bind(this));
    this.router.get('/webhooks/:id/deliveries', this.getDeliveries.bind(this));
    this.router.get('/deliveries/:id', this.getDelivery.bind(this));
    this.router.post('/deliveries/:id/retry', this.retryDelivery.bind(this));

    // Monitoring
    this.router.get('/webhooks/:id/stats', this.getStats.bind(this));
    this.router.get('/webhooks/:id/health', this.checkHealth.bind(this));
    this.router.get('/webhooks/monitoring/attention', this.getWebhooksNeedingAttention.bind(this));

    // Logging
    this.router.get('/webhooks/:id/logs', this.getLogs.bind(this));
    this.router.get('/logs/search', this.searchLogs.bind(this));
    this.router.get('/logs/errors', this.getRecentErrors.bind(this));
    this.router.get('/logs/metrics', this.getMetrics.bind(this));

    // Error handler
    this.router.use(this.errorHandler.bind(this));
  }

  /**
   * Authentication middleware
   */
  private async authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let userId: string | null = null;

      if (this.config.authenticate) {
        userId = await this.config.authenticate(req);
      } else {
        // Default: get from header
        userId = req.headers['x-user-id'] as string;
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Store userId in request
      (req as AuthenticatedRequest).userId = userId;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  }

  /**
   * Create webhook
   */
  private async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const input = req.body as CreateWebhookInput;

      const webhook = await this.manager.create(userId, input);

      res.status(201).json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * List webhooks
   */
  private async listWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const status = req.query.status as string | undefined;

      const webhooks = await this.manager.list(userId, status ? { status: status as never } : undefined);

      res.json(webhooks);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get webhook by ID
   */
  private async getWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.get(webhookId, userId);

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update webhook
   */
  private async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;
      const input = req.body as UpdateWebhookInput;

      const webhook = await this.manager.update(webhookId, userId, input);

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Delete webhook
   */
  private async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      await this.manager.delete(webhookId, userId);

      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Enable webhook
   */
  private async enableWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.enable(webhookId, userId);

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Disable webhook
   */
  private async disableWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.disable(webhookId, userId);

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Pause webhook
   */
  private async pauseWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.pause(webhookId, userId);

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Rotate webhook secret
   */
  private async rotateSecret(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.rotateSecret(webhookId, userId);

      res.json(webhook);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Trigger webhook manually
   */
  private async triggerWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const webhookId = req.params.id;

      const webhook = await this.manager.get(webhookId, userId);
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      // Check rate limit
      const rateLimitResult = await this.rateLimiter.checkLimit(webhookId);
      if (!rateLimitResult.allowed) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      // Create event from request body
      const event: WebhookEvent = {
        type: req.body.event || 'manual.trigger',
        data: req.body.data || req.body,
        timestamp: Date.now(),
        source: 'api',
      };

      // Deliver
      const delivery = await this.deliveryManager.deliver(webhook, event);

      // Record rate limit
      await this.rateLimiter.recordRequest(webhookId);

      res.json(delivery);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get deliveries for a webhook
   */
  private async getDeliveries(req: Request, res: Response): Promise<void> {
    try {
      const webhookId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;

      const result = await this.monitor.getDeliveryHistory(webhookId, {
        limit,
        offset,
        status: status as never,
      });

      res.json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get delivery by ID
   */
  private async getDelivery(req: Request, res: Response): Promise<void> {
    try {
      const deliveryId = req.params.id;

      const delivery = await this.monitor.getDelivery(deliveryId);

      if (!delivery) {
        res.status(404).json({ error: 'Delivery not found' });
        return;
      }

      res.json(delivery);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Retry failed delivery
   */
  private async retryDelivery(req: Request, res: Response): Promise<void> {
    try {
      const deliveryId = req.params.id;

      const delivery = await this.deliveryManager.retry(deliveryId);

      res.json(delivery);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get webhook statistics
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const webhookId = req.params.id;
      const hours = parseInt(req.query.hours as string) || undefined;
      const days = parseInt(req.query.days as string) || undefined;

      const stats = await this.monitor.getStats(webhookId, { hours, days });

      res.json(stats);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Check webhook health
   */
  private async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const webhookId = req.params.id;

      const health = await this.monitor.checkHealth(webhookId);

      res.json(health);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get webhooks needing attention
   */
  private async getWebhooksNeedingAttention(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const threshold = parseInt(req.query.threshold as string) || 50;

      const webhooks = await this.monitor.getWebhooksNeedingAttention(userId, threshold);

      res.json(webhooks);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get logs for a webhook
   */
  private async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const webhookId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.logger.getLog(webhookId, { limit, offset });

      res.json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Search logs
   */
  private async searchLogs(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const searchTerm = req.query.search as string;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.logger.search(userId, {
        searchTerm,
        limit,
        offset,
      });

      res.json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get recent errors
   */
  private async getRecentErrors(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const limit = parseInt(req.query.limit as string) || 50;

      const errors = await this.logger.getRecentErrors(userId, limit);

      res.json(errors);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get metrics
   */
  private async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId as string;
      const period = (req.query.period as string) || 'day';

      const metrics = await this.logger.getMetrics(userId, period as never);

      res.json(metrics);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Handle errors
   */
  private handleError(res: Response, error: unknown): void {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Error handler middleware
   */
  private errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
    console.error('Webhook API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Create webhook API router
 */
export function createWebhookAPI(config?: WebhookAPIConfig): Router {
  const api = new WebhookAPI(config);
  return api.getRouter();
}
