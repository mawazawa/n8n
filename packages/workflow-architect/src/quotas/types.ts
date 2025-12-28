import { z } from 'zod';

/**
 * Types of quotas that can be enforced
 */
export enum QuotaType {
	WORKFLOWS = 'workflows',
	EXECUTIONS = 'executions',
	API_CALLS = 'api_calls',
	STORAGE = 'storage',
	BANDWIDTH = 'bandwidth',
	NODES = 'nodes',
}

/**
 * Time periods for quota limits
 */
export enum QuotaPeriod {
	MINUTE = 'minute',
	HOUR = 'hour',
	DAY = 'day',
	MONTH = 'month',
}

/**
 * Quota configuration for a specific resource type
 */
export interface Quota {
	/** Type of resource being limited */
	type: QuotaType;
	/** Maximum allowed amount */
	limit: number;
	/** Time period for the limit */
	period: QuotaPeriod;
	/** Current usage */
	used: number;
	/** Remaining quota */
	remaining: number;
	/** When the quota resets */
	resetsAt: Date;
}

/**
 * Subscription plan with associated quotas and features
 */
export interface Plan {
	/** Unique plan identifier */
	id: string;
	/** Display name */
	name: string;
	/** Plan description */
	description: string;
	/** Monthly price in cents */
	price: number;
	/** Quotas for this plan */
	quotas: PlanQuota[];
	/** Feature flags enabled for this plan */
	features: string[];
	/** Whether this is a custom enterprise plan */
	isCustom: boolean;
}

/**
 * Quota definition within a plan
 */
export interface PlanQuota {
	/** Type of quota */
	type: QuotaType;
	/** Maximum allowed amount */
	limit: number;
	/** Time period for the limit */
	period: QuotaPeriod;
	/** Whether this quota can be overridden */
	overridable: boolean;
}

/**
 * Usage record for a specific quota type
 */
export interface Usage {
	/** User or tenant identifier */
	userId: string;
	/** Type of quota */
	quotaType: QuotaType;
	/** Amount used */
	used: number;
	/** When the usage occurred */
	timestamp: Date;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Result of a quota check
 */
export interface QuotaResult {
	/** Whether the operation is allowed */
	allowed: boolean;
	/** Current quota status */
	quota: Quota;
	/** Reason for denial if not allowed */
	reason?: string;
	/** When the user can retry */
	retryAfter?: Date;
}

/**
 * Result of a rate limit check
 */
export interface LimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Current count in the window */
	current: number;
	/** Maximum allowed in the window */
	limit: number;
	/** When the window resets */
	resetsAt: Date;
	/** Time until reset in seconds */
	retryAfter: number;
}

/**
 * Per-user quota override
 */
export interface QuotaOverride {
	/** User identifier */
	userId: string;
	/** Type of quota being overridden */
	quotaType: QuotaType;
	/** Overridden limit */
	limit: number;
	/** When the override expires (optional) */
	expiresAt?: Date;
	/** Reason for the override */
	reason?: string;
	/** Who created the override */
	createdBy: string;
	/** When the override was created */
	createdAt: Date;
}

/**
 * Usage aggregation data
 */
export interface UsageData {
	/** User identifier */
	userId: string;
	/** Type of quota */
	quotaType: QuotaType;
	/** Aggregation period */
	period: QuotaPeriod;
	/** Total usage in the period */
	total: number;
	/** Period start time */
	startTime: Date;
	/** Period end time */
	endTime: Date;
	/** Breakdown by sub-period */
	breakdown?: UsageBreakdown[];
}

/**
 * Usage breakdown by time segment
 */
export interface UsageBreakdown {
	/** Start of the time segment */
	timestamp: Date;
	/** Usage in this segment */
	amount: number;
}

/**
 * Usage report for a user
 */
export interface UsageReport {
	/** User identifier */
	userId: string;
	/** Report period */
	period: {
		start: Date;
		end: Date;
	};
	/** Current plan */
	plan: Plan;
	/** Usage data by quota type */
	usage: Map<QuotaType, UsageData>;
	/** Cost breakdown */
	costs?: {
		base: number;
		overages: number;
		total: number;
	};
}

/**
 * User usage ranking
 */
export interface UserUsage {
	/** User identifier */
	userId: string;
	/** Quota type */
	quotaType: QuotaType;
	/** Total usage */
	usage: number;
	/** Rank among all users */
	rank: number;
}

/**
 * Usage trend data
 */
export interface TrendData {
	/** Quota type */
	quotaType: QuotaType;
	/** Data points over time */
	dataPoints: TrendDataPoint[];
	/** Trend direction: up, down, stable */
	trend: 'up' | 'down' | 'stable';
	/** Percentage change */
	changePercent: number;
}

/**
 * Single data point in a trend
 */
export interface TrendDataPoint {
	/** Timestamp */
	timestamp: Date;
	/** Total usage */
	value: number;
	/** Number of users */
	userCount: number;
}

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
	/** Threshold percentage (0-100) */
	percentage: number;
	/** Action to take when threshold is reached */
	action: AlertAction;
	/** Whether this threshold has been triggered */
	triggered?: boolean;
}

/**
 * Actions to take when alert threshold is reached
 */
export enum AlertAction {
	NOTIFY = 'notify',
	WARN = 'warn',
	THROTTLE = 'throttle',
	BLOCK = 'block',
}

/**
 * Alert generated when threshold is reached
 */
export interface Alert {
	/** User identifier */
	userId: string;
	/** Quota type */
	quotaType: QuotaType;
	/** Current usage percentage */
	usagePercent: number;
	/** Threshold that was crossed */
	threshold: AlertThreshold;
	/** Alert severity */
	severity: 'info' | 'warning' | 'critical';
	/** Alert message */
	message: string;
	/** When the alert was generated */
	timestamp: Date;
}

/**
 * Billing integration interface
 */
export interface BillingIntegration {
	/** Report usage to billing system */
	reportUsage(userId: string, usage: Usage[]): Promise<void>;
	/** Get current billing period */
	getBillingPeriod(userId: string): Promise<{ start: Date; end: Date }>;
	/** Create invoice line items */
	createLineItems(userId: string, usage: UsageReport): Promise<BillingLineItem[]>;
}

/**
 * Billing line item
 */
export interface BillingLineItem {
	/** Description */
	description: string;
	/** Quantity */
	quantity: number;
	/** Unit price in cents */
	unitPrice: number;
	/** Total price in cents */
	totalPrice: number;
	/** Quota type */
	quotaType: QuotaType;
}

// Zod schemas for validation

export const QuotaTypeSchema = z.nativeEnum(QuotaType);
export const QuotaPeriodSchema = z.nativeEnum(QuotaPeriod);
export const AlertActionSchema = z.nativeEnum(AlertAction);

export const QuotaSchema = z.object({
	type: QuotaTypeSchema,
	limit: z.number().min(0),
	period: QuotaPeriodSchema,
	used: z.number().min(0),
	remaining: z.number().min(0),
	resetsAt: z.date(),
});

export const PlanQuotaSchema = z.object({
	type: QuotaTypeSchema,
	limit: z.number().min(0),
	period: QuotaPeriodSchema,
	overridable: z.boolean(),
});

export const PlanSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	price: z.number().min(0),
	quotas: z.array(PlanQuotaSchema),
	features: z.array(z.string()),
	isCustom: z.boolean(),
});

export const UsageSchema = z.object({
	userId: z.string().min(1),
	quotaType: QuotaTypeSchema,
	used: z.number().min(0),
	timestamp: z.date(),
	metadata: z.record(z.unknown()).optional(),
});

export const QuotaOverrideSchema = z.object({
	userId: z.string().min(1),
	quotaType: QuotaTypeSchema,
	limit: z.number().min(0),
	expiresAt: z.date().optional(),
	reason: z.string().optional(),
	createdBy: z.string().min(1),
	createdAt: z.date(),
});

export const AlertThresholdSchema = z.object({
	percentage: z.number().min(0).max(100),
	action: AlertActionSchema,
	triggered: z.boolean().optional(),
});

export const UsageReportRequestSchema = z.object({
	userId: z.string().min(1),
	startDate: z.string().datetime().or(z.date()),
	endDate: z.string().datetime().or(z.date()),
	quotaTypes: z.array(QuotaTypeSchema).optional(),
});

export const SetOverrideRequestSchema = z.object({
	userId: z.string().min(1),
	quotaType: QuotaTypeSchema,
	limit: z.number().min(0),
	expiresAt: z.string().datetime().or(z.date()).optional(),
	reason: z.string().optional(),
});
