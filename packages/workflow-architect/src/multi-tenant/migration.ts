import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migration resource types
 */
export type MigrationResourceType = 'workflow' | 'execution' | 'credential' | 'user' | 'all';

/**
 * Migration status
 */
export enum MigrationStatus {
	PENDING = 'PENDING',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * Migration job
 */
export interface MigrationJob {
	id: string;
	fromTenantId: string;
	toTenantId: string;
	resourceType: MigrationResourceType;
	resourceIds: string[];
	status: MigrationStatus;
	progress: number; // 0-100
	totalItems: number;
	completedItems: number;
	failedItems: number;
	error?: string;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
}

/**
 * Dependency graph node
 */
interface DependencyNode {
	id: string;
	type: MigrationResourceType;
	dependencies: string[];
}

/**
 * TenantMigration handles cross-tenant data migration
 */
export class TenantMigration {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Migrate resources from one tenant to another
	 */
	async migrate(
		fromTenantId: string,
		toTenantId: string,
		resources: {
			type: MigrationResourceType;
			ids?: string[];
		}[],
	): Promise<MigrationJob> {
		// Create migration job
		const job: MigrationJob = {
			id: uuidv4(),
			fromTenantId,
			toTenantId,
			resourceType: resources.length === 1 ? resources[0].type : 'all',
			resourceIds: resources.flatMap((r) => r.ids ?? []),
			status: MigrationStatus.PENDING,
			progress: 0,
			totalItems: 0,
			completedItems: 0,
			failedItems: 0,
			createdAt: new Date(),
		};

		// Save job
		await this.saveJob(job);

		// Execute migration in background
		this.executeMigration(job, resources).catch((error) => {
			console.error(`Migration job ${job.id} failed:`, error);
		});

		return job;
	}

	/**
	 * Execute migration job
	 */
	private async executeMigration(
		job: MigrationJob,
		resources: Array<{
			type: MigrationResourceType;
			ids?: string[];
		}>,
	): Promise<void> {
		try {
			// Update status to in progress
			job.status = MigrationStatus.IN_PROGRESS;
			job.startedAt = new Date();
			await this.saveJob(job);

			// Build dependency graph
			const dependencyGraph = await this.buildDependencyGraph(job.fromTenantId, resources);

			// Get topological order
			const migrationOrder = this.topologicalSort(dependencyGraph);

			// Calculate total items
			job.totalItems = migrationOrder.length;
			await this.saveJob(job);

			// Migrate resources in dependency order
			for (const node of migrationOrder) {
				try {
					await this.migrateResource(
						job.fromTenantId,
						job.toTenantId,
						node.type,
						node.id,
					);

					job.completedItems++;
					job.progress = (job.completedItems / job.totalItems) * 100;
					await this.saveJob(job);
				} catch (error) {
					job.failedItems++;
					console.error(
						`Failed to migrate ${node.type} ${node.id}:`,
						error instanceof Error ? error.message : String(error),
					);
				}
			}

			// Complete migration
			job.status = job.failedItems === 0 ? MigrationStatus.COMPLETED : MigrationStatus.FAILED;
			job.completedAt = new Date();
			job.progress = 100;
			await this.saveJob(job);
		} catch (error) {
			job.status = MigrationStatus.FAILED;
			job.error = error instanceof Error ? error.message : String(error);
			job.completedAt = new Date();
			await this.saveJob(job);
		}
	}

	/**
	 * Migrate a single resource
	 */
	private async migrateResource(
		fromTenantId: string,
		toTenantId: string,
		resourceType: MigrationResourceType,
		resourceId: string,
	): Promise<void> {
		switch (resourceType) {
			case 'workflow':
				await this.migrateWorkflow(fromTenantId, toTenantId, resourceId);
				break;
			case 'execution':
				await this.migrateExecution(fromTenantId, toTenantId, resourceId);
				break;
			case 'credential':
				await this.migrateCredential(fromTenantId, toTenantId, resourceId);
				break;
			case 'user':
				await this.migrateUser(fromTenantId, toTenantId, resourceId);
				break;
			default:
				throw new Error(`Unknown resource type: ${resourceType}`);
		}
	}

	/**
	 * Migrate workflow
	 */
	private async migrateWorkflow(
		fromTenantId: string,
		toTenantId: string,
		workflowId: string,
	): Promise<void> {
		// Fetch workflow
		const { data: workflow, error } = await this.supabase
			.from('workflows')
			.select('*')
			.eq('id', workflowId)
			.eq('tenant_id', fromTenantId)
			.single();

		if (error) {
			throw new Error(`Failed to fetch workflow: ${error.message}`);
		}

		// Create copy in new tenant
		const { error: insertError } = await this.supabase.from('workflows').insert({
			...workflow,
			id: uuidv4(), // New ID
			tenant_id: toTenantId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});

		if (insertError) {
			throw new Error(`Failed to migrate workflow: ${insertError.message}`);
		}
	}

	/**
	 * Migrate execution
	 */
	private async migrateExecution(
		fromTenantId: string,
		toTenantId: string,
		executionId: string,
	): Promise<void> {
		const { data: execution, error } = await this.supabase
			.from('executions')
			.select('*')
			.eq('id', executionId)
			.eq('tenant_id', fromTenantId)
			.single();

		if (error) {
			throw new Error(`Failed to fetch execution: ${error.message}`);
		}

		const { error: insertError } = await this.supabase.from('executions').insert({
			...execution,
			id: uuidv4(),
			tenant_id: toTenantId,
			created_at: new Date().toISOString(),
		});

		if (insertError) {
			throw new Error(`Failed to migrate execution: ${insertError.message}`);
		}
	}

	/**
	 * Migrate credential
	 */
	private async migrateCredential(
		fromTenantId: string,
		toTenantId: string,
		credentialId: string,
	): Promise<void> {
		const { data: credential, error } = await this.supabase
			.from('credentials')
			.select('*')
			.eq('id', credentialId)
			.eq('tenant_id', fromTenantId)
			.single();

		if (error) {
			throw new Error(`Failed to fetch credential: ${error.message}`);
		}

		const { error: insertError } = await this.supabase.from('credentials').insert({
			...credential,
			id: uuidv4(),
			tenant_id: toTenantId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});

		if (insertError) {
			throw new Error(`Failed to migrate credential: ${insertError.message}`);
		}
	}

	/**
	 * Migrate user
	 */
	private async migrateUser(
		fromTenantId: string,
		toTenantId: string,
		userId: string,
	): Promise<void> {
		const { data: user, error } = await this.supabase
			.from('users')
			.select('*')
			.eq('id', userId)
			.eq('tenant_id', fromTenantId)
			.single();

		if (error) {
			throw new Error(`Failed to fetch user: ${error.message}`);
		}

		// Check if user already exists in target tenant
		const { data: existing } = await this.supabase
			.from('users')
			.select('id')
			.eq('email', user.email)
			.eq('tenant_id', toTenantId)
			.single();

		if (existing) {
			// User already exists, skip
			return;
		}

		const { error: insertError } = await this.supabase.from('users').insert({
			...user,
			id: uuidv4(),
			tenant_id: toTenantId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});

		if (insertError) {
			throw new Error(`Failed to migrate user: ${insertError.message}`);
		}
	}

	/**
	 * Build dependency graph
	 */
	private async buildDependencyGraph(
		tenantId: string,
		resources: Array<{
			type: MigrationResourceType;
			ids?: string[];
		}>,
	): Promise<DependencyNode[]> {
		const nodes: DependencyNode[] = [];

		for (const resource of resources) {
			if (resource.type === 'all') {
				// Get all resources
				const allNodes = await this.getAllResourceNodes(tenantId);
				nodes.push(...allNodes);
			} else if (resource.ids && resource.ids.length > 0) {
				// Get specific resources
				for (const id of resource.ids) {
					const dependencies = await this.getResourceDependencies(
						tenantId,
						resource.type,
						id,
					);
					nodes.push({
						id,
						type: resource.type,
						dependencies,
					});
				}
			}
		}

		return nodes;
	}

	/**
	 * Get all resource nodes for a tenant
	 */
	private async getAllResourceNodes(tenantId: string): Promise<DependencyNode[]> {
		const nodes: DependencyNode[] = [];

		// This would fetch all resources
		// For now, return empty array
		console.log(`Getting all resources for tenant ${tenantId}`);

		return nodes;
	}

	/**
	 * Get resource dependencies
	 */
	private async getResourceDependencies(
		tenantId: string,
		resourceType: MigrationResourceType,
		resourceId: string,
	): Promise<string[]> {
		// This would analyze resource dependencies
		// For example, a workflow might depend on credentials
		console.log(`Getting dependencies for ${resourceType} ${resourceId} in tenant ${tenantId}`);
		return [];
	}

	/**
	 * Topological sort for dependency resolution
	 */
	private topologicalSort(nodes: DependencyNode[]): DependencyNode[] {
		const sorted: DependencyNode[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (node: DependencyNode): void => {
			if (visited.has(node.id)) {
				return;
			}

			if (visiting.has(node.id)) {
				throw new Error(`Circular dependency detected: ${node.id}`);
			}

			visiting.add(node.id);

			// Visit dependencies first
			for (const depId of node.dependencies) {
				const depNode = nodes.find((n) => n.id === depId);
				if (depNode) {
					visit(depNode);
				}
			}

			visiting.delete(node.id);
			visited.add(node.id);
			sorted.push(node);
		};

		for (const node of nodes) {
			visit(node);
		}

		return sorted;
	}

	/**
	 * Rollback migration
	 */
	async rollback(jobId: string): Promise<void> {
		const job = await this.getJob(jobId);

		if (!job) {
			throw new Error(`Migration job ${jobId} not found`);
		}

		if (job.status !== MigrationStatus.COMPLETED && job.status !== MigrationStatus.FAILED) {
			throw new Error(`Cannot rollback migration in status: ${job.status}`);
		}

		// Delete migrated resources from target tenant
		// This is a simplified version - a full implementation would track each migrated resource
		console.log(
			`Rolling back migration from ${job.fromTenantId} to ${job.toTenantId}`,
		);

		job.status = MigrationStatus.ROLLED_BACK;
		await this.saveJob(job);
	}

	/**
	 * Get migration job
	 */
	async getJob(jobId: string): Promise<MigrationJob | null> {
		const { data, error } = await this.supabase
			.from('migration_jobs')
			.select('*')
			.eq('id', jobId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get migration job: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return {
			id: data.id,
			fromTenantId: data.from_tenant_id,
			toTenantId: data.to_tenant_id,
			resourceType: data.resource_type,
			resourceIds: data.resource_ids,
			status: data.status,
			progress: data.progress,
			totalItems: data.total_items,
			completedItems: data.completed_items,
			failedItems: data.failed_items,
			error: data.error,
			createdAt: new Date(data.created_at),
			startedAt: data.started_at ? new Date(data.started_at) : undefined,
			completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
		};
	}

	/**
	 * Save migration job
	 */
	private async saveJob(job: MigrationJob): Promise<void> {
		await this.supabase.from('migration_jobs').upsert({
			id: job.id,
			from_tenant_id: job.fromTenantId,
			to_tenant_id: job.toTenantId,
			resource_type: job.resourceType,
			resource_ids: job.resourceIds,
			status: job.status,
			progress: job.progress,
			total_items: job.totalItems,
			completed_items: job.completedItems,
			failed_items: job.failedItems,
			error: job.error,
			created_at: job.createdAt.toISOString(),
			started_at: job.startedAt?.toISOString(),
			completed_at: job.completedAt?.toISOString(),
		});
	}

	/**
	 * Export tenant data
	 */
	async exportData(tenantId: string): Promise<Record<string, unknown>> {
		const data: Record<string, unknown> = {};

		// Export workflows
		const { data: workflows } = await this.supabase
			.from('workflows')
			.select('*')
			.eq('tenant_id', tenantId);
		data.workflows = workflows;

		// Export credentials
		const { data: credentials } = await this.supabase
			.from('credentials')
			.select('*')
			.eq('tenant_id', tenantId);
		data.credentials = credentials;

		// Export users
		const { data: users } = await this.supabase
			.from('users')
			.select('*')
			.eq('tenant_id', tenantId);
		data.users = users;

		return data;
	}

	/**
	 * Import tenant data
	 */
	async importData(tenantId: string, data: Record<string, unknown>): Promise<void> {
		// Import workflows
		if (data.workflows && Array.isArray(data.workflows)) {
			for (const workflow of data.workflows) {
				await this.supabase.from('workflows').insert({
					...workflow,
					id: uuidv4(),
					tenant_id: tenantId,
				});
			}
		}

		// Import credentials
		if (data.credentials && Array.isArray(data.credentials)) {
			for (const credential of data.credentials) {
				await this.supabase.from('credentials').insert({
					...credential,
					id: uuidv4(),
					tenant_id: tenantId,
				});
			}
		}

		// Import users
		if (data.users && Array.isArray(data.users)) {
			for (const user of data.users) {
				await this.supabase.from('users').insert({
					...user,
					id: uuidv4(),
					tenant_id: tenantId,
				});
			}
		}
	}
}
