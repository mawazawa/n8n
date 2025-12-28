/**
 * Data Retention Management
 * Automated data retention policies with legal hold support
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  RetentionPolicy,
  RetentionResult,
  DeletionCertificate,
  LegalHold,
  RetentionPolicySchema,
} from './types';

export class RetentionManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Set a retention policy
   */
  async setPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy> {
    const now = new Date().toISOString();
    const fullPolicy: RetentionPolicy = {
      ...policy,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    // Validate policy
    RetentionPolicySchema.parse(fullPolicy);

    const { error } = await this.supabase
      .from('governance_retention_policies')
      .insert({
        id: fullPolicy.id,
        name: fullPolicy.name,
        resource_type: fullPolicy.resourceType,
        duration: fullPolicy.duration,
        action: fullPolicy.action,
        legal_hold_exempt: fullPolicy.legalHoldExempt,
        enabled: fullPolicy.enabled,
        created_at: fullPolicy.createdAt,
        updated_at: fullPolicy.updatedAt,
      });

    if (error) {
      throw new Error(`Failed to create retention policy: ${error.message}`);
    }

    return fullPolicy;
  }

  /**
   * Apply retention policies
   */
  async applyRetention(): Promise<RetentionResult> {
    const policies = await this.getEnabledPolicies();
    const activeLegalHolds = await this.getActiveLegalHolds();

    let totalProcessed = 0;
    let totalDeleted = 0;
    let totalArchived = 0;
    let totalAnonymized = 0;
    let bytesFreed = 0;
    const certificates: DeletionCertificate[] = [];
    const errors: string[] = [];

    const startTime = Date.now();

    for (const policy of policies) {
      try {
        const resources = await this.getExpiredResources(policy);

        for (const resource of resources) {
          totalProcessed++;

          // Check if resource is under legal hold
          const isUnderLegalHold = this.isResourceUnderLegalHold(
            resource.id,
            activeLegalHolds,
            policy.legalHoldExempt,
          );

          if (isUnderLegalHold) {
            continue;
          }

          // Apply retention action
          switch (policy.action) {
            case 'delete':
              await this.deleteResource(resource);
              totalDeleted++;
              bytesFreed += resource.size || 0;
              certificates.push(await this.createDeletionCertificate(resource, policy.id));
              break;

            case 'archive':
              await this.archiveResource(resource);
              totalArchived++;
              break;

            case 'anonymize':
              await this.anonymizeResource(resource);
              totalAnonymized++;
              break;
          }
        }
      } catch (error) {
        errors.push(`Policy ${policy.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;

    return {
      policyId: 'bulk',
      policyName: 'All Policies',
      resourcesProcessed: totalProcessed,
      resourcesDeleted: totalDeleted,
      resourcesArchived: totalArchived,
      resourcesAnonymized: totalAnonymized,
      bytesFreed,
      deletionCertificates: certificates,
      errors,
      duration,
    };
  }

  /**
   * Create a legal hold
   */
  async createLegalHold(hold: Omit<LegalHold, 'id'>): Promise<LegalHold> {
    const fullHold: LegalHold = {
      ...hold,
      id: uuidv4(),
    };

    const { error } = await this.supabase
      .from('governance_legal_holds')
      .insert({
        id: fullHold.id,
        name: fullHold.name,
        description: fullHold.description,
        resource_ids: fullHold.resourceIds,
        start_date: fullHold.startDate,
        end_date: fullHold.endDate,
        custodian: fullHold.custodian,
        reason: fullHold.reason,
        active: fullHold.active,
      });

    if (error) {
      throw new Error(`Failed to create legal hold: ${error.message}`);
    }

    return fullHold;
  }

  /**
   * Release a legal hold
   */
  async releaseLegalHold(holdId: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_legal_holds')
      .update({
        active: false,
        end_date: new Date().toISOString(),
      })
      .eq('id', holdId);

    if (error) {
      throw new Error(`Failed to release legal hold: ${error.message}`);
    }
  }

  /**
   * Add resources to legal hold
   */
  async addToLegalHold(holdId: string, resourceIds: string[]): Promise<void> {
    const { data: hold, error: fetchError } = await this.supabase
      .from('governance_legal_holds')
      .select('resource_ids')
      .eq('id', holdId)
      .single();

    if (fetchError || !hold) {
      throw new Error('Legal hold not found');
    }

    const updatedIds = [...new Set([...hold.resource_ids, ...resourceIds])];

    const { error } = await this.supabase
      .from('governance_legal_holds')
      .update({ resource_ids: updatedIds })
      .eq('id', holdId);

    if (error) {
      throw new Error(`Failed to add resources to legal hold: ${error.message}`);
    }
  }

  /**
   * Get deletion certificate
   */
  async getDeletionCertificate(certificateId: string): Promise<DeletionCertificate | null> {
    const { data, error } = await this.supabase
      .from('governance_deletion_certificates')
      .select('*')
      .eq('id', certificateId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      resourceType: data.resource_type,
      resourceId: data.resource_id,
      deletedAt: data.deleted_at,
      deletedBy: data.deleted_by,
      retentionPolicyId: data.retention_policy_id,
      hash: data.hash,
      witness: data.witness,
    };
  }

  /**
   * Get enabled policies
   */
  private async getEnabledPolicies(): Promise<RetentionPolicy[]> {
    const { data, error } = await this.supabase
      .from('governance_retention_policies')
      .select('*')
      .eq('enabled', true);

    if (error) {
      throw new Error(`Failed to get policies: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      resourceType: row.resource_type,
      duration: row.duration,
      action: row.action,
      legalHoldExempt: row.legal_hold_exempt,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get active legal holds
   */
  private async getActiveLegalHolds(): Promise<LegalHold[]> {
    const { data, error } = await this.supabase
      .from('governance_legal_holds')
      .select('*')
      .eq('active', true);

    if (error) {
      throw new Error(`Failed to get legal holds: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      resourceIds: row.resource_ids,
      startDate: row.start_date,
      endDate: row.end_date,
      custodian: row.custodian,
      reason: row.reason,
      active: row.active,
    }));
  }

  /**
   * Get expired resources for a policy
   */
  private async getExpiredResources(policy: RetentionPolicy): Promise<Array<{
    id: string;
    type: string;
    createdAt: string;
    size?: number;
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.duration);

    // This is a simplified example - in reality, you would query specific tables
    // based on policy.resourceType
    const { data, error } = await this.supabase
      .from('workflow_executions')
      .select('id, created_at')
      .eq('workflow_id', policy.resourceType)
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      console.error(`Failed to get expired resources: ${error.message}`);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      type: policy.resourceType,
      createdAt: row.created_at,
    }));
  }

  /**
   * Check if resource is under legal hold
   */
  private isResourceUnderLegalHold(
    resourceId: string,
    legalHolds: LegalHold[],
    exemptFromHold: boolean,
  ): boolean {
    if (exemptFromHold) {
      return false;
    }

    return legalHolds.some((hold) => hold.resourceIds.includes(resourceId));
  }

  /**
   * Delete a resource
   */
  private async deleteResource(resource: { id: string; type: string }): Promise<void> {
    // Implementation depends on resource type
    // This is a placeholder
    console.log(`Deleting resource ${resource.id} of type ${resource.type}`);
  }

  /**
   * Archive a resource
   */
  private async archiveResource(resource: { id: string; type: string }): Promise<void> {
    // Implementation depends on resource type
    // This is a placeholder
    console.log(`Archiving resource ${resource.id} of type ${resource.type}`);
  }

  /**
   * Anonymize a resource
   */
  private async anonymizeResource(resource: { id: string; type: string }): Promise<void> {
    // Implementation depends on resource type
    // This is a placeholder
    console.log(`Anonymizing resource ${resource.id} of type ${resource.type}`);
  }

  /**
   * Create a deletion certificate
   */
  private async createDeletionCertificate(
    resource: { id: string; type: string },
    policyId: string,
  ): Promise<DeletionCertificate> {
    const certificate: DeletionCertificate = {
      id: uuidv4(),
      resourceType: resource.type,
      resourceId: resource.id,
      deletedAt: new Date().toISOString(),
      deletedBy: 'system',
      retentionPolicyId: policyId,
      hash: this.generateHash(resource),
    };

    const { error } = await this.supabase
      .from('governance_deletion_certificates')
      .insert({
        id: certificate.id,
        resource_type: certificate.resourceType,
        resource_id: certificate.resourceId,
        deleted_at: certificate.deletedAt,
        deleted_by: certificate.deletedBy,
        retention_policy_id: certificate.retentionPolicyId,
        hash: certificate.hash,
      });

    if (error) {
      console.error('Failed to create deletion certificate:', error);
    }

    return certificate;
  }

  /**
   * Generate cryptographic hash for deletion certificate
   */
  private generateHash(resource: { id: string; type: string }): string {
    const data = JSON.stringify({
      id: resource.id,
      type: resource.type,
      deletedAt: new Date().toISOString(),
    });

    return createHash('sha256').update(data).digest('hex');
  }
}
