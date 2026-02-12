import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Quota,
	QuotaResult,
	QuotaType,
	QuotaPeriod,
	Plan,
	QuotaOverride,
} from './types';

/**
 * Configuration for QuotaManager
 */
export interface QuotaManagerConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
	/** Cache TTL in milliseconds */
	cacheTTL?: number;
}

/**
 * Cache entry for quota data
 */
interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

/**
 * Manages quotas, plans, and usage tracking
 *
 * Features:
 * - Plan-based quota resolution
 * - Per-user quota overrides
 * - Usage tracking and enforcement
 * - Caching for performance
 * - Period-based quota resets
 *
 * @example
 * ```typescript
 * const manager = new QuotaManager({ supabase });
 *
 * // Check if user can perform action
 * const result = await manager.checkQuota('user-123', QuotaType.WORKFLOWS);
 * if (!result.allowed) {
 *   throw new Error(result.reason);
 * }
 *
 * // Increment usage
 * await manager.incrementUsage('user-123', QuotaType.WORKFLOWS, 1);
 * ```
 */
export class QuotaManager {
	private readonly supabase: SupabaseClient;
	private readonly cacheTTL: number;
	private readonly planCache: Map<string, CacheEntry<Plan>>;
	private readonly quotaCache: Map<string, CacheEntry<Quota[]>>;
	private readonly overrideCache: Map<string, CacheEntry<QuotaOverride[]>>;

	constructor(config: QuotaManagerConfig) {
		this.supabase = config.supabase;
		this.cacheTTL = config.cacheTTL ?? 60000; // 1 minute default
		this.planCache = new Map();
		this.quotaCache = new Map();
		this.overrideCache = new Map();
	}

	/**
	 * Get all quotas for a user
	 *
	 * @param userId - User identifier
	 * @returns Array of quotas with current usage
	 */
	async getQuotas(userId: string): Promise<Quota[]> {
		// Check cache first
		const cached = this.quotaCache.get(userId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.data;
		}

		// Get user's plan
		const plan = await this.getUserPlan(userId);

		// Get quota overrides
		const overrides = await this.getOverrides(userId);
		const overrideMap = new Map(overrides.map((o) => [o.quotaType, o]));

		// Get current usage
		const usage = await this.getCurrentUsage(userId);
		const usageMap = new Map(usage.map((u) => [u.quotaType, u.used]));

		// Build quota list
		const quotas: Quota[] = plan.quotas.map((pq) => {
			const override = overrideMap.get(pq.type);
			const limit = override?.limit ?? pq.limit;
			const used = usageMap.get(pq.type) ?? 0;
			const remaining = Math.max(0, limit - used);
			const resetsAt = this.getResetTime(pq.period);

			return {
				type: pq.type,
				limit,
				period: pq.period,
				used,
				remaining,
				resetsAt,
			};
		});

		// Cache the result
		this.quotaCache.set(userId, {
			data: quotas,
			expiresAt: Date.now() + this.cacheTTL,
		});

		return quotas;
	}

	/**
	 * Check if a user has quota available for a specific type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota to check
	 * @param amount - Amount to check (default: 1)
	 * @returns Result indicating if quota is available
	 */
	async checkQuota(userId: string, quotaType: QuotaType, amount = 1): Promise<QuotaResult> {
		const quotas = await this.getQuotas(userId);
		const quota = quotas.find((q) => q.type === quotaType);

		if (!quota) {
			return {
				allowed: false,
				quota: {
					type: quotaType,
					limit: 0,
					period: 'month' as QuotaPeriod,
					used: 0,
					remaining: 0,
					resetsAt: new Date(),
				},
				reason: `No quota found for ${quotaType}`,
			};
		}

		const allowed = quota.remaining >= amount;

		return {
			allowed,
			quota,
			reason: allowed ? undefined : `Quota exceeded for ${quotaType}`,
			retryAfter: allowed ? undefined : quota.resetsAt,
		};
	}

	/**
	 * Increment usage for a user and quota type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @param amount - Amount to increment (default: 1)
	 */
	async incrementUsage(userId: string, quotaType: QuotaType, amount = 1): Promise<void> {
		const now = new Date();

		// Record usage in database
		const { error } = await this.supabase.from('usage_logs').insert({
			user_id: userId,
			quota_type: quotaType,
			amount,
			timestamp: now.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to increment usage: ${error.message}`);
		}

		// Invalidate cache
		this.quotaCache.delete(userId);
	}

	/**
	 * Reset usage for a user and quota type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota to reset
	 */
	async resetUsage(userId: string, quotaType: QuotaType): Promise<void> {
		const { error } = await this.supabase
			.from('user_quotas')
			.update({ used: 0, reset_at: new Date().toISOString() })
			.eq('user_id', userId)
			.eq('quota_type', quotaType);

		if (error) {
			throw new Error(`Failed to reset usage: ${error.message}`);
		}

		// Invalidate cache
		this.quotaCache.delete(userId);
	}

	/**
	 * Get user's current plan
	 */
	private async getUserPlan(userId: string): Promise<Plan> {
		// Check cache first
		const cached = this.planCache.get(userId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.data;
		}

		// Query database
		const { data, error } = await this.supabase
			.from('user_subscriptions')
			.select(
				`
        plan_id,
        plans (
          id,
          name,
          description,
          price,
          quotas,
          features,
          is_custom
        )
      `,
			)
			.eq('user_id', userId)
			.single();

		if (error || !data) {
			// Return free plan as default
			return this.getFreePlan();
		}

		const planData = (data as { plans: Plan }).plans;
		const plan: Plan = {
			id: planData.id,
			name: planData.name,
			description: planData.description,
			price: planData.price,
			quotas: planData.quotas,
			features: planData.features,
			isCustom: planData.is_custom,
		};

		// Cache the plan
		this.planCache.set(userId, {
			data: plan,
			expiresAt: Date.now() + this.cacheTTL,
		});

		return plan;
	}

	/**
	 * Get quota overrides for a user
	 */
	private async getOverrides(userId: string): Promise<QuotaOverride[]> {
		// Check cache first
		const cached = this.overrideCache.get(userId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.data;
		}

		const now = new Date().toISOString();

		const { data, error } = await this.supabase
			.from('quota_overrides')
			.select('*')
			.eq('user_id', userId)
			.or(`expires_at.is.null,expires_at.gt.${now}`);

		if (error) {
			console.error('Failed to fetch quota overrides:', error);
			return [];
		}

		const overrides: QuotaOverride[] =
			data?.map((row) => ({
				userId: row.user_id,
				quotaType: row.quota_type,
				limit: row.limit,
				expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
				reason: row.reason,
				createdBy: row.created_by,
				createdAt: new Date(row.created_at),
			})) ?? [];

		// Cache the overrides
		this.overrideCache.set(userId, {
			data: overrides,
			expiresAt: Date.now() + this.cacheTTL,
		});

		return overrides;
	}

	/**
	 * Get current usage for all quota types
	 */
	private async getCurrentUsage(
		userId: string,
	): Promise<Array<{ quotaType: QuotaType; used: number }>> {
		const { data, error } = await this.supabase.rpc('get_current_usage', {
			p_user_id: userId,
		});

		if (error) {
			console.error('Failed to fetch current usage:', error);
			return [];
		}

		return (
			data?.map((row: { quota_type: QuotaType; total: number }) => ({
				quotaType: row.quota_type,
				used: row.total,
			})) ?? []
		);
	}

	/**
	 * Calculate when a quota period resets
	 */
	private getResetTime(period: QuotaPeriod): Date {
		const now = new Date();

		switch (period) {
			case 'minute':
				return new Date(now.getTime() + 60000 - (now.getTime() % 60000));
			case 'hour':
				return new Date(now.getTime() + 3600000 - (now.getTime() % 3600000));
			case 'day':
				const tomorrow = new Date(now);
				tomorrow.setDate(tomorrow.getDate() + 1);
				tomorrow.setHours(0, 0, 0, 0);
				return tomorrow;
			case 'month':
				const nextMonth = new Date(now);
				nextMonth.setMonth(nextMonth.getMonth() + 1);
				nextMonth.setDate(1);
				nextMonth.setHours(0, 0, 0, 0);
				return nextMonth;
			default:
				return new Date(now.getTime() + 86400000); // Default to 1 day
		}
	}

	/**
	 * Get the default free plan
	 */
	private getFreePlan(): Plan {
		return {
			id: 'free',
			name: 'Free',
			description: 'Free plan with basic quotas',
			price: 0,
			quotas: [
				{
					type: 'workflows' as QuotaType,
					limit: 5,
					period: 'month' as QuotaPeriod,
					overridable: true,
				},
				{
					type: 'executions' as QuotaType,
					limit: 100,
					period: 'month' as QuotaPeriod,
					overridable: true,
				},
				{
					type: 'api_calls' as QuotaType,
					limit: 1000,
					period: 'day' as QuotaPeriod,
					overridable: true,
				},
			],
			features: ['basic_workflows', 'email_support'],
			isCustom: false,
		};
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.planCache.clear();
		this.quotaCache.clear();
		this.overrideCache.clear();
	}

	/**
	 * Clear cache for a specific user
	 */
	clearUserCache(userId: string): void {
		this.planCache.delete(userId);
		this.quotaCache.delete(userId);
		this.overrideCache.delete(userId);
	}
}
