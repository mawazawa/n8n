import type { FallbackConfig } from './types.js';
import { FallbackConfigSchema } from './types.js';

/**
 * Fallback Manager
 *
 * Manages fallback paths and graceful degradation for failed workflow nodes.
 */
export class FallbackManager {
  private readonly fallbacks: Map<string, FallbackConfig> = new Map();
  private readonly executionHistory: Map<string, FallbackExecutionResult> = new Map();

  /**
   * Register a fallback for a node
   */
  registerFallback(nodeId: string, config: Partial<FallbackConfig>): void {
    const fallbackConfig = FallbackConfigSchema.parse({
      nodeId,
      ...config,
    });

    this.fallbacks.set(nodeId, fallbackConfig);
  }

  /**
   * Execute fallback for a failed node
   */
  async executeFallback(
    nodeId: string,
    context: FallbackExecutionContext
  ): Promise<FallbackExecutionResult> {
    const config = this.fallbacks.get(nodeId);

    if (!config) {
      throw new Error(`No fallback registered for node ${nodeId}`);
    }

    const startedAt = Date.now();

    try {
      // Check condition if specified
      if (config.condition && !this.evaluateCondition(config.condition, context)) {
        return {
          success: false,
          nodeId,
          fallbackPath: undefined,
          value: undefined,
          duration: Date.now() - startedAt,
          error: 'Fallback condition not met',
        };
      }

      // Try cascading fallbacks
      if (config.cascadingFallbacks && config.cascadingFallbacks.length > 0) {
        return await this.executeCascadingFallbacks(nodeId, config, context);
      }

      // Execute primary fallback
      const result = await this.executePrimaryFallback(nodeId, config, context);

      // Store in history
      this.executionHistory.set(`${nodeId}:${Date.now()}`, result);

      return result;
    } catch (error) {
      const result: FallbackExecutionResult = {
        success: false,
        nodeId,
        fallbackPath: config.fallbackPath,
        value: undefined,
        duration: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Fallback execution failed',
      };

      this.executionHistory.set(`${nodeId}:${Date.now()}`, result);
      return result;
    }
  }

  /**
   * Execute primary fallback
   */
  private async executePrimaryFallback(
    nodeId: string,
    config: FallbackConfig,
    context: FallbackExecutionContext
  ): Promise<FallbackExecutionResult> {
    const startedAt = Date.now();

    try {
      let value: unknown;

      if (config.defaultValue !== undefined) {
        // Use default value
        value = config.defaultValue;
      } else if (config.fallbackPath) {
        // Execute fallback path
        value = await this.executeFallbackPath(config.fallbackPath, context, config.timeout);
      } else {
        throw new Error('No fallback value or path configured');
      }

      return {
        success: true,
        nodeId,
        fallbackPath: config.fallbackPath,
        value,
        duration: Date.now() - startedAt,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute cascading fallbacks
   */
  private async executeCascadingFallbacks(
    nodeId: string,
    config: FallbackConfig,
    context: FallbackExecutionContext
  ): Promise<FallbackExecutionResult> {
    const startedAt = Date.now();
    const fallbackPaths = [config.fallbackPath, ...(config.cascadingFallbacks || [])];

    let lastError: Error | undefined;

    for (const fallbackPath of fallbackPaths) {
      try {
        const value = await this.executeFallbackPath(fallbackPath, context, config.timeout);

        return {
          success: true,
          nodeId,
          fallbackPath,
          value,
          duration: Date.now() - startedAt,
          cascadeLevel: fallbackPaths.indexOf(fallbackPath),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Fallback execution failed');
        continue;
      }
    }

    // All fallbacks failed, try default value
    if (config.defaultValue !== undefined) {
      return {
        success: true,
        nodeId,
        fallbackPath: undefined,
        value: config.defaultValue,
        duration: Date.now() - startedAt,
        usedDefaultValue: true,
      };
    }

    throw lastError || new Error('All fallback paths failed');
  }

  /**
   * Execute fallback path
   */
  private async executeFallbackPath(
    fallbackPath: string,
    context: FallbackExecutionContext,
    timeout: number
  ): Promise<unknown> {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Fallback execution timeout')), timeout);
    });

    // Execute fallback operation (simulated)
    const executionPromise = this.simulateFallbackExecution(fallbackPath, context);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Simulate fallback execution
   */
  private async simulateFallbackExecution(
    _fallbackPath: string,
    context: FallbackExecutionContext
  ): Promise<unknown> {
    // In real implementation, this would execute the fallback workflow path
    await this.sleep(100);

    // Return mock result
    return {
      status: 'fallback_executed',
      originalNode: context.nodeId,
      timestamp: Date.now(),
    };
  }

  /**
   * Evaluate fallback condition
   */
  private evaluateCondition(_condition: string, _context: FallbackExecutionContext): boolean {
    // In real implementation, this would evaluate the condition expression
    // For now, return true
    return true;
  }

  /**
   * Get fallback configuration for a node
   */
  getFallback(nodeId: string): FallbackConfig | undefined {
    return this.fallbacks.get(nodeId);
  }

  /**
   * Get all registered fallbacks
   */
  getAllFallbacks(): Map<string, FallbackConfig> {
    return new Map(this.fallbacks);
  }

  /**
   * Remove fallback for a node
   */
  removeFallback(nodeId: string): boolean {
    return this.fallbacks.delete(nodeId);
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): FallbackExecutionResult[] {
    const results = Array.from(this.executionHistory.values());
    if (limit) {
      return results.slice(-limit);
    }
    return results;
  }

  /**
   * Clear all fallbacks
   */
  clearAllFallbacks(): void {
    this.fallbacks.clear();
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Fallback Execution Context
 */
export interface FallbackExecutionContext {
  nodeId: string;
  workflowId: string;
  executionId?: string;
  error?: Error;
  inputData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Fallback Execution Result
 */
export interface FallbackExecutionResult {
  success: boolean;
  nodeId: string;
  fallbackPath?: string;
  value?: unknown;
  duration: number;
  error?: string;
  cascadeLevel?: number;
  usedDefaultValue?: boolean;
}
