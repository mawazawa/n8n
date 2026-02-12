import type { HealingAction, HealingResult, HealingContext } from './types.js';
import { HealingResultSchema } from './types.js';
import { StrategyRegistry } from './strategies.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Healing Action Executor
 *
 * Executes healing actions with priority queuing, rollback support,
 * and comprehensive audit logging.
 */
export class HealingExecutor {
  private readonly strategyRegistry: StrategyRegistry;
  private readonly actionQueue: PriorityQueue<QueuedAction>;
  private readonly executionHistory: Map<string, HealingResult> = new Map();
  private readonly rollbackStack: Array<{ action: HealingAction; result: HealingResult }> = [];
  private isProcessing = false;

  constructor(strategyRegistry?: StrategyRegistry) {
    this.strategyRegistry = strategyRegistry || new StrategyRegistry();
    this.actionQueue = new PriorityQueue();
  }

  /**
   * Execute a healing action
   */
  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();
    const executionId = uuidv4();

    try {
      // Get appropriate strategy
      const strategy = this.strategyRegistry.getStrategy(action.type);
      if (!strategy) {
        throw new Error(`No strategy found for action type: ${action.type}`);
      }

      // Check timeout
      const timeout = action.timeout || 300000; // 5 minutes default
      const resultPromise = strategy.execute(action, context);
      const result = await this.executeWithTimeout(resultPromise, timeout);

      // Validate result
      const validatedResult = HealingResultSchema.parse(result);

      // Store in history
      this.executionHistory.set(executionId, validatedResult);

      // Add to rollback stack if successful
      if (validatedResult.success && this.shouldEnableRollback(action)) {
        this.rollbackStack.push({ action, result: validatedResult });
      }

      // Log audit trail
      await this.logAuditTrail(executionId, action, validatedResult, context);

      return validatedResult;
    } catch (error) {
      const failedResult: HealingResult = {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Execution failed',
      };

      // Store in history
      this.executionHistory.set(executionId, failedResult);

      // Log failed execution
      await this.logAuditTrail(executionId, action, failedResult, context);

      return failedResult;
    }
  }

  /**
   * Queue an action for execution
   */
  async queueAction(
    action: HealingAction,
    context: HealingContext,
    priority?: number
  ): Promise<string> {
    const queuedAction: QueuedAction = {
      id: uuidv4(),
      action,
      context,
      priority: priority || action.priority || 5,
      queuedAt: Date.now(),
    };

    this.actionQueue.enqueue(queuedAction, queuedAction.priority);

    // Start processing if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }

    return queuedAction.id;
  }

  /**
   * Process action queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (!this.actionQueue.isEmpty()) {
        const queuedAction = this.actionQueue.dequeue();
        if (!queuedAction) {
          break;
        }

        await this.execute(queuedAction.action, queuedAction.context);

        // Small delay between actions
        await this.sleep(100);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute action with timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Action execution timeout')), timeoutMs);
      }),
    ]);
  }

  /**
   * Rollback last healing action
   */
  async rollback(): Promise<HealingResult | null> {
    const lastAction = this.rollbackStack.pop();
    if (!lastAction) {
      return null;
    }

    const startedAt = Date.now();

    try {
      await this.performRollback(lastAction.action, lastAction.result);

      const rollbackResult: HealingResult = {
        success: true,
        action: lastAction.action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        rollbackPerformed: true,
        metadata: {
          originalResult: lastAction.result,
        },
      };

      return rollbackResult;
    } catch (error) {
      return {
        success: false,
        action: lastAction.action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        rollbackPerformed: false,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * Perform rollback operation
   */
  private async performRollback(
    _action: HealingAction,
    _previousResult: HealingResult
  ): Promise<void> {
    // Simulate rollback operation
    await this.sleep(1000);
  }

  /**
   * Check if rollback should be enabled for action
   */
  private shouldEnableRollback(action: HealingAction): boolean {
    // Enable rollback for certain action types
    const rollbackableActions = ['RESTART', 'SCALE', 'ROLLBACK'];
    return rollbackableActions.includes(action.type);
  }

  /**
   * Log audit trail
   */
  private async logAuditTrail(
    executionId: string,
    action: HealingAction,
    result: HealingResult,
    context: HealingContext
  ): Promise<void> {
    const auditEntry = {
      executionId,
      timestamp: Date.now(),
      workflowId: context.workflowId,
      action,
      result,
      anomaly: context.anomaly,
      rootCause: context.rootCause,
    };

    // In real implementation, this would persist to database
    console.log('[AUDIT]', JSON.stringify(auditEntry, null, 2));
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): HealingResult[] {
    const results = Array.from(this.executionHistory.values());
    if (limit) {
      return results.slice(-limit);
    }
    return results;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): HealingResult | undefined {
    return this.executionHistory.get(executionId);
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.actionQueue.size();
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
    this.rollbackStack.length = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Queued Action
 */
interface QueuedAction {
  id: string;
  action: HealingAction;
  context: HealingContext;
  priority: number;
  queuedAt: number;
}

/**
 * Priority Queue implementation
 */
class PriorityQueue<T extends { priority: number }> {
  private items: T[] = [];

  enqueue(item: T, priority: number): void {
    const queueItem = { ...item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].priority < priority) {
        this.items.splice(i, 0, queueItem as T);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(queueItem as T);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
