/**
 * Quota Management System
 *
 * Comprehensive quota, rate limiting, and usage tracking for workflow automation.
 *
 * @packageDocumentation
 */

// Types
export type {
	Quota,
	QuotaResult,
	Plan,
	PlanQuota,
	Usage,
	UsageData,
	UsageBreakdown,
	UsageReport,
	UserUsage,
	TrendData,
	TrendDataPoint,
	QuotaOverride,
	Alert,
	AlertThreshold,
	BillingIntegration,
	BillingLineItem,
	LimitResult,
} from './types';

export {
	QuotaType,
	QuotaPeriod,
	AlertAction,
	QuotaSchema,
	PlanQuotaSchema,
	PlanSchema,
	UsageSchema,
	QuotaOverrideSchema,
	AlertThresholdSchema,
	UsageReportRequestSchema,
	SetOverrideRequestSchema,
} from './types';

// Rate Limiter
export { RateLimiter, createRateLimiter, timeToMs } from './limiter';
export type { RateLimiterConfig, RedisClient } from './limiter';

// Quota Manager
export { QuotaManager } from './manager';
export type { QuotaManagerConfig } from './manager';

// Enforcement Middleware
export {
	quotaMiddleware,
	rateLimitMiddleware,
	combinedMiddleware,
	incrementQuota,
	checkQuota,
} from './enforcement';
export type {
	AuthenticatedRequest,
	QuotaMiddlewareConfig,
	RateLimitMiddlewareConfig,
} from './enforcement';

// Usage Tracking
export { UsageTracker, createUsageTracker } from './tracking';
export type { UsageTrackerConfig } from './tracking';

// Alerts
export { AlertManager, createAlertManager } from './alerts';
export type { AlertManagerConfig, NotificationChannel } from './alerts';

// Billing
export {
	StripeUsageReporter,
	MockBillingIntegration,
	calculateTieredPricing,
	calculateOverage,
	formatCurrency,
} from './billing';
export type { StripeConfig, PricingTier } from './billing';

// Plans
export { PlanManager, createPlanManager, PlanId } from './plans';
export type { PlanManagerConfig } from './plans';

// Overrides
export { QuotaOverrideManager, createQuotaOverrideManager } from './overrides';
export type { QuotaOverrideManagerConfig } from './overrides';

// Reporting
export { ReportGenerator, createReportGenerator, ExportFormat } from './reporting';
export type { ReportGeneratorConfig } from './reporting';

// API
export { createQuotaApi } from './api';
export type { QuotaApiConfig } from './api';

/**
 * Initialize the complete quota management system
 *
 * @example
 * ```typescript
 * import { createQuotaSystem } from '@/quotas';
 *
 * const quotaSystem = createQuotaSystem({
 *   supabase,
 *   redis, // optional
 * });
 *
 * // Use in Express app
 * app.use('/api/quotas', quotaSystem.api);
 *
 * // Enforce quotas on routes
 * app.post('/workflows',
 *   quotaSystem.middleware.quota(QuotaType.WORKFLOWS),
 *   createWorkflowHandler
 * );
 * ```
 */
export function createQuotaSystem(config: {
	supabase: import('@supabase/supabase-js').SupabaseClient;
	redis?: import('./limiter').RedisClient;
	notificationChannels?: import('./alerts').NotificationChannel;
}) {
	const { supabase, redis, notificationChannels } = config;

	// Initialize managers
	const quotaManager = new QuotaManager({ supabase });
	const planManager = new PlanManager({ supabase });
	const overrideManager = new QuotaOverrideManager({ supabase });
	const usageTracker = new UsageTracker({ supabase });
	const reportGenerator = new ReportGenerator({
		supabase,
		usageTracker,
		planManager,
	});
	const alertManager = new AlertManager({
		supabase,
		quotaManager,
		notificationChannels,
	});
	const rateLimiter = new RateLimiter({ redis });

	// Create API router
	const api = createQuotaApi({
		quotaManager,
		planManager,
		overrideManager,
		reportGenerator,
		usageTracker,
	});

	// Middleware helpers
	const middleware = {
		quota: (quotaType: import('./types').QuotaType, config?: Partial<import('./enforcement').QuotaMiddlewareConfig>) =>
			quotaMiddleware(quotaType, {
				quotaManager,
				rateLimiter,
				...config,
			}),
		rateLimit: (config: import('./enforcement').RateLimitMiddlewareConfig) =>
			rateLimitMiddleware(config),
	};

	return {
		quotaManager,
		planManager,
		overrideManager,
		usageTracker,
		reportGenerator,
		alertManager,
		rateLimiter,
		api,
		middleware,
	};
}

export type QuotaSystem = ReturnType<typeof createQuotaSystem>;
