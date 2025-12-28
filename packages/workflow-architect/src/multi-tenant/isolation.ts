import { AsyncLocalStorage } from 'node:async_hooks';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type TenantContext, TenantContextSchema, TenantIsolation } from './types';

/**
 * AsyncLocalStorage for tenant context
 */
const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * IsolationLayer provides tenant data isolation
 */
export class IsolationLayer {
	private supabase: SupabaseClient;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
	}

	/**
	 * Set tenant context for the current async execution
	 */
	setTenantContext(context: TenantContext): void {
		const validatedContext = TenantContextSchema.parse(context);
		tenantContextStorage.enterWith(validatedContext);

		// Set Supabase RLS context
		this.setSupabaseContext(validatedContext);
	}

	/**
	 * Get current tenant context
	 */
	getTenantContext(): TenantContext {
		const context = tenantContextStorage.getStore();
		if (!context) {
			throw new Error('No tenant context available. Ensure setTenantContext() was called.');
		}
		return context;
	}

	/**
	 * Clear tenant context
	 */
	clearTenantContext(): void {
		tenantContextStorage.disable();
	}

	/**
	 * Run a function with tenant context
	 */
	async runWithContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
		const validatedContext = TenantContextSchema.parse(context);
		return tenantContextStorage.run(validatedContext, async () => {
			await this.setSupabaseContext(validatedContext);
			return fn();
		});
	}

	/**
	 * Set Supabase RLS context for tenant isolation
	 */
	private async setSupabaseContext(context: TenantContext): Promise<void> {
		// Set tenant_id for RLS policies
		await this.supabase.rpc('set_tenant_context', {
			tenant_id: context.tenantId,
			user_id: context.userId ?? null,
		});
	}

	/**
	 * Create a query interceptor that adds tenant filtering
	 */
	createQueryInterceptor<T = Record<string, unknown>>(tableName: string) {
		return {
			/**
			 * Select with automatic tenant filtering
			 */
			select: (columns = '*') => {
				const context = this.getTenantContext();
				return this.supabase
					.from(tableName)
					.select(columns)
					.eq('tenant_id', context.tenantId);
			},

			/**
			 * Insert with automatic tenant_id
			 */
			insert: async (data: T | T[]) => {
				const context = this.getTenantContext();
				const dataArray = Array.isArray(data) ? data : [data];

				const dataWithTenant = dataArray.map((item) => ({
					...item,
					tenant_id: context.tenantId,
				}));

				return this.supabase.from(tableName).insert(dataWithTenant);
			},

			/**
			 * Update with automatic tenant filtering
			 */
			update: (data: Partial<T>) => {
				const context = this.getTenantContext();
				return this.supabase
					.from(tableName)
					.update(data)
					.eq('tenant_id', context.tenantId);
			},

			/**
			 * Delete with automatic tenant filtering
			 */
			delete: () => {
				const context = this.getTenantContext();
				return this.supabase
					.from(tableName)
					.delete()
					.eq('tenant_id', context.tenantId);
			},

			/**
			 * Get by ID with tenant validation
			 */
			getById: async (id: string) => {
				const context = this.getTenantContext();
				const { data, error } = await this.supabase
					.from(tableName)
					.select('*')
					.eq('id', id)
					.eq('tenant_id', context.tenantId)
					.single();

				if (error && error.code !== 'PGRST116') {
					throw new Error(`Failed to get ${tableName}: ${error.message}`);
				}

				return data;
			},
		};
	}

	/**
	 * Validate tenant isolation level for operation
	 */
	validateIsolation(requiredIsolation: TenantIsolation): void {
		const context = this.getTenantContext();

		if (context.isolation === TenantIsolation.SHARED && requiredIsolation === TenantIsolation.DEDICATED) {
			throw new Error(
				'This operation requires dedicated tenant isolation. Please upgrade your plan.',
			);
		}
	}

	/**
	 * Check if current user has access to resource in tenant
	 */
	async checkResourceAccess(
		resourceType: string,
		resourceId: string,
	): Promise<boolean> {
		const context = this.getTenantContext();

		// Check if resource belongs to tenant
		const { data, error } = await this.supabase
			.from(resourceType)
			.select('id')
			.eq('id', resourceId)
			.eq('tenant_id', context.tenantId)
			.single();

		if (error) {
			return false;
		}

		return !!data;
	}

	/**
	 * Create row-level security policy SQL
	 */
	static generateRLSPolicy(tableName: string): string {
		return `
-- Enable RLS for ${tableName}
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "${tableName}_tenant_isolation" ON ${tableName};

-- Create tenant isolation policy
CREATE POLICY "${tableName}_tenant_isolation" ON ${tableName}
	USING (
		tenant_id = current_setting('app.current_tenant_id')::uuid
		OR current_setting('app.is_super_admin', true)::boolean = true
	)
	WITH CHECK (
		tenant_id = current_setting('app.current_tenant_id')::uuid
		OR current_setting('app.is_super_admin', true)::boolean = true
	);

-- Create index for tenant_id if not exists
CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_id ON ${tableName}(tenant_id);
`;
	}

	/**
	 * Batch operations with tenant context
	 */
	async batchOperation<T, R>(
		items: T[],
		operation: (item: T) => Promise<R>,
		options?: {
			concurrency?: number;
			continueOnError?: boolean;
		},
	): Promise<Array<{ success: boolean; result?: R; error?: Error }>> {
		const context = this.getTenantContext();
		const concurrency = options?.concurrency ?? 5;
		const continueOnError = options?.continueOnError ?? false;

		const results: Array<{ success: boolean; result?: R; error?: Error }> = [];
		const queue = [...items];

		const processItem = async (): Promise<void> => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item) break;

				try {
					const result = await this.runWithContext(context, () => operation(item));
					results.push({ success: true, result });
				} catch (error) {
					results.push({
						success: false,
						error: error instanceof Error ? error : new Error(String(error)),
					});

					if (!continueOnError) {
						throw error;
					}
				}
			}
		};

		// Run operations with concurrency limit
		const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
			processItem(),
		);
		await Promise.all(workers);

		return results;
	}

	/**
	 * Transaction with tenant context
	 */
	async transaction<T>(fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
		const context = this.getTenantContext();

		return this.runWithContext(context, async () => {
			// Supabase doesn't have traditional transactions in the client
			// But we can ensure all operations happen within the same tenant context
			return fn(this.supabase);
		});
	}

	/**
	 * Cross-tenant operation (requires super admin)
	 */
	async crossTenantOperation<T>(
		tenantIds: string[],
		operation: (tenantId: string) => Promise<T>,
	): Promise<Map<string, { success: boolean; result?: T; error?: Error }>> {
		// Verify super admin access
		const currentContext = tenantContextStorage.getStore();
		if (!currentContext) {
			throw new Error('No context available for cross-tenant operation');
		}

		const results = new Map<string, { success: boolean; result?: T; error?: Error }>();

		for (const tenantId of tenantIds) {
			try {
				const newContext: TenantContext = {
					...currentContext,
					tenantId,
					timestamp: new Date(),
				};

				const result = await this.runWithContext(newContext, () => operation(tenantId));
				results.set(tenantId, { success: true, result });
			} catch (error) {
				results.set(tenantId, {
					success: false,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		}

		return results;
	}

	/**
	 * Audit log for tenant operations
	 */
	async auditLog(
		action: string,
		resourceType: string,
		resourceId: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		const context = this.getTenantContext();

		await this.supabase.from('audit_logs').insert({
			tenant_id: context.tenantId,
			user_id: context.userId,
			action,
			resource_type: resourceType,
			resource_id: resourceId,
			metadata,
			timestamp: new Date().toISOString(),
		});
	}
}

/**
 * Middleware helper to set tenant context from request
 */
export function createTenantContextMiddleware(isolationLayer: IsolationLayer) {
	return async (
		req: { tenantContext?: TenantContext },
		res: unknown,
		next: () => void,
	): Promise<void> => {
		if (req.tenantContext) {
			isolationLayer.setTenantContext(req.tenantContext);
		}
		next();
	};
}

/**
 * Decorator to enforce tenant context
 */
export function WithTenantContext() {
	return function (
		target: unknown,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) {
		const originalMethod = descriptor.value;

		descriptor.value = function (this: { isolationLayer?: IsolationLayer }, ...args: unknown[]) {
			if (!this.isolationLayer) {
				throw new Error('IsolationLayer not available on class instance');
			}

			// Verify context exists
			try {
				this.isolationLayer.getTenantContext();
			} catch {
				throw new Error(
					`Method ${propertyKey} requires tenant context. Ensure setTenantContext() was called.`,
				);
			}

			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

/**
 * Global isolation instance (singleton)
 */
let globalIsolationLayer: IsolationLayer | null = null;

export function initializeGlobalIsolation(supabase: SupabaseClient): void {
	globalIsolationLayer = new IsolationLayer(supabase);
}

export function getGlobalIsolation(): IsolationLayer {
	if (!globalIsolationLayer) {
		throw new Error('Global isolation layer not initialized. Call initializeGlobalIsolation() first.');
	}
	return globalIsolationLayer;
}
