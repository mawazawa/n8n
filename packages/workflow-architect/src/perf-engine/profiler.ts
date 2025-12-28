/**
 * Execution Profiler
 * Profiles workflow executions to capture performance metrics
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ProfileResult,
  NodeMetrics,
  ResourceUsage,
  FlameGraphNode,
  ProfilingOptions,
  ProfilingOptionsSchema,
} from './types';

interface ExecutionData {
  id: string;
  workflowId: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    startTime: number;
    endTime: number;
    inputItems: number;
    outputItems: number;
    error?: string;
  }>;
  startTime: number;
  endTime: number;
}

interface NodeSample {
  nodeId: string;
  timestamp: number;
  cpu: number;
  memory: number;
}

export class Profiler {
  private samples: Map<string, NodeSample[]> = new Map();
  private activeProfiles: Map<string, { startTime: number; options: ProfilingOptions }> = new Map();

  /**
   * Profile a workflow execution
   */
  async profile(execution: ExecutionData, options: ProfilingOptions = {}): Promise<ProfileResult> {
    const validatedOptions = ProfilingOptionsSchema.parse(options);

    const nodeMetrics = await this.collectNodeMetrics(execution, validatedOptions);
    const totalResourceUsage = this.aggregateResourceUsage(nodeMetrics);

    let flameGraph: FlameGraphNode | undefined;
    if (validatedOptions.includeFlameGraph) {
      flameGraph = this.generateFlameGraph(execution, nodeMetrics);
    }

    return {
      id: uuidv4(),
      workflowId: execution.workflowId,
      executionId: execution.id,
      startTime: execution.startTime,
      endTime: execution.endTime,
      duration: execution.endTime - execution.startTime,
      nodeMetrics,
      totalResourceUsage,
      flameGraph,
      metadata: {
        options: validatedOptions,
        nodeCount: execution.nodes.length,
      },
    };
  }

  /**
   * Start profiling an execution
   */
  startProfiling(executionId: string, options: ProfilingOptions = {}): void {
    const validatedOptions = ProfilingOptionsSchema.parse(options);

    this.activeProfiles.set(executionId, {
      startTime: Date.now(),
      options: validatedOptions,
    });

    this.samples.set(executionId, []);

    // Start sampling if enabled
    if (validatedOptions.sampleRate && validatedOptions.sampleRate > 0) {
      this.startSampling(executionId, validatedOptions.sampleRate);
    }
  }

  /**
   * Stop profiling an execution
   */
  stopProfiling(executionId: string): void {
    this.activeProfiles.delete(executionId);
    // Keep samples for later analysis
  }

  /**
   * Collect metrics for each node
   */
  private async collectNodeMetrics(
    execution: ExecutionData,
    options: ProfilingOptions,
  ): Promise<NodeMetrics[]> {
    return execution.nodes.map((node) => {
      const executionTime = node.endTime - node.startTime;
      const samples = this.samples.get(execution.id) || [];
      const nodeSamples = samples.filter((s) => s.nodeId === node.id);

      const resourceUsage = this.calculateResourceUsage(
        node,
        nodeSamples,
        executionTime,
        options,
      );

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        executionTime,
        resourceUsage,
        inputItems: node.inputItems,
        outputItems: node.outputItems,
        errorCount: node.error ? 1 : 0,
        retries: 0, // Would need to track this separately
      };
    });
  }

  /**
   * Calculate resource usage for a node
   */
  private calculateResourceUsage(
    node: ExecutionData['nodes'][0],
    samples: NodeSample[],
    executionTime: number,
    options: ProfilingOptions,
  ): ResourceUsage {
    const cpuUsage = this.estimateCpuUsage(executionTime, samples);
    const memoryUsage = this.estimateMemoryUsage(node, samples, options.captureMemory);
    const networkUsage = this.estimateNetworkUsage(node, options.captureNetwork);
    const diskUsage = this.estimateDiskUsage(node, options.captureDisk);

    return {
      cpu: cpuUsage,
      memory: memoryUsage,
      network: networkUsage,
      disk: diskUsage,
    };
  }

  /**
   * Estimate CPU usage
   */
  private estimateCpuUsage(
    executionTime: number,
    samples: NodeSample[],
  ): ResourceUsage['cpu'] {
    const avgCpuFromSamples = samples.length > 0
      ? samples.reduce((sum, s) => sum + s.cpu, 0) / samples.length
      : 50; // Default estimate

    return {
      usage: Math.min(avgCpuFromSamples, 100),
      cores: 1, // Would need system info
      timeMs: executionTime,
    };
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(
    node: ExecutionData['nodes'][0],
    samples: NodeSample[],
    captureMemory?: boolean,
  ): ResourceUsage['memory'] {
    if (!captureMemory) {
      return {
        used: 0,
        peak: 0,
        allocated: 0,
      };
    }

    const memoryFromSamples = samples.map((s) => s.memory);
    const peak = memoryFromSamples.length > 0 ? Math.max(...memoryFromSamples) : 0;
    const avg = memoryFromSamples.length > 0
      ? memoryFromSamples.reduce((sum, m) => sum + m, 0) / memoryFromSamples.length
      : 0;

    // Estimate based on data volume
    const dataEstimate = (node.inputItems + node.outputItems) * 1024; // 1KB per item estimate

    return {
      used: Math.max(avg, dataEstimate),
      peak: Math.max(peak, dataEstimate),
      allocated: Math.max(peak * 1.2, dataEstimate * 1.5), // Buffer for allocation
    };
  }

  /**
   * Estimate network usage
   */
  private estimateNetworkUsage(
    node: ExecutionData['nodes'][0],
    captureNetwork?: boolean,
  ): ResourceUsage['network'] {
    if (!captureNetwork) {
      return {
        bytesIn: 0,
        bytesOut: 0,
        requests: 0,
        latencyMs: 0,
      };
    }

    // Estimate based on node type
    const isHttpNode = node.type.toLowerCase().includes('http') ||
                      node.type.toLowerCase().includes('webhook');

    if (isHttpNode) {
      return {
        bytesIn: node.inputItems * 512, // Estimate
        bytesOut: node.outputItems * 512,
        requests: Math.max(node.inputItems, 1),
        latencyMs: (node.endTime - node.startTime) / Math.max(node.inputItems, 1),
      };
    }

    return {
      bytesIn: 0,
      bytesOut: 0,
      requests: 0,
      latencyMs: 0,
    };
  }

  /**
   * Estimate disk usage
   */
  private estimateDiskUsage(
    node: ExecutionData['nodes'][0],
    captureDisk?: boolean,
  ): ResourceUsage['disk'] {
    if (!captureDisk) {
      return {
        reads: 0,
        writes: 0,
        bytesRead: 0,
        bytesWritten: 0,
      };
    }

    // Estimate based on node type
    const isFileNode = node.type.toLowerCase().includes('file') ||
                      node.type.toLowerCase().includes('spreadsheet');

    if (isFileNode) {
      return {
        reads: node.inputItems,
        writes: node.outputItems,
        bytesRead: node.inputItems * 4096, // Estimate
        bytesWritten: node.outputItems * 4096,
      };
    }

    return {
      reads: 0,
      writes: 0,
      bytesRead: 0,
      bytesWritten: 0,
    };
  }

  /**
   * Aggregate resource usage across all nodes
   */
  private aggregateResourceUsage(nodeMetrics: NodeMetrics[]): ResourceUsage {
    return nodeMetrics.reduce(
      (total, node) => ({
        cpu: {
          usage: Math.max(total.cpu.usage, node.resourceUsage.cpu.usage),
          cores: Math.max(total.cpu.cores, node.resourceUsage.cpu.cores),
          timeMs: total.cpu.timeMs + node.resourceUsage.cpu.timeMs,
        },
        memory: {
          used: total.memory.used + node.resourceUsage.memory.used,
          peak: Math.max(total.memory.peak, node.resourceUsage.memory.peak),
          allocated: total.memory.allocated + node.resourceUsage.memory.allocated,
        },
        network: {
          bytesIn: total.network.bytesIn + node.resourceUsage.network.bytesIn,
          bytesOut: total.network.bytesOut + node.resourceUsage.network.bytesOut,
          requests: total.network.requests + node.resourceUsage.network.requests,
          latencyMs: Math.max(total.network.latencyMs, node.resourceUsage.network.latencyMs),
        },
        disk: {
          reads: total.disk.reads + node.resourceUsage.disk.reads,
          writes: total.disk.writes + node.resourceUsage.disk.writes,
          bytesRead: total.disk.bytesRead + node.resourceUsage.disk.bytesRead,
          bytesWritten: total.disk.bytesWritten + node.resourceUsage.disk.bytesWritten,
        },
      }),
      {
        cpu: { usage: 0, cores: 1, timeMs: 0 },
        memory: { used: 0, peak: 0, allocated: 0 },
        network: { bytesIn: 0, bytesOut: 0, requests: 0, latencyMs: 0 },
        disk: { reads: 0, writes: 0, bytesRead: 0, bytesWritten: 0 },
      },
    );
  }

  /**
   * Generate flame graph for visualization
   */
  private generateFlameGraph(
    execution: ExecutionData,
    nodeMetrics: NodeMetrics[],
  ): FlameGraphNode {
    const root: FlameGraphNode = {
      name: 'Workflow',
      value: execution.endTime - execution.startTime,
      children: [],
    };

    // Sort nodes by execution time
    const sortedMetrics = [...nodeMetrics].sort((a, b) => b.executionTime - a.executionTime);

    root.children = sortedMetrics.map((metric) => ({
      name: metric.nodeName,
      value: metric.executionTime,
      metadata: {
        nodeId: metric.nodeId,
        nodeType: metric.nodeType,
        cpuUsage: metric.resourceUsage.cpu.usage,
        memoryUsed: metric.resourceUsage.memory.used,
      },
    }));

    return root;
  }

  /**
   * Start sampling resource usage
   */
  private startSampling(executionId: string, sampleRate: number): void {
    const intervalMs = 1000 / sampleRate; // Convert rate to interval

    const interval = setInterval(() => {
      const profile = this.activeProfiles.get(executionId);
      if (!profile) {
        clearInterval(interval);
        return;
      }

      // Sample current resource usage
      const sample: NodeSample = {
        nodeId: 'current', // Would need to track current node
        timestamp: Date.now(),
        cpu: this.getCurrentCpuUsage(),
        memory: this.getCurrentMemoryUsage(),
      };

      const samples = this.samples.get(executionId) || [];
      samples.push(sample);
      this.samples.set(executionId, samples);
    }, intervalMs);
  }

  /**
   * Get current CPU usage
   */
  private getCurrentCpuUsage(): number {
    // In a real implementation, would use process.cpuUsage() or similar
    return Math.random() * 100; // Placeholder
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  /**
   * Clear samples for an execution
   */
  clearSamples(executionId: string): void {
    this.samples.delete(executionId);
  }

  /**
   * Get samples for an execution
   */
  getSamples(executionId: string): NodeSample[] {
    return this.samples.get(executionId) || [];
  }
}
