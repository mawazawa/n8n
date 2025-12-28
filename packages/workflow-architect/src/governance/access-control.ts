/**
 * Fine-Grained Access Control
 * RBAC and ABAC support with resource-level permissions
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AccessPolicy, Permission, AccessCondition } from './types';

export class AccessController {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Check if user has access to perform action on resource
   */
  async checkAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    context?: {
      ip?: string;
      time?: string;
      location?: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    // Get user's roles
    const roles = await this.getUserRoles(userId);

    // Get access policy for resource
    const policy = await this.getAccessPolicy(resourceType, resourceId);

    if (!policy) {
      // No policy means no access
      return false;
    }

    // Check direct user permissions
    const userPermissions = policy.permissions.filter(
      (p) => p.principalType === 'user' && p.principalId === userId
    );

    for (const permission of userPermissions) {
      if (this.matchesAction(permission.actions, action)) {
        if (await this.evaluateConditions(permission.conditions, context)) {
          return true;
        }
      }
    }

    // Check role-based permissions
    for (const role of roles) {
      const rolePermissions = policy.permissions.filter(
        (p) => p.principalType === 'role' && p.principalId === role
      );

      for (const permission of rolePermissions) {
        if (this.matchesAction(permission.actions, action)) {
          if (await this.evaluateConditions(permission.conditions, context)) {
            return true;
          }
        }
      }
    }

    // Check inherited permissions
    if (policy.inheritFrom) {
      return this.checkAccess(userId, resourceType, policy.inheritFrom, action, context);
    }

    return false;
  }

  /**
   * Grant permission to user or role
   */
  async grantPermission(
    resourceType: string,
    resourceId: string,
    principalType: 'user' | 'role' | 'group',
    principalId: string,
    actions: string[],
    conditions?: AccessCondition[],
    expiresAt?: string,
  ): Promise<void> {
    let policy = await this.getAccessPolicy(resourceType, resourceId);

    const permission: Permission = {
      principalType,
      principalId,
      actions,
      conditions,
      expiresAt,
    };

    if (!policy) {
      // Create new policy
      policy = {
        resourceType,
        resourceId,
        permissions: [permission],
      };
    } else {
      // Add to existing policy
      policy.permissions.push(permission);
    }

    await this.storeAccessPolicy(policy);
  }

  /**
   * Revoke permission from user or role
   */
  async revokePermission(
    resourceType: string,
    resourceId: string,
    principalType: 'user' | 'role' | 'group',
    principalId: string,
    actions?: string[],
  ): Promise<void> {
    const policy = await this.getAccessPolicy(resourceType, resourceId);

    if (!policy) {
      return;
    }

    // Remove matching permissions
    policy.permissions = policy.permissions.filter((p) => {
      if (p.principalType !== principalType || p.principalId !== principalId) {
        return true;
      }

      if (!actions) {
        // Remove all permissions for this principal
        return false;
      }

      // Remove only specific actions
      p.actions = p.actions.filter((a) => !actions.includes(a));
      return p.actions.length > 0;
    });

    await this.storeAccessPolicy(policy);
  }

  /**
   * Get all permissions for a user on a resource
   */
  async getUserPermissions(
    userId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<string[]> {
    const roles = await this.getUserRoles(userId);
    const policy = await this.getAccessPolicy(resourceType, resourceId);

    if (!policy) {
      return [];
    }

    const actions = new Set<string>();

    // Collect user permissions
    policy.permissions
      .filter((p) => p.principalType === 'user' && p.principalId === userId)
      .forEach((p) => p.actions.forEach((a) => actions.add(a)));

    // Collect role permissions
    policy.permissions
      .filter((p) => p.principalType === 'role' && roles.includes(p.principalId))
      .forEach((p) => p.actions.forEach((a) => actions.add(a)));

    return Array.from(actions);
  }

  /**
   * List all resources user has access to
   */
  async listAccessibleResources(
    userId: string,
    resourceType: string,
    action: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('governance_access_policies')
      .select('resource_id, permissions')
      .eq('resource_type', resourceType);

    if (error) {
      throw new Error(`Failed to list resources: ${error.message}`);
    }

    const roles = await this.getUserRoles(userId);
    const accessible: string[] = [];

    for (const row of data || []) {
      const permissions = row.permissions as Permission[];

      const hasAccess = permissions.some((p) => {
        if (p.principalType === 'user' && p.principalId === userId) {
          return this.matchesAction(p.actions, action);
        }
        if (p.principalType === 'role' && roles.includes(p.principalId)) {
          return this.matchesAction(p.actions, action);
        }
        return false;
      });

      if (hasAccess) {
        accessible.push(row.resource_id);
      }
    }

    return accessible;
  }

  /**
   * Set inheritance for a resource
   */
  async setInheritance(
    resourceType: string,
    resourceId: string,
    inheritFrom: string,
  ): Promise<void> {
    const policy = await this.getAccessPolicy(resourceType, resourceId);

    if (!policy) {
      throw new Error('Policy not found');
    }

    policy.inheritFrom = inheritFrom;
    await this.storeAccessPolicy(policy);
  }

  /**
   * Get user's roles
   */
  private async getUserRoles(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to get user roles:', error);
      return [];
    }

    return (data || []).map((row) => row.role_id);
  }

  /**
   * Get access policy for resource
   */
  private async getAccessPolicy(
    resourceType: string,
    resourceId: string,
  ): Promise<AccessPolicy | null> {
    const { data, error } = await this.supabase
      .from('governance_access_policies')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      resourceType: data.resource_type,
      resourceId: data.resource_id,
      permissions: data.permissions,
      inheritFrom: data.inherit_from,
    };
  }

  /**
   * Store access policy
   */
  private async storeAccessPolicy(policy: AccessPolicy): Promise<void> {
    const { error } = await this.supabase
      .from('governance_access_policies')
      .upsert({
        resource_type: policy.resourceType,
        resource_id: policy.resourceId,
        permissions: policy.permissions,
        inherit_from: policy.inheritFrom,
      });

    if (error) {
      throw new Error(`Failed to store policy: ${error.message}`);
    }
  }

  /**
   * Check if action matches allowed actions
   */
  private matchesAction(allowedActions: string[], requestedAction: string): boolean {
    // Support wildcards
    return allowedActions.some((allowed) => {
      if (allowed === '*') {
        return true;
      }
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1);
        return requestedAction.startsWith(prefix);
      }
      return allowed === requestedAction;
    });
  }

  /**
   * Evaluate access conditions
   */
  private async evaluateConditions(
    conditions: AccessCondition[] | undefined,
    context?: {
      ip?: string;
      time?: string;
      location?: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    if (!context) {
      return false;
    }

    for (const condition of conditions) {
      switch (condition.type) {
        case 'time_based':
          if (!this.evaluateTimeCondition(condition.config, context.time)) {
            return false;
          }
          break;

        case 'ip_based':
          if (!this.evaluateIpCondition(condition.config, context.ip)) {
            return false;
          }
          break;

        case 'location_based':
          if (!this.evaluateLocationCondition(condition.config, context.location)) {
            return false;
          }
          break;

        case 'attribute_based':
          if (!this.evaluateAttributeCondition(condition.config, context.attributes)) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  /**
   * Evaluate time-based condition
   */
  private evaluateTimeCondition(config: Record<string, unknown>, time?: string): boolean {
    if (!time) {
      return false;
    }

    const currentTime = new Date(time);
    const currentHour = currentTime.getHours();

    if (config.startHour && config.endHour) {
      const start = Number(config.startHour);
      const end = Number(config.endHour);
      return currentHour >= start && currentHour < end;
    }

    return true;
  }

  /**
   * Evaluate IP-based condition
   */
  private evaluateIpCondition(config: Record<string, unknown>, ip?: string): boolean {
    if (!ip) {
      return false;
    }

    if (config.allowedIps && Array.isArray(config.allowedIps)) {
      return config.allowedIps.includes(ip);
    }

    if (config.blockedIps && Array.isArray(config.blockedIps)) {
      return !config.blockedIps.includes(ip);
    }

    return true;
  }

  /**
   * Evaluate location-based condition
   */
  private evaluateLocationCondition(config: Record<string, unknown>, location?: string): boolean {
    if (!location) {
      return false;
    }

    if (config.allowedCountries && Array.isArray(config.allowedCountries)) {
      return config.allowedCountries.includes(location);
    }

    return true;
  }

  /**
   * Evaluate attribute-based condition
   */
  private evaluateAttributeCondition(
    config: Record<string, unknown>,
    attributes?: Record<string, unknown>,
  ): boolean {
    if (!attributes) {
      return false;
    }

    if (config.requiredAttributes && typeof config.requiredAttributes === 'object') {
      const required = config.requiredAttributes as Record<string, unknown>;
      for (const [key, value] of Object.entries(required)) {
        if (attributes[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }
}
