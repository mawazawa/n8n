import type { HealingAction, HealingResult, HealingContext } from './types.js';
import { HealingActionType } from './types.js';

/**
 * Healing Strategies
 *
 * Built-in and custom strategies for automatic workflow healing.
 */

export interface HealingStrategy {
  readonly type: HealingActionType;
  execute(action: HealingAction, context: HealingContext): Promise<HealingResult>;
  canHandle(action: HealingAction): boolean;
  estimateDuration(action: HealingAction): number;
}

/**
 * Retry Strategy - Retry failed operations with exponential backoff
 */
export class RetryStrategy implements HealingStrategy {
  readonly type = HealingActionType.RETRY;

  canHandle(action: HealingAction): boolean {
    return action.type === HealingActionType.RETRY;
  }

  estimateDuration(action: HealingAction): number {
    const maxRetries = (action.params.maxRetries as number) || 3;
    const initialDelay = (action.params.initialDelay as number) || 1000;
    const backoffMultiplier = (action.params.backoffMultiplier as number) || 2;

    // Estimate total time with exponential backoff
    let total = 0;
    for (let i = 0; i < maxRetries; i++) {
      total += initialDelay * Math.pow(backoffMultiplier, i);
    }
    return total;
  }

  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();

    try {
      const maxRetries = (action.params.maxRetries as number) || 3;
      const result = await this.retryOperation(action, context, maxRetries);

      return {
        success: true,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        metadata: {
          retriesPerformed: result.attempts,
          finalAttemptSuccessful: result.success,
        },
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Retry strategy failed',
      };
    }
  }

  private async retryOperation(
    action: HealingAction,
    _context: HealingContext,
    maxRetries: number
  ): Promise<{ success: boolean; attempts: number }> {
    let attempts = 0;

    for (let i = 0; i < maxRetries; i++) {
      attempts++;
      try {
        // Simulate retry operation (in real implementation, would trigger actual retry)
        await this.simulateOperation(action);
        return { success: true, attempts };
      } catch (error) {
        if (i < maxRetries - 1) {
          const delay = this.calculateBackoff(i, action.params);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    return { success: false, attempts };
  }

  private calculateBackoff(attempt: number, params: Record<string, unknown>): number {
    const initialDelay = (params.initialDelay as number) || 1000;
    const backoffMultiplier = (params.backoffMultiplier as number) || 2;
    const maxDelay = (params.maxDelay as number) || 60000;
    const jitter = params.jitter !== false;

    let delay = initialDelay * Math.pow(backoffMultiplier, attempt);
    delay = Math.min(delay, maxDelay);

    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  private async simulateOperation(_action: HealingAction): Promise<void> {
    // Simulation: 70% success rate
    if (Math.random() > 0.3) {
      return Promise.resolve();
    }
    throw new Error('Simulated operation failure');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Restart Strategy - Restart failed node or workflow
 */
export class RestartStrategy implements HealingStrategy {
  readonly type = HealingActionType.RESTART;

  canHandle(action: HealingAction): boolean {
    return action.type === HealingActionType.RESTART;
  }

  estimateDuration(_action: HealingAction): number {
    return 5000; // Estimated 5 seconds for restart
  }

  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();

    try {
      const scope = (action.params.scope as string) || 'node';

      if (scope === 'workflow') {
        await this.restartWorkflow(context.workflowId);
      } else {
        await this.restartNode(action.target);
      }

      return {
        success: true,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        metadata: {
          scope,
          restarted: action.target,
        },
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Restart strategy failed',
      };
    }
  }

  private async restartWorkflow(_workflowId: string): Promise<void> {
    // Simulate workflow restart
    await this.sleep(2000);
  }

  private async restartNode(_nodeId: string): Promise<void> {
    // Simulate node restart
    await this.sleep(1000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Scale Strategy - Scale resources up or down
 */
export class ScaleStrategy implements HealingStrategy {
  readonly type = HealingActionType.SCALE;

  canHandle(action: HealingAction): boolean {
    return action.type === HealingActionType.SCALE;
  }

  estimateDuration(_action: HealingAction): number {
    return 10000; // Estimated 10 seconds for scaling
  }

  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();

    try {
      const direction = (action.params.direction as string) || 'up';
      const factor = (action.params.factor as number) || 2;

      await this.scaleResources(context.workflowId, direction, factor);

      return {
        success: true,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        metadata: {
          direction,
          factor,
          workflowId: context.workflowId,
        },
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Scale strategy failed',
      };
    }
  }

  private async scaleResources(
    _workflowId: string,
    _direction: string,
    _factor: number
  ): Promise<void> {
    // Simulate resource scaling
    await this.sleep(3000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Skip Strategy - Skip failed node and continue with workflow
 */
export class SkipStrategy implements HealingStrategy {
  readonly type = HealingActionType.SKIP;

  canHandle(action: HealingAction): boolean {
    return action.type === HealingActionType.SKIP;
  }

  estimateDuration(_action: HealingAction): number {
    return 100; // Nearly instant
  }

  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();

    try {
      const defaultValue = action.params.defaultValue;
      const continueOnError = action.params.continueOnError !== false;

      await this.skipNode(action.target, defaultValue, continueOnError);

      return {
        success: true,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        metadata: {
          skippedNode: action.target,
          defaultValue,
          continueOnError,
          workflowId: context.workflowId,
        },
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Skip strategy failed',
      };
    }
  }

  private async skipNode(
    _nodeId: string,
    _defaultValue: unknown,
    _continueOnError: boolean
  ): Promise<void> {
    // Simulate skipping node
    await this.sleep(50);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Fallback Strategy - Execute fallback path
 */
export class FallbackStrategy implements HealingStrategy {
  readonly type = HealingActionType.FALLBACK;

  canHandle(action: HealingAction): boolean {
    return action.type === HealingActionType.FALLBACK;
  }

  estimateDuration(action: HealingAction): number {
    const timeout = (action.params.timeout as number) || 30000;
    return timeout;
  }

  async execute(action: HealingAction, context: HealingContext): Promise<HealingResult> {
    const startedAt = Date.now();

    try {
      const fallbackPath = action.params.fallbackPath as string;
      if (!fallbackPath) {
        throw new Error('Fallback path not specified');
      }

      await this.executeFallbackPath(fallbackPath, context);

      return {
        success: true,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        metadata: {
          fallbackPath,
          originalNode: action.target,
        },
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Fallback strategy failed',
      };
    }
  }

  private async executeFallbackPath(_fallbackPath: string, _context: HealingContext): Promise<void> {
    // Simulate fallback execution
    await this.sleep(1000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Strategy Registry - Manages available healing strategies
 */
export class StrategyRegistry {
  private readonly strategies: Map<HealingActionType, HealingStrategy> = new Map();

  constructor() {
    // Register built-in strategies
    this.register(new RetryStrategy());
    this.register(new RestartStrategy());
    this.register(new ScaleStrategy());
    this.register(new SkipStrategy());
    this.register(new FallbackStrategy());
  }

  /**
   * Register a healing strategy
   */
  register(strategy: HealingStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /**
   * Get strategy for an action
   */
  getStrategy(actionType: HealingActionType): HealingStrategy | undefined {
    return this.strategies.get(actionType);
  }

  /**
   * Check if strategy exists
   */
  hasStrategy(actionType: HealingActionType): boolean {
    return this.strategies.has(actionType);
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): HealingStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Unregister a strategy
   */
  unregister(actionType: HealingActionType): boolean {
    return this.strategies.delete(actionType);
  }
}
