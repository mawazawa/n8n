/**
 * Agent Team Management
 * Handles team creation, agent lifecycle, and team topologies
 */

import { v4 as uuid } from 'uuid';
import {
  type AgentTeam,
  type Agent,
  type TeamStatus,
  TeamTopology,
  AgentStatus,
  AgentRole,
} from './types.js';

/**
 * Team configuration for creation
 */
export interface TeamConfig {
  name: string;
  description?: string;
  topology: TeamTopology;
  leaderId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * In-memory team storage
 */
const teams = new Map<string, AgentTeam>();

/**
 * Create a new agent team
 */
export async function createTeam(config: TeamConfig): Promise<AgentTeam> {
  const team: AgentTeam = {
    id: uuid(),
    name: config.name,
    description: config.description,
    agents: [],
    topology: config.topology,
    leaderId: config.leaderId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: config.metadata,
  };

  teams.set(team.id, team);
  return team;
}

/**
 * Get team by ID
 */
export async function getTeam(teamId: string): Promise<AgentTeam | undefined> {
  return teams.get(teamId);
}

/**
 * List all teams
 */
export async function listTeams(): Promise<AgentTeam[]> {
  return Array.from(teams.values());
}

/**
 * Delete team
 */
export async function deleteTeam(teamId: string): Promise<boolean> {
  return teams.delete(teamId);
}

/**
 * Add agent to team
 */
export async function addAgent(teamId: string, agent: Agent): Promise<void> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  // Validate agent doesn't already exist
  if (team.agents.some(a => a.id === agent.id)) {
    throw new Error(`Agent ${agent.id} already exists in team ${teamId}`);
  }

  // Validate topology constraints
  validateTopology(team, agent);

  team.agents.push(agent);
  team.updatedAt = Date.now();

  // If this is the first agent and topology requires a leader, set it
  if (team.agents.length === 1 && !team.leaderId && needsLeader(team.topology)) {
    team.leaderId = agent.id;
  }
}

/**
 * Remove agent from team
 */
export async function removeAgent(teamId: string, agentId: string): Promise<void> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  const index = team.agents.findIndex(a => a.id === agentId);
  if (index === -1) {
    throw new Error(`Agent ${agentId} not found in team ${teamId}`);
  }

  team.agents.splice(index, 1);
  team.updatedAt = Date.now();

  // If removed agent was leader, assign new leader
  if (team.leaderId === agentId && needsLeader(team.topology)) {
    team.leaderId = team.agents.find(a => a.role === AgentRole.COORDINATOR)?.id
      || team.agents[0]?.id;
  }
}

/**
 * Update agent in team
 */
export async function updateAgent(
  teamId: string,
  agentId: string,
  updates: Partial<Agent>
): Promise<void> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  const agent = team.agents.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in team ${teamId}`);
  }

  Object.assign(agent, updates);
  team.updatedAt = Date.now();
}

/**
 * Get team status
 */
export async function getTeamStatus(teamId: string): Promise<TeamStatus> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  const totalAgents = team.agents.length;
  const activeAgents = team.agents.filter(a => a.status === AgentStatus.BUSY).length;
  const idleAgents = team.agents.filter(a => a.status === AgentStatus.IDLE).length;
  const offlineAgents = team.agents.filter(a => a.status === AgentStatus.OFFLINE).length;

  const averageWorkload = totalAgents > 0
    ? team.agents.reduce((sum, a) => sum + a.workload, 0) / totalAgents
    : 0;

  return {
    teamId: team.id,
    teamName: team.name,
    totalAgents,
    activeAgents,
    idleAgents,
    offlineAgents,
    totalTasks: 0, // This will be populated by executor
    pendingTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageWorkload,
    timestamp: Date.now(),
  };
}

/**
 * Get agents by role
 */
export async function getAgentsByRole(
  teamId: string,
  role: AgentRole
): Promise<Agent[]> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  return team.agents.filter(a => a.role === role);
}

/**
 * Get available agents (idle with capacity)
 */
export async function getAvailableAgents(teamId: string): Promise<Agent[]> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  return team.agents.filter(a =>
    a.status === AgentStatus.IDLE &&
    a.workload < 1.0
  );
}

/**
 * Get team leader
 */
export async function getTeamLeader(teamId: string): Promise<Agent | undefined> {
  const team = teams.get(teamId);
  if (!team || !team.leaderId) {
    return undefined;
  }

  return team.agents.find(a => a.id === team.leaderId);
}

/**
 * Validate topology constraints
 */
function validateTopology(team: AgentTeam, agent: Agent): void {
  switch (team.topology) {
    case TeamTopology.HIERARCHICAL:
      // Must have exactly one coordinator
      if (agent.role === AgentRole.COORDINATOR) {
        const existingCoordinator = team.agents.find(
          a => a.role === AgentRole.COORDINATOR
        );
        if (existingCoordinator) {
          throw new Error('Hierarchical team can only have one coordinator');
        }
      }
      break;

    case TeamTopology.STAR:
      // Must have exactly one leader (coordinator or supervisor)
      if (agent.role === AgentRole.COORDINATOR || agent.role === AgentRole.SUPERVISOR) {
        const existingLeader = team.agents.find(
          a => a.role === AgentRole.COORDINATOR || a.role === AgentRole.SUPERVISOR
        );
        if (existingLeader) {
          throw new Error('Star topology can only have one leader');
        }
      }
      break;

    case TeamTopology.FLAT:
      // No coordinators or supervisors
      if (agent.role === AgentRole.COORDINATOR || agent.role === AgentRole.SUPERVISOR) {
        throw new Error('Flat topology cannot have coordinators or supervisors');
      }
      break;

    case TeamTopology.MESH:
      // No restrictions
      break;
  }
}

/**
 * Check if topology needs a leader
 */
function needsLeader(topology: TeamTopology): boolean {
  return topology === TeamTopology.HIERARCHICAL || topology === TeamTopology.STAR;
}

/**
 * Get team topology description
 */
export function getTopologyDescription(topology: TeamTopology): string {
  switch (topology) {
    case TeamTopology.HIERARCHICAL:
      return 'Tree-like structure with coordinator delegating to specialists and workers';
    case TeamTopology.FLAT:
      return 'All agents have equal status and communicate directly';
    case TeamTopology.MESH:
      return 'All agents can communicate with any other agent';
    case TeamTopology.STAR:
      return 'Central leader coordinates all other agents';
  }
}

/**
 * Validate team health
 */
export async function validateTeamHealth(teamId: string): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const team = teams.get(teamId);
  if (!team) {
    return { healthy: false, issues: ['Team not found'] };
  }

  const issues: string[] = [];

  // Check minimum agents
  if (team.agents.length === 0) {
    issues.push('Team has no agents');
  }

  // Check for offline agents
  const offlineAgents = team.agents.filter(a => a.status === AgentStatus.OFFLINE);
  if (offlineAgents.length > 0) {
    issues.push(`${offlineAgents.length} agents are offline`);
  }

  // Check for error agents
  const errorAgents = team.agents.filter(a => a.status === AgentStatus.ERROR);
  if (errorAgents.length > 0) {
    issues.push(`${errorAgents.length} agents are in error state`);
  }

  // Check leader exists if needed
  if (needsLeader(team.topology) && !team.leaderId) {
    issues.push('Team requires a leader but none is assigned');
  }

  // Check leader is valid
  if (team.leaderId && !team.agents.find(a => a.id === team.leaderId)) {
    issues.push('Team leader is not in the team');
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Rebalance team workload
 */
export async function rebalanceTeam(teamId: string): Promise<void> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  // This is a placeholder - actual rebalancing would be done by load balancer
  // and task reassignment in the executor
  console.log(`[Team] Rebalancing workload for team ${team.name}`);
}

/**
 * Clone team configuration
 */
export async function cloneTeam(
  teamId: string,
  newName: string
): Promise<AgentTeam> {
  const sourceTeam = teams.get(teamId);
  if (!sourceTeam) {
    throw new Error(`Team ${teamId} not found`);
  }

  const newTeam: AgentTeam = {
    id: uuid(),
    name: newName,
    description: sourceTeam.description,
    agents: [], // Don't clone agents, they should be added separately
    topology: sourceTeam.topology,
    leaderId: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: { ...sourceTeam.metadata, clonedFrom: teamId },
  };

  teams.set(newTeam.id, newTeam);
  return newTeam;
}

/**
 * Export team configuration
 */
export async function exportTeamConfig(teamId: string): Promise<{
  config: TeamConfig;
  agents: Agent[];
}> {
  const team = teams.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  return {
    config: {
      name: team.name,
      description: team.description,
      topology: team.topology,
      leaderId: team.leaderId,
      metadata: team.metadata,
    },
    agents: team.agents,
  };
}
