/**
 * Workflow Planner
 * Determines optimal node sequence and execution strategy
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { Intent, WorkflowBlueprint, NodeBlueprint } from './types';
import { wrapError } from '../errors';

const PLANNING_PROMPT = `You are an expert workflow architect. Given a structured intent, design the optimal workflow structure.

Your task is to:
1. Determine the optimal sequence of nodes
2. Identify parallel vs sequential paths
3. Estimate resource requirements
4. Plan error handling and retry logic
5. Consider performance and scalability

Respond with a JSON object containing:
{
  "name": "Workflow name",
  "description": "Brief description",
  "nodes": [
    {
      "id": "unique_id",
      "name": "Node display name",
      "type": "n8n_node_type",
      "position": { "x": 100, "y": 200 },
      "parameters": {},
      "confidence": 0.0-1.0,
      "rationale": "Why this node is needed"
    }
  ],
  "connections": [
    {
      "source": "node_id",
      "sourceOutput": "main",
      "target": "node_id",
      "targetInput": "main"
    }
  ],
  "metadata": {
    "category": "automation|etl|notification|...",
    "techniques": ["technique1", "technique2"],
    "estimatedDuration": 5000,
    "requiredCredentials": ["credential_type"]
  }
}

Guidelines:
- Start with trigger nodes (webhook, schedule, manual)
- Include data transformation nodes as needed
- Add error handling for critical operations
- Use conditional logic for branching
- End with action nodes (send email, update database)
- Keep it simple - avoid unnecessary complexity
- Position nodes in a readable layout (left to right, 200px spacing)`;

export interface WorkflowPlannerConfig {
  model?: BaseChatModel;
  defaultSpacing?: number;
}

export interface PlanningOptions {
  maxNodes?: number;
  preferParallel?: boolean;
  includeErrorHandling?: boolean;
}

export class WorkflowPlanner {
  private model: BaseChatModel;
  private defaultSpacing: number;

  constructor(config: WorkflowPlannerConfig = {}) {
    const router = getTaskRouter();
    this.model = config.model || router.getModelForTask('building');
    this.defaultSpacing = config.defaultSpacing || 200;
  }

  /**
   * Plan a workflow based on intent
   */
  async plan(intent: Intent, options: PlanningOptions = {}): Promise<WorkflowBlueprint> {
    try {
      // Build planning context
      const planningContext = this.buildPlanningContext(intent, options);

      // Get plan from LLM
      const response = await this.model.invoke([
        new SystemMessage(PLANNING_PROMPT),
        new HumanMessage(planningContext),
      ]);

      // Parse and validate response
      const blueprint = this.parseBlueprint(response.content.toString());

      // Apply constraints
      const constrainedBlueprint = this.applyConstraints(blueprint, options);

      // Optimize layout
      const optimizedBlueprint = this.optimizeLayout(constrainedBlueprint);

      return optimizedBlueprint;
    } catch (error) {
      throw wrapError(error, 'Failed to plan workflow');
    }
  }

  /**
   * Determine if paths should be parallel or sequential
   */
  determineExecutionStrategy(intent: Intent): 'sequential' | 'parallel' | 'hybrid' {
    // Parallel if multiple independent data sources
    if (intent.dataSources.length > 1 && !intent.conditions.length) {
      return 'parallel';
    }

    // Sequential if there are dependencies or conditions
    if (intent.conditions.length > 0 || intent.transformations.length > 2) {
      return 'sequential';
    }

    // Hybrid for moderate complexity
    if (intent.complexity === 'moderate' || intent.complexity === 'complex') {
      return 'hybrid';
    }

    return 'sequential';
  }

  /**
   * Estimate resource requirements
   */
  estimateResources(intent: Intent): {
    estimatedNodes: number;
    estimatedMemory: number;
    estimatedDuration: number;
    requiresQueue: boolean;
  } {
    const baseNodes = 2; // Trigger + action
    const transformationNodes = intent.transformations.length;
    const conditionNodes = intent.conditions.length;
    const sourceNodes = intent.dataSources.length;

    const estimatedNodes = baseNodes + transformationNodes + conditionNodes + sourceNodes;

    // Estimate duration (ms)
    let estimatedDuration = 1000; // Base
    estimatedDuration += estimatedNodes * 500; // Per node
    estimatedDuration += intent.dataSources.length * 2000; // External calls

    // Memory estimation (MB)
    const estimatedMemory = 50 + estimatedNodes * 10;

    // Queue needed for long-running workflows
    const requiresQueue = estimatedDuration > 30000 || intent.workflowType === 'batch-processing';

    return {
      estimatedNodes,
      estimatedMemory,
      estimatedDuration,
      requiresQueue,
    };
  }

  /**
   * Identify required error handling nodes
   */
  planErrorHandling(
    intent: Intent,
    includeErrorHandling: boolean,
  ): Array<{ type: string; position: 'before' | 'after' | 'wrap' }> {
    if (!includeErrorHandling) {
      return [];
    }

    const errorHandlers: Array<{ type: string; position: 'before' | 'after' | 'wrap' }> = [];

    // Critical operations need try-catch
    if (intent.dataSources.some((s) => s.includes('api') || s.includes('webhook'))) {
      errorHandlers.push({ type: 'n8n-nodes-base.errorTrigger', position: 'wrap' });
    }

    // Add retry for external calls
    if (intent.requiredCapabilities.includes('retry')) {
      errorHandlers.push({ type: 'n8n-nodes-base.wait', position: 'before' });
    }

    return errorHandlers;
  }

  // ============================================
  // Private Methods
  // ============================================

  private buildPlanningContext(intent: Intent, options: PlanningOptions): string {
    const context = {
      intent,
      constraints: {
        maxNodes: options.maxNodes,
        preferParallel: options.preferParallel,
        includeErrorHandling: options.includeErrorHandling,
      },
      strategy: this.determineExecutionStrategy(intent),
      resources: this.estimateResources(intent),
    };

    return JSON.stringify(context, null, 2);
  }

  private parseBlueprint(content: string): WorkflowBlueprint {
    try {
      // Extract JSON from markdown if needed
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr.trim());

      // Validate required fields
      if (!parsed.name || !parsed.nodes || !parsed.connections) {
        throw new Error('Invalid blueprint structure');
      }

      return parsed as WorkflowBlueprint;
    } catch (error) {
      throw new Error(
        `Failed to parse blueprint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private applyConstraints(
    blueprint: WorkflowBlueprint,
    options: PlanningOptions,
  ): WorkflowBlueprint {
    let nodes = blueprint.nodes;

    // Apply max nodes constraint
    if (options.maxNodes && nodes.length > options.maxNodes) {
      // Keep highest confidence nodes
      nodes = nodes.sort((a, b) => b.confidence - a.confidence).slice(0, options.maxNodes);

      // Update connections to only reference remaining nodes
      const nodeIds = new Set(nodes.map((n) => n.id));
      blueprint.connections = blueprint.connections.filter(
        (c) => nodeIds.has(c.source) && nodeIds.has(c.target),
      );
    }

    return {
      ...blueprint,
      nodes,
    };
  }

  private optimizeLayout(blueprint: WorkflowBlueprint): WorkflowBlueprint {
    // Build dependency graph
    const graph = this.buildDependencyGraph(blueprint);

    // Calculate levels (topological sort)
    const levels = this.calculateLevels(graph, blueprint.nodes);

    // Position nodes based on levels
    const positionedNodes = blueprint.nodes.map((node) => {
      const level = levels.get(node.id) || 0;
      const nodesInLevel = blueprint.nodes.filter((n) => levels.get(n.id) === level);
      const indexInLevel = nodesInLevel.findIndex((n) => n.id === node.id);

      return {
        ...node,
        position: {
          x: level * this.defaultSpacing,
          y: indexInLevel * this.defaultSpacing,
        },
      };
    });

    return {
      ...blueprint,
      nodes: positionedNodes,
    };
  }

  private buildDependencyGraph(blueprint: WorkflowBlueprint): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize
    blueprint.nodes.forEach((node) => {
      graph.set(node.id, new Set());
    });

    // Build edges
    blueprint.connections.forEach((conn) => {
      const deps = graph.get(conn.target);
      if (deps) {
        deps.add(conn.source);
      }
    });

    return graph;
  }

  private calculateLevels(
    graph: Map<string, Set<string>>,
    nodes: NodeBlueprint[],
  ): Map<string, number> {
    const levels = new Map<string, number>();
    const visited = new Set<string>();

    const visit = (nodeId: string): number => {
      if (visited.has(nodeId)) {
        return levels.get(nodeId) || 0;
      }

      visited.add(nodeId);

      const deps = graph.get(nodeId);
      if (!deps || deps.size === 0) {
        levels.set(nodeId, 0);
        return 0;
      }

      const maxDepLevel = Math.max(...Array.from(deps).map((dep) => visit(dep)));
      const level = maxDepLevel + 1;
      levels.set(nodeId, level);
      return level;
    };

    nodes.forEach((node) => visit(node.id));

    return levels;
  }
}

/**
 * Convenience function to plan a workflow
 */
export async function planWorkflow(
  intent: Intent,
  options?: PlanningOptions,
): Promise<WorkflowBlueprint> {
  const planner = new WorkflowPlanner();
  return planner.plan(intent, options);
}
