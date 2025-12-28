import type { SupabaseClient } from '@supabase/supabase-js';
import type { Plan, QuotaType, QuotaPeriod, PlanQuota } from './types';

/**
 * Built-in plan IDs
 */
export enum PlanId {
	FREE = 'free',
	PRO = 'pro',
	ENTERPRISE = 'enterprise',
}

/**
 * Built-in plan definitions
 */
const BUILT_IN_PLANS: Record<PlanId, Plan> = {
	[PlanId.FREE]: {
		id: PlanId.FREE,
		name: 'Free',
		description: 'Perfect for getting started with workflow automation',
		price: 0,
		quotas: [
			{
				type: QuotaType.WORKFLOWS,
				limit: 5,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.EXECUTIONS,
				limit: 100,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.API_CALLS,
				limit: 1000,
				period: QuotaPeriod.DAY,
				overridable: true,
			},
			{
				type: QuotaType.STORAGE,
				limit: 100 * 1024 * 1024, // 100 MB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.BANDWIDTH,
				limit: 1024 * 1024 * 1024, // 1 GB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.NODES,
				limit: 0,
				period: QuotaPeriod.MONTH,
				overridable: false,
			},
		],
		features: [
			'basic_workflows',
			'email_support',
			'community_access',
			'5_workflows',
			'100_executions',
		],
		isCustom: false,
	},
	[PlanId.PRO]: {
		id: PlanId.PRO,
		name: 'Pro',
		description: 'For professionals and growing teams',
		price: 4900, // $49.00/month
		quotas: [
			{
				type: QuotaType.WORKFLOWS,
				limit: 50,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.EXECUTIONS,
				limit: 10000,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.API_CALLS,
				limit: 100000,
				period: QuotaPeriod.DAY,
				overridable: true,
			},
			{
				type: QuotaType.STORAGE,
				limit: 10 * 1024 * 1024 * 1024, // 10 GB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.BANDWIDTH,
				limit: 100 * 1024 * 1024 * 1024, // 100 GB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.NODES,
				limit: 10,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
		],
		features: [
			'advanced_workflows',
			'priority_support',
			'team_collaboration',
			'custom_nodes',
			'sla_99_9',
			'50_workflows',
			'10k_executions',
			'analytics',
		],
		isCustom: false,
	},
	[PlanId.ENTERPRISE]: {
		id: PlanId.ENTERPRISE,
		name: 'Enterprise',
		description: 'For large organizations with custom needs',
		price: 0, // Custom pricing
		quotas: [
			{
				type: QuotaType.WORKFLOWS,
				limit: 999999,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.EXECUTIONS,
				limit: 999999999,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.API_CALLS,
				limit: 999999999,
				period: QuotaPeriod.DAY,
				overridable: true,
			},
			{
				type: QuotaType.STORAGE,
				limit: 1024 * 1024 * 1024 * 1024, // 1 TB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.BANDWIDTH,
				limit: 10 * 1024 * 1024 * 1024 * 1024, // 10 TB
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
			{
				type: QuotaType.NODES,
				limit: 999999,
				period: QuotaPeriod.MONTH,
				overridable: true,
			},
		],
		features: [
			'unlimited_workflows',
			'dedicated_support',
			'sso',
			'audit_logs',
			'custom_sla',
			'white_label',
			'on_premise',
			'custom_integrations',
			'training',
			'dedicated_account_manager',
		],
		isCustom: true,
	},
};

/**
 * Configuration for plan manager
 */
export interface PlanManagerConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
}

/**
 * Manages subscription plans and user subscriptions
 *
 * Features:
 * - Built-in plan definitions (Free, Pro, Enterprise)
 * - Custom plan support
 * - Plan upgrades/downgrades
 * - Subscription management
 * - Feature checks
 *
 * @example
 * ```typescript
 * const planManager = new PlanManager({ supabase });
 *
 * // Get all available plans
 * const plans = await planManager.getPlans();
 *
 * // Get user's current plan
 * const userPlan = await planManager.getUserPlan('user-123');
 *
 * // Upgrade user to Pro plan
 * await planManager.upgradePlan('user-123', PlanId.PRO);
 *
 * // Check if user has feature
 * const hasFeature = await planManager.hasFeature('user-123', 'team_collaboration');
 * ```
 */
export class PlanManager {
	private readonly supabase: SupabaseClient;

	constructor(config: PlanManagerConfig) {
		this.supabase = config.supabase;
	}

	/**
	 * Get all available plans
	 *
	 * @returns Array of plans
	 */
	async getPlans(): Promise<Plan[]> {
		// Get custom plans from database
		const { data: customPlans, error } = await this.supabase
			.from('plans')
			.select('*')
			.eq('is_custom', true);

		if (error) {
			console.error('Failed to fetch custom plans:', error);
		}

		// Combine built-in and custom plans
		const plans = [...Object.values(BUILT_IN_PLANS)];

		if (customPlans) {
			for (const row of customPlans) {
				plans.push({
					id: row.id,
					name: row.name,
					description: row.description,
					price: row.price,
					quotas: row.quotas as PlanQuota[],
					features: row.features as string[],
					isCustom: true,
				});
			}
		}

		return plans;
	}

	/**
	 * Get a specific plan by ID
	 *
	 * @param planId - Plan identifier
	 * @returns Plan or null if not found
	 */
	async getPlan(planId: string): Promise<Plan | null> {
		// Check built-in plans first
		const builtInPlan = BUILT_IN_PLANS[planId as PlanId];
		if (builtInPlan) {
			return builtInPlan;
		}

		// Check database for custom plans
		const { data, error } = await this.supabase
			.from('plans')
			.select('*')
			.eq('id', planId)
			.single();

		if (error || !data) {
			return null;
		}

		return {
			id: data.id,
			name: data.name,
			description: data.description,
			price: data.price,
			quotas: data.quotas as PlanQuota[],
			features: data.features as string[],
			isCustom: true,
		};
	}

	/**
	 * Get user's current plan
	 *
	 * @param userId - User identifier
	 * @returns User's plan
	 */
	async getUserPlan(userId: string): Promise<Plan> {
		const { data, error } = await this.supabase
			.from('user_subscriptions')
			.select('plan_id')
			.eq('user_id', userId)
			.single();

		if (error || !data) {
			// Return free plan as default
			return BUILT_IN_PLANS[PlanId.FREE];
		}

		const plan = await this.getPlan(data.plan_id);
		return plan ?? BUILT_IN_PLANS[PlanId.FREE];
	}

	/**
	 * Subscribe user to a plan
	 *
	 * @param userId - User identifier
	 * @param planId - Plan identifier
	 */
	async upgradePlan(userId: string, planId: string): Promise<void> {
		// Validate plan exists
		const plan = await this.getPlan(planId);
		if (!plan) {
			throw new Error(`Plan ${planId} not found`);
		}

		// Check if user already has a subscription
		const { data: existing } = await this.supabase
			.from('user_subscriptions')
			.select('id')
			.eq('user_id', userId)
			.single();

		const now = new Date().toISOString();

		if (existing) {
			// Update existing subscription
			const { error } = await this.supabase
				.from('user_subscriptions')
				.update({
					plan_id: planId,
					updated_at: now,
				})
				.eq('user_id', userId);

			if (error) {
				throw new Error(`Failed to update subscription: ${error.message}`);
			}
		} else {
			// Create new subscription
			const { error } = await this.supabase.from('user_subscriptions').insert({
				user_id: userId,
				plan_id: planId,
				status: 'active',
				created_at: now,
				updated_at: now,
			});

			if (error) {
				throw new Error(`Failed to create subscription: ${error.message}`);
			}
		}
	}

	/**
	 * Downgrade or cancel user's plan
	 *
	 * @param userId - User identifier
	 */
	async downgradePlan(userId: string): Promise<void> {
		await this.upgradePlan(userId, PlanId.FREE);
	}

	/**
	 * Cancel user's subscription
	 *
	 * @param userId - User identifier
	 */
	async cancelSubscription(userId: string): Promise<void> {
		const { error } = await this.supabase
			.from('user_subscriptions')
			.update({
				status: 'cancelled',
				updated_at: new Date().toISOString(),
			})
			.eq('user_id', userId);

		if (error) {
			throw new Error(`Failed to cancel subscription: ${error.message}`);
		}
	}

	/**
	 * Check if user has a specific feature
	 *
	 * @param userId - User identifier
	 * @param feature - Feature identifier
	 * @returns Whether user has the feature
	 */
	async hasFeature(userId: string, feature: string): Promise<boolean> {
		const plan = await this.getUserPlan(userId);
		return plan.features.includes(feature);
	}

	/**
	 * Get quota for a specific type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @returns Quota configuration or null
	 */
	async getQuotaConfig(userId: string, quotaType: QuotaType): Promise<PlanQuota | null> {
		const plan = await this.getUserPlan(userId);
		return plan.quotas.find((q) => q.type === quotaType) ?? null;
	}

	/**
	 * Create a custom plan
	 *
	 * @param plan - Plan configuration
	 * @returns Created plan ID
	 */
	async createCustomPlan(plan: Omit<Plan, 'id' | 'isCustom'>): Promise<string> {
		const planId = `custom_${Date.now()}`;

		const { error } = await this.supabase.from('plans').insert({
			id: planId,
			name: plan.name,
			description: plan.description,
			price: plan.price,
			quotas: plan.quotas,
			features: plan.features,
			is_custom: true,
			created_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to create custom plan: ${error.message}`);
		}

		return planId;
	}

	/**
	 * Update a custom plan
	 *
	 * @param planId - Plan identifier
	 * @param updates - Plan updates
	 */
	async updateCustomPlan(planId: string, updates: Partial<Plan>): Promise<void> {
		const { error } = await this.supabase
			.from('plans')
			.update({
				...(updates.name && { name: updates.name }),
				...(updates.description && { description: updates.description }),
				...(updates.price !== undefined && { price: updates.price }),
				...(updates.quotas && { quotas: updates.quotas }),
				...(updates.features && { features: updates.features }),
				updated_at: new Date().toISOString(),
			})
			.eq('id', planId)
			.eq('is_custom', true);

		if (error) {
			throw new Error(`Failed to update custom plan: ${error.message}`);
		}
	}

	/**
	 * Delete a custom plan
	 *
	 * @param planId - Plan identifier
	 */
	async deleteCustomPlan(planId: string): Promise<void> {
		const { error } = await this.supabase
			.from('plans')
			.delete()
			.eq('id', planId)
			.eq('is_custom', true);

		if (error) {
			throw new Error(`Failed to delete custom plan: ${error.message}`);
		}
	}

	/**
	 * Get built-in plans
	 *
	 * @returns Built-in plans
	 */
	getBuiltInPlans(): Plan[] {
		return Object.values(BUILT_IN_PLANS);
	}
}

/**
 * Create a plan manager instance
 *
 * @param supabase - Supabase client
 * @returns PlanManager instance
 */
export function createPlanManager(supabase: SupabaseClient): PlanManager {
	return new PlanManager({ supabase });
}
