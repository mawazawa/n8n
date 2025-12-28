/**
 * Request Timeout Middleware
 * Implements 30-second timeout with graceful cancellation
 */

import type { Request, Response, NextFunction } from 'express';
import { TimeoutError } from '../errors/index.js';

interface TimeoutConfig {
  timeout: number; // Timeout in milliseconds
  onTimeout?: (req: Request) => void; // Callback when timeout occurs
  message?: string; // Custom timeout message
}

/**
 * Express middleware for request timeout
 */
export function timeoutMiddleware(config: TimeoutConfig = { timeout: 30000 }) {
  const { timeout, onTimeout, message } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if response already sent
    if (res.headersSent) {
      return next();
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      // Skip if response already sent
      if (res.headersSent) {
        return;
      }

      // Call optional callback
      onTimeout?.(req);

      // Create timeout error
      const error = new TimeoutError(message || 'Request timeout', {
        url: req.url,
        method: req.method,
        timeout,
      });

      // Send timeout response
      res.status(408).json({
        error: {
          code: error.code,
          message: error.message,
          timeout: timeout / 1000, // Convert to seconds
        },
      });

      // Emit timeout event on request
      req.emit('timeout');
    }, timeout);

    // Clean up timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeoutId);
    });

    // Clean up timeout on error
    res.on('close', () => {
      clearTimeout(timeoutId);
    });

    next();
  };
}

/**
 * AbortController wrapper for async operations with timeout
 */
export class TimeoutController {
  private controller: AbortController;
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly timeout: number;

  constructor(timeout: number = 30000) {
    this.controller = new AbortController();
    this.timeout = timeout;
  }

  /**
   * Get the abort signal
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Start the timeout
   */
  start(): void {
    this.timeoutId = setTimeout(() => {
      this.controller.abort();
    }, this.timeout);
  }

  /**
   * Cancel the timeout
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Check if aborted
   */
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /**
   * Manually abort
   */
  abort(): void {
    this.cancel();
    this.controller.abort();
  }
}

/**
 * Execute async function with timeout
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeout: number = 30000,
  errorMessage?: string,
): Promise<T> {
  const controller = new TimeoutController(timeout);

  try {
    controller.start();

    const result = await fn(controller.signal);

    controller.cancel();

    return result;
  } catch (error) {
    controller.cancel();

    // Check if it was a timeout
    if (controller.aborted) {
      throw new TimeoutError(errorMessage || 'Operation timed out', {
        timeout,
        originalError: error,
      });
    }

    throw error;
  }
}

/**
 * Race with timeout
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeout: number = 30000,
  errorMessage?: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(errorMessage || 'Operation timed out', { timeout }));
    }, timeout);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Debounced timeout - resets timeout on each call
 */
export class DebouncedTimeout {
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly callback: () => void;
  private readonly timeout: number;

  constructor(callback: () => void, timeout: number) {
    this.callback = callback;
    this.timeout = timeout;
  }

  /**
   * Reset and start the timeout
   */
  reset(): void {
    this.cancel();
    this.timeoutId = setTimeout(() => {
      this.callback();
      this.timeoutId = null;
    }, this.timeout);
  }

  /**
   * Cancel the timeout
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Check if active
   */
  get active(): boolean {
    return this.timeoutId !== null;
  }
}

/**
 * Standard timeout middleware (30 seconds)
 */
export const standardTimeout = timeoutMiddleware({
  timeout: 30000, // 30 seconds
});

/**
 * Long timeout for file uploads, processing, etc. (5 minutes)
 */
export const longTimeout = timeoutMiddleware({
  timeout: 5 * 60 * 1000, // 5 minutes
});

/**
 * Short timeout for quick operations (5 seconds)
 */
export const shortTimeout = timeoutMiddleware({
  timeout: 5000, // 5 seconds
});

export default timeoutMiddleware;
