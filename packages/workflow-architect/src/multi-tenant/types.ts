import { z } from 'zod';

/**
 * Tenant isolation levels
 */
export enum TenantIsolation {
	SHARED = 'SHARED',
	DEDICATED = 'DEDICATED',
	HYBRID = 'HYBRID',
}

/**
 * Tenant status
 */
export enum TenantStatus {
	ACTIVE = 'ACTIVE',
	SUSPENDED = 'SUSPENDED',
	PENDING = 'PENDING',
	DELETED = 'DELETED',
}

/**
 * Tenant plan types
 */
export enum TenantPlanType {
	FREE = 'FREE',
	STARTER = 'STARTER',
	PROFESSIONAL = 'PROFESSIONAL',
	ENTERPRISE = 'ENTERPRISE',
	CUSTOM = 'CUSTOM',
}

/**
 * Branding configuration schema
 */
export const BrandingConfigSchema = z.object({
	primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	logoUrl: z.string().url().optional(),
	faviconUrl: z.string().url().optional(),
	customDomain: z.string().optional(),
	companyName: z.string().min(1).max(255),
	customCss: z.string().optional(),
	emailTemplates: z
		.record(
			z.string(),
			z.object({
				subject: z.string(),
				html: z.string(),
				text: z.string(),
			}),
		)
		.optional(),
});

export type BrandingConfig = z.infer<typeof BrandingConfigSchema>;

/**
 * Quota configuration schema
 */
export const QuotasSchema = z.object({
	maxWorkflows: z.number().int().positive(),
	maxExecutions: z.number().int().positive(),
	maxUsers: z.number().int().positive(),
	maxStorage: z.number().int().positive(), // in bytes
	maxApiCalls: z.number().int().positive(),
	maxWebhooks: z.number().int().positive(),
	maxConcurrentExecutions: z.number().int().positive(),
});

export type Quotas = z.infer<typeof QuotasSchema>;

/**
 * Tenant plan schema
 */
export const TenantPlanSchema = z.object({
	type: z.nativeEnum(TenantPlanType),
	name: z.string().min(1).max(255),
	quotas: QuotasSchema,
	features: z.array(z.string()),
	price: z
		.object({
			monthly: z.number().nonnegative(),
			yearly: z.number().nonnegative(),
			currency: z.string().length(3),
		})
		.optional(),
});

export type TenantPlan = z.infer<typeof TenantPlanSchema>;

/**
 * Tenant settings schema
 */
export const TenantSettingsSchema = z.object({
	timezone: z.string().default('UTC'),
	locale: z.string().default('en'),
	dateFormat: z.string().default('YYYY-MM-DD'),
	timeFormat: z.string().default('HH:mm:ss'),
	allowSignup: z.boolean().default(false),
	requireEmailVerification: z.boolean().default(true),
	sessionTimeout: z.number().int().positive().default(3600), // in seconds
	mfa: z
		.object({
			enabled: z.boolean(),
			required: z.boolean(),
		})
		.default({ enabled: false, required: false }),
	ipWhitelist: z.array(z.string()).optional(),
	webhookRetryPolicy: z
		.object({
			maxRetries: z.number().int().nonnegative(),
			retryDelay: z.number().int().positive(),
		})
		.default({ maxRetries: 3, retryDelay: 1000 }),
});

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

/**
 * Tenant schema
 */
export const TenantSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(255),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	status: z.nativeEnum(TenantStatus),
	isolation: z.nativeEnum(TenantIsolation),
	plan: TenantPlanSchema,
	settings: TenantSettingsSchema,
	branding: BrandingConfigSchema.optional(),
	organizationId: z.string().uuid().optional(),
	parentTenantId: z.string().uuid().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
	suspendedAt: z.date().optional(),
	deletedAt: z.date().optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

/**
 * Organization schema (tenant hierarchy)
 */
export const OrganizationSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(255),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	tenants: z.array(TenantSchema),
	settings: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

/**
 * Tenant context
 */
export const TenantContextSchema = z.object({
	tenantId: z.string().uuid(),
	organizationId: z.string().uuid().optional(),
	userId: z.string().uuid().optional(),
	isolation: z.nativeEnum(TenantIsolation),
	timestamp: z.date(),
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

/**
 * Tenant creation config
 */
export const CreateTenantConfigSchema = z.object({
	name: z.string().min(1).max(255),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	isolation: z.nativeEnum(TenantIsolation).default(TenantIsolation.SHARED),
	planType: z.nativeEnum(TenantPlanType),
	settings: TenantSettingsSchema.optional(),
	branding: BrandingConfigSchema.optional(),
	organizationId: z.string().uuid().optional(),
	parentTenantId: z.string().uuid().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateTenantConfig = z.infer<typeof CreateTenantConfigSchema>;

/**
 * Tenant update config
 */
export const UpdateTenantConfigSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	status: z.nativeEnum(TenantStatus).optional(),
	plan: TenantPlanSchema.optional(),
	settings: TenantSettingsSchema.optional(),
	branding: BrandingConfigSchema.optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateTenantConfig = z.infer<typeof UpdateTenantConfigSchema>;

/**
 * Quota usage result
 */
export const QuotaResultSchema = z.object({
	resource: z.string(),
	current: z.number().int().nonnegative(),
	limit: z.number().int().positive(),
	available: z.number().int(),
	isExceeded: z.boolean(),
	percentageUsed: z.number().min(0).max(100),
});

export type QuotaResult = z.infer<typeof QuotaResultSchema>;

/**
 * Invoice schema
 */
export const InvoiceSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string().uuid(),
	amount: z.number().nonnegative(),
	currency: z.string().length(3),
	status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']),
	periodStart: z.date(),
	periodEnd: z.date(),
	dueDate: z.date(),
	paidAt: z.date().optional(),
	items: z.array(
		z.object({
			description: z.string(),
			quantity: z.number().positive(),
			unitPrice: z.number().nonnegative(),
			total: z.number().nonnegative(),
		}),
	),
	metadata: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * Backup manifest schema
 */
export const BackupManifestSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string().uuid(),
	type: z.enum(['FULL', 'INCREMENTAL']),
	status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']),
	size: z.number().int().nonnegative(),
	location: z.string(),
	checksum: z.string(),
	metadata: z.object({
		workflowCount: z.number().int().nonnegative(),
		userCount: z.number().int().nonnegative(),
		executionCount: z.number().int().nonnegative(),
	}),
	createdAt: z.date(),
	completedAt: z.date().optional(),
});

export type BackupManifest = z.infer<typeof BackupManifestSchema>;

/**
 * Tenant summary
 */
export const TenantSummarySchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	slug: z.string(),
	status: z.nativeEnum(TenantStatus),
	planType: z.nativeEnum(TenantPlanType),
	userCount: z.number().int().nonnegative(),
	workflowCount: z.number().int().nonnegative(),
	executionCount: z.number().int().nonnegative(),
	storageUsed: z.number().int().nonnegative(),
	lastActivity: z.date().optional(),
	createdAt: z.date(),
});

export type TenantSummary = z.infer<typeof TenantSummarySchema>;

/**
 * Tenant health status
 */
export const HealthSchema = z.object({
	status: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']),
	checks: z.array(
		z.object({
			name: z.string(),
			status: z.enum(['PASS', 'WARN', 'FAIL']),
			message: z.string().optional(),
			timestamp: z.date(),
		}),
	),
	metrics: z.object({
		cpu: z.number().min(0).max(100),
		memory: z.number().min(0).max(100),
		storage: z.number().min(0).max(100),
		errorRate: z.number().min(0).max(100),
	}),
	timestamp: z.date(),
});

export type Health = z.infer<typeof HealthSchema>;

/**
 * Tenant metrics
 */
export const MetricsSchema = z.object({
	tenantId: z.string().uuid(),
	period: z.object({
		start: z.date(),
		end: z.date(),
	}),
	executions: z.object({
		total: z.number().int().nonnegative(),
		successful: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		manual: z.number().int().nonnegative(),
		webhook: z.number().int().nonnegative(),
	}),
	workflows: z.object({
		total: z.number().int().nonnegative(),
		active: z.number().int().nonnegative(),
		inactive: z.number().int().nonnegative(),
	}),
	users: z.object({
		total: z.number().int().nonnegative(),
		active: z.number().int().nonnegative(),
		invited: z.number().int().nonnegative(),
	}),
	storage: z.object({
		total: z.number().int().nonnegative(),
		workflows: z.number().int().nonnegative(),
		executions: z.number().int().nonnegative(),
		credentials: z.number().int().nonnegative(),
	}),
	apiCalls: z.number().int().nonnegative(),
	webhooks: z.number().int().nonnegative(),
	cost: z
		.object({
			compute: z.number().nonnegative(),
			storage: z.number().nonnegative(),
			bandwidth: z.number().nonnegative(),
			total: z.number().nonnegative(),
		})
		.optional(),
});

export type Metrics = z.infer<typeof MetricsSchema>;

/**
 * SSO configuration schemas
 */
export const SAMLConfigSchema = z.object({
	enabled: z.boolean(),
	entryPoint: z.string().url(),
	issuer: z.string(),
	cert: z.string(),
	signatureAlgorithm: z.enum(['sha1', 'sha256', 'sha512']).default('sha256'),
	attributeMapping: z
		.object({
			email: z.string(),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			role: z.string().optional(),
		})
		.optional(),
});

export type SAMLConfig = z.infer<typeof SAMLConfigSchema>;

export const OIDCConfigSchema = z.object({
	enabled: z.boolean(),
	issuer: z.string().url(),
	clientId: z.string(),
	clientSecret: z.string(),
	authorizationURL: z.string().url(),
	tokenURL: z.string().url(),
	userInfoURL: z.string().url(),
	scope: z.array(z.string()).default(['openid', 'profile', 'email']),
	attributeMapping: z
		.object({
			email: z.string(),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			role: z.string().optional(),
		})
		.optional(),
});

export type OIDCConfig = z.infer<typeof OIDCConfigSchema>;

/**
 * Domain verification
 */
export const DomainSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string().uuid(),
	domain: z.string().regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/),
	verified: z.boolean(),
	verificationToken: z.string(),
	sslEnabled: z.boolean(),
	sslCertificate: z.string().optional(),
	sslPrivateKey: z.string().optional(),
	createdAt: z.date(),
	verifiedAt: z.date().optional(),
});

export type Domain = z.infer<typeof DomainSchema>;
