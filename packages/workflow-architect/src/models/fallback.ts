/**
 * Model Fallback System
 * Implements retry logic with fallback to secondary models
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { ModelRouter, type ModelId } from './router.js';
import { getLatencyMonitor } from './latency-monitor.js';

export interface FallbackConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  exponentialBackoff: boolean;
  fallbackChain: ModelId[];
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number; // milliseconds
}

export interface RetryOptions {
  attempt: number;
  maxAttempts: number;
  error: Error;
  modelId: ModelId;
}

export interface FallbackResult<T> {
  result: T;
  modelUsed: ModelId;
  attempts: number;
  errors: Array<{ modelId: ModelId; error: Error }>;
  totalLatency: number;
}

const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  fallbackChain: ['claude-sonnet-4', 'gpt-4o', 'gemini-2-flash'],
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 5,
  circuitBreakerResetTime: 60000, // 1 minute
};

export class ModelFallbackSystem {
  private config: FallbackConfig;
  private router: ModelRouter;
  private circuitState: Map<ModelId, {
    failures: number;
    lastFailure: Date;
    isOpen: boolean;
  }> = new Map();

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.router = new ModelRouter();
  }

  /**
   * Execute with fallback and retry
   */
  async executeWithFallback<T>(
    fn: (model: BaseChatModel) => Promise<T>,
    options?: {
      preferredModel?: ModelId;
      fallbackChain?: ModelId[];
      maxRetries?: number;
    }
  ): Promise<FallbackResult<T>> {
    const maxRetries = options?.maxRetries ?? this.config.maxRetries;
    const fallbackChain = options?.fallbackChain ?? this.config.fallbackChain;
    const preferredModel = options?.preferredModel ?? fallbackChain[0];

    const errors: Array<{ modelId: ModelId; error: Error }> = [];
    const startTime = Date.now();

    // Try preferred model first
    let modelsToTry = [preferredModel, ...fallbackChain.filter(m => m !== preferredModel)];

    for (const modelId of modelsToTry) {
      // Check circuit breaker
      if (this.isCircuitOpen(modelId)) {
        console.log(`[Fallback] Circuit breaker open for ${modelId}, skipping`);
        continue;
      }

      // Try this model with retries
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const model = this.router.getModel(modelId);
          const latencyMonitor = getLatencyMonitor();

          const requestId = `${modelId}-${Date.now()}`;
          latencyMonitor.startRequest(requestId, modelId);

          const result = await fn(model);

          latencyMonitor.endRequest(requestId, modelId);

          // Success - reset circuit breaker
          this.recordSuccess(modelId);

          return {
            result,
            modelUsed: modelId,
            attempts: errors.length + attempt,
            errors,
            totalLatency: Date.now() - startTime,
          };
        } catch (error) {
          const err = error as Error;
          console.warn(`[Fallback] Attempt ${attempt}/${maxRetries} failed for ${modelId}: ${err.message}`);

          errors.push({ modelId, error: err });
          this.recordFailure(modelId);

          // If not the last attempt, wait before retrying
          if (attempt < maxRetries) {
            await this.delay(this.calculateRetryDelay(attempt));
          }
        }
      }
    }

    // All models failed
    throw new Error(
      `All models failed after ${errors.length} attempts. Last error: ${
        errors[errors.length - 1]?.error.message
      }`
    );
  }

  /**
   * Invoke model with fallback
   */
  async invokeWithFallback(
    messages: BaseMessage[],
    options?: {
      preferredModel?: ModelId;
      fallbackChain?: ModelId[];
    }
  ): Promise<FallbackResult<BaseMessage>> {
    return this.executeWithFallback(
      async (model) => {
        const response = await model.invoke(messages);
        return response;
      },
      options
    );
  }

  /**
   * Stream with fallback
   */
  async streamWithFallback(
    messages: BaseMessage[],
    options?: {
      preferredModel?: ModelId;
      fallbackChain?: ModelId[];
      onChunk?: (chunk: unknown) => void;
    }
  ): Promise<FallbackResult<BaseMessage>> {
    return this.executeWithFallback(
      async (model) => {
        const stream = await model.stream(messages);
        const chunks: unknown[] = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
          if (options?.onChunk) {
            options.onChunk(chunk);
          }
        }

        // Combine chunks into final message
        // This is a simplified version - actual implementation would be more complex
        return chunks[chunks.length - 1] as BaseMessage;
      },
      options
    );
  }

  /**
   * Check if circuit breaker is open for a model
   */
  private isCircuitOpen(modelId: ModelId): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    const state = this.circuitState.get(modelId);
    if (!state) {
      return false;
    }

    // Check if circuit should be reset
    const timeSinceLastFailure = Date.now() - state.lastFailure.getTime();
    if (timeSinceLastFailure > (this.config.circuitBreakerResetTime || 60000)) {
      // Reset circuit
      this.circuitState.delete(modelId);
      return false;
    }

    return state.isOpen;
  }

  /**
   * Record a successful request
   */
  private recordSuccess(modelId: ModelId): void {
    // Reset circuit breaker state
    this.circuitState.delete(modelId);
  }

  /**
   * Record a failed request
   */
  private recordFailure(modelId: ModelId): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    const state = this.circuitState.get(modelId) || {
      failures: 0,
      lastFailure: new Date(),
      isOpen: false,
    };

    state.failures += 1;
    state.lastFailure = new Date();

    // Open circuit if threshold exceeded
    const threshold = this.config.circuitBreakerThreshold || 5;
    if (state.failures >= threshold) {
      state.isOpen = true;
      console.warn(`[Fallback] Circuit breaker opened for ${modelId} after ${state.failures} failures`);
    }

    this.circuitState.set(modelId, state);
  }

  /**
   * Calculate retry delay with optional exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.retryDelay;
    }

    // Exponential backoff: delay * 2^(attempt-1)
    return this.config.retryDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker status for all models
   */
  getCircuitStatus(): Record<string, {
    failures: number;
    isOpen: boolean;
    lastFailure?: string;
  }> {
    const status: Record<string, {
      failures: number;
      isOpen: boolean;
      lastFailure?: string;
    }> = {};

    for (const [modelId, state] of this.circuitState.entries()) {
      status[modelId] = {
        failures: state.failures,
        isOpen: state.isOpen,
        lastFailure: state.lastFailure.toISOString(),
      };
    }

    return status;
  }

  /**
   * Manually reset circuit breaker for a model
   */
  resetCircuit(modelId: ModelId): void {
    this.circuitState.delete(modelId);
    console.log(`[Fallback] Circuit breaker manually reset for ${modelId}`);
  }

  /**
   * Manually reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuitState.clear();
    console.log('[Fallback] All circuit breakers manually reset');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FallbackConfig {
    return { ...this.config };
  }
}

// Singleton instance
let fallbackInstance: ModelFallbackSystem | null = null;

export function getFallbackSystem(config?: Partial<FallbackConfig>): ModelFallbackSystem {
  if (!fallbackInstance || config) {
    fallbackInstance = new ModelFallbackSystem(config);
  }
  return fallbackInstance;
}

/**
 * Utility function to execute with automatic fallback
 */
export async function withFallback<T>(
  fn: (model: BaseChatModel) => Promise<T>,
  options?: {
    preferredModel?: ModelId;
    maxRetries?: number;
  }
): Promise<T> {
  const system = getFallbackSystem();
  const result = await system.executeWithFallback(fn, options);
  return result.result;
}
