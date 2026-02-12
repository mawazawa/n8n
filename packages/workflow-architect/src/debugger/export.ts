/**
 * Debug Session Export
 * Exports debug sessions with all data for sharing
 */

import { getSupabaseClient } from '../supabase/client.js';
import type {
  ExportedSession,
  ExportFormat,
  DebugSession,
  Timeline,
  ProfileResult,
  MemoryReport,
  NetworkRequest,
} from './types.js';
import { DebugManager } from './manager.js';
import { TimelineBuilder } from './timeline.js';
import { Profiler } from './profiler.js';
import { MemoryAnalyzer } from './memory.js';
import { NetworkInspector } from './network.js';

export class SessionExporter {
  private supabase = getSupabaseClient();

  constructor(
    private debugManager: DebugManager,
    private timelineBuilder: TimelineBuilder,
    private profiler: Profiler,
    private memoryAnalyzer: MemoryAnalyzer,
    private networkInspector: NetworkInspector,
  ) {}

  /**
   * Export a debug session
   */
  async exportSession(
    sessionId: string,
    format: ExportFormat = 'json',
    options?: {
      includeTimeline?: boolean;
      includeProfile?: boolean;
      includeMemory?: boolean;
      includeNetwork?: boolean;
    },
  ): Promise<ExportedSession> {
    const session = await this.debugManager.getSession(sessionId);

    const exportOptions = {
      includeTimeline: true,
      includeProfile: true,
      includeMemory: true,
      includeNetwork: true,
      ...options,
    };

    // Build timeline
    const timeline = exportOptions.includeTimeline
      ? this.timelineBuilder.buildTimelineFromStack(session.executionId || sessionId, session.stack)
      : undefined;

    // Get profile
    const profile = exportOptions.includeProfile
      ? await this.profiler.getProfile(sessionId)
      : undefined;

    // Get memory report
    const memory = exportOptions.includeMemory
      ? await this.memoryAnalyzer.analyzeMemory(sessionId)
      : undefined;

    // Get network requests
    const network = exportOptions.includeNetwork
      ? await this.networkInspector.getRequests(sessionId)
      : undefined;

    const exported: ExportedSession = {
      session,
      timeline,
      profile: profile || undefined,
      memory,
      network,
      format,
      exportedAt: new Date().toISOString(),
    };

    return exported;
  }

  /**
   * Export session as JSON string
   */
  async exportAsJSON(sessionId: string): Promise<string> {
    const exported = await this.exportSession(sessionId, 'json');
    return JSON.stringify(exported, null, 2);
  }

  /**
   * Export session as HTML report
   */
  async exportAsHTML(sessionId: string): Promise<string> {
    const exported = await this.exportSession(sessionId, 'html');

    return this.generateHTMLReport(exported);
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(exported: ExportedSession): string {
    const { session, timeline, profile, memory, network } = exported;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debug Session Report - ${session.id}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .section {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { margin: 0 0 10px 0; color: #333; }
    h2 { margin: 0 0 15px 0; color: #666; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { color: #999; font-size: 14px; }
    .stat { display: inline-block; margin-right: 20px; }
    .stat-label { font-weight: bold; color: #666; }
    .stat-value { color: #333; }
    pre { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
    th { background: #f8f8f8; font-weight: 600; }
    .status-completed { color: #22c55e; }
    .status-error { color: #ef4444; }
    .status-running { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Debug Session Report</h1>
    <div class="meta">
      <div>Session ID: ${session.id}</div>
      <div>Workflow ID: ${session.workflowId}</div>
      <div>Status: <span class="status-${session.status.toLowerCase()}">${session.status}</span></div>
      <div>Created: ${new Date(session.createdAt).toLocaleString()}</div>
      <div>Exported: ${new Date(exported.exportedAt).toLocaleString()}</div>
    </div>
  </div>

  ${this.generateStackSection(session)}
  ${this.generateBreakpointsSection(session)}
  ${timeline ? this.generateTimelineSection(timeline) : ''}
  ${profile ? this.generateProfileSection(profile) : ''}
  ${memory ? this.generateMemorySection(memory) : ''}
  ${network ? this.generateNetworkSection(network) : ''}
</body>
</html>
    `;

    return html;
  }

  /**
   * Generate stack trace section
   */
  private generateStackSection(session: DebugSession): string {
    if (session.stack.length === 0) {
      return '<div class="section"><h2>Stack Trace</h2><p>No stack frames</p></div>';
    }

    const rows = session.stack
      .map(
        (frame) => `
      <tr>
        <td>${frame.nodeName}</td>
        <td>${frame.nodeType}</td>
        <td>${new Date(frame.timestamp).toLocaleTimeString()}</td>
        <td>${frame.duration ? `${frame.duration}ms` : 'N/A'}</td>
        <td>${frame.error ? '<span class="status-error">Error</span>' : '<span class="status-completed">OK</span>'}</td>
      </tr>
    `,
      )
      .join('');

    return `
      <div class="section">
        <h2>Stack Trace</h2>
        <table>
          <thead>
            <tr>
              <th>Node</th>
              <th>Type</th>
              <th>Time</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generate breakpoints section
   */
  private generateBreakpointsSection(session: DebugSession): string {
    if (session.breakpoints.length === 0) {
      return '<div class="section"><h2>Breakpoints</h2><p>No breakpoints set</p></div>';
    }

    const rows = session.breakpoints
      .map(
        (bp) => `
      <tr>
        <td>${bp.nodeId}</td>
        <td>${bp.type}</td>
        <td>${bp.enabled ? 'Yes' : 'No'}</td>
        <td>${bp.hitCount}</td>
        <td>${bp.condition || 'N/A'}</td>
      </tr>
    `,
      )
      .join('');

    return `
      <div class="section">
        <h2>Breakpoints</h2>
        <table>
          <thead>
            <tr>
              <th>Node ID</th>
              <th>Type</th>
              <th>Enabled</th>
              <th>Hit Count</th>
              <th>Condition</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generate timeline section
   */
  private generateTimelineSection(timeline: Timeline): string {
    return `
      <div class="section">
        <h2>Timeline</h2>
        <div>
          <span class="stat">
            <span class="stat-label">Total Duration:</span>
            <span class="stat-value">${timeline.totalDuration}ms</span>
          </span>
          <span class="stat">
            <span class="stat-label">Events:</span>
            <span class="stat-value">${timeline.events.length}</span>
          </span>
        </div>
        <pre>${JSON.stringify(timeline.events, null, 2)}</pre>
      </div>
    `;
  }

  /**
   * Generate profile section
   */
  private generateProfileSection(profile: ProfileResult): string {
    const hotspotRows = (profile.hotspots || [])
      .map(
        (h) => `
      <tr>
        <td>${h.nodeId}</td>
        <td>${h.metric}</td>
        <td>${h.value}</td>
      </tr>
    `,
      )
      .join('');

    return `
      <div class="section">
        <h2>Performance Profile</h2>
        <div>
          <span class="stat">
            <span class="stat-label">Total Duration:</span>
            <span class="stat-value">${profile.totalDuration}ms</span>
          </span>
          <span class="stat">
            <span class="stat-label">Total Memory:</span>
            <span class="stat-value">${(profile.totalMemory / 1024 / 1024).toFixed(2)} MB</span>
          </span>
        </div>
        <h3>Hotspots</h3>
        <table>
          <thead>
            <tr>
              <th>Node ID</th>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${hotspotRows || '<tr><td colspan="3">No hotspots detected</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generate memory section
   */
  private generateMemorySection(memory: MemoryReport): string {
    return `
      <div class="section">
        <h2>Memory Analysis</h2>
        <div>
          <span class="stat">
            <span class="stat-label">Peak Memory:</span>
            <span class="stat-value">${(memory.peakMemory / 1024 / 1024).toFixed(2)} MB</span>
          </span>
          <span class="stat">
            <span class="stat-label">Total Data Size:</span>
            <span class="stat-value">${(memory.totalDataSize / 1024 / 1024).toFixed(2)} MB</span>
          </span>
          <span class="stat">
            <span class="stat-label">Leaks Detected:</span>
            <span class="stat-value">${memory.leaks?.length || 0}</span>
          </span>
        </div>
        ${memory.optimization ? `<h3>Optimizations</h3><ul>${memory.optimization.map((o) => `<li>${o}</li>`).join('')}</ul>` : ''}
      </div>
    `;
  }

  /**
   * Generate network section
   */
  private generateNetworkSection(network: NetworkRequest[]): string {
    if (network.length === 0) {
      return '<div class="section"><h2>Network Requests</h2><p>No requests captured</p></div>';
    }

    const rows = network
      .map(
        (req) => `
      <tr>
        <td>${req.method}</td>
        <td>${req.url}</td>
        <td>${req.status || 'N/A'}</td>
        <td>${req.duration ? `${req.duration}ms` : 'N/A'}</td>
        <td>${req.size ? `${(req.size / 1024).toFixed(2)} KB` : 'N/A'}</td>
      </tr>
    `,
      )
      .join('');

    return `
      <div class="section">
        <h2>Network Requests</h2>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>URL</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Save export to database
   */
  async saveExport(sessionId: string, format: ExportFormat): Promise<string> {
    const content = format === 'json'
      ? await this.exportAsJSON(sessionId)
      : await this.exportAsHTML(sessionId);

    const { data, error } = await this.supabase
      .from('execution_snapshots')
      .insert({
        snapshot_type: 'export',
        execution_id: sessionId,
        snapshot_data: { content, format },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save export: ${error.message}`);
    }

    return data.id as string;
  }

  /**
   * Load export from database
   */
  async loadExport(exportId: string): Promise<{ content: string; format: ExportFormat }> {
    const { data, error } = await this.supabase
      .from('execution_snapshots')
      .select('*')
      .eq('id', exportId)
      .eq('snapshot_type', 'export')
      .single();

    if (error || !data) {
      throw new Error(`Export not found: ${exportId}`);
    }

    const snapshotData = data.snapshot_data as { content: string; format: ExportFormat };

    return {
      content: snapshotData.content,
      format: snapshotData.format,
    };
  }
}

/**
 * Create a session exporter instance
 */
export function createSessionExporter(
  debugManager: DebugManager,
  timelineBuilder: TimelineBuilder,
  profiler: Profiler,
  memoryAnalyzer: MemoryAnalyzer,
  networkInspector: NetworkInspector,
): SessionExporter {
  return new SessionExporter(
    debugManager,
    timelineBuilder,
    profiler,
    memoryAnalyzer,
    networkInspector,
  );
}
