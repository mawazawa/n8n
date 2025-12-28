/**
 * Refinement Engine
 * Iteratively refines workflow based on user feedback
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { WorkflowBlueprint, GenerationFeedback, RefinementRequest } from './types';
import { wrapError } from '../errors';

const REFINEMENT_PROMPT = `You are an expert workflow architect. Given a workflow blueprint and user feedback, refine the workflow to address the feedback.

Feedback types:
- correct-node: Replace or fix a specific node
- add-node: Add a new node to the workflow
- remove-node: Remove a node
- change-parameter: Modify node parameters
- change-connection: Modify connections
- improve-explanation: Make the workflow clearer

Apply the feedback and return the refined workflow blueprint in the same JSON format.
Maintain the overall structure and improve based on the specific feedback given.`;

export interface RefinementEngineConfig {
  model?: BaseChatModel;
  maxIterations?: number;
}

export class RefinementEngine {
  private model: BaseChatModel;
  private maxIterations: number;
  private feedbackHistory: Map<string, GenerationFeedback[]>;

  constructor(config: RefinementEngineConfig = {}) {
    const router = getTaskRouter();
    this.model = config.model || router.getModelForTask('building');
    this.maxIterations = config.maxIterations || 5;
    this.feedbackHistory = new Map();
  }

  /**
   * Refine workflow based on feedback
   */
  async refine(request: RefinementRequest): Promise<WorkflowBlueprint> {
    try {
      if (request.iteration >= this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) reached`);
      }

      // Apply feedback transformations
      let refined = { ...request.workflow };

      for (const feedback of request.feedback) {
        refined = await this.applyFeedback(refined, feedback);
      }

      // Store feedback history
      const workflowId = this.getWorkflowId(request.workflow);
      const history = this.feedbackHistory.get(workflowId) || [];
      history.push(...request.feedback);
      this.feedbackHistory.set(workflowId, history);

      return refined;
    } catch (error) {
      throw wrapError(error, 'Failed to refine workflow');
    }
  }

  /**
   * Apply user corrections to workflow
   */
  async applyFeedback(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    switch (feedback.type) {
      case 'correct-node':
        return this.correctNode(workflow, feedback);

      case 'add-node':
        return this.addNode(workflow, feedback);

      case 'remove-node':
        return this.removeNode(workflow, feedback);

      case 'change-parameter':
        return this.changeParameter(workflow, feedback);

      case 'change-connection':
        return this.changeConnection(workflow, feedback);

      case 'improve-explanation':
        return this.improveExplanation(workflow, feedback);

      default:
        return workflow;
    }
  }

  /**
   * Learn from feedback patterns
   */
  analyzeFeedbackPatterns(workflowId: string): {
    commonIssues: string[];
    frequentCorrections: Record<string, number>;
    improvementAreas: string[];
  } {
    const history = this.feedbackHistory.get(workflowId) || [];

    const corrections = new Map<string, number>();
    const issues = new Set<string>();

    history.forEach((feedback) => {
      const key = `${feedback.type}-${feedback.targetNodeId || 'general'}`;
      corrections.set(key, (corrections.get(key) || 0) + 1);

      if (feedback.correction) {
        issues.add(feedback.correction);
      }
    });

    return {
      commonIssues: Array.from(issues),
      frequentCorrections: Object.fromEntries(corrections),
      improvementAreas: this.identifyImprovementAreas(history),
    };
  }

  /**
   * Improve confidence over iterations
   */
  calculateIterationConfidence(iteration: number, feedbackCount: number): number {
    // Confidence decreases with more feedback needed
    const baseConfidence = 1.0;
    const feedbackPenalty = feedbackCount * 0.1;
    const iterationBonus = Math.min(iteration * 0.05, 0.2);

    return Math.max(0.1, baseConfidence - feedbackPenalty + iterationBonus);
  }

  // ============================================
  // Private Methods
  // ============================================

  private async correctNode(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    if (!feedback.targetNodeId) {
      return workflow;
    }

    const nodeIndex = workflow.nodes.findIndex((n) => n.id === feedback.targetNodeId);
    if (nodeIndex === -1) {
      return workflow;
    }

    // Use LLM to determine correction
    const correctionContext = {
      node: workflow.nodes[nodeIndex],
      feedback: feedback.correction,
      additionalContext: feedback.additionalContext,
    };

    const response = await this.model.invoke([
      new SystemMessage('Correct this node based on the feedback. Return the corrected node as JSON.'),
      new HumanMessage(JSON.stringify(correctionContext, null, 2)),
    ]);

    try {
      const content = response.content.toString();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const correctedNode = JSON.parse(jsonStr.trim());

      workflow.nodes[nodeIndex] = correctedNode;
    } catch (error) {
      // If parsing fails, keep original node
    }

    return workflow;
  }

  private async addNode(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    // Use LLM to generate new node
    const addContext = {
      existingWorkflow: workflow,
      request: feedback.correction,
      additionalContext: feedback.additionalContext,
    };

    const response = await this.model.invoke([
      new SystemMessage('Add a new node to this workflow based on the request. Return the new node as JSON.'),
      new HumanMessage(JSON.stringify(addContext, null, 2)),
    ]);

    try {
      const content = response.content.toString();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const newNode = JSON.parse(jsonStr.trim());

      workflow.nodes.push(newNode);
    } catch (error) {
      // If parsing fails, skip adding node
    }

    return workflow;
  }

  private removeNode(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    if (!feedback.targetNodeId) {
      return Promise.resolve(workflow);
    }

    // Remove node
    workflow.nodes = workflow.nodes.filter((n) => n.id !== feedback.targetNodeId);

    // Remove connections involving this node
    workflow.connections = workflow.connections.filter(
      (c) => c.source !== feedback.targetNodeId && c.target !== feedback.targetNodeId,
    );

    return Promise.resolve(workflow);
  }

  private changeParameter(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    if (!feedback.targetNodeId) {
      return Promise.resolve(workflow);
    }

    const node = workflow.nodes.find((n) => n.id === feedback.targetNodeId);
    if (!node) {
      return Promise.resolve(workflow);
    }

    // Parse parameter changes from correction text
    // In a real implementation, this would be more sophisticated
    if (feedback.additionalContext) {
      Object.assign(node.parameters, feedback.additionalContext);
    }

    return Promise.resolve(workflow);
  }

  private changeConnection(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    // Parse connection changes from feedback
    // This would require more specific feedback format
    return Promise.resolve(workflow);
  }

  private async improveExplanation(
    workflow: WorkflowBlueprint,
    feedback: GenerationFeedback,
  ): Promise<WorkflowBlueprint> {
    // Update workflow description
    workflow.description = feedback.correction || workflow.description;
    return workflow;
  }

  private getWorkflowId(workflow: WorkflowBlueprint): string {
    return workflow.name.toLowerCase().replace(/\s+/g, '-');
  }

  private identifyImprovementAreas(history: GenerationFeedback[]): string[] {
    const areas = new Set<string>();

    history.forEach((feedback) => {
      if (feedback.type === 'correct-node') {
        areas.add('Node selection accuracy');
      }
      if (feedback.type === 'change-parameter') {
        areas.add('Parameter inference');
      }
      if (feedback.type === 'change-connection') {
        areas.add('Connection logic');
      }
    });

    return Array.from(areas);
  }
}

/**
 * Convenience function to refine a workflow
 */
export async function refineWorkflow(
  request: RefinementRequest,
): Promise<WorkflowBlueprint> {
  const engine = new RefinementEngine();
  return engine.refine(request);
}
