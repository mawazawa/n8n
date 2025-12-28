import { EventEmitter } from 'events';
import type { PermissionRole, ResourcePermission } from './types';
import { PermissionRoleSchema, ResourcePermissionSchema } from './types';

interface PermissionManagerOptions {
	defaultRole?: PermissionRole;
	allowPublicAccess?: boolean;
}

interface InviteData {
	id: string;
	resourceId: string;
	invitedBy: string;
	email: string;
	role: PermissionRole;
	expiresAt?: Date;
	createdAt: Date;
	accepted: boolean;
}

/**
 * Collaboration permission manager with roles and resource sharing
 */
export class PermissionManager extends EventEmitter {
	private permissions: Map<string, Map<string, ResourcePermission>>; // resourceId -> userId -> permission
	private invites: Map<string, InviteData>;
	private options: Required<PermissionManagerOptions>;

	constructor(options: PermissionManagerOptions = {}) {
		super();
		this.permissions = new Map();
		this.invites = new Map();
		this.options = {
			defaultRole: options.defaultRole ?? 'viewer',
			allowPublicAccess: options.allowPublicAccess ?? false,
		};
	}

	/**
	 * Grant permission to a user for a resource
	 */
	grant(resourceId: string, userId: string, role: PermissionRole): void {
		const permission: ResourcePermission = ResourcePermissionSchema.parse({
			userId,
			role,
			canEdit: role === 'owner' || role === 'editor',
			canComment: role !== 'viewer' || role === 'commenter',
			canShare: role === 'owner',
			canDelete: role === 'owner',
		});

		let resourcePermissions = this.permissions.get(resourceId);
		if (!resourcePermissions) {
			resourcePermissions = new Map();
			this.permissions.set(resourceId, resourcePermissions);
		}

		resourcePermissions.set(userId, permission);
		this.emit('permission_granted', { resourceId, userId, role });
	}

	/**
	 * Revoke permission from a user for a resource
	 */
	revoke(resourceId: string, userId: string): void {
		const resourcePermissions = this.permissions.get(resourceId);
		if (!resourcePermissions) {
			return;
		}

		resourcePermissions.delete(userId);
		this.emit('permission_revoked', { resourceId, userId });

		if (resourcePermissions.size === 0) {
			this.permissions.delete(resourceId);
		}
	}

	/**
	 * Update user's role for a resource
	 */
	updateRole(resourceId: string, userId: string, role: PermissionRole): void {
		const resourcePermissions = this.permissions.get(resourceId);
		if (!resourcePermissions) {
			throw new Error('Resource not found');
		}

		const permission = resourcePermissions.get(userId);
		if (!permission) {
			throw new Error('User permission not found');
		}

		permission.role = role;
		permission.canEdit = role === 'owner' || role === 'editor';
		permission.canComment = role !== 'viewer' || role === 'commenter';
		permission.canShare = role === 'owner';
		permission.canDelete = role === 'owner';

		resourcePermissions.set(userId, permission);
		this.emit('role_updated', { resourceId, userId, role });
	}

	/**
	 * Check if user has permission for a resource
	 */
	hasPermission(resourceId: string, userId: string): boolean {
		const resourcePermissions = this.permissions.get(resourceId);
		return resourcePermissions?.has(userId) ?? false;
	}

	/**
	 * Get user's permission for a resource
	 */
	getPermission(resourceId: string, userId: string): ResourcePermission | undefined {
		return this.permissions.get(resourceId)?.get(userId);
	}

	/**
	 * Get all permissions for a resource
	 */
	getResourcePermissions(resourceId: string): ResourcePermission[] {
		const resourcePermissions = this.permissions.get(resourceId);
		if (!resourcePermissions) {
			return [];
		}
		return Array.from(resourcePermissions.values());
	}

	/**
	 * Get all resources a user has access to
	 */
	getUserResources(userId: string): string[] {
		const resources: string[] = [];
		for (const [resourceId, resourcePermissions] of this.permissions) {
			if (resourcePermissions.has(userId)) {
				resources.push(resourceId);
			}
		}
		return resources;
	}

	/**
	 * Check if user can perform an action
	 */
	canEdit(resourceId: string, userId: string): boolean {
		return this.getPermission(resourceId, userId)?.canEdit ?? false;
	}

	canComment(resourceId: string, userId: string): boolean {
		return this.getPermission(resourceId, userId)?.canComment ?? false;
	}

	canShare(resourceId: string, userId: string): boolean {
		return this.getPermission(resourceId, userId)?.canShare ?? false;
	}

	canDelete(resourceId: string, userId: string): boolean {
		return this.getPermission(resourceId, userId)?.canDelete ?? false;
	}

	/**
	 * Create an invite for a resource
	 */
	createInvite(
		resourceId: string,
		invitedBy: string,
		email: string,
		role: PermissionRole,
		expiresIn?: number
	): InviteData {
		const invite: InviteData = {
			id: this.generateId(),
			resourceId,
			invitedBy,
			email,
			role,
			createdAt: new Date(),
			accepted: false,
			expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined,
		};

		this.invites.set(invite.id, invite);
		this.emit('invite_created', { invite });

		return invite;
	}

	/**
	 * Accept an invite
	 */
	acceptInvite(inviteId: string, userId: string): void {
		const invite = this.invites.get(inviteId);
		if (!invite) {
			throw new Error('Invite not found');
		}

		if (invite.accepted) {
			throw new Error('Invite already accepted');
		}

		if (invite.expiresAt && invite.expiresAt < new Date()) {
			throw new Error('Invite has expired');
		}

		invite.accepted = true;
		this.invites.set(inviteId, invite);

		// Grant permission to the user
		this.grant(invite.resourceId, userId, invite.role);

		this.emit('invite_accepted', { inviteId, userId, resourceId: invite.resourceId });
	}

	/**
	 * Revoke an invite
	 */
	revokeInvite(inviteId: string): void {
		const invite = this.invites.get(inviteId);
		if (!invite) {
			throw new Error('Invite not found');
		}

		this.invites.delete(inviteId);
		this.emit('invite_revoked', { inviteId });
	}

	/**
	 * Get invite by ID
	 */
	getInvite(inviteId: string): InviteData | undefined {
		return this.invites.get(inviteId);
	}

	/**
	 * Get all invites for a resource
	 */
	getResourceInvites(resourceId: string): InviteData[] {
		return Array.from(this.invites.values()).filter(
			(invite) => invite.resourceId === resourceId
		);
	}

	/**
	 * Get pending invites for a resource
	 */
	getPendingInvites(resourceId: string): InviteData[] {
		return this.getResourceInvites(resourceId).filter(
			(invite) =>
				!invite.accepted &&
				(!invite.expiresAt || invite.expiresAt > new Date())
		);
	}

	/**
	 * Transfer ownership of a resource
	 */
	transferOwnership(resourceId: string, currentOwnerId: string, newOwnerId: string): void {
		const currentPermission = this.getPermission(resourceId, currentOwnerId);
		if (!currentPermission || currentPermission.role !== 'owner') {
			throw new Error('Current user is not the owner');
		}

		// Downgrade current owner to editor
		this.updateRole(resourceId, currentOwnerId, 'editor');

		// Upgrade new owner
		const newPermission = this.getPermission(resourceId, newOwnerId);
		if (newPermission) {
			this.updateRole(resourceId, newOwnerId, 'owner');
		} else {
			this.grant(resourceId, newOwnerId, 'owner');
		}

		this.emit('ownership_transferred', {
			resourceId,
			previousOwner: currentOwnerId,
			newOwner: newOwnerId,
		});
	}

	/**
	 * Get resource owner
	 */
	getOwner(resourceId: string): string | undefined {
		const resourcePermissions = this.permissions.get(resourceId);
		if (!resourcePermissions) {
			return undefined;
		}

		for (const [userId, permission] of resourcePermissions) {
			if (permission.role === 'owner') {
				return userId;
			}
		}

		return undefined;
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Clear all permissions
	 */
	clear(): void {
		this.permissions.clear();
		this.invites.clear();
		this.emit('permissions_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a permission manager instance
 */
export function createPermissionManager(options?: PermissionManagerOptions): PermissionManager {
	return new PermissionManager(options);
}
