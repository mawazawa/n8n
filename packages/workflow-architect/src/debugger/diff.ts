/**
 * Diff Generator
 * Generates input/output diffs with JSON-aware comparison
 */

import type { Diff, DiffChange, DiffChangeType } from './types.js';

export class DiffGenerator {
  /**
   * Generate diff between input and output
   */
  generateDiff(
    input: unknown,
    output: unknown,
    mode: 'side-by-side' | 'inline' = 'side-by-side',
  ): Diff {
    const changes = this.compareObjects('', input, output);

    const summary = {
      additions: changes.filter((c) => c.type === 'add').length,
      deletions: changes.filter((c) => c.type === 'remove').length,
      modifications: changes.filter((c) => c.type === 'modify').length,
    };

    const formatted = mode === 'side-by-side'
      ? this.formatSideBySide(input, output, changes)
      : this.formatInline(input, output, changes);

    return {
      mode,
      changes,
      summary,
      formatted,
    };
  }

  /**
   * Compare two objects recursively
   */
  private compareObjects(
    path: string,
    oldValue: unknown,
    newValue: unknown,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    // Handle null/undefined
    if (oldValue === null && newValue === null) {
      return changes;
    }

    if (oldValue === undefined && newValue === undefined) {
      return changes;
    }

    // Value was removed
    if (newValue === undefined || newValue === null) {
      changes.push({
        type: 'remove',
        path: path || '(root)',
        oldValue,
      });
      return changes;
    }

    // Value was added
    if (oldValue === undefined || oldValue === null) {
      changes.push({
        type: 'add',
        path: path || '(root)',
        newValue,
      });
      return changes;
    }

    const oldType = this.getType(oldValue);
    const newType = this.getType(newValue);

    // Type changed
    if (oldType !== newType) {
      changes.push({
        type: 'modify',
        path: path || '(root)',
        oldValue,
        newValue,
      });
      return changes;
    }

    // Primitives
    if (oldType === 'primitive') {
      if (oldValue !== newValue) {
        changes.push({
          type: 'modify',
          path: path || '(root)',
          oldValue,
          newValue,
        });
      }
      return changes;
    }

    // Arrays
    if (oldType === 'array') {
      return this.compareArrays(path, oldValue as unknown[], newValue as unknown[]);
    }

    // Objects
    if (oldType === 'object') {
      return this.compareObjectProperties(
        path,
        oldValue as Record<string, unknown>,
        newValue as Record<string, unknown>,
      );
    }

    return changes;
  }

  /**
   * Compare arrays
   */
  private compareArrays(path: string, oldArray: unknown[], newArray: unknown[]): DiffChange[] {
    const changes: DiffChange[] = [];

    const maxLength = Math.max(oldArray.length, newArray.length);

    for (let i = 0; i < maxLength; i++) {
      const itemPath = `${path}[${i}]`;
      changes.push(...this.compareObjects(itemPath, oldArray[i], newArray[i]));
    }

    return changes;
  }

  /**
   * Compare object properties
   */
  private compareObjectProperties(
    path: string,
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
  ): DiffChange[] {
    const changes: DiffChange[] = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const propPath = path ? `${path}.${key}` : key;
      changes.push(...this.compareObjects(propPath, oldObj[key], newObj[key]));
    }

    return changes;
  }

  /**
   * Get type of value
   */
  private getType(value: unknown): 'primitive' | 'array' | 'object' | 'null' {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'primitive';
  }

  /**
   * Format diff as side-by-side
   */
  private formatSideBySide(input: unknown, output: unknown, changes: DiffChange[]): string {
    const inputStr = JSON.stringify(input, null, 2);
    const outputStr = JSON.stringify(output, null, 2);

    const inputLines = inputStr.split('\n');
    const outputLines = outputStr.split('\n');

    const maxLength = Math.max(inputLines.length, outputLines.length);
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────┬─────────────────────────────────────┐');
    lines.push('│ INPUT                               │ OUTPUT                              │');
    lines.push('├─────────────────────────────────────┼─────────────────────────────────────┤');

    for (let i = 0; i < maxLength; i++) {
      const left = (inputLines[i] || '').padEnd(35);
      const right = (outputLines[i] || '').padEnd(35);
      lines.push(`│ ${left} │ ${right} │`);
    }

    lines.push('└─────────────────────────────────────┴─────────────────────────────────────┘');

    return lines.join('\n');
  }

  /**
   * Format diff as inline
   */
  private formatInline(input: unknown, output: unknown, changes: DiffChange[]): string {
    const lines: string[] = [];

    for (const change of changes) {
      const symbol = this.getChangeSymbol(change.type);

      if (change.type === 'remove') {
        lines.push(`${symbol} ${change.path}: ${JSON.stringify(change.oldValue)}`);
      } else if (change.type === 'add') {
        lines.push(`${symbol} ${change.path}: ${JSON.stringify(change.newValue)}`);
      } else if (change.type === 'modify') {
        lines.push(`- ${change.path}: ${JSON.stringify(change.oldValue)}`);
        lines.push(`+ ${change.path}: ${JSON.stringify(change.newValue)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get symbol for change type
   */
  private getChangeSymbol(type: DiffChangeType): string {
    switch (type) {
      case 'add':
        return '+';
      case 'remove':
        return '-';
      case 'modify':
        return '~';
      case 'none':
        return ' ';
    }
  }

  /**
   * Generate color-coded HTML diff
   */
  generateHTMLDiff(input: unknown, output: unknown): string {
    const diff = this.generateDiff(input, output, 'inline');

    const lines = diff.formatted!.split('\n').map((line) => {
      if (line.startsWith('+')) {
        return `<div class="diff-add">${this.escapeHTML(line)}</div>`;
      } else if (line.startsWith('-')) {
        return `<div class="diff-remove">${this.escapeHTML(line)}</div>`;
      } else if (line.startsWith('~')) {
        return `<div class="diff-modify">${this.escapeHTML(line)}</div>`;
      } else {
        return `<div class="diff-none">${this.escapeHTML(line)}</div>`;
      }
    });

    return `
      <style>
        .diff-add { background: #d4ffd4; color: #006600; }
        .diff-remove { background: #ffd4d4; color: #660000; }
        .diff-modify { background: #ffffd4; color: #666600; }
        .diff-none { color: #666; }
      </style>
      <div class="diff-container">
        ${lines.join('\n')}
      </div>
    `;
  }

  /**
   * Escape HTML entities
   */
  private escapeHTML(text: string): string {
    const div = { textContent: text } as { innerHTML?: string };
    return div.innerHTML || text;
  }

  /**
   * Compare two workflow executions
   */
  compareExecutions(
    baseline: Record<string, unknown>,
    current: Record<string, unknown>,
  ): {
    nodeChanges: Array<{
      nodeId: string;
      hasChanges: boolean;
      diff: Diff;
    }>;
    totalChanges: number;
  } {
    const nodeChanges: Array<{
      nodeId: string;
      hasChanges: boolean;
      diff: Diff;
    }> = [];

    const allNodeIds = new Set([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);

    let totalChanges = 0;

    for (const nodeId of allNodeIds) {
      const diff = this.generateDiff(baseline[nodeId], current[nodeId]);
      const hasChanges =
        diff.summary.additions > 0 ||
        diff.summary.deletions > 0 ||
        diff.summary.modifications > 0;

      if (hasChanges) {
        totalChanges++;
      }

      nodeChanges.push({
        nodeId,
        hasChanges,
        diff,
      });
    }

    return {
      nodeChanges,
      totalChanges,
    };
  }

  /**
   * Get a summary of changes
   */
  getSummary(diff: Diff): string {
    const { additions, deletions, modifications } = diff.summary;
    const parts: string[] = [];

    if (additions > 0) {
      parts.push(`${additions} addition${additions > 1 ? 's' : ''}`);
    }

    if (deletions > 0) {
      parts.push(`${deletions} deletion${deletions > 1 ? 's' : ''}`);
    }

    if (modifications > 0) {
      parts.push(`${modifications} modification${modifications > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      return 'No changes';
    }

    return parts.join(', ');
  }
}

/**
 * Create a diff generator instance
 */
export function createDiffGenerator(): DiffGenerator {
  return new DiffGenerator();
}
