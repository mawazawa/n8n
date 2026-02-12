/**
 * Resource Allocator
 * Estimates and recommends resource allocation for workflows
 */

import {
  ResourcePlan,
  ScalingRecommendation,
  ResourceType,
  ProfileResult,
  NodeMetrics,
} from './types';

interface WorkflowDefinition {
  id: string;
  nodes: Array<{
    id: string;
    type: string;
    parameters: Record<string, unknown>;
  }>;
}

export class ResourceAllocator {
  /**
   * Create resource allocation plan
   */
  async allocate(
    workflow: WorkflowDefinition,
    historicalProfiles: ProfileResult[] = [],
  ): Promise<ResourcePlan> {
    const estimatedResources = this.estimateResources(workflow, historicalProfiles);
    const scalingRecommendations = this.generateScalingRecommendations(
      estimatedResources,
      historicalProfiles,
    );
    const costEstimate = this.estimateCost(estimatedResources);
    const confidence = this.calculateConfidence(historicalProfiles);

    return {
      workflowId: workflow.id,
      estimatedResources,
      scalingRecommendations,
      costEstimate,
      confidence,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Estimate required resources
   */
  private estimateResources(
    workflow: WorkflowDefinition,
    profiles: ProfileResult[],
  ): ResourcePlan['estimatedResources'] {
    // Use historical data if available
    if (profiles.length > 0) {
      return this.estimateFromHistory(profiles);
    }

    // Otherwise, estimate based on workflow structure
    return this.estimateFromStructure(workflow);
  }

  /**
   * Estimate from historical data
   */
  private estimateFromHistory(
    profiles: ProfileResult[],
  ): ResourcePlan['estimatedResources'] {
    // Calculate average and peak from recent profiles
    const recentProfiles = profiles.slice(0, 10);

    const avgCpu = this.calculateAverage(
      recentProfiles.map((p) => p.totalResourceUsage.cpu.usage),
    );

    const avgMemory = this.calculateAverage(
      recentProfiles.map((p) => p.totalResourceUsage.memory.used),
    );

    const peakMemory = Math.max(
      ...recentProfiles.map((p) => p.totalResourceUsage.memory.peak),
    );

    const totalNetworkBytes =
      this.calculateAverage(
        recentProfiles.map(
          (p) =>
            p.totalResourceUsage.network.bytesIn + p.totalResourceUsage.network.bytesOut,
        ),
      ) /
      (1024 * 1024); // Convert to MB

    const avgDuration = this.calculateAverage(
      recentProfiles.map((p) => p.duration),
    );

    return {
      cpu: {
        cores: Math.ceil(avgCpu / 80), // 1 core per 80% usage
        durationMs: avgDuration,
      },
      memory: {
        requiredMb: avgMemory / (1024 * 1024),
        peakMb: peakMemory / (1024 * 1024),
      },
      network: {
        bandwidthMbps: (totalNetworkBytes * 8) / (avgDuration / 1000), // Convert to Mbps
        totalMb: totalNetworkBytes,
      },
      disk: {
        spaceMb: 100, // Default estimate
        iops: 100,
      },
    };
  }

  /**
   * Estimate from workflow structure
   */
  private estimateFromStructure(
    workflow: WorkflowDefinition,
  ): ResourcePlan['estimatedResources'] {
    let cpuEstimate = 1;
    let memoryEstimateMb = 128;
    let networkEstimateMb = 10;
    let diskEstimateMb = 50;

    for (const node of workflow.nodes) {
      const nodeEstimate = this.estimateNodeResources(node);

      cpuEstimate = Math.max(cpuEstimate, nodeEstimate.cpu);
      memoryEstimateMb += nodeEstimate.memoryMb;
      networkEstimateMb += nodeEstimate.networkMb;
      diskEstimateMb += nodeEstimate.diskMb;
    }

    return {
      cpu: {
        cores: cpuEstimate,
        durationMs: workflow.nodes.length * 1000, // Rough estimate
      },
      memory: {
        requiredMb: memoryEstimateMb,
        peakMb: memoryEstimateMb * 1.5,
      },
      network: {
        bandwidthMbps: networkEstimateMb / 10, // Assume 10s execution
        totalMb: networkEstimateMb,
      },
      disk: {
        spaceMb: diskEstimateMb,
        iops: Math.ceil(diskEstimateMb / 4), // 4MB per IO estimate
      },
    };
  }

  /**
   * Estimate resources for a single node
   */
  private estimateNodeResources(node: WorkflowDefinition['nodes'][0]): {
    cpu: number;
    memoryMb: number;
    networkMb: number;
    diskMb: number;
  } {
    const nodeType = node.type.toLowerCase();

    // CPU-intensive nodes
    if (nodeType.includes('code') || nodeType.includes('function')) {
      return { cpu: 2, memoryMb: 256, networkMb: 1, diskMb: 10 };
    }

    // Database nodes
    if (nodeType.includes('database') || nodeType.includes('postgres') || nodeType.includes('mysql')) {
      return { cpu: 1, memoryMb: 128, networkMb: 50, diskMb: 20 };
    }

    // File/Spreadsheet nodes
    if (nodeType.includes('file') || nodeType.includes('spreadsheet')) {
      return { cpu: 1, memoryMb: 512, networkMb: 10, diskMb: 200 };
    }

    // HTTP/API nodes
    if (nodeType.includes('http') || nodeType.includes('api')) {
      return { cpu: 1, memoryMb: 64, networkMb: 100, diskMb: 10 };
    }

    // Default
    return { cpu: 1, memoryMb: 64, networkMb: 10, diskMb: 10 };
  }

  /**
   * Generate scaling recommendations
   */
  private generateScalingRecommendations(
    resources: ResourcePlan['estimatedResources'],
    profiles: ProfileResult[],
  ): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];

    // CPU scaling
    if (resources.cpu.cores > 1) {
      recommendations.push({
        type: 'vertical',
        resource: ResourceType.CPU,
        currentValue: 1,
        recommendedValue: resources.cpu.cores,
        expectedImprovement: Math.min(resources.cpu.cores * 30, 80), // 30% per core, max 80%
        costImpact: resources.cpu.cores * 50, // 50% cost increase per core
      });
    }

    // Memory scaling
    if (resources.memory.peakMb > 1024) {
      recommendations.push({
        type: 'vertical',
        resource: ResourceType.MEMORY,
        currentValue: 512,
        recommendedValue: Math.ceil(resources.memory.peakMb / 512) * 512,
        expectedImprovement: 20,
        costImpact: Math.ceil(resources.memory.peakMb / 512) * 20,
      });
    }

    // Horizontal scaling for high throughput
    if (profiles.length > 100 && this.hasHighThroughput(profiles)) {
      recommendations.push({
        type: 'horizontal',
        resource: ResourceType.CPU,
        currentValue: 1,
        recommendedValue: 3,
        expectedImprovement: 60,
        costImpact: 200, // Triple the cost
      });
    }

    return recommendations;
  }

  /**
   * Estimate cost
   */
  private estimateCost(
    resources: ResourcePlan['estimatedResources'],
  ): ResourcePlan['costEstimate'] {
    // Rough cost estimates (would use actual cloud pricing)
    const cpuCostPerCore = 0.05; // $ per hour
    const memoryCostPerGb = 0.01; // $ per hour
    const networkCostPerGb = 0.12; // $ per GB
    const diskCostPerGb = 0.1; // $ per month

    const cpuCost = resources.cpu.cores * cpuCostPerCore;
    const memoryCost = (resources.memory.requiredMb / 1024) * memoryCostPerGb;
    const networkCost = (resources.network.totalMb / 1024) * networkCostPerGb;
    const diskCost = (resources.disk.spaceMb / 1024) * diskCostPerGb;

    return {
      currency: 'USD',
      amount: cpuCost + memoryCost + networkCost + diskCost,
      breakdown: {
        cpu: cpuCost,
        memory: memoryCost,
        network: networkCost,
        disk: diskCost,
      },
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(profiles: ProfileResult[]): number {
    if (profiles.length === 0) return 0.3; // Low confidence without data
    if (profiles.length < 5) return 0.5; // Medium confidence with little data
    if (profiles.length < 20) return 0.7; // Good confidence
    return 0.9; // High confidence with lots of data
  }

  /**
   * Calculate average of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Check if workflow has high throughput
   */
  private hasHighThroughput(profiles: ProfileResult[]): boolean {
    // Check if executions are frequent
    if (profiles.length < 50) return false;

    const timestamps = profiles.map((p) => p.startTime).sort();
    const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
    const hourSpan = timeSpan / (1000 * 60 * 60);

    // More than 10 executions per hour
    return profiles.length / hourSpan > 10;
  }
}
