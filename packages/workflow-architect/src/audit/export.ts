/**
 * Audit Export
 * Export audit logs to various formats and SIEM systems
 */

import type {
  AuditEvent,
  SplunkConfig,
  ElasticConfig,
  ExportOptions,
  ExportResult,
} from './types.js';

/**
 * Export events to JSON format
 */
export function exportToJSON(
  events: AuditEvent[],
  options: Partial<ExportOptions> = {},
): string {
  const { includeSignatures = true, includeChanges = true } = options;

  const filteredEvents = events.map((event) => {
    const filtered: Partial<AuditEvent> = { ...event };

    if (!includeSignatures) {
      delete filtered.signature;
      delete filtered.previousEventHash;
    }

    if (!includeChanges) {
      delete filtered.changes;
    }

    return filtered;
  });

  return JSON.stringify(filteredEvents, null, 2);
}

/**
 * Export events to CSV format
 */
export function exportToCSV(
  events: AuditEvent[],
  options: Partial<ExportOptions> = {},
): string {
  if (events.length === 0) {
    return '';
  }

  const { includeChanges = false } = options;

  // CSV headers
  const headers = [
    'id',
    'timestamp',
    'eventType',
    'severity',
    'actorId',
    'actorEmail',
    'actorName',
    'actorIP',
    'resourceType',
    'resourceId',
    'resourceName',
    'action',
    'description',
    'success',
    'error',
    'duration',
  ];

  if (includeChanges) {
    headers.push('changes');
  }

  const rows = events.map((event) => {
    const row = [
      event.id,
      event.timestamp,
      event.eventType,
      event.severity,
      event.actor.userId,
      event.actor.email ?? '',
      event.actor.name ?? '',
      event.actor.ip,
      event.resource.type,
      event.resource.id,
      event.resource.name ?? '',
      event.action,
      `"${event.description.replace(/"/g, '""')}"`, // Escape quotes
      event.success.toString(),
      event.error ? `"${event.error.replace(/"/g, '""')}"` : '',
      event.duration?.toString() ?? '',
    ];

    if (includeChanges && event.changes) {
      row.push(`"${JSON.stringify(event.changes).replace(/"/g, '""')}"`);
    }

    return row.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export events to Splunk HEC (HTTP Event Collector)
 */
export async function exportToSplunk(
  events: AuditEvent[],
  config: SplunkConfig,
  options: Partial<ExportOptions> = {},
): Promise<ExportResult> {
  const startTime = Date.now();
  const { batchSize = 100 } = options;

  try {
    const protocol = config.ssl !== false ? 'https' : 'http';
    const url = `${protocol}://${config.host}:${config.port}/services/collector/event`;

    let eventsExported = 0;

    // Process in batches
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      // Format for Splunk HEC
      const splunkEvents = batch.map((event) => ({
        time: new Date(event.timestamp).getTime() / 1000, // Unix timestamp
        source: 'workflow-architect',
        sourcetype: config.sourcetype ?? 'audit:event',
        index: config.index,
        event: {
          id: event.id,
          event_type: event.eventType,
          severity: event.severity,
          actor: event.actor,
          resource: event.resource,
          action: event.action,
          description: event.description,
          success: event.success,
          error: event.error,
          duration: event.duration,
          context: event.context,
        },
      }));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Splunk ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(splunkEvents),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Splunk export failed: ${error}`);
      }

      eventsExported += batch.length;
    }

    return {
      success: true,
      eventsExported,
      format: 'splunk',
      destination: `${config.host}:${config.port}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      eventsExported: 0,
      format: 'splunk',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Export events to Elasticsearch
 */
export async function exportToElastic(
  events: AuditEvent[],
  config: ElasticConfig,
  options: Partial<ExportOptions> = {},
): Promise<ExportResult> {
  const startTime = Date.now();
  const { batchSize = 100 } = options;

  try {
    const protocol = config.ssl !== false ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.host}:${config.port}`;

    let eventsExported = 0;

    // Process in batches
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      // Build bulk request body
      const bulkBody: string[] = [];
      for (const event of batch) {
        // Index operation
        bulkBody.push(JSON.stringify({
          index: {
            _index: config.index,
            _id: event.id,
          },
        }));

        // Document
        bulkBody.push(JSON.stringify({
          '@timestamp': event.timestamp,
          event_type: event.eventType,
          severity: event.severity,
          actor: event.actor,
          resource: event.resource,
          action: event.action,
          description: event.description,
          success: event.success,
          error: event.error,
          duration: event.duration,
          context: event.context,
          changes: event.changes,
          signature: event.signature,
        }));
      }

      const url = `${baseUrl}/_bulk`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-ndjson',
      };

      // Authentication
      if (config.apiKey) {
        headers['Authorization'] = `ApiKey ${config.apiKey}`;
      } else if (config.username && config.password) {
        const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bulkBody.join('\n') + '\n',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Elasticsearch export failed: ${error}`);
      }

      const result = await response.json() as { errors?: boolean; items?: unknown[] };
      if (result.errors) {
        console.warn('Some events failed to index in Elasticsearch');
      }

      eventsExported += batch.length;
    }

    return {
      success: true,
      eventsExported,
      format: 'elastic',
      destination: `${config.host}:${config.port}/${config.index}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      eventsExported: 0,
      format: 'elastic',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Export events to a file in streaming fashion (for large datasets)
 */
export async function* streamToJSON(events: AsyncIterable<AuditEvent>): AsyncGenerator<string> {
  yield '[\n';

  let first = true;
  for await (const event of events) {
    if (!first) {
      yield ',\n';
    }
    yield JSON.stringify(event, null, 2);
    first = false;
  }

  yield '\n]';
}

/**
 * Export events to a file in streaming CSV fashion
 */
export async function* streamToCSV(events: AsyncIterable<AuditEvent>): AsyncGenerator<string> {
  // Headers
  const headers = [
    'id',
    'timestamp',
    'eventType',
    'severity',
    'actorId',
    'actorEmail',
    'actorName',
    'actorIP',
    'resourceType',
    'resourceId',
    'resourceName',
    'action',
    'description',
    'success',
    'error',
    'duration',
  ];
  yield headers.join(',') + '\n';

  // Rows
  for await (const event of events) {
    const row = [
      event.id,
      event.timestamp,
      event.eventType,
      event.severity,
      event.actor.userId,
      event.actor.email ?? '',
      event.actor.name ?? '',
      event.actor.ip,
      event.resource.type,
      event.resource.id,
      event.resource.name ?? '',
      event.action,
      `"${event.description.replace(/"/g, '""')}"`,
      event.success.toString(),
      event.error ? `"${event.error.replace(/"/g, '""')}"` : '',
      event.duration?.toString() ?? '',
    ];
    yield row.join(',') + '\n';
  }
}

/**
 * Convert events to NDJSON (Newline Delimited JSON) format
 * Useful for log aggregation systems
 */
export function exportToNDJSON(events: AuditEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

/**
 * Export events to CloudWatch Logs format
 */
export interface CloudWatchEvent {
  timestamp: number;
  message: string;
}

export function exportToCloudWatch(events: AuditEvent[]): CloudWatchEvent[] {
  return events.map((event) => ({
    timestamp: new Date(event.timestamp).getTime(),
    message: JSON.stringify({
      eventType: event.eventType,
      severity: event.severity,
      actor: event.actor.userId,
      resource: `${event.resource.type}:${event.resource.id}`,
      action: event.action,
      description: event.description,
      success: event.success,
      error: event.error,
      duration: event.duration,
    }),
  }));
}
