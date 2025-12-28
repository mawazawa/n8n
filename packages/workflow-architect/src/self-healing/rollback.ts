import type { RollbackPolicy } from './types.js';
import { RollbackPolicySchema } from './types.js';

/**
 * Auto Rollback Trigger
 *
 * Automatically triggers workflow rollback when failure conditions are met.
 */
export class RollbackTrigger {
  private readonly policies: Map<string, RollbackPolicy> = new Map();
  private readonly rollbackHistory: Map<string, RollbackResult> = new Map();
  private readonly failureCounters: Map<string, number> = new Map();
  private readonly errorRateWindows: Map<string, number[]> = new Map();

  /**
   * Configure rollback policy for a workflow
   */
  configureRollback(workflowId: string, policy: Partial<RollbackPolicy>): void {
    const rollbackPolicy = RollbackPolicySchema.parse({
      workflowId,
      ...policy,
    });

    this.policies.set(workflowId, rollbackPolicy);
  }

  /**
   * Check if rollback should be triggered
   */
  shouldTriggerRollback(workflowId: string, context: RollbackContext): boolean {
    const policy = this.policies.get(workflowId);
    if (!policy || !policy.enabled) {
      return false;
    }

    for (const trigger of policy.triggers) {
      // Check error rate trigger
      if (trigger.errorRate !== undefined) {
        const currentErrorRate = this.calculateErrorRate(workflowId);
        if (currentErrorRate >= trigger.errorRate) {
          return true;
        }
      }

      // Check consecutive failures trigger
      if (trigger.consecutiveFailures !== undefined) {
        const consecutiveFailures = this.failureCounters.get(workflowId) || 0;
        if (consecutiveFailures >= trigger.consecutiveFailures) {
          return true;
        }
      }

      // Check custom condition trigger
      if (trigger.customCondition) {
        if (this.evaluateCustomCondition(trigger.customCondition, context)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Trigger rollback for a workflow
   */
  async triggerRollback(workflowId: string, executionId?: string): Promise<RollbackResult> {
    const policy = this.policies.get(workflowId);
    if (!policy) {
      throw new Error(`No rollback policy configured for workflow ${workflowId}`);
    }

    const startedAt = Date.now();

    try {
      const targetVersion = policy.targetVersion || this.getPreviousVersion(workflowId);

      if (!targetVersion) {
        throw new Error('No target version available for rollback');
      }

      // Perform rollback
      if (policy.partialRollback && policy.affectedNodes) {
        await this.performPartialRollback(workflowId, policy.affectedNodes, targetVersion);
      } else {
        await this.performFullRollback(workflowId, targetVersion);
      }

      const result: RollbackResult = {
        success: true,
        workflowId,
        executionId,
        targetVersion,
        rollbackType: policy.partialRollback ? 'partial' : 'full',
        affectedNodes: policy.affectedNodes,
        duration: Date.now() - startedAt,
        timestamp: Date.now(),
      };

      // Store in history
      this.rollbackHistory.set(`${workflowId}:${Date.now()}`, result);

      // Reset failure counters
      this.failureCounters.set(workflowId, 0);

      // Notify if configured
      if (policy.notifyOnRollback) {
        await this.notifyRollback(result);
      }

      return result;
    } catch (error) {
      const result: RollbackResult = {
        success: false,
        workflowId,
        executionId,
        targetVersion: policy.targetVersion,
        rollbackType: policy.partialRollback ? 'partial' : 'full',
        duration: Date.now() - startedAt,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Rollback failed',
      };

      // Store failed rollback
      this.rollbackHistory.set(`${workflowId}:${Date.now()}`, result);

      // Auto-revert if configured
      if (policy.autoRevert && result.error) {
        await this.revertRollback(workflowId);
      }

      return result;
    }
  }

  /**
   * Record execution result
   */
  recordExecution(workflowId: string, success: boolean): void {
    if (success) {
      // Reset failure counter on success
      this.failureCounters.set(workflowId, 0);
      this.recordErrorRate(workflowId, 0);
    } else {
      // Increment failure counter
      const current = this.failureCounters.get(workflowId) || 0;
      this.failureCounters.set(workflowId, current + 1);
      this.recordErrorRate(workflowId, 1);
    }
  }

  /**
   * Perform full workflow rollback
   */
  private async performFullRollback(workflowId: string, targetVersion: string): Promise<void> {
    // Simulate full rollback
    await this.sleep(2000);
    console.log(`[ROLLBACK] Full rollback of workflow ${workflowId} to version ${targetVersion}`);
  }

  /**
   * Perform partial workflow rollback
   */
  private async performPartialRollback(
    workflowId: string,
    affectedNodes: string[],
    targetVersion: string
  ): Promise<void> {
    // Simulate partial rollback
    await this.sleep(1000);
    console.log(
      `[ROLLBACK] Partial rollback of workflow ${workflowId} nodes ${affectedNodes.join(', ')} to version ${targetVersion}`
    );
  }

  /**
   * Revert a failed rollback
   */
  private async revertRollback(workflowId: string): Promise<void> {
    // Simulate rollback revert
    await this.sleep(1000);
    console.log(`[ROLLBACK] Reverting failed rollback for workflow ${workflowId}`);
  }

  /**
   * Get previous version of workflow
   */
  private getPreviousVersion(_workflowId: string): string | undefined {
    // In real implementation, would fetch from version history
    return 'v1.0.0';
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(workflowId: string): number {
    const window = this.errorRateWindows.get(workflowId) || [];
    if (window.length === 0) {
      return 0;
    }

    const errors = window.filter((v) => v === 1).length;
    return errors / window.length;
  }

  /**
   * Record error rate data point
   */
  private recordErrorRate(workflowId: string, value: number): void {
    const window = this.errorRateWindows.get(workflowId) || [];
    window.push(value);

    // Keep last 100 executions
    if (window.length > 100) {
      window.shift();
    }

    this.errorRateWindows.set(workflowId, window);
  }

  /**
   * Evaluate custom condition
   */
  private evaluateCustomCondition(_condition: string, _context: RollbackContext): boolean {
    // In real implementation, would evaluate the condition expression
    return false;
  }

  /**
   * Notify about rollback
   */
  private async notifyRollback(_result: RollbackResult): Promise<void> {
    // In real implementation, would send notifications
    await this.sleep(100);
  }

  /**
   * Get rollback policy for a workflow
   */
  getPolicy(workflowId: string): RollbackPolicy | undefined {
    return this.policies.get(workflowId);
  }

  /**
   * Get rollback history
   */
  getHistory(workflowId?: string, limit?: number): RollbackResult[] {
    let results = Array.from(this.rollbackHistory.values());

    if (workflowId) {
      results = results.filter((r) => r.workflowId === workflowId);
    }

    if (limit) {
      results = results.slice(-limit);
    }

    return results;
  }

  /**
   * Remove rollback policy
   */
  removePolicy(workflowId: string): boolean {
    return this.policies.delete(workflowId);
  }

  /**
   * Clear all policies
   */
  clearAllPolicies(): void {
    this.policies.clear();
    this.failureCounters.clear();
    this.errorRateWindows.clear();
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.rollbackHistory.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Rollback Context
 */
export interface RollbackContext {
  workflowId: string;
  executionId?: string;
  error?: Error;
  metrics?: {
    errorRate?: number;
    latency?: number;
    memoryUsage?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Rollback Result
 */
export interface RollbackResult {
  success: boolean;
  workflowId: string;
  executionId?: string;
  targetVersion?: string;
  rollbackType: 'partial' | 'full';
  affectedNodes?: string[];
  duration: number;
  timestamp: number;
  error?: string;
}
