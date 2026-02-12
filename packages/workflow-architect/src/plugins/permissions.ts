import { createClient } from '@supabase/supabase-js';
import type { PluginPermission } from './types';

/**
 * Permission request for user consent
 */
export interface PermissionRequest {
	id: string;
	pluginId: string;
	permission: PluginPermission;
	reason: string;
	requestedAt: Date;
	status: 'pending' | 'approved' | 'denied';
	userId?: string;
}

/**
 * Permission manager for plugin access control
 */
export class PermissionManager {
	private permissions = new Map<string, Set<PluginPermission>>();
	private pendingRequests = new Map<string, PermissionRequest>();
	private supabase: ReturnType<typeof createClient> | null = null;

	constructor(supabaseUrl?: string, supabaseKey?: string) {
		if (supabaseUrl && supabaseKey) {
			this.supabase = createClient(supabaseUrl, supabaseKey);
		}
	}

	/**
	 * Request permission for a plugin
	 */
	async requestPermission(
		pluginId: string,
		permission: PluginPermission,
		reason: string = '',
		userId?: string,
	): Promise<boolean> {
		// Check if already granted
		if (this.hasPermission(pluginId, permission)) {
			return true;
		}

		// Create permission request
		const request: PermissionRequest = {
			id: `${pluginId}-${permission}-${Date.now()}`,
			pluginId,
			permission,
			reason,
			requestedAt: new Date(),
			status: 'pending',
			userId,
		};

		// Store in database
		if (this.supabase) {
			const { error } = await this.supabase.from('plugin_permissions').insert({
				id: request.id,
				plugin_id: request.pluginId,
				permission: request.permission,
				reason: request.reason,
				requested_at: request.requestedAt.toISOString(),
				status: request.status,
				user_id: request.userId,
			});

			if (error) {
				console.error('Failed to store permission request:', error);
			}
		}

		// Store in memory for immediate access
		this.pendingRequests.set(request.id, request);

		// In a real implementation, this would trigger a UI prompt
		// For now, auto-approve non-sensitive permissions
		const autoApprovePermissions: PluginPermission[] = [
			PluginPermission.STORAGE,
			PluginPermission.NETWORK,
		];

		if (autoApprovePermissions.includes(permission)) {
			return this.approvePermission(request.id);
		}

		return false;
	}

	/**
	 * Approve a permission request
	 */
	async approvePermission(requestId: string): Promise<boolean> {
		const request = this.pendingRequests.get(requestId);
		if (!request) {
			return false;
		}

		request.status = 'approved';

		// Grant permission
		this.grantPermission(request.pluginId, request.permission);

		// Update database
		if (this.supabase) {
			await this.supabase
				.from('plugin_permissions')
				.update({ status: 'approved', approved_at: new Date().toISOString() })
				.eq('id', requestId);
		}

		// Remove from pending
		this.pendingRequests.delete(requestId);

		return true;
	}

	/**
	 * Deny a permission request
	 */
	async denyPermission(requestId: string): Promise<boolean> {
		const request = this.pendingRequests.get(requestId);
		if (!request) {
			return false;
		}

		request.status = 'denied';

		// Update database
		if (this.supabase) {
			await this.supabase
				.from('plugin_permissions')
				.update({ status: 'denied', denied_at: new Date().toISOString() })
				.eq('id', requestId);
		}

		// Remove from pending
		this.pendingRequests.delete(requestId);

		return true;
	}

	/**
	 * Grant permission to a plugin
	 */
	grantPermission(pluginId: string, permission: PluginPermission): void {
		let perms = this.permissions.get(pluginId);
		if (!perms) {
			perms = new Set();
			this.permissions.set(pluginId, perms);
		}
		perms.add(permission);
	}

	/**
	 * Revoke permission from a plugin
	 */
	revokePermission(pluginId: string, permission: PluginPermission): void {
		const perms = this.permissions.get(pluginId);
		if (perms) {
			perms.delete(permission);
			if (perms.size === 0) {
				this.permissions.delete(pluginId);
			}
		}
	}

	/**
	 * Check if plugin has permission
	 */
	hasPermission(pluginId: string, permission: PluginPermission): boolean {
		const perms = this.permissions.get(pluginId);
		return perms ? perms.has(permission) : false;
	}

	/**
	 * Get all permissions for a plugin
	 */
	getPermissions(pluginId: string): Set<PluginPermission> {
		return this.permissions.get(pluginId) || new Set();
	}

	/**
	 * Set permissions for a plugin (replacing existing)
	 */
	setPermissions(pluginId: string, permissions: PluginPermission[]): void {
		this.permissions.set(pluginId, new Set(permissions));
	}

	/**
	 * Clear all permissions for a plugin
	 */
	clearPermissions(pluginId: string): void {
		this.permissions.delete(pluginId);
	}

	/**
	 * Get pending permission requests
	 */
	getPendingRequests(pluginId?: string): PermissionRequest[] {
		const requests = Array.from(this.pendingRequests.values());
		if (pluginId) {
			return requests.filter((r) => r.pluginId === pluginId);
		}
		return requests;
	}

	/**
	 * Check permission level (for hierarchical permissions)
	 */
	checkPermissionLevel(pluginId: string, requiredPermission: PluginPermission): boolean {
		// ADMIN permission grants all other permissions
		if (this.hasPermission(pluginId, PluginPermission.ADMIN)) {
			return true;
		}

		return this.hasPermission(pluginId, requiredPermission);
	}

	/**
	 * Get permission risk level
	 */
	getPermissionRiskLevel(permission: PluginPermission): 'low' | 'medium' | 'high' {
		switch (permission) {
			case PluginPermission.STORAGE:
			case PluginPermission.NETWORK:
				return 'low';
			case PluginPermission.WORKFLOWS:
			case PluginPermission.EXECUTIONS:
			case PluginPermission.USERS:
				return 'medium';
			case PluginPermission.CREDENTIALS:
			case PluginPermission.ADMIN:
				return 'high';
			default:
				return 'medium';
		}
	}

	/**
	 * Get permission description
	 */
	getPermissionDescription(permission: PluginPermission): string {
		switch (permission) {
			case PluginPermission.NETWORK:
				return 'Make HTTP requests to external services';
			case PluginPermission.STORAGE:
				return 'Store and retrieve data locally';
			case PluginPermission.WORKFLOWS:
				return 'Access and manage workflows';
			case PluginPermission.CREDENTIALS:
				return 'Access stored credentials';
			case PluginPermission.EXECUTIONS:
				return 'View and manage workflow executions';
			case PluginPermission.USERS:
				return 'Access user information';
			case PluginPermission.ADMIN:
				return 'Full administrative access';
			default:
				return 'Unknown permission';
		}
	}

	/**
	 * Load permissions from database
	 */
	async loadPermissions(pluginId: string): Promise<void> {
		if (!this.supabase) {
			return;
		}

		const { data, error } = await this.supabase
			.from('plugin_permissions')
			.select('permission')
			.eq('plugin_id', pluginId)
			.eq('status', 'approved');

		if (error) {
			console.error('Failed to load permissions:', error);
			return;
		}

		if (data) {
			const permissions = data.map((row) => row.permission as PluginPermission);
			this.setPermissions(pluginId, permissions);
		}
	}

	/**
	 * Save permissions to database
	 */
	async savePermissions(pluginId: string): Promise<void> {
		if (!this.supabase) {
			return;
		}

		const permissions = this.getPermissions(pluginId);

		// Delete existing permissions
		await this.supabase.from('plugin_permissions').delete().eq('plugin_id', pluginId);

		// Insert new permissions
		if (permissions.size > 0) {
			const rows = Array.from(permissions).map((permission) => ({
				plugin_id: pluginId,
				permission,
				status: 'approved',
				approved_at: new Date().toISOString(),
			}));

			const { error } = await this.supabase.from('plugin_permissions').insert(rows);

			if (error) {
				console.error('Failed to save permissions:', error);
			}
		}
	}
}
