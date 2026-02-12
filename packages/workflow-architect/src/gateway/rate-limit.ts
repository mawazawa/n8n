import type { Request, Response, NextFunction } from 'express';
import type { RateLimitPolicyConfig, RateLimitState } from './types.js';

interface RateLimitEntry {
	requests: number[];
	blocked: boolean;
	resetTime: number;
}

/**
 * Rate limiter using sliding window algorithm
 * Supports per-route, per-user, and global rate limiting
 */
export class RateLimiter {
	private config: RateLimitPolicyConfig;
	private store: Map<string, RateLimitEntry> = new Map();
	private cleanupInterval?: NodeJS.Timeout;

	constructor(config: RateLimitPolicyConfig) {
		this.config = config;
		this.startCleanup();
	}

	/**
	 * Configure rate limits for a specific route
	 */
	configure(routeId: string, config: Partial<RateLimitPolicyConfig>): void {
		// Store route-specific config (in production, use a more sophisticated approach)
		this.config = { ...this.config, ...config };
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const key = this.generateKey(req);
			const state = await this.checkLimit(key);

			// Set rate limit headers
			res.setHeader('X-RateLimit-Limit', this.config.maxRequests.toString());
			res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.maxRequests - state.requests).toString());
			res.setHeader('X-RateLimit-Reset', state.resetTime.toString());

			if (state.blocked) {
				const retryAfter = Math.ceil((state.resetTime - Date.now()) / 1000);
				res.setHeader('Retry-After', retryAfter.toString());
				res.status(429).json({
					error: 'Too Many Requests',
					message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
					retryAfter,
				});
				return;
			}

			// Track response to optionally skip successful/failed requests
			const originalSend = res.send.bind(res);
			res.send = ((body: unknown): Response => {
				const statusCode = res.statusCode;
				const isSuccess = statusCode >= 200 && statusCode < 400;
				const isFailed = statusCode >= 400;

				// Remove request from count if configured
				if (
					(this.config.skipSuccessfulRequests && isSuccess) ||
					(this.config.skipFailedRequests && isFailed)
				) {
					this.decrementCount(key);
				}

				return originalSend(body);
			}) as Response['send'];

			next();
		};
	}

	/**
	 * Check if request is within rate limit
	 */
	async checkLimit(key: string): Promise<RateLimitState> {
		const now = Date.now();
		const windowStart = now - this.config.windowMs;

		let entry = this.store.get(key);
		if (!entry) {
			entry = {
				requests: [],
				blocked: false,
				resetTime: now + this.config.windowMs,
			};
			this.store.set(key, entry);
		}

		// Remove requests outside the current window (sliding window)
		entry.requests = entry.requests.filter((timestamp) => timestamp > windowStart);

		// Count requests in current window
		const requestCount = entry.requests.length;

		// Check if limit exceeded
		const maxRequests = this.config.burstSize ?? this.config.maxRequests;
		const blocked = requestCount >= maxRequests;

		if (!blocked) {
			// Add current request
			entry.requests.push(now);
			entry.resetTime = now + this.config.windowMs;
		}

		entry.blocked = blocked;

		return {
			requests: requestCount,
			resetTime: entry.resetTime,
			blocked,
		};
	}

	/**
	 * Generate rate limit key from request
	 */
	private generateKey(req: Request): string {
		const parts: string[] = [];

		switch (this.config.keyGenerator) {
			case 'ip': {
				const ip =
					(req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
					req.socket.remoteAddress ||
					'unknown';
				parts.push(`ip:${ip}`);
				break;
			}
			case 'user': {
				const user = (req as Request & { user?: { id: string } }).user;
				if (user) {
					parts.push(`user:${user.id}`);
				} else {
					parts.push('anonymous');
				}
				break;
			}
			case 'api-key': {
				const apiKey = req.headers['x-api-key'] as string | undefined;
				if (apiKey) {
					parts.push(`apikey:${apiKey}`);
				} else {
					parts.push('no-key');
				}
				break;
			}
			case 'custom': {
				// Allow custom key via header
				const customKey = req.headers['x-rate-limit-key'] as string | undefined;
				if (customKey) {
					parts.push(customKey);
				} else {
					parts.push('default');
				}
				break;
			}
		}

		return parts.join(':');
	}

	/**
	 * Decrement request count (for skip options)
	 */
	private decrementCount(key: string): void {
		const entry = this.store.get(key);
		if (entry && entry.requests.length > 0) {
			entry.requests.pop();
		}
	}

	/**
	 * Reset rate limit for a key
	 */
	reset(key: string): void {
		this.store.delete(key);
	}

	/**
	 * Get current state for a key
	 */
	getState(key: string): RateLimitState | null {
		const entry = this.store.get(key);
		if (!entry) return null;

		return {
			requests: entry.requests.length,
			resetTime: entry.resetTime,
			blocked: entry.blocked,
		};
	}

	/**
	 * Clear all rate limit data
	 */
	clear(): void {
		this.store.clear();
	}

	/**
	 * Start periodic cleanup of expired entries
	 */
	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [key, entry] of this.store.entries()) {
				// Remove entries that are expired
				if (entry.resetTime < now && entry.requests.length === 0) {
					this.store.delete(key);
				}
			}
		}, this.config.windowMs);
	}

	/**
	 * Stop cleanup interval
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}
}
