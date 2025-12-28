/**
 * Parallel Task Executor
 * Executes tasks with dependency awareness and concurrency control
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  type Task,
  type ExecutionPlan,
  type ExecutionResult,
  type ProgressUpdate,
  TaskStatus,
} from './types.js';

/**
 * Execution event types
 */
export enum ExecutionEvent {
  TASK_STARTED = 'task:started',
  TASK_PROGRESS = 'task:progress',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',
  LEVEL_STARTED = 'level:started',
  LEVEL_COMPLETED = 'level:completed',
  EXECUTION_STARTED = 'execution:started',
  EXECUTION_COMPLETED = 'execution:completed',
  EXECUTION_FAILED = 'execution:failed',
}

/**
 * Task executor function type
 */
export type TaskExecutor = (task: Task) => Promise<Task>;

/**
 * Parallel Executor Class
 */
export class ParallelExecutor extends EventEmitter {
  private maxConcurrency: number;
  private taskExecutor: TaskExecutor;
  private runningTasks: Map<string, Promise<Task>>;

  constructor(options: {
    maxConcurrency?: number;
    taskExecutor: TaskExecutor;
  }) {
    super();
    this.maxConcurrency = options.maxConcurrency || 3;
    this.taskExecutor = options.taskExecutor;
    this.runningTasks = new Map();
  }

  /**
   * Execute an execution plan
   */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    const executionId = uuid();
    const startTime = Date.now();

    console.log(`[Executor] Starting execution ${executionId} with ${plan.tasks.length} tasks`);
    this.emit(ExecutionEvent.EXECUTION_STARTED, { executionId, plan });

    const taskResults = new Map<string, Task>();
    let successCount = 0;
    let failureCount = 0;

    try {
      // Execute each level sequentially
      for (let levelIndex = 0; levelIndex < plan.levels.length; levelIndex++) {
        const level = plan.levels[levelIndex];
        console.log(`[Executor] Executing level ${levelIndex + 1}/${plan.levels.length} (${level.length} tasks)`);

        this.emit(ExecutionEvent.LEVEL_STARTED, {
          executionId,
          level: levelIndex,
          tasks: level,
        });

        // Execute tasks in current level in parallel
        const levelResults = await this.executeLevel(level, taskResults);

        // Update results
        for (const [taskId, task] of levelResults) {
          taskResults.set(taskId, task);

          if (task.status === TaskStatus.COMPLETED) {
            successCount++;
          } else if (task.status === TaskStatus.FAILED) {
            failureCount++;
          }
        }

        this.emit(ExecutionEvent.LEVEL_COMPLETED, {
          executionId,
          level: levelIndex,
          results: levelResults,
        });

        // Check if level had failures and should stop
        if (levelResults.some(([, task]) => task.status === TaskStatus.FAILED)) {
          console.log(`[Executor] Level ${levelIndex} had failures, stopping execution`);
          break;
        }
      }

      const endTime = Date.now();
      const result: ExecutionResult = {
        id: executionId,
        teamId: plan.metadata?.teamId as string || 'unknown',
        tasks: taskResults,
        successCount,
        failureCount,
        duration: endTime - startTime,
        startedAt: startTime,
        completedAt: endTime,
        metadata: {
          planId: plan.id,
          levelsCompleted: Math.min(
            plan.levels.length,
            Array.from(taskResults.values()).filter(t => t.completedAt).length
          ),
        },
      };

      this.emit(ExecutionEvent.EXECUTION_COMPLETED, { executionId, result });
      console.log(`[Executor] Execution completed: ${successCount} succeeded, ${failureCount} failed`);

      return result;

    } catch (error) {
      const endTime = Date.now();
      this.emit(ExecutionEvent.EXECUTION_FAILED, { executionId, error });

      throw error;
    }
  }

  /**
   * Execute a single level with concurrency control
   */
  private async executeLevel(
    tasks: Task[],
    previousResults: Map<string, Task>
  ): Promise<Map<string, Task>> {
    const results = new Map<string, Task>();

    // Check dependencies are satisfied
    for (const task of tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depResult = previousResults.get(depId);
          if (!depResult || depResult.status !== TaskStatus.COMPLETED) {
            // Dependency failed, mark this task as failed
            const failedTask: Task = {
              ...task,
              status: TaskStatus.FAILED,
              error: {
                message: `Dependency ${depId} failed or not completed`,
                code: 'DEPENDENCY_FAILED',
              },
              completedAt: Date.now(),
            };
            results.set(task.id, failedTask);
            return results;
          }
        }
      }
    }

    // Execute tasks with concurrency limit using proper completion tracking
    const queue = [...tasks];
    const executing = new Map<Promise<void>, boolean>();

    while (queue.length > 0 || executing.size > 0) {
      // Start new tasks up to concurrency limit
      while (queue.length > 0 && executing.size < this.maxConcurrency) {
        const task = queue.shift()!;
        const promise = this.executeTask(task, results);
        executing.set(promise, false);

        // Mark promise as completed when it resolves or rejects
        promise
          .then(() => executing.set(promise, true))
          .catch(() => executing.set(promise, true));
      }

      // Wait for at least one task to complete
      if (executing.size > 0) {
        await Promise.race(Array.from(executing.keys()));

        // Allow microtasks to run so completion flags are set
        await Promise.resolve();

        // Remove completed promises from the map
        for (const [promise, isCompleted] of executing.entries()) {
          if (isCompleted) {
            executing.delete(promise);
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: Task,
    results: Map<string, Task>
  ): Promise<void> {
    const taskId = task.id;

    try {
      console.log(`[Executor] Starting task ${task.name}`);

      const runningTask: Task = {
        ...task,
        status: TaskStatus.IN_PROGRESS,
        startedAt: Date.now(),
      };

      this.emit(ExecutionEvent.TASK_STARTED, { task: runningTask });

      // Execute the task
      const completedTask = await this.taskExecutor(runningTask);

      // Mark as completed
      completedTask.status = TaskStatus.COMPLETED;
      completedTask.completedAt = Date.now();

      results.set(taskId, completedTask);

      this.emit(ExecutionEvent.TASK_COMPLETED, { task: completedTask });
      console.log(`[Executor] Completed task ${task.name}`);

    } catch (error) {
      const failedTask: Task = {
        ...task,
        status: TaskStatus.FAILED,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          code: 'EXECUTION_ERROR',
        },
        completedAt: Date.now(),
      };

      results.set(taskId, failedTask);

      this.emit(ExecutionEvent.TASK_FAILED, { task: failedTask, error });
      console.error(`[Executor] Failed task ${task.name}:`, error);
    }
  }

  /**
   * Emit progress update
   */
  emitProgress(update: ProgressUpdate): void {
    this.emit(ExecutionEvent.TASK_PROGRESS, update);
  }

  /**
   * Get currently running tasks
   */
  getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  /**
   * Cancel execution (not yet fully implemented)
   */
  async cancel(): Promise<void> {
    console.log('[Executor] Cancelling execution');
    // TODO: Implement task cancellation
    this.runningTasks.clear();
  }
}

/**
 * Create a parallel executor
 */
export function createExecutor(options: {
  maxConcurrency?: number;
  taskExecutor: TaskExecutor;
}): ParallelExecutor {
  return new ParallelExecutor(options);
}

/**
 * Simple task executor for testing
 */
export async function simpleTaskExecutor(task: Task): Promise<Task> {
  // Simulate task execution
  await new Promise(resolve =>
    setTimeout(resolve, task.estimatedDuration || 1000)
  );

  return {
    ...task,
    output: {
      result: `Completed ${task.name}`,
      timestamp: Date.now(),
    },
  };
}
