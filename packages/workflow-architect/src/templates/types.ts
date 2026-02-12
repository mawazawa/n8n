/**
 * Template Type Definitions
 * Type system for workflow templates with variables, prerequisites, and metadata
 */

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'credential' | 'json';
  description: string;
  required: boolean;
  default?: unknown;
  validation?: string; // regex pattern
}

export interface TemplatePrerequisite {
  type: 'credential' | 'node' | 'integration';
  name: string;
  description: string;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'ai' | 'integration' | 'automation' | 'monitoring' | 'data-pipeline';
  tags: string[];
  complexity: 'beginner' | 'intermediate' | 'advanced';
  estimatedNodes: number;
  author: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate {
  metadata: TemplateMetadata;
  variables: TemplateVariable[];
  prerequisites: TemplatePrerequisite[];
  workflow: Record<string, unknown>; // n8n workflow JSON
}

export interface TemplateSearchOptions {
  category?: string;
  tags?: string[];
  complexity?: string;
  query?: string;
  limit?: number;
}

export interface InstantiatedTemplate {
  template: WorkflowTemplate;
  values: Record<string, unknown>;
  workflow: Record<string, unknown>;
  missingPrerequisites: TemplatePrerequisite[];
}
