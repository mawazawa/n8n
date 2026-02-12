import { RateLimit } from './types';

/**
 * Rate limit window
 */
interface RateLimitWindow {
	requests: number[];
	limit: number;
	windowMs: number;
}

/**
 * Rate limit status
 */
interface RateLimitStatus {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
	retryAfter?: number;
}

/**
 * Integration Rate Limiter
 * Manages rate limiting for integrations with configurable windows and queueing
 */
export class IntegrationRateLimiter {
	private limits: Map<string, RateLimit>;
	private windows: Map<string, {
		second?: RateLimitWindow;
		minute?: RateLimitWindow;
		hour?: RateLimitWindow;
	}>;
	private queues: Map<string, Array<{
		resolve: () => void;
		reject: (error: Error) => void;
		timestamp: number;
	}>>;
	private queueProcessing: Map<string, boolean>;

	constructor() {
		this.limits = new Map();
		this.windows = new Map();
		this.queues = new Map();
		this.queueProcessing = new Map();
	}

	/**
	 * Set rate limit for an integration
	 */
	setLimit(integrationId: string, limit: RateLimit): void {
		this.limits.set(integrationId, limit);

		// Initialize windows
		const windows: {
			second?: RateLimitWindow;
			minute?: RateLimitWindow;
			hour?: RateLimitWindow;
		} = {};

		if (limit.requestsPerSecond) {
			windows.second = {
				requests: [],
				limit: limit.requestsPerSecond,
				windowMs: 1000,
			};
		}

		if (limit.requestsPerMinute) {
			windows.minute = {
				requests: [],
				limit: limit.requestsPerMinute,
				windowMs: 60000,
			};
		}

		if (limit.requestsPerHour) {
			windows.hour = {
				requests: [],
				limit: limit.requestsPerHour,
				windowMs: 3600000,
			};
		}

		this.windows.set(integrationId, windows);
	}

	/**
	 * Get rate limit for an integration
	 */
	getLimit(integrationId: string): RateLimit | undefined {
		return this.limits.get(integrationId);
	}

	/**
	 * Remove rate limit for an integration
	 */
	removeLimit(integrationId: string): void {
		this.limits.delete(integrationId);
		this.windows.delete(integrationId);
		this.queues.delete(integrationId);
		this.queueProcessing.delete(integrationId);
	}

	/**
	 * Check if request is allowed under rate limits
	 */
	async checkLimit(integrationId: string): Promise<boolean> {
		const status = await this.getLimitStatus(integrationId);
		return status.allowed;
	}

	/**
	 * Get detailed rate limit status
	 */
	async getLimitStatus(integrationId: string): Promise<RateLimitStatus> {
		const windows = this.windows.get(integrationId);

		if (!windows) {
			// No rate limit configured
			return {
				allowed: true,
				remaining: Number.MAX_SAFE_INTEGER,
				resetAt: new Date(Date.now() + 3600000),
			};
		}

		const now = Date.now();
		let allowed = true;
		let minRemaining = Number.MAX_SAFE_INTEGER;
		let earliestReset = now + 3600000;

		// Check each window
		for (const [windowType, window] of Object.entries(windows)) {
			if (!window) continue;

			// Remove expired requests
			window.requests = window.requests.filter((timestamp) => timestamp > now - window.windowMs);

			// Check if limit is exceeded
			if (window.requests.length >= window.limit) {
				allowed = false;

				// Calculate when the oldest request will expire
				const oldestRequest = window.requests[0];
				const resetAt = oldestRequest + window.windowMs;

				if (resetAt < earliestReset) {
					earliestReset = resetAt;
				}
			} else {
				const remaining = window.limit - window.requests.length;
				if (remaining < minRemaining) {
					minRemaining = remaining;
				}
			}
		}

		return {
			allowed,
			remaining: allowed ? minRemaining : 0,
			resetAt: new Date(earliestReset),
			retryAfter: allowed ? undefined : Math.ceil((earliestReset - now) / 1000),
		};
	}

	/**
	 * Record a request
	 */
	async recordRequest(integrationId: string): Promise<void> {
		const windows = this.windows.get(integrationId);

		if (!windows) {
			return;
		}

		const now = Date.now();

		// Add request to all windows
		for (const window of Object.values(windows)) {
			if (window) {
				window.requests.push(now);
			}
		}
	}

	/**
	 * Wait for rate limit availability (with queueing)
	 */
	async waitForAvailability(integrationId: string, timeoutMs = 30000): Promise<void> {
		const status = await this.getLimitStatus(integrationId);

		if (status.allowed) {
			await this.recordRequest(integrationId);
			return;
		}

		// Add to queue
		return new Promise((resolve, reject) => {
			if (!this.queues.has(integrationId)) {
				this.queues.set(integrationId, []);
			}

			const queue = this.queues.get(integrationId)!;
			queue.push({
				resolve,
				reject,
				timestamp: Date.now(),
			});

			// Set timeout
			const timeout = setTimeout(() => {
				const index = queue.findIndex((item) => item.resolve === resolve);
				if (index !== -1) {
					queue.splice(index, 1);
					reject(new Error('Rate limit wait timeout'));
				}
			}, timeoutMs);

			// Start processing queue if not already processing
			if (!this.queueProcessing.get(integrationId)) {
				this.processQueue(integrationId);
			}
		});
	}

	/**
	 * Process queued requests
	 */
	private async processQueue(integrationId: string): Promise<void> {
		this.queueProcessing.set(integrationId, true);

		const queue = this.queues.get(integrationId);
		if (!queue) {
			this.queueProcessing.set(integrationId, false);
			return;
		}

		while (queue.length > 0) {
			const status = await this.getLimitStatus(integrationId);

			if (status.allowed) {
				const item = queue.shift();
				if (item) {
					await this.recordRequest(integrationId);
					item.resolve();
				}
			} else {
				// Wait until reset
				const waitTime = status.retryAfter ? status.retryAfter * 1000 : 1000;
				await this.sleep(waitTime);
			}
		}

		this.queueProcessing.set(integrationId, false);
	}

	/**
	 * Get queue length
	 */
	getQueueLength(integrationId: string): number {
		const queue = this.queues.get(integrationId);
		return queue ? queue.length : 0;
	}

	/**
	 * Clear queue for an integration
	 */
	clearQueue(integrationId: string): void {
		const queue = this.queues.get(integrationId);
		if (queue) {
			// Reject all pending requests
			for (const item of queue) {
				item.reject(new Error('Queue cleared'));
			}
			queue.length = 0;
		}
	}

	/**
	 * Get current usage statistics
	 */
	getUsageStats(integrationId: string): {
		perSecond: { current: number; limit: number };
		perMinute: { current: number; limit: number };
		perHour: { current: number; limit: number };
	} {
		const windows = this.windows.get(integrationId);
		const now = Date.now();

		const stats = {
			perSecond: { current: 0, limit: 0 },
			perMinute: { current: 0, limit: 0 },
			perHour: { current: 0, limit: 0 },
		};

		if (!windows) {
			return stats;
		}

		if (windows.second) {
			const validRequests = windows.second.requests.filter((t) => t > now - 1000);
			stats.perSecond = {
				current: validRequests.length,
				limit: windows.second.limit,
			};
		}

		if (windows.minute) {
			const validRequests = windows.minute.requests.filter((t) => t > now - 60000);
			stats.perMinute = {
				current: validRequests.length,
				limit: windows.minute.limit,
			};
		}

		if (windows.hour) {
			const validRequests = windows.hour.requests.filter((t) => t > now - 3600000);
			stats.perHour = {
				current: validRequests.length,
				limit: windows.hour.limit,
			};
		}

		return stats;
	}

	/**
	 * Reset rate limit counters for an integration
	 */
	reset(integrationId: string): void {
		const windows = this.windows.get(integrationId);
		if (windows) {
			for (const window of Object.values(windows)) {
				if (window) {
					window.requests = [];
				}
			}
		}
	}

	/**
	 * Reset all rate limit counters
	 */
	resetAll(): void {
		for (const [integrationId] of this.windows) {
			this.reset(integrationId);
		}
	}

	/**
	 * Cleanup expired requests from all windows
	 */
	cleanup(): void {
		const now = Date.now();

		for (const windows of this.windows.values()) {
			for (const window of Object.values(windows)) {
				if (window) {
					window.requests = window.requests.filter((timestamp) => timestamp > now - window.windowMs);
				}
			}
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
	 * Sleep helper
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
