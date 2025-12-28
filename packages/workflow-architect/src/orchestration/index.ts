/**
 * Multi-Agent Orchestration System
 * Main exports and orchestrator class
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { v4 as uuid } from 'uuid';

// Export all types
export * from './types.js';

// Export team management
export * from './team.js';

// Export core components
export { Coordinator, createCoordinator } from './coordinator.js';
export { TaskPlanner, createPlanner } from './planner.js';
export { ParallelExecutor, createExecutor, simpleTaskExecutor, ExecutionEvent } from './executor.js';
export { MessageBus, createMessageBus } from './communication.js';
export { ConsensusManager, createConsensusManager, VotingStrategy } from './consensus.js';
export { HandoffManager, createHandoffManager } from './handoff.js';
export { Supervisor, createSupervisor, InterventionAction } from './supervisor.js';
export { LoadBalancer, createLoadBalancer, LoadBalancingStrategy } from './load-balancer.js';
export { FailoverManager, createFailoverManager } from './failover.js';
export { MetricsCollector, createMetricsCollector } from './metrics.js';
export { VisualizationBuilder, createVisualizationBuilder } from './visualization.js';

// Export specializations
export * from './specialization.js';

// Export templates
export * from './templates/index.js';

// Export API
export * from './api.js';

// Import types
import type {
  OrchestratorConfig,
  AgentTeam,
  Task,
  ExecutionResult,
  TeamStatus,
  TeamMetrics,
  ProgressUpdate,
  ExecutionPlan,
} from './types.js';
import { createTeam, getTeam, getTeamStatus } from './team.js';
import { createCoordinator } from './coordinator.js';
import { createPlanner } from './planner.js';
import { createExecutor, simpleTaskExecutor } from './executor.js';
import { createMessageBus } from './communication.js';
import { createConsensusManager } from './consensus.js';
import { createHandoffManager } from './handoff.js';
import { createSupervisor } from './supervisor.js';
import { createLoadBalancer } from './load-balancer.js';
import { createFailoverManager } from './failover.js';
import { createMetricsCollector } from './metrics.js';
import { createVisualizationBuilder } from './visualization.js';

/**
 * Main Orchestrator Class
 * Integrates all orchestration components
 */
export class Orchestrator {
  private config: OrchestratorConfig;
  private team: AgentTeam | null;
  private model: BaseChatModel;

  // Components
  private coordinator;
  private planner;
  private executor;
  private messageBus;
  private consensusManager;
  private handoffManager;
  private supervisor;
  private loadBalancer;
  private failoverManager;
  private metricsCollector;
  private visualizationBuilder;

  constructor(config: OrchestratorConfig, model: BaseChatModel) {
    this.config = config;
    this.model = model;
    this.team = null;

    // Initialize components
    this.planner = createPlanner();
    this.messageBus = createMessageBus(config.messageRetention);
    this.consensusManager = createConsensusManager();
    this.handoffManager = createHandoffManager();
    this.loadBalancer = createLoadBalancer(config.assignmentStrategy);
    this.failoverManager = createFailoverManager({
      failureThreshold: config.failureThreshold,
      healthCheckInterval: config.heartbeatInterval,
    });
    this.metricsCollector = createMetricsCollector();
    this.visualizationBuilder = createVisualizationBuilder();

    // These will be initialized when team is created
    this.coordinator = null as any;
    this.supervisor = null as any;
    this.executor = createExecutor({
      maxConcurrency: config.maxConcurrentTasks,
      taskExecutor: simpleTaskExecutor,
    });
  }

  /**
   * Initialize the orchestrator with a team
   */
  async initialize(): Promise<void> {
    console.log('[Orchestrator] Initializing...');

    // Create team
    this.team = await createTeam({
      name: this.config.team.name,
      description: this.config.team.description,
      topology: this.config.team.topology,
      leaderId: this.config.team.leaderId,
      metadata: this.config.team.metadata,
    });

    // Add agents to team
    for (const agent of this.config.team.agents) {
      const { addAgent } = await import('./team.js');
      await addAgent(this.team.id, agent);
    }

    // Initialize coordinator and supervisor
    this.coordinator = createCoordinator(this.team.id, this.model);
    this.supervisor = createSupervisor(this.team.id, this.model, {
      heartbeatInterval: this.config.heartbeatInterval,
      heartbeatThreshold: this.config.failureThreshold,
    });

    console.log(`[Orchestrator] Initialized team "${this.team.name}" with ${this.config.team.agents.length} agents`);
  }

  /**
   * Execute a task
   */
  async execute(task: Task): Promise<ExecutionResult> {
    if (!this.team) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    console.log(`[Orchestrator] Executing task: ${task.name}`);

    // Decompose task
    const tasks = await this.planner.decompose(task);

    // Create dependency graph and execution plan
    const graph = this.planner.createDependencyGraph(tasks);
    const plan = this.planner.optimizeExecution(graph, tasks);

    // Execute plan
    const result = await this.executor.execute(plan);

    // Record metrics
    for (const [taskId, completedTask] of result.tasks) {
      this.metricsCollector.recordTaskCompletion(
        completedTask,
        '', // Agent ID would come from assignment
        completedTask.status === 'completed',
        completedTask.error?.message
      );
    }

    return result;
  }

  /**
   * Get team status
   */
  async getStatus(): Promise<TeamStatus> {
    if (!this.team) {
      throw new Error('Orchestrator not initialized');
    }

    return await getTeamStatus(this.team.id);
  }

  /**
   * Get team metrics
   */
  async getMetrics(periodStart?: number, periodEnd?: number): Promise<TeamMetrics> {
    if (!this.team) {
      throw new Error('Orchestrator not initialized');
    }

    return await this.metricsCollector.getTeamMetrics(
      this.team.id,
      periodStart,
      periodEnd
    );
  }

  /**
   * Monitor team health
   */
  async *monitor(): AsyncGenerator<ProgressUpdate> {
    if (!this.team) {
      throw new Error('Orchestrator not initialized');
    }

    const teamData = await getTeam(this.team.id);
    if (!teamData) {
      throw new Error('Team not found');
    }

    for await (const alert of this.supervisor.monitor(teamData.agents)) {
      yield {
        taskId: 'monitoring',
        agentId: alert.agentId || 'supervisor',
        progress: 1,
        message: alert.message,
        timestamp: alert.timestamp,
        metadata: { alert },
      };
    }
  }

  /**
   * Get team visualization
   */
  getVisualization(): {
    interactionGraph: any;
    timeline: any;
  } {
    if (!this.team) {
      throw new Error('Orchestrator not initialized');
    }

    // Get messages from message bus
    const messages = this.messageBus.getMessagesByTopic('*');

    return {
      interactionGraph: this.visualizationBuilder.buildInteractionGraph(this.team, messages),
      timeline: this.visualizationBuilder.buildTimeline([], messages),
    };
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    console.log('[Orchestrator] Shutting down...');

    this.messageBus.destroy();
    this.executor.removeAllListeners();

    console.log('[Orchestrator] Shutdown complete');
  }

  /**
   * Get team instance
   */
  getTeam(): AgentTeam | null {
    return this.team;
  }

  /**
   * Get configuration
   */
  getConfig(): OrchestratorConfig {
    return this.config;
  }

  /**
   * Get coordinator instance
   */
  getCoordinator() {
    return this.coordinator;
  }

  /**
   * Get supervisor instance
   */
  getSupervisor() {
    return this.supervisor;
  }

  /**
   * Get message bus instance
   */
  getMessageBus() {
    return this.messageBus;
  }

  /**
   * Get metrics collector instance
   */
  getMetricsCollector() {
    return this.metricsCollector;
  }
}

/**
 * Create an orchestrator instance
 */
export function createOrchestrator(
  config: OrchestratorConfig,
  model: BaseChatModel
): Orchestrator {
  return new Orchestrator(config, model);
}

/**
 * Quick start with a template
 */
export async function quickStart(
  template: 'research' | 'development' | 'review',
  model: BaseChatModel
): Promise<Orchestrator> {
  const { getTemplate } = await import('./templates/index.js');
  const config = getTemplate(template);

  const orchestrator = createOrchestrator(config, model);
  await orchestrator.initialize();

  return orchestrator;
}
