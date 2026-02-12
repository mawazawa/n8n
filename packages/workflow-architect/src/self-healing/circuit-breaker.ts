import type { CircuitBreakerConfig, CircuitBreakerState } from './types.js';
import { CircuitState, CircuitBreakerConfigSchema } from './types.js';

/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by temporarily blocking requests to failing services.
 * States: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing recovery).
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly states: Map<string, CircuitBreakerState> = new Map();

  constructor(config?: Partial<CircuitBreakerConfig>) {
    const defaultConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      volumeThreshold: 10,
      errorThresholdPercentage: 50,
      halfOpenMaxCalls: 3,
    };

    this.config = CircuitBreakerConfigSchema.parse({
      ...defaultConfig,
      ...config,
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(nodeId: string, operation: () => Promise<T>): Promise<T> {
    const state = this.getState(nodeId);

    // Check if circuit is open
    if (state.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset(state)) {
        this.transitionToHalfOpen(nodeId);
      } else {
        throw new Error(`Circuit breaker is OPEN for node ${nodeId}`);
      }
    }

    // Check if in half-open state and max calls reached
    if (
      state.state === CircuitState.HALF_OPEN &&
      state.successCount + state.failureCount >= this.config.halfOpenMaxCalls
    ) {
      throw new Error(`Circuit breaker max calls reached in HALF_OPEN state for node ${nodeId}`);
    }

    try {
      const result = await operation();
      this.recordSuccess(nodeId);
      return result;
    } catch (error) {
      this.recordFailure(nodeId);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess(nodeId: string): void {
    const state = this.getState(nodeId);
    state.successCount++;
    state.lastSuccessAt = Date.now();
    state.totalRequests++;

    if (state.state === CircuitState.HALF_OPEN) {
      if (state.successCount >= this.config.successThreshold) {
        this.transitionToClosed(nodeId);
      }
    } else if (state.state === CircuitState.CLOSED) {
      // Reset failure count on success
      state.failureCount = 0;
    }

    this.states.set(nodeId, state);
  }

  /**
   * Record failed operation
   */
  recordFailure(nodeId: string): void {
    const state = this.getState(nodeId);
    state.failureCount++;
    state.totalFailures++;
    state.lastFailureAt = Date.now();
    state.totalRequests++;

    if (state.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionToOpen(nodeId);
    } else if (state.state === CircuitState.CLOSED) {
      if (this.shouldTrip(state)) {
        this.transitionToOpen(nodeId);
      }
    }

    this.states.set(nodeId, state);
  }

  /**
   * Manually trip circuit breaker
   */
  trip(nodeId: string): void {
    this.transitionToOpen(nodeId);
  }

  /**
   * Manually reset circuit breaker
   */
  reset(nodeId: string): void {
    this.transitionToClosed(nodeId);
  }

  /**
   * Get current state of circuit breaker
   */
  getState(nodeId: string): CircuitBreakerState {
    if (!this.states.has(nodeId)) {
      this.states.set(nodeId, {
        nodeId,
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        totalRequests: 0,
        totalFailures: 0,
      });
    }
    return this.states.get(nodeId)!;
  }

  /**
   * Check if circuit should trip to OPEN
   */
  private shouldTrip(state: CircuitBreakerState): boolean {
    // Need minimum volume of requests
    if (state.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    if (state.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check error percentage
    const errorPercentage = (state.totalFailures / state.totalRequests) * 100;
    return errorPercentage >= this.config.errorThresholdPercentage;
  }

  /**
   * Check if should attempt reset from OPEN to HALF_OPEN
   */
  private shouldAttemptReset(state: CircuitBreakerState): boolean {
    if (!state.nextAttemptAt) {
      return true;
    }
    return Date.now() >= state.nextAttemptAt;
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(nodeId: string): void {
    const state = this.getState(nodeId);
    state.state = CircuitState.CLOSED;
    state.failureCount = 0;
    state.successCount = 0;
    state.nextAttemptAt = undefined;
    this.states.set(nodeId, state);
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(nodeId: string): void {
    const state = this.getState(nodeId);
    state.state = CircuitState.OPEN;
    state.failureCount = 0;
    state.successCount = 0;
    state.nextAttemptAt = Date.now() + this.config.timeout;
    this.states.set(nodeId, state);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(nodeId: string): void {
    const state = this.getState(nodeId);
    state.state = CircuitState.HALF_OPEN;
    state.failureCount = 0;
    state.successCount = 0;
    this.states.set(nodeId, state);
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates(): Map<string, CircuitBreakerState> {
    return new Map(this.states);
  }

  /**
   * Get statistics for a node
   */
  getStatistics(nodeId: string): {
    state: CircuitState;
    totalRequests: number;
    totalFailures: number;
    errorRate: number;
    uptime: number;
  } {
    const state = this.getState(nodeId);
    const errorRate = state.totalRequests > 0 ? state.totalFailures / state.totalRequests : 0;
    const uptime = state.state === CircuitState.CLOSED ? 1 : 0;

    return {
      state: state.state,
      totalRequests: state.totalRequests,
      totalFailures: state.totalFailures,
      errorRate,
      uptime,
    };
  }

  /**
   * Clear state for a node
   */
  clearState(nodeId: string): void {
    this.states.delete(nodeId);
  }

  /**
   * Clear all states
   */
  clearAllStates(): void {
    this.states.clear();
  }
}
