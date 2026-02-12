/**
 * Template Instantiator
 * Handles variable extraction, validation, and template instantiation
 */

import { ErrorCode, WorkflowArchitectError } from '../errors/index.js';
import type {
  WorkflowTemplate,
  TemplateVariable,
  TemplatePrerequisite,
  InstantiatedTemplate,
} from './types.js';

/**
 * Extract all variable references from a template
 * Finds {{variable}} patterns in nested objects
 */
export function extractVariables(template: WorkflowTemplate): Set<string> {
  const variables = new Set<string>();
  const variablePattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

  /**
   * Recursively search for variable patterns in nested structures
   */
  function searchObject(obj: unknown): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj === 'string') {
      // Extract all variable names from the string
      let match;
      while ((match = variablePattern.exec(obj)) !== null) {
        variables.add(match[1]);
      }
    } else if (Array.isArray(obj)) {
      // Search each array element
      for (const item of obj) {
        searchObject(item);
      }
    } else if (typeof obj === 'object') {
      // Search each object property
      for (const value of Object.values(obj)) {
        searchObject(value);
      }
    }
  }

  // Search the entire workflow object
  searchObject(template.workflow);

  return variables;
}

/**
 * Validate provided values against template variable definitions
 * @throws {WorkflowArchitectError} If validation fails
 */
export function validateValues(
  template: WorkflowTemplate,
  values: Record<string, unknown>,
): void {
  const errors: string[] = [];

  // Check required variables
  for (const variable of template.variables) {
    if (variable.required && !(variable.name in values)) {
      // Check if default value exists
      if (variable.default === undefined) {
        errors.push(`Required variable "${variable.name}" is missing`);
      }
    }

    // Validate provided values
    if (variable.name in values) {
      const value = values[variable.name];

      // Type validation
      const typeError = validateVariableType(variable, value);
      if (typeError) {
        errors.push(typeError);
        continue; // Skip further validation if type is wrong
      }

      // Pattern validation
      if (variable.validation && typeof value === 'string') {
        try {
          const regex = new RegExp(variable.validation);
          if (!regex.test(value)) {
            errors.push(
              `Variable "${variable.name}" does not match pattern: ${variable.validation}`
            );
          }
        } catch (error) {
          // Invalid regex in template - should have been caught during template validation
          errors.push(
            `Invalid validation pattern for variable "${variable.name}"`
          );
        }
      }
    }
  }

  // Check for undefined variables being used
  const extractedVars = extractVariables(template);
  const definedVarNames = new Set(template.variables.map(v => v.name));

  const extractedVarArray = Array.from(extractedVars);
  for (const extractedVar of extractedVarArray) {
    if (!definedVarNames.has(extractedVar)) {
      errors.push(
        `Variable "${extractedVar}" is used in template but not defined in variables list`
      );
    }
  }

  if (errors.length > 0) {
    throw new WorkflowArchitectError(
      `Template validation failed:\n${errors.join('\n')}`,
      ErrorCode.VALIDATION_ERROR,
      { errors, templateId: template.metadata.id },
    );
  }
}

/**
 * Validate that a value matches the expected variable type
 */
function validateVariableType(
  variable: TemplateVariable,
  value: unknown,
): string | null {
  switch (variable.type) {
    case 'string':
      if (typeof value !== 'string') {
        return `Variable "${variable.name}" must be a string, got ${typeof value}`;
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return `Variable "${variable.name}" must be a number, got ${typeof value}`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `Variable "${variable.name}" must be a boolean, got ${typeof value}`;
      }
      break;

    case 'credential':
      if (typeof value !== 'string') {
        return `Variable "${variable.name}" (credential) must be a string ID, got ${typeof value}`;
      }
      break;

    case 'json':
      if (typeof value !== 'object' || value === null) {
        return `Variable "${variable.name}" must be a JSON object, got ${typeof value}`;
      }
      break;

    default:
      return `Variable "${variable.name}" has unknown type: ${(variable as TemplateVariable).type}`;
  }

  return null;
}

/**
 * Instantiate a template by replacing variables with provided values
 * @throws {WorkflowArchitectError} If validation fails
 */
export function instantiate(
  template: WorkflowTemplate,
  values: Record<string, unknown>,
): InstantiatedTemplate {
  // Merge values with defaults
  const mergedValues: Record<string, unknown> = {};

  // First, apply defaults
  for (const variable of template.variables) {
    if (variable.default !== undefined) {
      mergedValues[variable.name] = variable.default;
    }
  }

  // Then, override with provided values
  Object.assign(mergedValues, values);

  // Validate all values
  validateValues(template, mergedValues);

  // Deep clone the workflow to avoid modifying the template
  const workflow = deepClone(template.workflow);

  // Replace all variables in the workflow
  replaceVariables(workflow, mergedValues);

  return {
    template,
    values: mergedValues,
    workflow,
    missingPrerequisites: [], // Will be populated by checkPrerequisites
  };
}

/**
 * Replace all variable references in an object with actual values
 */
function replaceVariables(obj: unknown, values: Record<string, unknown>): void {
  if (obj === null || obj === undefined) {
    return;
  }

  if (Array.isArray(obj)) {
    // Process each array element
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        obj[i] = replaceVariablesInString(obj[i], values);
      } else {
        replaceVariables(obj[i], values);
      }
    }
  } else if (typeof obj === 'object') {
    // Process each object property
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        (obj as Record<string, unknown>)[key] = replaceVariablesInString(value, values);
      } else {
        replaceVariables(value, values);
      }
    }
  }
}

/**
 * Replace variable references in a string
 */
function replaceVariablesInString(
  str: string,
  values: Record<string, unknown>,
): string | unknown {
  // Check if the entire string is a single variable (for preserving types)
  const singleVarMatch = /^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/.exec(str);
  if (singleVarMatch) {
    const varName = singleVarMatch[1];
    if (varName in values) {
      return values[varName]; // Return the actual value with correct type
    }
    return str; // Return unchanged if variable not found
  }

  // Replace all variable occurrences in the string
  return str.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, varName) => {
    if (varName in values) {
      const value = values[varName];
      // Convert value to string for inline replacement
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }
      return String(value);
    }
    return match; // Return unchanged if variable not found
  });
}

/**
 * Deep clone an object (handles JSON-serializable objects)
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check which prerequisites are missing
 * @param template - The workflow template
 * @param availableCredentials - Set of available credential names/IDs
 * @returns Array of missing prerequisites
 */
export function checkPrerequisites(
  template: WorkflowTemplate,
  availableCredentials: Set<string> = new Set(),
): TemplatePrerequisite[] {
  const missing: TemplatePrerequisite[] = [];

  for (const prereq of template.prerequisites) {
    // For credential prerequisites, check if they're available
    if (prereq.type === 'credential') {
      if (!availableCredentials.has(prereq.name)) {
        missing.push(prereq);
      }
    } else {
      // For node and integration prerequisites, we can't check automatically
      // These would need to be checked against an n8n instance
      // For now, we'll assume they need to be verified manually
      missing.push(prereq);
    }
  }

  return missing;
}

/**
 * Get all variable names that are missing from provided values
 */
export function getMissingVariables(
  template: WorkflowTemplate,
  values: Record<string, unknown>,
): string[] {
  const missing: string[] = [];

  for (const variable of template.variables) {
    if (variable.required && !(variable.name in values) && variable.default === undefined) {
      missing.push(variable.name);
    }
  }

  return missing;
}

/**
 * Get variable definitions for variables that are used in the template
 * but not defined in the variables array
 */
export function getUndefinedVariables(template: WorkflowTemplate): string[] {
  const extractedVars = extractVariables(template);
  const definedVarNames = new Set(template.variables.map(v => v.name));

  return Array.from(extractedVars).filter(v => !definedVarNames.has(v));
}
