/**
 * Memory Analyzer
 * Analyzes memory usage and detects potential leaks
 */

import type {
  MemoryReport,
  MemorySnapshot,
  MemoryLeak,
} from './types.js';
import { DebugManager } from './manager.js';

export class MemoryAnalyzer {
  private snapshots = new Map<string, MemorySnapshot[]>();

  constructor(private debugManager: DebugManager) {}

  /**
   * Analyze memory usage for a session
   */
  async analyzeMemory(sessionId: string): Promise<MemoryReport> {
    const session = await this.debugManager.getSession(sessionId);
    const snapshots = this.snapshots.get(sessionId) || [];

    // Calculate total data size from stack
    const totalDataSize = this.calculateDataSize(session.stack);

    // Find peak memory
    const peakMemory = snapshots.length > 0
      ? Math.max(...snapshots.map((s) => s.heapUsed))
      : 0;

    // Detect memory leaks
    const leaks = this.detectLeaks(snapshots);

    // Generate optimization suggestions
    const optimization = this.generateOptimizations(snapshots, session.stack, leaks);

    return {
      sessionId,
      snapshots,
      totalDataSize,
      peakMemory,
      leaks: leaks.length > 0 ? leaks : undefined,
      optimization: optimization.length > 0 ? optimization : undefined,
    };
  }

  /**
   * Record memory snapshot for a node
   */
  async recordSnapshot(
    sessionId: string,
    nodeId: string,
    dataSize: number,
  ): Promise<void> {
    const snapshots = this.snapshots.get(sessionId) || [];

    // Get current memory usage
    let memUsage = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
    };

    try {
      const usage = process.memoryUsage();
      memUsage = {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
      };
    } catch (error) {
      // Fallback for environments without process.memoryUsage()
      console.warn('Memory usage not available:', error);
    }

    const snapshot: MemorySnapshot = {
      nodeId,
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      dataSize,
    };

    snapshots.push(snapshot);
    this.snapshots.set(sessionId, snapshots);
  }

  /**
   * Clear snapshots for a session
   */
  clearSnapshots(sessionId: string): void {
    this.snapshots.delete(sessionId);
  }

  /**
   * Calculate size of data in stack
   */
  private calculateDataSize(stack: Array<{ input?: unknown; output?: unknown }>): number {
    let totalSize = 0;

    for (const frame of stack) {
      if (frame.input) {
        totalSize += this.estimateSize(frame.input);
      }
      if (frame.output) {
        totalSize += this.estimateSize(frame.output);
      }
    }

    return totalSize;
  }

  /**
   * Estimate size of a JavaScript object in bytes
   */
  private estimateSize(obj: unknown): number {
    const seen = new WeakSet();

    const calculate = (item: unknown): number => {
      if (item === null || item === undefined) {
        return 0;
      }

      const type = typeof item;

      if (type === 'boolean') return 4;
      if (type === 'number') return 8;
      if (type === 'string') return (item as string).length * 2;

      if (type === 'object') {
        if (seen.has(item as object)) {
          return 0; // Circular reference
        }

        seen.add(item as object);

        if (Array.isArray(item)) {
          return item.reduce((sum, element) => sum + calculate(element), 0);
        }

        if (Buffer.isBuffer(item)) {
          return item.length;
        }

        // Regular object
        let size = 0;
        for (const key in item as object) {
          size += key.length * 2; // Key size
          size += calculate((item as Record<string, unknown>)[key]); // Value size
        }
        return size;
      }

      return 0;
    };

    return calculate(obj);
  }

  /**
   * Detect potential memory leaks
   */
  private detectLeaks(snapshots: MemorySnapshot[]): MemoryLeak[] {
    if (snapshots.length < 3) {
      return []; // Need at least 3 snapshots to detect trend
    }

    const leaks: MemoryLeak[] = [];
    const nodeMemory = new Map<string, number[]>();

    // Group snapshots by node
    for (const snapshot of snapshots) {
      if (!nodeMemory.has(snapshot.nodeId)) {
        nodeMemory.set(snapshot.nodeId, []);
      }
      nodeMemory.get(snapshot.nodeId)!.push(snapshot.heapUsed);
    }

    // Analyze each node's memory trend
    for (const [nodeId, memory] of nodeMemory.entries()) {
      if (memory.length < 3) continue;

      // Calculate growth rate
      const growthRate = this.calculateGrowthRate(memory);

      // If memory is consistently growing, it might be a leak
      if (growthRate > 0.1) {
        // Growing by more than 10%
        const severity = this.getSeverity(growthRate);

        leaks.push({
          nodeId,
          severity,
          description: `Memory usage growing at ${(growthRate * 100).toFixed(1)}% per execution`,
          growthRate,
          recommendation: this.getLeakRecommendation(severity, growthRate),
        });
      }
    }

    return leaks;
  }

  /**
   * Calculate growth rate from memory values
   */
  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;

    // Calculate average growth between consecutive values
    let totalGrowth = 0;
    let count = 0;

    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) {
        const growth = (values[i] - values[i - 1]) / values[i - 1];
        totalGrowth += growth;
        count++;
      }
    }

    return count > 0 ? totalGrowth / count : 0;
  }

  /**
   * Get severity level based on growth rate
   */
  private getSeverity(growthRate: number): 'low' | 'medium' | 'high' | 'critical' {
    if (growthRate > 0.5) return 'critical'; // >50% growth
    if (growthRate > 0.3) return 'high'; // >30% growth
    if (growthRate > 0.15) return 'medium'; // >15% growth
    return 'low';
  }

  /**
   * Get recommendation for memory leak
   */
  private getLeakRecommendation(
    severity: 'low' | 'medium' | 'high' | 'critical',
    growthRate: number,
  ): string {
    const recommendations = {
      critical: 'Critical memory leak detected. Immediately review this node for unbounded data structures, event listeners, or cached data.',
      high: 'Significant memory growth. Check for large data accumulation, unclosed connections, or memory-intensive operations.',
      medium: 'Moderate memory growth. Consider implementing data cleanup or pagination for large datasets.',
      low: 'Minor memory growth detected. Monitor this node for continued growth patterns.',
    };

    return recommendations[severity];
  }

  /**
   * Generate optimization suggestions
   */
  private generateOptimizations(
    snapshots: MemorySnapshot[],
    stack: Array<{ nodeId: string; input?: unknown; output?: unknown }>,
    leaks: MemoryLeak[],
  ): string[] {
    const suggestions: string[] = [];

    // Check for large data in snapshots
    const largeSnapshots = snapshots.filter((s) => s.dataSize > 10 * 1024 * 1024); // >10MB
    if (largeSnapshots.length > 0) {
      suggestions.push(
        `${largeSnapshots.length} node(s) processing large datasets (>10MB). Consider using streaming or pagination.`,
      );
    }

    // Check for high peak memory
    const peakMemory = snapshots.length > 0 ? Math.max(...snapshots.map((s) => s.heapUsed)) : 0;
    if (peakMemory > 500 * 1024 * 1024) {
      // >500MB
      suggestions.push(
        'Peak memory usage exceeds 500MB. Consider splitting the workflow into smaller chunks.',
      );
    }

    // Check for memory leaks
    if (leaks.length > 0) {
      suggestions.push(
        `${leaks.length} potential memory leak(s) detected. Review nodes for proper cleanup.`,
      );
    }

    // Check for duplicate data
    const dataHashes = new Set<string>();
    let duplicates = 0;
    for (const frame of stack) {
      if (frame.output) {
        const hash = JSON.stringify(frame.output);
        if (dataHashes.has(hash)) {
          duplicates++;
        }
        dataHashes.add(hash);
      }
    }

    if (duplicates > 0) {
      suggestions.push(
        `${duplicates} duplicate data structure(s) found. Consider deduplication or caching.`,
      );
    }

    return suggestions;
  }

  /**
   * Get memory usage summary
   */
  getMemorySummary(report: MemoryReport): {
    current: string;
    peak: string;
    dataSize: string;
    leakCount: number;
    health: 'good' | 'warning' | 'critical';
  } {
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const current = report.snapshots.length > 0
      ? report.snapshots[report.snapshots.length - 1].heapUsed
      : 0;

    const leakCount = report.leaks?.length || 0;
    const criticalLeaks = report.leaks?.filter((l) => l.severity === 'critical').length || 0;

    let health: 'good' | 'warning' | 'critical' = 'good';
    if (criticalLeaks > 0 || report.peakMemory > 1024 * 1024 * 1024) {
      // >1GB
      health = 'critical';
    } else if (leakCount > 0 || report.peakMemory > 500 * 1024 * 1024) {
      // >500MB
      health = 'warning';
    }

    return {
      current: formatBytes(current),
      peak: formatBytes(report.peakMemory),
      dataSize: formatBytes(report.totalDataSize),
      leakCount,
      health,
    };
  }
}

/**
 * Create a memory analyzer instance
 */
export function createMemoryAnalyzer(debugManager: DebugManager): MemoryAnalyzer {
  return new MemoryAnalyzer(debugManager);
}
