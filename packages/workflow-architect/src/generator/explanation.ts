/**
 * Explanation Generator
 * Generates natural language explanations of workflows
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { WorkflowBlueprint, Explanation, ExplanationStep } from './types';
import { wrapError } from '../errors';

const EXPLANATION_PROMPT = `You are an expert at explaining technical workflows in clear, simple language.

Given a workflow blueprint, generate:
1. A brief summary (2-3 sentences) of what the workflow does
2. Step-by-step explanation of each node's role
3. Key decision points and their rationale
4. Any assumptions made in the workflow design

Write in clear, non-technical language that a beginner could understand.
Focus on the "why" not just the "what".`;

export class ExplanationGenerator {
  private model: BaseChatModel;

  constructor(model?: BaseChatModel) {
    const router = getTaskRouter();
    this.model = model || router.getModelForTask('response');
  }

  /**
   * Generate explanation for a workflow
   */
  async explain(workflow: WorkflowBlueprint): Promise<Explanation> {
    try {
      // Generate summary
      const summary = await this.generateSummary(workflow);

      // Generate step-by-step explanation
      const stepByStep = this.generateSteps(workflow);

      // Identify key decisions
      const keyDecisions = this.identifyKeyDecisions(workflow);

      // List assumptions
      const assumptions = this.listAssumptions(workflow);

      return {
        summary,
        stepByStep,
        keyDecisions,
        assumptions,
      };
    } catch (error) {
      throw wrapError(error, 'Failed to generate explanation');
    }
  }

  /**
   * Generate natural language workflow description
   */
  async generateSummary(workflow: WorkflowBlueprint): Promise<string> {
    const context = {
      name: workflow.name,
      description: workflow.description,
      nodeCount: workflow.nodes.length,
      nodeTypes: workflow.nodes.map((n) => ({ type: n.type, name: n.name })),
      category: workflow.metadata.category,
    };

    const response = await this.model.invoke([
      new SystemMessage(EXPLANATION_PROMPT),
      new HumanMessage(
        `Generate a brief summary of this workflow:\n${JSON.stringify(context, null, 2)}`,
      ),
    ]);

    return response.content.toString().trim();
  }

  /**
   * Create step-by-step execution narrative
   */
  generateSteps(workflow: WorkflowBlueprint): ExplanationStep[] {
    const steps: ExplanationStep[] = [];

    // Sort nodes by execution order (based on connections)
    const executionOrder = this.determineExecutionOrder(workflow);

    executionOrder.forEach((node, index) => {
      steps.push({
        stepNumber: index + 1,
        nodeId: node.id,
        nodeName: node.name,
        action: this.describeNodeAction(node),
        description: this.describeNodePurpose(node, workflow),
        inputs: this.getNodeInputs(node, workflow),
        outputs: this.getNodeOutputs(node),
      });
    });

    return steps;
  }

  /**
   * Highlight key decision points
   */
  identifyKeyDecisions(workflow: WorkflowBlueprint): Array<{
    decision: string;
    rationale: string;
    alternatives?: string[];
  }> {
    const decisions: Array<{
      decision: string;
      rationale: string;
      alternatives?: string[];
    }> = [];

    workflow.nodes.forEach((node) => {
      // Identify decision nodes
      if (node.type.includes('if')) {
        decisions.push({
          decision: `Conditional branch in ${node.name}`,
          rationale: 'Filters data based on specific conditions',
          alternatives: ['Use Switch node for multiple conditions', 'Use Filter node to remove items'],
        });
      }

      if (node.type.includes('switch')) {
        decisions.push({
          decision: `Multiple routing paths in ${node.name}`,
          rationale: 'Routes data to different branches based on value',
          alternatives: ['Use multiple IF nodes', 'Use Filter and merge'],
        });
      }

      if (node.type.includes('code')) {
        decisions.push({
          decision: `Custom transformation in ${node.name}`,
          rationale: node.rationale || 'Complex logic requires custom code',
          alternatives: ['Use Set node for simple transformations', 'Use Function node'],
        });
      }
    });

    return decisions;
  }

  /**
   * List assumptions made
   */
  listAssumptions(workflow: WorkflowBlueprint): string[] {
    const assumptions: string[] = [];

    // Check for missing credentials
    workflow.nodes.forEach((node) => {
      if (this.needsCredentials(node.type) && !node.credentials) {
        assumptions.push(`${node.name} will need to be configured with appropriate credentials`);
      }

      // Check for placeholder parameters
      Object.entries(node.parameters).forEach(([key, value]) => {
        if (value === null || value === '__USER_INPUT_REQUIRED__') {
          assumptions.push(`Parameter "${key}" in ${node.name} will need to be set by user`);
        }
      });
    });

    // General assumptions
    if (workflow.nodes.some((n) => n.type.includes('http'))) {
      assumptions.push('External API endpoints are available and accessible');
    }

    if (workflow.nodes.some((n) => n.type.includes('webhook'))) {
      assumptions.push('Webhook URL will be configured to receive external requests');
    }

    return assumptions;
  }

  // ============================================
  // Private Methods
  // ============================================

  private determineExecutionOrder(workflow: WorkflowBlueprint): typeof workflow.nodes {
    // Topological sort based on connections
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // Initialize
    workflow.nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      graph.set(node.id, []);
    });

    // Build graph
    workflow.connections.forEach((conn) => {
      const edges = graph.get(conn.source);
      if (edges) {
        edges.push(conn.target);
      }
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
    });

    // Topological sort
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

    // Map back to nodes
    return ordered
      .map((id) => workflow.nodes.find((n) => n.id === id))
      .filter((n): n is typeof workflow.nodes[0] => n !== undefined);
  }

  private describeNodeAction(node: typeof WorkflowBlueprint.prototype.nodes[0]): string {
    const type = node.type.toLowerCase();

    if (type.includes('webhook')) return 'Receives HTTP request';
    if (type.includes('schedule')) return 'Triggers on schedule';
    if (type.includes('http')) return 'Makes API request';
    if (type.includes('code')) return 'Executes custom code';
    if (type.includes('set')) return 'Transforms data';
    if (type.includes('if')) return 'Evaluates condition';
    if (type.includes('switch')) return 'Routes to different paths';
    if (type.includes('gmail')) return 'Sends email';
    if (type.includes('slack')) return 'Sends Slack message';
    if (type.includes('filter')) return 'Filters items';

    return 'Processes data';
  }

  private describeNodePurpose(
    node: typeof WorkflowBlueprint.prototype.nodes[0],
    workflow: WorkflowBlueprint,
  ): string {
    if (node.notes) {
      return node.notes;
    }

    if (node.rationale) {
      return node.rationale;
    }

    // Generate default description
    return `${node.name} ${this.describeNodeAction(node).toLowerCase()}`;
  }

  private getNodeInputs(
    node: typeof WorkflowBlueprint.prototype.nodes[0],
    workflow: WorkflowBlueprint,
  ): string[] {
    const inputs: string[] = [];

    // Find incoming connections
    const incoming = workflow.connections.filter((c) => c.target === node.id);

    incoming.forEach((conn) => {
      const sourceNode = workflow.nodes.find((n) => n.id === conn.source);
      if (sourceNode) {
        inputs.push(`Data from ${sourceNode.name}`);
      }
    });

    return inputs;
  }

  private getNodeOutputs(node: typeof WorkflowBlueprint.prototype.nodes[0]): string[] {
    const type = node.type.toLowerCase();

    if (type.includes('if')) {
      return ['True branch', 'False branch'];
    }

    if (type.includes('switch')) {
      return ['Multiple output paths'];
    }

    return ['Processed data'];
  }

  private needsCredentials(nodeType: string): boolean {
    const needsCreds = [
      'gmail',
      'slack',
      'postgres',
      'mysql',
      'sheets',
      'github',
      'stripe',
      'salesforce',
    ];

    return needsCreds.some((service) => nodeType.toLowerCase().includes(service));
  }
}

/**
 * Convenience function to explain a workflow
 */
export async function explainWorkflow(workflow: WorkflowBlueprint): Promise<Explanation> {
  const generator = new ExplanationGenerator();
  return generator.explain(workflow);
}
