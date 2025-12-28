/**
 * Audit Compliance Reports
 * Generate compliance reports for SOC2, GDPR, and access auditing
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  SOC2Report,
  GDPRReport,
  AccessReport,
  AuditEvent,
  AuditEventRow,
  ResourceType,
} from './types.js';

export interface ComplianceConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export type ReportFormat = 'json' | 'html' | 'pdf';

export class ComplianceReporter {
  private supabase: SupabaseClient;

  constructor(config: ComplianceConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Generate SOC2 compliance report
   * Covers security, availability, processing integrity, confidentiality, and privacy
   */
  async generateSOC2Report(
    startDate: string,
    endDate: string,
    format: ReportFormat = 'json',
  ): Promise<SOC2Report | string> {
    const period = { start: startDate, end: endDate };

    // Fetch relevant events for SOC2
    const { data: events, error } = await this.supabase
      .from('audit_events')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .in('event_type', [
        'user.login',
        'user.login_failed',
        'user.logout',
        'permission.grant',
        'permission.revoke',
        'data.read',
        'data.export',
        'data.import',
        'config.update',
        'settings.change',
        'security.alert',
        'security.violation',
      ]);

    if (error) {
      throw new Error(`Failed to fetch SOC2 events: ${error.message}`);
    }

    const auditEvents = (events ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));

    // Calculate summary statistics
    const totalLogins = auditEvents.filter((e) => e.eventType === 'user.login').length;
    const failedLogins = auditEvents.filter((e) => e.eventType === 'user.login_failed').length;
    const permissionChanges = auditEvents.filter((e) =>
      e.eventType === 'permission.grant' || e.eventType === 'permission.revoke',
    ).length;
    const dataAccess = auditEvents.filter((e) =>
      e.eventType === 'data.read' || e.eventType === 'data.export' || e.eventType === 'data.import',
    ).length;
    const configChanges = auditEvents.filter((e) =>
      e.eventType === 'config.update' || e.eventType === 'settings.change',
    ).length;
    const securityAlerts = auditEvents.filter((e) =>
      e.eventType === 'security.alert' || e.eventType === 'security.violation',
    ).length;

    // Categorize events
    const categories = [
      {
        category: 'Authentication & Access Control',
        count: totalLogins + failedLogins,
        events: auditEvents.filter((e) =>
          e.eventType === 'user.login' || e.eventType === 'user.login_failed' || e.eventType === 'user.logout',
        ),
      },
      {
        category: 'Permission Changes',
        count: permissionChanges,
        events: auditEvents.filter((e) =>
          e.eventType === 'permission.grant' || e.eventType === 'permission.revoke',
        ),
      },
      {
        category: 'Data Access & Export',
        count: dataAccess,
        events: auditEvents.filter((e) =>
          e.eventType === 'data.read' || e.eventType === 'data.export' || e.eventType === 'data.import',
        ),
      },
      {
        category: 'Configuration Changes',
        count: configChanges,
        events: auditEvents.filter((e) =>
          e.eventType === 'config.update' || e.eventType === 'settings.change',
        ),
      },
      {
        category: 'Security Events',
        count: securityAlerts,
        events: auditEvents.filter((e) =>
          e.eventType === 'security.alert' || e.eventType === 'security.violation',
        ),
      },
    ];

    const report: SOC2Report = {
      reportType: 'SOC2',
      generatedAt: new Date().toISOString(),
      period,
      totalEvents: auditEvents.length,
      summary: {
        totalLogins,
        failedLogins,
        permissionChanges,
        dataAccess,
        configChanges,
        securityAlerts,
      },
      details: categories,
    };

    if (format === 'html') {
      return this.generateSOC2HTML(report);
    }

    if (format === 'pdf') {
      return this.generateSOC2PDF(report);
    }

    return report;
  }

  /**
   * Generate GDPR compliance report for a specific user
   * Shows all data access and processing for a user
   */
  async generateGDPRReport(
    userId: string,
    startDate?: string,
    endDate?: string,
    format: ReportFormat = 'json',
  ): Promise<GDPRReport | string> {
    const period = {
      start: startDate ?? new Date(0).toISOString(),
      end: endDate ?? new Date().toISOString(),
    };

    // Fetch all events related to this user
    let query = this.supabase
      .from('audit_events')
      .select('*')
      .or(`actor_user_id.eq.${userId},resource_id.eq.${userId}`);

    if (startDate) {
      query = query.gte('timestamp', startDate);
    }

    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data: events, error } = await query.order('timestamp', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch GDPR events: ${error.message}`);
    }

    const auditEvents = (events ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));

    // Calculate summary
    const dataAccessed = auditEvents.filter((e) => e.eventType === 'data.read').length;
    const dataExported = auditEvents.filter((e) => e.eventType === 'data.export').length;
    const dataModified = auditEvents.filter((e) =>
      e.eventType === 'workflow.update' || e.eventType === 'user.update',
    ).length;
    const dataDeleted = auditEvents.filter((e) =>
      e.eventType === 'workflow.delete' || e.eventType === 'user.delete',
    ).length;

    const report: GDPRReport = {
      reportType: 'GDPR',
      userId,
      generatedAt: new Date().toISOString(),
      period,
      totalEvents: auditEvents.length,
      summary: {
        dataAccessed,
        dataExported,
        dataModified,
        dataDeleted,
      },
      details: auditEvents,
    };

    if (format === 'html') {
      return this.generateGDPRHTML(report);
    }

    if (format === 'pdf') {
      return this.generateGDPRPDF(report);
    }

    return report;
  }

  /**
   * Generate access report for a specific resource
   * Shows who accessed what and when
   */
  async generateAccessReport(
    resourceId: string,
    resourceType: ResourceType,
    startDate?: string,
    endDate?: string,
    format: ReportFormat = 'json',
  ): Promise<AccessReport | string> {
    const period = {
      start: startDate ?? new Date(0).toISOString(),
      end: endDate ?? new Date().toISOString(),
    };

    // Fetch all events for this resource
    let query = this.supabase
      .from('audit_events')
      .select('*')
      .eq('resource_id', resourceId)
      .eq('resource_type', resourceType);

    if (startDate) {
      query = query.gte('timestamp', startDate);
    }

    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data: events, error } = await query.order('timestamp', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch access events: ${error.message}`);
    }

    const auditEvents = (events ?? []).map((row) => this.rowToEvent(row as unknown as AuditEventRow));

    // Calculate summary
    const totalAccess = auditEvents.length;
    const uniqueUsers = new Set(auditEvents.map((e) => e.actor.userId)).size;
    const modifications = auditEvents.filter((e) =>
      e.action === 'update' || e.action === 'delete',
    ).length;
    const exports = auditEvents.filter((e) => e.eventType === 'data.export').length;

    // Group by actor
    const actorMap = new Map<string, {
      actor: AuditEvent['actor'];
      accessCount: number;
      lastAccess: string;
      actions: string[];
    }>();

    for (const event of auditEvents) {
      const existing = actorMap.get(event.actor.userId);
      if (existing) {
        existing.accessCount++;
        existing.lastAccess = event.timestamp;
        if (!existing.actions.includes(event.action)) {
          existing.actions.push(event.action);
        }
      } else {
        actorMap.set(event.actor.userId, {
          actor: event.actor,
          accessCount: 1,
          lastAccess: event.timestamp,
          actions: [event.action],
        });
      }
    }

    const actorStats = Array.from(actorMap.values());

    const report: AccessReport = {
      reportType: 'ACCESS',
      resourceId,
      resourceType,
      generatedAt: new Date().toISOString(),
      period,
      totalEvents: auditEvents.length,
      summary: {
        totalAccess,
        uniqueUsers,
        modifications,
        exports,
      },
      details: actorStats,
    };

    if (format === 'html') {
      return this.generateAccessHTML(report);
    }

    if (format === 'pdf') {
      return this.generateAccessPDF(report);
    }

    return report;
  }

  /**
   * Generate HTML report for SOC2
   */
  private generateSOC2HTML(report: SOC2Report): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>SOC2 Compliance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .summary { background-color: #f2f2f2; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>SOC2 Compliance Report</h1>
  <p><strong>Generated:</strong> ${report.generatedAt}</p>
  <p><strong>Period:</strong> ${report.period.start} to ${report.period.end}</p>

  <div class="summary">
    <h2>Summary</h2>
    <p>Total Events: ${report.totalEvents}</p>
    <p>Total Logins: ${report.summary.totalLogins}</p>
    <p>Failed Logins: ${report.summary.failedLogins}</p>
    <p>Permission Changes: ${report.summary.permissionChanges}</p>
    <p>Data Access: ${report.summary.dataAccess}</p>
    <p>Configuration Changes: ${report.summary.configChanges}</p>
    <p>Security Alerts: ${report.summary.securityAlerts}</p>
  </div>

  <h2>Detailed Events by Category</h2>
  ${report.details.map((cat) => `
    <h3>${cat.category} (${cat.count} events)</h3>
    <table>
      <tr>
        <th>Timestamp</th>
        <th>Event Type</th>
        <th>Actor</th>
        <th>Description</th>
        <th>Success</th>
      </tr>
      ${cat.events.slice(0, 100).map((e) => `
        <tr>
          <td>${e.timestamp}</td>
          <td>${e.eventType}</td>
          <td>${e.actor.email ?? e.actor.userId}</td>
          <td>${e.description}</td>
          <td>${e.success ? '✓' : '✗'}</td>
        </tr>
      `).join('')}
    </table>
  `).join('')}
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML report for GDPR
   */
  private generateGDPRHTML(report: GDPRReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>GDPR Compliance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .summary { background-color: #f2f2f2; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>GDPR Compliance Report</h1>
  <p><strong>User ID:</strong> ${report.userId}</p>
  <p><strong>Generated:</strong> ${report.generatedAt}</p>
  <p><strong>Period:</strong> ${report.period.start} to ${report.period.end}</p>

  <div class="summary">
    <h2>Summary</h2>
    <p>Total Events: ${report.totalEvents}</p>
    <p>Data Accessed: ${report.summary.dataAccessed}</p>
    <p>Data Exported: ${report.summary.dataExported}</p>
    <p>Data Modified: ${report.summary.dataModified}</p>
    <p>Data Deleted: ${report.summary.dataDeleted}</p>
  </div>

  <h2>All Events</h2>
  <table>
    <tr>
      <th>Timestamp</th>
      <th>Event Type</th>
      <th>Resource</th>
      <th>Description</th>
    </tr>
    ${report.details.slice(0, 1000).map((e) => `
      <tr>
        <td>${e.timestamp}</td>
        <td>${e.eventType}</td>
        <td>${e.resource.type}:${e.resource.id}</td>
        <td>${e.description}</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML report for Access
   */
  private generateAccessHTML(report: AccessReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Access Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .summary { background-color: #f2f2f2; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Access Report</h1>
  <p><strong>Resource:</strong> ${report.resourceType}:${report.resourceId}</p>
  <p><strong>Generated:</strong> ${report.generatedAt}</p>
  <p><strong>Period:</strong> ${report.period.start} to ${report.period.end}</p>

  <div class="summary">
    <h2>Summary</h2>
    <p>Total Access: ${report.summary.totalAccess}</p>
    <p>Unique Users: ${report.summary.uniqueUsers}</p>
    <p>Modifications: ${report.summary.modifications}</p>
    <p>Exports: ${report.summary.exports}</p>
  </div>

  <h2>Access by User</h2>
  <table>
    <tr>
      <th>User</th>
      <th>Access Count</th>
      <th>Last Access</th>
      <th>Actions</th>
    </tr>
    ${report.details.map((actor) => `
      <tr>
        <td>${actor.actor.email ?? actor.actor.userId}</td>
        <td>${actor.accessCount}</td>
        <td>${actor.lastAccess}</td>
        <td>${actor.actions.join(', ')}</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Generate PDF report for SOC2 (placeholder - would use a PDF library)
   */
  private generateSOC2PDF(report: SOC2Report): string {
    // In a real implementation, use a PDF library like pdfkit or puppeteer
    return `PDF generation not implemented. Use HTML format and convert with a browser or PDF library.\n\n${JSON.stringify(report, null, 2)}`;
  }

  /**
   * Generate PDF report for GDPR (placeholder)
   */
  private generateGDPRPDF(report: GDPRReport): string {
    return `PDF generation not implemented. Use HTML format and convert with a browser or PDF library.\n\n${JSON.stringify(report, null, 2)}`;
  }

  /**
   * Generate PDF report for Access (placeholder)
   */
  private generateAccessPDF(report: AccessReport): string {
    return `PDF generation not implemented. Use HTML format and convert with a browser or PDF library.\n\n${JSON.stringify(report, null, 2)}`;
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
