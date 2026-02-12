import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type BackupManifest, BackupManifestSchema } from './types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'node:crypto';

/**
 * Backup type
 */
export enum BackupType {
	FULL = 'FULL',
	INCREMENTAL = 'INCREMENTAL',
}

/**
 * Backup storage location
 */
export interface BackupStorage {
	provider: 'local' | 's3' | 'gcs' | 'azure';
	path: string;
	config?: Record<string, unknown>;
}

/**
 * Restore options
 */
export interface RestoreOptions {
	overwrite?: boolean;
	pointInTime?: Date;
	excludeResources?: string[];
}

/**
 * TenantBackup handles tenant backup and restore
 */
export class TenantBackup {
	private supabase: SupabaseClient;
	private storage: BackupStorage;

	constructor(supabaseUrl: string, supabaseKey: string, storage: BackupStorage) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.storage = storage;
	}

	/**
	 * Create a backup
	 */
	async backup(
		tenantId: string,
		options?: {
			type?: BackupType;
			incremental?: {
				since?: Date;
			};
		},
	): Promise<BackupManifest> {
		const backupType = options?.type ?? BackupType.FULL;

		// Create backup manifest
		const manifest: BackupManifest = {
			id: uuidv4(),
			tenantId,
			type: backupType,
			status: 'PENDING',
			size: 0,
			location: '',
			checksum: '',
			metadata: {
				workflowCount: 0,
				userCount: 0,
				executionCount: 0,
			},
			createdAt: new Date(),
		};

		try {
			// Update status to in progress
			manifest.status = 'IN_PROGRESS';
			await this.saveManifest(manifest);

			// Collect data to backup
			const data = await this.collectBackupData(tenantId, {
				incremental: backupType === BackupType.INCREMENTAL,
				since: options?.incremental?.since,
			});

			// Update metadata
			manifest.metadata = {
				workflowCount: data.workflows?.length ?? 0,
				userCount: data.users?.length ?? 0,
				executionCount: data.executions?.length ?? 0,
			};

			// Serialize data
			const serialized = JSON.stringify(data);
			manifest.size = Buffer.byteLength(serialized);

			// Calculate checksum
			manifest.checksum = this.calculateChecksum(serialized);

			// Store backup
			const location = await this.storeBackup(manifest.id, serialized);
			manifest.location = location;

			// Update status to completed
			manifest.status = 'COMPLETED';
			manifest.completedAt = new Date();
			await this.saveManifest(manifest);

			return BackupManifestSchema.parse(manifest);
		} catch (error) {
			manifest.status = 'FAILED';
			manifest.completedAt = new Date();
			await this.saveManifest(manifest);
			throw error;
		}
	}

	/**
	 * Restore from backup
	 */
	async restore(
		tenantId: string,
		backupId: string,
		options?: RestoreOptions,
	): Promise<void> {
		// Get backup manifest
		const manifest = await this.getManifest(backupId);
		if (!manifest) {
			throw new Error(`Backup ${backupId} not found`);
		}

		if (manifest.status !== 'COMPLETED') {
			throw new Error(`Cannot restore from incomplete backup: ${manifest.status}`);
		}

		// Load backup data
		const data = await this.loadBackup(manifest.location);

		// Verify checksum
		const checksum = this.calculateChecksum(data);
		if (checksum !== manifest.checksum) {
			throw new Error('Backup checksum mismatch - data may be corrupted');
		}

		// Parse backup data
		const parsed = JSON.parse(data) as Record<string, unknown>;

		// Restore data
		await this.restoreData(tenantId, parsed, options);
	}

	/**
	 * List backups for a tenant
	 */
	async listBackups(tenantId: string): Promise<BackupManifest[]> {
		const { data, error } = await this.supabase
			.from('tenant_backups')
			.select('*')
			.eq('tenant_id', tenantId)
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to list backups: ${error.message}`);
		}

		return (data ?? []).map((row) => this.mapToManifest(row));
	}

	/**
	 * Delete a backup
	 */
	async deleteBackup(backupId: string): Promise<void> {
		const manifest = await this.getManifest(backupId);
		if (!manifest) {
			throw new Error(`Backup ${backupId} not found`);
		}

		// Delete from storage
		await this.deleteFromStorage(manifest.location);

		// Delete from database
		const { error } = await this.supabase
			.from('tenant_backups')
			.delete()
			.eq('id', backupId);

		if (error) {
			throw new Error(`Failed to delete backup: ${error.message}`);
		}
	}

	/**
	 * Get backup manifest
	 */
	async getManifest(backupId: string): Promise<BackupManifest | null> {
		const { data, error } = await this.supabase
			.from('tenant_backups')
			.select('*')
			.eq('id', backupId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get backup manifest: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return this.mapToManifest(data);
	}

	/**
	 * Point-in-time recovery
	 */
	async restoreToPointInTime(tenantId: string, targetTime: Date): Promise<void> {
		// Get all backups before target time
		const { data: backups, error } = await this.supabase
			.from('tenant_backups')
			.select('*')
			.eq('tenant_id', tenantId)
			.eq('status', 'COMPLETED')
			.lte('created_at', targetTime.toISOString())
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get backups: ${error.message}`);
		}

		if (!backups || backups.length === 0) {
			throw new Error(`No backups found before ${targetTime.toISOString()}`);
		}

		// Find the last full backup
		const fullBackup = backups.find((b) => b.type === 'FULL');
		if (!fullBackup) {
			throw new Error('No full backup found for point-in-time recovery');
		}

		// Restore from full backup
		await this.restore(tenantId, fullBackup.id);

		// Apply incremental backups in order
		const incrementalBackups = backups
			.filter((b) => b.type === 'INCREMENTAL' && new Date(b.created_at) > new Date(fullBackup.created_at))
			.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

		for (const incrementalBackup of incrementalBackups) {
			await this.restore(tenantId, incrementalBackup.id, { overwrite: false });
		}
	}

	/**
	 * Collect data to backup
	 */
	private async collectBackupData(
		tenantId: string,
		options?: {
			incremental?: boolean;
			since?: Date;
		},
	): Promise<Record<string, unknown>> {
		const data: Record<string, unknown> = {};

		// Build query filters
		const filters: Record<string, unknown> = { tenant_id: tenantId };
		if (options?.incremental && options.since) {
			filters.updated_at = { gte: options.since.toISOString() };
		}

		// Backup workflows
		let workflowsQuery = this.supabase.from('workflows').select('*').eq('tenant_id', tenantId);
		if (options?.incremental && options.since) {
			workflowsQuery = workflowsQuery.gte('updated_at', options.since.toISOString());
		}
		const { data: workflows } = await workflowsQuery;
		data.workflows = workflows;

		// Backup credentials
		let credentialsQuery = this.supabase.from('credentials').select('*').eq('tenant_id', tenantId);
		if (options?.incremental && options.since) {
			credentialsQuery = credentialsQuery.gte('updated_at', options.since.toISOString());
		}
		const { data: credentials } = await credentialsQuery;
		data.credentials = credentials;

		// Backup users
		let usersQuery = this.supabase.from('users').select('*').eq('tenant_id', tenantId);
		if (options?.incremental && options.since) {
			usersQuery = usersQuery.gte('updated_at', options.since.toISOString());
		}
		const { data: users } = await usersQuery;
		data.users = users;

		// Backup executions (only for full backups or recent ones)
		if (!options?.incremental || options.since) {
			let executionsQuery = this.supabase
				.from('executions')
				.select('*')
				.eq('tenant_id', tenantId);
			if (options?.since) {
				executionsQuery = executionsQuery.gte('created_at', options.since.toISOString());
			}
			const { data: executions } = await executionsQuery;
			data.executions = executions;
		}

		// Backup tenant settings
		const { data: tenant } = await this.supabase
			.from('tenants')
			.select('*')
			.eq('id', tenantId)
			.single();
		data.tenant = tenant;

		return data;
	}

	/**
	 * Restore data
	 */
	private async restoreData(
		tenantId: string,
		data: Record<string, unknown>,
		options?: RestoreOptions,
	): Promise<void> {
		// Restore workflows
		if (data.workflows && Array.isArray(data.workflows)) {
			for (const workflow of data.workflows) {
				if (options?.excludeResources?.includes('workflows')) {
					continue;
				}

				if (options?.overwrite) {
					await this.supabase.from('workflows').upsert({
						...workflow,
						tenant_id: tenantId,
					});
				} else {
					await this.supabase.from('workflows').insert({
						...workflow,
						id: uuidv4(),
						tenant_id: tenantId,
					});
				}
			}
		}

		// Restore credentials
		if (data.credentials && Array.isArray(data.credentials)) {
			for (const credential of data.credentials) {
				if (options?.excludeResources?.includes('credentials')) {
					continue;
				}

				if (options?.overwrite) {
					await this.supabase.from('credentials').upsert({
						...credential,
						tenant_id: tenantId,
					});
				} else {
					await this.supabase.from('credentials').insert({
						...credential,
						id: uuidv4(),
						tenant_id: tenantId,
					});
				}
			}
		}

		// Restore users
		if (data.users && Array.isArray(data.users)) {
			for (const user of data.users) {
				if (options?.excludeResources?.includes('users')) {
					continue;
				}

				await this.supabase.from('users').upsert({
					...user,
					tenant_id: tenantId,
				});
			}
		}

		// Restore executions
		if (data.executions && Array.isArray(data.executions)) {
			for (const execution of data.executions) {
				if (options?.excludeResources?.includes('executions')) {
					continue;
				}

				await this.supabase.from('executions').insert({
					...execution,
					id: uuidv4(),
					tenant_id: tenantId,
				});
			}
		}
	}

	/**
	 * Store backup
	 */
	private async storeBackup(backupId: string, data: string): Promise<string> {
		const path = `backups/${backupId}.json`;

		if (this.storage.provider === 'local') {
			// Store locally (example)
			const location = `${this.storage.path}/${path}`;
			// fs.writeFileSync(location, data);
			return location;
		}

		// Store in Supabase storage
		const { error } = await this.supabase.storage
			.from('tenant-backups')
			.upload(path, Buffer.from(data));

		if (error) {
			throw new Error(`Failed to store backup: ${error.message}`);
		}

		return path;
	}

	/**
	 * Load backup
	 */
	private async loadBackup(location: string): Promise<string> {
		if (this.storage.provider === 'local') {
			// Load from local storage (example)
			// return fs.readFileSync(location, 'utf-8');
			return '';
		}

		// Load from Supabase storage
		const { data, error } = await this.supabase.storage.from('tenant-backups').download(location);

		if (error) {
			throw new Error(`Failed to load backup: ${error.message}`);
		}

		return await data.text();
	}

	/**
	 * Delete from storage
	 */
	private async deleteFromStorage(location: string): Promise<void> {
		if (this.storage.provider === 'local') {
			// Delete from local storage (example)
			// fs.unlinkSync(location);
			return;
		}

		// Delete from Supabase storage
		const { error } = await this.supabase.storage.from('tenant-backups').remove([location]);

		if (error) {
			throw new Error(`Failed to delete backup from storage: ${error.message}`);
		}
	}

	/**
	 * Calculate checksum
	 */
	private calculateChecksum(data: string): string {
		return crypto.createHash('sha256').update(data).digest('hex');
	}

	/**
	 * Save manifest
	 */
	private async saveManifest(manifest: BackupManifest): Promise<void> {
		await this.supabase.from('tenant_backups').upsert({
			id: manifest.id,
			tenant_id: manifest.tenantId,
			type: manifest.type,
			status: manifest.status,
			size: manifest.size,
			location: manifest.location,
			checksum: manifest.checksum,
			metadata: manifest.metadata,
			created_at: manifest.createdAt.toISOString(),
			completed_at: manifest.completedAt?.toISOString(),
		});
	}

	/**
	 * Map database row to manifest
	 */
	private mapToManifest(row: Record<string, unknown>): BackupManifest {
		return BackupManifestSchema.parse({
			id: row.id,
			tenantId: row.tenant_id,
			type: row.type,
			status: row.status,
			size: row.size,
			location: row.location,
			checksum: row.checksum,
			metadata: row.metadata,
			createdAt: new Date(row.created_at as string),
			completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
		});
	}

	/**
	 * Schedule automatic backups
	 */
	async scheduleBackup(
		tenantId: string,
		schedule: {
			frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
			type: BackupType;
			retention?: number; // Number of backups to keep
		},
	): Promise<void> {
		console.log(`Scheduling ${schedule.frequency} ${schedule.type} backups for tenant ${tenantId}`);
		// This would integrate with a job scheduler
	}
}
