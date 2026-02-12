/**
 * Research Team Template
 * Pre-configured team for research and information gathering tasks
 */

import { v4 as uuid } from 'uuid';
import {
  type Agent,
  type OrchestratorConfig,
  AgentRole,
  AgentStatus,
  TeamTopology,
} from '../types.js';
import { RESEARCHER } from '../specialization.js';

/**
 * Create research team configuration
 */
export function createResearchTeam(): Omit<OrchestratorConfig['team'], 'agents'> & {
  agents: Agent[];
} {
  const agents: Agent[] = [
    {
      id: uuid(),
      name: 'Research Coordinator',
      role: AgentRole.COORDINATOR,
      capabilities: {
        id: 'research-coordinator-cap',
        name: 'Research Coordination',
        skills: ['planning', 'coordination', 'synthesis'],
        tools: ['task-planner', 'result-aggregator'],
        models: ['gpt-4', 'claude-3'],
        specializations: ['coordination', 'research-planning'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 5,
    },
    {
      id: uuid(),
      name: 'Web Researcher',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: RESEARCHER.id,
        name: RESEARCHER.name,
        skills: [...RESEARCHER.skills, 'web-scraping'],
        tools: [...RESEARCHER.tools, 'web-scraper'],
        models: ['gpt-4-turbo', 'gpt-3.5-turbo'],
        specializations: RESEARCHER.capabilities,
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
    {
      id: uuid(),
      name: 'Data Analyst',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'data-analyst-cap',
        name: 'Data Analysis',
        skills: ['data-analysis', 'statistics', 'visualization'],
        tools: ['pandas', 'numpy', 'matplotlib'],
        models: ['gpt-4', 'claude-3'],
        specializations: ['analysis', 'statistics'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 2,
    },
    {
      id: uuid(),
      name: 'Fact Checker',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'fact-checker-cap',
        name: 'Fact Checking',
        skills: ['fact-checking', 'verification', 'source-validation'],
        tools: ['search-engine', 'database-query', 'citation-checker'],
        models: ['gpt-4', 'claude-3'],
        specializations: ['fact-checking', 'verification'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
  ];

  return {
    name: 'Research Team',
    description: 'Specialized team for research, information gathering, and analysis',
    topology: TeamTopology.HIERARCHICAL,
    leaderId: agents[0].id, // Coordinator is leader
    metadata: {
      template: 'research-team',
      version: '1.0.0',
      specializations: ['research', 'analysis', 'fact-checking'],
    },
    agents,
  };
}

/**
 * Get full orchestrator config for research team
 */
export function getResearchTeamConfig(): OrchestratorConfig {
  return {
    team: createResearchTeam(),
    assignmentStrategy: 'capability-based',
    maxConcurrentTasks: 10,
    taskTimeout: 300000, // 5 minutes
    maxRetries: 2,
    enableDependencies: true,
    enableHeartbeat: true,
    heartbeatInterval: 10000,
    failureThreshold: 3,
    messageRetention: 3600000, // 1 hour
    enableMetrics: true,
    custom: {
      researchDepth: 'comprehensive',
      sourcesRequired: 3,
      factCheckingEnabled: true,
    },
  };
}
