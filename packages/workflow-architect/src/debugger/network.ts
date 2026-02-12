/**
 * Network Inspector
 * Captures and inspects HTTP requests made during workflow execution
 */

import { v4 as uuidv4 } from 'uuid';
import type { NetworkRequest } from './types.js';

export class NetworkInspector {
  private captures = new Map<string, NetworkRequest[]>();
  private capturing = new Set<string>();

  /**
   * Start capturing network requests for a session
   */
  async captureRequests(sessionId: string): Promise<void> {
    if (!this.captures.has(sessionId)) {
      this.captures.set(sessionId, []);
    }
    this.capturing.add(sessionId);
  }

  /**
   * Stop capturing network requests
   */
  async stopCapture(sessionId: string): Promise<void> {
    this.capturing.delete(sessionId);
  }

  /**
   * Get captured network requests
   */
  async getRequests(sessionId: string): Promise<NetworkRequest[]> {
    return this.captures.get(sessionId) || [];
  }

  /**
   * Record a network request
   */
  async recordRequest(
    sessionId: string,
    nodeId: string,
    request: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<string> {
    if (!this.capturing.has(sessionId)) {
      return ''; // Not capturing
    }

    const requestId = uuidv4();
    const startTime = Date.now();

    const networkRequest: NetworkRequest = {
      id: requestId,
      nodeId,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      startTime,
    };

    const requests = this.captures.get(sessionId) || [];
    requests.push(networkRequest);
    this.captures.set(sessionId, requests);

    return requestId;
  }

  /**
   * Record response for a request
   */
  async recordResponse(
    sessionId: string,
    requestId: string,
    response: {
      status: number;
      statusText: string;
      headers?: Record<string, string>;
      body?: unknown;
      error?: string;
    },
  ): Promise<void> {
    const requests = this.captures.get(sessionId);
    if (!requests) return;

    const request = requests.find((r) => r.id === requestId);
    if (!request) return;

    const endTime = Date.now();
    request.endTime = endTime;
    request.duration = endTime - request.startTime;
    request.status = response.status;
    request.statusText = response.statusText;
    request.responseHeaders = response.headers;
    request.responseBody = response.body;
    request.error = response.error;

    // Calculate response size
    if (response.body) {
      request.size = this.calculateSize(response.body);
    }

    // Calculate timing breakdown (simplified)
    request.timing = this.calculateTiming(request.duration);
  }

  /**
   * Clear captured requests for a session
   */
  clearRequests(sessionId: string): void {
    this.captures.delete(sessionId);
    this.capturing.delete(sessionId);
  }

  /**
   * Get request by ID
   */
  async getRequest(sessionId: string, requestId: string): Promise<NetworkRequest | null> {
    const requests = this.captures.get(sessionId);
    if (!requests) return null;

    return requests.find((r) => r.id === requestId) || null;
  }

  /**
   * Get requests by node
   */
  async getNodeRequests(sessionId: string, nodeId: string): Promise<NetworkRequest[]> {
    const requests = this.captures.get(sessionId) || [];
    return requests.filter((r) => r.nodeId === nodeId);
  }

  /**
   * Get request statistics
   */
  getStatistics(sessionId: string): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageDuration: number;
    totalSize: number;
    requestsByMethod: Record<string, number>;
  } {
    const requests = this.captures.get(sessionId) || [];

    const successfulRequests = requests.filter(
      (r) => r.status && r.status >= 200 && r.status < 300,
    ).length;

    const failedRequests = requests.filter(
      (r) => r.error || (r.status && (r.status < 200 || r.status >= 300)),
    ).length;

    const durations = requests.filter((r) => r.duration !== undefined).map((r) => r.duration!);
    const averageDuration =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

    const totalSize = requests.reduce((sum, r) => sum + (r.size || 0), 0);

    const requestsByMethod = requests.reduce(
      (acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalRequests: requests.length,
      successfulRequests,
      failedRequests,
      averageDuration,
      totalSize,
      requestsByMethod,
    };
  }

  /**
   * Get waterfall data for visualization
   */
  getWaterfallData(sessionId: string): Array<{
    id: string;
    method: string;
    url: string;
    start: number;
    duration: number;
    status: number | undefined;
  }> {
    const requests = this.captures.get(sessionId) || [];
    if (requests.length === 0) return [];

    const startTime = Math.min(...requests.map((r) => r.startTime));

    return requests.map((r) => ({
      id: r.id,
      method: r.method,
      url: r.url,
      start: r.startTime - startTime,
      duration: r.duration || 0,
      status: r.status,
    }));
  }

  /**
   * Export requests as HAR format
   */
  exportAsHAR(sessionId: string): {
    log: {
      version: string;
      creator: { name: string; version: string };
      entries: Array<Record<string, unknown>>;
    };
  } {
    const requests = this.captures.get(sessionId) || [];

    return {
      log: {
        version: '1.2',
        creator: {
          name: 'workflow-architect-debugger',
          version: '1.0',
        },
        entries: requests.map((r) => ({
          startedDateTime: new Date(r.startTime).toISOString(),
          time: r.duration || 0,
          request: {
            method: r.method,
            url: r.url,
            headers: this.formatHeaders(r.headers),
            bodySize: this.calculateSize(r.body),
          },
          response: {
            status: r.status || 0,
            statusText: r.statusText || '',
            headers: this.formatHeaders(r.responseHeaders),
            bodySize: r.size || 0,
          },
          timings: r.timing || {},
        })),
      },
    };
  }

  /**
   * Calculate size of data
   */
  private calculateSize(data: unknown): number {
    if (!data) return 0;

    if (typeof data === 'string') {
      return data.length;
    }

    if (Buffer.isBuffer(data)) {
      return data.length;
    }

    return JSON.stringify(data).length;
  }

  /**
   * Calculate timing breakdown
   */
  private calculateTiming(totalDuration: number): {
    dns?: number;
    tcp?: number;
    tls?: number;
    request?: number;
    wait?: number;
    download?: number;
  } {
    // Simplified timing breakdown
    // In a real implementation, these would be measured separately
    return {
      dns: totalDuration * 0.05,
      tcp: totalDuration * 0.05,
      tls: totalDuration * 0.1,
      request: totalDuration * 0.1,
      wait: totalDuration * 0.5,
      download: totalDuration * 0.2,
    };
  }

  /**
   * Format headers for HAR export
   */
  private formatHeaders(
    headers?: Record<string, string>,
  ): Array<{ name: string; value: string }> {
    if (!headers) return [];

    return Object.entries(headers).map(([name, value]) => ({
      name,
      value,
    }));
  }

  /**
   * Filter requests by criteria
   */
  filterRequests(
    sessionId: string,
    filter: {
      method?: string;
      statusCode?: number;
      hasError?: boolean;
      minDuration?: number;
    },
  ): NetworkRequest[] {
    const requests = this.captures.get(sessionId) || [];

    return requests.filter((r) => {
      if (filter.method && r.method !== filter.method) return false;
      if (filter.statusCode && r.status !== filter.statusCode) return false;
      if (filter.hasError !== undefined && !!r.error !== filter.hasError) return false;
      if (filter.minDuration && (r.duration || 0) < filter.minDuration) return false;
      return true;
    });
  }

  /**
   * Get slow requests (above threshold)
   */
  getSlowRequests(sessionId: string, thresholdMs: number = 1000): NetworkRequest[] {
    return this.filterRequests(sessionId, { minDuration: thresholdMs });
  }

  /**
   * Get failed requests
   */
  getFailedRequests(sessionId: string): NetworkRequest[] {
    return this.filterRequests(sessionId, { hasError: true });
  }
}

/**
 * Create a network inspector instance
 */
export function createNetworkInspector(): NetworkInspector {
  return new NetworkInspector();
}
