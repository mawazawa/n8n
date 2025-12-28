import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { RouteConfig, BackendConfig, Policy } from './types.js';
import { RouteConfigSchema, BackendConfigSchema, PolicySchema } from './types.js';
import type { GatewayRouter } from './router.js';
import type { LoadBalancer } from './load-balancer.js';
import type { HealthChecker } from './health.js';
import type { PolicyEngine } from './policies.js';
import type { GatewayMetricsCollector } from './metrics.js';
import type { ResponseCache } from './cache.js';

/**
 * Admin API for gateway management
 * Provides endpoints for route, backend, policy management, and monitoring
 */
export class AdminAPI {
	private router: Router;
	private gatewayRouter?: GatewayRouter;
	private loadBalancer?: LoadBalancer;
	private healthChecker?: HealthChecker;
	private policyEngine?: PolicyEngine;
	private metrics?: GatewayMetricsCollector;
	private cache?: ResponseCache;
	private username?: string;
	private password?: string;

	constructor(auth?: { username: string; password: string }) {
		this.router = express.Router();
		if (auth) {
			this.username = auth.username;
			this.password = auth.password;
		}
		this.setupRoutes();
	}

	/**
	 * Set gateway components
	 */
	setComponents(components: {
		router?: GatewayRouter;
		loadBalancer?: LoadBalancer;
		healthChecker?: HealthChecker;
		policyEngine?: PolicyEngine;
		metrics?: GatewayMetricsCollector;
		cache?: ResponseCache;
	}): void {
		this.gatewayRouter = components.router;
		this.loadBalancer = components.loadBalancer;
		this.healthChecker = components.healthChecker;
		this.policyEngine = components.policyEngine;
		this.metrics = components.metrics;
		this.cache = components.cache;
	}

	/**
	 * Get Express router
	 */
	getRouter(): Router {
		return this.router;
	}

	/**
	 * Setup routes
	 */
	private setupRoutes(): void {
		// Auth middleware
		if (this.username && this.password) {
			this.router.use(this.authMiddleware());
		}

		// Health endpoint
		this.router.get('/health', this.getHealth.bind(this));

		// Routes management
		this.router.get('/routes', this.getRoutes.bind(this));
		this.router.post('/routes', this.createRoute.bind(this));
		this.router.get('/routes/:id', this.getRoute.bind(this));
		this.router.put('/routes/:id', this.updateRoute.bind(this));
		this.router.delete('/routes/:id', this.deleteRoute.bind(this));

		// Backends management
		this.router.get('/backends', this.getBackends.bind(this));
		this.router.post('/backends', this.createBackend.bind(this));
		this.router.get('/backends/:id', this.getBackend.bind(this));
		this.router.put('/backends/:id', this.updateBackend.bind(this));
		this.router.delete('/backends/:id', this.deleteBackend.bind(this));

		// Policies management
		this.router.get('/policies', this.getPolicies.bind(this));
		this.router.post('/policies', this.createPolicy.bind(this));
		this.router.get('/policies/:id', this.getPolicy.bind(this));
		this.router.put('/policies/:id', this.updatePolicy.bind(this));
		this.router.delete('/policies/:id', this.deletePolicy.bind(this));

		// Metrics
		this.router.get('/metrics', this.getMetrics.bind(this));
		this.router.get('/metrics/summary', this.getMetricsSummary.bind(this));
		this.router.post('/metrics/reset', this.resetMetrics.bind(this));

		// Cache management
		this.router.get('/cache/stats', this.getCacheStats.bind(this));
		this.router.post('/cache/clear', this.clearCache.bind(this));
		this.router.post('/cache/invalidate', this.invalidateCache.bind(this));

		// Configuration hot-reload
		this.router.post('/reload', this.reloadConfig.bind(this));
	}

	/**
	 * Auth middleware
	 */
	private authMiddleware() {
		return (req: Request, res: Response, next: express.NextFunction): void => {
			const authHeader = req.headers.authorization;
			if (!authHeader?.startsWith('Basic ')) {
				res.status(401).json({ error: 'Authentication required' });
				return;
			}

			try {
				const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
				const [username, password] = credentials.split(':');

				if (username !== this.username || password !== this.password) {
					res.status(401).json({ error: 'Invalid credentials' });
					return;
				}

				next();
			} catch (error) {
				res.status(401).json({ error: 'Invalid authorization header' });
			}
		};
	}

	/**
	 * Get health status
	 */
	private getHealth(_req: Request, res: Response): void {
		const health = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			components: {
				router: !!this.gatewayRouter,
				loadBalancer: !!this.loadBalancer,
				healthChecker: !!this.healthChecker,
				policyEngine: !!this.policyEngine,
				metrics: !!this.metrics,
				cache: !!this.cache,
			},
		};

		res.json(health);
	}

	/**
	 * Get all routes
	 */
	private getRoutes(_req: Request, res: Response): void {
		if (!this.gatewayRouter) {
			res.status(503).json({ error: 'Router not available' });
			return;
		}

		const routes = this.gatewayRouter.getRoutes();
		res.json({ routes });
	}

	/**
	 * Create route
	 */
	private createRoute(req: Request, res: Response): void {
		if (!this.gatewayRouter) {
			res.status(503).json({ error: 'Router not available' });
			return;
		}

		try {
			const route = RouteConfigSchema.parse(req.body);
			this.gatewayRouter.addRoute(route);
			res.status(201).json({ success: true, route });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to create route' });
			}
		}
	}

	/**
	 * Get route by ID
	 */
	private getRoute(req: Request, res: Response): void {
		if (!this.gatewayRouter) {
			res.status(503).json({ error: 'Router not available' });
			return;
		}

		const routes = this.gatewayRouter.getRoutes();
		const route = routes.find((r) => r.id === req.params.id);

		if (!route) {
			res.status(404).json({ error: 'Route not found' });
			return;
		}

		res.json({ route });
	}

	/**
	 * Update route
	 */
	private updateRoute(req: Request, res: Response): void {
		if (!this.gatewayRouter) {
			res.status(503).json({ error: 'Router not available' });
			return;
		}

		try {
			const route = RouteConfigSchema.parse(req.body);
			// Remove old route
			this.gatewayRouter.removeRoute(route.path, route.method);
			// Add updated route
			this.gatewayRouter.addRoute(route);
			res.json({ success: true, route });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to update route' });
			}
		}
	}

	/**
	 * Delete route
	 */
	private deleteRoute(req: Request, res: Response): void {
		if (!this.gatewayRouter) {
			res.status(503).json({ error: 'Router not available' });
			return;
		}

		const routes = this.gatewayRouter.getRoutes();
		const route = routes.find((r) => r.id === req.params.id);

		if (!route) {
			res.status(404).json({ error: 'Route not found' });
			return;
		}

		this.gatewayRouter.removeRoute(route.path, route.method);
		res.json({ success: true });
	}

	/**
	 * Get all backends
	 */
	private getBackends(_req: Request, res: Response): void {
		if (!this.loadBalancer) {
			res.status(503).json({ error: 'Load balancer not available' });
			return;
		}

		const backends = this.loadBalancer.getBackends();
		const health = this.healthChecker?.getAllHealth();

		const backendsWithHealth = backends.map((backend) => ({
			...backend,
			health: health?.get(backend.id),
		}));

		res.json({ backends: backendsWithHealth });
	}

	/**
	 * Create backend
	 */
	private createBackend(req: Request, res: Response): void {
		if (!this.loadBalancer) {
			res.status(503).json({ error: 'Load balancer not available' });
			return;
		}

		try {
			const backend = BackendConfigSchema.parse(req.body);
			this.loadBalancer.addBackend(backend);

			if (this.healthChecker) {
				this.healthChecker.configure(backend);
			}

			res.status(201).json({ success: true, backend });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to create backend' });
			}
		}
	}

	/**
	 * Get backend by ID
	 */
	private getBackend(req: Request, res: Response): void {
		if (!this.loadBalancer) {
			res.status(503).json({ error: 'Load balancer not available' });
			return;
		}

		const backends = this.loadBalancer.getBackends();
		const backend = backends.find((b) => b.id === req.params.id);

		if (!backend) {
			res.status(404).json({ error: 'Backend not found' });
			return;
		}

		const health = this.healthChecker?.getHealth(backend.id);
		res.json({ backend: { ...backend, health } });
	}

	/**
	 * Update backend
	 */
	private updateBackend(req: Request, res: Response): void {
		if (!this.loadBalancer) {
			res.status(503).json({ error: 'Load balancer not available' });
			return;
		}

		try {
			const backend = BackendConfigSchema.parse(req.body);
			this.loadBalancer.removeBackend(req.params.id);
			this.loadBalancer.addBackend(backend);

			if (this.healthChecker) {
				this.healthChecker.remove(req.params.id);
				this.healthChecker.configure(backend);
			}

			res.json({ success: true, backend });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to update backend' });
			}
		}
	}

	/**
	 * Delete backend
	 */
	private deleteBackend(req: Request, res: Response): void {
		if (!this.loadBalancer) {
			res.status(503).json({ error: 'Load balancer not available' });
			return;
		}

		this.loadBalancer.removeBackend(req.params.id);

		if (this.healthChecker) {
			this.healthChecker.remove(req.params.id);
		}

		res.json({ success: true });
	}

	/**
	 * Get all policies
	 */
	private getPolicies(_req: Request, res: Response): void {
		if (!this.policyEngine) {
			res.status(503).json({ error: 'Policy engine not available' });
			return;
		}

		const policies = this.policyEngine.getAllPolicies();
		res.json({ policies });
	}

	/**
	 * Create policy
	 */
	private createPolicy(req: Request, res: Response): void {
		if (!this.policyEngine) {
			res.status(503).json({ error: 'Policy engine not available' });
			return;
		}

		try {
			const policy = PolicySchema.parse(req.body);
			this.policyEngine.registerPolicy(policy);
			res.status(201).json({ success: true, policy });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to create policy' });
			}
		}
	}

	/**
	 * Get policy by ID
	 */
	private getPolicy(req: Request, res: Response): void {
		if (!this.policyEngine) {
			res.status(503).json({ error: 'Policy engine not available' });
			return;
		}

		const policy = this.policyEngine.getPolicy(req.params.id);

		if (!policy) {
			res.status(404).json({ error: 'Policy not found' });
			return;
		}

		res.json({ policy });
	}

	/**
	 * Update policy
	 */
	private updatePolicy(req: Request, res: Response): void {
		if (!this.policyEngine) {
			res.status(503).json({ error: 'Policy engine not available' });
			return;
		}

		try {
			const updates = PolicySchema.partial().parse(req.body);
			const success = this.policyEngine.updatePolicy(req.params.id, updates);

			if (!success) {
				res.status(404).json({ error: 'Policy not found' });
				return;
			}

			const policy = this.policyEngine.getPolicy(req.params.id);
			res.json({ success: true, policy });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Validation failed', details: error.errors });
			} else {
				res.status(500).json({ error: 'Failed to update policy' });
			}
		}
	}

	/**
	 * Delete policy
	 */
	private deletePolicy(req: Request, res: Response): void {
		if (!this.policyEngine) {
			res.status(503).json({ error: 'Policy engine not available' });
			return;
		}

		this.policyEngine.unregisterPolicy(req.params.id);
		res.json({ success: true });
	}

	/**
	 * Get metrics
	 */
	private getMetrics(_req: Request, res: Response): void {
		if (!this.metrics) {
			res.status(503).json({ error: 'Metrics not available' });
			return;
		}

		const metrics = this.metrics.getMetrics();
		res.json({ metrics });
	}

	/**
	 * Get metrics summary
	 */
	private getMetricsSummary(_req: Request, res: Response): void {
		if (!this.metrics) {
			res.status(503).json({ error: 'Metrics not available' });
			return;
		}

		const summary = this.metrics.getSummary();
		res.json(summary);
	}

	/**
	 * Reset metrics
	 */
	private resetMetrics(_req: Request, res: Response): void {
		if (!this.metrics) {
			res.status(503).json({ error: 'Metrics not available' });
			return;
		}

		this.metrics.reset();
		res.json({ success: true });
	}

	/**
	 * Get cache stats
	 */
	private getCacheStats(_req: Request, res: Response): void {
		if (!this.cache) {
			res.status(503).json({ error: 'Cache not available' });
			return;
		}

		const stats = {
			size: this.cache.size(),
		};

		res.json(stats);
	}

	/**
	 * Clear cache
	 */
	private clearCache(_req: Request, res: Response): void {
		if (!this.cache) {
			res.status(503).json({ error: 'Cache not available' });
			return;
		}

		this.cache.clear();
		res.json({ success: true });
	}

	/**
	 * Invalidate cache
	 */
	private invalidateCache(req: Request, res: Response): void {
		if (!this.cache) {
			res.status(503).json({ error: 'Cache not available' });
			return;
		}

		const { key, pattern } = req.body as { key?: string; pattern?: string };

		if (key) {
			this.cache.invalidate(key);
		} else if (pattern) {
			this.cache.invalidatePattern(new RegExp(pattern));
		} else {
			res.status(400).json({ error: 'key or pattern required' });
			return;
		}

		res.json({ success: true });
	}

	/**
	 * Reload configuration
	 */
	private reloadConfig(_req: Request, res: Response): void {
		// In production, this would reload from database or config file
		res.json({ success: true, message: 'Configuration reloaded' });
	}
}
