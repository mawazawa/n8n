/**
 * Rate Limiting Middleware
 * Implements sliding window rate limiting with 100 requests per minute per user
 */

import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../errors/index.js';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Function to generate rate limit key
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitEntry {
  timestamps: number[];
  count: number;
}

class RateLimiter {
  private readonly store: Map<string, RateLimitEntry>;
  private readonly config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.store = new Map();
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
    };

    // Start cleanup interval to remove old entries
    this.startCleanup();
  }

  private defaultKeyGenerator(req: Request): string {
    // Use user ID from auth, fallback to IP address
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // Get IP from various headers (reverse proxy aware)
    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.headers['x-real-ip']?.toString() ||
      req.socket.remoteAddress ||
      'unknown';

    return `ip:${ip}`;
  }

  private startCleanup(): void {
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.config.windowMs;

      for (const [key, entry] of this.store.entries()) {
        // Remove timestamps outside the window
        entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
        entry.count = entry.timestamps.length;

        // Remove entry if no recent requests
        if (entry.timestamps.length === 0) {
          this.store.delete(key);
        }
      }
    }, 60000); // Run every minute

    // Prevent the interval from keeping the process alive
    this.cleanupInterval.unref();
  }

  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  public checkLimit(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    // Get or create entry
    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [], count: 0 };
      this.store.set(key, entry);
    }

    // Remove old timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    entry.count = entry.timestamps.length;

    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      // Calculate retry after (oldest timestamp + window - now)
      const oldestTimestamp = entry.timestamps[0] || now;
      const retryAfter = Math.ceil((oldestTimestamp + this.config.windowMs - now) / 1000);

      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    // Add current timestamp
    entry.timestamps.push(now);
    entry.count++;

    return { allowed: true };
  }

  public resetKey(key: string): void {
    this.store.delete(key);
  }

  public getStats(key: string): { count: number; limit: number; remaining: number } {
    const entry = this.store.get(key);
    const count = entry?.count || 0;
    const remaining = Math.max(0, this.config.maxRequests - count);

    return {
      count,
      limit: this.config.maxRequests,
      remaining,
    };
  }
}

// Default rate limiter instance (100 req/min)
const defaultLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(config?: Partial<RateLimitConfig>) {
  const limiter = config
    ? new RateLimiter({
        windowMs: config.windowMs || 60 * 1000,
        maxRequests: config.maxRequests || 100,
        ...config,
      })
    : defaultLimiter;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = limiter['config'].keyGenerator(req);
    const { allowed, retryAfter } = limiter.checkLimit(key);

    // Add rate limit headers
    const stats = limiter.getStats(key);
    res.setHeader('X-RateLimit-Limit', stats.limit);
    res.setHeader('X-RateLimit-Remaining', stats.remaining);
    res.setHeader('X-RateLimit-Reset', Date.now() + (config?.windowMs || 60000));

    if (!allowed) {
      res.setHeader('Retry-After', retryAfter || 60);

      const error = new RateLimitError(
        'Rate limit exceeded. Please slow down your requests.',
        retryAfter,
        { key, limit: stats.limit },
      );

      return res.status(429).json({
        error: {
          code: error.code,
          message: error.message,
          retryAfter,
          limit: stats.limit,
        },
      });
    }

    next();
  };
}

/**
 * Create a custom rate limiter
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Strict rate limiter for sensitive endpoints (e.g., authentication)
 */
export const strictRateLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 requests per 15 minutes
});

/**
 * Standard rate limiter (100 req/min)
 */
export const standardRateLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

/**
 * Relaxed rate limiter for public endpoints
 */
export const relaxedRateLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 300,
});

export { RateLimiter };
export default rateLimitMiddleware;
