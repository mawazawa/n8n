/**
 * Failover Manager
 * Handles agent failures and task reassignment
 */

import { type Agent, type Task, type TaskAssignment, AgentStatus, TaskStatus } from './types.js';

/**
 * Health check result
 */
export interface HealthCheck {
  agentId: string;
  healthy: boolean;
  latency: number;
  timestamp: number;
  error?: string;
}

/**
 * Failover Manager Class
 */
export class FailoverManager {
  private healthChecks: Map<string, HealthCheck[]>;
  private failureThreshold: number;
  private healthCheckInterval: number;
  private healthCheckTimeout: number;

  constructor(options: {
    failureThreshold?: number;
    healthCheckInterval?: number;
    healthCheckTimeout?: number;
  } = {}) {
    this.healthChecks = new Map();
    this.failureThreshold = options.failureThreshold || 3;
    this.healthCheckInterval = options.healthCheckInterval || 5000;
    this.healthCheckTimeout = options.healthCheckTimeout || 2000;
  }

  /**
   * Detect if agent has failed
   */
  async detectFailure(agent: Agent): Promise<boolean> {
    const checks = this.healthChecks.get(agent.id) || [];

    // Check status
    if (agent.status === AgentStatus.OFFLINE || agent.status === AgentStatus.ERROR) {
      return true;
    }

    // Check heartbeat
    if (agent.lastHeartbeat) {
      const elapsed = Date.now() - agent.lastHeartbeat;
      if (elapsed > this.healthCheckInterval * this.failureThreshold) {
        console.log(`[Failover] Agent ${agent.name} failed heartbeat check`);
        return true;
      }
    }

    // Check recent health checks
    const recentChecks = checks.slice(-this.failureThreshold);
    if (recentChecks.length >= this.failureThreshold) {
      const failedChecks = recentChecks.filter(c => !c.healthy).length;
      if (failedChecks >= this.failureThreshold) {
        console.log(`[Failover] Agent ${agent.name} failed ${failedChecks} health checks`);
        return true;
      }
    }

    return false;
  }

  /**
   * Perform health check on agent
   */
  async performHealthCheck(agent: Agent): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simulate health check (in production, this would ping the agent)
      await this.pingAgent(agent);

      const check: HealthCheck = {
        agentId: agent.id,
        healthy: true,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };

      this.recordHealthCheck(agent.id, check);
      return check;

    } catch (error) {
      const check: HealthCheck = {
        agentId: agent.id,
        healthy: false,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };

      this.recordHealthCheck(agent.id, check);
      return check;
    }
  }

  /**
   * Reassign tasks from failed agent
   */
  async reassignTasks(
    failedAgent: Agent,
    tasks: Task[],
    availableAgents: Agent[]
  ): Promise<TaskAssignment[]> {
    console.log(`[Failover] Reassigning ${tasks.length} tasks from failed agent ${failedAgent.name}`);

    const assignments: TaskAssignment[] = [];

    for (const task of tasks) {
      // Skip completed or failed tasks
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        continue;
      }

      // Find available agent
      const targetAgent = this.findBestAgent(task, availableAgents);

      if (!targetAgent) {
        console.error(`[Failover] No available agent for task ${task.name}`);
        continue;
      }

      const assignment: TaskAssignment = {
        id: crypto.randomUUID(),
        taskId: task.id,
        agentId: targetAgent.id,
        teamId: '', // Would be set by caller
        assignedAt: Date.now(),
        status: TaskStatus.ASSIGNED,
        retries: 0,
        maxRetries: 3,
        metadata: {
          failover: true,
          originalAgentId: failedAgent.id,
        },
      };

      assignments.push(assignment);
    }

    console.log(`[Failover] Reassigned ${assignments.length} tasks`);
    return assignments;
  }

  /**
   * Handle graceful degradation
   */
  async handleDegradation(
    failedAgents: Agent[],
    remainingAgents: Agent[]
  ): Promise<{
    canContinue: boolean;
    degradedCapacity: number;
    recommendations: string[];
  }> {
    const totalAgents = failedAgents.length + remainingAgents.length;
    const degradedCapacity = remainingAgents.length / totalAgents;

    const recommendations: string[] = [];

    if (degradedCapacity < 0.25) {
      recommendations.push('Critical: Less than 25% capacity remaining');
      recommendations.push('Consider emergency scaling or task postponement');
    } else if (degradedCapacity < 0.5) {
      recommendations.push('Warning: Less than 50% capacity remaining');
      recommendations.push('Consider adding backup agents');
    } else if (degradedCapacity < 0.75) {
      recommendations.push('Reduced capacity: Monitor closely');
    }

    return {
      canContinue: degradedCapacity >= 0.25,
      degradedCapacity,
      recommendations,
    };
  }

  /**
   * Get health check history
   */
  getHealthHistory(agentId: string, limit = 10): HealthCheck[] {
    const checks = this.healthChecks.get(agentId) || [];
    return checks.slice(-limit);
  }

  /**
   * Get agent health score
   */
  getHealthScore(agentId: string): number {
    const checks = this.healthChecks.get(agentId) || [];
    if (checks.length === 0) {
      return 1.0;
    }

    const recentChecks = checks.slice(-10);
    const healthyCount = recentChecks.filter(c => c.healthy).length;

    return healthyCount / recentChecks.length;
  }

  /**
   * Clear health check history
   */
  clearHistory(agentId?: string): void {
    if (agentId) {
      this.healthChecks.delete(agentId);
    } else {
      this.healthChecks.clear();
    }
  }

  /**
   * Record health check
   */
  private recordHealthCheck(agentId: string, check: HealthCheck): void {
    const checks = this.healthChecks.get(agentId) || [];
    checks.push(check);

    // Keep only last 100 checks
    if (checks.length > 100) {
      checks.shift();
    }

    this.healthChecks.set(agentId, checks);
  }

  /**
   * Ping agent (simulated)
   */
  private async pingAgent(agent: Agent): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check if agent is responsive
    if (agent.status === AgentStatus.OFFLINE || agent.status === AgentStatus.ERROR) {
      throw new Error('Agent not responsive');
    }
  }

  /**
   * Find best agent for task reassignment
   */
  private findBestAgent(task: Task, agents: Agent[]): Agent | undefined {
    // Filter agents by availability and capability
    const suitable = agents.filter(agent =>
      agent.status === AgentStatus.IDLE &&
      agent.workload < 1.0 &&
      this.matchesCapabilities(task, agent)
    );

    if (suitable.length === 0) {
      return undefined;
    }

    // Return least busy agent
    return suitable.reduce((min, agent) =>
      agent.workload < min.workload ? agent : min
    );
  }

  /**
   * Check if agent capabilities match task
   */
  private matchesCapabilities(task: Task, agent: Agent): boolean {
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
      return true;
    }

    const agentSkills = new Set([
      ...agent.capabilities.skills,
      ...agent.capabilities.specializations,
    ]);

    return task.requiredCapabilities.some(cap => agentSkills.has(cap));
  }
}

/**
 * Create a failover manager
 */
export function createFailoverManager(options?: {
  failureThreshold?: number;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
}): FailoverManager {
  return new FailoverManager(options);
}
