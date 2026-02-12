/**
 * Review Team Template
 * Pre-configured team for code review and quality assurance
 */

import { v4 as uuid } from 'uuid';
import {
  type Agent,
  type OrchestratorConfig,
  AgentRole,
  AgentStatus,
  TeamTopology,
} from '../types.js';
import { REVIEWER, TESTER } from '../specialization.js';

/**
 * Create review team configuration
 */
export function createReviewTeam(): Omit<OrchestratorConfig['team'], 'agents'> & {
  agents: Agent[];
} {
  const agents: Agent[] = [
    {
      id: uuid(),
      name: 'QA Supervisor',
      role: AgentRole.SUPERVISOR,
      capabilities: {
        id: 'qa-supervisor-cap',
        name: 'Quality Assurance Supervision',
        skills: ['quality-assurance', 'process-management', 'risk-assessment'],
        tools: ['monitoring', 'reporting', 'analytics'],
        models: ['gpt-4', 'claude-3-opus'],
        specializations: ['supervision', 'quality-assurance'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 10,
    },
    {
      id: uuid(),
      name: 'Code Reviewer',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: REVIEWER.id,
        name: REVIEWER.name,
        skills: REVIEWER.skills,
        tools: REVIEWER.tools,
        models: ['gpt-4', 'claude-3-opus'],
        specializations: REVIEWER.capabilities,
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
    {
      id: uuid(),
      name: 'Security Auditor',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'security-auditor-cap',
        name: 'Security Audit',
        skills: ['security-audit', 'vulnerability-scanning', 'penetration-testing'],
        tools: ['security-scanner', 'vulnerability-db', 'owasp-tools'],
        models: ['gpt-4', 'claude-3-opus'],
        specializations: ['security', 'security-audit'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 2,
    },
    {
      id: uuid(),
      name: 'Performance Analyst',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: 'performance-analyst-cap',
        name: 'Performance Analysis',
        skills: ['performance-analysis', 'profiling', 'optimization'],
        tools: ['profiler', 'benchmark-tool', 'monitoring'],
        models: ['gpt-4', 'claude-3'],
        specializations: ['performance', 'optimization'],
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 2,
    },
    {
      id: uuid(),
      name: 'Automated Tester',
      role: AgentRole.SPECIALIST,
      capabilities: {
        id: TESTER.id,
        name: TESTER.name,
        skills: [...TESTER.skills, 'e2e-testing', 'regression-testing'],
        tools: [...TESTER.tools, 'selenium', 'playwright'],
        models: ['gpt-4', 'claude-3'],
        specializations: TESTER.capabilities,
      },
      status: AgentStatus.IDLE,
      workload: 0,
      maxConcurrentTasks: 3,
    },
  ];

  return {
    name: 'Review Team',
    description: 'Quality assurance team for code review, security, performance, and testing',
    topology: TeamTopology.STAR,
    leaderId: agents[0].id, // QA Supervisor is leader
    metadata: {
      template: 'review-team',
      version: '1.0.0',
      specializations: ['code-review', 'security', 'performance', 'testing'],
    },
    agents,
  };
}

/**
 * Get full orchestrator config for review team
 */
export function getReviewTeamConfig(): OrchestratorConfig {
  return {
    team: createReviewTeam(),
    assignmentStrategy: 'capability-based',
    maxConcurrentTasks: 12,
    taskTimeout: 600000, // 10 minutes
    maxRetries: 2,
    enableDependencies: true,
    enableHeartbeat: true,
    heartbeatInterval: 10000,
    failureThreshold: 3,
    messageRetention: 7200000, // 2 hours
    enableMetrics: true,
    custom: {
      securityLevel: 'high',
      performanceThreshold: 0.9,
      coverageRequired: 85,
    },
  };
}
