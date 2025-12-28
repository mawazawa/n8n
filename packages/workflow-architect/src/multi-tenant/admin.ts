import { type TenantSummary, type Health, TenantStatus } from './types';
import { TenantManager } from './tenant';
import { TenantQuotaManager } from './quotas';
import { TenantMetrics } from './metrics';

/**
 * Impersonation session
 */
export interface ImpersonationSession {
	adminUserId: string;
	targetTenantId: string;
	targetUserId?: string;
	startedAt: Date;
	expiresAt: Date;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult<T = unknown> {
	total: number;
	successful: number;
	failed: number;
	results: Array<{
		tenantId: string;
		success: boolean;
		data?: T;
		error?: string;
	}>;
}

/**
 * AdminDashboard provides super-admin functionality
 */
export class AdminDashboard {
	private tenantManager: TenantManager;
	private quotaManager: TenantQuotaManager;
	private metricsManager: TenantMetrics;
	private impersonationSessions: Map<string, ImpersonationSession>;

	constructor(
		tenantManager: TenantManager,
		quotaManager: TenantQuotaManager,
		metricsManager: TenantMetrics,
	) {
		this.tenantManager = tenantManager;
		this.quotaManager = quotaManager;
		this.metricsManager = metricsManager;
		this.impersonationSessions = new Map();
	}

	/**
	 * Get all tenants with summary information
	 */
	async getAllTenants(filters?: {
		status?: TenantStatus;
		planType?: string;
		search?: string;
	}): Promise<TenantSummary[]> {
		const tenants = await this.tenantManager.list(filters);

		const summaries = await Promise.all(
			tenants.map(async (tenant) => {
				// Get usage statistics
				const quotaStatuses = await this.quotaManager.getAllQuotaStatuses(tenant.id);

				// Get last activity
				const lastActivity = await this.getLastActivity(tenant.id);

				const summary: TenantSummary = {
					id: tenant.id,
					name: tenant.name,
					slug: tenant.slug,
					status: tenant.status,
					planType: tenant.plan.type,
					userCount: quotaStatuses.find((q) => q.resource === 'users')?.current ?? 0,
					workflowCount: quotaStatuses.find((q) => q.resource === 'workflows')?.current ?? 0,
					executionCount: quotaStatuses.find((q) => q.resource === 'executions')?.current ?? 0,
					storageUsed: quotaStatuses.find((q) => q.resource === 'storage')?.current ?? 0,
					lastActivity,
					createdAt: tenant.createdAt,
				};

				return summary;
			}),
		);

		return summaries;
	}

	/**
	 * Get tenant health status
	 */
	async getTenantHealth(tenantId: string): Promise<Health> {
		const checks = await Promise.all([
			this.checkDatabaseHealth(tenantId),
			this.checkQuotaHealth(tenantId),
			this.checkExecutionHealth(tenantId),
			this.checkStorageHealth(tenantId),
		]);

		// Determine overall status
		const hasFailures = checks.some((c) => c.status === 'FAIL');
		const hasWarnings = checks.some((c) => c.status === 'WARN');
		const overallStatus = hasFailures ? 'UNHEALTHY' : hasWarnings ? 'DEGRADED' : 'HEALTHY';

		// Get metrics
		const metrics = await this.getTenantMetrics(tenantId);

		return {
			status: overallStatus,
			checks,
			metrics,
			timestamp: new Date(),
		};
	}

	/**
	 * Start impersonation session
	 */
	async startImpersonation(
		adminUserId: string,
		targetTenantId: string,
		targetUserId?: string,
	): Promise<ImpersonationSession> {
		// Verify admin permissions
		// This would check if adminUserId has super-admin role

		const session: ImpersonationSession = {
			adminUserId,
			targetTenantId,
			targetUserId,
			startedAt: new Date(),
			expiresAt: new Date(Date.now() + 3600000), // 1 hour
		};

		const sessionId = `${adminUserId}:${targetTenantId}`;
		this.impersonationSessions.set(sessionId, session);

		// Log impersonation event
		console.log(
			`Admin ${adminUserId} started impersonating tenant ${targetTenantId}`,
		);

		return session;
	}

	/**
	 * End impersonation session
	 */
	async endImpersonation(adminUserId: string, targetTenantId: string): Promise<void> {
		const sessionId = `${adminUserId}:${targetTenantId}`;
		this.impersonationSessions.delete(sessionId);

		// Log end of impersonation
		console.log(
			`Admin ${adminUserId} ended impersonation of tenant ${targetTenantId}`,
		);
	}

	/**
	 * Bulk suspend tenants
	 */
	async bulkSuspend(tenantIds: string[]): Promise<BulkOperationResult> {
		const results: BulkOperationResult = {
			total: tenantIds.length,
			successful: 0,
			failed: 0,
			results: [],
		};

		for (const tenantId of tenantIds) {
			try {
				await this.tenantManager.suspend(tenantId);
				results.successful++;
				results.results.push({
					tenantId,
					success: true,
				});
			} catch (error) {
				results.failed++;
				results.results.push({
					tenantId,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return results;
	}

	/**
	 * Bulk resume tenants
	 */
	async bulkResume(tenantIds: string[]): Promise<BulkOperationResult> {
		const results: BulkOperationResult = {
			total: tenantIds.length,
			successful: 0,
			failed: 0,
			results: [],
		};

		for (const tenantId of tenantIds) {
			try {
				await this.tenantManager.resume(tenantId);
				results.successful++;
				results.results.push({
					tenantId,
					success: true,
				});
			} catch (error) {
				results.failed++;
				results.results.push({
					tenantId,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return results;
	}

	/**
	 * Bulk delete tenants
	 */
	async bulkDelete(tenantIds: string[]): Promise<BulkOperationResult> {
		const results: BulkOperationResult = {
			total: tenantIds.length,
			successful: 0,
			failed: 0,
			results: [],
		};

		for (const tenantId of tenantIds) {
			try {
				await this.tenantManager.delete(tenantId);
				results.successful++;
				results.results.push({
					tenantId,
					success: true,
				});
			} catch (error) {
				results.failed++;
				results.results.push({
					tenantId,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return results;
	}

	/**
	 * Get platform-wide statistics
	 */
	async getPlatformStats(): Promise<{
		totalTenants: number;
		activeTenants: number;
		suspendedTenants: number;
		totalUsers: number;
		totalWorkflows: number;
		totalExecutions: number;
		totalStorage: number;
		byPlan: Record<string, number>;
	}> {
		const tenants = await this.getAllTenants();

		const stats = {
			totalTenants: tenants.length,
			activeTenants: tenants.filter((t) => t.status === TenantStatus.ACTIVE).length,
			suspendedTenants: tenants.filter((t) => t.status === TenantStatus.SUSPENDED).length,
			totalUsers: tenants.reduce((sum, t) => sum + t.userCount, 0),
			totalWorkflows: tenants.reduce((sum, t) => sum + t.workflowCount, 0),
			totalExecutions: tenants.reduce((sum, t) => sum + t.executionCount, 0),
			totalStorage: tenants.reduce((sum, t) => sum + t.storageUsed, 0),
			byPlan: {} as Record<string, number>,
		};

		// Count tenants by plan
		for (const tenant of tenants) {
			const planType = tenant.planType;
			stats.byPlan[planType] = (stats.byPlan[planType] ?? 0) + 1;
		}

		return stats;
	}

	/**
	 * Get tenant activity log
	 */
	async getTenantActivityLog(
		tenantId: string,
		options?: {
			limit?: number;
			offset?: number;
		},
	): Promise<Array<{
		id: string;
		tenantId: string;
		userId?: string;
		action: string;
		resourceType: string;
		resourceId: string;
		metadata?: Record<string, unknown>;
		timestamp: Date;
	}>> {
		// This would query the audit_logs table
		console.log(`Getting activity log for tenant ${tenantId}`);
		return [];
	}

	/**
	 * Get system alerts
	 */
	async getSystemAlerts(): Promise<Array<{
		id: string;
		severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
		message: string;
		tenantId?: string;
		timestamp: Date;
		resolved: boolean;
	}>> {
		// This would query alerts from monitoring system
		return [];
	}

	/**
	 * Search tenants
	 */
	async searchTenants(query: string): Promise<TenantSummary[]> {
		const allTenants = await this.getAllTenants();

		const searchLower = query.toLowerCase();
		return allTenants.filter(
			(tenant) =>
				tenant.name.toLowerCase().includes(searchLower) ||
				tenant.slug.toLowerCase().includes(searchLower) ||
				tenant.id.toLowerCase().includes(searchLower),
		);
	}

	/**
	 * Helper: Check database health
	 */
	private async checkDatabaseHealth(
		tenantId: string,
	): Promise<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string; timestamp: Date }> {
		try {
			// Simple connectivity check
			const tenant = await this.tenantManager.getById(tenantId);
			if (!tenant) {
				return {
					name: 'Database Connectivity',
					status: 'FAIL',
					message: 'Tenant not found',
					timestamp: new Date(),
				};
			}

			return {
				name: 'Database Connectivity',
				status: 'PASS',
				timestamp: new Date(),
			};
		} catch (error) {
			return {
				name: 'Database Connectivity',
				status: 'FAIL',
				message: error instanceof Error ? error.message : String(error),
				timestamp: new Date(),
			};
		}
	}

	/**
	 * Helper: Check quota health
	 */
	private async checkQuotaHealth(
		tenantId: string,
	): Promise<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string; timestamp: Date }> {
		const quotaStatuses = await this.quotaManager.getAllQuotaStatuses(tenantId);
		const exceeded = quotaStatuses.filter((q) => q.isExceeded);
		const nearLimit = quotaStatuses.filter((q) => q.percentageUsed > 80);

		if (exceeded.length > 0) {
			return {
				name: 'Quota Usage',
				status: 'FAIL',
				message: `${exceeded.length} quota(s) exceeded`,
				timestamp: new Date(),
			};
		}

		if (nearLimit.length > 0) {
			return {
				name: 'Quota Usage',
				status: 'WARN',
				message: `${nearLimit.length} quota(s) near limit`,
				timestamp: new Date(),
			};
		}

		return {
			name: 'Quota Usage',
			status: 'PASS',
			timestamp: new Date(),
		};
	}

	/**
	 * Helper: Check execution health
	 */
	private async checkExecutionHealth(
		tenantId: string,
	): Promise<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string; timestamp: Date }> {
		// This would check execution error rates
		return {
			name: 'Execution Health',
			status: 'PASS',
			timestamp: new Date(),
		};
	}

	/**
	 * Helper: Check storage health
	 */
	private async checkStorageHealth(
		tenantId: string,
	): Promise<{ name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string; timestamp: Date }> {
		const quotaResult = await this.quotaManager.checkQuota(tenantId, 'storage');

		if (quotaResult.isExceeded) {
			return {
				name: 'Storage Usage',
				status: 'FAIL',
				message: 'Storage quota exceeded',
				timestamp: new Date(),
			};
		}

		if (quotaResult.percentageUsed > 90) {
			return {
				name: 'Storage Usage',
				status: 'WARN',
				message: `Storage at ${quotaResult.percentageUsed.toFixed(1)}%`,
				timestamp: new Date(),
			};
		}

		return {
			name: 'Storage Usage',
			status: 'PASS',
			timestamp: new Date(),
		};
	}

	/**
	 * Helper: Get tenant metrics
	 */
	private async getTenantMetrics(
		tenantId: string,
	): Promise<{ cpu: number; memory: number; storage: number; errorRate: number }> {
		// This would get actual metrics from monitoring system
		// For now, return placeholder values
		const quotaResult = await this.quotaManager.checkQuota(tenantId, 'storage');

		return {
			cpu: 0,
			memory: 0,
			storage: quotaResult.percentageUsed,
			errorRate: 0,
		};
	}

	/**
	 * Helper: Get last activity timestamp
	 */
	private async getLastActivity(tenantId: string): Promise<Date | undefined> {
		// This would query the most recent activity from audit logs or executions
		console.log(`Getting last activity for tenant ${tenantId}`);
		return undefined;
	}
}
