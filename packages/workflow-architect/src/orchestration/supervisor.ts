/**
 * Supervisor Agent
 * Monitors team health and intervenes when necessary
 */

import { v4 as uuid } from 'uuid';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  type Agent,
  type Alert,
  type AgentTeam,
  AgentStatus,
} from './types.js';

/**
 * Intervention action types
 */
export enum InterventionAction {
  RESTART_AGENT = 'restart_agent',
  REASSIGN_TASK = 'reassign_task',
  SCALE_UP = 'scale_up',
  SCALE_DOWN = 'scale_down',
  ALERT_ADMIN = 'alert_admin',
}

/**
 * Performance metrics for agent
 */
export interface AgentPerformance {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  averageLatency: number;
  successRate: number;
  uptime: number;
  lastActive: number;
}

/**
 * Supervisor Class
 */
export class Supervisor {
  private model: BaseChatModel;
  private teamId: string;
  private alerts: Alert[];
  private performance: Map<string, AgentPerformance>;
  private heartbeatInterval: number;
  private heartbeatThreshold: number;

  constructor(
    teamId: string,
    model: BaseChatModel,
    options: {
      heartbeatInterval?: number;
      heartbeatThreshold?: number;
    } = {}
  ) {
    this.teamId = teamId;
    this.model = model;
    this.alerts = [];
    this.performance = new Map();
    this.heartbeatInterval = options.heartbeatInterval || 5000;
    this.heartbeatThreshold = options.heartbeatThreshold || 3;
  }

  /**
   * Monitor agents and yield alerts
   */
  async *monitor(agents: Agent[]): AsyncGenerator<Alert> {
    console.log(`[Supervisor] Starting monitoring for ${agents.length} agents`);

    while (true) {
      // Check each agent
      for (const agent of agents) {
        // Check heartbeat
        if (this.isHeartbeatMissed(agent)) {
          yield this.createAlert(
            'error',
            'heartbeat_missed',
            agent.id,
            `Agent ${agent.name} missed heartbeat`
          );
        }

        // Check status
        if (agent.status === AgentStatus.ERROR) {
          yield this.createAlert(
            'critical',
            'agent_error',
            agent.id,
            `Agent ${agent.name} is in error state`
          );
        }

        // Check workload
        if (agent.workload > 0.9) {
          yield this.createAlert(
            'warning',
            'high_workload',
            agent.id,
            `Agent ${agent.name} has high workload (${(agent.workload * 100).toFixed(1)}%)`
          );
        }

        // Check performance
        const perf = this.performance.get(agent.id);
        if (perf && perf.successRate < 0.5) {
          yield this.createAlert(
            'warning',
            'low_success_rate',
            agent.id,
            `Agent ${agent.name} has low success rate (${(perf.successRate * 100).toFixed(1)}%)`
          );
        }
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, this.heartbeatInterval));
    }
  }

  /**
   * Intervene on agent issue
   */
  async intervene(agentId: string, action: InterventionAction): Promise<void> {
    console.log(`[Supervisor] Intervening on agent ${agentId}: ${action}`);

    switch (action) {
      case InterventionAction.RESTART_AGENT:
        await this.restartAgent(agentId);
        break;

      case InterventionAction.REASSIGN_TASK:
        // Task reassignment would be handled by coordinator
        console.log(`[Supervisor] Requesting task reassignment for agent ${agentId}`);
        break;

      case InterventionAction.SCALE_UP:
        console.log(`[Supervisor] Requesting team scale up`);
        break;

      case InterventionAction.SCALE_DOWN:
        console.log(`[Supervisor] Requesting team scale down`);
        break;

      case InterventionAction.ALERT_ADMIN:
        await this.escalate({
          agentId,
          action,
          timestamp: Date.now(),
        });
        break;
    }
  }

  /**
   * Escalate issue to admin
   */
  async escalate(issue: Record<string, unknown>): Promise<void> {
    console.log(`[Supervisor] Escalating issue:`, issue);

    const alert = this.createAlert(
      'critical',
      'escalation',
      issue.agentId as string,
      `Issue escalated: ${JSON.stringify(issue)}`
    );

    this.alerts.push(alert);

    // In production, this would notify admins via email, Slack, etc.
  }

  /**
   * Update agent performance metrics
   */
  updatePerformance(
    agentId: string,
    metrics: Partial<AgentPerformance>
  ): void {
    const existing = this.performance.get(agentId) || {
      agentId,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageLatency: 0,
      successRate: 1,
      uptime: 0,
      lastActive: Date.now(),
    };

    this.performance.set(agentId, {
      ...existing,
      ...metrics,
    });
  }

  /**
   * Get agent performance
   */
  getPerformance(agentId: string): AgentPerformance | undefined {
    return this.performance.get(agentId);
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Clear resolved alerts
   */
  clearResolvedAlerts(): void {
    this.alerts = this.alerts.filter(a => !a.resolvedAt);
  }

  /**
   * Create an alert
   */
  private createAlert(
    severity: Alert['severity'],
    type: string,
    agentId: string | undefined,
    message: string
  ): Alert {
    const alert: Alert = {
      id: uuid(),
      severity,
      type,
      agentId,
      teamId: this.teamId,
      message,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);
    return alert;
  }

  /**
   * Check if agent missed heartbeat
   */
  private isHeartbeatMissed(agent: Agent): boolean {
    if (!agent.lastHeartbeat) {
      return false;
    }

    const elapsed = Date.now() - agent.lastHeartbeat;
    const threshold = this.heartbeatInterval * this.heartbeatThreshold;

    return elapsed > threshold;
  }

  /**
   * Restart agent (placeholder)
   */
  private async restartAgent(agentId: string): Promise<void> {
    console.log(`[Supervisor] Restarting agent ${agentId}`);
    // This would restart the agent process/container
  }

  /**
   * Calculate team health score
   */
  calculateTeamHealth(agents: Agent[]): number {
    if (agents.length === 0) {
      return 0;
    }

    let healthScore = 0;

    for (const agent of agents) {
      let agentScore = 1.0;

      // Status penalties
      if (agent.status === AgentStatus.OFFLINE) agentScore -= 1.0;
      if (agent.status === AgentStatus.ERROR) agentScore -= 0.8;

      // Workload penalties
      if (agent.workload > 0.9) agentScore -= 0.2;

      // Performance penalties
      const perf = this.performance.get(agent.id);
      if (perf && perf.successRate < 0.7) {
        agentScore -= (1 - perf.successRate) * 0.5;
      }

      healthScore += Math.max(0, agentScore);
    }

    return healthScore / agents.length;
  }
}

/**
 * Create a supervisor instance
 */
export function createSupervisor(
  teamId: string,
  model: BaseChatModel,
  options?: {
    heartbeatInterval?: number;
    heartbeatThreshold?: number;
  }
): Supervisor {
  return new Supervisor(teamId, model, options);
}
