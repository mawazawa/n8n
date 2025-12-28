import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { CachePolicyConfig, CacheEntry } from './types.js';

/**
 * Response caching with Cache-Control, ETag, and If-Modified-Since support
 */
export class ResponseCache {
	private config: CachePolicyConfig;
	private store: Map<string, CacheEntry> = new Map();
	private cleanupInterval?: NodeJS.Timeout;

	constructor(config: CachePolicyConfig) {
		this.config = config;
		this.startCleanup();
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			// Only cache configured methods
			if (!this.config.methods.includes(req.method as never)) {
				next();
				return;
			}

			const cacheKey = this.generateKey(req);
			const cached = this.get(cacheKey);

			// Check conditional requests
			if (cached) {
				// Check If-None-Match (ETag)
				const ifNoneMatch = req.headers['if-none-match'];
				if (ifNoneMatch && cached.etag && ifNoneMatch === cached.etag) {
					res.status(304).end();
					return;
				}

				// Check If-Modified-Since
				const ifModifiedSince = req.headers['if-modified-since'];
				if (ifModifiedSince && cached.lastModified) {
					const modifiedSince = new Date(ifModifiedSince);
					if (cached.lastModified <= modifiedSince) {
						res.status(304).end();
						return;
					}
				}

				// Return cached response
				if (cached.etag) {
					res.setHeader('ETag', cached.etag);
				}
				if (cached.lastModified) {
					res.setHeader('Last-Modified', cached.lastModified.toUTCString());
				}
				res.setHeader('X-Cache', 'HIT');

				// Set headers
				Object.entries(cached.headers).forEach(([key, value]) => {
					res.setHeader(key, value);
				});

				res.status(cached.statusCode).send(cached.body);
				return;
			}

			res.setHeader('X-Cache', 'MISS');

			// Intercept response
			const originalSend = res.send.bind(res);
			res.send = ((body: unknown): Response => {
				// Check if response should be cached
				if (this.shouldCache(req, res)) {
					this.set(cacheKey, {
						statusCode: res.statusCode,
						headers: this.extractHeaders(res),
						body,
						etag: this.generateETag(body),
						lastModified: new Date(),
						expiresAt: new Date(Date.now() + this.config.ttl),
						vary: this.config.varyHeaders,
					});
				}

				return originalSend(body);
			}) as Response['send'];

			next();
		};
	}

	/**
	 * Get cached response
	 */
	get(key: string): CacheEntry | null {
		const entry = this.store.get(key);
		if (!entry) return null;

		// Check expiration
		if (entry.expiresAt < new Date()) {
			this.store.delete(key);
			return null;
		}

		return entry;
	}

	/**
	 * Set cached response
	 */
	set(key: string, entry: CacheEntry): void {
		this.store.set(key, entry);
	}

	/**
	 * Invalidate cache entry
	 */
	invalidate(key: string): void {
		this.store.delete(key);
	}

	/**
	 * Invalidate cache by pattern
	 */
	invalidatePattern(pattern: RegExp): void {
		for (const key of this.store.keys()) {
			if (pattern.test(key)) {
				this.store.delete(key);
			}
		}
	}

	/**
	 * Clear all cache
	 */
	clear(): void {
		this.store.clear();
	}

	/**
	 * Get cache size
	 */
	size(): number {
		return this.store.size;
	}

	/**
	 * Generate cache key
	 */
	private generateKey(req: Request): string {
		const parts: string[] = [];

		switch (this.config.keyGenerator) {
			case 'url':
				parts.push(req.path);
				break;
			case 'url-query':
				parts.push(req.path);
				if (Object.keys(req.query).length > 0) {
					parts.push(JSON.stringify(req.query));
				}
				break;
			case 'custom': {
				const customKey = req.headers['x-cache-key'] as string | undefined;
				parts.push(customKey ?? req.path);
				break;
			}
		}

		// Add vary headers
		for (const header of this.config.varyHeaders) {
			const value = req.headers[header.toLowerCase()];
			if (value) {
				parts.push(`${header}:${value}`);
			}
		}

		return parts.join('|');
	}

	/**
	 * Check if response should be cached
	 */
	private shouldCache(req: Request, res: Response): boolean {
		// Don't cache error responses
		if (res.statusCode >= 400) {
			return false;
		}

		// Respect Cache-Control header if configured
		if (this.config.respectCacheControl) {
			const cacheControl = res.getHeader('Cache-Control') as string | undefined;
			if (cacheControl) {
				// Don't cache if no-cache or no-store
				if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
					return false;
				}

				// Don't cache if private (unless we're caching per-user)
				if (cacheControl.includes('private')) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Extract headers from response
	 */
	private extractHeaders(res: Response): Record<string, string> {
		const headers: Record<string, string> = {};
		const headerNames = res.getHeaderNames();

		for (const name of headerNames) {
			// Skip some headers that shouldn't be cached
			if (
				name.toLowerCase() === 'set-cookie' ||
				name.toLowerCase() === 'authorization' ||
				name.toLowerCase() === 'x-cache'
			) {
				continue;
			}

			const value = res.getHeader(name);
			if (typeof value === 'string') {
				headers[name] = value;
			} else if (typeof value === 'number') {
				headers[name] = value.toString();
			} else if (Array.isArray(value)) {
				headers[name] = value.join(', ');
			}
		}

		return headers;
	}

	/**
	 * Generate ETag for response body
	 */
	private generateETag(body: unknown): string {
		const content = typeof body === 'string' ? body : JSON.stringify(body);
		const hash = crypto.createHash('md5').update(content).digest('hex');
		return `"${hash}"`;
	}

	/**
	 * Start periodic cleanup of expired entries
	 */
	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = new Date();
			for (const [key, entry] of this.store.entries()) {
				if (entry.expiresAt < now) {
					this.store.delete(key);
				}
			}
		}, 60000); // Clean up every minute
	}

	/**
	 * Stop cleanup interval
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}

	/**
	 * Create invalidation middleware for specific methods
	 */
	invalidationMiddleware() {
		return (req: Request, _res: Response, next: NextFunction): void => {
			// Invalidate cache on mutating operations
			if (this.config.invalidateOn.includes(req.method as never)) {
				// Invalidate all cache entries matching the path
				const pattern = new RegExp(`^${req.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
				this.invalidatePattern(pattern);
			}
			next();
		};
	}
}
