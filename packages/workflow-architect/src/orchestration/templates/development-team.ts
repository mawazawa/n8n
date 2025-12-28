/**
 * Development Team Template
 * Pre-configured team for code generation and software development
 */

import { v4 as uuid } from 'uuid';
import {
  type Agent,
  type OrchestratorConfig,
  AgentRole,
  AgentStatus,
  TeamTopology,
} from '../types.js';
import { CODER, TESTER, WRITER } from '../specialization.js';

/**
 * Create development team configuration
 */
export function createDevelopmentTeam(): Omit<OrchestratorConfig['team'], 'agents'> & {
  agents: Agent[];
} {
  const agents: Agent[] = [
    {
      id: uuid(),
      name: 'Dev Lead',
      role: AgentRole.COORDINATOR,
      capabilities: {
        id: 'dev-lead-cap',
        name: 'Development Leadership',
        skills: ['architecture', 'code-review', 'planning', 'coordination'],
        tools: ['git', 'ide', 'project-manager'],
        models: ['gpt-4', 'claude-3-opus'],
        specializations: ['coordination', 'architecture'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 5,
    },
    {
      id: uuid(),
      name: 'Frontend Developer',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'frontend-dev-cap',
        name: 'Frontend Development',
        skills: [...CODER.skills, 'react', 'vue', 'css', 'typescript'],
        tools: [...CODER.tools, 'webpack', 'vite'],
        models: ['gpt-4-turbo', 'claude-3-sonnet'],
        specializations: ['code-generation', 'frontend'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
    {
      id: uuid(),
      name: 'Backend Developer',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'backend-dev-cap',
        name: 'Backend Development',
        skills: [...CODER.skills, 'nodejs', 'express', 'database', 'api-design'],
        tools: [...CODER.tools, 'postman', 'docker'],
        models: ['gpt-4-turbo', 'claude-3-sonnet'],
        specializations: ['code-generation', 'backend'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
    {
      id: uuid(),
      name: 'Test Engineer',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: TESTER.id,
        name: TESTER.name,
        skills: [...TESTER.skills, 'jest', 'vitest', 'playwright'],
        tools: [...TESTER.tools, 'jest', 'vitest'],
        models: ['gpt-4', 'claude-3'],
        specializations: TESTER.capabilities,
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 2,
    },
    {
      id: uuid(),
      name: 'Technical Writer',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: WRITER.id,
        name: WRITER.name,
        skills: WRITER.skills,
        tools: WRITER.tools,
        models: ['gpt-4', 'claude-3'],
        specializations: WRITER.capabilities,
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 2,
    },
  ];

  return {
    name: 'Development Team',
    description: 'Full-stack development team for code generation, testing, and documentation',
    topology: TeamTopology.HIERARCHICAL,
    leaderId: agents[0].id, // Dev Lead is leader
    metadata: {
      template: 'development-team',
      version: '1.0.0',
      specializations: ['frontend', 'backend', 'testing', 'documentation'],
    },
    agents,
  };
}

/**
 * Get full orchestrator config for development team
 */
export function getDevelopmentTeamConfig(): OrchestratorConfig {
  return {
    team: createDevelopmentTeam(),
    assignmentStrategy: 'capability-based',
    maxConcurrentTasks: 15,
    taskTimeout: 600000, // 10 minutes
    maxRetries: 3,
    enableDependencies: true,
    enableHeartbeat: true,
    heartbeatInterval: 15000,
    failureThreshold: 3,
    messageRetention: 7200000, // 2 hours
    enableMetrics: true,
    custom: {
      codeStyle: 'typescript-strict',
      testCoverage: 80,
      documentationRequired: true,
    },
  };
}
