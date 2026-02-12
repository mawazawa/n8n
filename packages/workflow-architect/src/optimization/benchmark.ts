/**
 * Workflow Benchmark
 * Performance benchmarking and statistical analysis for workflows
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { BenchmarkResult } from './types.js';

export class WorkflowBenchmark {
  private memoryBaseline: number = 0;

  /**
   * Benchmark a workflow with statistical analysis
   */
  async benchmark(
    workflow: WorkflowDefinition,
    iterations: number = 10,
    executeFn?: (workflow: WorkflowDefinition) => Promise<void>,
  ): Promise<BenchmarkResult> {
    // Record baseline memory
    this.memoryBaseline = this.getMemoryUsage();

    const durations: number[] = [];
    const nodeTimings: Map<string, number[]> = new Map();

    // Initialize node timing maps
    for (const node of workflow.nodes) {
      nodeTimings.set(node.id, []);
    }

    // Run iterations
    for (let i = 0; i < iterations; i++) {
      const result = await this.runSingleIteration(workflow, executeFn);
      durations.push(result.duration);

      // Collect node timings
      for (const [nodeId, timing] of Array.from(result.nodeTimings.entries())) {
        nodeTimings.get(nodeId)?.push(timing);
      }

      // Allow GC between iterations
      if (i % 5 === 0) {
        await this.sleep(100);
      }
    }

    // Calculate statistics
    const stats = this.calculateStatistics(durations);
    const avgNodeTimings = this.calculateAverageNodeTimings(nodeTimings);

    // Measure peak memory usage
    const memoryUsage = this.getMemoryUsage() - this.memoryBaseline;

    return {
      workflowId: workflow.id ?? 'unknown',
      iterations,
      avgDuration: stats.mean,
      p50Duration: stats.p50,
      p95Duration: stats.p95,
      p99Duration: stats.p99,
      memoryUsage,
      nodeTimings: avgNodeTimings,
    };
  }

  /**
   * Compare two benchmark results
   */
  compare(
    before: BenchmarkResult,
    after: BenchmarkResult,
  ): {
    durationImprovement: number;
    memoryImprovement: number;
    p95Improvement: number;
    nodeImprovements: Record<string, number>;
    summary: string;
  } {
    const durationImprovement = this.calculateImprovement(
      before.avgDuration,
      after.avgDuration,
    );

    const memoryImprovement = this.calculateImprovement(
      before.memoryUsage,
      after.memoryUsage,
    );

    const p95Improvement = this.calculateImprovement(
      before.p95Duration,
      after.p95Duration,
    );

    // Calculate per-node improvements
    const nodeImprovements: Record<string, number> = {};
    for (const nodeId in before.nodeTimings) {
      if (after.nodeTimings[nodeId]) {
        nodeImprovements[nodeId] = this.calculateImprovement(
          before.nodeTimings[nodeId],
          after.nodeTimings[nodeId],
        );
      }
    }

    const summary = this.generateComparisonSummary(
      durationImprovement,
      memoryImprovement,
      p95Improvement,
    );

    return {
      durationImprovement,
      memoryImprovement,
      p95Improvement,
      nodeImprovements,
      summary,
    };
  }

  /**
   * Run single benchmark iteration
   */
  private async runSingleIteration(
    workflow: WorkflowDefinition,
    executeFn?: (workflow: WorkflowDefinition) => Promise<void>,
  ): Promise<{ duration: number; nodeTimings: Map<string, number> }> {
    const nodeTimings = new Map<string, number>();

    // Simulate node execution timings
    for (const node of workflow.nodes) {
      nodeTimings.set(node.id, this.estimateNodeDuration(node));
    }

    const startTime = performance.now();

    if (executeFn) {
      // Use provided execution function
      await executeFn(workflow);
    } else {
      // Simulate execution based on node timings
      const totalSimulatedTime = Array.from(nodeTimings.values()).reduce(
        (sum, time) => sum + time,
        0,
      );
      await this.sleep(Math.min(totalSimulatedTime, 100)); // Cap simulation time
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    return { duration, nodeTimings };
  }

  /**
   * Calculate statistical measures from duration array
   */
  private calculateStatistics(durations: number[]): {
    mean: number;
    median: number;
    p50: number;
    p95: number;
    p99: number;
    stdDev: number;
  } {
    const sorted = [...durations].sort((a, b) => a - b);
    const n = sorted.length;

    // Mean
    const mean = sorted.reduce((sum, val) => sum + val, 0) / n;

    // Median (P50)
    const median = this.percentile(sorted, 50);
    const p50 = median;
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    // Standard deviation
    const squaredDiffs = sorted.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;
    const stdDev = Math.sqrt(variance);

    return { mean, median, p50, p95, p99, stdDev };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedArray[lower];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Calculate average node timings
   */
  private calculateAverageNodeTimings(
    nodeTimings: Map<string, number[]>,
  ): Record<string, number> {
    const averages: Record<string, number> = {};

    for (const [nodeId, timings] of Array.from(nodeTimings.entries())) {
      if (timings.length > 0) {
        const avg = timings.reduce((sum, val) => sum + val, 0) / timings.length;
        averages[nodeId] = Math.round(avg * 100) / 100; // Round to 2 decimals
      }
    }

    return averages;
  }

  /**
   * Estimate node execution duration based on type and complexity
   */
  private estimateNodeDuration(node: any): number {
    // Base duration by node type
    const baseDurations: Record<string, number> = {
      'n8n-nodes-base.httpRequest': 100,
      'n8n-nodes-base.webhook': 50,
      'n8n-nodes-base.code': 30,
      'n8n-nodes-base.function': 20,
      'n8n-nodes-base.set': 5,
      'n8n-nodes-base.if': 2,
      'n8n-nodes-base.switch': 3,
      'n8n-nodes-base.merge': 10,
      default: 15,
    };

    const nodeType = node.type as string;
    let duration = baseDurations[nodeType] ?? baseDurations.default;

    // Adjust for external API calls
    if (nodeType.includes('http') || this.isExternalService(nodeType)) {
      duration += 50; // Add network latency
    }

    // Adjust for complex operations
    const params = node.parameters;
    if (params) {
      const paramCount = Object.keys(params).length;
      duration += paramCount * 0.5;
    }

    // Add random variance (±20%)
    const variance = duration * 0.2;
    duration += (Math.random() - 0.5) * 2 * variance;

    return Math.max(1, duration);
  }

  /**
   * Check if node type is an external service
   */
  private isExternalService(nodeType: string): boolean {
    const externalPatterns = [
      'slack', 'gmail', 'github', 'jira', 'salesforce',
      'hubspot', 'stripe', 'shopify', 'openai', 'anthropic',
    ];

    return externalPatterns.some(pattern => nodeType.toLowerCase().includes(pattern));
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
    }

    // Fallback for browser environments
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100;
    }

    return 0;
  }

  /**
   * Calculate improvement percentage
   */
  private calculateImprovement(before: number, after: number): number {
    if (before === 0) return 0;

    const improvement = ((before - after) / before) * 100;
    return Math.round(improvement * 100) / 100;
  }

  /**
   * Generate human-readable comparison summary
   */
  private generateComparisonSummary(
    durationImprovement: number,
    memoryImprovement: number,
    p95Improvement: number,
  ): string {
    const parts: string[] = [];

    if (Math.abs(durationImprovement) >= 5) {
      const verb = durationImprovement > 0 ? 'faster' : 'slower';
      parts.push(`${Math.abs(durationImprovement).toFixed(1)}% ${verb}`);
    }

    if (Math.abs(memoryImprovement) >= 5) {
      const verb = memoryImprovement > 0 ? 'less memory' : 'more memory';
      parts.push(`${Math.abs(memoryImprovement).toFixed(1)}% ${verb}`);
    }

    if (Math.abs(p95Improvement) >= 5) {
      const verb = p95Improvement > 0 ? 'better' : 'worse';
      parts.push(`${Math.abs(p95Improvement).toFixed(1)}% ${verb} P95 latency`);
    }

    if (parts.length === 0) {
      return 'No significant performance change detected';
    }

    return `Performance is ${parts.join(', ')}`;
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run warmup iterations to stabilize JIT compilation
   */
  async warmup(
    workflow: WorkflowDefinition,
    iterations: number = 5,
    executeFn?: (workflow: WorkflowDefinition) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < iterations; i++) {
      await this.runSingleIteration(workflow, executeFn);
    }
  }

  /**
   * Profile memory usage over time
   */
  async profileMemory(
    workflow: WorkflowDefinition,
    duration: number = 10000,
    executeFn?: (workflow: WorkflowDefinition) => Promise<void>,
  ): Promise<{
    samples: Array<{ timestamp: number; memory: number }>;
    peak: number;
    average: number;
  }> {
    const samples: Array<{ timestamp: number; memory: number }> = [];
    const startTime = Date.now();
    const baseline = this.getMemoryUsage();

    // Run workflow execution in background
    const executionPromise = executeFn
      ? executeFn(workflow)
      : this.runSingleIteration(workflow);

    // Sample memory every 100ms
    while (Date.now() - startTime < duration) {
      const memory = this.getMemoryUsage() - baseline;
      samples.push({
        timestamp: Date.now() - startTime,
        memory,
      });

      await this.sleep(100);
    }

    await executionPromise;

    // Calculate statistics
    const memoryValues = samples.map(s => s.memory);
    const peak = Math.max(...memoryValues);
    const average = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;

    return { samples, peak, average };
  }
}
