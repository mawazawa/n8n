import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
	type Tenant,
	type CreateTenantConfig,
	type UpdateTenantConfig,
	TenantSchema,
	CreateTenantConfigSchema,
	UpdateTenantConfigSchema,
	TenantStatus,
	TenantPlanType,
	TenantIsolation,
} from './types';

/**
 * Default plan quotas by plan type
 */
const DEFAULT_QUOTAS = {
	[TenantPlanType.FREE]: {
		maxWorkflows: 5,
		maxExecutions: 1000,
		maxUsers: 2,
		maxStorage: 100 * 1024 * 1024, // 100MB
		maxApiCalls: 10000,
		maxWebhooks: 5,
		maxConcurrentExecutions: 1,
	},
	[TenantPlanType.STARTER]: {
		maxWorkflows: 25,
		maxExecutions: 10000,
		maxUsers: 5,
		maxStorage: 1024 * 1024 * 1024, // 1GB
		maxApiCalls: 100000,
		maxWebhooks: 25,
		maxConcurrentExecutions: 5,
	},
	[TenantPlanType.PROFESSIONAL]: {
		maxWorkflows: 100,
		maxExecutions: 100000,
		maxUsers: 25,
		maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
		maxApiCalls: 1000000,
		maxWebhooks: 100,
		maxConcurrentExecutions: 25,
	},
	[TenantPlanType.ENTERPRISE]: {
		maxWorkflows: 1000,
		maxExecutions: 1000000,
		maxUsers: 100,
		maxStorage: 100 * 1024 * 1024 * 1024, // 100GB
		maxApiCalls: 10000000,
		maxWebhooks: 500,
		maxConcurrentExecutions: 100,
	},
	[TenantPlanType.CUSTOM]: {
		maxWorkflows: 10000,
		maxExecutions: 10000000,
		maxUsers: 1000,
		maxStorage: 1024 * 1024 * 1024 * 1024, // 1TB
		maxApiCalls: 100000000,
		maxWebhooks: 5000,
		maxConcurrentExecutions: 1000,
	},
};

/**
 * TenantManager handles tenant lifecycle operations
 */
export class TenantManager {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Create a new tenant
	 */
	async create(config: CreateTenantConfig): Promise<Tenant> {
		// Validate input
		const validatedConfig = CreateTenantConfigSchema.parse(config);

		// Check if slug is already taken
		const { data: existing } = await this.supabase
			.from('tenants')
			.select('id')
			.eq('slug', validatedConfig.slug)
			.single();

		if (existing) {
			throw new Error(`Tenant with slug '${validatedConfig.slug}' already exists`);
		}

		// Get default plan configuration
		const planQuotas = DEFAULT_QUOTAS[validatedConfig.planType];

		// Create tenant object
		const now = new Date();
		const tenant: Tenant = {
			id: uuidv4(),
			name: validatedConfig.name,
			slug: validatedConfig.slug,
			status: TenantStatus.ACTIVE,
			isolation: validatedConfig.isolation,
			plan: {
				type: validatedConfig.planType,
				name: validatedConfig.planType,
				quotas: planQuotas,
				features: this.getDefaultFeatures(validatedConfig.planType),
			},
			settings: validatedConfig.settings ?? {
				timezone: 'UTC',
				locale: 'en',
				dateFormat: 'YYYY-MM-DD',
				timeFormat: 'HH:mm:ss',
				allowSignup: false,
				requireEmailVerification: true,
				sessionTimeout: 3600,
				mfa: { enabled: false, required: false },
				webhookRetryPolicy: { maxRetries: 3, retryDelay: 1000 },
			},
			branding: validatedConfig.branding,
			organizationId: validatedConfig.organizationId,
			parentTenantId: validatedConfig.parentTenantId,
			metadata: validatedConfig.metadata,
			createdAt: now,
			updatedAt: now,
		};

		// Validate tenant object
		TenantSchema.parse(tenant);

		// Insert into database
		const { data, error } = await this.supabase.from('tenants').insert({
			id: tenant.id,
			name: tenant.name,
			slug: tenant.slug,
			status: tenant.status,
			isolation: tenant.isolation,
			plan: tenant.plan,
			settings: tenant.settings,
			branding: tenant.branding,
			organization_id: tenant.organizationId,
			parent_tenant_id: tenant.parentTenantId,
			metadata: tenant.metadata,
			created_at: tenant.createdAt.toISOString(),
			updated_at: tenant.updatedAt.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to create tenant: ${error.message}`);
		}

		return tenant;
	}

	/**
	 * Update an existing tenant
	 */
	async update(tenantId: string, updates: UpdateTenantConfig): Promise<Tenant> {
		// Validate input
		const validatedUpdates = UpdateTenantConfigSchema.parse(updates);

		// Get current tenant
		const currentTenant = await this.getById(tenantId);
		if (!currentTenant) {
			throw new Error(`Tenant with id '${tenantId}' not found`);
		}

		// Merge updates
		const updatedTenant: Tenant = {
			...currentTenant,
			...validatedUpdates,
			updatedAt: new Date(),
		};

		// Validate updated tenant
		TenantSchema.parse(updatedTenant);

		// Update in database
		const { error } = await this.supabase
			.from('tenants')
			.update({
				name: updatedTenant.name,
				status: updatedTenant.status,
				plan: updatedTenant.plan,
				settings: updatedTenant.settings,
				branding: updatedTenant.branding,
				metadata: updatedTenant.metadata,
				updated_at: updatedTenant.updatedAt.toISOString(),
			})
			.eq('id', tenantId);

		if (error) {
			throw new Error(`Failed to update tenant: ${error.message}`);
		}

		return updatedTenant;
	}

	/**
	 * Delete a tenant (soft delete)
	 */
	async delete(tenantId: string): Promise<void> {
		const tenant = await this.getById(tenantId);
		if (!tenant) {
			throw new Error(`Tenant with id '${tenantId}' not found`);
		}

		const now = new Date();
		const { error } = await this.supabase
			.from('tenants')
			.update({
				status: TenantStatus.DELETED,
				deleted_at: now.toISOString(),
				updated_at: now.toISOString(),
			})
			.eq('id', tenantId);

		if (error) {
			throw new Error(`Failed to delete tenant: ${error.message}`);
		}
	}

	/**
	 * Suspend a tenant
	 */
	async suspend(tenantId: string): Promise<void> {
		const tenant = await this.getById(tenantId);
		if (!tenant) {
			throw new Error(`Tenant with id '${tenantId}' not found`);
		}

		const now = new Date();
		const { error } = await this.supabase
			.from('tenants')
			.update({
				status: TenantStatus.SUSPENDED,
				suspended_at: now.toISOString(),
				updated_at: now.toISOString(),
			})
			.eq('id', tenantId);

		if (error) {
			throw new Error(`Failed to suspend tenant: ${error.message}`);
		}
	}

	/**
	 * Resume a suspended tenant
	 */
	async resume(tenantId: string): Promise<void> {
		const tenant = await this.getById(tenantId);
		if (!tenant) {
			throw new Error(`Tenant with id '${tenantId}' not found`);
		}

		const now = new Date();
		const { error } = await this.supabase
			.from('tenants')
			.update({
				status: TenantStatus.ACTIVE,
				suspended_at: null,
				updated_at: now.toISOString(),
			})
			.eq('id', tenantId);

		if (error) {
			throw new Error(`Failed to resume tenant: ${error.message}`);
		}
	}

	/**
	 * Get tenant by domain
	 */
	async getTenantByDomain(domain: string): Promise<Tenant | null> {
		// First, check tenant_domains table
		const { data: domainData, error: domainError } = await this.supabase
			.from('tenant_domains')
			.select('tenant_id')
			.eq('domain', domain)
			.eq('verified', true)
			.single();

		if (domainError && domainError.code !== 'PGRST116') {
			// PGRST116 is "not found"
			throw new Error(`Failed to lookup domain: ${domainError.message}`);
		}

		if (domainData) {
			return this.getById(domainData.tenant_id);
		}

		// Check custom domain in branding
		const { data: tenantData, error: tenantError } = await this.supabase
			.from('tenants')
			.select('*')
			.eq('branding->customDomain', domain)
			.eq('status', TenantStatus.ACTIVE)
			.single();

		if (tenantError && tenantError.code !== 'PGRST116') {
			throw new Error(`Failed to lookup tenant by domain: ${tenantError.message}`);
		}

		if (!tenantData) {
			return null;
		}

		return this.mapToTenant(tenantData);
	}

	/**
	 * Get tenant by ID
	 */
	async getById(tenantId: string): Promise<Tenant | null> {
		const { data, error } = await this.supabase
			.from('tenants')
			.select('*')
			.eq('id', tenantId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get tenant: ${error.message}`);
		}

		return this.mapToTenant(data);
	}

	/**
	 * Get tenant by slug
	 */
	async getBySlug(slug: string): Promise<Tenant | null> {
		const { data, error } = await this.supabase
			.from('tenants')
			.select('*')
			.eq('slug', slug)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get tenant: ${error.message}`);
		}

		return this.mapToTenant(data);
	}

	/**
	 * List all tenants
	 */
	async list(filters?: {
		status?: TenantStatus;
		planType?: TenantPlanType;
		organizationId?: string;
	}): Promise<Tenant[]> {
		let query = this.supabase.from('tenants').select('*');

		if (filters?.status) {
			query = query.eq('status', filters.status);
		}

		if (filters?.planType) {
			query = query.eq('plan->type', filters.planType);
		}

		if (filters?.organizationId) {
			query = query.eq('organization_id', filters.organizationId);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to list tenants: ${error.message}`);
		}

		return (data ?? []).map((row) => this.mapToTenant(row));
	}

	/**
	 * Map database row to Tenant object
	 */
	private mapToTenant(row: Record<string, unknown>): Tenant {
		return TenantSchema.parse({
			id: row.id,
			name: row.name,
			slug: row.slug,
			status: row.status,
			isolation: row.isolation,
			plan: row.plan,
			settings: row.settings,
			branding: row.branding,
			organizationId: row.organization_id,
			parentTenantId: row.parent_tenant_id,
			metadata: row.metadata,
			createdAt: new Date(row.created_at as string),
			updatedAt: new Date(row.updated_at as string),
			suspendedAt: row.suspended_at ? new Date(row.suspended_at as string) : undefined,
			deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : undefined,
		});
	}

	/**
	 * Get default features for plan type
	 */
	private getDefaultFeatures(planType: TenantPlanType): string[] {
		const baseFeatures = ['workflows', 'executions', 'webhooks'];

		switch (planType) {
			case TenantPlanType.FREE:
				return [...baseFeatures];

			case TenantPlanType.STARTER:
				return [...baseFeatures, 'api', 'custom-branding'];

			case TenantPlanType.PROFESSIONAL:
				return [...baseFeatures, 'api', 'custom-branding', 'sso', 'advanced-security'];

			case TenantPlanType.ENTERPRISE:
				return [
					...baseFeatures,
					'api',
					'custom-branding',
					'sso',
					'advanced-security',
					'dedicated-resources',
					'sla',
					'priority-support',
				];

			case TenantPlanType.CUSTOM:
				return [
					...baseFeatures,
					'api',
					'custom-branding',
					'sso',
					'advanced-security',
					'dedicated-resources',
					'sla',
					'priority-support',
					'custom-features',
				];

			default:
				return baseFeatures;
		}
	}
}
