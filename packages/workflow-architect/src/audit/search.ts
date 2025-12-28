/**
 * Audit Search
 * Full-text search and filtering for audit logs
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditEvent,
  AuditQuery,
  AuditSearchResult,
  AuditEventRow,
} from './types.js';
import { AuditQuerySchema } from './types.js';

export interface SearchConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export class AuditSearch {
  private supabase: SupabaseClient;

  constructor(config: SearchConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Search audit events with full-text search and filters
   */
  async search(query: AuditQuery): Promise<AuditSearchResult> {
    // Validate query
    const validatedQuery = AuditQuerySchema.parse(query);

    let supabaseQuery = this.supabase
      .from('audit_events')
      .select('*', { count: 'exact' });

    // Apply filters
    if (validatedQuery.eventTypes && validatedQuery.eventTypes.length > 0) {
      supabaseQuery = supabaseQuery.in('event_type', validatedQuery.eventTypes);
    }

    if (validatedQuery.actorId) {
      supabaseQuery = supabaseQuery.eq('actor_user_id', validatedQuery.actorId);
    }

    if (validatedQuery.resourceType) {
      supabaseQuery = supabaseQuery.eq('resource_type', validatedQuery.resourceType);
    }

    if (validatedQuery.resourceId) {
      supabaseQuery = supabaseQuery.eq('resource_id', validatedQuery.resourceId);
    }

    if (validatedQuery.startDate) {
      supabaseQuery = supabaseQuery.gte('timestamp', validatedQuery.startDate);
    }

    if (validatedQuery.endDate) {
      supabaseQuery = supabaseQuery.lte('timestamp', validatedQuery.endDate);
    }

    if (validatedQuery.severity && validatedQuery.severity.length > 0) {
      supabaseQuery = supabaseQuery.in('severity', validatedQuery.severity);
    }

    // Full-text search
    if (validatedQuery.searchText) {
      // Use PostgreSQL full-text search
      supabaseQuery = supabaseQuery.textSearch('search_vector', validatedQuery.searchText, {
        type: 'websearch',
        config: 'english',
      });
    }

    // Tag filtering
    if (validatedQuery.tags && validatedQuery.tags.length > 0) {
      for (const tag of validatedQuery.tags) {
        supabaseQuery = supabaseQuery.contains('context->tags', [tag]);
      }
    }

    // Sorting
    const sortColumn = validatedQuery.sortBy === 'eventType' ? 'event_type' : validatedQuery.sortBy;
    supabaseQuery = supabaseQuery.order(sortColumn, {
      ascending: validatedQuery.sortOrder === 'asc',
    });

    // Pagination
    const rangeStart = validatedQuery.offset;
    const rangeEnd = validatedQuery.offset + validatedQuery.limit - 1;
    supabaseQuery = supabaseQuery.range(rangeStart, rangeEnd);

    // Execute query
    const { data, error, count } = await supabaseQuery;

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    // Convert rows to events
    const events = (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));

    return {
      events,
      total: count ?? 0,
      hasMore: (count ?? 0) > validatedQuery.offset + validatedQuery.limit,
      cursor: events.length > 0 ? events[events.length - 1].id : undefined,
    };
  }

  /**
   * Search by cursor (for pagination)
   */
  async searchByCursor(query: AuditQuery, cursor?: string): Promise<AuditSearchResult> {
    if (cursor) {
      // Get the event at cursor to determine timestamp
      const { data: cursorEvent } = await this.supabase
        .from('audit_events')
        .select('timestamp')
        .eq('id', cursor)
        .single();

      if (cursorEvent) {
        // Modify query to start after cursor
        query = {
          ...query,
          startDate: cursorEvent.timestamp,
        };
      }
    }

    return this.search(query);
  }

  /**
   * Get a single event by ID
   */
  async getById(id: string): Promise<AuditEvent | null> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.rowToEvent(data as unknown as AuditEventRow);
  }

  /**
   * Get events for a specific resource
   */
  async getResourceHistory(resourceType: string, resourceId: string, limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get resource history: ${error.message}`);
    }

    return (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));
  }

  /**
   * Get events for a specific actor (user)
   */
  async getActorHistory(actorId: string, limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', actorId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get actor history: ${error.message}`);
    }

    return (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));
  }

  /**
   * Get recent events (last N events)
   */
  async getRecent(limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent events: ${error.message}`);
    }

    return (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));
  }

  /**
   * Get failed events (for troubleshooting)
   */
  async getFailedEvents(limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .eq('success', false)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get failed events: ${error.message}`);
    }

    return (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));
  }

  /**
   * Get security events
   */
  async getSecurityEvents(limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .in('event_type', [
        'user.login_failed',
        'security.scan',
        'security.alert',
        'security.violation',
        'permission.grant',
        'permission.revoke',
      ])
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get security events: ${error.message}`);
    }

    return (data ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));
  }

  /**
   * Count events matching criteria
   */
  async count(query: Partial<AuditQuery>): Promise<number> {
    let supabaseQuery = this.supabase
      .from('audit_events')
      .select('*', { count: 'exact', head: true });

    if (query.eventTypes && query.eventTypes.length > 0) {
      supabaseQuery = supabaseQuery.in('event_type', query.eventTypes);
    }

    if (query.actorId) {
      supabaseQuery = supabaseQuery.eq('actor_user_id', query.actorId);
    }

    if (query.resourceType) {
      supabaseQuery = supabaseQuery.eq('resource_type', query.resourceType);
    }

    if (query.startDate) {
      supabaseQuery = supabaseQuery.gte('timestamp', query.startDate);
    }

    if (query.endDate) {
      supabaseQuery = supabaseQuery.lte('timestamp', query.endDate);
    }

    const { count, error } = await supabaseQuery;

    if (error) {
      throw new Error(`Count failed: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Convert database row to AuditEvent
   */
  private rowToEvent(row: AuditEventRow): AuditEvent {
    return {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      severity: row.severity,
      actor: {
        userId: row.actor_user_id,
        email: row.actor_email ?? undefined,
        name: row.actor_name ?? undefined,
        ip: row.actor_ip,
        userAgent: row.actor_user_agent ?? undefined,
        sessionId: row.actor_session_id ?? undefined,
        impersonatedBy: row.actor_impersonated_by ?? undefined,
      },
      resource: {
        type: row.resource_type,
        id: row.resource_id,
        name: row.resource_name ?? undefined,
        metadata: row.resource_metadata ?? undefined,
      },
      action: row.action,
      description: row.description,
      changes: row.changes ?? undefined,
      context: row.context ?? undefined,
      success: row.success,
      error: row.error ?? undefined,
      duration: row.duration ?? undefined,
      signature: row.signature ?? undefined,
      previousEventHash: row.previous_event_hash ?? undefined,
    };
  }
}
