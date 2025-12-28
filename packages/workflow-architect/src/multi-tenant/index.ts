/**
 * Multi-Tenant System for Workflow Architect
 * Phase 5 Action 3: Multi-Tenant Architecture
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { TenantManager } from './tenant';
import { IsolationLayer, initializeGlobalIsolation } from './isolation';
import { TenantRouter } from './routing';
import { BrandingManager } from './branding';
import { TenantQuotaManager } from './quotas';
import { TenantBilling } from './billing';
import { OnboardingManager } from './onboarding';
import { TenantMigration } from './migration';
import { TenantBackup, type BackupStorage } from './backup';
import { AdminDashboard } from './admin';
import { TenantMetrics } from './metrics';
import { TenantSSO } from './sso';
import { DomainManager } from './domains';
import { createTenantAPI, validateAPIKey, errorHandler } from './api';

// Re-export types
export * from './types';

// Re-export classes
export { TenantManager } from './tenant';
export { IsolationLayer, createTenantContextMiddleware, WithTenantContext } from './isolation';
export { TenantRouter } from './routing';
export { BrandingManager } from './branding';
export { TenantQuotaManager } from './quotas';
export { TenantBilling, SubscriptionStatus, BillingPeriod } from './billing';
export { OnboardingManager } from './onboarding';
export { TenantMigration } from './migration';
export { TenantBackup, BackupType } from './backup';
export { AdminDashboard } from './admin';
export { TenantMetrics, AggregationPeriod, TrendDirection } from './metrics';
export { TenantSSO, SSOProvider, ProvisioningMode } from './sso';
export { DomainManager, VerificationMethod, SSLProvider } from './domains';
export { createTenantAPI, validateAPIKey, errorHandler } from './api';

/**
 * Multi-Tenant System configuration
 */
export interface MultiTenantConfig {
	supabaseUrl: string;
	supabaseKey: string;
	baseDomain?: string;
	backupStorage?: BackupStorage;
	apiKey?: string;
}

/**
 * MultiTenantSystem - Main entry point for multi-tenant functionality
 */
export class MultiTenantSystem {
	public readonly tenantManager: TenantManager;
	public readonly isolationLayer: IsolationLayer;
	public readonly router: TenantRouter;
	public readonly brandingManager: BrandingManager;
	public readonly quotaManager: TenantQuotaManager;
	public readonly billingManager: TenantBilling;
	public readonly onboardingManager: OnboardingManager;
	public readonly migrationManager: TenantMigration;
	public readonly backupManager: TenantBackup;
	public readonly adminDashboard: AdminDashboard;
	public readonly metricsManager: TenantMetrics;
	public readonly ssoManager: TenantSSO;
	public readonly domainManager: DomainManager;

	private supabase: SupabaseClient;

	constructor(supabase: SupabaseClient, config: MultiTenantConfig) {
		this.supabase = supabase;

		// Initialize core components
		this.tenantManager = new TenantManager(config.supabaseUrl, config.supabaseKey);
		this.isolationLayer = new IsolationLayer(supabase);
		this.router = new TenantRouter(this.tenantManager, config.baseDomain);
		this.brandingManager = new BrandingManager(config.supabaseUrl, config.supabaseKey);
		this.quotaManager = new TenantQuotaManager(config.supabaseUrl, config.supabaseKey);
		this.billingManager = new TenantBilling(config.supabaseUrl, config.supabaseKey);
		this.metricsManager = new TenantMetrics(config.supabaseUrl, config.supabaseKey);
		this.ssoManager = new TenantSSO(config.supabaseUrl, config.supabaseKey);
		this.domainManager = new DomainManager(config.supabaseUrl, config.supabaseKey);

		// Initialize managers that depend on other components
		this.onboardingManager = new OnboardingManager(
			this.tenantManager,
			this.quotaManager,
			this.billingManager,
		);

		this.migrationManager = new TenantMigration(config.supabaseUrl, config.supabaseKey);

		this.backupManager = new TenantBackup(
			config.supabaseUrl,
			config.supabaseKey,
			config.backupStorage ?? { provider: 'local', path: './backups' },
		);

		this.adminDashboard = new AdminDashboard(
			this.tenantManager,
			this.quotaManager,
			this.metricsManager,
		);

		// Initialize global isolation
		initializeGlobalIsolation(supabase);
	}

	/**
	 * Create Express middleware for tenant routing and context
	 */
	middleware() {
		return this.router.middleware();
	}

	/**
	 * Create Express API routes
	 */
	createAPI(apiKey?: string) {
		const router = createTenantAPI(this.tenantManager);

		// Add API key validation if provided
		if (apiKey) {
			router.use(validateAPIKey(apiKey));
		}

		return router;
	}

	/**
	 * Get tenant by various identifiers
	 */
	async getTenant(identifier: {
		id?: string;
		slug?: string;
		domain?: string;
	}) {
		if (identifier.id) {
			return this.tenantManager.getById(identifier.id);
		}

		if (identifier.slug) {
			return this.tenantManager.getBySlug(identifier.slug);
		}

		if (identifier.domain) {
			return this.tenantManager.getTenantByDomain(identifier.domain);
		}

		throw new Error('No valid identifier provided');
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		components: Record<string, boolean>;
		timestamp: Date;
	}> {
		const components: Record<string, boolean> = {};

		// Check database connectivity
		try {
			await this.tenantManager.list({ status: undefined });
			components.database = true;
		} catch {
			components.database = false;
		}

		// Check routing
		try {
			components.routing = true;
		} catch {
			components.routing = false;
		}

		// Determine overall status
		const allHealthy = Object.values(components).every((v) => v);
		const someHealthy = Object.values(components).some((v) => v);

		return {
			status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
			components,
			timestamp: new Date(),
		};
	}

	/**
	 * Get system statistics
	 */
	async getStats() {
		return this.adminDashboard.getPlatformStats();
	}

	/**
	 * Shutdown and cleanup
	 */
	async shutdown(): Promise<void> {
		// Clear caches
		this.router.clearCache();
		this.brandingManager.clearCache();
		this.quotaManager.clearCache();

		console.log('Multi-tenant system shut down successfully');
	}
}

/**
 * Create a multi-tenant system instance
 */
export function createMultiTenantSystem(
	supabase: SupabaseClient,
	config: MultiTenantConfig,
): MultiTenantSystem {
	return new MultiTenantSystem(supabase, config);
}

/**
 * Default export
 */
export default MultiTenantSystem;
