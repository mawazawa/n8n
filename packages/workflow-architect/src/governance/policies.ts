/**
 * Policy Management
 * Create, update, delete, and manage governance policies with version history
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  Policy,
  PolicySchema,
  PolicyVersion,
  PolicyEnforcementMode,
} from './types';

export interface PolicyFilters {
  enabled?: boolean;
  enforcement?: PolicyEnforcementMode;
  organizationId?: string;
  tags?: string[];
  search?: string;
}

export interface PolicyCreateInput {
  name: string;
  description: string;
  rules: Policy['rules'];
  enforcement: PolicyEnforcementMode;
  scope: Policy['scope'];
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PolicyUpdateInput {
  name?: string;
  description?: string;
  rules?: Policy['rules'];
  enforcement?: PolicyEnforcementMode;
  scope?: Policy['scope'];
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export class PolicyManager {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
  ) {}

  /**
   * Create a new policy
   */
  async create(input: PolicyCreateInput): Promise<Policy> {
    const now = new Date().toISOString();
    const policy: Policy = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      version: 1,
      rules: input.rules,
      enforcement: input.enforcement,
      scope: input.scope,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: this.userId,
      metadata: input.metadata,
    };

    // Validate policy
    PolicySchema.parse(policy);

    // Insert policy
    const { error: policyError } = await this.supabase
      .from('governance_policies')
      .insert({
        id: policy.id,
        name: policy.name,
        description: policy.description,
        version: policy.version,
        rules: policy.rules,
        enforcement: policy.enforcement,
        scope: policy.scope,
        enabled: policy.enabled,
        created_at: policy.createdAt,
        updated_at: policy.updatedAt,
        created_by: policy.createdBy,
        metadata: policy.metadata,
      });

    if (policyError) {
      throw new Error(`Failed to create policy: ${policyError.message}`);
    }

    // Create initial version
    await this.createVersion(policy, 'Initial version');

    return policy;
  }

  /**
   * Update an existing policy
   */
  async update(policyId: string, updates: PolicyUpdateInput, changeDescription?: string): Promise<void> {
    // Get current policy
    const { data: currentData, error: fetchError } = await this.supabase
      .from('governance_policies')
      .select('*')
      .eq('id', policyId)
      .single();

    if (fetchError || !currentData) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const current: Policy = {
      id: currentData.id,
      name: currentData.name,
      description: currentData.description,
      version: currentData.version,
      rules: currentData.rules,
      enforcement: currentData.enforcement,
      scope: currentData.scope,
      enabled: currentData.enabled,
      createdAt: currentData.created_at,
      updatedAt: currentData.updated_at,
      createdBy: currentData.created_by,
      metadata: currentData.metadata,
    };

    // Apply updates
    const updated: Policy = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated policy
    PolicySchema.parse(updated);

    // Update policy
    const { error: updateError } = await this.supabase
      .from('governance_policies')
      .update({
        name: updated.name,
        description: updated.description,
        version: updated.version,
        rules: updated.rules,
        enforcement: updated.enforcement,
        scope: updated.scope,
        enabled: updated.enabled,
        updated_at: updated.updatedAt,
        metadata: updated.metadata,
      })
      .eq('id', policyId);

    if (updateError) {
      throw new Error(`Failed to update policy: ${updateError.message}`);
    }

    // Create new version
    await this.createVersion(updated, changeDescription || 'Policy updated');
  }

  /**
   * Delete a policy
   */
  async delete(policyId: string): Promise<void> {
    // Soft delete by disabling
    const { error } = await this.supabase
      .from('governance_policies')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', policyId);

    if (error) {
      throw new Error(`Failed to delete policy: ${error.message}`);
    }
  }

  /**
   * List policies with optional filters
   */
  async list(filters?: PolicyFilters): Promise<Policy[]> {
    let query = this.supabase.from('governance_policies').select('*');

    if (filters?.enabled !== undefined) {
      query = query.eq('enabled', filters.enabled);
    }

    if (filters?.enforcement) {
      query = query.eq('enforcement', filters.enforcement);
    }

    if (filters?.organizationId) {
      query = query.contains('scope', { organizationIds: [filters.organizationId] });
    }

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list policies: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      rules: row.rules,
      enforcement: row.enforcement,
      scope: row.scope,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      metadata: row.metadata,
    }));
  }

  /**
   * Get a specific policy by ID
   */
  async get(policyId: string): Promise<Policy | null> {
    const { data, error } = await this.supabase
      .from('governance_policies')
      .select('*')
      .eq('id', policyId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      version: data.version,
      rules: data.rules,
      enforcement: data.enforcement,
      scope: data.scope,
      enabled: data.enabled,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      metadata: data.metadata,
    };
  }

  /**
   * Get version history for a policy
   */
  async getVersionHistory(policyId: string): Promise<PolicyVersion[]> {
    const { data, error } = await this.supabase
      .from('governance_policy_versions')
      .select('*')
      .eq('policy_id', policyId)
      .order('version', { ascending: false });

    if (error) {
      throw new Error(`Failed to get version history: ${error.message}`);
    }

    return (data || []).map((row) => ({
      policyId: row.policy_id,
      version: row.version,
      policy: row.policy_data,
      createdAt: row.created_at,
      createdBy: row.created_by,
      changeDescription: row.change_description,
    }));
  }

  /**
   * Restore a previous version
   */
  async restoreVersion(policyId: string, version: number): Promise<void> {
    // Get the version to restore
    const { data, error } = await this.supabase
      .from('governance_policy_versions')
      .select('policy_data')
      .eq('policy_id', policyId)
      .eq('version', version)
      .single();

    if (error || !data) {
      throw new Error(`Version ${version} not found`);
    }

    const restoredPolicy = data.policy_data as Policy;

    // Update current policy with restored data
    await this.update(
      policyId,
      {
        name: restoredPolicy.name,
        description: restoredPolicy.description,
        rules: restoredPolicy.rules,
        enforcement: restoredPolicy.enforcement,
        scope: restoredPolicy.scope,
        enabled: restoredPolicy.enabled,
        metadata: restoredPolicy.metadata,
      },
      `Restored from version ${version}`,
    );
  }

  /**
   * Get policies applicable to a specific resource
   */
  async getPoliciesForResource(
    resourceType: string,
    resourceId: string,
    organizationId?: string,
  ): Promise<Policy[]> {
    const { data, error } = await this.supabase
      .from('governance_policies')
      .select('*')
      .eq('enabled', true);

    if (error) {
      throw new Error(`Failed to get policies: ${error.message}`);
    }

    const policies = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      rules: row.rules,
      enforcement: row.enforcement,
      scope: row.scope,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      metadata: row.metadata,
    }));

    // Filter policies based on scope
    return policies.filter((policy) => {
      const scope = policy.scope;

      // Global policies apply to everything
      if (scope.global) {
        return true;
      }

      // Check resource type
      if (scope.resourceTypes && !scope.resourceTypes.includes(resourceType)) {
        return false;
      }

      // Check specific resource IDs
      if (scope.workflowIds && !scope.workflowIds.includes(resourceId)) {
        return false;
      }

      // Check organization
      if (organizationId && scope.organizationIds && !scope.organizationIds.includes(organizationId)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Create a version record
   */
  private async createVersion(policy: Policy, changeDescription: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_policy_versions')
      .insert({
        id: uuidv4(),
        policy_id: policy.id,
        version: policy.version,
        policy_data: policy,
        created_at: new Date().toISOString(),
        created_by: this.userId,
        change_description: changeDescription,
      });

    if (error) {
      throw new Error(`Failed to create version: ${error.message}`);
    }
  }
}
