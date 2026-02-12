/**
 * Agent Handoff Management
 * Handles context transfer between agents
 */

import { v4 as uuid } from 'uuid';
import type { BaseMessage } from '@langchain/core/messages';
import { type HandoffContext, type Agent } from './types.js';

/**
 * Handoff Manager Class
 */
export class HandoffManager {
  private handoffs: Map<string, HandoffContext>;
  private timeoutDuration: number;

  constructor(timeoutDuration = 30000) { // 30 seconds
    this.handoffs = new Map();
    this.timeoutDuration = timeoutDuration;
  }

  /**
   * Initiate handoff from one agent to another
   */
  async initiateHandoff(
    fromAgent: Agent,
    toAgent: Agent,
    taskId: string,
    context: Record<string, unknown>,
    messages: BaseMessage[],
    reason: string
  ): Promise<HandoffContext> {
    console.log(`[Handoff] Initiating handoff from ${fromAgent.name} to ${toAgent.name}`);

    const handoffContext: HandoffContext = {
      id: uuid(),
      fromAgentId: fromAgent.id,
      toAgentId: toAgent.id,
      taskId,
      context: this.serializeContext(context),
      messages,
      reason,
      status: 'initiated',
      timestamp: Date.now(),
    };

    this.handoffs.set(handoffContext.id, handoffContext);

    // Wait for acknowledgment
    const acknowledged = await this.waitForAcknowledgment(handoffContext.id);

    if (acknowledged) {
      handoffContext.status = 'acknowledged';
      console.log(`[Handoff] Handoff ${handoffContext.id} acknowledged by ${toAgent.name}`);
    } else {
      handoffContext.status = 'failed';
      console.error(`[Handoff] Handoff ${handoffContext.id} timeout`);
    }

    return handoffContext;
  }

  /**
   * Acknowledge handoff
   */
  acknowledgeHandoff(handoffId: string): void {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found`);
    }

    if (handoff.status !== 'initiated') {
      throw new Error(`Handoff ${handoffId} is not in initiated state`);
    }

    handoff.status = 'acknowledged';
    console.log(`[Handoff] Handoff ${handoffId} acknowledged`);
  }

  /**
   * Complete handoff
   */
  completeHandoff(handoffId: string): void {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found`);
    }

    handoff.status = 'completed';
    console.log(`[Handoff] Handoff ${handoffId} completed`);
  }

  /**
   * Rollback failed handoff
   */
  async rollbackHandoff(handoffId: string): Promise<void> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found`);
    }

    console.log(`[Handoff] Rolling back handoff ${handoffId}`);

    handoff.status = 'failed';
    handoff.metadata = {
      ...handoff.metadata,
      rolledBack: true,
      rollbackAt: Date.now(),
    };

    // Context would be restored to original agent
    // This is a placeholder for actual rollback logic
  }

  /**
   * Get handoff context
   */
  getHandoff(handoffId: string): HandoffContext | undefined {
    return this.handoffs.get(handoffId);
  }

  /**
   * Get handoffs for agent
   */
  getHandoffsForAgent(agentId: string): HandoffContext[] {
    return Array.from(this.handoffs.values())
      .filter(h => h.fromAgentId === agentId || h.toAgentId === agentId);
  }

  /**
   * Get handoffs for task
   */
  getHandoffsForTask(taskId: string): HandoffContext[] {
    return Array.from(this.handoffs.values())
      .filter(h => h.taskId === taskId);
  }

  /**
   * Serialize context for transfer
   */
  private serializeContext(context: Record<string, unknown>): Record<string, unknown> {
    // Deep clone context to avoid mutations
    return JSON.parse(JSON.stringify(context));
  }

  /**
   * Deserialize context after transfer
   */
  deserializeContext(handoffId: string): Record<string, unknown> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found`);
    }

    return this.serializeContext(handoff.context);
  }

  /**
   * Wait for handoff acknowledgment
   */
  private async waitForAcknowledgment(handoffId: string): Promise<boolean> {
    const checkInterval = 100;
    const timeout = Date.now() + this.timeoutDuration;

    while (Date.now() < timeout) {
      const handoff = this.handoffs.get(handoffId);
      if (handoff && handoff.status === 'acknowledged') {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * Clean up completed handoffs
   */
  cleanup(): void {
    const cutoff = Date.now() - 3600000; // 1 hour ago
    let deletedCount = 0;

    for (const [id, handoff] of this.handoffs) {
      if (handoff.status === 'completed' && handoff.timestamp < cutoff) {
        this.handoffs.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Handoff] Cleaned up ${deletedCount} completed handoffs`);
    }
  }
}

/**
 * Create a handoff manager
 */
export function createHandoffManager(timeoutDuration?: number): HandoffManager {
  return new HandoffManager(timeoutDuration);
}
