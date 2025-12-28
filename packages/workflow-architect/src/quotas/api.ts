import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { QuotaManager } from './manager';
import type { PlanManager } from './plans';
import type { QuotaOverrideManager } from './overrides';
import type { ReportGenerator } from './reporting';
import type { UsageTracker } from './tracking';
import {
	QuotaTypeSchema,
	SetOverrideRequestSchema,
	UsageReportRequestSchema,
	type QuotaType,
} from './types';

/**
 * Extended request with user information
 */
interface AuthenticatedRequest extends Request {
	user?: {
		id: string;
		email: string;
		roles?: string[];
	};
}

/**
 * Configuration for quota API
 */
export interface QuotaApiConfig {
	/** Quota manager instance */
	quotaManager: QuotaManager;
	/** Plan manager instance */
	planManager: PlanManager;
	/** Override manager instance */
	overrideManager: QuotaOverrideManager;
	/** Report generator instance */
	reportGenerator: ReportGenerator;
	/** Usage tracker instance */
	usageTracker: UsageTracker;
}

/**
 * Create Express router for quota management API
 *
 * Provides REST endpoints for:
 * - Getting user quotas
 * - Viewing usage statistics
 * - Managing plans and subscriptions
 * - Setting quota overrides (admin)
 * - Generating usage reports
 *
 * @param config - API configuration
 * @returns Express router
 *
 * @example
 * ```typescript
 * const quotaApi = createQuotaApi({
 *   quotaManager,
 *   planManager,
 *   overrideManager,
 *   reportGenerator,
 *   usageTracker,
 * });
 *
 * app.use('/api/quotas', quotaApi);
 * ```
 */
export function createQuotaApi(config: QuotaApiConfig): Router {
	const router = Router();
	const { quotaManager, planManager, overrideManager, reportGenerator, usageTracker } = config;

	/**
	 * GET /quotas
	 * Get all quotas for the current user
	 */
	router.get('/', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const quotas = await quotaManager.getQuotas(authReq.user.id);
			res.json({ quotas });
		} catch (error) {
			console.error('Failed to get quotas:', error);
			res.status(500).json({ error: 'Failed to get quotas' });
		}
	});

	/**
	 * GET /quotas/:type
	 * Get quota for a specific type
	 */
	router.get('/:type', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const quotaType = QuotaTypeSchema.parse(req.params.type);
			const result = await quotaManager.checkQuota(authReq.user.id, quotaType);

			res.json({
				quota: result.quota,
				allowed: result.allowed,
				reason: result.reason,
			});
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid quota type' });
				return;
			}
			console.error('Failed to get quota:', error);
			res.status(500).json({ error: 'Failed to get quota' });
		}
	});

	/**
	 * GET /quotas/:type/usage
	 * Get usage statistics for a quota type
	 */
	router.get('/:type/usage', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const quotaType = QuotaTypeSchema.parse(req.params.type);
			const period = (req.query.period as string) ?? 'month';

			const usage = await usageTracker.getUsage(
				authReq.user.id,
				quotaType,
				period as 'minute' | 'hour' | 'day' | 'month',
			);

			res.json({ usage });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid quota type' });
				return;
			}
			console.error('Failed to get usage:', error);
			res.status(500).json({ error: 'Failed to get usage' });
		}
	});

	/**
	 * GET /plans
	 * Get all available plans
	 */
	router.get('/plans', async (req: Request, res: Response) => {
		try {
			const plans = await planManager.getPlans();
			res.json({ plans });
		} catch (error) {
			console.error('Failed to get plans:', error);
			res.status(500).json({ error: 'Failed to get plans' });
		}
	});

	/**
	 * GET /plans/current
	 * Get current user's plan
	 */
	router.get('/plans/current', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const plan = await planManager.getUserPlan(authReq.user.id);
			res.json({ plan });
		} catch (error) {
			console.error('Failed to get user plan:', error);
			res.status(500).json({ error: 'Failed to get user plan' });
		}
	});

	/**
	 * POST /plans/:id/subscribe
	 * Subscribe to a plan
	 */
	router.post('/plans/:id/subscribe', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const planId = req.params.id;
			await planManager.upgradePlan(authReq.user.id, planId);

			res.json({ success: true, message: `Subscribed to plan ${planId}` });
		} catch (error) {
			console.error('Failed to subscribe to plan:', error);
			res.status(500).json({ error: 'Failed to subscribe to plan' });
		}
	});

	/**
	 * GET /usage/report
	 * Generate usage report
	 */
	router.get('/usage/report', async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			if (!authReq.user?.id) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const { startDate, endDate } = UsageReportRequestSchema.parse({
				userId: authReq.user.id,
				startDate: req.query.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
				endDate: req.query.endDate ?? new Date(),
			});

			const report = await reportGenerator.generateUsageReport(authReq.user.id, {
				start: new Date(startDate),
				end: new Date(endDate),
			});

			// Convert Map to object for JSON serialization
			const usageObj: Record<string, unknown> = {};
			for (const [key, value] of report.usage.entries()) {
				usageObj[key] = value;
			}

			res.json({
				...report,
				usage: usageObj,
			});
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
				return;
			}
			console.error('Failed to generate report:', error);
			res.status(500).json({ error: 'Failed to generate report' });
		}
	});

	/**
	 * GET /usage/top
	 * Get top users by usage (admin only)
	 */
	router.get('/usage/top', requireAdmin, async (req: Request, res: Response) => {
		try {
			const quotaType = QuotaTypeSchema.parse(req.query.type);
			const limit = parseInt(req.query.limit as string) || 10;

			const topUsers = await reportGenerator.getTopUsers(quotaType, limit);
			res.json({ topUsers });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid quota type' });
				return;
			}
			console.error('Failed to get top users:', error);
			res.status(500).json({ error: 'Failed to get top users' });
		}
	});

	/**
	 * GET /usage/trends
	 * Get usage trends (admin only)
	 */
	router.get('/usage/trends', requireAdmin, async (req: Request, res: Response) => {
		try {
			const quotaType = QuotaTypeSchema.parse(req.query.type);
			const days = parseInt(req.query.days as string) || 30;

			const end = new Date();
			const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

			const trends = await reportGenerator.getUsageTrends(quotaType, { start, end });
			res.json({ trends });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid quota type' });
				return;
			}
			console.error('Failed to get trends:', error);
			res.status(500).json({ error: 'Failed to get trends' });
		}
	});

	/**
	 * POST /overrides
	 * Set a quota override (admin only)
	 */
	router.post('/overrides', requireAdmin, async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthenticatedRequest;
			const override = SetOverrideRequestSchema.parse(req.body);

			await overrideManager.setOverride({
				userId: override.userId,
				quotaType: override.quotaType,
				limit: override.limit,
				expiresAt: override.expiresAt ? new Date(override.expiresAt) : undefined,
				reason: override.reason,
				createdBy: authReq.user!.id,
			});

			res.json({ success: true, message: 'Quota override set successfully' });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid request', details: error.errors });
				return;
			}
			console.error('Failed to set override:', error);
			res.status(500).json({ error: 'Failed to set override' });
		}
	});

	/**
	 * GET /overrides/:userId
	 * Get overrides for a user (admin only)
	 */
	router.get('/overrides/:userId', requireAdmin, async (req: Request, res: Response) => {
		try {
			const userId = req.params.userId;
			const overrides = await overrideManager.getOverrides(userId);
			res.json({ overrides });
		} catch (error) {
			console.error('Failed to get overrides:', error);
			res.status(500).json({ error: 'Failed to get overrides' });
		}
	});

	/**
	 * DELETE /overrides/:userId/:type
	 * Clear a quota override (admin only)
	 */
	router.delete('/overrides/:userId/:type', requireAdmin, async (req: Request, res: Response) => {
		try {
			const userId = req.params.userId;
			const quotaType = QuotaTypeSchema.parse(req.params.type);

			await overrideManager.clearOverride(userId, quotaType);
			res.json({ success: true, message: 'Quota override cleared successfully' });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid quota type' });
				return;
			}
			console.error('Failed to clear override:', error);
			res.status(500).json({ error: 'Failed to clear override' });
		}
	});

	return router;
}

/**
 * Middleware to require admin role
 */
function requireAdmin(req: Request, res: Response, next: () => void): void {
	const authReq = req as AuthenticatedRequest;

	if (!authReq.user?.id) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}

	if (!authReq.user.roles?.includes('admin')) {
		res.status(403).json({ error: 'Forbidden: Admin access required' });
		return;
	}

	next();
}
