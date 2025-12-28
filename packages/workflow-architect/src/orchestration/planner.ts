/**
 * Task Planning and Dependency Management
 * Decomposes complex tasks and creates execution plans
 */

import { v4 as uuid } from 'uuid';
import {
  type Task,
  type DAG,
  type ExecutionPlan,
  type ResourceEstimate,
  TaskPriority,
  TaskStatus,
} from './types.js';

/**
 * SubTask from decomposition
 */
export interface SubTask extends Omit<Task, 'id' | 'createdAt'> {
  parentTaskId: string;
}

/**
 * Task Planner Class
 */
export class TaskPlanner {
  /**
   * Decompose complex task into subtasks
   */
  async decompose(complexTask: Task): Promise<Task[]> {
    console.log(`[Planner] Decomposing task: ${complexTask.name}`);

    // This is a simplified decomposition
    // In production, you'd use an LLM to intelligently break down tasks
    const subtasks: Task[] = [];

    // Example decomposition based on task type
    switch (complexTask.type) {
      case 'workflow-creation':
        subtasks.push(
          this.createSubTask(complexTask, 'analyze-requirements', 'Analyze workflow requirements', 0),
          this.createSubTask(complexTask, 'design-workflow', 'Design workflow structure', 1),
          this.createSubTask(complexTask, 'implement-nodes', 'Implement workflow nodes', 2),
          this.createSubTask(complexTask, 'test-workflow', 'Test workflow execution', 3)
        );
        break;

      case 'data-processing':
        subtasks.push(
          this.createSubTask(complexTask, 'extract-data', 'Extract data from sources', 0),
          this.createSubTask(complexTask, 'transform-data', 'Transform and clean data', 1),
          this.createSubTask(complexTask, 'load-data', 'Load data to destination', 2)
        );
        break;

      case 'code-review':
        subtasks.push(
          this.createSubTask(complexTask, 'static-analysis', 'Run static code analysis', 0),
          this.createSubTask(complexTask, 'security-scan', 'Perform security scan', 0),
          this.createSubTask(complexTask, 'review-logic', 'Review code logic', 1),
          this.createSubTask(complexTask, 'generate-report', 'Generate review report', 2)
        );
        break;

      default:
        // For unknown types, return the task as-is
        return [complexTask];
    }

    console.log(`[Planner] Decomposed into ${subtasks.length} subtasks`);
    return subtasks;
  }

  /**
   * Create dependency graph from tasks
   */
  createDependencyGraph(tasks: Task[]): DAG {
    const nodes: string[] = tasks.map(t => t.id);
    const edges: Array<{ from: string; to: string }> = [];

    // Build edges from task dependencies
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          edges.push({ from: depId, to: task.id });
        }
      }
    }

    // Topological sort
    const sorted = this.topologicalSort(nodes, edges);

    // Create execution levels for parallelization
    const levels = this.createExecutionLevels(nodes, edges);

    return {
      nodes,
      edges,
      sorted,
      levels,
    };
  }

  /**
   * Estimate resources needed for task execution
   */
  estimateResources(tasks: Task[]): ResourceEstimate {
    let totalDuration = 0;
    let maxParallelTasks = 1;
    let totalMemory = 0;

    // Estimate based on task metadata
    for (const task of tasks) {
      totalDuration += task.estimatedDuration || 5000; // Default 5s
      totalMemory += this.estimateTaskMemory(task);
    }

    // Calculate max parallel tasks from dependency graph
    const dag = this.createDependencyGraph(tasks);
    maxParallelTasks = Math.max(...dag.levels.map(level => level.length));

    // Estimate cost (arbitrary units based on complexity)
    const cost = tasks.length * 10 + maxParallelTasks * 5;

    return {
      duration: totalDuration / maxParallelTasks, // Adjusted for parallelization
      agentsNeeded: Math.min(maxParallelTasks, 5), // Cap at 5 agents
      memory: totalMemory,
      cost,
      confidence: 0.7, // Medium confidence for estimates
    };
  }

  /**
   * Optimize execution plan
   */
  optimizeExecution(graph: DAG, tasks: Task[]): ExecutionPlan {
    console.log(`[Planner] Optimizing execution plan for ${tasks.length} tasks`);

    // Reorder tasks within levels by priority
    const optimizedLevels = graph.levels.map(level => {
      const levelTasks = level
        .map(taskId => tasks.find(t => t.id === taskId))
        .filter((t): t is Task => t !== undefined);

      return this.sortByPriority(levelTasks);
    });

    const resourceEstimate = this.estimateResources(tasks);

    const plan: ExecutionPlan = {
      id: uuid(),
      tasks,
      graph,
      levels: optimizedLevels,
      resourceEstimate,
      estimatedCompletion: Date.now() + resourceEstimate.duration,
      createdAt: Date.now(),
      metadata: {
        optimization: 'priority-based',
        parallelLevels: optimizedLevels.length,
        maxConcurrency: Math.max(...optimizedLevels.map(l => l.length)),
      },
    };

    console.log(`[Planner] Created execution plan with ${optimizedLevels.length} levels`);
    return plan;
  }

  /**
   * Create a subtask from parent task
   */
  private createSubTask(
    parent: Task,
    suffix: string,
    description: string,
    order: number
  ): Task {
    const taskId = uuid();

    return {
      id: taskId,
      name: `${parent.name}-${suffix}`,
      description,
      type: suffix,
      priority: parent.priority,
      status: TaskStatus.PENDING,
      requiredCapabilities: parent.requiredCapabilities,
      input: parent.input,
      dependencies: order > 0 ? [] : undefined, // Dependencies set later
      createdAt: Date.now(),
      metadata: {
        parentTaskId: parent.id,
        order,
      },
    };
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(
    nodes: string[],
    edges: Array<{ from: string; to: string }>
  ): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }

    // Build graph
    for (const edge of edges) {
      adjacency.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    // Find nodes with no dependencies
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const sorted: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== nodes.length) {
      throw new Error('Dependency graph contains cycles');
    }

    return sorted;
  }

  /**
   * Create execution levels for parallel execution
   */
  private createExecutionLevels(
    nodes: string[],
    edges: Array<{ from: string; to: string }>
  ): string[][] {
    const levels: string[][] = [];
    const nodeLevel = new Map<string, number>();

    // Build adjacency map
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      adjacency.set(node, []);
    }
    for (const edge of edges) {
      adjacency.get(edge.from)?.push(edge.to);
    }

    // Calculate levels using BFS
    const inDegree = new Map<string, number>();
    for (const node of nodes) {
      inDegree.set(node, 0);
    }
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    let queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
        nodeLevel.set(node, 0);
      }
    }

    while (queue.length > 0) {
      const currentLevel: string[] = [...queue];
      levels.push(currentLevel);
      queue = [];

      for (const node of currentLevel) {
        const level = nodeLevel.get(node) || 0;

        for (const neighbor of adjacency.get(node) || []) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);

          if (newDegree === 0) {
            queue.push(neighbor);
            nodeLevel.set(neighbor, level + 1);
          }
        }
      }
    }

    return levels;
  }

  /**
   * Sort tasks by priority
   */
  private sortByPriority(tasks: Task[]): Task[] {
    const priorityOrder = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 1,
      [TaskPriority.MEDIUM]: 2,
      [TaskPriority.LOW]: 3,
    };

    return [...tasks].sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  /**
   * Estimate memory for a task
   */
  private estimateTaskMemory(task: Task): number {
    // Simple heuristic: 50MB base + 10MB per input property
    const baseMemory = 50;
    const inputSize = Object.keys(task.input).length * 10;
    return baseMemory + inputSize;
  }

  /**
   * Validate execution plan
   */
  validatePlan(plan: ExecutionPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check all tasks have IDs
    if (plan.tasks.some(t => !t.id)) {
      errors.push('Some tasks are missing IDs');
    }

    // Check graph nodes match task IDs
    const taskIds = new Set(plan.tasks.map(t => t.id));
    const graphNodes = new Set(plan.graph.nodes);

    for (const taskId of taskIds) {
      if (!graphNodes.has(taskId)) {
        errors.push(`Task ${taskId} not in dependency graph`);
      }
    }

    // Check dependencies are valid
    for (const task of plan.tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (!taskIds.has(depId)) {
            errors.push(`Task ${task.id} has invalid dependency ${depId}`);
          }
        }
      }
    }

    // Check for cycles
    try {
      this.topologicalSort(plan.graph.nodes, plan.graph.edges);
    } catch (error) {
      errors.push('Dependency graph contains cycles');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create a task planner instance
 */
export function createPlanner(): TaskPlanner {
  return new TaskPlanner();
}
