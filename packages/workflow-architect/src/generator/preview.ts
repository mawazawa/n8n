/**
 * Workflow Preview
 * Generates preview and simulation before committing workflow
 */

import type {
  WorkflowBlueprint,
  PreviewResult,
  SimulationResult,
} from './types';
import type { WorkflowDefinition } from '../types/workflow';
import { wrapError } from '../errors';

export class WorkflowPreview {
  /**
   * Generate preview of workflow before commit
   */
  async preview(blueprint: WorkflowBlueprint): Promise<PreviewResult> {
    try {
      // Convert blueprint to n8n workflow format
      const workflow = this.convertToN8nFormat(blueprint);

      // Generate visual graph representation
      const visualGraph = this.generateVisualGraph(blueprint);

      // Simulate execution if possible
      const simulationResults = await this.simulateExecution(blueprint);

      // Estimate costs
      const estimatedCosts = this.estimateCosts(blueprint);

      return {
        workflow,
        visualGraph,
        simulationResults,
        estimatedCosts,
      };
    } catch (error) {
      throw wrapError(error, 'Failed to generate preview');
    }
  }

  /**
   * Simulate execution with sample data
   */
  async simulateExecution(blueprint: WorkflowBlueprint): Promise<SimulationResult> {
    try {
      const executionPath: string[] = [];
      const sampleOutputs: Record<string, unknown> = {};
      const errors: Array<{ nodeId: string; message: string }> = [];
      const warnings: Array<{ nodeId: string; message: string }> = [];

      // Determine execution order
      const executionOrder = this.getExecutionOrder(blueprint);

      // Simulate each node
      for (const node of executionOrder) {
        executionPath.push(node.id);

        // Check for potential issues
        const validation = this.validateNodeExecution(node, blueprint);
        if (validation.errors.length > 0) {
          errors.push({
            nodeId: node.id,
            message: validation.errors[0],
          });
        }
        if (validation.warnings.length > 0) {
          warnings.push({
            nodeId: node.id,
            message: validation.warnings[0],
          });
        }

        // Generate sample output
        sampleOutputs[node.id] = this.generateSampleOutput(node);
      }

      return {
        status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'partial' : 'success',
        executionPath,
        sampleOutputs,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        status: 'error',
        executionPath: [],
        sampleOutputs: {},
        errors: [{ nodeId: 'unknown', message: String(error) }],
      };
    }
  }

  /**
   * Generate visual representation data
   */
  generateVisualGraph(blueprint: WorkflowBlueprint): PreviewResult['visualGraph'] {
    const nodes = blueprint.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      type: node.type,
      position: node.position,
    }));

    const edges = blueprint.connections.map((conn) => ({
      source: conn.source,
      target: conn.target,
      label: conn.sourceOutput !== 'main' ? conn.sourceOutput : undefined,
    }));

    return { nodes, edges };
  }

  /**
   * Estimate runtime and costs
   */
  estimateCosts(blueprint: WorkflowBlueprint): PreviewResult['estimatedCosts'] {
    const breakdown: Array<{ service: string; calls: number; cost: number }> = [];
    let totalCalls = 0;
    let totalCost = 0;

    blueprint.nodes.forEach((node) => {
      const service = this.getServiceName(node.type);
      const calls = 1; // Simplified: assume 1 call per execution

      // Estimate cost per service (simplified rates)
      let costPerCall = 0;
      if (node.type.includes('openai') || node.type.includes('anthropic')) {
        costPerCall = 0.002; // ~$2 per 1000 calls
      } else if (this.isExternalAPI(node.type)) {
        costPerCall = 0.0001; // Minimal cost for most APIs
      }

      if (costPerCall > 0) {
        breakdown.push({
          service,
          calls,
          cost: costPerCall,
        });
        totalCalls += calls;
        totalCost += costPerCall;
      }
    });

    return {
      apiCalls: totalCalls,
      estimatedCost: totalCost,
      breakdown,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private convertToN8nFormat(blueprint: WorkflowBlueprint): WorkflowDefinition {
    return {
      name: blueprint.name,
      active: false,
      nodes: blueprint.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        typeVersion: 1,
        position: [node.position.x, node.position.y],
        parameters: node.parameters,
        credentials: node.credentials,
        notes: node.notes,
      })),
      connections: this.convertConnections(blueprint.connections),
      settings: {},
      staticData: {},
    };
  }

  private convertConnections(
    connections: WorkflowBlueprint['connections'],
  ): WorkflowDefinition['connections'] {
    const result: WorkflowDefinition['connections'] = {};

    connections.forEach((conn) => {
      if (!result[conn.source]) {
        result[conn.source] = {};
      }

      const outputType = conn.sourceOutput || 'main';
      if (!result[conn.source][outputType]) {
        result[conn.source][outputType] = [[]];
      }

      // Simplified: add to first array
      result[conn.source][outputType][0].push({
        node: conn.target,
        type: conn.targetInput || 'main',
        index: 0,
      });
    });

    return result;
  }

  private getExecutionOrder(blueprint: WorkflowBlueprint): WorkflowBlueprint['nodes'] {
    // Topological sort
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    blueprint.nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      graph.set(node.id, []);
    });

    blueprint.connections.forEach((conn) => {
      const edges = graph.get(conn.source);
      if (edges) {
        edges.push(conn.target);
      }
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    });

    const queue: string[] = [];
    const ordered: string[] = [];

    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);

      const edges = graph.get(current) || [];
      edges.forEach((neighbor) => {
        const degree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, degree);
        if (degree === 0) {
          queue.push(neighbor);
        }
      });
    }

    return ordered
      .map((id) => blueprint.nodes.find((n) => n.id === id))
      .filter((n): n is typeof blueprint.nodes[0] => n !== undefined);
  }

  private validateNodeExecution(
    node: WorkflowBlueprint['nodes'][0],
    blueprint: WorkflowBlueprint,
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for missing required parameters
    const required = this.getRequiredParams(node.type);
    required.forEach((param) => {
      if (!node.parameters[param] || node.parameters[param] === null) {
        errors.push(`Missing required parameter: ${param}`);
      }
    });

    // Check for missing credentials
    if (this.needsCredentials(node.type) && !node.credentials) {
      warnings.push('Node requires credentials to execute');
    }

    return { errors, warnings };
  }

  private generateSampleOutput(node: WorkflowBlueprint['nodes'][0]): unknown {
    // Generate realistic sample output based on node type
    if (node.type.includes('webhook')) {
      return { body: {}, headers: {}, query: {} };
    }

    if (node.type.includes('http')) {
      return { statusCode: 200, body: { data: 'sample' } };
    }

    if (node.type.includes('set')) {
      return { transformedData: true };
    }

    return { data: 'sample output' };
  }

  private getServiceName(nodeType: string): string {
    const type = nodeType.toLowerCase();

    if (type.includes('openai')) return 'OpenAI';
    if (type.includes('anthropic')) return 'Anthropic';
    if (type.includes('gmail')) return 'Gmail';
    if (type.includes('slack')) return 'Slack';
    if (type.includes('http')) return 'HTTP API';

    return nodeType.split('.').pop() || 'Unknown';
  }

  private isExternalAPI(nodeType: string): boolean {
    return (
      nodeType.includes('http') ||
      nodeType.includes('api') ||
      nodeType.includes('webhook') ||
      nodeType.includes('gmail') ||
      nodeType.includes('slack')
    );
  }

  private getRequiredParams(nodeType: string): string[] {
    const required: Record<string, string[]> = {
      'n8n-nodes-base.httpRequest': ['url'],
      'n8n-nodes-base.webhook': ['path'],
      'n8n-nodes-base.gmail': ['toList', 'subject'],
      'n8n-nodes-base.slack': ['channel', 'text'],
    };

    return required[nodeType] || [];
  }

  private needsCredentials(nodeType: string): boolean {
    const needsCreds = ['gmail', 'slack', 'postgres', 'github', 'stripe'];
    return needsCreds.some((service) => nodeType.toLowerCase().includes(service));
  }
}

/**
 * Convenience function to preview a workflow
 */
export async function previewWorkflow(blueprint: WorkflowBlueprint): Promise<PreviewResult> {
  const preview = new WorkflowPreview();
  return preview.preview(blueprint);
}
