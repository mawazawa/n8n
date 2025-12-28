import express, { Request, Response, NextFunction } from 'express';
import { IntegrationRegistry } from './registry';
import { IntegrationDiscovery } from './discovery';
import { HealthChecker } from './health';
import { WebhookSubscriptionManager } from './webhooks';
import { IntegrationRateLimiter } from './rate-limit';
import { ResponseCache } from './cache';
import {
	Integration,
	IntegrationSchema,
	IntegrationFilter,
	IntegrationFilterSchema,
	IntegrationStatus,
} from './types';
import { HttpConnector } from './connectors/http';
import { GraphQLConnector } from './connectors/graphql';
import { DatabaseConnector } from './connectors/database';
import { FileConnector } from './connectors/file';
import { QueueConnector } from './connectors/queue';

/**
 * Integration Hub API
 * REST API for managing integrations
 */
export class IntegrationAPI {
	private app: express.Application;
	private registry: IntegrationRegistry;
	private discovery: IntegrationDiscovery;
	private healthChecker: HealthChecker;
	private webhookManager: WebhookSubscriptionManager;
	private rateLimiter: IntegrationRateLimiter;
	private cache: ResponseCache;

	constructor(
		registry: IntegrationRegistry,
		discovery: IntegrationDiscovery,
		healthChecker: HealthChecker,
		webhookManager: WebhookSubscriptionManager,
		rateLimiter: IntegrationRateLimiter,
		cache: ResponseCache,
	) {
		this.app = express();
		this.registry = registry;
		this.discovery = discovery;
		this.healthChecker = healthChecker;
		this.webhookManager = webhookManager;
		this.rateLimiter = rateLimiter;
		this.cache = cache;

		this.setupMiddleware();
		this.setupRoutes();
	}

	/**
	 * Setup Express middleware
	 */
	private setupMiddleware(): void {
		this.app.use(express.json());
		this.app.use(express.urlencoded({ extended: true }));

		// Error handler
		this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
			console.error('API Error:', err);
			res.status(500).json({
				error: 'Internal server error',
				message: err.message,
			});
		});
	}

	/**
	 * Setup API routes
	 */
	private setupRoutes(): void {
		// Integration routes
		this.app.get('/integrations', this.listIntegrations.bind(this));
		this.app.post('/integrations', this.registerIntegration.bind(this));
		this.app.get('/integrations/:id', this.getIntegration.bind(this));
		this.app.put('/integrations/:id', this.updateIntegration.bind(this));
		this.app.delete('/integrations/:id', this.deleteIntegration.bind(this));

		// Connection routes
		this.app.post('/integrations/:id/connect', this.connectIntegration.bind(this));
		this.app.post('/integrations/:id/disconnect', this.disconnectIntegration.bind(this));
		this.app.post('/integrations/:id/test', this.testIntegration.bind(this));

		// Health routes
		this.app.get('/integrations/:id/health', this.getHealth.bind(this));
		this.app.get('/integrations/:id/health/history', this.getHealthHistory.bind(this));
		this.app.get('/integrations/:id/health/statistics', this.getHealthStatistics.bind(this));

		// Discovery routes
		this.app.post('/integrations/discover', this.discoverIntegration.bind(this));

		// Webhook routes
		this.app.get('/integrations/:id/webhooks', this.listWebhooks.bind(this));
		this.app.post('/integrations/:id/webhooks', this.createWebhook.bind(this));
		this.app.delete('/webhooks/:webhookId', this.deleteWebhook.bind(this));
		this.app.post('/webhooks/:webhookId/test', this.testWebhook.bind(this));

		// Rate limit routes
		this.app.get('/integrations/:id/rate-limit', this.getRateLimit.bind(this));
		this.app.get('/integrations/:id/rate-limit/stats', this.getRateLimitStats.bind(this));

		// Cache routes
		this.app.get('/cache/stats', this.getCacheStats.bind(this));
		this.app.delete('/cache/:integrationId', this.clearCache.bind(this));
	}

	/**
	 * GET /integrations - List integrations
	 */
	private async listIntegrations(req: Request, res: Response): Promise<void> {
		try {
			const filters: IntegrationFilter = {};

			if (req.query.status) {
				filters.status = req.query.status as IntegrationStatus;
			}

			if (req.query.connectorType) {
				filters.connectorType = req.query.connectorType as IntegrationFilter['connectorType'];
			}

			if (req.query.tags) {
				filters.tags = Array.isArray(req.query.tags)
					? (req.query.tags as string[])
					: [req.query.tags as string];
			}

			if (req.query.search) {
				filters.searchQuery = req.query.search as string;
			}

			const validatedFilters = IntegrationFilterSchema.parse(filters);
			const integrations = await this.registry.list(validatedFilters);

			res.json({
				integrations,
				total: integrations.length,
			});
		} catch (error) {
			res.status(400).json({
				error: 'Failed to list integrations',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations - Register integration
	 */
	private async registerIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integrationData = IntegrationSchema.omit({
				id: true,
				createdAt: true,
				updatedAt: true,
			}).parse(req.body);

			const integration = await this.registry.register(integrationData);

			res.status(201).json(integration);
		} catch (error) {
			res.status(400).json({
				error: 'Failed to register integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id - Get integration details
	 */
	private async getIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integration = await this.registry.get(req.params.id);
			res.json(integration);
		} catch (error) {
			res.status(404).json({
				error: 'Integration not found',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * PUT /integrations/:id - Update integration
	 */
	private async updateIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integration = await this.registry.updateConfig(req.params.id, req.body.config);
			res.json(integration);
		} catch (error) {
			res.status(400).json({
				error: 'Failed to update integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /integrations/:id - Delete integration
	 */
	private async deleteIntegration(req: Request, res: Response): Promise<void> {
		try {
			await this.registry.unregister(req.params.id);
			res.status(204).send();
		} catch (error) {
			res.status(400).json({
				error: 'Failed to delete integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations/:id/connect - Connect integration
	 */
	private async connectIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integration = await this.registry.get(req.params.id);
			const connector = this.createConnector(integration);

			await connector.connect();

			await this.registry.updateStatus(req.params.id, IntegrationStatus.CONNECTED);

			res.json({
				message: 'Integration connected successfully',
				status: IntegrationStatus.CONNECTED,
			});
		} catch (error) {
			await this.registry.updateStatus(
				req.params.id,
				IntegrationStatus.ERROR,
				error instanceof Error ? error.message : 'Unknown error',
			);

			res.status(500).json({
				error: 'Failed to connect integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations/:id/disconnect - Disconnect integration
	 */
	private async disconnectIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integration = await this.registry.get(req.params.id);
			const connector = this.createConnector(integration);

			await connector.disconnect();

			await this.registry.updateStatus(req.params.id, IntegrationStatus.DISCONNECTED);

			res.json({
				message: 'Integration disconnected successfully',
				status: IntegrationStatus.DISCONNECTED,
			});
		} catch (error) {
			res.status(500).json({
				error: 'Failed to disconnect integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations/:id/test - Test connection
	 */
	private async testIntegration(req: Request, res: Response): Promise<void> {
		try {
			const integration = await this.registry.get(req.params.id);
			const connector = this.createConnector(integration);

			const isConnected = await connector.test();

			res.json({
				success: isConnected,
				message: isConnected ? 'Connection successful' : 'Connection failed',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: 'Test failed',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/health - Get health status
	 */
	private async getHealth(req: Request, res: Response): Promise<void> {
		try {
			const health = await this.healthChecker.check(req.params.id);
			res.json(health);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get health status',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/health/history - Get health history
	 */
	private async getHealthHistory(req: Request, res: Response): Promise<void> {
		try {
			const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
			const history = await this.healthChecker.getHistory(req.params.id, limit);
			res.json(history);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get health history',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/health/statistics - Get health statistics
	 */
	private async getHealthStatistics(req: Request, res: Response): Promise<void> {
		try {
			const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
			const stats = await this.healthChecker.getStatistics(req.params.id, hours);
			res.json(stats);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get health statistics',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations/discover - Discover integration
	 */
	private async discoverIntegration(req: Request, res: Response): Promise<void> {
		try {
			const { url } = req.body;

			if (!url) {
				res.status(400).json({ error: 'URL is required' });
				return;
			}

			const spec = await this.discovery.discover(url);
			res.json(spec);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to discover integration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/webhooks - List webhooks
	 */
	private async listWebhooks(req: Request, res: Response): Promise<void> {
		try {
			const webhooks = await this.webhookManager.getSubscriptionsByIntegration(req.params.id);
			res.json(webhooks);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to list webhooks',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /integrations/:id/webhooks - Create webhook
	 */
	private async createWebhook(req: Request, res: Response): Promise<void> {
		try {
			const { events, url, secret } = req.body;

			const webhook = await this.webhookManager.subscribe(
				req.params.id,
				events,
				url,
				secret,
			);

			res.status(201).json(webhook);
		} catch (error) {
			res.status(400).json({
				error: 'Failed to create webhook',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /webhooks/:webhookId - Delete webhook
	 */
	private async deleteWebhook(req: Request, res: Response): Promise<void> {
		try {
			await this.webhookManager.unsubscribe(req.params.webhookId);
			res.status(204).send();
		} catch (error) {
			res.status(400).json({
				error: 'Failed to delete webhook',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /webhooks/:webhookId/test - Test webhook
	 */
	private async testWebhook(req: Request, res: Response): Promise<void> {
		try {
			const success = await this.webhookManager.testSubscription(req.params.webhookId);
			res.json({ success });
		} catch (error) {
			res.status(500).json({
				success: false,
				error: 'Failed to test webhook',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/rate-limit - Get rate limit status
	 */
	private async getRateLimit(req: Request, res: Response): Promise<void> {
		try {
			const status = await this.rateLimiter.getLimitStatus(req.params.id);
			res.json(status);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get rate limit status',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /integrations/:id/rate-limit/stats - Get rate limit statistics
	 */
	private async getRateLimitStats(req: Request, res: Response): Promise<void> {
		try {
			const stats = this.rateLimiter.getUsageStats(req.params.id);
			res.json(stats);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get rate limit stats',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /cache/stats - Get cache statistics
	 */
	private async getCacheStats(req: Request, res: Response): Promise<void> {
		try {
			const stats = await this.cache.getStats();
			res.json(stats);
		} catch (error) {
			res.status(500).json({
				error: 'Failed to get cache stats',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /cache/:integrationId - Clear cache for integration
	 */
	private async clearCache(req: Request, res: Response): Promise<void> {
		try {
			await this.cache.invalidatePattern(`${req.params.integrationId}:*`);
			res.json({ message: 'Cache cleared successfully' });
		} catch (error) {
			res.status(500).json({
				error: 'Failed to clear cache',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Create connector from integration
	 */
	private createConnector(integration: Integration): HttpConnector | GraphQLConnector | DatabaseConnector | FileConnector | QueueConnector {
		switch (integration.config.connectorType) {
			case 'http':
				return new HttpConnector(
					integration.config.connectorConfig as Parameters<typeof HttpConnector.prototype.constructor>[0],
					integration.config.auth,
				);

			case 'graphql':
				return new GraphQLConnector(
					integration.config.connectorConfig as Parameters<typeof GraphQLConnector.prototype.constructor>[0],
					integration.config.auth,
				);

			case 'database':
				return new DatabaseConnector(
					integration.config.connectorConfig as Parameters<typeof DatabaseConnector.prototype.constructor>[0],
				);

			case 'file':
				return new FileConnector(
					integration.config.connectorConfig as Parameters<typeof FileConnector.prototype.constructor>[0],
				);

			case 'queue':
				return new QueueConnector(
					integration.config.connectorConfig as Parameters<typeof QueueConnector.prototype.constructor>[0],
				);

			default:
				throw new Error(`Unsupported connector type: ${integration.config.connectorType}`);
		}
	}

	/**
	 * Get Express application
	 */
	getApp(): express.Application {
		return this.app;
	}

	/**
	 * Start the API server
	 */
	listen(port: number): void {
		this.app.listen(port, () => {
			console.log(`Integration Hub API listening on port ${port}`);
		});
	}
}
