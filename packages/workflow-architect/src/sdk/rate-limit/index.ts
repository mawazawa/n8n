/**
 * Rate limiting handler with automatic backoff
 * Parses rate limit headers and queues requests when limited
 */

import type { RateLimitInfo } from '../types.js';

/**
 * Rate limit handler that respects API rate limits
 * Integration: const handler = new RateLimitHandler();
 */
export class RateLimitHandler {
	private limit = 0;
	private remaining = 0;
	private reset: Date | null = null;
	private retryAfter: number | null = null;
	private queue: Array<() => void> = [];

	updateFromHeaders(headers: Headers): void {
		const limit = headers.get('x-rate-limit-limit');
		const remaining = headers.get('x-rate-limit-remaining');
		const reset = headers.get('x-rate-limit-reset');
		const retryAfter = headers.get('retry-after');

		if (limit) this.limit = parseInt(limit, 10);
		if (remaining) this.remaining = parseInt(remaining, 10);
		if (reset) this.reset = new Date(parseInt(reset, 10) * 1000);
		if (retryAfter) this.retryAfter = parseInt(retryAfter, 10);
	}

	async checkLimit(): Promise<void> {
		if (this.remaining === 0 && this.reset) {
			const waitTime = this.reset.getTime() - Date.now();
			if (waitTime > 0) {
				await this.wait(waitTime);
			}
		}
		if (this.retryAfter) {
			await this.wait(this.retryAfter * 1000);
			this.retryAfter = null;
		}
	}

	getInfo(): RateLimitInfo | null {
		if (this.limit === 0) return null;
		return {
			limit: this.limit,
			remaining: this.remaining,
			reset: this.reset ?? new Date(),
			retryAfter: this.retryAfter ?? undefined,
		};
	}

	private async wait(ms: number): Promise<void> {
		return new Promise<void>(resolve => {
			this.queue.push(resolve);
			setTimeout(() => {
				const next = this.queue.shift();
				if (next) next();
			}, ms);
		});
	}
}
