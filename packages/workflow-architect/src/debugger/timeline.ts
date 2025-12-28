/**
 * Timeline Builder
 * Builds execution timeline visualization with Gantt-chart style data
 */

import type { Timeline, TimelineEvent, StackFrame } from './types.js';

export interface ExecutionData {
  id: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    startTime: number;
    endTime?: number;
    status: 'running' | 'completed' | 'error' | 'waiting';
    input?: unknown;
    output?: unknown;
    error?: string;
    parentId?: string;
  }>;
}

export class TimelineBuilder {
  /**
   * Build timeline from execution data
   */
  buildTimeline(execution: ExecutionData): Timeline {
    const events: TimelineEvent[] = [];
    const branchMap = new Map<string, string>();
    let branchCounter = 0;

    // Sort nodes by start time
    const sortedNodes = [...execution.nodes].sort((a, b) => a.startTime - b.startTime);

    // Identify parallel branches
    const parallelGroups = this.identifyParallelBranches(sortedNodes);

    for (const node of sortedNodes) {
      // Determine if this node is part of a parallel branch
      const branchId = this.findBranchId(node.id, parallelGroups, branchMap);
      if (branchId && !branchMap.has(node.id)) {
        branchMap.set(node.id, branchId);
      } else if (!branchMap.has(node.id)) {
        branchMap.set(node.id, `branch-${branchCounter++}`);
      }

      const event: TimelineEvent = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        startTime: node.startTime,
        endTime: node.endTime,
        duration: node.endTime ? node.endTime - node.startTime : undefined,
        status: node.status,
        input: node.input,
        output: node.output,
        error: node.error,
        parallel: parallelGroups.some((group) => group.includes(node.id)),
        branchId: branchMap.get(node.id),
      };

      events.push(event);
    }

    // Calculate total duration
    const startTime = Math.min(...events.map((e) => e.startTime));
    const endTime = Math.max(...events.map((e) => e.endTime || e.startTime));
    const totalDuration = endTime - startTime;

    // Get unique branch IDs
    const parallelBranches = Array.from(new Set(branchMap.values()));

    return {
      executionId: execution.id,
      events,
      totalDuration,
      startTime,
      endTime,
      parallelBranches: parallelBranches.length > 1 ? parallelBranches : undefined,
    };
  }

  /**
   * Build timeline from stack frames
   */
  buildTimelineFromStack(executionId: string, stack: StackFrame[]): Timeline {
    const events: TimelineEvent[] = stack.map((frame) => ({
      nodeId: frame.nodeId,
      nodeName: frame.nodeName,
      nodeType: frame.nodeType,
      startTime: frame.timestamp,
      endTime: frame.duration ? frame.timestamp + frame.duration : undefined,
      duration: frame.duration,
      status: frame.error ? 'error' : 'completed',
      input: frame.input,
      output: frame.output,
      error: frame.error,
      parallel: false,
    }));

    const startTime = Math.min(...events.map((e) => e.startTime));
    const endTime = Math.max(...events.map((e) => e.endTime || e.startTime));
    const totalDuration = endTime - startTime;

    return {
      executionId,
      events,
      totalDuration,
      startTime,
      endTime,
    };
  }

  /**
   * Identify parallel branches in execution
   */
  private identifyParallelBranches(
    nodes: ExecutionData['nodes'],
  ): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (processed.has(node.id)) continue;

      // Find nodes that overlap in time with this node
      const overlapping = nodes.filter((other, j) => {
        if (i === j || processed.has(other.id)) return false;
        if (!node.endTime || !other.endTime) return false;

        // Check if time ranges overlap
        return (
          (other.startTime >= node.startTime && other.startTime < node.endTime) ||
          (node.startTime >= other.startTime && node.startTime < other.endTime)
        );
      });

      if (overlapping.length > 0) {
        const group = [node.id, ...overlapping.map((n) => n.id)];
        groups.push(group);
        group.forEach((id) => processed.add(id));
      }
    }

    return groups;
  }

  /**
   * Find which branch a node belongs to
   */
  private findBranchId(
    nodeId: string,
    parallelGroups: string[][],
    branchMap: Map<string, string>,
  ): string | undefined {
    for (let i = 0; i < parallelGroups.length; i++) {
      const group = parallelGroups[i];
      if (group.includes(nodeId)) {
        // Check if any node in this group already has a branch ID
        for (const id of group) {
          const existingBranch = branchMap.get(id);
          if (existingBranch) {
            return existingBranch;
          }
        }
        // Assign new branch ID
        return `parallel-${i}`;
      }
    }
    return undefined;
  }

  /**
   * Get Gantt chart data
   */
  getGanttData(timeline: Timeline): Array<{
    id: string;
    name: string;
    start: number;
    duration: number;
    branch?: string;
  }> {
    return timeline.events.map((event) => ({
      id: event.nodeId,
      name: event.nodeName,
      start: event.startTime - timeline.startTime, // Relative to start
      duration: event.duration || 0,
      branch: event.branchId,
    }));
  }

  /**
   * Get critical path (longest execution path)
   */
  getCriticalPath(timeline: Timeline): TimelineEvent[] {
    // Simple implementation: return events sorted by start time
    // In a real implementation, this would analyze the execution graph
    return [...timeline.events].sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get performance statistics
   */
  getStatistics(timeline: Timeline): {
    totalNodes: number;
    completedNodes: number;
    errorNodes: number;
    averageDuration: number;
    slowestNode: TimelineEvent | undefined;
    parallelBranches: number;
  } {
    const completedNodes = timeline.events.filter((e) => e.status === 'completed').length;
    const errorNodes = timeline.events.filter((e) => e.status === 'error').length;

    const durations = timeline.events
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!);

    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const slowestNode = timeline.events
      .filter((e) => e.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];

    return {
      totalNodes: timeline.events.length,
      completedNodes,
      errorNodes,
      averageDuration,
      slowestNode,
      parallelBranches: timeline.parallelBranches?.length || 0,
    };
  }

  /**
   * Format timeline for visualization
   */
  formatForVisualization(timeline: Timeline): {
    lanes: Array<{
      id: string;
      name: string;
      events: Array<{
        start: number;
        duration: number;
        label: string;
        status: string;
      }>;
    }>;
    totalDuration: number;
  } {
    // Group events by branch
    const lanes = new Map<string, TimelineEvent[]>();

    for (const event of timeline.events) {
      const laneId = event.branchId || 'main';
      if (!lanes.has(laneId)) {
        lanes.set(laneId, []);
      }
      lanes.get(laneId)!.push(event);
    }

    return {
      lanes: Array.from(lanes.entries()).map(([id, events]) => ({
        id,
        name: id === 'main' ? 'Main' : id,
        events: events.map((e) => ({
          start: e.startTime - timeline.startTime,
          duration: e.duration || 0,
          label: e.nodeName,
          status: e.status,
        })),
      })),
      totalDuration: timeline.totalDuration,
    };
  }
}

/**
 * Create a timeline builder instance
 */
export function createTimelineBuilder(): TimelineBuilder {
  return new TimelineBuilder();
}
