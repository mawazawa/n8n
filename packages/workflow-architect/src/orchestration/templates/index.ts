/**
 * Team Templates
 * Export all pre-configured team templates
 */

import { type OrchestratorConfig } from '../types.js';
import {
  createResearchTeam,
  getResearchTeamConfig,
} from './research-team.js';
import {
  createDevelopmentTeam,
  getDevelopmentTeamConfig,
} from './development-team.js';
import {
  createReviewTeam,
  getReviewTeamConfig,
} from './review-team.js';

/**
 * Team template type
 */
export type TeamTemplateType = 'research' | 'development' | 'review';

/**
 * Team configuration info
 */
export interface TeamConfiguration {
  type: TeamTemplateType;
  name: string;
  description: string;
  agentCount: number;
  specializations: string[];
  config: OrchestratorConfig;
}

/**
 * Get team template by type
 */
export function getTemplate(type: TeamTemplateType): OrchestratorConfig {
  switch (type) {
    case 'research':
      return getResearchTeamConfig();
    case 'development':
      return getDevelopmentTeamConfig();
    case 'review':
      return getReviewTeamConfig();
    default:
      throw new Error(`Unknown team template type: ${type}`);
  }
}

/**
 * Get all available templates
 */
export function getAllTemplates(): TeamConfiguration[] {
  return [
    {
      type: 'research',
      name: 'Research Team',
      description: 'Specialized team for research, information gathering, and analysis',
      agentCount: 4,
      specializations: ['research', 'analysis', 'fact-checking'],
      config: getResearchTeamConfig(),
    },
    {
      type: 'development',
      name: 'Development Team',
      description: 'Full-stack development team for code generation, testing, and documentation',
      agentCount: 5,
      specializations: ['frontend', 'backend', 'testing', 'documentation'],
      config: getDevelopmentTeamConfig(),
    },
    {
      type: 'review',
      name: 'Review Team',
      description: 'Quality assurance team for code review, security, performance, and testing',
      agentCount: 5,
      specializations: ['code-review', 'security', 'performance', 'testing'],
      config: getReviewTeamConfig(),
    },
  ];
}

/**
 * Export template creators
 */
export {
  createResearchTeam,
  getResearchTeamConfig,
  createDevelopmentTeam,
  getDevelopmentTeamConfig,
  createReviewTeam,
  getReviewTeamConfig,
};
