import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { GatewayConfig, RouteConfig, BackendConfig, Policy } from './types.js';
import { GatewayConfigSchema } from './types.js';
import { GatewayRouter } from './router.js';
import { LoadBalancer } from './load-balancer.js';
import { HealthChecker } from './health.js';
import { PolicyEngine } from './policies.js';
import { GatewayMetricsCollector } from './metrics.js';
import { RequestLogger } from './logging.js';
import { AdminAPI } from './admin.js';
import { ResponseCache } from './cache.js';
import { CORSHandler } from './cors.js';
import { CompressionHandler } from './compression.js';
import { RateLimiter } from './rate-limit.js';

// Re-export all types
export * from './types.js';

// Re-export all classes
export { GatewayRouter } from './router.js';
export { AuthMiddleware } from './auth.js';
export { RateLimiter } from './rate-limit.js';
export { ResponseCache } from './cache.js';
export { TransformEngine } from './transform.js';
export { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
export { LoadBalancer } from './load-balancer.js';
export { HealthChecker } from './health.js';
export { CORSHandler } from './cors.js';
export { CompressionHandler } from './compression.js';
export { RequestLogger } from './logging.js';
export { GatewayMetricsCollector } from './metrics.js';
export { PolicyEngine } from './policies.js';
export { AdminAPI } from './admin.js';

/**
 * Main API Gateway class
 * Combines all gateway components into a single Express middleware
 */
export class Gateway {
	private app: Express;
	private config: GatewayConfig;
	private router: GatewayRouter;
	private loadBalancer: LoadBalancer;
	private healthChecker: HealthChecker;
	private policyEngine: PolicyEngine;
	private metrics: GatewayMetricsCollector;
	private logger: RequestLogger;
	private adminAPI: AdminAPI;
	private cache?: ResponseCache;
	private cors?: CORSHandler;
	private compression?: CompressionHandler;
	private globalRateLimit?: RateLimiter;

	constructor(config: Partial<GatewayConfig> = {}) {
		this.config = GatewayConfigSchema.parse(config);
		this.app = express();

		// Initialize components
		this.router = new GatewayRouter();
		this.loadBalancer = new LoadBalancer();
		this.healthChecker = new HealthChecker(true);
		this.policyEngine = new PolicyEngine();
		this.metrics = new GatewayMetricsCollector();
		this.logger = new RequestLogger(
			this.config.logging?.level ?? 'info',
			this.config.logging?.format ?? 'json',
		);
		this.adminAPI = new AdminAPI(this.config.admin?.auth);

		// Setup middleware
		this.setupMiddleware();

		// Setup admin API
		if (this.config.admin?.enabled) {
			this.adminAPI.setComponents({
				router: this.router,
				loadBalancer: this.loadBalancer,
				healthChecker: this.healthChecker,
				policyEngine: this.policyEngine,
				metrics: this.metrics,
				cache: this.cache,
			});
			this.app.use(this.config.admin.path, this.adminAPI.getRouter());
		}

		// Setup metrics endpoint
		if (this.config.metrics?.enabled) {
			this.app.get(this.config.metrics.path, this.handleMetrics.bind(this));
		}
	}

	/**
	 * Setup middleware stack
	 */
	private setupMiddleware(): void {
		// Body parser
		this.app.use(express.json({ limit: this.config.bodyLimit }));
		this.app.use(express.urlencoded({ extended: true, limit: this.config.bodyLimit }));

		// Trust proxy
		if (this.config.trustProxy) {
			this.app.set('trust proxy', true);
		}

		// Logging
		if (this.config.logging?.enabled) {
			this.app.use(this.logger.middleware());
		}

		// Metrics
		if (this.config.metrics?.enabled) {
			this.app.use(this.metrics.middleware());
		}

		// Global CORS
		if (this.config.cors) {
			this.cors = new CORSHandler(this.config.cors);
			this.app.use(this.cors.middleware());
		}

		// Global rate limiting
		if (this.config.rateLimit) {
			this.globalRateLimit = new RateLimiter(this.config.rateLimit);
			this.app.use(this.globalRateLimit.middleware());
		}

		// Global compression
		if (this.config.compression) {
			this.compression = new CompressionHandler(this.config.compression);
			this.app.use(this.compression.middleware());
		}

		// Main request handler
		this.app.use(this.handleRequest.bind(this));

		// Error handler
		this.app.use(this.handleError.bind(this));
	}

	/**
	 * Handle incoming requests
	 */
	private async handleRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			// Match route
			const match = this.router.match(req.method as never, req.path, req.query as Record<string, string>);

			if (!match) {
				res.status(404).json({
					error: 'Not Found',
					message: `Route ${req.method} ${req.path} not found`,
				});
				return;
			}

			// Apply route policies
			if (match.route.policies.length > 0) {
				const policyMiddleware = this.policyEngine.applyPolicies(match.route.policies);
				await new Promise<void>((resolve, reject) => {
					policyMiddleware(req, res, (error?: Error) => {
						if (error) reject(error);
						else resolve();
					});
				});

				// Check if response was already sent by policy
				if (res.headersSent) {
					return;
				}
			}

			// Select backend
			const sessionKey = req.headers['x-session-id'] as string | undefined;
			const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
			const backend = this.loadBalancer.selectBackend(sessionKey, ipAddress);

			if (!backend) {
				res.status(503).json({
					error: 'Service Unavailable',
					message: 'No healthy backends available',
				});
				return;
			}

			// Proxy request to backend
			await this.proxyRequest(req, res, backend);
		} catch (error) {
			next(error);
		}
	}

	/**
	 * Proxy request to backend
	 */
	private async proxyRequest(
		req: Request,
		res: Response,
		backend: BackendConfig,
	): Promise<void> {
		const startTime = Date.now();
		this.loadBalancer.incrementConnections(backend.id);
		this.metrics.incrementBackendConnections(backend.id);

		try {
			// Build target URL
			const targetUrl = `${backend.url}${req.path}`;
			const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
			const url = queryString ? `${targetUrl}?${queryString}` : targetUrl;

			// Prepare headers
			const headers: Record<string, string> = {};
			Object.entries(req.headers).forEach(([key, value]) => {
				if (typeof value === 'string') {
					headers[key] = value;
				}
			});

			// Make request to backend
			const controller = new AbortController();
			const timeout = setTimeout(() => {
				controller.abort();
			}, backend.timeout);

			const response = await fetch(url, {
				method: req.method,
				headers,
				body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			const duration = Date.now() - startTime;
			const success = response.status >= 200 && response.status < 400;

			// Record metrics
			this.metrics.recordBackendRequest(backend.id, success, duration);
			this.healthChecker.recordPassiveCheck(backend.id, success, duration);

			// Get response body
			const contentType = response.headers.get('content-type');
			let body: unknown;
			if (contentType?.includes('application/json')) {
				body = await response.json();
			} else {
				body = await response.text();
			}

			// Copy response headers
			response.headers.forEach((value, key) => {
				res.setHeader(key, value);
			});

			// Send response
			res.status(response.status).send(body);
		} catch (error) {
			const duration = Date.now() - startTime;
			this.metrics.recordBackendRequest(backend.id, false, duration);
			this.healthChecker.recordPassiveCheck(backend.id, false, duration);

			throw error;
		} finally {
			this.loadBalancer.decrementConnections(backend.id);
			this.metrics.decrementBackendConnections(backend.id);
		}
	}

	/**
	 * Handle errors
	 */
	private handleError(
		error: Error,
		req: Request,
		res: Response,
		_next: NextFunction,
	): void {
		this.logger.logError(error, req);

		if (!res.headersSent) {
			res.status(500).json({
				error: 'Internal Server Error',
				message: error.message,
			});
		}
	}

	/**
	 * Handle metrics endpoint
	 */
	private handleMetrics(_req: Request, res: Response): void {
		const format = _req.query.format as string | undefined;

		if (format === 'prometheus') {
			res.setHeader('Content-Type', 'text/plain');
			res.send(this.metrics.exportPrometheus());
		} else {
			res.json(this.metrics.getMetrics());
		}
	}

	/**
	 * Add route
	 */
	addRoute(route: RouteConfig): void {
		this.router.addRoute(route);

		// Configure backends
		for (const backend of route.backends) {
			this.loadBalancer.addBackend(backend);
			this.healthChecker.configure(backend);
		}
	}

	/**
	 * Remove route
	 */
	removeRoute(path: string, method?: never): void {
		this.router.removeRoute(path, method);
	}

	/**
	 * Add policy
	 */
	addPolicy(policy: Policy): void {
		this.policyEngine.registerPolicy(policy);
	}

	/**
	 * Remove policy
	 */
	removePolicy(policyId: string): void {
		this.policyEngine.unregisterPolicy(policyId);
	}

	/**
	 * Get Express app
	 */
	getApp(): Express {
		return this.app;
	}

	/**
	 * Get router
	 */
	getRouter(): GatewayRouter {
		return this.router;
	}

	/**
	 * Get load balancer
	 */
	getLoadBalancer(): LoadBalancer {
		return this.loadBalancer;
	}

	/**
	 * Get health checker
	 */
	getHealthChecker(): HealthChecker {
		return this.healthChecker;
	}

	/**
	 * Get policy engine
	 */
	getPolicyEngine(): PolicyEngine {
		return this.policyEngine;
	}

	/**
	 * Get metrics
	 */
	getMetrics(): GatewayMetricsCollector {
		return this.metrics;
	}

	/**
	 * Get logger
	 */
	getLogger(): RequestLogger {
		return this.logger;
	}

	/**
	 * Start listening
	 */
	listen(port?: number, host?: string, callback?: () => void): void {
		const listenPort = port ?? this.config.port;
		const listenHost = host ?? this.config.host;

		this.app.listen(listenPort, listenHost, () => {
			this.logger.info(`Gateway listening on ${listenHost}:${listenPort}`);
			if (callback) callback();
		});
	}

	/**
	 * Shutdown gateway
	 */
	shutdown(): void {
		this.healthChecker.destroy();
		this.logger.info('Gateway shutdown complete');
	}
}

/**
 * Create a gateway instance
 */
export function createGateway(config?: Partial<GatewayConfig>): Gateway {
	return new Gateway(config);
}

/**
 * Create Express middleware for the gateway
 */
export function createGatewayMiddleware(config?: Partial<GatewayConfig>) {
	const gateway = new Gateway(config);
	return gateway.getApp();
}
