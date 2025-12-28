/**
 * Execution Analyzer
 * Analyzes workflow executions to identify bottlenecks and generate insights
 */

import type { ExecutionResult, ExecutionNode, ExecutionMetrics } from './types.js';

export interface ExecutionInsight {
  type: 'performance' | 'reliability' | 'resource' | 'pattern';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  node?: string;
  value?: number;
  recommendation?: string;
}

export interface BottleneckNode {
  nodeName: string;
  nodeType: string;
  duration: number;
  percentageOfTotal: number;
  reason: 'absolute' | 'relative';
}

export interface ExecutionComparison {
  durationDelta: number;
  durationDeltaPercent: number;
  nodeChanges: {
    added: string[];
    removed: string[];
    modified: Array<{
      nodeName: string;
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
  };
  performanceChanges: {
    faster: Array<{ nodeName: string; improvement: number }>;
    slower: Array<{ nodeName: string; degradation: number }>;
  };
  statusChanged: boolean;
}

export class ExecutionAnalyzer {
  /**
   * Analyze an execution and generate insights
   */
  analyzeExecution(result: ExecutionResult): ExecutionInsight[] {
    const insights: ExecutionInsight[] = [];

    // Check if execution failed
    if (result.status === 'error') {
      insights.push({
        type: 'reliability',
        severity: 'critical',
        message: `Execution failed: ${result.error?.message || 'Unknown error'}`,
        node: result.error?.node,
        recommendation: 'Review error details and node configuration',
      });
    }

    // Check execution duration
    if (result.duration) {
      if (result.duration > 300000) { // > 5 minutes
        insights.push({
          type: 'performance',
          severity: 'warning',
          message: `Long execution time: ${(result.duration / 1000).toFixed(2)}s`,
          value: result.duration,
          recommendation: 'Consider optimizing workflow or splitting into smaller workflows',
        });
      } else if (result.duration > 600000) { // > 10 minutes
        insights.push({
          type: 'performance',
          severity: 'critical',
          message: `Very long execution time: ${(result.duration / 1000).toFixed(2)}s`,
          value: result.duration,
          recommendation: 'Investigate bottlenecks and consider breaking workflow into smaller parts',
        });
      }
    }

    // Check for bottlenecks
    const bottlenecks = this.detectBottlenecks(result);
    for (const bottleneck of bottlenecks) {
      insights.push({
        type: 'performance',
        severity: bottleneck.duration > 30000 ? 'critical' : 'warning',
        message: `Node "${bottleneck.nodeName}" took ${(bottleneck.duration / 1000).toFixed(2)}s (${bottleneck.percentageOfTotal.toFixed(1)}% of total)`,
        node: bottleneck.nodeName,
        value: bottleneck.duration,
        recommendation: `Optimize "${bottleneck.nodeName}" node or check external service performance`,
      });
    }

    // Check for failed nodes
    const failedNodes = result.nodes.filter(n => n.status === 'error');
    for (const node of failedNodes) {
      insights.push({
        type: 'reliability',
        severity: 'critical',
        message: `Node "${node.nodeName}" failed: ${node.error || 'Unknown error'}`,
        node: node.nodeName,
        recommendation: 'Review node configuration and input data',
      });
    }

    // Check for nodes with no output
    const emptyOutputNodes = result.nodes.filter(n => n.status === 'success' && n.outputItems === 0 && n.inputItems > 0);
    for (const node of emptyOutputNodes) {
      insights.push({
        type: 'pattern',
        severity: 'warning',
        message: `Node "${node.nodeName}" had input but produced no output`,
        node: node.nodeName,
        recommendation: 'Verify node filters and transformation logic',
      });
    }

    // Check for data volume
    const highVolumeNodes = result.nodes.filter(n => n.outputItems > 1000);
    for (const node of highVolumeNodes) {
      insights.push({
        type: 'resource',
        severity: 'info',
        message: `Node "${node.nodeName}" processed ${node.outputItems} items`,
        node: node.nodeName,
        value: node.outputItems,
        recommendation: 'Consider pagination or batching for large datasets',
      });
    }

    // Check for waiting status
    if (result.status === 'waiting') {
      insights.push({
        type: 'pattern',
        severity: 'info',
        message: 'Execution is waiting for external input or trigger',
        recommendation: 'Monitor wait nodes and ensure webhooks are properly configured',
      });
    }

    // Check mode and suggest optimizations
    if (result.mode === 'manual' && result.duration && result.duration < 1000) {
      insights.push({
        type: 'pattern',
        severity: 'info',
        message: 'Fast manual execution - consider automating with a trigger',
        recommendation: 'Add a Schedule or Webhook trigger to automate this workflow',
      });
    }

    return insights;
  }

  /**
   * Detect bottleneck nodes
   * A node is a bottleneck if:
   * 1. It takes more than 5 seconds (absolute threshold)
   * 2. It takes more than 50% of total execution time (relative threshold)
   */
  detectBottlenecks(result: ExecutionResult): BottleneckNode[] {
    const bottlenecks: BottleneckNode[] = [];

    if (!result.duration || result.duration === 0) {
      return bottlenecks;
    }

    const absoluteThreshold = 5000; // 5 seconds
    const relativeThreshold = 0.5; // 50% of total time

    for (const node of result.nodes) {
      if (!node.endTime || !node.startTime) {
        continue;
      }

      const duration = node.endTime - node.startTime;
      const percentageOfTotal = (duration / result.duration) * 100;

      let isBottleneck = false;
      let reason: 'absolute' | 'relative' = 'absolute';

      if (duration > absoluteThreshold) {
        isBottleneck = true;
        reason = 'absolute';
      } else if (percentageOfTotal > relativeThreshold * 100) {
        isBottleneck = true;
        reason = 'relative';
      }

      if (isBottleneck) {
        bottlenecks.push({
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          duration,
          percentageOfTotal,
          reason,
        });
      }
    }

    // Sort by duration descending
    return bottlenecks.sort((a, b) => b.duration - a.duration);
  }

  /**
   * Calculate aggregate metrics across multiple executions
   */
  calculateMetrics(results: ExecutionResult[]): ExecutionMetrics {
    const totalExecutions = results.length;

    if (totalExecutions === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        errorsByNode: {},
        executionsByHour: {},
      };
    }

    // Calculate success rate
    const successfulExecutions = results.filter(r => r.status === 'success').length;
    const successRate = (successfulExecutions / totalExecutions) * 100;

    // Calculate average duration
    const durationsSum = results
      .filter(r => r.duration !== undefined)
      .reduce((sum, r) => sum + (r.duration || 0), 0);
    const executionsWithDuration = results.filter(r => r.duration !== undefined).length;
    const averageDuration = executionsWithDuration > 0 ? durationsSum / executionsWithDuration : 0;

    // Count errors by node
    const errorsByNode: Record<string, number> = {};
    for (const result of results) {
      if (result.error?.node) {
        errorsByNode[result.error.node] = (errorsByNode[result.error.node] || 0) + 1;
      }
      // Also count node-level errors
      for (const node of result.nodes) {
        if (node.status === 'error') {
          errorsByNode[node.nodeName] = (errorsByNode[node.nodeName] || 0) + 1;
        }
      }
    }

    // Group executions by hour
    const executionsByHour: Record<string, number> = {};
    for (const result of results) {
      const date = new Date(result.startedAt);
      const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
      executionsByHour[hourKey] = (executionsByHour[hourKey] || 0) + 1;
    }

    return {
      totalExecutions,
      successRate,
      averageDuration,
      errorsByNode,
      executionsByHour,
    };
  }

  /**
   * Compare two executions to identify differences
   */
  compareExecutions(a: ExecutionResult, b: ExecutionResult): ExecutionComparison {
    // Calculate duration delta
    const durationA = a.duration || 0;
    const durationB = b.duration || 0;
    const durationDelta = durationB - durationA;
    const durationDeltaPercent = durationA > 0 ? (durationDelta / durationA) * 100 : 0;

    // Find node changes
    const nodesA = new Set(a.nodes.map(n => n.nodeName));
    const nodesB = new Set(b.nodes.map(n => n.nodeName));

    const added = Array.from(nodesB).filter(n => !nodesA.has(n));
    const removed = Array.from(nodesA).filter(n => !nodesB.has(n));

    const modified: ExecutionComparison['nodeChanges']['modified'] = [];
    for (const nodeNameA of nodesA) {
      if (!nodesB.has(nodeNameA)) continue;

      const nodeA = a.nodes.find(n => n.nodeName === nodeNameA);
      const nodeB = b.nodes.find(n => n.nodeName === nodeNameA);

      if (!nodeA || !nodeB) continue;

      // Check for type changes
      if (nodeA.nodeType !== nodeB.nodeType) {
        modified.push({
          nodeName: nodeNameA,
          field: 'nodeType',
          oldValue: nodeA.nodeType,
          newValue: nodeB.nodeType,
        });
      }

      // Check for status changes
      if (nodeA.status !== nodeB.status) {
        modified.push({
          nodeName: nodeNameA,
          field: 'status',
          oldValue: nodeA.status,
          newValue: nodeB.status,
        });
      }
    }

    // Find performance changes
    const faster: ExecutionComparison['performanceChanges']['faster'] = [];
    const slower: ExecutionComparison['performanceChanges']['slower'] = [];

    for (const nodeNameA of nodesA) {
      if (!nodesB.has(nodeNameA)) continue;

      const nodeA = a.nodes.find(n => n.nodeName === nodeNameA);
      const nodeB = b.nodes.find(n => n.nodeName === nodeNameA);

      if (!nodeA || !nodeB || !nodeA.endTime || !nodeA.startTime || !nodeB.endTime || !nodeB.startTime) {
        continue;
      }

      const durationNodeA = nodeA.endTime - nodeA.startTime;
      const durationNodeB = nodeB.endTime - nodeB.startTime;
      const delta = durationNodeB - durationNodeA;
      const deltaPercent = durationNodeA > 0 ? (delta / durationNodeA) * 100 : 0;

      if (Math.abs(deltaPercent) > 10) { // Only include significant changes (>10%)
        if (deltaPercent < 0) {
          faster.push({
            nodeName: nodeNameA,
            improvement: Math.abs(deltaPercent),
          });
        } else {
          slower.push({
            nodeName: nodeNameA,
            degradation: deltaPercent,
          });
        }
      }
    }

    return {
      durationDelta,
      durationDeltaPercent,
      nodeChanges: {
        added,
        removed,
        modified,
      },
      performanceChanges: {
        faster: faster.sort((x, y) => y.improvement - x.improvement),
        slower: slower.sort((x, y) => y.degradation - x.degradation),
      },
      statusChanged: a.status !== b.status,
    };
  }

  /**
   * Identify execution patterns over time
   */
  identifyPatterns(results: ExecutionResult[]): {
    peakHours: string[];
    mostFailedNodes: Array<{ nodeName: string; failureCount: number }>;
    averageDurationTrend: 'improving' | 'degrading' | 'stable';
    commonErrorPatterns: Array<{ pattern: string; count: number }>;
  } {
    // Find peak hours
    const hourCounts: Record<number, number> = {};
    for (const result of results) {
      const hour = new Date(result.startedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => `${hour}:00`);

    // Find most failed nodes
    const nodeFailures: Record<string, number> = {};
    for (const result of results) {
      for (const node of result.nodes) {
        if (node.status === 'error') {
          nodeFailures[node.nodeName] = (nodeFailures[node.nodeName] || 0) + 1;
        }
      }
    }
    const mostFailedNodes = Object.entries(nodeFailures)
      .map(([nodeName, failureCount]) => ({ nodeName, failureCount }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 5);

    // Analyze duration trend
    let averageDurationTrend: 'improving' | 'degrading' | 'stable' = 'stable';
    if (results.length >= 10) {
      const sortedResults = [...results].sort((a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      );
      const midpoint = Math.floor(sortedResults.length / 2);
      const firstHalf = sortedResults.slice(0, midpoint);
      const secondHalf = sortedResults.slice(midpoint);

      const avgFirst = firstHalf.reduce((sum, r) => sum + (r.duration || 0), 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, r) => sum + (r.duration || 0), 0) / secondHalf.length;

      const changePercent = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;

      if (changePercent < -10) {
        averageDurationTrend = 'improving';
      } else if (changePercent > 10) {
        averageDurationTrend = 'degrading';
      }
    }

    // Find common error patterns
    const errorPatterns: Record<string, number> = {};
    for (const result of results) {
      if (result.error?.message) {
        // Extract key error patterns
        const message = result.error.message.toLowerCase();
        if (message.includes('timeout')) {
          errorPatterns['timeout'] = (errorPatterns['timeout'] || 0) + 1;
        } else if (message.includes('connection') || message.includes('network')) {
          errorPatterns['connection'] = (errorPatterns['connection'] || 0) + 1;
        } else if (message.includes('authentication') || message.includes('unauthorized')) {
          errorPatterns['authentication'] = (errorPatterns['authentication'] || 0) + 1;
        } else if (message.includes('not found') || message.includes('404')) {
          errorPatterns['not_found'] = (errorPatterns['not_found'] || 0) + 1;
        } else if (message.includes('rate limit')) {
          errorPatterns['rate_limit'] = (errorPatterns['rate_limit'] || 0) + 1;
        } else {
          errorPatterns['other'] = (errorPatterns['other'] || 0) + 1;
        }
      }
    }
    const commonErrorPatterns = Object.entries(errorPatterns)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);

    return {
      peakHours,
      mostFailedNodes,
      averageDurationTrend,
      commonErrorPatterns,
    };
  }
}
