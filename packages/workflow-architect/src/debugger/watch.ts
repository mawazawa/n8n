/**
 * Watch Manager
 * Manages variable watch expressions with JSONPath support
 */

import { v4 as uuidv4 } from 'uuid';
import { JSONPath } from 'jsonpath-plus';
import type { WatchExpression, CreateWatchInput } from './types.js';
import { DebugManager } from './manager.js';

export class WatchManager {
  constructor(private debugManager: DebugManager) {}

  /**
   * Add a watch expression
   */
  async addWatch(sessionId: string, input: CreateWatchInput): Promise<WatchExpression> {
    const now = new Date().toISOString();

    // Validate expression
    this.validateExpression(input.expression);

    const watch: WatchExpression = {
      id: uuidv4(),
      sessionId,
      expression: input.expression,
      nodeId: input.nodeId,
      autoRefresh: input.autoRefresh,
      createdAt: now,
      updatedAt: now,
    };

    // Get current session
    const session = await this.debugManager.getSession(sessionId);
    const watches = session.watches || [];
    watches.push(watch);

    // Update session
    await this.debugManager.updateWatches(sessionId, watches);

    // Evaluate immediately if there's current data
    const frame = await this.debugManager.getCurrentFrame(sessionId);
    if (frame) {
      await this.evaluateWatch(sessionId, watch.id);
    }

    return watch;
  }

  /**
   * Remove a watch expression
   */
  async removeWatch(sessionId: string, watchId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const watches = (session.watches || []).filter((w) => w.id !== watchId);
    await this.debugManager.updateWatches(sessionId, watches);
  }

  /**
   * Evaluate a watch expression
   */
  async evaluateWatch(sessionId: string, watchId: string): Promise<unknown> {
    const session = await this.debugManager.getSession(sessionId);
    const watch = (session.watches || []).find((w) => w.id === watchId);

    if (!watch) {
      throw new Error(`Watch not found: ${watchId}`);
    }

    // Get current frame
    const frame = await this.debugManager.getCurrentFrame(sessionId);
    if (!frame) {
      watch.value = undefined;
      watch.error = 'No active execution frame';
      watch.updatedAt = new Date().toISOString();
      await this.debugManager.updateWatches(sessionId, session.watches || []);
      return undefined;
    }

    // If watch is scoped to a specific node, check if we're at that node
    if (watch.nodeId && watch.nodeId !== frame.nodeId) {
      watch.value = undefined;
      watch.error = `Not at node ${watch.nodeId}`;
      watch.updatedAt = new Date().toISOString();
      await this.debugManager.updateWatches(sessionId, session.watches || []);
      return undefined;
    }

    try {
      // Get the data to evaluate against (use output if available, otherwise input)
      const data = frame.output || frame.input || {};

      // Evaluate the expression
      const value = this.evaluateExpression(watch.expression, data);

      watch.value = value;
      watch.error = undefined;
      watch.updatedAt = new Date().toISOString();
    } catch (error) {
      watch.value = undefined;
      watch.error = error instanceof Error ? error.message : String(error);
      watch.updatedAt = new Date().toISOString();
    }

    // Update session
    await this.debugManager.updateWatches(sessionId, session.watches || []);

    return watch.value;
  }

  /**
   * Evaluate all watches
   */
  async evaluateAllWatches(sessionId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const watches = session.watches || [];

    for (const watch of watches) {
      if (watch.autoRefresh) {
        await this.evaluateWatch(sessionId, watch.id);
      }
    }
  }

  /**
   * Get all watches for a session
   */
  async listWatches(sessionId: string): Promise<WatchExpression[]> {
    const session = await this.debugManager.getSession(sessionId);
    return session.watches || [];
  }

  /**
   * Clear all watches
   */
  async clearAllWatches(sessionId: string): Promise<void> {
    await this.debugManager.updateWatches(sessionId, []);
  }

  /**
   * Update watch expression
   */
  async updateWatch(
    sessionId: string,
    watchId: string,
    updates: { expression?: string; autoRefresh?: boolean },
  ): Promise<WatchExpression> {
    const session = await this.debugManager.getSession(sessionId);
    const watch = (session.watches || []).find((w) => w.id === watchId);

    if (!watch) {
      throw new Error(`Watch not found: ${watchId}`);
    }

    if (updates.expression !== undefined) {
      this.validateExpression(updates.expression);
      watch.expression = updates.expression;
    }

    if (updates.autoRefresh !== undefined) {
      watch.autoRefresh = updates.autoRefresh;
    }

    watch.updatedAt = new Date().toISOString();

    await this.debugManager.updateWatches(sessionId, session.watches || []);

    // Re-evaluate if expression changed
    if (updates.expression !== undefined) {
      await this.evaluateWatch(sessionId, watchId);
    }

    return watch;
  }

  /**
   * Validate a watch expression
   */
  private validateExpression(expression: string): void {
    if (!expression.trim()) {
      throw new Error('Expression cannot be empty');
    }

    // Check for dangerous patterns
    const dangerous = ['eval(', 'Function(', 'require(', 'import(', '__proto__', 'constructor'];
    for (const pattern of dangerous) {
      if (expression.includes(pattern)) {
        throw new Error(`Dangerous pattern not allowed in expression: ${pattern}`);
      }
    }

    // If it's a JSONPath expression, validate syntax
    if (expression.startsWith('$')) {
      try {
        JSONPath({ path: expression, json: {} });
      } catch (error) {
        throw new Error(`Invalid JSONPath expression: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Evaluate an expression against data
   */
  private evaluateExpression(expression: string, data: unknown): unknown {
    // JSONPath expressions
    if (expression.startsWith('$')) {
      const result = JSONPath({ path: expression, json: data });
      return result.length === 1 ? result[0] : result;
    }

    // Simple property access (e.g., "data.user.email")
    if (expression.includes('.')) {
      return this.getPropertyValue(expression, data);
    }

    // Direct property access
    return (data as Record<string, unknown>)[expression];
  }

  /**
   * Get property value using dot notation
   */
  private getPropertyValue(path: string, data: unknown): unknown {
    const parts = path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array indexing
      if (part.includes('[') && part.includes(']')) {
        const [prop, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);

        if (prop) {
          current = (current as Record<string, unknown>)[prop];
        }

        if (Array.isArray(current)) {
          current = current[index];
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Format watch value for display
   */
  formatWatchValue(watch: WatchExpression): string {
    if (watch.error) {
      return `Error: ${watch.error}`;
    }

    if (watch.value === undefined) {
      return 'undefined';
    }

    if (watch.value === null) {
      return 'null';
    }

    // Truncate long values
    const str = typeof watch.value === 'string'
      ? watch.value
      : JSON.stringify(watch.value, null, 2);

    if (str.length > 200) {
      return str.substring(0, 200) + '...';
    }

    return str;
  }
}

/**
 * Create a watch manager instance
 */
export function createWatchManager(debugManager: DebugManager): WatchManager {
  return new WatchManager(debugManager);
}
