/**
 * Fixture Manager for Test Data
 * Manages test data, templates, and data generation
 */

import fs from 'fs/promises';
import path from 'path';
import { FixtureSchema } from './types.js';

/**
 * Main fixture manager for loading and saving test data
 */
export class FixtureManager {
  private fixtures: Map<string, unknown> = new Map();
  private fixtureDir: string;

  constructor(fixtureDir: string = './fixtures') {
    this.fixtureDir = fixtureDir;
  }

  /**
   * Load a fixture by name
   */
  async load<T = unknown>(name: string): Promise<T> {
    // Check cache first
    if (this.fixtures.has(name)) {
      return this.fixtures.get(name) as T;
    }

    // Load from file
    const filePath = path.join(this.fixtureDir, `${name}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as T;
      this.fixtures.set(name, data);
      return data;
    } catch (error) {
      throw new Error(`Failed to load fixture "${name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save a fixture
   */
  async save(name: string, data: unknown): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.fixtureDir, { recursive: true });

    const filePath = path.join(this.fixtureDir, `${name}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // Update cache
    this.fixtures.set(name, data);
  }

  /**
   * Generate data from a schema
   */
  generate<T = unknown>(schema: FixtureSchema): T {
    return this.generateFromSchema(schema) as T;
  }

  /**
   * Load multiple fixtures
   */
  async loadMany<T = unknown>(names: string[]): Promise<Record<string, T>> {
    const results: Record<string, T> = {};

    await Promise.all(
      names.map(async (name) => {
        results[name] = await this.load<T>(name);
      })
    );

    return results;
  }

  /**
   * Check if a fixture exists
   */
  async exists(name: string): Promise<boolean> {
    if (this.fixtures.has(name)) {
      return true;
    }

    const filePath = path.join(this.fixtureDir, `${name}.json`);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a fixture
   */
  async delete(name: string): Promise<void> {
    const filePath = path.join(this.fixtureDir, `${name}.json`);
    await fs.unlink(filePath);
    this.fixtures.delete(name);
  }

  /**
   * List all available fixtures
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.fixtureDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Clear all cached fixtures
   */
  clearCache(): void {
    this.fixtures.clear();
  }

  /**
   * Generate data from schema
   */
  private generateFromSchema(schema: FixtureSchema): unknown {
    // Use custom generator if provided
    if (schema.generate) {
      return schema.generate();
    }

    // Use default value if provided
    if (schema.default !== undefined) {
      return schema.default;
    }

    // Generate based on type
    switch (schema.type) {
      case 'string':
        return DataFactory.string();
      case 'number':
        return DataFactory.number();
      case 'boolean':
        return DataFactory.boolean();
      case 'array':
        if (schema.items) {
          return Array.from({ length: 3 }, () => this.generateFromSchema(schema.items!));
        }
        return [];
      case 'object':
        if (schema.properties) {
          const obj: Record<string, unknown> = {};
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            // Only include required properties or randomly include optional ones
            if (schema.required?.includes(key) || Math.random() > 0.5) {
              obj[key] = this.generateFromSchema(propSchema);
            }
          }
          return obj;
        }
        return {};
      default:
        return null;
    }
  }
}

/**
 * Data factory for generating common test data types
 */
export class DataFactory {
  /**
   * Generate a random string
   */
  static string(length = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * Generate a random number
   */
  static number(min = 0, max = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate a random boolean
   */
  static boolean(): boolean {
    return Math.random() > 0.5;
  }

  /**
   * Generate a random email
   */
  static email(): string {
    return `${this.string(8)}@${this.string(6)}.com`;
  }

  /**
   * Generate a random URL
   */
  static url(): string {
    return `https://${this.string(10)}.com/${this.string(8)}`;
  }

  /**
   * Generate a random UUID
   */
  static uuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate a random date
   */
  static date(start?: Date, end?: Date): Date {
    const startTime = start?.getTime() ?? Date.now() - 365 * 24 * 60 * 60 * 1000;
    const endTime = end?.getTime() ?? Date.now();
    return new Date(startTime + Math.random() * (endTime - startTime));
  }

  /**
   * Generate a random ISO date string
   */
  static isoDate(start?: Date, end?: Date): string {
    return this.date(start, end).toISOString();
  }

  /**
   * Generate a random object with specified keys
   */
  static object<T extends Record<string, unknown>>(
    keys: string[],
    valueGenerator?: () => unknown
  ): T {
    const obj: Record<string, unknown> = {};
    for (const key of keys) {
      obj[key] = valueGenerator ? valueGenerator() : this.string();
    }
    return obj as T;
  }

  /**
   * Generate an array of items
   */
  static array<T>(generator: () => T, length = 5): T[] {
    return Array.from({ length }, generator);
  }

  /**
   * Pick a random item from an array
   */
  static pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  /**
   * Generate a random phone number
   */
  static phone(): string {
    return `+1${this.number(1000000000, 9999999999)}`;
  }

  /**
   * Generate a random address
   */
  static address(): {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  } {
    return {
      street: `${this.number(1, 9999)} ${this.string(8)} St`,
      city: this.string(10),
      state: this.string(2).toUpperCase(),
      zip: this.number(10000, 99999).toString(),
      country: 'US',
    };
  }

  /**
   * Generate a random person
   */
  static person(): {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    age: number;
    phone: string;
  } {
    return {
      id: this.uuid(),
      firstName: this.string(6),
      lastName: this.string(8),
      email: this.email(),
      age: this.number(18, 80),
      phone: this.phone(),
    };
  }

  /**
   * Generate workflow test data
   */
  static workflowInput(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
      id: this.uuid(),
      timestamp: this.isoDate(),
      data: {
        items: this.array(() => ({ id: this.uuid(), value: this.string() }), 3),
      },
      ...overrides,
    };
  }

  /**
   * Generate HTTP response data
   */
  static httpResponse(data?: unknown, statusCode = 200): {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  } {
    return {
      statusCode,
      headers: {
        'content-type': 'application/json',
        'x-request-id': this.uuid(),
      },
      body: data ?? { success: true, data: this.string() },
    };
  }

  /**
   * Generate database rows
   */
  static dbRows(count = 5, columns?: string[]): Array<Record<string, unknown>> {
    const cols = columns ?? ['id', 'name', 'email', 'created_at'];
    return this.array(() => this.object(cols), count);
  }
}

/**
 * Fixture template builder
 */
export class FixtureTemplate {
  private schema: FixtureSchema;

  constructor(type: FixtureSchema['type']) {
    this.schema = { type };
  }

  /**
   * Add properties to object schema
   */
  withProperties(properties: Record<string, FixtureSchema>): this {
    this.schema.properties = properties;
    return this;
  }

  /**
   * Set required properties
   */
  required(fields: string[]): this {
    this.schema.required = fields;
    return this;
  }

  /**
   * Set array items schema
   */
  items(schema: FixtureSchema): this {
    this.schema.items = schema;
    return this;
  }

  /**
   * Set default value
   */
  default(value: unknown): this {
    this.schema.default = value;
    return this;
  }

  /**
   * Set custom generator
   */
  generator(fn: () => unknown): this {
    this.schema.generate = fn;
    return this;
  }

  /**
   * Build the schema
   */
  build(): FixtureSchema {
    return this.schema;
  }

  /**
   * Generate data from this template
   */
  generate(): unknown {
    const manager = new FixtureManager();
    return manager.generate(this.schema);
  }
}

/**
 * Create a new fixture template
 */
export function template(type: FixtureSchema['type']): FixtureTemplate {
  return new FixtureTemplate(type);
}

/**
 * Common fixture templates
 */
export const FixtureTemplates = {
  /**
   * User fixture template
   */
  user: () => template('object')
    .withProperties({
      id: { type: 'string', generate: () => DataFactory.uuid() },
      email: { type: 'string', generate: () => DataFactory.email() },
      name: { type: 'string', generate: () => DataFactory.string(10) },
      age: { type: 'number', generate: () => DataFactory.number(18, 80) },
    })
    .required(['id', 'email']),

  /**
   * Workflow input template
   */
  workflowInput: () => template('object')
    .withProperties({
      id: { type: 'string', generate: () => DataFactory.uuid() },
      timestamp: { type: 'string', generate: () => DataFactory.isoDate() },
      data: { type: 'object', default: {} },
    })
    .required(['id', 'timestamp']),

  /**
   * API response template
   */
  apiResponse: () => template('object')
    .withProperties({
      success: { type: 'boolean', default: true },
      data: { type: 'object', default: {} },
      message: { type: 'string', default: 'Success' },
    })
    .required(['success']),
};
