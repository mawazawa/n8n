import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuotaOverride, QuotaType } from './types';

/**
 * Configuration for quota override manager
 */
export interface QuotaOverrideManagerConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
}

/**
 * Manages per-user quota overrides
 *
 * Features:
 * - Set custom quotas for specific users
 * - Time-limited overrides
 * - Override expiration
 * - Audit trail
 * - Bulk operations
 *
 * @example
 * ```typescript
 * const overrideManager = new QuotaOverrideManager({ supabase });
 *
 * // Set a temporary override for a user
 * await overrideManager.setOverride({
 *   userId: 'user-123',
 *   quotaType: QuotaType.EXECUTIONS,
 *   limit: 50000,
 *   expiresAt: new Date('2024-12-31'),
 *   reason: 'Beta testing program',
 *   createdBy: 'admin-456',
 * });
 *
 * // Get all overrides for a user
 * const overrides = await overrideManager.getOverrides('user-123');
 *
 * // Clear an override
 * await overrideManager.clearOverride('user-123', QuotaType.EXECUTIONS);
 * ```
 */
export class QuotaOverrideManager {
	private readonly supabase: SupabaseClient;

	constructor(config: QuotaOverrideManagerConfig) {
		this.supabase = config.supabase;
	}

	/**
	 * Set a quota override for a user
	 *
	 * @param override - Override configuration
	 */
	async setOverride(
		override: Omit<QuotaOverride, 'createdAt'> & { createdAt?: Date },
	): Promise<void> {
		const now = new Date();

		// Check if override already exists
		const { data: existing } = await this.supabase
			.from('quota_overrides')
			.select('id')
			.eq('user_id', override.userId)
			.eq('quota_type', override.quotaType)
			.single();

		const overrideData = {
			user_id: override.userId,
			quota_type: override.quotaType,
			limit: override.limit,
			expires_at: override.expiresAt?.toISOString(),
			reason: override.reason,
			created_by: override.createdBy,
			created_at: (override.createdAt ?? now).toISOString(),
			updated_at: now.toISOString(),
		};

		if (existing) {
			// Update existing override
			const { error } = await this.supabase
				.from('quota_overrides')
				.update(overrideData)
				.eq('id', existing.id);

			if (error) {
				throw new Error(`Failed to update quota override: ${error.message}`);
			}
		} else {
			// Create new override
			const { error } = await this.supabase.from('quota_overrides').insert(overrideData);

			if (error) {
				throw new Error(`Failed to create quota override: ${error.message}`);
			}
		}
	}

	/**
	 * Get all active overrides for a user
	 *
	 * @param userId - User identifier
	 * @returns Array of active overrides
	 */
	async getOverrides(userId: string): Promise<QuotaOverride[]> {
		const now = new Date().toISOString();

		const { data, error } = await this.supabase
			.from('quota_overrides')
			.select('*')
			.eq('user_id', userId)
			.or(`expires_at.is.null,expires_at.gt.${now}`);

		if (error) {
			throw new Error(`Failed to fetch quota overrides: ${error.message}`);
		}

		return (
			data?.map((row) => ({
				userId: row.user_id,
				quotaType: row.quota_type as QuotaType,
				limit: row.limit,
				expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
				reason: row.reason,
				createdBy: row.created_by,
				createdAt: new Date(row.created_at),
			})) ?? []
		);
	}

	/**
	 * Get a specific override for a user and quota type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @returns Override or null if not found
	 */
	async getOverride(userId: string, quotaType: QuotaType): Promise<QuotaOverride | null> {
		const now = new Date().toISOString();

		const { data, error } = await this.supabase
			.from('quota_overrides')
			.select('*')
			.eq('user_id', userId)
			.eq('quota_type', quotaType)
			.or(`expires_at.is.null,expires_at.gt.${now}`)
			.single();

		if (error || !data) {
			return null;
		}

		return {
			userId: data.user_id,
			quotaType: data.quota_type as QuotaType,
			limit: data.limit,
			expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
			reason: data.reason,
			createdBy: data.created_by,
			createdAt: new Date(data.created_at),
		};
	}

	/**
	 * Clear a quota override
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 */
	async clearOverride(userId: string, quotaType: QuotaType): Promise<void> {
		const { error } = await this.supabase
			.from('quota_overrides')
			.delete()
			.eq('user_id', userId)
			.eq('quota_type', quotaType);

		if (error) {
			throw new Error(`Failed to clear quota override: ${error.message}`);
		}
	}

	/**
	 * Clear all overrides for a user
	 *
	 * @param userId - User identifier
	 */
	async clearAllOverrides(userId: string): Promise<void> {
		const { error } = await this.supabase
			.from('quota_overrides')
			.delete()
			.eq('user_id', userId);

		if (error) {
			throw new Error(`Failed to clear all quota overrides: ${error.message}`);
		}
	}

	/**
	 * Get all users with overrides
	 *
	 * @returns Array of user IDs
	 */
	async getUsersWithOverrides(): Promise<string[]> {
		const now = new Date().toISOString();

		const { data, error } = await this.supabase
			.from('quota_overrides')
			.select('user_id')
			.or(`expires_at.is.null,expires_at.gt.${now}`);

		if (error) {
			throw new Error(`Failed to fetch users with overrides: ${error.message}`);
		}

		// Get unique user IDs
		const userIds = new Set(data?.map((row) => row.user_id) ?? []);
		return Array.from(userIds);
	}

	/**
	 * Get all overrides (admin function)
	 *
	 * @param includeExpired - Whether to include expired overrides
	 * @returns Array of all overrides
	 */
	async getAllOverrides(includeExpired = false): Promise<QuotaOverride[]> {
		let query = this.supabase.from('quota_overrides').select('*');

		if (!includeExpired) {
			const now = new Date().toISOString();
			query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to fetch all quota overrides: ${error.message}`);
		}

		return (
			data?.map((row) => ({
				userId: row.user_id,
				quotaType: row.quota_type as QuotaType,
				limit: row.limit,
				expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
				reason: row.reason,
				createdBy: row.created_by,
				createdAt: new Date(row.created_at),
			})) ?? []
		);
	}

	/**
	 * Extend an override expiration
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @param newExpiresAt - New expiration date
	 */
	async extendOverride(
		userId: string,
		quotaType: QuotaType,
		newExpiresAt: Date,
	): Promise<void> {
		const { error } = await this.supabase
			.from('quota_overrides')
			.update({
				expires_at: newExpiresAt.toISOString(),
				updated_at: new Date().toISOString(),
			})
			.eq('user_id', userId)
			.eq('quota_type', quotaType);

		if (error) {
			throw new Error(`Failed to extend quota override: ${error.message}`);
		}
	}

	/**
	 * Make an override permanent (remove expiration)
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 */
	async makePermanent(userId: string, quotaType: QuotaType): Promise<void> {
		const { error } = await this.supabase
			.from('quota_overrides')
			.update({
				expires_at: null,
				updated_at: new Date().toISOString(),
			})
			.eq('user_id', userId)
			.eq('quota_type', quotaType);

		if (error) {
			throw new Error(`Failed to make quota override permanent: ${error.message}`);
		}
	}

	/**
	 * Bulk set overrides for multiple users
	 *
	 * @param overrides - Array of overrides to set
	 */
	async bulkSetOverrides(overrides: Array<Omit<QuotaOverride, 'createdAt'>>): Promise<void> {
		const now = new Date();

		const overrideData = overrides.map((override) => ({
			user_id: override.userId,
			quota_type: override.quotaType,
			limit: override.limit,
			expires_at: override.expiresAt?.toISOString(),
			reason: override.reason,
			created_by: override.createdBy,
			created_at: now.toISOString(),
			updated_at: now.toISOString(),
		}));

		// Use upsert to handle existing overrides
		const { error } = await this.supabase.from('quota_overrides').upsert(overrideData, {
			onConflict: 'user_id,quota_type',
		});

		if (error) {
			throw new Error(`Failed to bulk set quota overrides: ${error.message}`);
		}
	}

	/**
	 * Clean up expired overrides
	 *
	 * @returns Number of overrides deleted
	 */
	async cleanupExpired(): Promise<number> {
		const now = new Date().toISOString();

		const { data, error } = await this.supabase
			.from('quota_overrides')
			.delete()
			.lt('expires_at', now)
			.select();

		if (error) {
			throw new Error(`Failed to cleanup expired overrides: ${error.message}`);
		}

		return data?.length ?? 0;
	}

	/**
	 * Get override history for a user (including expired)
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota (optional)
	 * @returns Array of overrides including expired ones
	 */
	async getOverrideHistory(userId: string, quotaType?: QuotaType): Promise<QuotaOverride[]> {
		let query = this.supabase
			.from('quota_overrides')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		if (quotaType) {
			query = query.eq('quota_type', quotaType);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to fetch override history: ${error.message}`);
		}

		return (
			data?.map((row) => ({
				userId: row.user_id,
				quotaType: row.quota_type as QuotaType,
				limit: row.limit,
				expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
				reason: row.reason,
				createdBy: row.created_by,
				createdAt: new Date(row.created_at),
			})) ?? []
		);
	}
}

/**
 * Create a quota override manager instance
 *
 * @param supabase - Supabase client
 * @returns QuotaOverrideManager instance
 */
export function createQuotaOverrideManager(supabase: SupabaseClient): QuotaOverrideManager {
	return new QuotaOverrideManager({ supabase });
}
