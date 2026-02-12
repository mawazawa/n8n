import type { Request, Response, NextFunction } from 'express';
import type { QuotaManager } from './manager';
import type { RateLimiter } from './limiter';
import type { QuotaType } from './types';

/**
 * Extended Express request with user information
 */
export interface AuthenticatedRequest extends Request {
	user?: {
		id: string;
		email: string;
		roles?: string[];
	};
}

/**
 * Configuration for quota middleware
 */
export interface QuotaMiddlewareConfig {
	/** Quota manager instance */
	quotaManager: QuotaManager;
	/** Rate limiter instance (optional) */
	rateLimiter?: RateLimiter;
	/** Amount to increment (default: 1) */
	amount?: number;
	/** Whether to auto-increment on success (default: true) */
	autoIncrement?: boolean;
	/** Whether to bypass for admin users (default: true) */
	bypassAdmin?: boolean;
	/** Custom error message */
	errorMessage?: string;
}

/**
 * Configuration for rate limit middleware
 */
export interface RateLimitMiddlewareConfig {
	/** Rate limiter instance */
	rateLimiter: RateLimiter;
	/** Maximum requests allowed */
	limit: number;
	/** Time window in milliseconds */
	windowMs: number;
	/** Key generator function (default: user ID) */
	keyGenerator?: (req: AuthenticatedRequest) => string;
	/** Whether to bypass for admin users (default: true) */
	bypassAdmin?: boolean;
	/** Custom error message */
	errorMessage?: string;
}

/**
 * Create Express middleware for quota enforcement
 *
 * Checks if the user has sufficient quota before allowing the request.
 * Automatically increments usage if the request succeeds.
 *
 * @param quotaType - Type of quota to enforce
 * @param config - Middleware configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const quotaManager = new QuotaManager({ supabase });
 *
 * app.post('/workflows',
 *   quotaMiddleware(QuotaType.WORKFLOWS, { quotaManager }),
 *   async (req, res) => {
 *     // Create workflow
 *     res.json({ success: true });
 *   }
 * );
 * ```
 */
export function quotaMiddleware(
	quotaType: QuotaType,
	config: QuotaMiddlewareConfig,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const {
		quotaManager,
		amount = 1,
		autoIncrement = true,
		bypassAdmin = true,
		errorMessage,
	} = config;

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const authReq = req as AuthenticatedRequest;

		// Check if user is authenticated
		if (!authReq.user?.id) {
			res.status(401).json({
				error: 'Unauthorized',
				message: 'Authentication required',
			});
			return;
		}

		// Bypass quota check for admin users
		if (bypassAdmin && authReq.user.roles?.includes('admin')) {
			next();
			return;
		}

		try {
			// Check quota
			const result = await quotaManager.checkQuota(authReq.user.id, quotaType, amount);

			if (!result.allowed) {
				const retryAfter = result.retryAfter
					? Math.ceil((result.retryAfter.getTime() - Date.now()) / 1000)
					: undefined;

				res.status(429)
					.header('X-RateLimit-Limit', result.quota.limit.toString())
					.header('X-RateLimit-Remaining', result.quota.remaining.toString())
					.header('X-RateLimit-Reset', result.quota.resetsAt.toISOString());

				if (retryAfter !== undefined) {
					res.header('Retry-After', retryAfter.toString());
				}

				res.json({
					error: 'Quota Exceeded',
					message: errorMessage ?? result.reason ?? `Quota exceeded for ${quotaType}`,
					quota: result.quota,
					retryAfter: result.retryAfter?.toISOString(),
				});
				return;
			}

			// Auto-increment usage if enabled
			if (autoIncrement) {
				// Increment after response is sent to avoid blocking
				res.on('finish', () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						quotaManager.incrementUsage(authReq.user!.id, quotaType, amount).catch((err) => {
							console.error('Failed to increment quota usage:', err);
						});
					}
				});
			}

			// Add quota info to response headers
			res.header('X-Quota-Type', quotaType);
			res.header('X-Quota-Limit', result.quota.limit.toString());
			res.header('X-Quota-Remaining', result.quota.remaining.toString());
			res.header('X-Quota-Reset', result.quota.resetsAt.toISOString());

			next();
		} catch (error) {
			console.error('Quota enforcement error:', error);
			res.status(500).json({
				error: 'Internal Server Error',
				message: 'Failed to check quota',
			});
		}
	};
}

/**
 * Create Express middleware for rate limiting
 *
 * Enforces rate limits using a sliding window algorithm.
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const rateLimiter = new RateLimiter();
 *
 * app.use('/api',
 *   rateLimitMiddleware({
 *     rateLimiter,
 *     limit: 100,
 *     windowMs: 60000, // 1 minute
 *   })
 * );
 * ```
 */
export function rateLimitMiddleware(
	config: RateLimitMiddlewareConfig,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const {
		rateLimiter,
		limit,
		windowMs,
		keyGenerator = (req: AuthenticatedRequest) => req.user?.id ?? req.ip ?? 'anonymous',
		bypassAdmin = true,
		errorMessage,
	} = config;

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const authReq = req as AuthenticatedRequest;

		// Bypass rate limit for admin users
		if (bypassAdmin && authReq.user?.roles?.includes('admin')) {
			next();
			return;
		}

		try {
			const key = keyGenerator(authReq);

			// Check rate limit
			const result = await rateLimiter.checkLimit(key, limit, windowMs);

			// Add rate limit headers
			res.header('X-RateLimit-Limit', result.limit.toString());
			res.header('X-RateLimit-Remaining', Math.max(0, result.limit - result.current).toString());
			res.header('X-RateLimit-Reset', result.resetsAt.toISOString());

			if (!result.allowed) {
				res.header('Retry-After', result.retryAfter.toString());

				res.status(429).json({
					error: 'Rate Limit Exceeded',
					message: errorMessage ?? 'Too many requests. Please try again later.',
					retryAfter: result.retryAfter,
					limit: result.limit,
					current: result.current,
				});
				return;
			}

			// Increment the counter
			await rateLimiter.increment(key);

			next();
		} catch (error) {
			console.error('Rate limit error:', error);
			// Fail open: allow the request if rate limiting fails
			next();
		}
	};
}

/**
 * Create middleware that combines quota and rate limit checks
 *
 * @param quotaType - Type of quota to enforce
 * @param quotaConfig - Quota middleware configuration
 * @param rateLimitConfig - Rate limit middleware configuration (optional)
 * @returns Express middleware function
 */
export function combinedMiddleware(
	quotaType: QuotaType,
	quotaConfig: QuotaMiddlewareConfig,
	rateLimitConfig?: RateLimitMiddlewareConfig,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const quotaMw = quotaMiddleware(quotaType, quotaConfig);
	const rateLimitMw = rateLimitConfig ? rateLimitMiddleware(rateLimitConfig) : null;

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		// Apply rate limit first if configured
		if (rateLimitMw) {
			await new Promise<void>((resolve, reject) => {
				rateLimitMw(req, res, (err?: unknown) => {
					if (err) {
						reject(err);
					} else if (res.headersSent) {
						// Rate limit rejected the request
						resolve();
					} else {
						resolve();
					}
				});
			});

			// If response was sent (rate limit exceeded), stop here
			if (res.headersSent) {
				return;
			}
		}

		// Apply quota check
		await quotaMw(req, res, next);
	};
}

/**
 * Manually increment quota usage
 *
 * Use this in routes where auto-increment is disabled or
 * you need to increment by a custom amount.
 *
 * @param quotaManager - Quota manager instance
 * @param userId - User identifier
 * @param quotaType - Type of quota
 * @param amount - Amount to increment
 *
 * @example
 * ```typescript
 * await incrementQuota(quotaManager, req.user.id, QuotaType.STORAGE, fileSize);
 * ```
 */
export async function incrementQuota(
	quotaManager: QuotaManager,
	userId: string,
	quotaType: QuotaType,
	amount = 1,
): Promise<void> {
	await quotaManager.incrementUsage(userId, quotaType, amount);
}

/**
 * Check quota without middleware
 *
 * Use this for imperative quota checks in your code.
 *
 * @param quotaManager - Quota manager instance
 * @param userId - User identifier
 * @param quotaType - Type of quota
 * @param amount - Amount to check
 * @returns Whether the quota check passed
 *
 * @example
 * ```typescript
 * if (!await checkQuota(quotaManager, req.user.id, QuotaType.WORKFLOWS)) {
 *   throw new Error('Workflow quota exceeded');
 * }
 * ```
 */
export async function checkQuota(
	quotaManager: QuotaManager,
	userId: string,
	quotaType: QuotaType,
	amount = 1,
): Promise<boolean> {
	const result = await quotaManager.checkQuota(userId, quotaType, amount);
	return result.allowed;
}
