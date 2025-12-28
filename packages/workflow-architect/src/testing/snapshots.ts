/**
 * Snapshot Testing for Workflow Outputs
 * Captures and compares workflow output snapshots for regression testing
 */

import fs from 'fs/promises';
import path from 'path';
import { Snapshot, SnapshotMetadata, SnapshotDiff } from './types.js';

/**
 * Main snapshot tester for output comparison
 */
export class SnapshotTester {
  private snapshotDir: string;
  private snapshots: Map<string, Snapshot> = new Map();
  private updateMode = false;

  constructor(snapshotDir: string = './__snapshots__') {
    this.snapshotDir = snapshotDir;
  }

  /**
   * Match data against a snapshot
   */
  async matchSnapshot(name: string, data: unknown): Promise<{
    matched: boolean;
    diff?: SnapshotDiff;
    message?: string;
  }> {
    const snapshotPath = this.getSnapshotPath(name);

    // Check if snapshot exists
    const exists = await this.snapshotExists(snapshotPath);

    if (!exists || this.updateMode) {
      // Create or update snapshot
      await this.createSnapshot(name, data);
      return {
        matched: true,
        message: this.updateMode ? 'Snapshot updated' : 'Snapshot created',
      };
    }

    // Load existing snapshot
    const snapshot = await this.loadSnapshot(snapshotPath);

    // Compare data
    const diff = this.compareData(snapshot.data, data);

    if (this.hasChanges(diff)) {
      return {
        matched: false,
        diff,
        message: 'Snapshot does not match',
      };
    }

    return {
      matched: true,
      message: 'Snapshot matched',
    };
  }

  /**
   * Update a snapshot
   */
  async updateSnapshot(name: string, data?: unknown): Promise<void> {
    if (!data) {
      // Delete snapshot
      const snapshotPath = this.getSnapshotPath(name);
      await fs.unlink(snapshotPath).catch(() => {
        // Ignore if file doesn't exist
      });
      this.snapshots.delete(name);
      return;
    }

    await this.createSnapshot(name, data);
  }

  /**
   * Create a new snapshot
   */
  private async createSnapshot(name: string, data: unknown): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.loadSnapshot(this.getSnapshotPath(name)).catch(() => null);

    const snapshot: Snapshot = {
      id: name,
      metadata: {
        testId: name,
        testName: name,
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
        version: (existing?.metadata.version ?? 0) + 1,
      },
      data: this.serializeData(data),
    };

    // Ensure directory exists
    await fs.mkdir(this.snapshotDir, { recursive: true });

    // Save snapshot
    const snapshotPath = this.getSnapshotPath(name);
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    this.snapshots.set(name, snapshot);
  }

  /**
   * Load a snapshot from disk
   */
  private async loadSnapshot(snapshotPath: string): Promise<Snapshot> {
    const content = await fs.readFile(snapshotPath, 'utf-8');
    return JSON.parse(content) as Snapshot;
  }

  /**
   * Check if snapshot exists
   */
  private async snapshotExists(snapshotPath: string): Promise<boolean> {
    try {
      await fs.access(snapshotPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get snapshot file path
   */
  private getSnapshotPath(name: string): string {
    return path.join(this.snapshotDir, `${name}.snapshot.json`);
  }

  /**
   * Serialize data for storage
   */
  private serializeData(data: unknown): unknown {
    // Handle special types that don't serialize well
    if (data instanceof Date) {
      return { __type: 'Date', value: data.toISOString() };
    }

    if (data instanceof RegExp) {
      return { __type: 'RegExp', value: data.source, flags: data.flags };
    }

    if (data instanceof Set) {
      return { __type: 'Set', value: Array.from(data) };
    }

    if (data instanceof Map) {
      return { __type: 'Map', value: Array.from(data.entries()) };
    }

    if (typeof data === 'function') {
      return { __type: 'Function', value: data.toString() };
    }

    if (Array.isArray(data)) {
      return data.map(item => this.serializeData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.serializeData(value);
      }
      return result;
    }

    return data;
  }

  /**
   * Compare two data objects
   */
  private compareData(expected: unknown, actual: unknown): SnapshotDiff {
    const diff: SnapshotDiff = {
      added: [],
      removed: [],
      changed: [],
    };

    this.compareRecursive(expected, actual, '$', diff);

    return diff;
  }

  /**
   * Recursively compare data
   */
  private compareRecursive(
    expected: unknown,
    actual: unknown,
    path: string,
    diff: SnapshotDiff
  ): void {
    // Type mismatch
    if (typeof expected !== typeof actual) {
      diff.changed.push({
        path,
        oldValue: expected,
        newValue: actual,
      });
      return;
    }

    // Null or primitive
    if (expected === null || typeof expected !== 'object') {
      if (expected !== actual) {
        diff.changed.push({
          path,
          oldValue: expected,
          newValue: actual,
        });
      }
      return;
    }

    // Array comparison
    if (Array.isArray(expected) && Array.isArray(actual)) {
      const maxLength = Math.max(expected.length, actual.length);

      for (let i = 0; i < maxLength; i++) {
        if (i >= expected.length) {
          diff.added.push(`${path}[${i}]`);
        } else if (i >= actual.length) {
          diff.removed.push(`${path}[${i}]`);
        } else {
          this.compareRecursive(expected[i], actual[i], `${path}[${i}]`, diff);
        }
      }

      return;
    }

    // Object comparison
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    const expectedKeys = Object.keys(expectedObj);
    const actualKeys = Object.keys(actualObj);

    // Check for added keys
    for (const key of actualKeys) {
      if (!expectedKeys.includes(key)) {
        diff.added.push(`${path}.${key}`);
      }
    }

    // Check for removed keys
    for (const key of expectedKeys) {
      if (!actualKeys.includes(key)) {
        diff.removed.push(`${path}.${key}`);
      }
    }

    // Check for changed values
    for (const key of expectedKeys) {
      if (actualKeys.includes(key)) {
        this.compareRecursive(
          expectedObj[key],
          actualObj[key],
          `${path}.${key}`,
          diff
        );
      }
    }
  }

  /**
   * Check if diff has any changes
   */
  private hasChanges(diff: SnapshotDiff): boolean {
    return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
  }

  /**
   * Visualize diff
   */
  visualizeDiff(diff: SnapshotDiff): string {
    const lines: string[] = ['Snapshot Diff:'];

    if (diff.added.length > 0) {
      lines.push('\nAdded:');
      for (const path of diff.added) {
        lines.push(`  + ${path}`);
      }
    }

    if (diff.removed.length > 0) {
      lines.push('\nRemoved:');
      for (const path of diff.removed) {
        lines.push(`  - ${path}`);
      }
    }

    if (diff.changed.length > 0) {
      lines.push('\nChanged:');
      for (const change of diff.changed) {
        lines.push(`  ~ ${change.path}`);
        lines.push(`    Expected: ${JSON.stringify(change.oldValue)}`);
        lines.push(`    Received: ${JSON.stringify(change.newValue)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.snapshotDir);
      return files
        .filter(file => file.endsWith('.snapshot.json'))
        .map(file => file.replace('.snapshot.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(name: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(name);
    await fs.unlink(snapshotPath);
    this.snapshots.delete(name);
  }

  /**
   * Delete all snapshots
   */
  async deleteAllSnapshots(): Promise<void> {
    try {
      await fs.rm(this.snapshotDir, { recursive: true });
      this.snapshots.clear();
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Enable update mode
   */
  enableUpdateMode(): void {
    this.updateMode = true;
  }

  /**
   * Disable update mode
   */
  disableUpdateMode(): void {
    this.updateMode = false;
  }

  /**
   * Check if in update mode
   */
  isUpdateMode(): boolean {
    return this.updateMode;
  }

  /**
   * Get snapshot metadata
   */
  async getMetadata(name: string): Promise<SnapshotMetadata | undefined> {
    const snapshotPath = this.getSnapshotPath(name);
    try {
      const snapshot = await this.loadSnapshot(snapshotPath);
      return snapshot.metadata;
    } catch {
      return undefined;
    }
  }

  /**
   * Export snapshot as JSON
   */
  async exportSnapshot(name: string): Promise<string | undefined> {
    const snapshotPath = this.getSnapshotPath(name);
    try {
      const snapshot = await this.loadSnapshot(snapshotPath);
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return undefined;
    }
  }

  /**
   * Import snapshot from JSON
   */
  async importSnapshot(name: string, json: string): Promise<void> {
    const snapshot = JSON.parse(json) as Snapshot;
    snapshot.id = name;

    // Ensure directory exists
    await fs.mkdir(this.snapshotDir, { recursive: true });

    const snapshotPath = this.getSnapshotPath(name);
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    this.snapshots.set(name, snapshot);
  }
}

/**
 * Snapshot matcher for inline snapshot assertions
 */
export class SnapshotMatcher {
  constructor(private tester: SnapshotTester) {}

  /**
   * Assert that value matches snapshot
   */
  async toMatchSnapshot(testId: string, value: unknown): Promise<boolean> {
    const result = await this.tester.matchSnapshot(testId, value);
    return result.matched;
  }

  /**
   * Assert inline snapshot
   */
  async toMatchInlineSnapshot(value: unknown, inlineSnapshot?: unknown): Promise<boolean> {
    if (inlineSnapshot === undefined) {
      // Update mode or first run
      return true;
    }

    const diff = this.tester['compareData'](inlineSnapshot, value);
    return !this.tester['hasChanges'](diff);
  }
}

/**
 * Utility functions for snapshot testing
 */
export class SnapshotUtils {
  /**
   * Sanitize data before snapshotting (remove dynamic values)
   */
  static sanitize(data: unknown, options?: {
    removeTimestamps?: boolean;
    removeIds?: boolean;
    removeDates?: boolean;
  }): unknown {
    const opts = {
      removeTimestamps: true,
      removeIds: true,
      removeDates: true,
      ...options,
    };

    return this.sanitizeRecursive(data, opts);
  }

  /**
   * Recursively sanitize data
   */
  private static sanitizeRecursive(
    data: unknown,
    options: Required<NonNullable<Parameters<typeof SnapshotUtils.sanitize>[1]>>
  ): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeRecursive(item, options));
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      // Remove dynamic fields
      if (options.removeIds && (key === 'id' || key.endsWith('Id'))) {
        result[key] = '<ID>';
        continue;
      }

      if (options.removeTimestamps && (key === 'timestamp' || key.endsWith('Timestamp'))) {
        result[key] = '<TIMESTAMP>';
        continue;
      }

      if (options.removeDates && (key.includes('Date') || key.includes('date') || key === 'createdAt' || key === 'updatedAt')) {
        result[key] = '<DATE>';
        continue;
      }

      result[key] = this.sanitizeRecursive(value, options);
    }

    return result;
  }

  /**
   * Sort object keys for consistent snapshots
   */
  static sortKeys(data: unknown): unknown {
    if (data === null || data === undefined || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sortKeys(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(data).sort();

    for (const key of keys) {
      sorted[key] = this.sortKeys((data as Record<string, unknown>)[key]);
    }

    return sorted;
  }
}
