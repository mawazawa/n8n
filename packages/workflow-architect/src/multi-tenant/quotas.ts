import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Quotas, type QuotaResult, QuotasSchema, QuotaResultSchema } from './types';

/**
 * Quota resource types
 */
export type QuotaResource =
	| 'workflows'
	| 'executions'
	| 'users'
	| 'storage'
	| 'apiCalls'
	| 'webhooks'
	| 'concurrentExecutions';

/**
 * Usage tracking
 */
interface Usage {
	tenantId: string;
	resource: QuotaResource;
	count: number;
	lastUpdated: Date;
}

/**
 * TenantQuotaManager handles per-tenant quotas
 */
export class TenantQuotaManager {
	private supabase: SupabaseClient;
	private usageCache: Map<string, { usage: Usage; timestamp: number }>;
	private readonly cacheTTL = 60000; // 1 minute

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.usageCache = new Map();
	}

	/**
	 * Set quotas for a tenant
	 */
	async setQuotas(tenantId: string, quotas: Quotas): Promise<void> {
		// Validate quotas
		const validatedQuotas = QuotasSchema.parse(quotas);

		// Update in database
		const { error } = await this.supabase.from('tenant_quotas').upsert({
			tenant_id: tenantId,
			max_workflows: validatedQuotas.maxWorkflows,
			max_executions: validatedQuotas.maxExecutions,
			max_users: validatedQuotas.maxUsers,
			max_storage: validatedQuotas.maxStorage,
			max_api_calls: validatedQuotas.maxApiCalls,
			max_webhooks: validatedQuotas.maxWebhooks,
			max_concurrent_executions: validatedQuotas.maxConcurrentExecutions,
			updated_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to set quotas: ${error.message}`);
		}
	}

	/**
	 * Get quotas for a tenant
	 */
	async getQuotas(tenantId: string): Promise<Quotas | null> {
		const { data, error } = await this.supabase
			.from('tenant_quotas')
			.select('*')
			.eq('tenant_id', tenantId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get quotas: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return {
			maxWorkflows: data.max_workflows,
			maxExecutions: data.max_executions,
			maxUsers: data.max_users,
			maxStorage: data.max_storage,
			maxApiCalls: data.max_api_calls,
			maxWebhooks: data.max_webhooks,
			maxConcurrentExecutions: data.max_concurrent_executions,
		};
	}

	/**
	 * Check quota for a resource
	 */
	async checkQuota(tenantId: string, resource: QuotaResource): Promise<QuotaResult> {
		// Get quotas
		const quotas = await this.getQuotas(tenantId);
		if (!quotas) {
			throw new Error(`No quotas found for tenant ${tenantId}`);
		}

		// Get current usage
		const current = await this.getCurrentUsage(tenantId, resource);

		// Get limit
		const limit = this.getLimit(quotas, resource);

		// Calculate result
		const available = Math.max(0, limit - current);
		const isExceeded = current >= limit;
		const percentageUsed = (current / limit) * 100;

		const result: QuotaResult = {
			resource,
			current,
			limit,
			available,
			isExceeded,
			percentageUsed: Math.min(100, percentageUsed),
		};

		return QuotaResultSchema.parse(result);
	}

	/**
	 * Check if resource usage is within quota
	 */
	async canUseResource(tenantId: string, resource: QuotaResource, amount = 1): Promise<boolean> {
		const result = await this.checkQuota(tenantId, resource);
		return result.available >= amount;
	}

	/**
	 * Increment usage counter
	 */
	async incrementUsage(
		tenantId: string,
		resource: QuotaResource,
		amount = 1,
	): Promise<void> {
		// Check quota first
		const canUse = await this.canUseResource(tenantId, resource, amount);
		if (!canUse) {
			throw new Error(`Quota exceeded for ${resource}. Please upgrade your plan.`);
		}

		// Increment usage
		await this.supabase.rpc('increment_quota_usage', {
			p_tenant_id: tenantId,
			p_resource: resource,
			p_amount: amount,
		});

		// Clear cache
		this.usageCache.delete(`${tenantId}:${resource}`);
	}

	/**
	 * Decrement usage counter
	 */
	async decrementUsage(
		tenantId: string,
		resource: QuotaResource,
		amount = 1,
	): Promise<void> {
		await this.supabase.rpc('increment_quota_usage', {
			p_tenant_id: tenantId,
			p_resource: resource,
			p_amount: -amount,
		});

		// Clear cache
		this.usageCache.delete(`${tenantId}:${resource}`);
	}

	/**
	 * Reset usage for a resource
	 */
	async resetUsage(tenantId: string, resource?: QuotaResource): Promise<void> {
		if (resource) {
			await this.supabase
				.from('tenant_usage')
				.update({ count: 0, updated_at: new Date().toISOString() })
				.eq('tenant_id', tenantId)
				.eq('resource', resource);

			this.usageCache.delete(`${tenantId}:${resource}`);
		} else {
			// Reset all resources
			await this.supabase
				.from('tenant_usage')
				.update({ count: 0, updated_at: new Date().toISOString() })
				.eq('tenant_id', tenantId);

			// Clear all cache entries for tenant
			for (const key of this.usageCache.keys()) {
				if (key.startsWith(`${tenantId}:`)) {
					this.usageCache.delete(key);
				}
			}
		}
	}

	/**
	 * Get current usage for a resource
	 */
	async getCurrentUsage(tenantId: string, resource: QuotaResource): Promise<number> {
		const cacheKey = `${tenantId}:${resource}`;

		// Check cache
		const cached = this.usageCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.usage.count;
		}

		// Fetch from database
		const { data, error } = await this.supabase
			.from('tenant_usage')
			.select('count')
			.eq('tenant_id', tenantId)
			.eq('resource', resource)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				// No usage record yet
				return 0;
			}
			throw new Error(`Failed to get usage: ${error.message}`);
		}

		const count = data?.count ?? 0;

		// Cache result
		this.usageCache.set(cacheKey, {
			usage: {
				tenantId,
				resource,
				count,
				lastUpdated: new Date(),
			},
			timestamp: Date.now(),
		});

		return count;
	}

	/**
	 * Get all quota statuses for a tenant
	 */
	async getAllQuotaStatuses(tenantId: string): Promise<QuotaResult[]> {
		const resources: QuotaResource[] = [
			'workflows',
			'executions',
			'users',
			'storage',
			'apiCalls',
			'webhooks',
			'concurrentExecutions',
		];

		const results = await Promise.all(
			resources.map((resource) => this.checkQuota(tenantId, resource)),
		);

		return results;
	}

	/**
	 * Handle quota overage
	 */
	async handleOverage(
		tenantId: string,
		resource: QuotaResource,
		options?: {
			notifyAdmin?: boolean;
			suspendTenant?: boolean;
			allowOverage?: boolean;
		},
	): Promise<void> {
		const result = await this.checkQuota(tenantId, resource);

		if (!result.isExceeded) {
			return;
		}

		// Log overage event
		await this.supabase.from('quota_overage_events').insert({
			tenant_id: tenantId,
			resource,
			current_usage: result.current,
			quota_limit: result.limit,
			overage_amount: result.current - result.limit,
			timestamp: new Date().toISOString(),
		});

		// Notify admin if requested
		if (options?.notifyAdmin) {
			await this.notifyOverage(tenantId, resource, result);
		}

		// Suspend tenant if requested
		if (options?.suspendTenant) {
			// This would integrate with TenantManager
			console.warn(`Tenant ${tenantId} should be suspended due to ${resource} overage`);
		}

		// Throw error if overage not allowed
		if (!options?.allowOverage) {
			throw new Error(
				`Quota exceeded for ${resource}. Current: ${result.current}, Limit: ${result.limit}`,
			);
		}
	}

	/**
	 * Track storage usage
	 */
	async trackStorageUsage(tenantId: string, bytes: number): Promise<void> {
		const { error } = await this.supabase.from('tenant_usage').upsert({
			tenant_id: tenantId,
			resource: 'storage',
			count: bytes,
			updated_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to track storage usage: ${error.message}`);
		}

		this.usageCache.delete(`${tenantId}:storage`);
	}

	/**
	 * Track API call
	 */
	async trackAPICall(tenantId: string): Promise<void> {
		await this.incrementUsage(tenantId, 'apiCalls', 1);
	}

	/**
	 * Get quota limit for resource
	 */
	private getLimit(quotas: Quotas, resource: QuotaResource): number {
		switch (resource) {
			case 'workflows':
				return quotas.maxWorkflows;
			case 'executions':
				return quotas.maxExecutions;
			case 'users':
				return quotas.maxUsers;
			case 'storage':
				return quotas.maxStorage;
			case 'apiCalls':
				return quotas.maxApiCalls;
			case 'webhooks':
				return quotas.maxWebhooks;
			case 'concurrentExecutions':
				return quotas.maxConcurrentExecutions;
			default:
				throw new Error(`Unknown resource: ${resource}`);
		}
	}

	/**
	 * Notify about quota overage
	 */
	private async notifyOverage(
		tenantId: string,
		resource: QuotaResource,
		result: QuotaResult,
	): Promise<void> {
		// This would integrate with a notification service
		console.warn(
			`Quota overage for tenant ${tenantId}: ${resource} at ${result.percentageUsed.toFixed(1)}%`,
		);

		// Could send email, webhook, or other notification
		// await notificationService.send({
		//   tenantId,
		//   type: 'QUOTA_OVERAGE',
		//   data: { resource, result }
		// });
	}

	/**
	 * Clear cache
	 */
	clearCache(tenantId?: string): void {
		if (tenantId) {
			for (const key of this.usageCache.keys()) {
				if (key.startsWith(`${tenantId}:`)) {
					this.usageCache.delete(key);
				}
			}
		} else {
			this.usageCache.clear();
		}
	}
}
