/**
 * Audit Diff
 * Compute before/after differences for audit events with JSONPatch support
 */

import type { Diff, DiffOperation, HumanReadableDiff, ChangeRecord } from './types.js';

/**
 * Sensitive field patterns to mask
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /apikey/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private/i,
];

/**
 * Compute diff between two objects using JSONPatch format
 */
export function computeDiff(before: unknown, after: unknown): Diff {
  const operations: DiffOperation[] = [];
  const summary = { added: 0, removed: 0, modified: 0 };

  computeDiffRecursive(before, after, '', operations, summary);

  return {
    operations,
    summary,
  };
}

/**
 * Recursively compute diff operations
 */
function computeDiffRecursive(
  before: unknown,
  after: unknown,
  path: string,
  operations: DiffOperation[],
  summary: { added: number; removed: number; modified: number },
): void {
  // Handle null/undefined
  if (before === null || before === undefined) {
    if (after !== null && after !== undefined) {
      operations.push({ op: 'add', path, value: after });
      summary.added++;
    }
    return;
  }

  if (after === null || after === undefined) {
    operations.push({ op: 'remove', path });
    summary.removed++;
    return;
  }

  // Handle primitives
  if (typeof before !== 'object' || typeof after !== 'object') {
    if (before !== after) {
      operations.push({ op: 'replace', path, value: after });
      summary.modified++;
    }
    return;
  }

  // Handle arrays
  if (Array.isArray(before) && Array.isArray(after)) {
    computeArrayDiff(before, after, path, operations, summary);
    return;
  }

  // Handle objects
  if (!Array.isArray(before) && !Array.isArray(after)) {
    computeObjectDiff(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
      path,
      operations,
      summary,
    );
    return;
  }

  // Type changed
  operations.push({ op: 'replace', path, value: after });
  summary.modified++;
}

/**
 * Compute diff for arrays
 */
function computeArrayDiff(
  before: unknown[],
  after: unknown[],
  path: string,
  operations: DiffOperation[],
  summary: { added: number; removed: number; modified: number },
): void {
  const maxLen = Math.max(before.length, after.length);

  for (let i = 0; i < maxLen; i++) {
    const itemPath = `${path}/${i}`;

    if (i >= before.length) {
      // Added
      operations.push({ op: 'add', path: itemPath, value: after[i] });
      summary.added++;
    } else if (i >= after.length) {
      // Removed
      operations.push({ op: 'remove', path: itemPath });
      summary.removed++;
    } else {
      // Compare items
      computeDiffRecursive(before[i], after[i], itemPath, operations, summary);
    }
  }
}

/**
 * Compute diff for objects
 */
function computeObjectDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string,
  operations: DiffOperation[],
  summary: { added: number; removed: number; modified: number },
): void {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const itemPath = path ? `${path}/${key}` : `/${key}`;

    if (!(key in before)) {
      // Added
      operations.push({ op: 'add', path: itemPath, value: after[key] });
      summary.added++;
    } else if (!(key in after)) {
      // Removed
      operations.push({ op: 'remove', path: itemPath });
      summary.removed++;
    } else {
      // Compare values
      computeDiffRecursive(before[key], after[key], itemPath, operations, summary);
    }
  }
}

/**
 * Generate human-readable diff
 */
export function generateHumanReadableDiff(
  before: unknown,
  after: unknown,
  maskSensitive = true,
): HumanReadableDiff[] {
  const diff = computeDiff(before, after);
  const readable: HumanReadableDiff[] = [];

  for (const op of diff.operations) {
    const field = op.path.replace(/^\//, '').replace(/\//g, '.');
    const isSensitive = maskSensitive && isSensitiveField(field);

    switch (op.op) {
      case 'add':
        readable.push({
          field,
          action: 'added',
          newValue: isSensitive ? '***REDACTED***' : formatValue(op.value),
          masked: isSensitive,
        });
        break;

      case 'remove':
        readable.push({
          field,
          action: 'removed',
          oldValue: isSensitive ? '***REDACTED***' : '(value removed)',
          masked: isSensitive,
        });
        break;

      case 'replace': {
        // Get old value by traversing path
        const oldValue = getValueAtPath(before, op.path);
        readable.push({
          field,
          action: 'changed',
          oldValue: isSensitive ? '***REDACTED***' : formatValue(oldValue),
          newValue: isSensitive ? '***REDACTED***' : formatValue(op.value),
          masked: isSensitive,
        });
        break;
      }
    }
  }

  return readable;
}

/**
 * Convert diff to ChangeRecord array (for audit events)
 */
export function diffToChangeRecords(
  before: unknown,
  after: unknown,
  maskSensitive = true,
): ChangeRecord[] {
  const diff = computeDiff(before, after);
  const changes: ChangeRecord[] = [];

  for (const op of diff.operations) {
    const field = op.path.replace(/^\//, '').replace(/\//g, '.');
    const isSensitive = maskSensitive && isSensitiveField(field);

    switch (op.op) {
      case 'add':
        changes.push({
          field,
          oldValue: null,
          newValue: isSensitive ? '***REDACTED***' : op.value,
        });
        break;

      case 'remove': {
        const oldValue = getValueAtPath(before, op.path);
        changes.push({
          field,
          oldValue: isSensitive ? '***REDACTED***' : oldValue,
          newValue: null,
        });
        break;
      }

      case 'replace': {
        const oldValue = getValueAtPath(before, op.path);
        changes.push({
          field,
          oldValue: isSensitive ? '***REDACTED***' : oldValue,
          newValue: isSensitive ? '***REDACTED***' : op.value,
        });
        break;
      }
    }
  }

  return changes;
}

/**
 * Apply JSONPatch operations to an object
 */
export function applyPatch(obj: unknown, operations: DiffOperation[]): unknown {
  let result = JSON.parse(JSON.stringify(obj)); // Deep clone

  for (const op of operations) {
    result = applyOperation(result, op);
  }

  return result;
}

/**
 * Apply a single JSONPatch operation
 */
function applyOperation(obj: unknown, op: DiffOperation): unknown {
  const parts = op.path.replace(/^\//, '').split('/');

  switch (op.op) {
    case 'add':
    case 'replace':
      return setValueAtPath(obj, parts, op.value);

    case 'remove':
      return removeValueAtPath(obj, parts);

    case 'move':
      if (op.from) {
        const fromParts = op.from.replace(/^\//, '').split('/');
        const value = getValueAtPath(obj, op.from);
        let result = removeValueAtPath(obj, fromParts);
        result = setValueAtPath(result, parts, value);
        return result;
      }
      return obj;

    case 'copy':
      if (op.from) {
        const value = getValueAtPath(obj, op.from);
        return setValueAtPath(obj, parts, value);
      }
      return obj;

    case 'test':
      // Test operation checks if value at path equals expected value
      const value = getValueAtPath(obj, op.path);
      if (JSON.stringify(value) !== JSON.stringify(op.value)) {
        throw new Error(`Test operation failed: ${op.path}`);
      }
      return obj;

    default:
      return obj;
  }
}

/**
 * Get value at JSONPath
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/^\//, '').split('/');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        current = current[index];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set value at JSONPath
 */
function setValueAtPath(obj: unknown, parts: string[], value: unknown): unknown {
  if (parts.length === 0) {
    return value;
  }

  const result = JSON.parse(JSON.stringify(obj)); // Deep clone
  let current: unknown = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (typeof current === 'object' && current !== null) {
      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        if (!current[index]) {
          current[index] = {};
        }
        current = current[index];
      } else {
        const obj = current as Record<string, unknown>;
        if (!(part in obj)) {
          obj[part] = {};
        }
        current = obj[part];
      }
    }
  }

  const lastPart = parts[parts.length - 1];

  if (typeof current === 'object' && current !== null) {
    if (Array.isArray(current)) {
      const index = parseInt(lastPart, 10);
      current[index] = value;
    } else {
      (current as Record<string, unknown>)[lastPart] = value;
    }
  }

  return result;
}

/**
 * Remove value at JSONPath
 */
function removeValueAtPath(obj: unknown, parts: string[]): unknown {
  if (parts.length === 0) {
    return undefined;
  }

  const result = JSON.parse(JSON.stringify(obj)); // Deep clone
  let current: unknown = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (typeof current === 'object' && current !== null) {
      if (Array.isArray(current)) {
        current = current[parseInt(part, 10)];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }
  }

  const lastPart = parts[parts.length - 1];

  if (typeof current === 'object' && current !== null) {
    if (Array.isArray(current)) {
      current.splice(parseInt(lastPart, 10), 1);
    } else {
      delete (current as Record<string, unknown>)[lastPart];
    }
  }

  return result;
}

/**
 * Check if a field is sensitive based on patterns
 */
function isSensitiveField(field: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(field));
}

/**
 * Format value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Generate a summary of changes
 */
export function generateChangeSummary(changes: ChangeRecord[]): string {
  const added = changes.filter((c) => c.oldValue === null).length;
  const removed = changes.filter((c) => c.newValue === null).length;
  const modified = changes.filter((c) => c.oldValue !== null && c.newValue !== null).length;

  const parts = [];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (modified > 0) parts.push(`${modified} modified`);

  return parts.join(', ') || 'no changes';
}

/**
 * Compare two audit events and generate diff
 */
export function compareAuditEvents(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  maskSensitive = true,
): {
  diff: Diff;
  changes: ChangeRecord[];
  humanReadable: HumanReadableDiff[];
  summary: string;
} {
  const diff = computeDiff(before, after);
  const changes = diffToChangeRecords(before, after, maskSensitive);
  const humanReadable = generateHumanReadableDiff(before, after, maskSensitive);
  const summary = generateChangeSummary(changes);

  return {
    diff,
    changes,
    humanReadable,
    summary,
  };
}
