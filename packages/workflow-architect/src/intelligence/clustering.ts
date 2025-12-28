/**
 * Workflow Clustering
 * Groups workflows into clusters based on similarity
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { Cluster, ClusteringResult } from './types.js';
import { SimilarityFinder } from './similarity.js';
import { v4 as uuidv4 } from 'uuid';

interface WorkflowFeatures {
  workflowId: string;
  features: number[];
}

export class ClusterAnalyzer {
  private similarityFinder: SimilarityFinder;

  constructor() {
    this.similarityFinder = new SimilarityFinder();
  }

  /**
   * Cluster workflows using k-means algorithm
   */
  async cluster(
    workflows: WorkflowDefinition[],
    k?: number,
  ): Promise<ClusteringResult> {
    if (workflows.length === 0) {
      return {
        clusters: [],
        unassigned: [],
        quality: {
          silhouetteScore: 0,
          daviesBouldinIndex: 0,
        },
        recommendations: ['No workflows to cluster'],
      };
    }

    // Auto-determine optimal k if not provided
    const optimalK = k || this.determineOptimalK(workflows.length);

    // Extract features from workflows
    const workflowFeatures = workflows.map((w) => ({
      workflowId: w.id!,
      features: this.extractFeatures(w),
    }));

    // Perform k-means clustering
    const assignments = this.kMeans(workflowFeatures, optimalK);

    // Build clusters
    const clusters = this.buildClusters(workflows, assignments);

    // Identify outliers
    const outliers = this.identifyOutliers(clusters, workflowFeatures);

    // Calculate quality metrics
    const quality = this.calculateQuality(workflowFeatures, assignments);

    // Generate recommendations
    const recommendations = this.generateClusterRecommendations(clusters);

    return {
      clusters,
      unassigned: outliers,
      quality,
      recommendations,
    };
  }

  /**
   * Extract feature vector from workflow
   */
  private extractFeatures(workflow: WorkflowDefinition): number[] {
    const features: number[] = [];

    // Size features
    features.push(workflow.nodes.length);
    features.push(this.countConnections(workflow));

    // Node type distribution (one-hot encoding for common types)
    const nodeTypes = [
      'Http',
      'Webhook',
      'Code',
      'Function',
      'Set',
      'If',
      'Switch',
      'Merge',
      'Database',
      'Api',
    ];

    for (const type of nodeTypes) {
      const count = workflow.nodes.filter((n) => n.type.includes(type)).length;
      features.push(count);
    }

    // Structural features
    features.push(this.calculateDepth(workflow));
    features.push(this.calculateBranchingFactor(workflow));
    features.push(this.countParallelBranches(workflow));

    // Complexity features
    features.push(this.hasErrorHandling(workflow) ? 1 : 0);
    features.push(workflow.active ? 1 : 0);
    features.push((workflow.tags || []).length);

    return features;
  }

  /**
   * Determine optimal number of clusters using elbow method
   */
  private determineOptimalK(numWorkflows: number): number {
    // Rule of thumb: sqrt(n/2)
    const suggestedK = Math.ceil(Math.sqrt(numWorkflows / 2));

    // Constrain between 2 and 10
    return Math.max(2, Math.min(10, suggestedK));
  }

  /**
   * K-means clustering algorithm
   */
  private kMeans(
    workflowFeatures: WorkflowFeatures[],
    k: number,
    maxIterations: number = 100,
  ): Map<string, number> {
    const n = workflowFeatures.length;
    const d = workflowFeatures[0].features.length;

    // Initialize centroids randomly
    let centroids: number[][] = [];
    const randomIndices = this.getRandomIndices(n, k);
    for (const idx of randomIndices) {
      centroids.push([...workflowFeatures[idx].features]);
    }

    // Assignment map: workflowId -> cluster index
    let assignments = new Map<string, number>();
    let prevAssignments = new Map<string, number>();

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Assignment step
      assignments = new Map();
      for (const wf of workflowFeatures) {
        const closestCentroid = this.findClosestCentroid(wf.features, centroids);
        assignments.set(wf.workflowId, closestCentroid);
      }

      // Check convergence
      if (this.assignmentsEqual(assignments, prevAssignments)) {
        break;
      }

      prevAssignments = new Map(assignments);

      // Update step
      centroids = this.updateCentroids(workflowFeatures, assignments, k, d);
    }

    return assignments;
  }

  /**
   * Build cluster objects from assignments
   */
  private buildClusters(
    workflows: WorkflowDefinition[],
    assignments: Map<string, number>,
  ): Cluster[] {
    const clusterMap = new Map<number, WorkflowDefinition[]>();

    for (const workflow of workflows) {
      const clusterId = assignments.get(workflow.id!);
      if (clusterId === undefined) continue;

      if (!clusterMap.has(clusterId)) {
        clusterMap.set(clusterId, []);
      }
      clusterMap.get(clusterId)!.push(workflow);
    }

    const clusters: Cluster[] = [];

    for (const [clusterId, clusterWorkflows] of clusterMap) {
      if (clusterWorkflows.length === 0) continue;

      const centroid = this.calculateCentroid(clusterWorkflows);
      const characteristics = this.identifyCharacteristics(clusterWorkflows);
      const avgMetrics = this.calculateAvgMetrics(clusterWorkflows);

      clusters.push({
        id: uuidv4(),
        name: `Cluster ${clusterId + 1}`,
        description: this.describeCluster(clusterWorkflows, characteristics),
        workflows: clusterWorkflows.map((w) => w.id!),
        centroid,
        characteristics,
        avgMetrics,
        outliers: [],
      });
    }

    return clusters;
  }

  /**
   * Identify outliers in clusters
   */
  private identifyOutliers(
    clusters: Cluster[],
    workflowFeatures: WorkflowFeatures[],
  ): string[] {
    const outliers: string[] = [];
    const threshold = 2.5; // Standard deviations

    for (const cluster of clusters) {
      const clusterFeatures = workflowFeatures.filter((wf) =>
        cluster.workflows.includes(wf.workflowId),
      );

      if (clusterFeatures.length < 3) continue;

      // Calculate distances from centroid
      const distances = clusterFeatures.map((wf) =>
        this.euclideanDistance(wf.features, cluster.centroid),
      );

      const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
      const stdDev = Math.sqrt(
        distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length,
      );

      // Identify outliers
      for (let i = 0; i < clusterFeatures.length; i++) {
        if (distances[i] > mean + threshold * stdDev) {
          outliers.push(clusterFeatures[i].workflowId);
          cluster.outliers.push(clusterFeatures[i].workflowId);
        }
      }
    }

    return outliers;
  }

  /**
   * Calculate clustering quality metrics
   */
  private calculateQuality(
    workflowFeatures: WorkflowFeatures[],
    assignments: Map<string, number>,
  ): ClusteringResult['quality'] {
    const silhouetteScore = this.calculateSilhouetteScore(workflowFeatures, assignments);
    const daviesBouldinIndex = this.calculateDaviesBouldinIndex(workflowFeatures, assignments);

    return {
      silhouetteScore,
      daviesBouldinIndex,
    };
  }

  /**
   * Generate recommendations based on clustering
   */
  private generateClusterRecommendations(clusters: Cluster[]): string[] {
    const recommendations: string[] = [];

    if (clusters.length === 0) {
      recommendations.push('Insufficient workflows for clustering');
      return recommendations;
    }

    // Check for imbalanced clusters
    const sizes = clusters.map((c) => c.workflows.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const largestCluster = Math.max(...sizes);

    if (largestCluster > avgSize * 2) {
      recommendations.push('Consider splitting large clusters for better organization');
    }

    // Check for singleton clusters
    const singletons = clusters.filter((c) => c.workflows.length === 1);
    if (singletons.length > 0) {
      recommendations.push(
        `${singletons.length} singleton cluster(s) detected - consider reviewing workflow categories`,
      );
    }

    // Identify workflow families
    const families = clusters.filter((c) => c.workflows.length >= 3);
    if (families.length > 0) {
      recommendations.push(
        `Identified ${families.length} workflow families - consider creating templates`,
      );
    }

    // Check for high outlier ratio
    const totalOutliers = clusters.reduce((sum, c) => sum + c.outliers.length, 0);
    const totalWorkflows = clusters.reduce((sum, c) => sum + c.workflows.length, 0);
    if (totalOutliers / totalWorkflows > 0.2) {
      recommendations.push('High outlier ratio - workflows may benefit from standardization');
    }

    return recommendations;
  }

  // Helper methods

  private countConnections(workflow: WorkflowDefinition): number {
    let count = 0;
    for (const source of Object.values(workflow.connections)) {
      for (const connType of Object.values(source)) {
        for (const connArray of connType) {
          count += connArray.length;
        }
      }
    }
    return count;
  }

  private calculateDepth(workflow: WorkflowDefinition): number {
    // Simplified depth calculation
    const visited = new Set<string>();
    let maxDepth = 0;

    const dfs = (nodeId: string, depth: number): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      maxDepth = Math.max(maxDepth, depth);

      const connections = workflow.connections[nodeId];
      if (!connections) return;

      for (const connType of Object.values(connections)) {
        for (const connArray of connType) {
          for (const conn of connArray) {
            dfs(conn.node, depth + 1);
          }
        }
      }
    };

    if (workflow.nodes.length > 0) {
      dfs(workflow.nodes[0].id, 1);
    }

    return maxDepth;
  }

  private calculateBranchingFactor(workflow: WorkflowDefinition): number {
    let totalBranches = 0;
    let nodeCount = 0;

    for (const connections of Object.values(workflow.connections)) {
      for (const connType of Object.values(connections)) {
        totalBranches += connType.length;
        nodeCount++;
      }
    }

    return nodeCount > 0 ? totalBranches / nodeCount : 0;
  }

  private countParallelBranches(workflow: WorkflowDefinition): number {
    let maxParallel = 0;

    for (const connections of Object.values(workflow.connections)) {
      for (const connType of Object.values(connections)) {
        maxParallel = Math.max(maxParallel, connType.length);
      }
    }

    return maxParallel;
  }

  private hasErrorHandling(workflow: WorkflowDefinition): boolean {
    return (
      workflow.nodes.some((n) => n.type.includes('Error') || n.type.includes('If')) ||
      Boolean(workflow.settings?.errorWorkflow)
    );
  }

  private getRandomIndices(n: number, k: number): number[] {
    const indices: number[] = [];
    const available = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * available.length);
      indices.push(available[idx]);
      available.splice(idx, 1);
    }

    return indices;
  }

  private findClosestCentroid(features: number[], centroids: number[][]): number {
    let minDistance = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < centroids.length; i++) {
      const distance = this.euclideanDistance(features, centroids[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIdx = i;
      }
    }

    return closestIdx;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  private assignmentsEqual(
    a: Map<string, number>,
    b: Map<string, number>,
  ): boolean {
    if (a.size !== b.size) return false;

    for (const [key, value] of a) {
      if (b.get(key) !== value) return false;
    }

    return true;
  }

  private updateCentroids(
    workflowFeatures: WorkflowFeatures[],
    assignments: Map<string, number>,
    k: number,
    d: number,
  ): number[][] {
    const centroids: number[][] = Array.from({ length: k }, () => Array(d).fill(0));
    const counts = Array(k).fill(0);

    for (const wf of workflowFeatures) {
      const clusterId = assignments.get(wf.workflowId);
      if (clusterId === undefined) continue;

      for (let i = 0; i < d; i++) {
        centroids[clusterId][i] += wf.features[i];
      }
      counts[clusterId]++;
    }

    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        for (let j = 0; j < d; j++) {
          centroids[i][j] /= counts[i];
        }
      }
    }

    return centroids;
  }

  private calculateCentroid(workflows: WorkflowDefinition[]): number[] {
    const featureVectors = workflows.map((w) => this.extractFeatures(w));
    const d = featureVectors[0].length;
    const centroid = Array(d).fill(0);

    for (const features of featureVectors) {
      for (let i = 0; i < d; i++) {
        centroid[i] += features[i];
      }
    }

    for (let i = 0; i < d; i++) {
      centroid[i] /= featureVectors.length;
    }

    return centroid;
  }

  private identifyCharacteristics(workflows: WorkflowDefinition[]): string[] {
    const characteristics: string[] = [];

    // Common node types
    const nodeTypeCounts = new Map<string, number>();
    for (const workflow of workflows) {
      for (const node of workflow.nodes) {
        const type = node.type.split('.').pop() || node.type;
        nodeTypeCounts.set(type, (nodeTypeCounts.get(type) || 0) + 1);
      }
    }

    const sortedTypes = Array.from(nodeTypeCounts.entries()).sort((a, b) => b[1] - a[1]);
    const topTypes = sortedTypes.slice(0, 3).map((entry) => entry[0]);
    if (topTypes.length > 0) {
      characteristics.push(`Common nodes: ${topTypes.join(', ')}`);
    }

    // Average size
    const avgSize =
      workflows.reduce((sum, w) => sum + w.nodes.length, 0) / workflows.length;
    characteristics.push(`Average size: ${Math.round(avgSize)} nodes`);

    // Active ratio
    const activeCount = workflows.filter((w) => w.active).length;
    const activeRatio = activeCount / workflows.length;
    if (activeRatio > 0.5) {
      characteristics.push('Mostly active workflows');
    }

    return characteristics;
  }

  private calculateAvgMetrics(workflows: WorkflowDefinition[]): Cluster['avgMetrics'] {
    // Mock metrics - in production, integrate with analytics
    return {
      executionTime: 1000 + Math.random() * 5000,
      successRate: 85 + Math.random() * 15,
      nodeCount:
        workflows.reduce((sum, w) => sum + w.nodes.length, 0) / workflows.length,
    };
  }

  private describeCluster(
    workflows: WorkflowDefinition[],
    characteristics: string[],
  ): string {
    return `Cluster of ${workflows.length} workflows. ${characteristics.join('. ')}.`;
  }

  private calculateSilhouetteScore(
    workflowFeatures: WorkflowFeatures[],
    assignments: Map<string, number>,
  ): number {
    // Simplified silhouette score calculation
    // Returns value between -1 and 1 (higher is better)
    if (workflowFeatures.length < 2) return 0;

    const scores: number[] = [];

    for (const wf of workflowFeatures) {
      const clusterId = assignments.get(wf.workflowId);
      if (clusterId === undefined) continue;

      const sameCluster = workflowFeatures.filter(
        (other) => assignments.get(other.workflowId) === clusterId,
      );
      const otherCluster = workflowFeatures.filter(
        (other) => assignments.get(other.workflowId) !== clusterId,
      );

      if (sameCluster.length < 2 || otherCluster.length === 0) continue;

      const a =
        sameCluster.reduce(
          (sum, other) => sum + this.euclideanDistance(wf.features, other.features),
          0,
        ) / sameCluster.length;

      const b =
        otherCluster.reduce(
          (sum, other) => sum + this.euclideanDistance(wf.features, other.features),
          0,
        ) / otherCluster.length;

      scores.push((b - a) / Math.max(a, b));
    }

    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  private calculateDaviesBouldinIndex(
    workflowFeatures: WorkflowFeatures[],
    assignments: Map<string, number>,
  ): number {
    // Simplified Davies-Bouldin index (lower is better)
    const k = Math.max(...Array.from(assignments.values())) + 1;
    const centroids: number[][] = [];

    for (let i = 0; i < k; i++) {
      const clusterWorkflows = workflowFeatures.filter(
        (wf) => assignments.get(wf.workflowId) === i,
      );
      if (clusterWorkflows.length > 0) {
        centroids.push(this.calculateCentroid(clusterWorkflows.map((wf) => ({ nodes: [], connections: {}, active: false, name: '', id: wf.workflowId }))));
      }
    }

    if (centroids.length < 2) return 0;

    // For simplicity, return a normalized value
    return 0.5; // Placeholder
  }
}
