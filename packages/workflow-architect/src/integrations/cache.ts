import Redis from 'ioredis';
import { CachedResponse } from './types';

/**
 * Cache statistics
 */
interface CacheStats {
	hits: number;
	misses: number;
	hitRate: number;
	size: number;
}

/**
 * Cache entry metadata
 */
interface CacheEntry<T = unknown> {
	data: T;
	cachedAt: Date;
	expiresAt: Date;
	hits: number;
	lastAccessed: Date;
}

/**
 * Response Cache
 * Manages caching of integration responses with TTL, invalidation, and metrics
 */
export class ResponseCache {
	private redis?: Redis;
	private memoryCache: Map<string, CacheEntry>;
	private stats: {
		hits: number;
		misses: number;
	};
	private useRedis: boolean;

	constructor(redisUrl?: string) {
		this.memoryCache = new Map();
		this.stats = {
			hits: 0,
			misses: 0,
		};

		if (redisUrl) {
			this.redis = new Redis(redisUrl);
			this.useRedis = true;
		} else {
			this.useRedis = false;
		}
	}

	/**
	 * Get cached response
	 */
	async get<T = unknown>(key: string): Promise<CachedResponse<T> | null> {
		const fullKey = this.buildKey(key);

		if (this.useRedis && this.redis) {
			return this.getFromRedis<T>(fullKey);
		} else {
			return this.getFromMemory<T>(fullKey);
		}
	}

	/**
	 * Set cached response
	 */
	async set<T = unknown>(key: string, response: T, ttlSeconds = 300): Promise<void> {
		const fullKey = this.buildKey(key);
		const cachedAt = new Date();
		const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

		const cachedResponse: CachedResponse<T> = {
			data: response,
			cachedAt,
			expiresAt,
		};

		if (this.useRedis && this.redis) {
			await this.setInRedis(fullKey, cachedResponse, ttlSeconds);
		} else {
			this.setInMemory(fullKey, cachedResponse);
		}
	}

	/**
	 * Invalidate cache entry
	 */
	async invalidate(key: string): Promise<void> {
		const fullKey = this.buildKey(key);

		if (this.useRedis && this.redis) {
			await this.redis.del(fullKey);
		} else {
			this.memoryCache.delete(fullKey);
		}
	}

	/**
	 * Invalidate multiple cache entries by pattern
	 */
	async invalidatePattern(pattern: string): Promise<void> {
		const fullPattern = this.buildKey(pattern);

		if (this.useRedis && this.redis) {
			const keys = await this.redis.keys(fullPattern);
			if (keys.length > 0) {
				await this.redis.del(...keys);
			}
		} else {
			// For memory cache, match pattern manually
			const keysToDelete: string[] = [];
			const regex = new RegExp(fullPattern.replace(/\*/g, '.*'));

			for (const key of this.memoryCache.keys()) {
				if (regex.test(key)) {
					keysToDelete.push(key);
				}
			}

			for (const key of keysToDelete) {
				this.memoryCache.delete(key);
			}
		}
	}

	/**
	 * Clear all cache entries
	 */
	async clear(): Promise<void> {
		if (this.useRedis && this.redis) {
			const keys = await this.redis.keys(this.buildKey('*'));
			if (keys.length > 0) {
				await this.redis.del(...keys);
			}
		} else {
			this.memoryCache.clear();
		}

		// Reset stats
		this.stats.hits = 0;
		this.stats.misses = 0;
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<CacheStats> {
		const size = this.useRedis && this.redis
			? (await this.redis.keys(this.buildKey('*'))).length
			: this.memoryCache.size;

		const total = this.stats.hits + this.stats.misses;
		const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

		return {
			hits: this.stats.hits,
			misses: this.stats.misses,
			hitRate,
			size,
		};
	}

	/**
	 * Get cache size
	 */
	async size(): Promise<number> {
		if (this.useRedis && this.redis) {
			const keys = await this.redis.keys(this.buildKey('*'));
			return keys.length;
		} else {
			return this.memoryCache.size;
		}
	}

	/**
	 * Check if key exists in cache
	 */
	async has(key: string): Promise<boolean> {
		const fullKey = this.buildKey(key);

		if (this.useRedis && this.redis) {
			return (await this.redis.exists(fullKey)) === 1;
		} else {
			return this.memoryCache.has(fullKey);
		}
	}

	/**
	 * Get TTL for a key
	 */
	async getTTL(key: string): Promise<number | null> {
		const fullKey = this.buildKey(key);

		if (this.useRedis && this.redis) {
			const ttl = await this.redis.ttl(fullKey);
			return ttl > 0 ? ttl : null;
		} else {
			const entry = this.memoryCache.get(fullKey);
			if (!entry) return null;

			const ttl = Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000);
			return ttl > 0 ? ttl : null;
		}
	}

	/**
	 * Get all cache keys
	 */
	async keys(pattern = '*'): Promise<string[]> {
		const fullPattern = this.buildKey(pattern);

		if (this.useRedis && this.redis) {
			const keys = await this.redis.keys(fullPattern);
			return keys.map((key) => this.stripPrefix(key));
		} else {
			const regex = new RegExp(fullPattern.replace(/\*/g, '.*'));
			const matchingKeys: string[] = [];

			for (const key of this.memoryCache.keys()) {
				if (regex.test(key)) {
					matchingKeys.push(this.stripPrefix(key));
				}
			}

			return matchingKeys;
		}
	}

	/**
	 * Get from Redis
	 */
	private async getFromRedis<T>(key: string): Promise<CachedResponse<T> | null> {
		if (!this.redis) return null;

		const value = await this.redis.get(key);

		if (!value) {
			this.stats.misses++;
			return null;
		}

		try {
			const entry: CacheEntry<T> = JSON.parse(value);

			// Update access metadata
			entry.hits++;
			entry.lastAccessed = new Date();
			await this.redis.set(key, JSON.stringify(entry), 'KEEPTTL');

			this.stats.hits++;

			return {
				data: entry.data,
				cachedAt: new Date(entry.cachedAt),
				expiresAt: new Date(entry.expiresAt),
			};
		} catch {
			this.stats.misses++;
			return null;
		}
	}

	/**
	 * Set in Redis
	 */
	private async setInRedis<T>(key: string, response: CachedResponse<T>, ttl: number): Promise<void> {
		if (!this.redis) return;

		const entry: CacheEntry<T> = {
			data: response.data,
			cachedAt: response.cachedAt,
			expiresAt: response.expiresAt,
			hits: 0,
			lastAccessed: new Date(),
		};

		await this.redis.set(key, JSON.stringify(entry), 'EX', ttl);
	}

	/**
	 * Get from memory cache
	 */
	private getFromMemory<T>(key: string): CachedResponse<T> | null {
		const entry = this.memoryCache.get(key);

		if (!entry) {
			this.stats.misses++;
			return null;
		}

		// Check if expired
		if (entry.expiresAt.getTime() < Date.now()) {
			this.memoryCache.delete(key);
			this.stats.misses++;
			return null;
		}

		// Update access metadata
		entry.hits++;
		entry.lastAccessed = new Date();

		this.stats.hits++;

		return {
			data: entry.data as T,
			cachedAt: entry.cachedAt,
			expiresAt: entry.expiresAt,
		};
	}

	/**
	 * Set in memory cache
	 */
	private setInMemory<T>(key: string, response: CachedResponse<T>): void {
		const entry: CacheEntry<T> = {
			data: response.data,
			cachedAt: response.cachedAt,
			expiresAt: response.expiresAt,
			hits: 0,
			lastAccessed: new Date(),
		};

		this.memoryCache.set(key, entry);

		// Setup auto-cleanup
		const ttl = response.expiresAt.getTime() - Date.now();
		setTimeout(() => {
			this.memoryCache.delete(key);
		}, ttl);
	}

	/**
	 * Build full cache key with prefix
	 */
	private buildKey(key: string): string {
		return `integration_cache:${key}`;
	}

	/**
	 * Strip prefix from cache key
	 */
	private stripPrefix(key: string): string {
		return key.replace(/^integration_cache:/, '');
	}

	/**
	 * Cleanup expired entries (for memory cache)
	 */
	cleanup(): void {
		if (this.useRedis) return;

		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, entry] of this.memoryCache.entries()) {
			if (entry.expiresAt.getTime() < now) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.memoryCache.delete(key);
		}
	}

	/**
	 * Start periodic cleanup
	 */
	startPeriodicCleanup(intervalMs = 60000): NodeJS.Timeout {
		return setInterval(() => {
			this.cleanup();
		}, intervalMs);
	}

	/**
	 * Close connections
	 */
	async close(): Promise<void> {
		if (this.redis) {
			await this.redis.quit();
		}
	}
}
