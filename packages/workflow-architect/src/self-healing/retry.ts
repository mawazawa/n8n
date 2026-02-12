import type { RetryConfig } from './types.js';
import { RetryConfigSchema } from './types.js';

/**
 * Intelligent Retry Manager
 *
 * Implements exponential backoff with jitter and per-error-type strategies.
 */
export class RetryManager {
  private readonly config: RetryConfig;
  private readonly retryAttempts: Map<string, number> = new Map();

  constructor(config?: Partial<RetryConfig>) {
    const defaultConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      jitter: true,
    };

    this.config = RetryConfigSchema.parse({
      ...defaultConfig,
      ...config,
    });
  }

  /**
   * Retry an operation with exponential backoff
   */
  async retry<T>(
    operationId: string,
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = config
      ? RetryConfigSchema.parse({ ...this.config, ...config })
      : this.config;

    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
      try {
        // Check timeout
        if (retryConfig.timeout && Date.now() - startTime > retryConfig.timeout) {
          throw new Error('Retry timeout exceeded');
        }

        const result = await operation();

        // Success - clear retry attempts
        this.retryAttempts.delete(operationId);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Check if error is retryable
        if (!this.isRetryableError(lastError, retryConfig)) {
          throw lastError;
        }

        // Don't wait after last attempt
        if (attempt < retryConfig.maxAttempts - 1) {
          const delay = this.calculateDelay(attempt, retryConfig);
          await this.sleep(delay);
        }

        // Track retry attempts
        this.retryAttempts.set(operationId, attempt + 1);
      }
    }

    throw lastError || new Error('Max retry attempts exceeded');
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      // Add random jitter: delay * (0.5 to 1.5)
      const jitterFactor = 0.5 + Math.random();
      delay = delay * jitterFactor;
    }

    return delay;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error, config: RetryConfig): boolean {
    if (!config.retryableErrors || config.retryableErrors.length === 0) {
      // Retry all errors by default
      return true;
    }

    const errorMessage = error.message.toLowerCase();
    return config.retryableErrors.some((retryableError) =>
      errorMessage.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Get retry attempts for an operation
   */
  getRetryAttempts(operationId: string): number {
    return this.retryAttempts.get(operationId) || 0;
  }

  /**
   * Reset retry attempts for an operation
   */
  resetRetryAttempts(operationId: string): void {
    this.retryAttempts.delete(operationId);
  }

  /**
   * Get all retry statistics
   */
  getStatistics(): Map<string, number> {
    return new Map(this.retryAttempts);
  }

  /**
   * Clear all retry statistics
   */
  clearStatistics(): void {
    this.retryAttempts.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Retry with condition
 */
export async function retryWithCondition<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: Error, attempt: number) => boolean,
  maxAttempts = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (!shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Retry until condition met
 */
export async function retryUntil<T>(
  operation: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxAttempts?: number;
    delay?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 10;
  const delay = options.delay || 1000;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check timeout
    if (options.timeout && Date.now() - startTime > options.timeout) {
      throw new Error('Retry timeout exceeded');
    }

    const result = await operation();
    if (condition(result)) {
      return result;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Condition not met after max attempts');
}
