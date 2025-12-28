/**
 * Bottleneck Detection
 * Identifies performance bottlenecks in workflow executions
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Bottleneck,
  BottleneckType,
  BottleneckSeverity,
  ProfileResult,
  NodeMetrics,
  BottleneckAnalysis,
} from './types';

interface BottleneckThresholds {
  cpu: { usage: number; timeMs: number };
  memory: { peakMb: number; allocatedMb: number };
  network: { latencyMs: number; requestCount: number };
  io: { operations: number; throughputMbps: number };
  database: { queryTimeMs: number; queryCount: number };
}

export class BottleneckDetector {
  private readonly thresholds: BottleneckThresholds = {
    cpu: { usage: 80, timeMs: 5000 },
    memory: { peakMb: 512, allocatedMb: 1024 },
    network: { latencyMs: 1000, requestCount: 100 },
    io: { operations: 1000, throughputMbps: 10 },
    database: { queryTimeMs: 500, queryCount: 50 },
  };

  /**
   * Detect bottlenecks in a profile
   */
  async detect(profile: ProfileResult): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = [];

    // Analyze each node
    for (const nodeMetric of profile.nodeMetrics) {
      const nodeBottlenecks = this.analyzeNode(nodeMetric, profile);
      bottlenecks.push(...nodeBottlenecks);
    }

    // Calculate impact scores
    this.calculateImpacts(bottlenecks, profile);

    // Sort by severity and impact
    bottlenecks.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.impact - a.impact;
    });

    return bottlenecks;
  }

  /**
   * Perform full bottleneck analysis
   */
  async analyze(profile: ProfileResult): Promise<BottleneckAnalysis> {
    const bottlenecks = await this.detect(profile);
    const totalImpact = bottlenecks.reduce((sum, b) => sum + b.impact, 0);
    const criticalPath = this.identifyCriticalPath(profile);

    return {
      workflowId: profile.workflowId,
      executionId: profile.executionId,
      bottlenecks,
      totalImpact,
      criticalPath,
      analysisTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze a single node for bottlenecks
   */
  private analyzeNode(nodeMetric: NodeMetrics, profile: ProfileResult): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Check CPU bottleneck
    const cpuBottleneck = this.checkCpuBottleneck(nodeMetric);
    if (cpuBottleneck) bottlenecks.push(cpuBottleneck);

    // Check memory bottleneck
    const memoryBottleneck = this.checkMemoryBottleneck(nodeMetric);
    if (memoryBottleneck) bottlenecks.push(memoryBottleneck);

    // Check network bottleneck
    const networkBottleneck = this.checkNetworkBottleneck(nodeMetric);
    if (networkBottleneck) bottlenecks.push(networkBottleneck);

    // Check I/O bottleneck
    const ioBottleneck = this.checkIoBottleneck(nodeMetric);
    if (ioBottleneck) bottlenecks.push(ioBottleneck);

    // Check external API bottleneck
    const apiBottleneck = this.checkExternalApiBottleneck(nodeMetric);
    if (apiBottleneck) bottlenecks.push(apiBottleneck);

    // Check database bottleneck
    const dbBottleneck = this.checkDatabaseBottleneck(nodeMetric);
    if (dbBottleneck) bottlenecks.push(dbBottleneck);

    return bottlenecks;
  }

  /**
   * Check for CPU bottleneck
   */
  private checkCpuBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const { cpu } = nodeMetric.resourceUsage;

    if (
      cpu.usage > this.thresholds.cpu.usage ||
      cpu.timeMs > this.thresholds.cpu.timeMs
    ) {
      const severity = this.determineSeverity(cpu.usage, [60, 75, 85, 95]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.CPU,
        severity,
        impact: 0, // Will be calculated later
        description: `High CPU usage (${cpu.usage.toFixed(1)}%) with ${cpu.timeMs}ms execution time`,
        rootCause: this.identifyCpuRootCause(nodeMetric),
        evidence: {
          cpuUsage: cpu.usage,
          cpuTimeMs: cpu.timeMs,
          cores: cpu.cores,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check for memory bottleneck
   */
  private checkMemoryBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const { memory } = nodeMetric.resourceUsage;
    const peakMb = memory.peak / (1024 * 1024);
    const allocatedMb = memory.allocated / (1024 * 1024);

    if (
      peakMb > this.thresholds.memory.peakMb ||
      allocatedMb > this.thresholds.memory.allocatedMb
    ) {
      const severity = this.determineSeverity(peakMb, [256, 512, 1024, 2048]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.MEMORY,
        severity,
        impact: 0,
        description: `High memory usage (${peakMb.toFixed(1)}MB peak, ${allocatedMb.toFixed(1)}MB allocated)`,
        rootCause: this.identifyMemoryRootCause(nodeMetric),
        evidence: {
          peakMb,
          allocatedMb,
          usedMb: memory.used / (1024 * 1024),
          inputItems: nodeMetric.inputItems,
          outputItems: nodeMetric.outputItems,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check for network bottleneck
   */
  private checkNetworkBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const { network } = nodeMetric.resourceUsage;

    if (
      network.latencyMs > this.thresholds.network.latencyMs ||
      network.requests > this.thresholds.network.requestCount
    ) {
      const severity = this.determineSeverity(network.latencyMs, [500, 1000, 2000, 5000]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.NETWORK,
        severity,
        impact: 0,
        description: `High network latency (${network.latencyMs.toFixed(0)}ms) with ${network.requests} requests`,
        rootCause: this.identifyNetworkRootCause(nodeMetric),
        evidence: {
          latencyMs: network.latencyMs,
          requests: network.requests,
          bytesIn: network.bytesIn,
          bytesOut: network.bytesOut,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check for I/O bottleneck
   */
  private checkIoBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const { disk } = nodeMetric.resourceUsage;
    const totalOps = disk.reads + disk.writes;

    if (totalOps > this.thresholds.io.operations) {
      const severity = this.determineSeverity(totalOps, [500, 1000, 5000, 10000]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.IO,
        severity,
        impact: 0,
        description: `High I/O operations (${totalOps} ops: ${disk.reads} reads, ${disk.writes} writes)`,
        rootCause: 'Excessive disk operations may indicate inefficient data processing',
        evidence: {
          reads: disk.reads,
          writes: disk.writes,
          bytesRead: disk.bytesRead,
          bytesWritten: disk.bytesWritten,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check for external API bottleneck
   */
  private checkExternalApiBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const isExternalApi = this.isExternalApiNode(nodeMetric.nodeType);

    if (isExternalApi && nodeMetric.executionTime > 2000) {
      const severity = this.determineSeverity(nodeMetric.executionTime, [
        1000,
        2000,
        5000,
        10000,
      ]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.EXTERNAL_API,
        severity,
        impact: 0,
        description: `Slow external API call (${nodeMetric.executionTime}ms)`,
        rootCause: 'External API response time is slow. Consider caching or optimizing requests.',
        evidence: {
          executionTime: nodeMetric.executionTime,
          nodeType: nodeMetric.nodeType,
          requests: nodeMetric.resourceUsage.network.requests,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Check for database bottleneck
   */
  private checkDatabaseBottleneck(nodeMetric: NodeMetrics): Bottleneck | null {
    const isDatabaseNode = this.isDatabaseNode(nodeMetric.nodeType);

    if (isDatabaseNode && nodeMetric.executionTime > this.thresholds.database.queryTimeMs) {
      const severity = this.determineSeverity(nodeMetric.executionTime, [
        200,
        500,
        1000,
        2000,
      ]);

      return {
        id: uuidv4(),
        nodeId: nodeMetric.nodeId,
        nodeName: nodeMetric.nodeName,
        type: BottleneckType.DATABASE,
        severity,
        impact: 0,
        description: `Slow database query (${nodeMetric.executionTime}ms)`,
        rootCause: this.identifyDatabaseRootCause(nodeMetric),
        evidence: {
          executionTime: nodeMetric.executionTime,
          nodeType: nodeMetric.nodeType,
          itemCount: nodeMetric.inputItems + nodeMetric.outputItems,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Determine severity based on value and thresholds
   */
  private determineSeverity(
    value: number,
    thresholds: [number, number, number, number],
  ): BottleneckSeverity {
    const [low, medium, high, critical] = thresholds;

    if (value >= critical) return BottleneckSeverity.CRITICAL;
    if (value >= high) return BottleneckSeverity.HIGH;
    if (value >= medium) return BottleneckSeverity.MEDIUM;
    return BottleneckSeverity.LOW;
  }

  /**
   * Calculate impact scores for bottlenecks
   */
  private calculateImpacts(bottlenecks: Bottleneck[], profile: ProfileResult): void {
    const totalDuration = profile.duration;

    for (const bottleneck of bottlenecks) {
      const nodeMetric = profile.nodeMetrics.find((n) => n.nodeId === bottleneck.nodeId);
      if (!nodeMetric) continue;

      // Impact is based on:
      // 1. Node execution time as % of total
      // 2. Severity weight
      // 3. Resource usage intensity

      const timeImpact = (nodeMetric.executionTime / totalDuration) * 100;

      const severityWeight = {
        [BottleneckSeverity.LOW]: 1,
        [BottleneckSeverity.MEDIUM]: 1.5,
        [BottleneckSeverity.HIGH]: 2,
        [BottleneckSeverity.CRITICAL]: 3,
      }[bottleneck.severity];

      const resourceWeight = this.calculateResourceWeight(bottleneck.type, nodeMetric);

      bottleneck.impact = Math.min(100, timeImpact * severityWeight * resourceWeight);
    }
  }

  /**
   * Calculate resource weight for impact calculation
   */
  private calculateResourceWeight(type: BottleneckType, nodeMetric: NodeMetrics): number {
    switch (type) {
      case BottleneckType.CPU:
        return Math.min(2, nodeMetric.resourceUsage.cpu.usage / 50);
      case BottleneckType.MEMORY:
        return Math.min(2, nodeMetric.resourceUsage.memory.peak / (512 * 1024 * 1024));
      case BottleneckType.NETWORK:
        return Math.min(2, nodeMetric.resourceUsage.network.latencyMs / 1000);
      case BottleneckType.EXTERNAL_API:
        return 1.5;
      case BottleneckType.DATABASE:
        return 1.3;
      default:
        return 1;
    }
  }

  /**
   * Identify critical path in workflow
   */
  private identifyCriticalPath(profile: ProfileResult): string[] {
    // Sort nodes by execution time
    const sortedNodes = [...profile.nodeMetrics].sort(
      (a, b) => b.executionTime - a.executionTime,
    );

    // Return top 5 slowest nodes as critical path
    return sortedNodes.slice(0, 5).map((n) => n.nodeId);
  }

  /**
   * Identify CPU bottleneck root cause
   */
  private identifyCpuRootCause(nodeMetric: NodeMetrics): string {
    if (nodeMetric.nodeType.toLowerCase().includes('code')) {
      return 'CPU-intensive code execution. Consider optimizing algorithms or splitting work.';
    }
    if (nodeMetric.inputItems > 1000) {
      return 'Processing large dataset. Consider batch processing or filtering.';
    }
    return 'High CPU usage detected. Review node configuration and data volume.';
  }

  /**
   * Identify memory bottleneck root cause
   */
  private identifyMemoryRootCause(nodeMetric: NodeMetrics): string {
    const itemCount = nodeMetric.inputItems + nodeMetric.outputItems;
    if (itemCount > 10000) {
      return 'Processing large number of items in memory. Consider streaming or batch processing.';
    }
    if (nodeMetric.nodeType.toLowerCase().includes('spreadsheet')) {
      return 'Large file processing. Consider reading in chunks or filtering data.';
    }
    return 'High memory usage. Review data structures and consider reducing batch sizes.';
  }

  /**
   * Identify network bottleneck root cause
   */
  private identifyNetworkRootCause(nodeMetric: NodeMetrics): string {
    if (nodeMetric.resourceUsage.network.requests > 100) {
      return 'Multiple network requests. Consider batching or using bulk APIs.';
    }
    if (nodeMetric.resourceUsage.network.latencyMs > 2000) {
      return 'High network latency. Check network connectivity and API endpoint performance.';
    }
    return 'Network bottleneck detected. Consider request optimization or caching.';
  }

  /**
   * Identify database bottleneck root cause
   */
  private identifyDatabaseRootCause(nodeMetric: NodeMetrics): string {
    const itemCount = nodeMetric.inputItems + nodeMetric.outputItems;
    if (itemCount > 1000) {
      return 'Large result set. Consider pagination, filtering, or indexing.';
    }
    return 'Slow database query. Check query optimization and database indexes.';
  }

  /**
   * Check if node is external API
   */
  private isExternalApiNode(nodeType: string): boolean {
    const apiTypes = ['http', 'webhook', 'api', 'rest', 'graphql'];
    return apiTypes.some((type) => nodeType.toLowerCase().includes(type));
  }

  /**
   * Check if node is database
   */
  private isDatabaseNode(nodeType: string): boolean {
    const dbTypes = ['postgres', 'mysql', 'mongodb', 'redis', 'database', 'sql'];
    return dbTypes.some((type) => nodeType.toLowerCase().includes(type));
  }
}
