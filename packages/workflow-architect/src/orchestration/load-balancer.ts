/**
 * Load Balancer
 * Distributes workload across agents using various strategies
 */

import { type Agent, type Task, AgentStatus } from './types.js';

/**
 * Load balancing strategy
 */
export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round-robin',
  LEAST_BUSY = 'least-busy',
  CAPABILITY_BASED = 'capability-based',
  RANDOM = 'random',
  WEIGHTED = 'weighted',
}

/**
 * Agent capacity info
 */
export interface AgentCapacity {
  agentId: string;
  currentTasks: number;
  maxTasks: number;
  workload: number;
  available: boolean;
}

/**
 * Load Balancer Class
 */
export class LoadBalancer {
  private strategy: LoadBalancingStrategy;
  private roundRobinIndex: number;
  private agentCapacity: Map<string, AgentCapacity>;

  constructor(strategy: LoadBalancingStrategy = LoadBalancingStrategy.LEAST_BUSY) {
    this.strategy = strategy;
    this.roundRobinIndex = 0;
    this.agentCapacity = new Map();
  }

  /**
   * Assign task to an agent
   */
  async assign(task: Task, agents: Agent[]): Promise<Agent> {
    const availableAgents = this.getAvailableAgents(agents);

    if (availableAgents.length === 0) {
      throw new Error('No available agents for task assignment');
    }

    let selectedAgent: Agent;

    switch (this.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        selectedAgent = this.roundRobin(availableAgents);
        break;

      case LoadBalancingStrategy.LEAST_BUSY:
        selectedAgent = this.leastBusy(availableAgents);
        break;

      case LoadBalancingStrategy.CAPABILITY_BASED:
        selectedAgent = this.capabilityBased(task, availableAgents);
        break;

      case LoadBalancingStrategy.RANDOM:
        selectedAgent = this.random(availableAgents);
        break;

      case LoadBalancingStrategy.WEIGHTED:
        selectedAgent = this.weighted(availableAgents);
        break;

      default:
        selectedAgent = this.leastBusy(availableAgents);
    }

    // Update capacity
    this.incrementWorkload(selectedAgent.id);

    console.log(`[LoadBalancer] Assigned task ${task.name} to agent ${selectedAgent.name} using ${this.strategy}`);

    return selectedAgent;
  }

  /**
   * Round-robin assignment
   */
  private roundRobin(agents: Agent[]): Agent {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;
    return agent;
  }

  /**
   * Least busy assignment
   */
  private leastBusy(agents: Agent[]): Agent {
    return agents.reduce((min, agent) =>
      agent.workload < min.workload ? agent : min
    );
  }

  /**
   * Capability-based assignment
   */
  private capabilityBased(task: Task, agents: Agent[]): Agent {
    // Score agents based on capability match
    const scored = agents.map(agent => ({
      agent,
      score: this.scoreCapabilityMatch(task, agent),
    }));

    // Sort by score (highest first), then by workload (lowest first)
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.agent.workload - b.agent.workload;
    });

    return scored[0].agent;
  }

  /**
   * Random assignment
   */
  private random(agents: Agent[]): Agent {
    const index = Math.floor(Math.random() * agents.length);
    return agents[index];
  }

  /**
   * Weighted assignment (based on performance)
   */
  private weighted(agents: Agent[]): Agent {
    // Agents with better performance get more weight
    const weights = agents.map(agent => {
      const perf = agent.capabilities.metrics;
      return perf ? perf.successRate * (1 - agent.workload) : 1 - agent.workload;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < agents.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return agents[i];
      }
    }

    return agents[agents.length - 1];
  }

  /**
   * Score capability match
   */
  private scoreCapabilityMatch(task: Task, agent: Agent): number {
    let score = 0;

    if (!task.requiredCapabilities) {
      return 1;
    }

    const agentSkills = new Set([
      ...agent.capabilities.skills,
      ...agent.capabilities.specializations,
    ]);

    for (const cap of task.requiredCapabilities) {
      if (agentSkills.has(cap)) {
        score += 1;
      }
    }

    return score;
  }

  /**
   * Get available agents
   */
  private getAvailableAgents(agents: Agent[]): Agent[] {
    return agents.filter(agent =>
      agent.status === AgentStatus.IDLE &&
      agent.workload < 1.0
    );
  }

  /**
   * Track agent capacity
   */
  updateCapacity(agentId: string, currentTasks: number, maxTasks: number): void {
    this.agentCapacity.set(agentId, {
      agentId,
      currentTasks,
      maxTasks,
      workload: currentTasks / maxTasks,
      available: currentTasks < maxTasks,
    });
  }

  /**
   * Get agent capacity
   */
  getCapacity(agentId: string): AgentCapacity | undefined {
    return this.agentCapacity.get(agentId);
  }

  /**
   * Increment agent workload
   */
  incrementWorkload(agentId: string): void {
    const capacity = this.agentCapacity.get(agentId);
    if (capacity) {
      capacity.currentTasks++;
      capacity.workload = capacity.currentTasks / capacity.maxTasks;
      capacity.available = capacity.currentTasks < capacity.maxTasks;
    }
  }

  /**
   * Decrement agent workload
   */
  decrementWorkload(agentId: string): void {
    const capacity = this.agentCapacity.get(agentId);
    if (capacity && capacity.currentTasks > 0) {
      capacity.currentTasks--;
      capacity.workload = capacity.currentTasks / capacity.maxTasks;
      capacity.available = capacity.currentTasks < capacity.maxTasks;
    }
  }

  /**
   * Dynamic rebalancing
   */
  async rebalance(agents: Agent[], tasks: Task[]): Promise<Map<string, Task[]>> {
    console.log(`[LoadBalancer] Rebalancing ${tasks.length} tasks across ${agents.length} agents`);

    const assignments = new Map<string, Task[]>();

    // Reset assignments
    for (const agent of agents) {
      assignments.set(agent.id, []);
    }

    // Reassign tasks
    for (const task of tasks) {
      const agent = await this.assign(task, agents);
      const agentTasks = assignments.get(agent.id) || [];
      agentTasks.push(task);
      assignments.set(agent.id, agentTasks);
    }

    return assignments;
  }

  /**
   * Get load statistics
   */
  getLoadStats(agents: Agent[]): {
    averageLoad: number;
    minLoad: number;
    maxLoad: number;
    imbalance: number;
  } {
    if (agents.length === 0) {
      return { averageLoad: 0, minLoad: 0, maxLoad: 0, imbalance: 0 };
    }

    const loads = agents.map(a => a.workload);
    const sum = loads.reduce((a, b) => a + b, 0);
    const avg = sum / agents.length;
    const min = Math.min(...loads);
    const max = Math.max(...loads);
    const imbalance = max - min;

    return {
      averageLoad: avg,
      minLoad: min,
      maxLoad: max,
      imbalance,
    };
  }

  /**
   * Set strategy
   */
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.strategy = strategy;
    console.log(`[LoadBalancer] Strategy changed to ${strategy}`);
  }

  /**
   * Get current strategy
   */
  getStrategy(): LoadBalancingStrategy {
    return this.strategy;
  }
}

/**
 * Create a load balancer
 */
export function createLoadBalancer(strategy?: LoadBalancingStrategy): LoadBalancer {
  return new LoadBalancer(strategy);
}
