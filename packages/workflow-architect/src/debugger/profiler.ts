/**
 * Profiler
 * Performance profiling with CPU time tracking and flame graph generation
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import type {
  ProfileResult,
  ProfileMetrics,
  FlameGraphNode,
  StackFrame,
} from './types.js';
import { DebugManager } from './manager.js';

export class Profiler {
  private supabase = getSupabaseClient();
  private activeProfiles = new Map<string, ProfilingSession>();

  constructor(private debugManager: DebugManager) {}

  /**
   * Start profiling a session
   */
  async startProfiling(sessionId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);

    const profilingSession: ProfilingSession = {
      sessionId,
      startTime: Date.now(),
      metrics: new Map(),
      snapshots: [],
    };

    this.activeProfiles.set(sessionId, profilingSession);

    // Take initial memory snapshot
    this.takeMemorySnapshot(sessionId);
  }

  /**
   * Stop profiling and generate report
   */
  async stopProfiling(sessionId: string): Promise<ProfileResult> {
    const profilingSession = this.activeProfiles.get(sessionId);

    if (!profilingSession) {
      throw new Error('No active profiling session found');
    }

    // Take final snapshot
    this.takeMemorySnapshot(sessionId);

    // Calculate total duration
    const endTime = Date.now();
    const totalDuration = endTime - profilingSession.startTime;

    // Convert metrics map to array
    const metrics: ProfileMetrics[] = Array.from(profilingSession.metrics.values());

    // Calculate total memory
    const memorySnapshots = profilingSession.snapshots;
    const totalMemory = memorySnapshots.length > 0
      ? memorySnapshots[memorySnapshots.length - 1].heapUsed
      : 0;

    // Generate flame graph
    const flameGraph = this.generateFlameGraph(sessionId, metrics);

    // Identify hotspots
    const hotspots = this.identifyHotspots(metrics);

    // Save to database
    await this.saveProfile(sessionId, {
      sessionId,
      totalDuration,
      totalMemory,
      metrics,
      flameGraph,
      hotspots,
    });

    // Clean up
    this.activeProfiles.delete(sessionId);

    return {
      sessionId,
      totalDuration,
      totalMemory,
      metrics,
      flameGraph,
      hotspots,
    };
  }

  /**
   * Record node execution
   */
  async recordNodeExecution(
    sessionId: string,
    nodeId: string,
    nodeName: string,
    duration: number,
    memoryUsed?: number,
  ): Promise<void> {
    const profilingSession = this.activeProfiles.get(sessionId);

    if (!profilingSession) {
      return; // Not profiling
    }

    // Get or create metrics for this node
    let metrics = profilingSession.metrics.get(nodeId);

    if (!metrics) {
      metrics = {
        nodeId,
        nodeName,
        executionTime: 0,
        callCount: 0,
      };
      profilingSession.metrics.set(nodeId, metrics);
    }

    // Update metrics
    metrics.executionTime += duration;
    metrics.callCount++;

    if (memoryUsed !== undefined) {
      metrics.memoryUsed = (metrics.memoryUsed || 0) + memoryUsed;
      metrics.memoryPeak = Math.max(metrics.memoryPeak || 0, memoryUsed);
    }

    // Estimate CPU time (in real implementation, use process.cpuUsage())
    metrics.cpuTime = (metrics.cpuTime || 0) + duration;
  }

  /**
   * Take memory snapshot
   */
  private takeMemorySnapshot(sessionId: string): void {
    const profilingSession = this.activeProfiles.get(sessionId);

    if (!profilingSession) {
      return;
    }

    // Get memory usage (in real implementation, use process.memoryUsage())
    const memUsage = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
    };

    try {
      const usage = process.memoryUsage();
      memUsage.heapUsed = usage.heapUsed;
      memUsage.heapTotal = usage.heapTotal;
      memUsage.external = usage.external;
    } catch (error) {
      // Fallback for environments without process.memoryUsage()
      console.warn('Memory usage not available:', error);
    }

    profilingSession.snapshots.push({
      timestamp: Date.now(),
      ...memUsage,
    });
  }

  /**
   * Generate flame graph data
   */
  private generateFlameGraph(sessionId: string, metrics: ProfileMetrics[]): FlameGraphNode {
    // Sort by execution time
    const sorted = [...metrics].sort((a, b) => b.executionTime - a.executionTime);

    // Create root node
    const root: FlameGraphNode = {
      name: 'Root',
      value: sorted.reduce((sum, m) => sum + m.executionTime, 0),
      children: [],
    };

    // Add top-level nodes
    root.children = sorted.map((metric) => ({
      name: metric.nodeName,
      value: metric.executionTime,
      children: [], // In real implementation, would include nested calls
    }));

    return root;
  }

  /**
   * Identify performance hotspots
   */
  private identifyHotspots(
    metrics: ProfileMetrics[],
  ): Array<{ nodeId: string; metric: string; value: number }> {
    const hotspots: Array<{ nodeId: string; metric: string; value: number }> = [];

    // Find slowest nodes
    const byTime = [...metrics].sort((a, b) => b.executionTime - a.executionTime);
    if (byTime.length > 0) {
      hotspots.push({
        nodeId: byTime[0].nodeId,
        metric: 'execution_time',
        value: byTime[0].executionTime,
      });
    }

    // Find memory-intensive nodes
    const byMemory = [...metrics]
      .filter((m) => m.memoryPeak !== undefined)
      .sort((a, b) => (b.memoryPeak || 0) - (a.memoryPeak || 0));

    if (byMemory.length > 0 && byMemory[0].memoryPeak !== undefined) {
      hotspots.push({
        nodeId: byMemory[0].nodeId,
        metric: 'memory_peak',
        value: byMemory[0].memoryPeak,
      });
    }

    // Find most called nodes
    const byCalls = [...metrics].sort((a, b) => b.callCount - a.callCount);
    if (byCalls.length > 0) {
      hotspots.push({
        nodeId: byCalls[0].nodeId,
        metric: 'call_count',
        value: byCalls[0].callCount,
      });
    }

    return hotspots;
  }

  /**
   * Save profile to database
   */
  private async saveProfile(sessionId: string, profile: ProfileResult): Promise<void> {
    const { error } = await this.supabase
      .from('profiling_data')
      .insert({
        id: uuidv4(),
        session_id: sessionId,
        total_duration: profile.totalDuration,
        total_memory: profile.totalMemory,
        metrics: profile.metrics,
        flame_graph: profile.flameGraph,
        hotspots: profile.hotspots,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to save profile:', error);
    }
  }

  /**
   * Get profile by session ID
   */
  async getProfile(sessionId: string): Promise<ProfileResult | null> {
    const { data, error } = await this.supabase
      .from('profiling_data')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      sessionId: data.session_id as string,
      totalDuration: data.total_duration as number,
      totalMemory: data.total_memory as number,
      metrics: data.metrics as ProfileMetrics[],
      flameGraph: data.flame_graph as FlameGraphNode,
      hotspots: data.hotspots as ProfileResult['hotspots'],
    };
  }

  /**
   * Compare two profiles
   */
  compareProfiles(
    baseline: ProfileResult,
    current: ProfileResult,
  ): {
    durationDiff: number;
    memoryDiff: number;
    nodeChanges: Array<{
      nodeId: string;
      metric: string;
      baseline: number;
      current: number;
      diff: number;
      percentChange: number;
    }>;
  } {
    const durationDiff = current.totalDuration - baseline.totalDuration;
    const memoryDiff = current.totalMemory - baseline.totalMemory;

    const nodeChanges: Array<{
      nodeId: string;
      metric: string;
      baseline: number;
      current: number;
      diff: number;
      percentChange: number;
    }> = [];

    // Compare node metrics
    for (const currentMetric of current.metrics) {
      const baselineMetric = baseline.metrics.find((m) => m.nodeId === currentMetric.nodeId);

      if (baselineMetric) {
        const diff = currentMetric.executionTime - baselineMetric.executionTime;
        const percentChange = (diff / baselineMetric.executionTime) * 100;

        nodeChanges.push({
          nodeId: currentMetric.nodeId,
          metric: 'execution_time',
          baseline: baselineMetric.executionTime,
          current: currentMetric.executionTime,
          diff,
          percentChange,
        });
      }
    }

    return {
      durationDiff,
      memoryDiff,
      nodeChanges: nodeChanges.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange)),
    };
  }
}

interface ProfilingSession {
  sessionId: string;
  startTime: number;
  metrics: Map<string, ProfileMetrics>;
  snapshots: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  }>;
}

/**
 * Create a profiler instance
 */
export function createProfiler(debugManager: DebugManager): Profiler {
  return new Profiler(debugManager);
}
