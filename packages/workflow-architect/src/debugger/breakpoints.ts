/**
 * Breakpoint Manager
 * Manages breakpoints and conditional breakpoint evaluation
 */

import { v4 as uuidv4 } from 'uuid';
import { JSONPath } from 'jsonpath-plus';
import type {
  Breakpoint,
  CreateBreakpointInput,
  BreakpointType,
} from './types.js';
import { DebugManager } from './manager.js';

export class BreakpointManager {
  constructor(private debugManager: DebugManager) {}

  /**
   * Add a breakpoint to a session
   */
  async addBreakpoint(
    sessionId: string,
    input: CreateBreakpointInput,
  ): Promise<Breakpoint> {
    const now = new Date().toISOString();

    const breakpoint: Breakpoint = {
      id: uuidv4(),
      nodeId: input.nodeId,
      type: input.type,
      condition: input.condition,
      enabled: input.enabled,
      hitCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Validate condition if provided
    if (breakpoint.condition) {
      this.validateCondition(breakpoint.condition);
    }

    // Add to session
    await this.debugManager.addBreakpoint(sessionId, breakpoint);

    return breakpoint;
  }

  /**
   * Remove a breakpoint
   */
  async removeBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    await this.debugManager.removeBreakpoint(sessionId, breakpointId);
  }

  /**
   * Enable a breakpoint
   */
  async enableBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const breakpoint = session.breakpoints.find((bp) => bp.id === breakpointId);

    if (!breakpoint) {
      throw new Error(`Breakpoint not found: ${breakpointId}`);
    }

    breakpoint.enabled = true;
    breakpoint.updatedAt = new Date().toISOString();

    await this.debugManager.updateBreakpoints(sessionId, session.breakpoints);
  }

  /**
   * Disable a breakpoint
   */
  async disableBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const breakpoint = session.breakpoints.find((bp) => bp.id === breakpointId);

    if (!breakpoint) {
      throw new Error(`Breakpoint not found: ${breakpointId}`);
    }

    breakpoint.enabled = false;
    breakpoint.updatedAt = new Date().toISOString();

    await this.debugManager.updateBreakpoints(sessionId, session.breakpoints);
  }

  /**
   * Toggle a breakpoint
   */
  async toggleBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const breakpoint = session.breakpoints.find((bp) => bp.id === breakpointId);

    if (!breakpoint) {
      throw new Error(`Breakpoint not found: ${breakpointId}`);
    }

    breakpoint.enabled = !breakpoint.enabled;
    breakpoint.updatedAt = new Date().toISOString();

    await this.debugManager.updateBreakpoints(sessionId, session.breakpoints);
  }

  /**
   * Check if execution should break at a node
   */
  async shouldBreak(
    sessionId: string,
    nodeId: string,
    type: BreakpointType,
    data?: unknown,
  ): Promise<Breakpoint | null> {
    const session = await this.debugManager.getSession(sessionId);

    // Find matching breakpoints
    const matchingBreakpoints = session.breakpoints.filter(
      (bp) => bp.enabled && bp.nodeId === nodeId && bp.type === type,
    );

    for (const breakpoint of matchingBreakpoints) {
      // Check condition if present
      if (breakpoint.condition) {
        const shouldBreak = await this.evaluateCondition(breakpoint.condition, data);
        if (!shouldBreak) {
          continue;
        }
      }

      // Increment hit count
      breakpoint.hitCount++;
      breakpoint.updatedAt = new Date().toISOString();
      await this.debugManager.updateBreakpoints(sessionId, session.breakpoints);

      return breakpoint;
    }

    return null;
  }

  /**
   * List all breakpoints for a session
   */
  async listBreakpoints(sessionId: string): Promise<Breakpoint[]> {
    const session = await this.debugManager.getSession(sessionId);
    return session.breakpoints;
  }

  /**
   * Clear all breakpoints
   */
  async clearAllBreakpoints(sessionId: string): Promise<void> {
    await this.debugManager.updateBreakpoints(sessionId, []);
  }

  /**
   * Clear breakpoints for a specific node
   */
  async clearNodeBreakpoints(sessionId: string, nodeId: string): Promise<void> {
    const session = await this.debugManager.getSession(sessionId);
    const filtered = session.breakpoints.filter((bp) => bp.nodeId !== nodeId);
    await this.debugManager.updateBreakpoints(sessionId, filtered);
  }

  /**
   * Validate a condition expression
   */
  private validateCondition(condition: string): void {
    // Basic validation - check if it looks like a valid expression
    if (!condition.trim()) {
      throw new Error('Condition cannot be empty');
    }

    // Check for dangerous patterns
    const dangerous = ['eval(', 'Function(', 'require(', 'import('];
    for (const pattern of dangerous) {
      if (condition.includes(pattern)) {
        throw new Error(`Dangerous pattern not allowed in condition: ${pattern}`);
      }
    }

    // Try to parse as JSONPath if it starts with $
    if (condition.startsWith('$')) {
      try {
        JSONPath({ path: condition, json: {} });
      } catch (error) {
        throw new Error(`Invalid JSONPath expression: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Evaluate a condition expression
   */
  private async evaluateCondition(condition: string, data: unknown): Promise<boolean> {
    try {
      // JSONPath expressions
      if (condition.startsWith('$')) {
        const result = JSONPath({ path: condition, json: data });
        return result.length > 0;
      }

      // Simple comparison expressions
      if (condition.includes('>') || condition.includes('<') || condition.includes('==') || condition.includes('!=')) {
        return this.evaluateComparison(condition, data);
      }

      // Property existence check
      if (condition.includes('.')) {
        const parts = condition.split('.');
        let current: unknown = data;
        for (const part of parts) {
          if (current === null || current === undefined) {
            return false;
          }
          current = (current as Record<string, unknown>)[part];
        }
        return current !== undefined && current !== null;
      }

      return false;
    } catch (error) {
      console.error('Failed to evaluate condition:', error);
      return false;
    }
  }

  /**
   * Evaluate comparison expressions
   */
  private evaluateComparison(condition: string, data: unknown): boolean {
    // Extract operator
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    let operator = '';
    for (const op of operators) {
      if (condition.includes(op)) {
        operator = op;
        break;
      }
    }

    if (!operator) {
      return false;
    }

    const [left, right] = condition.split(operator).map((s) => s.trim());

    // Get left value (JSONPath or property access)
    let leftValue: unknown;
    if (left.startsWith('$')) {
      const result = JSONPath({ path: left, json: data });
      leftValue = result[0];
    } else {
      leftValue = this.getPropertyValue(left, data);
    }

    // Parse right value (number or string)
    let rightValue: unknown = right;
    if (!isNaN(Number(right))) {
      rightValue = Number(right);
    } else if (right.startsWith('"') && right.endsWith('"')) {
      rightValue = right.slice(1, -1);
    }

    // Perform comparison
    switch (operator) {
      case '>':
        return Number(leftValue) > Number(rightValue);
      case '<':
        return Number(leftValue) < Number(rightValue);
      case '>=':
        return Number(leftValue) >= Number(rightValue);
      case '<=':
        return Number(leftValue) <= Number(rightValue);
      case '==':
        return leftValue == rightValue;
      case '!=':
        return leftValue != rightValue;
      default:
        return false;
    }
  }

  /**
   * Get property value from data object
   */
  private getPropertyValue(path: string, data: unknown): unknown {
    const parts = path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

/**
 * Create a breakpoint manager instance
 */
export function createBreakpointManager(debugManager: DebugManager): BreakpointManager {
  return new BreakpointManager(debugManager);
}
