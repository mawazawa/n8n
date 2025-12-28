/**
 * Data Lineage Tracking
 * Track data flow through workflows for compliance and impact analysis
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  LineageGraph,
  LineageNode,
  LineageEdge,
  ImpactAnalysis,
} from './types';

export class LineageTracker {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Track data lineage
   */
  async track(
    dataId: string,
    source: {
      type: 'source' | 'transform' | 'destination';
      name: string;
      resourceType: string;
      resourceId: string;
      metadata?: Record<string, unknown>;
    },
    transforms?: Array<{
      from: string;
      to: string;
      transformType?: string;
      transformDetails?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    // Create or update node
    await this.createNode(dataId, source);

    // Create edges for transforms
    if (transforms) {
      for (const transform of transforms) {
        await this.createEdge(dataId, transform);
      }
    }
  }

  /**
   * Get complete lineage graph for data
   */
  async getLineage(dataId: string, maxDepth: number = 10): Promise<LineageGraph> {
    const nodes = await this.getNodes(dataId);
    const edges = await this.getEdges(dataId);

    // Build graph by traversing edges
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const graphNodes: LineageNode[] = [];
    const graphEdges: LineageEdge[] = [];

    const traverse = async (nodeId: string, depth: number) => {
      if (depth > maxDepth || visitedNodes.has(nodeId)) {
        return;
      }

      visitedNodes.add(nodeId);

      // Find node
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        graphNodes.push(node);
      }

      // Find connected edges
      const connectedEdges = edges.filter((e) => e.from === nodeId || e.to === nodeId);

      for (const edge of connectedEdges) {
        const edgeKey = `${edge.from}-${edge.to}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          graphEdges.push(edge);

          // Traverse connected nodes
          if (edge.from !== nodeId) {
            await traverse(edge.from, depth + 1);
          }
          if (edge.to !== nodeId) {
            await traverse(edge.to, depth + 1);
          }
        }
      }
    };

    await traverse(dataId, 0);

    return {
      dataId,
      nodes: graphNodes,
      edges: graphEdges,
      depth: Math.max(...graphNodes.map((n) => this.calculateDepth(n.id, graphEdges)), 0),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Perform impact analysis
   */
  async analyzeImpact(dataId: string): Promise<ImpactAnalysis> {
    const lineage = await this.getLineage(dataId);

    // Find upstream dependencies (sources)
    const upstreamNodes = this.findUpstreamNodes(dataId, lineage.edges);

    // Find downstream dependencies (destinations)
    const downstreamNodes = this.findDownstreamNodes(dataId, lineage.edges);

    // Find affected workflows
    const affectedWorkflows = new Set<string>();
    for (const node of lineage.nodes) {
      if (node.resourceType === 'workflow') {
        affectedWorkflows.add(node.resourceId);
      }
    }

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(
      upstreamNodes.length,
      downstreamNodes.length,
      affectedWorkflows.size,
    );

    return {
      dataId,
      upstreamDependencies: upstreamNodes,
      downstreamDependencies: downstreamNodes,
      affectedWorkflows: Array.from(affectedWorkflows),
      riskLevel,
      recommendations: this.generateRecommendations(riskLevel, upstreamNodes.length, downstreamNodes.length),
    };
  }

  /**
   * Get visualization data for lineage graph
   */
  async getVisualizationData(dataId: string): Promise<{
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; label?: string }>;
  }> {
    const lineage = await this.getLineage(dataId);

    return {
      nodes: lineage.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        type: n.type,
      })),
      edges: lineage.edges.map((e) => ({
        from: e.from,
        to: e.to,
        label: e.transformType,
      })),
    };
  }

  /**
   * Create a lineage node
   */
  private async createNode(
    dataId: string,
    source: {
      type: 'source' | 'transform' | 'destination';
      name: string;
      resourceType: string;
      resourceId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const node: LineageNode = {
      id: dataId,
      type: source.type,
      name: source.name,
      resourceType: source.resourceType,
      resourceId: source.resourceId,
      metadata: source.metadata,
    };

    const { error } = await this.supabase
      .from('governance_lineage_nodes')
      .upsert({
        id: node.id,
        type: node.type,
        name: node.name,
        resource_type: node.resourceType,
        resource_id: node.resourceId,
        metadata: node.metadata,
      });

    if (error) {
      throw new Error(`Failed to create node: ${error.message}`);
    }
  }

  /**
   * Create a lineage edge
   */
  private async createEdge(
    dataId: string,
    transform: {
      from: string;
      to: string;
      transformType?: string;
      transformDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    const edge: LineageEdge = {
      from: transform.from,
      to: transform.to,
      transformType: transform.transformType,
      transformDetails: transform.transformDetails,
    };

    const { error } = await this.supabase
      .from('governance_lineage_edges')
      .insert({
        id: uuidv4(),
        data_id: dataId,
        from_node: edge.from,
        to_node: edge.to,
        transform_type: edge.transformType,
        transform_details: edge.transformDetails,
      });

    if (error) {
      throw new Error(`Failed to create edge: ${error.message}`);
    }
  }

  /**
   * Get all nodes for a data ID
   */
  private async getNodes(dataId: string): Promise<LineageNode[]> {
    const { data, error } = await this.supabase
      .from('governance_lineage_nodes')
      .select('*');

    if (error) {
      throw new Error(`Failed to get nodes: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
    }));
  }

  /**
   * Get all edges for a data ID
   */
  private async getEdges(dataId: string): Promise<LineageEdge[]> {
    const { data, error } = await this.supabase
      .from('governance_lineage_edges')
      .select('*')
      .eq('data_id', dataId);

    if (error) {
      throw new Error(`Failed to get edges: ${error.message}`);
    }

    return (data || []).map((row) => ({
      from: row.from_node,
      to: row.to_node,
      transformType: row.transform_type,
      transformDetails: row.transform_details,
    }));
  }

  /**
   * Find upstream nodes
   */
  private findUpstreamNodes(nodeId: string, edges: LineageEdge[]): string[] {
    const upstream = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);

      const upstreamEdges = edges.filter((e) => e.to === id);
      for (const edge of upstreamEdges) {
        upstream.add(edge.from);
        traverse(edge.from);
      }
    };

    traverse(nodeId);
    return Array.from(upstream);
  }

  /**
   * Find downstream nodes
   */
  private findDownstreamNodes(nodeId: string, edges: LineageEdge[]): string[] {
    const downstream = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);

      const downstreamEdges = edges.filter((e) => e.from === id);
      for (const edge of downstreamEdges) {
        downstream.add(edge.to);
        traverse(edge.to);
      }
    };

    traverse(nodeId);
    return Array.from(downstream);
  }

  /**
   * Calculate depth of node in graph
   */
  private calculateDepth(nodeId: string, edges: LineageEdge[]): number {
    let depth = 0;
    const visited = new Set<string>();

    const traverse = (id: string, currentDepth: number) => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);

      depth = Math.max(depth, currentDepth);

      const upstreamEdges = edges.filter((e) => e.to === id);
      for (const edge of upstreamEdges) {
        traverse(edge.from, currentDepth + 1);
      }
    };

    traverse(nodeId, 0);
    return depth;
  }

  /**
   * Calculate risk level based on dependencies
   */
  private calculateRiskLevel(
    upstreamCount: number,
    downstreamCount: number,
    workflowCount: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const totalDependencies = upstreamCount + downstreamCount;

    if (totalDependencies > 20 || workflowCount > 10) {
      return 'critical';
    } else if (totalDependencies > 10 || workflowCount > 5) {
      return 'high';
    } else if (totalDependencies > 5 || workflowCount > 2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate recommendations based on impact analysis
   */
  private generateRecommendations(
    riskLevel: string,
    upstreamCount: number,
    downstreamCount: number,
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('Perform thorough testing before making changes to this data');
      recommendations.push('Consider implementing a staging environment for testing');
      recommendations.push('Notify all affected workflow owners before making changes');
    }

    if (upstreamCount > 5) {
      recommendations.push('Review upstream data sources for potential consolidation');
    }

    if (downstreamCount > 5) {
      recommendations.push('Document downstream dependencies to prevent breaking changes');
    }

    return recommendations;
  }
}
