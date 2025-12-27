/**
 * VarLock Integration
 * Secure environment variable management for n8n credentials
 */

import { readFile, access, constants } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EnvVariable {
  name: string;
  value?: string;
  description?: string;
  type?: string;
  required?: boolean;
  sensitive?: boolean;
  defaultValue?: string;
}

interface VarLockSchema {
  variables: EnvVariable[];
  validated: boolean;
  errors: string[];
}

/**
 * Parse VarLock schema file (.env.schema)
 */
export async function parseSchema(schemaPath?: string): Promise<VarLockSchema> {
  const path = schemaPath || join(__dirname, '../../.env.schema');

  try {
    await access(path, constants.R_OK);
  } catch {
    return { variables: [], validated: false, errors: ['Schema file not found'] };
  }

  const content = await readFile(path, 'utf-8');
  const lines = content.split('\n');

  const variables: EnvVariable[] = [];
  let currentVar: EnvVariable | null = null;
  let currentComments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      if (currentVar) {
        variables.push(currentVar);
        currentVar = null;
        currentComments = [];
      }
      continue;
    }

    // Parse comments (VarLock decorators)
    if (trimmed.startsWith('#')) {
      const commentContent = trimmed.slice(1).trim();

      // Check for VarLock decorators
      if (commentContent.startsWith('@')) {
        currentComments.push(commentContent);
      }
      continue;
    }

    // Parse variable assignment
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, name, value] = match;

      currentVar = {
        name,
        value: value || undefined,
        ...parseDecorators(currentComments),
      };
      currentComments = [];
    }
  }

  // Add last variable if exists
  if (currentVar) {
    variables.push(currentVar);
  }

  return { variables, validated: true, errors: [] };
}

/**
 * Parse VarLock decorators from comments
 */
function parseDecorators(comments: string[]): Partial<EnvVariable> {
  const result: Partial<EnvVariable> = {};

  for (const comment of comments) {
    // @description=...
    const descMatch = comment.match(/@description=(.+)/);
    if (descMatch) {
      result.description = descMatch[1];
      continue;
    }

    // @type=...
    const typeMatch = comment.match(/@type=(.+)/);
    if (typeMatch) {
      result.type = typeMatch[1];
      continue;
    }

    // @required
    if (comment.includes('@required')) {
      result.required = true;
    }

    // @sensitive
    if (comment.includes('@sensitive')) {
      result.sensitive = true;
    }

    // @default=...
    const defaultMatch = comment.match(/@default=(.+)/);
    if (defaultMatch) {
      result.defaultValue = defaultMatch[1];
    }
  }

  return result;
}

/**
 * Validate environment against schema
 */
export async function validateEnv(schemaPath?: string): Promise<{
  valid: boolean;
  missing: string[];
  invalid: string[];
}> {
  const schema = await parseSchema(schemaPath);

  if (!schema.validated) {
    return { valid: false, missing: [], invalid: schema.errors };
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const variable of schema.variables) {
    const value = process.env[variable.name] || variable.value;

    // Check required
    if (variable.required && !value) {
      missing.push(variable.name);
      continue;
    }

    // Skip validation if no value
    if (!value) continue;

    // Type validation
    if (variable.type) {
      const typeError = validateType(value, variable.type);
      if (typeError) {
        invalid.push(`${variable.name}: ${typeError}`);
      }
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate a value against a type specification
 */
function validateType(value: string, typeSpec: string): string | null {
  // enum(value1, value2, ...)
  const enumMatch = typeSpec.match(/^enum\((.+)\)$/);
  if (enumMatch) {
    const allowedValues = enumMatch[1].split(',').map(v => v.trim());
    if (!allowedValues.includes(value)) {
      return `must be one of: ${allowedValues.join(', ')}`;
    }
    return null;
  }

  // url
  if (typeSpec === 'url') {
    try {
      new URL(value);
      return null;
    } catch {
      return 'must be a valid URL';
    }
  }

  // port
  if (typeSpec === 'port') {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return 'must be a valid port number (1-65535)';
    }
    return null;
  }

  // boolean
  if (typeSpec === 'boolean') {
    if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
      return 'must be true or false';
    }
    return null;
  }

  // string(startsWith=...) or string(minLength=...)
  const stringMatch = typeSpec.match(/^string\((.+)\)$/);
  if (stringMatch) {
    const constraints = stringMatch[1];

    // startsWith
    const startsWithMatch = constraints.match(/startsWith=([^,)]+)/);
    if (startsWithMatch && !value.startsWith(startsWithMatch[1])) {
      return `must start with "${startsWithMatch[1]}"`;
    }

    // minLength
    const minLengthMatch = constraints.match(/minLength=(\d+)/);
    if (minLengthMatch && value.length < parseInt(minLengthMatch[1], 10)) {
      return `must be at least ${minLengthMatch[1]} characters`;
    }

    return null;
  }

  // number(min=..., max=...)
  const numberMatch = typeSpec.match(/^number\((.+)\)$/);
  if (numberMatch) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return 'must be a number';
    }

    const constraints = numberMatch[1];
    const minMatch = constraints.match(/min=(\d+)/);
    const maxMatch = constraints.match(/max=(\d+)/);

    if (minMatch && num < parseInt(minMatch[1], 10)) {
      return `must be at least ${minMatch[1]}`;
    }
    if (maxMatch && num > parseInt(maxMatch[1], 10)) {
      return `must be at most ${maxMatch[1]}`;
    }

    return null;
  }

  return null;
}

/**
 * Get a secure value from environment
 * Respects VarLock schema for type validation and defaults
 */
export async function getSecureValue(
  name: string,
  schemaPath?: string
): Promise<string | undefined> {
  const schema = await parseSchema(schemaPath);
  const variable = schema.variables.find(v => v.name === name);

  const value = process.env[name];

  if (value) {
    // Validate if we have a schema
    if (variable?.type) {
      const error = validateType(value, variable.type);
      if (error) {
        throw new Error(`Invalid ${name}: ${error}`);
      }
    }
    return value;
  }

  // Return default if available
  if (variable?.defaultValue) {
    return variable.defaultValue;
  }

  // Check if required
  if (variable?.required) {
    throw new Error(`Required environment variable ${name} is not set`);
  }

  return undefined;
}

/**
 * Mask sensitive values for logging
 */
export function maskSensitive(value: string, showChars = 4): string {
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }
  return value.slice(0, showChars) + '*'.repeat(8) + value.slice(-showChars);
}

/**
 * Get all credential-related environment variables
 */
export async function getCredentialEnvVars(schemaPath?: string): Promise<
  Array<{ name: string; masked: string; sensitive: boolean }>
> {
  const schema = await parseSchema(schemaPath);

  return schema.variables
    .filter(v => v.name.includes('API_KEY') || v.name.includes('SECRET') || v.sensitive)
    .map(v => ({
      name: v.name,
      masked: v.sensitive ? maskSensitive(process.env[v.name] || '') : (process.env[v.name] || ''),
      sensitive: v.sensitive || false,
    }));
}
