/**
 * Template Registry
 * Central registry for managing workflow templates with search and validation
 */

import { ErrorCode, WorkflowArchitectError } from '../errors/index.js';
import type {
  WorkflowTemplate,
  TemplateSearchOptions,
  TemplateMetadata,
} from './types.js';

interface TemplateRegistryOptions {
  /** Enable in-memory caching of templates */
  enableCache?: boolean;
  /** Maximum number of templates to cache */
  maxCacheSize?: number;
}

/**
 * Manages workflow templates with in-memory storage and search capabilities
 */
export class TemplateRegistry {
  private templates: Map<string, WorkflowTemplate>;
  private readonly enableCache: boolean;
  private readonly maxCacheSize: number;

  constructor(options: TemplateRegistryOptions = {}) {
    this.templates = new Map();
    this.enableCache = options.enableCache ?? true;
    this.maxCacheSize = options.maxCacheSize ?? 1000;
  }

  /**
   * Add a template to the registry
   * @throws {WorkflowArchitectError} If template is invalid or duplicate ID exists
   */
  addTemplate(template: WorkflowTemplate): void {
    // Validate template structure
    this.validateTemplate(template);

    // Check for duplicate ID
    if (this.templates.has(template.metadata.id)) {
      throw new WorkflowArchitectError(
        `Template with ID "${template.metadata.id}" already exists`,
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id },
      );
    }

    // Check cache size limit
    if (this.enableCache && this.templates.size >= this.maxCacheSize) {
      throw new WorkflowArchitectError(
        `Template cache is full (max: ${this.maxCacheSize})`,
        ErrorCode.VALIDATION_ERROR,
        { currentSize: this.templates.size, maxSize: this.maxCacheSize },
      );
    }

    this.templates.set(template.metadata.id, template);
  }

  /**
   * Get a template by ID
   * @throws {WorkflowArchitectError} If template not found
   */
  getTemplate(id: string): WorkflowTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new WorkflowArchitectError(
        `Template with ID "${id}" not found`,
        ErrorCode.NOT_FOUND,
        { templateId: id },
      );
    }
    return template;
  }

  /**
   * Check if a template exists
   */
  hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Remove a template from the registry
   */
  removeTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Clear all templates
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Get all template IDs
   */
  getAllIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get all templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template count
   */
  count(): number {
    return this.templates.size;
  }

  /**
   * Search templates with fuzzy matching support
   */
  searchTemplates(options: TemplateSearchOptions = {}): WorkflowTemplate[] {
    let results = Array.from(this.templates.values());

    // Filter by category
    if (options.category) {
      results = results.filter(t => t.metadata.category === options.category);
    }

    // Filter by complexity
    if (options.complexity) {
      results = results.filter(t => t.metadata.complexity === options.complexity);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(template => {
        return options.tags!.some(tag =>
          template.metadata.tags.some(templateTag =>
            templateTag.toLowerCase().includes(tag.toLowerCase())
          )
        );
      });
    }

    // Fuzzy search by query (searches name, description, tags)
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(template => {
        const searchableText = [
          template.metadata.name,
          template.metadata.description,
          ...template.metadata.tags,
        ].join(' ').toLowerCase();

        return this.fuzzyMatch(searchableText, query);
      });

      // Sort by relevance score
      results.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, query);
        const scoreB = this.calculateRelevanceScore(b, query);
        return scoreB - scoreA;
      });
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * List all available categories
   */
  listCategories(): string[] {
    const categories = new Set<string>();
    const templates = Array.from(this.templates.values());
    for (const template of templates) {
      categories.add(template.metadata.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * List all available tags
   */
  listTags(): string[] {
    const tags = new Set<string>();
    const templates = Array.from(this.templates.values());
    for (const template of templates) {
      template.metadata.tags.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(
      t => t.metadata.category === category
    );
  }

  /**
   * Get templates by complexity
   */
  getTemplatesByComplexity(complexity: string): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(
      t => t.metadata.complexity === complexity
    );
  }

  /**
   * Validate template structure
   * @throws {WorkflowArchitectError} If template is invalid
   */
  private validateTemplate(template: WorkflowTemplate): void {
    // Check required fields
    if (!template.metadata) {
      throw new WorkflowArchitectError(
        'Template metadata is required',
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!template.metadata.id || typeof template.metadata.id !== 'string') {
      throw new WorkflowArchitectError(
        'Template ID is required and must be a string',
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (!template.metadata.name || typeof template.metadata.name !== 'string') {
      throw new WorkflowArchitectError(
        'Template name is required and must be a string',
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id },
      );
    }

    if (!template.workflow || typeof template.workflow !== 'object') {
      throw new WorkflowArchitectError(
        'Template workflow is required and must be an object',
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id },
      );
    }

    // Validate category
    const validCategories = ['ai', 'integration', 'automation', 'monitoring', 'data-pipeline'];
    if (!validCategories.includes(template.metadata.category)) {
      throw new WorkflowArchitectError(
        `Invalid category "${template.metadata.category}". Must be one of: ${validCategories.join(', ')}`,
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id, category: template.metadata.category },
      );
    }

    // Validate complexity
    const validComplexities = ['beginner', 'intermediate', 'advanced'];
    if (!validComplexities.includes(template.metadata.complexity)) {
      throw new WorkflowArchitectError(
        `Invalid complexity "${template.metadata.complexity}". Must be one of: ${validComplexities.join(', ')}`,
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id, complexity: template.metadata.complexity },
      );
    }

    // Validate variables
    if (!Array.isArray(template.variables)) {
      throw new WorkflowArchitectError(
        'Template variables must be an array',
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id },
      );
    }

    for (const variable of template.variables) {
      if (!variable.name || typeof variable.name !== 'string') {
        throw new WorkflowArchitectError(
          'Variable name is required and must be a string',
          ErrorCode.VALIDATION_ERROR,
          { templateId: template.metadata.id, variable },
        );
      }

      const validTypes = ['string', 'number', 'boolean', 'credential', 'json'];
      if (!validTypes.includes(variable.type)) {
        throw new WorkflowArchitectError(
          `Invalid variable type "${variable.type}". Must be one of: ${validTypes.join(', ')}`,
          ErrorCode.VALIDATION_ERROR,
          { templateId: template.metadata.id, variableName: variable.name },
        );
      }

      // Validate regex pattern if provided
      if (variable.validation) {
        try {
          new RegExp(variable.validation);
        } catch (error) {
          throw new WorkflowArchitectError(
            `Invalid regex pattern for variable "${variable.name}": ${variable.validation}`,
            ErrorCode.VALIDATION_ERROR,
            { templateId: template.metadata.id, variableName: variable.name, pattern: variable.validation },
          );
        }
      }
    }

    // Validate prerequisites
    if (!Array.isArray(template.prerequisites)) {
      throw new WorkflowArchitectError(
        'Template prerequisites must be an array',
        ErrorCode.VALIDATION_ERROR,
        { templateId: template.metadata.id },
      );
    }

    for (const prereq of template.prerequisites) {
      const validTypes = ['credential', 'node', 'integration'];
      if (!validTypes.includes(prereq.type)) {
        throw new WorkflowArchitectError(
          `Invalid prerequisite type "${prereq.type}". Must be one of: ${validTypes.join(', ')}`,
          ErrorCode.VALIDATION_ERROR,
          { templateId: template.metadata.id, prerequisite: prereq },
        );
      }
    }
  }

  /**
   * Fuzzy match algorithm - checks if query terms appear in text
   */
  private fuzzyMatch(text: string, query: string): boolean {
    const queryTerms = query.split(/\s+/).filter(t => t.length > 0);
    return queryTerms.every(term => text.includes(term));
  }

  /**
   * Calculate relevance score for search result ranking
   */
  private calculateRelevanceScore(template: WorkflowTemplate, query: string): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    // Exact name match gets highest score
    if (template.metadata.name.toLowerCase() === lowerQuery) {
      score += 100;
    }

    // Name contains query
    if (template.metadata.name.toLowerCase().includes(lowerQuery)) {
      score += 50;
    }

    // Description contains query
    if (template.metadata.description.toLowerCase().includes(lowerQuery)) {
      score += 25;
    }

    // Tags match
    const matchingTags = template.metadata.tags.filter(tag =>
      tag.toLowerCase().includes(lowerQuery)
    );
    score += matchingTags.length * 10;

    // Boost beginner templates slightly
    if (template.metadata.complexity === 'beginner') {
      score += 5;
    }

    return score;
  }
}
