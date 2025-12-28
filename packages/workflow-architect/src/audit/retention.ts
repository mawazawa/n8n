/**
 * Audit Retention
 * Configurable retention policies for audit logs with archival and deletion
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  RetentionPolicy,
  RetentionResult,
  AuditEventType,
  AuditSeverity,
} from './types.js';

export interface RetentionConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Default retention policies
 */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    name: 'security-events',
    description: 'Security-critical events retained for 7 years',
    duration: 90, // 90 days in hot storage
    archiveAfter: 90,
    deleteAfter: 2555, // 7 years
    eventTypes: [
      'user.login' as AuditEventType,
      'user.login_failed' as AuditEventType,
      'user.logout' as AuditEventType,
      'permission.grant' as AuditEventType,
      'permission.revoke' as AuditEventType,
      'security.alert' as AuditEventType,
      'security.violation' as AuditEventType,
    ],
    severities: ['critical', 'error'],
  },
  {
    name: 'data-access',
    description: 'Data access events retained for 1 year',
    duration: 30, // 30 days in hot storage
    archiveAfter: 30,
    deleteAfter: 365,
    eventTypes: [
      'data.read' as AuditEventType,
      'data.export' as AuditEventType,
      'data.import' as AuditEventType,
    ],
  },
  {
    name: 'configuration-changes',
    description: 'Configuration changes retained for 2 years',
    duration: 60, // 60 days in hot storage
    archiveAfter: 60,
    deleteAfter: 730,
    eventTypes: [
      'config.update' as AuditEventType,
      'settings.change' as AuditEventType,
    ],
  },
  {
    name: 'general-events',
    description: 'General operational events retained for 90 days',
    duration: 30, // 30 days in hot storage
    archiveAfter: 30,
    deleteAfter: 90,
    severities: ['info'],
  },
  {
    name: 'system-events',
    description: 'System events retained for 30 days',
    duration: 7, // 7 days in hot storage
    archiveAfter: 7,
    deleteAfter: 30,
    eventTypes: [
      'system.start' as AuditEventType,
      'system.stop' as AuditEventType,
      'system.error' as AuditEventType,
    ],
  },
];

export class RetentionManager {
  private supabase: SupabaseClient;
  private policies: RetentionPolicy[];

  constructor(config: RetentionConfig, customPolicies?: RetentionPolicy[]) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.policies = customPolicies ?? DEFAULT_RETENTION_POLICIES;
  }

  /**
   * Add a custom retention policy
   */
  addPolicy(policy: RetentionPolicy): void {
    this.policies.push(policy);
  }

  /**
   * Remove a retention policy by name
   */
  removePolicy(name: string): void {
    this.policies = this.policies.filter((p) => p.name !== name);
  }

  /**
   * Get all retention policies
   */
  getPolicies(): RetentionPolicy[] {
    return [...this.policies];
  }

  /**
   * Apply all retention policies
   * This should be run periodically (e.g., daily via cron job)
   */
  async applyAllPolicies(): Promise<RetentionResult[]> {
    const results: RetentionResult[] = [];

    for (const policy of this.policies) {
      const result = await this.applyPolicy(policy);
      results.push(result);
    }

    return results;
  }

  /**
   * Apply a single retention policy
   */
  async applyPolicy(policy: RetentionPolicy): Promise<RetentionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let eventsArchived = 0;
    let eventsDeleted = 0;
    let bytesArchived = 0;
    let bytesDeleted = 0;

    try {
      // Archive old events
      if (policy.archiveAfter > 0) {
        const archiveResult = await this.archiveEvents(policy);
        eventsArchived = archiveResult.count;
        bytesArchived = archiveResult.bytes;
        errors.push(...archiveResult.errors);
      }

      // Delete very old events (if policy specifies)
      if (policy.deleteAfter !== undefined) {
        const deleteResult = await this.deleteEvents(policy);
        eventsDeleted = deleteResult.count;
        bytesDeleted = deleteResult.bytes;
        errors.push(...deleteResult.errors);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return {
      policyName: policy.name,
      eventsArchived,
      eventsDeleted,
      bytesArchived,
      bytesDeleted,
      duration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Archive events older than policy.archiveAfter days
   */
  private async archiveEvents(policy: RetentionPolicy): Promise<{
    count: number;
    bytes: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - policy.archiveAfter);

    try {
      // Build query for events to archive
      let query = this.supabase
        .from('audit_events')
        .select('*')
        .lt('timestamp', archiveDate.toISOString());

      // Apply event type filter
      if (policy.eventTypes) {
        query = query.in('event_type', policy.eventTypes);
      }

      // Apply severity filter
      if (policy.severities) {
        query = query.in('severity', policy.severities);
      }

      const { data: eventsToArchive, error: selectError } = await query;

      if (selectError) {
        errors.push(`Failed to select events for archival: ${selectError.message}`);
        return { count: 0, bytes: 0, errors };
      }

      if (!eventsToArchive || eventsToArchive.length === 0) {
        return { count: 0, bytes: 0, errors };
      }

      // Calculate size
      const bytes = JSON.stringify(eventsToArchive).length;

      // Insert into archive table
      const archiveRows = eventsToArchive.map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        event_type: event.event_type,
        severity: event.severity,
        actor_user_id: event.actor_user_id,
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        action: event.action,
        description: event.description,
        context: event.context,
        success: event.success,
        archived_at: new Date().toISOString(),
        original_data: event, // Store full event data
      }));

      const { error: insertError } = await this.supabase
        .from('audit_archive')
        .insert(archiveRows);

      if (insertError) {
        errors.push(`Failed to insert into archive: ${insertError.message}`);
        return { count: 0, bytes: 0, errors };
      }

      // Delete from main table
      const eventIds = eventsToArchive.map((e) => e.id);
      const { error: deleteError } = await this.supabase
        .from('audit_events')
        .delete()
        .in('id', eventIds);

      if (deleteError) {
        errors.push(`Failed to delete archived events: ${deleteError.message}`);
        // Note: Events are now in archive but also still in main table
        // Manual cleanup may be required
      }

      return {
        count: eventsToArchive.length,
        bytes,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error during archival');
      return { count: 0, bytes: 0, errors };
    }
  }

  /**
   * Delete events older than policy.deleteAfter days
   */
  private async deleteEvents(policy: RetentionPolicy): Promise<{
    count: number;
    bytes: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (policy.deleteAfter === undefined) {
      return { count: 0, bytes: 0, errors };
    }

    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - policy.deleteAfter);

    try {
      // Build query for events to delete from archive
      let query = this.supabase
        .from('audit_archive')
        .select('*', { count: 'exact', head: false })
        .lt('timestamp', deleteDate.toISOString());

      // Apply event type filter
      if (policy.eventTypes) {
        query = query.in('event_type', policy.eventTypes);
      }

      // Apply severity filter
      if (policy.severities) {
        query = query.in('severity', policy.severities);
      }

      // Get count and size before deletion
      const { data, error: selectError, count } = await query;

      if (selectError) {
        errors.push(`Failed to select events for deletion: ${selectError.message}`);
        return { count: 0, bytes: 0, errors };
      }

      if (!data || data.length === 0) {
        return { count: 0, bytes: 0, errors };
      }

      const bytes = JSON.stringify(data).length;

      // Delete from archive
      let deleteQuery = this.supabase
        .from('audit_archive')
        .delete()
        .lt('timestamp', deleteDate.toISOString());

      if (policy.eventTypes) {
        deleteQuery = deleteQuery.in('event_type', policy.eventTypes);
      }

      if (policy.severities) {
        deleteQuery = deleteQuery.in('severity', policy.severities);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        errors.push(`Failed to delete events: ${deleteError.message}`);
        return { count: 0, bytes: 0, errors };
      }

      return {
        count: count ?? 0,
        bytes,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error during deletion');
      return { count: 0, bytes: 0, errors };
    }
  }

  /**
   * Get statistics about current storage
   */
  async getStorageStats(): Promise<{
    hotStorage: { count: number; oldestEvent: string | null };
    coldStorage: { count: number; oldestEvent: string | null };
  }> {
    // Hot storage stats
    const { count: hotCount } = await this.supabase
      .from('audit_events')
      .select('*', { count: 'exact', head: true });

    const { data: oldestHot } = await this.supabase
      .from('audit_events')
      .select('timestamp')
      .order('timestamp', { ascending: true })
      .limit(1)
      .single();

    // Cold storage stats
    const { count: coldCount } = await this.supabase
      .from('audit_archive')
      .select('*', { count: 'exact', head: true });

    const { data: oldestCold } = await this.supabase
      .from('audit_archive')
      .select('timestamp')
      .order('timestamp', { ascending: true })
      .limit(1)
      .single();

    return {
      hotStorage: {
        count: hotCount ?? 0,
        oldestEvent: oldestHot?.timestamp ?? null,
      },
      coldStorage: {
        count: coldCount ?? 0,
        oldestEvent: oldestCold?.timestamp ?? null,
      },
    };
  }

  /**
   * Restore archived events back to hot storage
   */
  async restoreFromArchive(eventIds: string[]): Promise<{
    restored: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Get events from archive
      const { data: archivedEvents, error: selectError } = await this.supabase
        .from('audit_archive')
        .select('*')
        .in('id', eventIds);

      if (selectError) {
        errors.push(`Failed to select archived events: ${selectError.message}`);
        return { restored: 0, errors };
      }

      if (!archivedEvents || archivedEvents.length === 0) {
        return { restored: 0, errors };
      }

      // Insert back into main table
      const restoreRows = archivedEvents.map((archived) => archived.original_data);

      const { error: insertError } = await this.supabase
        .from('audit_events')
        .insert(restoreRows);

      if (insertError) {
        errors.push(`Failed to restore events: ${insertError.message}`);
        return { restored: 0, errors };
      }

      // Optionally delete from archive
      const { error: deleteError } = await this.supabase
        .from('audit_archive')
        .delete()
        .in('id', eventIds);

      if (deleteError) {
        errors.push(`Failed to delete from archive after restore: ${deleteError.message}`);
      }

      return {
        restored: archivedEvents.length,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error during restore');
      return { restored: 0, errors };
    }
  }
}
