/**
 * Privacy Controls
 * GDPR, CCPA compliance and Data Subject Access Request handling
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  GDPRSettings,
  CCPASettings,
  DSARRequest,
  DSARResult,
  DSARRequestSchema,
  DeletionCertificate,
} from './types';

export class PrivacyManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Configure GDPR settings
   */
  async configureGDPR(settings: GDPRSettings): Promise<void> {
    const { error } = await this.supabase
      .from('governance_privacy_settings')
      .upsert({
        id: 'gdpr',
        framework: 'gdpr',
        settings,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to configure GDPR: ${error.message}`);
    }
  }

  /**
   * Configure CCPA settings
   */
  async configureCCPA(settings: CCPASettings): Promise<void> {
    const { error } = await this.supabase
      .from('governance_privacy_settings')
      .upsert({
        id: 'ccpa',
        framework: 'ccpa',
        settings,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to configure CCPA: ${error.message}`);
    }
  }

  /**
   * Submit a Data Subject Access Request
   */
  async submitDSAR(
    type: DSARRequest['type'],
    userId: string,
    metadata?: Record<string, unknown>,
  ): Promise<DSARRequest> {
    const request: DSARRequest = {
      id: uuidv4(),
      type,
      userId,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      verificationStatus: 'unverified',
      metadata,
    };

    // Validate request
    DSARRequestSchema.parse(request);

    const { error } = await this.supabase
      .from('governance_dsar_requests')
      .insert({
        id: request.id,
        type: request.type,
        user_id: request.userId,
        requested_at: request.requestedAt,
        status: request.status,
        verification_status: request.verificationStatus,
        metadata: request.metadata,
      });

    if (error) {
      throw new Error(`Failed to submit DSAR: ${error.message}`);
    }

    return request;
  }

  /**
   * Verify DSAR request
   */
  async verifyDSAR(requestId: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_dsar_requests')
      .update({
        verification_status: 'verified',
        status: 'processing',
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(`Failed to verify DSAR: ${error.message}`);
    }
  }

  /**
   * Handle Data Subject Access Request
   */
  async handleDSAR(userId: string): Promise<DSARResult> {
    // Find pending verified request
    const { data: requestData, error: requestError } = await this.supabase
      .from('governance_dsar_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'processing')
      .eq('verification_status', 'verified')
      .order('requested_at', { ascending: false })
      .limit(1)
      .single();

    if (requestError || !requestData) {
      throw new Error('No verified DSAR request found for user');
    }

    const request = requestData as DSARRequest & { id: string; type: string };

    const processingDetails: string[] = [];
    let data: Record<string, unknown> | undefined;
    let deletionCertificates: DeletionCertificate[] | undefined;

    switch (request.type) {
      case 'access':
        data = await this.collectUserData(userId);
        processingDetails.push('Collected all user data from system');
        break;

      case 'deletion':
        deletionCertificates = await this.deleteUserData(userId);
        processingDetails.push('Deleted all user data from system');
        processingDetails.push('Generated deletion certificates for audit');
        break;

      case 'portability':
        data = await this.exportUserData(userId);
        processingDetails.push('Exported user data in portable format');
        break;

      case 'rectification':
        processingDetails.push('User data rectification requires manual review');
        break;

      case 'restriction':
        await this.restrictUserDataProcessing(userId);
        processingDetails.push('Restricted processing of user data');
        break;
    }

    const result: DSARResult = {
      requestId: request.id,
      type: request.type,
      userId,
      data,
      deletionCertificates,
      processingDetails,
      completedAt: new Date().toISOString(),
    };

    // Mark request as completed
    await this.supabase
      .from('governance_dsar_requests')
      .update({
        status: 'completed',
        completed_at: result.completedAt,
      })
      .eq('id', request.id);

    return result;
  }

  /**
   * Get GDPR settings
   */
  async getGDPRSettings(): Promise<GDPRSettings | null> {
    const { data, error } = await this.supabase
      .from('governance_privacy_settings')
      .select('settings')
      .eq('id', 'gdpr')
      .single();

    if (error || !data) {
      return null;
    }

    return data.settings as GDPRSettings;
  }

  /**
   * Get CCPA settings
   */
  async getCCPASettings(): Promise<CCPASettings | null> {
    const { data, error } = await this.supabase
      .from('governance_privacy_settings')
      .select('settings')
      .eq('id', 'ccpa')
      .single();

    if (error || !data) {
      return null;
    }

    return data.settings as CCPASettings;
  }

  /**
   * List DSAR requests
   */
  async listDSARs(userId?: string, status?: DSARRequest['status']): Promise<DSARRequest[]> {
    let query = this.supabase.from('governance_dsar_requests').select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('requested_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list DSARs: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      type: row.type,
      userId: row.user_id,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
      status: row.status,
      verificationStatus: row.verification_status,
      metadata: row.metadata,
    }));
  }

  /**
   * Collect all user data
   */
  private async collectUserData(userId: string): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      userId,
      collectedAt: new Date().toISOString(),
    };

    // Collect from various tables
    const tables = ['users', 'workflows', 'executions', 'credentials', 'settings'];

    for (const table of tables) {
      try {
        const { data: tableData, error } = await this.supabase
          .from(table)
          .select('*')
          .eq('user_id', userId);

        if (!error && tableData) {
          data[table] = tableData;
        }
      } catch (error) {
        console.error(`Failed to collect data from ${table}:`, error);
      }
    }

    return data;
  }

  /**
   * Delete all user data
   */
  private async deleteUserData(userId: string): Promise<DeletionCertificate[]> {
    const certificates: DeletionCertificate[] = [];
    const tables = ['workflows', 'executions', 'credentials', 'settings'];

    for (const table of tables) {
      try {
        // Get records to delete
        const { data: records } = await this.supabase
          .from(table)
          .select('id')
          .eq('user_id', userId);

        // Delete records
        const { error } = await this.supabase
          .from(table)
          .delete()
          .eq('user_id', userId);

        if (!error && records) {
          // Create certificates for each deleted record
          for (const record of records) {
            certificates.push({
              id: uuidv4(),
              resourceType: table,
              resourceId: record.id,
              deletedAt: new Date().toISOString(),
              deletedBy: 'dsar_handler',
              retentionPolicyId: 'dsar',
              hash: this.generateHash({ id: record.id, type: table }),
            });
          }
        }
      } catch (error) {
        console.error(`Failed to delete data from ${table}:`, error);
      }
    }

    // Store certificates
    for (const cert of certificates) {
      await this.supabase.from('governance_deletion_certificates').insert({
        id: cert.id,
        resource_type: cert.resourceType,
        resource_id: cert.resourceId,
        deleted_at: cert.deletedAt,
        deleted_by: cert.deletedBy,
        retention_policy_id: cert.retentionPolicyId,
        hash: cert.hash,
      });
    }

    return certificates;
  }

  /**
   * Export user data in portable format
   */
  private async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const data = await this.collectUserData(userId);

    // Transform to portable format (JSON)
    return {
      format: 'json',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * Restrict user data processing
   */
  private async restrictUserDataProcessing(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({
        data_processing_restricted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to restrict data processing: ${error.message}`);
    }
  }

  /**
   * Generate hash for deletion certificate
   */
  private generateHash(resource: { id: string; type: string }): string {
    const crypto = require('crypto');
    const data = JSON.stringify({
      id: resource.id,
      type: resource.type,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
