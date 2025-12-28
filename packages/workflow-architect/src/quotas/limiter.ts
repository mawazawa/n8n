import type { LimitResult } from './types';

/**
 * Sliding window entry for a specific key
 */
interface WindowEntry {
	/** Request timestamps within the current window */
	timestamps: number[];
	/** Last cleanup time */
	lastCleanup: number;
}

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
	/** Redis client for distributed rate limiting (optional) */
	redis?: RedisClient;
	/** Default window size in milliseconds */
	defaultWindow?: number;
	/** Cleanup interval in milliseconds */
	cleanupInterval?: number;
}

/**
 * Minimal Redis client interface for rate limiting
 */
export interface RedisClient {
	zadd(key: string, score: number, member: string): Promise<number>;
	zremrangebyscore(key: string, min: number, max: number): Promise<number>;
	zcard(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<number>;
}

/**
 * High-performance rate limiter using sliding window algorithm
 *
 * Features:
 * - Sliding window for accurate rate limiting
 * - In-memory storage for low latency (<1ms overhead)
 * - Optional Redis backing for distributed systems
 * - Automatic cleanup of expired entries
 * - Thread-safe operations
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * // Check if request is allowed (100 requests per minute)
 * const result = await limiter.checkLimit('user:123', 100, 60000);
 * if (!result.allowed) {
 *   throw new Error(`Rate limit exceeded. Retry after ${result.retryAfter}s`);
 * }
 *
 * // Increment the counter
 * await limiter.increment('user:123');
 * ```
 */
export class RateLimiter {
	private readonly windows: Map<string, WindowEntry>;
	private readonly redis?: RedisClient;
	private readonly defaultWindow: number;
	private cleanupTimer?: NodeJS.Timeout;

	constructor(config: RateLimiterConfig = {}) {
		this.windows = new Map();
		this.redis = config.redis;
		this.defaultWindow = config.defaultWindow ?? 60000; // 1 minute default

		// Start periodic cleanup
		const cleanupInterval = config.cleanupInterval ?? 60000;
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, cleanupInterval);
	}

	/**
	 * Check if a request is within the rate limit
	 *
	 * @param key - Unique identifier for the rate limit (e.g., 'user:123', 'ip:1.2.3.4')
	 * @param limit - Maximum number of requests allowed
	 * @param windowMs - Time window in milliseconds
	 * @returns Result indicating if request is allowed
	 */
	async checkLimit(key: string, limit: number, windowMs?: number): Promise<LimitResult> {
		const window = windowMs ?? this.defaultWindow;
		const now = Date.now();
		const windowStart = now - window;

		if (this.redis) {
			return this.checkLimitRedis(key, limit, window, now, windowStart);
		}

		return this.checkLimitLocal(key, limit, window, now, windowStart);
	}

	/**
	 * Increment the counter for a key
	 *
	 * @param key - Unique identifier
	 */
	async increment(key: string): Promise<void> {
		const now = Date.now();

		if (this.redis) {
			await this.incrementRedis(key, now);
			return;
		}

		this.incrementLocal(key, now);
	}

	/**
	 * Reset the counter for a key
	 *
	 * @param key - Unique identifier
	 */
	async reset(key: string): Promise<void> {
		if (this.redis) {
			await this.redis.zremrangebyscore(this.getRedisKey(key), 0, Date.now());
		}

		this.windows.delete(key);
	}

	/**
	 * Get current count for a key within a window
	 *
	 * @param key - Unique identifier
	 * @param windowMs - Time window in milliseconds
	 * @returns Current count
	 */
	async getCount(key: string, windowMs?: number): Promise<number> {
		const window = windowMs ?? this.defaultWindow;
		const now = Date.now();
		const windowStart = now - window;

		if (this.redis) {
			const redisKey = this.getRedisKey(key);
			await this.redis.zremrangebyscore(redisKey, 0, windowStart);
			return this.redis.zcard(redisKey);
		}

		const entry = this.windows.get(key);
		if (!entry) {
			return 0;
		}

		// Remove old timestamps
		entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
		return entry.timestamps.length;
	}

	/**
	 * Clean up expired entries from memory
	 */
	private cleanup(): void {
		const now = Date.now();
		const cleanupThreshold = now - this.defaultWindow * 2; // Keep 2x window for safety

		for (const [key, entry] of this.windows.entries()) {
			// Remove old timestamps
			entry.timestamps = entry.timestamps.filter((ts) => ts > now - this.defaultWindow);

			// Remove entry if no recent activity
			if (entry.lastCleanup < cleanupThreshold && entry.timestamps.length === 0) {
				this.windows.delete(key);
			} else {
				entry.lastCleanup = now;
			}
		}
	}

	/**
	 * Check limit using local in-memory storage
	 */
	private checkLimitLocal(
		key: string,
		limit: number,
		window: number,
		now: number,
		windowStart: number,
	): LimitResult {
		let entry = this.windows.get(key);

		if (!entry) {
			entry = { timestamps: [], lastCleanup: now };
			this.windows.set(key, entry);
		}

		// Remove timestamps outside the window
		entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

		const current = entry.timestamps.length;
		const allowed = current < limit;
		const resetsAt = new Date(entry.timestamps[0] ? entry.timestamps[0] + window : now + window);
		const retryAfter = Math.ceil((resetsAt.getTime() - now) / 1000);

		return {
			allowed,
			current,
			limit,
			resetsAt,
			retryAfter,
		};
	}

	/**
	 * Increment counter using local storage
	 */
	private incrementLocal(key: string, now: number): void {
		let entry = this.windows.get(key);

		if (!entry) {
			entry = { timestamps: [], lastCleanup: now };
			this.windows.set(key, entry);
		}

		entry.timestamps.push(now);
		entry.lastCleanup = now;
	}

	/**
	 * Check limit using Redis for distributed rate limiting
	 */
	private async checkLimitRedis(
		key: string,
		limit: number,
		window: number,
		now: number,
		windowStart: number,
	): Promise<LimitResult> {
		const redisKey = this.getRedisKey(key);

		// Remove old entries
		await this.redis!.zremrangebyscore(redisKey, 0, windowStart);

		// Get current count
		const current = await this.redis!.zcard(redisKey);

		const allowed = current < limit;
		const resetsAt = new Date(now + window);
		const retryAfter = Math.ceil(window / 1000);

		// Set expiration to prevent memory leaks
		await this.redis!.expire(redisKey, Math.ceil(window / 1000) * 2);

		return {
			allowed,
			current,
			limit,
			resetsAt,
			retryAfter,
		};
	}

	/**
	 * Increment counter using Redis
	 */
	private async incrementRedis(key: string, now: number): Promise<void> {
		const redisKey = this.getRedisKey(key);
		const member = `${now}-${Math.random()}`;
		await this.redis!.zadd(redisKey, now, member);
	}

	/**
	 * Get Redis key with prefix
	 */
	private getRedisKey(key: string): string {
		return `ratelimit:${key}`;
	}

	/**
	 * Destroy the rate limiter and cleanup resources
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
		this.windows.clear();
	}
}

/**
 * Create a rate limiter with Redis support
 *
 * @param redis - Redis client instance
 * @returns Configured rate limiter
 */
export function createRateLimiter(redis?: RedisClient): RateLimiter {
	return new RateLimiter({ redis });
}

/**
 * Convert time period to milliseconds
 *
 * @param amount - Amount of time
 * @param unit - Time unit (s, m, h, d)
 * @returns Milliseconds
 */
export function timeToMs(amount: number, unit: 's' | 'm' | 'h' | 'd'): number {
	const multipliers = {
		s: 1000,
		m: 60000,
		h: 3600000,
		d: 86400000,
	};

	return amount * multipliers[unit];
}
