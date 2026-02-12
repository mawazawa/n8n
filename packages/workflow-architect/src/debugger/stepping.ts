/**
 * Step Controller
 * Controls step-through execution debugging
 */

import { v4 as uuidv4 } from 'uuid';
import type { StepResult, StackFrame } from './types.js';
import { DebugManager } from './manager.js';
import { BreakpointManager } from './breakpoints.js';

export class StepController {
  constructor(
    private debugManager: DebugManager,
    private breakpointManager: BreakpointManager,
  ) {}

  /**
   * Step into next node (goes into sub-workflows)
   */
  async stepInto(sessionId: string): Promise<StepResult> {
    const session = await this.debugManager.getSession(sessionId);

    if (session.status !== 'PAUSED' && session.status !== 'RUNNING') {
      throw new Error(`Cannot step: session is ${session.status}`);
    }

    // Resume execution for one step
    await this.debugManager.resumeSession(sessionId);

    // Get the next node to execute
    const nextNode = await this.getNextNode(sessionId);

    if (!nextNode) {
      // Execution completed
      await this.debugManager.updateSessionStatus(sessionId, 'COMPLETED');
      const currentFrame = await this.debugManager.getCurrentFrame(sessionId);

      return {
        sessionId,
        currentNodeId: session.currentNodeId || '',
        frame: currentFrame || this.createEmptyFrame(),
        completed: true,
      };
    }

    // Execute the node and capture result
    const frame = await this.executeNode(sessionId, nextNode);

    // Check for breakpoints
    const breakpoint = await this.breakpointManager.shouldBreak(
      sessionId,
      nextNode.id,
      'NODE_EXIT',
      frame.output,
    );

    if (breakpoint) {
      await this.debugManager.pauseSession(sessionId);

      return {
        sessionId,
        currentNodeId: nextNode.id,
        previousNodeId: session.currentNodeId,
        frame,
        breakpointHit: breakpoint,
        completed: false,
      };
    }

    // Pause after step
    await this.debugManager.pauseSession(sessionId);

    return {
      sessionId,
      currentNodeId: nextNode.id,
      previousNodeId: session.currentNodeId,
      frame,
      completed: false,
    };
  }

  /**
   * Step over next node (skips sub-workflows)
   */
  async stepOver(sessionId: string): Promise<StepResult> {
    const session = await this.debugManager.getSession(sessionId);

    if (session.status !== 'PAUSED' && session.status !== 'RUNNING') {
      throw new Error(`Cannot step: session is ${session.status}`);
    }

    const currentDepth = session.stack.length;

    // Resume and execute until we return to same or lower depth
    await this.debugManager.resumeSession(sessionId);

    let result: StepResult;
    do {
      result = await this.stepInto(sessionId);
      const newSession = await this.debugManager.getSession(sessionId);

      // If we've returned to same depth or lower, stop
      if (newSession.stack.length <= currentDepth) {
        break;
      }

      // If completed, stop
      if (result.completed) {
        break;
      }

      // Continue if we're deeper in the stack
      if (!result.breakpointHit) {
        await this.debugManager.resumeSession(sessionId);
      } else {
        // Hit a breakpoint, stop here
        break;
      }
    } while (true);

    return result;
  }

  /**
   * Step out of current context (complete current sub-workflow)
   */
  async stepOut(sessionId: string): Promise<StepResult> {
    const session = await this.debugManager.getSession(sessionId);

    if (session.status !== 'PAUSED' && session.status !== 'RUNNING') {
      throw new Error(`Cannot step: session is ${session.status}`);
    }

    const currentDepth = session.stack.length;

    if (currentDepth === 0) {
      throw new Error('Cannot step out: no parent context');
    }

    // Resume and execute until we're one level up
    await this.debugManager.resumeSession(sessionId);

    let result: StepResult;
    do {
      result = await this.stepInto(sessionId);
      const newSession = await this.debugManager.getSession(sessionId);

      // If we've popped a level, stop
      if (newSession.stack.length < currentDepth) {
        break;
      }

      // If completed, stop
      if (result.completed) {
        break;
      }

      // Continue if still at same depth or deeper
      if (!result.breakpointHit) {
        await this.debugManager.resumeSession(sessionId);
      } else {
        // Hit a breakpoint, stop here
        break;
      }
    } while (true);

    return result;
  }

  /**
   * Run until next breakpoint
   */
  async runToBreakpoint(sessionId: string): Promise<StepResult> {
    const session = await this.debugManager.getSession(sessionId);

    if (session.status !== 'PAUSED' && session.status !== 'RUNNING') {
      throw new Error(`Cannot run: session is ${session.status}`);
    }

    await this.debugManager.resumeSession(sessionId);

    let result: StepResult;
    let iterations = 0;
    const maxIterations = 10000; // Prevent infinite loops

    do {
      result = await this.stepInto(sessionId);

      if (result.breakpointHit || result.completed) {
        break;
      }

      // Continue execution
      await this.debugManager.resumeSession(sessionId);

      iterations++;
      if (iterations >= maxIterations) {
        await this.debugManager.pauseSession(sessionId);
        throw new Error('Maximum iteration limit reached');
      }
    } while (true);

    return result;
  }

  /**
   * Get the next node to execute
   */
  private async getNextNode(sessionId: string): Promise<{ id: string; name: string; type: string } | null> {
    const session = await this.debugManager.getSession(sessionId);

    // This is a simplified implementation
    // In a real implementation, this would use the workflow graph
    // to determine the next node based on connections and execution flow

    // For now, we'll return a mock next node
    // This should be replaced with actual workflow traversal logic

    if (!session.currentNodeId) {
      // Start from the first node
      return {
        id: 'node-1',
        name: 'Start',
        type: 'n8n-nodes-base.start',
      };
    }

    // Return null to indicate completion (simplified)
    return null;
  }

  /**
   * Execute a node and capture its result
   */
  private async executeNode(
    sessionId: string,
    node: { id: string; name: string; type: string },
  ): Promise<StackFrame> {
    const startTime = Date.now();

    // This is a simplified implementation
    // In a real implementation, this would actually execute the node
    // using the n8n execution engine

    // Mock execution
    const input = { data: { message: 'test' } };
    const output = { data: { result: 'processed' } };

    const endTime = Date.now();
    const duration = endTime - startTime;

    const frame: StackFrame = {
      id: uuidv4(),
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      input,
      output,
      timestamp: startTime,
      duration,
    };

    // Add to stack
    await this.debugManager.pushStackFrame(sessionId, frame);

    return frame;
  }

  /**
   * Create an empty frame for completed execution
   */
  private createEmptyFrame(): StackFrame {
    return {
      id: uuidv4(),
      nodeId: '',
      nodeName: '',
      nodeType: '',
      timestamp: Date.now(),
    };
  }

  /**
   * Get current execution position
   */
  async getCurrentPosition(sessionId: string): Promise<{
    nodeId: string | undefined;
    stackDepth: number;
    frame: StackFrame | undefined;
  }> {
    const session = await this.debugManager.getSession(sessionId);
    const frame = await this.debugManager.getCurrentFrame(sessionId);

    return {
      nodeId: session.currentNodeId,
      stackDepth: session.stack.length,
      frame,
    };
  }

  /**
   * Check if execution can step
   */
  async canStep(sessionId: string): Promise<boolean> {
    const session = await this.debugManager.getSession(sessionId);
    return session.status === 'PAUSED' || session.status === 'RUNNING';
  }
}

/**
 * Create a step controller instance
 */
export function createStepController(
  debugManager: DebugManager,
  breakpointManager: BreakpointManager,
): StepController {
  return new StepController(debugManager, breakpointManager);
}
