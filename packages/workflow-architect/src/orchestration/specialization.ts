/**
 * Agent Specialization
 * Defines agent roles and capabilities
 */

import { type AgentRole, type Task } from './types.js';

/**
 * Agent specialization definition
 */
export interface AgentSpecialization {
  id: string;
  name: string;
  description: string;
  role: AgentRole;
  skills: string[];
  tools: string[];
  capabilities: string[];
  taskTypes: string[];
}

/**
 * Built-in specializations
 */
const specializations: Map<string, AgentSpecialization> = new Map();

/**
 * Researcher specialization
 */
export const RESEARCHER: AgentSpecialization = {
  id: 'researcher',
  name: 'Researcher',
  description: 'Specializes in information gathering, analysis, and research tasks',
  role: 'specialist' as AgentRole,
  skills: [
    'web-search',
    'data-analysis',
    'information-synthesis',
    'fact-checking',
  ],
  tools: [
    'web-browser',
    'search-engine',
    'database-query',
    'api-client',
  ],
  capabilities: [
    'research',
    'analysis',
    'data-gathering',
  ],
  taskTypes: [
    'research',
    'information-gathering',
    'data-analysis',
    'fact-checking',
  ],
};

/**
 * Coder specialization
 */
export const CODER: AgentSpecialization = {
  id: 'coder',
  name: 'Coder',
  description: 'Specializes in code generation, debugging, and software development',
  role: 'specialist' as AgentRole,
  skills: [
    'programming',
    'debugging',
    'testing',
    'code-review',
  ],
  tools: [
    'code-editor',
    'compiler',
    'debugger',
    'version-control',
  ],
  capabilities: [
    'code-generation',
    'debugging',
    'refactoring',
  ],
  taskTypes: [
    'code-generation',
    'debugging',
    'testing',
    'refactoring',
  ],
};

/**
 * Reviewer specialization
 */
export const REVIEWER: AgentSpecialization = {
  id: 'reviewer',
  name: 'Reviewer',
  description: 'Specializes in code review, quality assurance, and validation',
  role: 'specialist' as AgentRole,
  skills: [
    'code-review',
    'quality-assurance',
    'security-audit',
    'performance-analysis',
  ],
  tools: [
    'static-analyzer',
    'linter',
    'security-scanner',
    'performance-profiler',
  ],
  capabilities: [
    'code-review',
    'quality-assurance',
    'security-audit',
  ],
  taskTypes: [
    'code-review',
    'security-audit',
    'quality-check',
  ],
};

/**
 * Tester specialization
 */
export const TESTER: AgentSpecialization = {
  id: 'tester',
  name: 'Tester',
  description: 'Specializes in testing, validation, and quality assurance',
  role: 'specialist' as AgentRole,
  skills: [
    'test-design',
    'test-execution',
    'bug-reporting',
    'test-automation',
  ],
  tools: [
    'test-framework',
    'test-runner',
    'coverage-tool',
    'bug-tracker',
  ],
  capabilities: [
    'testing',
    'validation',
    'quality-assurance',
  ],
  taskTypes: [
    'testing',
    'validation',
    'bug-reporting',
  ],
};

/**
 * Writer specialization
 */
export const WRITER: AgentSpecialization = {
  id: 'writer',
  name: 'Writer',
  description: 'Specializes in documentation, content creation, and communication',
  role: 'specialist' as AgentRole,
  skills: [
    'technical-writing',
    'documentation',
    'content-creation',
    'editing',
  ],
  tools: [
    'markdown-editor',
    'documentation-generator',
    'spell-checker',
    'grammar-checker',
  ],
  capabilities: [
    'documentation',
    'content-creation',
    'editing',
  ],
  taskTypes: [
    'documentation',
    'content-creation',
    'technical-writing',
  ],
};

/**
 * Data Engineer specialization
 */
export const DATA_ENGINEER: AgentSpecialization = {
  id: 'data-engineer',
  name: 'Data Engineer',
  description: 'Specializes in data processing, ETL, and data pipeline creation',
  role: 'specialist' as AgentRole,
  skills: [
    'data-processing',
    'etl',
    'data-modeling',
    'pipeline-design',
  ],
  tools: [
    'database',
    'data-pipeline',
    'etl-tool',
    'data-warehouse',
  ],
  capabilities: [
    'data-processing',
    'etl',
    'data-modeling',
  ],
  taskTypes: [
    'data-processing',
    'etl',
    'data-pipeline',
  ],
};

// Register built-in specializations
specializations.set(RESEARCHER.id, RESEARCHER);
specializations.set(CODER.id, CODER);
specializations.set(REVIEWER.id, REVIEWER);
specializations.set(TESTER.id, TESTER);
specializations.set(WRITER.id, WRITER);
specializations.set(DATA_ENGINEER.id, DATA_ENGINEER);

/**
 * Register a new specialization
 */
export function registerSpecialization(spec: AgentSpecialization): void {
  specializations.set(spec.id, spec);
  console.log(`[Specialization] Registered: ${spec.name}`);
}

/**
 * Get specialization by ID
 */
export function getSpecialization(id: string): AgentSpecialization | undefined {
  return specializations.get(id);
}

/**
 * Get all specializations
 */
export function getAllSpecializations(): AgentSpecialization[] {
  return Array.from(specializations.values());
}

/**
 * Match task to appropriate specializations
 */
export function matchTaskToSpecialization(task: Task): AgentRole[] {
  const matches: AgentRole[] = [];

  for (const spec of specializations.values()) {
    // Check if task type matches
    if (spec.taskTypes.includes(task.type)) {
      matches.push(spec.role);
    }

    // Check if required capabilities match
    if (task.requiredCapabilities) {
      const hasCapabilities = task.requiredCapabilities.some(cap =>
        spec.capabilities.includes(cap) || spec.skills.includes(cap)
      );

      if (hasCapabilities && !matches.includes(spec.role)) {
        matches.push(spec.role);
      }
    }
  }

  return matches;
}

/**
 * Get specializations by role
 */
export function getSpecializationsByRole(role: AgentRole): AgentSpecialization[] {
  return Array.from(specializations.values())
    .filter(spec => spec.role === role);
}

/**
 * Check if specialization can handle task
 */
export function canHandleTask(spec: AgentSpecialization, task: Task): boolean {
  // Check task type
  if (spec.taskTypes.includes(task.type)) {
    return true;
  }

  // Check required capabilities
  if (task.requiredCapabilities) {
    return task.requiredCapabilities.some(cap =>
      spec.capabilities.includes(cap) || spec.skills.includes(cap)
    );
  }

  return false;
}

/**
 * Find best specialization for task
 */
export function findBestSpecialization(task: Task): AgentSpecialization | undefined {
  let bestMatch: AgentSpecialization | undefined;
  let bestScore = 0;

  for (const spec of specializations.values()) {
    let score = 0;

    // Exact task type match
    if (spec.taskTypes.includes(task.type)) {
      score += 10;
    }

    // Capability matches
    if (task.requiredCapabilities) {
      for (const cap of task.requiredCapabilities) {
        if (spec.capabilities.includes(cap)) score += 5;
        if (spec.skills.includes(cap)) score += 3;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = spec;
    }
  }

  return bestMatch;
}
