import type { CircuitBreakerPolicyConfig, CircuitState, CircuitBreakerState } from './types.js';

/**
 * Circuit breaker for fault tolerance
 * Implements three states: CLOSED, OPEN, HALF_OPEN
 */
export class CircuitBreaker {
	private config: CircuitBreakerPolicyConfig;
	private states: Map<string, CircuitBreakerState> = new Map();

	constructor(config: CircuitBreakerPolicyConfig) {
		this.config = config;
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const state = this.getState(key);

		// Check if circuit is open
		if (state.state === 'OPEN') {
			// Check if we should attempt recovery
			if (state.nextAttempt && new Date() >= state.nextAttempt) {
				this.setState(key, 'HALF_OPEN');
			} else {
				// Circuit is open, return fallback
				throw new CircuitBreakerOpenError('Circuit breaker is open');
			}
		}

		try {
			// Execute the function
			const result = await this.executeWithTimeout(fn);

			// Record success
			this.recordSuccess(key);

			return result;
		} catch (error) {
			// Record failure
			this.recordFailure(key);

			throw error;
		}
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
		return Promise.race([
			fn(),
			new Promise<T>((_, reject) => {
				setTimeout(() => {
					reject(new Error('Request timeout'));
				}, this.config.timeout);
			}),
		]);
	}

	/**
	 * Record a successful request
	 */
	private recordSuccess(key: string): void {
		const state = this.getState(key);

		state.successes++;
		state.failures = 0;

		// Transition from HALF_OPEN to CLOSED if enough successes
		if (state.state === 'HALF_OPEN' && state.successes >= this.config.successThreshold) {
			this.setState(key, 'CLOSED');
		}

		this.updateState(key, state);
	}

	/**
	 * Record a failed request
	 */
	private recordFailure(key: string): void {
		const state = this.getState(key);

		state.failures++;
		state.successes = 0;
		state.lastFailure = new Date();

		// Transition to OPEN if threshold exceeded
		if (
			(state.state === 'CLOSED' || state.state === 'HALF_OPEN') &&
			state.failures >= this.config.failureThreshold
		) {
			this.setState(key, 'OPEN');
		}

		this.updateState(key, state);
	}

	/**
	 * Get state for a key
	 */
	getState(key: string): CircuitBreakerState {
		let state = this.states.get(key);
		if (!state) {
			state = {
				state: 'CLOSED',
				failures: 0,
				successes: 0,
			};
			this.states.set(key, state);
		}
		return state;
	}

	/**
	 * Set circuit state
	 */
	private setState(key: string, newState: CircuitState): void {
		const state = this.getState(key);
		state.state = newState;

		if (newState === 'OPEN') {
			// Set next attempt time
			state.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
		} else if (newState === 'CLOSED') {
			// Reset counters
			state.failures = 0;
			state.successes = 0;
			state.lastFailure = undefined;
			state.nextAttempt = undefined;
		}

		this.updateState(key, state);
	}

	/**
	 * Update state in store
	 */
	private updateState(key: string, state: CircuitBreakerState): void {
		this.states.set(key, state);
	}

	/**
	 * Reset circuit breaker for a key
	 */
	reset(key: string): void {
		this.setState(key, 'CLOSED');
	}

	/**
	 * Force open circuit
	 */
	open(key: string): void {
		this.setState(key, 'OPEN');
	}

	/**
	 * Force close circuit
	 */
	close(key: string): void {
		this.setState(key, 'CLOSED');
	}

	/**
	 * Get all circuit states
	 */
	getAllStates(): Map<string, CircuitBreakerState> {
		return new Map(this.states);
	}

	/**
	 * Clear all states
	 */
	clear(): void {
		this.states.clear();
	}

	/**
	 * Get fallback response
	 */
	getFallbackResponse(): {
		statusCode: number;
		body: unknown;
		headers: Record<string, string>;
	} {
		if (this.config.fallback) {
			return {
				statusCode: this.config.fallback.statusCode,
				body: this.config.fallback.body ?? {
					error: 'Service Unavailable',
					message: 'Circuit breaker is open',
				},
				headers: this.config.fallback.headers ?? {},
			};
		}

		return {
			statusCode: 503,
			body: {
				error: 'Service Unavailable',
				message: 'Circuit breaker is open',
			},
			headers: {},
		};
	}

	/**
	 * Check if circuit is open
	 */
	isOpen(key: string): boolean {
		const state = this.getState(key);
		return state.state === 'OPEN';
	}

	/**
	 * Check if circuit is half open
	 */
	isHalfOpen(key: string): boolean {
		const state = this.getState(key);
		return state.state === 'HALF_OPEN';
	}

	/**
	 * Check if circuit is closed
	 */
	isClosed(key: string): boolean {
		const state = this.getState(key);
		return state.state === 'CLOSED';
	}

	/**
	 * Get health status based on circuit state
	 */
	getHealthStatus(key: string): 'healthy' | 'unhealthy' | 'degraded' {
		const state = this.getState(key);

		switch (state.state) {
			case 'CLOSED':
				return 'healthy';
			case 'HALF_OPEN':
				return 'degraded';
			case 'OPEN':
				return 'unhealthy';
		}
	}
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CircuitBreakerOpenError';
	}
}
