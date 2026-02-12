/**
 * Retry logic with exponential backoff and jitter
 * Handles transient failures with configurable strategies
 */

/**
 * Retry handler with exponential backoff
 * Integration: const handler = new RetryHandler(maxRetries);
 */
export class RetryHandler {
	private readonly baseDelay = 1000;
	private readonly maxDelay = 30000;
	private circuitOpen = false;
	private failureCount = 0;
	private readonly circuitThreshold = 5;

	constructor(private maxRetries: number = 3) {}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.circuitOpen) {
			throw new Error('Circuit breaker is open');
		}

		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const result = await fn();
				this.failureCount = 0;
				return result;
			} catch (error) {
				lastError = error as Error;
				if (!this.isRetriable(error) || attempt === this.maxRetries) {
					this.handleFailure();
					throw error;
				}
				await this.delay(attempt);
			}
		}
		throw lastError;
	}

	private isRetriable(error: unknown): boolean {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			return message.includes('timeout') ||
				   message.includes('network') ||
				   message.includes('503') ||
				   message.includes('502');
		}
		return false;
	}

	private async delay(attempt: number): Promise<void> {
		const exponentialDelay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
		const jitter = Math.random() * 1000;
		await new Promise(resolve => setTimeout(resolve, exponentialDelay + jitter));
	}

	private handleFailure(): void {
		this.failureCount++;
		if (this.failureCount >= this.circuitThreshold) {
			this.circuitOpen = true;
			setTimeout(() => { this.circuitOpen = false; this.failureCount = 0; }, 60000);
		}
	}
}
