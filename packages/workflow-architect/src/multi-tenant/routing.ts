import { type TenantContext, TenantIsolation } from './types';
import { type TenantManager } from './tenant';

/**
 * Routing strategies
 */
export enum RoutingStrategy {
	DOMAIN = 'DOMAIN',
	HEADER = 'HEADER',
	PATH = 'PATH',
	SUBDOMAIN = 'SUBDOMAIN',
}

/**
 * Request interface for routing
 */
export interface TenantRequest {
	hostname?: string;
	headers?: Record<string, string | string[] | undefined>;
	path?: string;
	query?: Record<string, string | string[] | undefined>;
	url?: string;
}

/**
 * Routing result
 */
export interface RoutingResult {
	tenantId: string;
	organizationId?: string;
	isolation: TenantIsolation;
	strategy: RoutingStrategy;
	duration: number; // in milliseconds
}

/**
 * TenantRouter handles request routing to tenants
 * Optimized for <5ms routing overhead
 */
export class TenantRouter {
	private tenantManager: TenantManager;
	private cache: Map<string, { tenantId: string; isolation: TenantIsolation; timestamp: number }>;
	private readonly cacheTTL = 60000; // 1 minute
	private readonly baseDomain?: string;

	constructor(tenantManager: TenantManager, baseDomain?: string) {
		this.tenantManager = tenantManager;
		this.baseDomain = baseDomain;
		this.cache = new Map();

		// Start cache cleanup interval
		this.startCacheCleanup();
	}

	/**
	 * Route request to tenant context
	 * Target: <5ms overhead
	 */
	async route(request: TenantRequest): Promise<TenantContext> {
		const startTime = performance.now();

		try {
			// Try routing strategies in order of performance
			const result = await this.routeWithStrategies(request);

			const duration = performance.now() - startTime;

			// Log if routing takes too long
			if (duration > 5) {
				console.warn(`Tenant routing took ${duration.toFixed(2)}ms (target: <5ms)`);
			}

			return {
				tenantId: result.tenantId,
				organizationId: result.organizationId,
				isolation: result.isolation,
				timestamp: new Date(),
			};
		} catch (error) {
			const duration = performance.now() - startTime;
			throw new Error(
				`Tenant routing failed after ${duration.toFixed(2)}ms: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Try routing strategies in order
	 */
	private async routeWithStrategies(request: TenantRequest): Promise<RoutingResult> {
		const startTime = performance.now();

		// Strategy 1: Header-based routing (fastest, no DB lookup if cached)
		const headerResult = await this.routeByHeader(request);
		if (headerResult) {
			return {
				...headerResult,
				strategy: RoutingStrategy.HEADER,
				duration: performance.now() - startTime,
			};
		}

		// Strategy 2: Subdomain routing (fast with cache)
		const subdomainResult = await this.routeBySubdomain(request);
		if (subdomainResult) {
			return {
				...subdomainResult,
				strategy: RoutingStrategy.SUBDOMAIN,
				duration: performance.now() - startTime,
			};
		}

		// Strategy 3: Custom domain routing (requires DB lookup, uses cache)
		const domainResult = await this.routeByDomain(request);
		if (domainResult) {
			return {
				...domainResult,
				strategy: RoutingStrategy.DOMAIN,
				duration: performance.now() - startTime,
			};
		}

		// Strategy 4: Path-based routing (slowest, fallback)
		const pathResult = await this.routeByPath(request);
		if (pathResult) {
			return {
				...pathResult,
				strategy: RoutingStrategy.PATH,
				duration: performance.now() - startTime,
			};
		}

		throw new Error('Unable to determine tenant from request');
	}

	/**
	 * Route by X-Tenant-ID header (fastest)
	 */
	private async routeByHeader(
		request: TenantRequest,
	): Promise<{ tenantId: string; organizationId?: string; isolation: TenantIsolation } | null> {
		const tenantId = this.getHeader(request, 'x-tenant-id');
		if (!tenantId) {
			return null;
		}

		// Check cache first
		const cached = this.getCached(tenantId);
		if (cached) {
			return {
				tenantId: cached.tenantId,
				isolation: cached.isolation,
			};
		}

		// Validate tenant exists
		const tenant = await this.tenantManager.getById(tenantId);
		if (!tenant) {
			throw new Error(`Tenant ${tenantId} not found`);
		}

		// Cache result
		this.setCached(tenantId, {
			tenantId: tenant.id,
			isolation: tenant.isolation,
		});

		return {
			tenantId: tenant.id,
			organizationId: tenant.organizationId,
			isolation: tenant.isolation,
		};
	}

	/**
	 * Route by subdomain (e.g., acme.example.com)
	 */
	private async routeBySubdomain(
		request: TenantRequest,
	): Promise<{ tenantId: string; organizationId?: string; isolation: TenantIsolation } | null> {
		if (!this.baseDomain || !request.hostname) {
			return null;
		}

		// Extract subdomain
		const hostname = request.hostname.toLowerCase();
		if (!hostname.endsWith(this.baseDomain)) {
			return null;
		}

		const subdomain = hostname.replace(`.${this.baseDomain}`, '');
		if (!subdomain || subdomain === this.baseDomain) {
			return null;
		}

		// Check cache
		const cacheKey = `subdomain:${subdomain}`;
		const cached = this.getCached(cacheKey);
		if (cached) {
			return {
				tenantId: cached.tenantId,
				isolation: cached.isolation,
			};
		}

		// Look up tenant by slug (subdomain)
		const tenant = await this.tenantManager.getBySlug(subdomain);
		if (!tenant) {
			return null;
		}

		// Cache result
		this.setCached(cacheKey, {
			tenantId: tenant.id,
			isolation: tenant.isolation,
		});

		return {
			tenantId: tenant.id,
			organizationId: tenant.organizationId,
			isolation: tenant.isolation,
		};
	}

	/**
	 * Route by custom domain
	 */
	private async routeByDomain(
		request: TenantRequest,
	): Promise<{ tenantId: string; organizationId?: string; isolation: TenantIsolation } | null> {
		if (!request.hostname) {
			return null;
		}

		const hostname = request.hostname.toLowerCase();

		// Skip if it's the base domain
		if (this.baseDomain && hostname === this.baseDomain) {
			return null;
		}

		// Check cache
		const cacheKey = `domain:${hostname}`;
		const cached = this.getCached(cacheKey);
		if (cached) {
			return {
				tenantId: cached.tenantId,
				isolation: cached.isolation,
			};
		}

		// Look up tenant by domain
		const tenant = await this.tenantManager.getTenantByDomain(hostname);
		if (!tenant) {
			return null;
		}

		// Cache result
		this.setCached(cacheKey, {
			tenantId: tenant.id,
			isolation: tenant.isolation,
		});

		return {
			tenantId: tenant.id,
			organizationId: tenant.organizationId,
			isolation: tenant.isolation,
		};
	}

	/**
	 * Route by path (e.g., /tenant/:slug/...)
	 */
	private async routeByPath(
		request: TenantRequest,
	): Promise<{ tenantId: string; organizationId?: string; isolation: TenantIsolation } | null> {
		const path = request.path ?? request.url;
		if (!path) {
			return null;
		}

		// Match /tenant/:slug pattern
		const match = path.match(/^\/tenant\/([a-z0-9-]+)/);
		if (!match) {
			return null;
		}

		const slug = match[1];

		// Check cache
		const cacheKey = `slug:${slug}`;
		const cached = this.getCached(cacheKey);
		if (cached) {
			return {
				tenantId: cached.tenantId,
				isolation: cached.isolation,
			};
		}

		// Look up tenant by slug
		const tenant = await this.tenantManager.getBySlug(slug);
		if (!tenant) {
			return null;
		}

		// Cache result
		this.setCached(cacheKey, {
			tenantId: tenant.id,
			isolation: tenant.isolation,
		});

		return {
			tenantId: tenant.id,
			organizationId: tenant.organizationId,
			isolation: tenant.isolation,
		};
	}

	/**
	 * Get header value
	 */
	private getHeader(request: TenantRequest, name: string): string | null {
		if (!request.headers) {
			return null;
		}

		const value = request.headers[name] ?? request.headers[name.toLowerCase()];
		if (!value) {
			return null;
		}

		return Array.isArray(value) ? value[0] : value;
	}

	/**
	 * Get cached tenant info
	 */
	private getCached(key: string): { tenantId: string; isolation: TenantIsolation } | null {
		const cached = this.cache.get(key);
		if (!cached) {
			return null;
		}

		// Check if expired
		if (Date.now() - cached.timestamp > this.cacheTTL) {
			this.cache.delete(key);
			return null;
		}

		return {
			tenantId: cached.tenantId,
			isolation: cached.isolation,
		};
	}

	/**
	 * Set cached tenant info
	 */
	private setCached(key: string, value: { tenantId: string; isolation: TenantIsolation }): void {
		this.cache.set(key, {
			...value,
			timestamp: Date.now(),
		});
	}

	/**
	 * Clear cache for specific key
	 */
	clearCache(key?: string): void {
		if (key) {
			this.cache.delete(key);
		} else {
			this.cache.clear();
		}
	}

	/**
	 * Start cache cleanup interval
	 */
	private startCacheCleanup(): void {
		setInterval(() => {
			const now = Date.now();
			for (const [key, value] of this.cache.entries()) {
				if (now - value.timestamp > this.cacheTTL) {
					this.cache.delete(key);
				}
			}
		}, this.cacheTTL);
	}

	/**
	 * Warm up cache with frequently accessed tenants
	 */
	async warmCache(tenantIds: string[]): Promise<void> {
		const promises = tenantIds.map(async (tenantId) => {
			try {
				const tenant = await this.tenantManager.getById(tenantId);
				if (tenant) {
					this.setCached(tenantId, {
						tenantId: tenant.id,
						isolation: tenant.isolation,
					});

					// Also cache by slug
					this.setCached(`slug:${tenant.slug}`, {
						tenantId: tenant.id,
						isolation: tenant.isolation,
					});
				}
			} catch (error) {
				console.error(`Failed to warm cache for tenant ${tenantId}:`, error);
			}
		});

		await Promise.all(promises);
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): {
		size: number;
		hitRate: number;
		avgAge: number;
	} {
		const now = Date.now();
		let totalAge = 0;

		for (const value of this.cache.values()) {
			totalAge += now - value.timestamp;
		}

		return {
			size: this.cache.size,
			hitRate: 0, // Would need to track hits/misses
			avgAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
		};
	}

	/**
	 * Create Express middleware
	 */
	middleware() {
		return async (
			req: TenantRequest & { tenantContext?: TenantContext },
			res: unknown,
			next: (error?: Error) => void,
		) => {
			try {
				const context = await this.route(req);
				req.tenantContext = context;
				next();
			} catch (error) {
				next(error instanceof Error ? error : new Error(String(error)));
			}
		};
	}
}
