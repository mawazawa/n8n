/**
 * Payload Transformer
 * Transform and validate webhook payloads before delivery
 */

import type { PayloadTemplate } from './types.js';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  pattern?: string; // regex pattern for strings
  min?: number; // min value for numbers, min length for strings/arrays
  max?: number; // max value for numbers, max length for strings/arrays
}

export interface TransformOptions {
  removeNullValues?: boolean;
  removeEmptyStrings?: boolean;
  flattenObjects?: boolean;
  maxDepth?: number;
}

export class PayloadTransformer {
  /**
   * Transform payload using a template
   */
  transform(payload: Record<string, unknown>, template: PayloadTemplate): Record<string, unknown> {
    // If template string provided, use string templating
    if (template.template) {
      return this.transformWithTemplate(payload, template.template);
    }

    // If fields provided, select only those fields
    if (template.fields && template.fields.length > 0) {
      return this.selectFields(payload, template.fields);
    }

    // No transformation
    return payload;
  }

  /**
   * Validate payload against schema
   */
  validate(payload: Record<string, unknown>, rules: ValidationRule[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = this.getNestedValue(payload, rule.field);

      // Check required
      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Field '${rule.field}' is required`);
        continue;
      }

      // Skip validation if field is optional and not present
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Check type
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rule.type) {
        errors.push(`Field '${rule.field}' must be of type ${rule.type}, got ${actualType}`);
        continue;
      }

      // Type-specific validation
      if (rule.type === 'string' && typeof value === 'string') {
        if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
          errors.push(`Field '${rule.field}' does not match pattern ${rule.pattern}`);
        }
        if (rule.min !== undefined && value.length < rule.min) {
          errors.push(`Field '${rule.field}' must be at least ${rule.min} characters`);
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors.push(`Field '${rule.field}' must be at most ${rule.max} characters`);
        }
      }

      if (rule.type === 'number' && typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`Field '${rule.field}' must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`Field '${rule.field}' must be at most ${rule.max}`);
        }
      }

      if (rule.type === 'array' && Array.isArray(value)) {
        if (rule.min !== undefined && value.length < rule.min) {
          errors.push(`Field '${rule.field}' must have at least ${rule.min} items`);
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors.push(`Field '${rule.field}' must have at most ${rule.max} items`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Apply transformations to clean up payload
   */
  applyTransforms(payload: Record<string, unknown>, options: TransformOptions): Record<string, unknown> {
    let result = { ...payload };

    if (options.removeNullValues) {
      result = this.removeNullValues(result);
    }

    if (options.removeEmptyStrings) {
      result = this.removeEmptyStrings(result);
    }

    if (options.flattenObjects) {
      result = this.flattenObject(result, options.maxDepth || 10);
    }

    return result;
  }

  /**
   * Select specific fields from payload using JSONPath-like syntax
   */
  selectFields(payload: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      const value = this.getNestedValue(payload, field);
      if (value !== undefined) {
        this.setNestedValue(result, field, value);
      }
    }

    return result;
  }

  /**
   * Transform payload using template string
   */
  private transformWithTemplate(payload: Record<string, unknown>, template: string): Record<string, unknown> {
    try {
      // Parse template as JSON with variable substitution
      const result = template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const value = this.getNestedValue(payload, path.trim());
        return value !== undefined ? JSON.stringify(value) : 'null';
      });

      return JSON.parse(result);
    } catch (error) {
      throw new Error(`Invalid template: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array indices
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Remove null values from object
   */
  private removeNullValues(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        result[key] = this.removeNullValues(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Remove empty strings from object
   */
  private removeEmptyStrings(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === '') {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        result[key] = this.removeEmptyStrings(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Flatten nested objects
   */
  private flattenObject(
    obj: Record<string, unknown>,
    maxDepth: number,
    prefix = '',
    depth = 0,
  ): Record<string, unknown> {
    if (depth >= maxDepth) {
      return { [prefix.slice(0, -1)]: obj };
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix + key;

      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        Object.assign(
          result,
          this.flattenObject(value as Record<string, unknown>, maxDepth, newKey + '.', depth + 1),
        );
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Map values using a mapping function
   */
  mapValues(
    payload: Record<string, unknown>,
    mapper: (key: string, value: unknown) => unknown,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      const mappedValue = mapper(key, value);

      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        result[key] = this.mapValues(value as Record<string, unknown>, mapper);
      } else {
        result[key] = mappedValue;
      }
    }

    return result;
  }

  /**
   * Sanitize payload (remove sensitive data)
   */
  sanitize(payload: Record<string, unknown>, sensitiveFields: string[] = []): Record<string, unknown> {
    const defaultSensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'accessToken',
      'access_token',
      'privateKey',
      'private_key',
      'creditCard',
      'credit_card',
      'ssn',
      'social_security',
    ];

    const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];

    return this.mapValues(payload, (key, value) => {
      if (allSensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        return '[REDACTED]';
      }
      return value;
    });
  }

  /**
   * Validate JSON schema (basic implementation)
   */
  validateSchema(payload: Record<string, unknown>, schema: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Basic schema validation - in production, use a library like ajv
    if (schema.type === 'object' && typeof schema.properties === 'object') {
      const properties = schema.properties as Record<string, unknown>;

      for (const [key, propSchema] of Object.entries(properties)) {
        const value = payload[key];
        const prop = propSchema as Record<string, unknown>;

        if (prop.required && value === undefined) {
          errors.push(`Missing required field: ${key}`);
        }

        if (value !== undefined && prop.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== prop.type) {
            errors.push(`Field '${key}' has incorrect type. Expected ${prop.type}, got ${actualType}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create a payload transformer instance
 */
export function createPayloadTransformer(): PayloadTransformer {
  return new PayloadTransformer();
}
