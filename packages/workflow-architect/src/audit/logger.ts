/**
 * Audit Logger
 * High-performance audit logging with async batching (<5ms overhead)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type {
  AuditEvent,
  AuditEventType,
  Actor,
  Resource,
  AuditContext,
  ChangeRecord,
  AuditSeverity,
  AuditEventRow,
} from './types.js';
import { AuditEventSchema } from './types.js';

export interface AuditLoggerConfig {
  supabaseUrl: string;
  supabaseKey: string;
  batchSize?: number;
  batchInterval?: number; // milliseconds
  enableSigning?: boolean;
  defaultContext?: AuditContext;
}

interface BatchedEvent {
  event: AuditEvent;
  timestamp: number;
}

export class AuditLogger {
  private supabase: SupabaseClient;
  private batchSize: number;
  private batchInterval: number;
  private enableSigning: boolean;
  private defaultContext: AuditContext;
  private eventBatch: BatchedEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(config: AuditLoggerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.batchSize = config.batchSize ?? 50;
    this.batchInterval = config.batchInterval ?? 1000;
    this.enableSigning = config.enableSigning ?? false;
    this.defaultContext = config.defaultContext ?? {};

    // Start batch timer
    this.startBatchTimer();
  }

  /**
   * Log a single audit event
   * @param eventData - Partial event data (id and timestamp will be auto-generated)
   * @returns Promise<void> - Completes in <5ms by batching
   */
  async log(eventData: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const startTime = performance.now();

    const event: AuditEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...eventData,
      context: {
        ...this.defaultContext,
        ...eventData.context,
      },
    };

    // Validate event
    try {
      AuditEventSchema.parse(event);
    } catch (error) {
      console.error('Invalid audit event:', error);
      throw new Error(`Audit event validation failed: ${error}`);
    }

    // Add to batch
    this.eventBatch.push({
      event,
      timestamp: Date.now(),
    });

    // Flush if batch is full
    if (this.eventBatch.length >= this.batchSize) {
      // Flush asynchronously without blocking
      void this.flush();
    }

    const duration = performance.now() - startTime;
    if (duration > 5) {
      console.warn(`Audit logging took ${duration.toFixed(2)}ms (target: <5ms)`);
    }
  }

  /**
   * Log multiple events in a batch
   * More efficient than calling log() multiple times
   */
  async logBatch(events: Array<Omit<AuditEvent, 'id' | 'timestamp'>>): Promise<void> {
    const auditEvents = events.map((eventData) => ({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...eventData,
      context: {
        ...this.defaultContext,
        ...eventData.context,
      },
    }));

    // Validate all events
    for (const event of auditEvents) {
      try {
        AuditEventSchema.parse(event);
      } catch (error) {
        console.error('Invalid audit event in batch:', error);
        throw new Error(`Audit event validation failed: ${error}`);
      }
    }

    // Add all to batch
    this.eventBatch.push(
      ...auditEvents.map((event) => ({
        event,
        timestamp: Date.now(),
      })),
    );

    // Flush if batch is full
    if (this.eventBatch.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Create a new logger with additional context
   * Useful for scoping logs to a specific request, workflow, etc.
   */
  withContext(context: AuditContext): AuditLogger {
    return new AuditLogger({
      supabaseUrl: this.supabase.supabaseUrl,
      supabaseKey: this.supabase.supabaseKey,
      batchSize: this.batchSize,
      batchInterval: this.batchInterval,
      enableSigning: this.enableSigning,
      defaultContext: {
        ...this.defaultContext,
        ...context,
      },
    });
  }

  /**
   * Convenience methods for common event types
   */

  async logWorkflowCreate(actor: Actor, workflowId: string, workflowName: string): Promise<void> {
    await this.log({
      eventType: 'workflow.create' as AuditEventType,
      severity: 'info' as AuditSeverity,
      actor,
      resource: {
        type: 'workflow',
        id: workflowId,
        name: workflowName,
      },
      action: 'create',
      description: `Created workflow: ${workflowName}`,
      success: true,
    });
  }

  async logWorkflowUpdate(
    actor: Actor,
    workflowId: string,
    workflowName: string,
    changes: ChangeRecord[],
  ): Promise<void> {
    await this.log({
      eventType: 'workflow.update' as AuditEventType,
      severity: 'info' as AuditSeverity,
      actor,
      resource: {
        type: 'workflow',
        id: workflowId,
        name: workflowName,
      },
      action: 'update',
      description: `Updated workflow: ${workflowName}`,
      changes,
      success: true,
    });
  }

  async logWorkflowDelete(actor: Actor, workflowId: string, workflowName: string): Promise<void> {
    await this.log({
      eventType: 'workflow.delete' as AuditEventType,
      severity: 'warning' as AuditSeverity,
      actor,
      resource: {
        type: 'workflow',
        id: workflowId,
        name: workflowName,
      },
      action: 'delete',
      description: `Deleted workflow: ${workflowName}`,
      success: true,
    });
  }

  async logUserLogin(actor: Actor, success: boolean, error?: string): Promise<void> {
    await this.log({
      eventType: success ? ('user.login' as AuditEventType) : ('user.login_failed' as AuditEventType),
      severity: success ? ('info' as AuditSeverity) : ('warning' as AuditSeverity),
      actor,
      resource: {
        type: 'user',
        id: actor.userId,
        name: actor.name,
      },
      action: 'login',
      description: success ? 'User logged in successfully' : `Login failed: ${error}`,
      success,
      error,
    });
  }

  async logPermissionChange(
    actor: Actor,
    targetUserId: string,
    permission: string,
    granted: boolean,
  ): Promise<void> {
    await this.log({
      eventType: granted ? ('permission.grant' as AuditEventType) : ('permission.revoke' as AuditEventType),
      severity: 'warning' as AuditSeverity,
      actor,
      resource: {
        type: 'permission',
        id: permission,
        metadata: { targetUserId },
      },
      action: granted ? 'grant' : 'revoke',
      description: `${granted ? 'Granted' : 'Revoked'} permission ${permission} for user ${targetUserId}`,
      success: true,
    });
  }

  async logDataExport(actor: Actor, resourceType: string, resourceId: string, recordCount: number): Promise<void> {
    await this.log({
      eventType: 'data.export' as AuditEventType,
      severity: 'warning' as AuditSeverity,
      actor,
      resource: {
        type: 'system',
        id: resourceId,
        metadata: { resourceType, recordCount },
      },
      action: 'export',
      description: `Exported ${recordCount} ${resourceType} records`,
      success: true,
    });
  }

  async logSecurityAlert(
    actor: Actor,
    alertType: string,
    description: string,
    severity: AuditSeverity = 'critical',
  ): Promise<void> {
    await this.log({
      eventType: 'security.alert' as AuditEventType,
      severity,
      actor,
      resource: {
        type: 'system',
        id: 'security',
        metadata: { alertType },
      },
      action: 'alert',
      description,
      success: true,
    });
  }

  /**
   * Flush all pending events to database
   */
  async flush(): Promise<void> {
    if (this.flushing || this.eventBatch.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      const eventsToFlush = [...this.eventBatch];
      this.eventBatch = [];

      // Convert to database format
      const rows: Omit<AuditEventRow, 'created_at' | 'partition_date'>[] = eventsToFlush.map(({ event }) => ({
        id: event.id,
        timestamp: event.timestamp,
        event_type: event.eventType,
        severity: event.severity,
        actor_user_id: event.actor.userId,
        actor_email: event.actor.email ?? null,
        actor_name: event.actor.name ?? null,
        actor_ip: event.actor.ip,
        actor_user_agent: event.actor.userAgent ?? null,
        actor_session_id: event.actor.sessionId ?? null,
        actor_impersonated_by: event.actor.impersonatedBy ?? null,
        resource_type: event.resource.type,
        resource_id: event.resource.id,
        resource_name: event.resource.name ?? null,
        resource_metadata: event.resource.metadata ?? null,
        action: event.action,
        description: event.description,
        changes: event.changes ?? null,
        context: event.context ?? null,
        success: event.success,
        error: event.error ?? null,
        duration: event.duration ?? null,
        signature: event.signature ?? null,
        previous_event_hash: event.previousEventHash ?? null,
      }));

      // Insert into database
      const { error } = await this.supabase.from('audit_events').insert(rows);

      if (error) {
        console.error('Failed to insert audit events:', error);
        // Re-add events to batch for retry
        this.eventBatch.unshift(...eventsToFlush);
        throw error;
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Start the batch timer to periodically flush events
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      void this.flush();
    }, this.batchInterval);
  }

  /**
   * Stop the batch timer and flush remaining events
   */
  async close(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    await this.flush();
  }

  /**
   * Get the number of pending events in the batch
   */
  getPendingCount(): number {
    return this.eventBatch.length;
  }
}
