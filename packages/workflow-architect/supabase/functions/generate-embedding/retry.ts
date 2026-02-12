/**
 * Retry logic with exponential backoff for embedding generation
 * Implements robust error handling and retry strategies
 */

import { EMBEDDING_CONFIG, ERROR_MESSAGES } from './config.ts';

/**
 * Error types that should be retried
 */
export enum RetryableErrorType {
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
}

/**
 * Error types that should NOT be retried
 */
export enum NonRetryableErrorType {
  INVALID_API_KEY = 'invalid_api_key',
  INVALID_INPUT = 'invalid_input',
  QUOTA_EXCEEDED = 'quota_exceeded',
}

export interface RetryError extends Error {
  type: RetryableErrorType | NonRetryableErrorType;
  statusCode?: number;
  retryAfter?: number;
  attempt?: number;
}

/**
 * Determines if an error is retryable based on status code and error message
 */
export function isRetryableError(error: Error | RetryError, statusCode?: number): boolean {
  // Check if error already has retry type
  if ('type' in error) {
    const retryError = error as RetryError;
    return Object.values(RetryableErrorType).includes(retryError.type as RetryableErrorType);
  }

  // Classify by HTTP status code
  if (statusCode) {
    // 429: Rate limit
    if (statusCode === 429) return true;
    // 5xx: Server errors
    if (statusCode >= 500 && statusCode < 600) return true;
    // 408: Request timeout
    if (statusCode === 408) return true;
    // 4xx (except 429): Client errors - not retryable
    if (statusCode >= 400 && statusCode < 500) return false;
  }

  // Check error message for common patterns
  const message = error.message.toLowerCase();

  // Rate limiting errors
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  ) {
    return true;
  }

  // Server errors
  if (message.includes('internal server error') || message.includes('service unavailable')) {
    return true;
  }

  // Not retryable by default
  return false;
}

/**
 * Calculates exponential backoff delay with jitter
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = EMBEDDING_CONFIG.retryDelayMs): number {
  // Exponential backoff: delay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Add jitter (random 0-25% variation) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * Math.random();

  // Cap at 30 seconds
  return Math.min(exponentialDelay + jitter, 30000);
}

/**
 * Sleeps for a specified duration
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses Retry-After header from response
 * Returns delay in milliseconds
 */
export function parseRetryAfter(retryAfter?: string): number | null {
  if (!retryAfter) return null;

  // If it's a number, it's seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // If it's a date, calculate difference
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (error: Error, attempt: number) => void;
    shouldRetry?: (error: Error) => boolean;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? EMBEDDING_CONFIG.maxRetries;
  const baseDelay = options.baseDelay ?? EMBEDDING_CONFIG.retryDelayMs;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(lastError)
        : isRetryableError(lastError);

      // Don't retry on last attempt or if error is not retryable
      if (attempt === maxRetries || !shouldRetry) {
        throw createRetryError(lastError, attempt);
      }

      // Calculate delay
      let delay = calculateBackoffDelay(attempt, baseDelay);

      // Check for Retry-After header
      if ('retryAfter' in lastError && lastError.retryAfter) {
        const retryAfter = parseRetryAfter(String(lastError.retryAfter));
        if (retryAfter !== null) {
          delay = retryAfter;
        }
      }

      // Call retry callback
      if (options.onRetry) {
        options.onRetry(lastError, attempt + 1);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw createRetryError(lastError!, maxRetries);
}

/**
 * Creates a retry error with metadata
 */
function createRetryError(error: Error, attempt: number): RetryError {
  const retryError = error as RetryError;
  retryError.attempt = attempt;

  if (!retryError.type) {
    retryError.type = NonRetryableErrorType.INVALID_INPUT;
  }

  return retryError;
}

/**
 * Wraps fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: Parameters<typeof withRetry>[1] = {},
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

      // Check for retryable HTTP errors
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as RetryError;
        error.statusCode = response.status;

        // Extract Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          error.retryAfter = parseRetryAfter(retryAfter) ?? undefined;
        }

        // Classify error type
        if (response.status === 429) {
          error.type = RetryableErrorType.RATE_LIMIT;
        } else if (response.status >= 500) {
          error.type = RetryableErrorType.SERVER_ERROR;
        } else if (response.status === 408) {
          error.type = RetryableErrorType.TIMEOUT;
        } else if (response.status === 401 || response.status === 403) {
          error.type = NonRetryableErrorType.INVALID_API_KEY;
        } else if (response.status === 400) {
          error.type = NonRetryableErrorType.INVALID_INPUT;
        } else if (response.status === 402) {
          error.type = NonRetryableErrorType.QUOTA_EXCEEDED;
        }

        throw error;
      }

      return response;
    },
    {
      ...retryOptions,
      shouldRetry: (error) => {
        if (retryOptions.shouldRetry) {
          return retryOptions.shouldRetry(error);
        }
        const retryError = error as RetryError;
        return isRetryableError(retryError, retryError.statusCode);
      },
    },
  );
}

/**
 * Batch processing with retry for individual items
 */
export async function processBatchWithRetry<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    onItemError?: (item: T, error: Error) => void;
    onItemSuccess?: (item: T, result: R) => void;
    continueOnError?: boolean;
  } = {},
): Promise<{ results: R[]; errors: Array<{ item: T; error: Error }> }> {
  const batchSize = options.batchSize ?? EMBEDDING_CONFIG.batchSize;
  const continueOnError = options.continueOnError ?? true;

  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    for (const item of batch) {
      try {
        const result = await processFn(item);
        results.push(result);

        if (options.onItemSuccess) {
          options.onItemSuccess(item, result);
        }
      } catch (error) {
        const err = error as Error;
        errors.push({ item, error: err });

        if (options.onItemError) {
          options.onItemError(item, err);
        }

        if (!continueOnError) {
          throw err;
        }
      }
    }
  }

  return { results, errors };
}
