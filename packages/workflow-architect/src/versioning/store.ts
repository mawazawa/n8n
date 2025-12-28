/**
 * VersionStore - In-memory and Supabase storage for workflow versions
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowVersion, VersionChange } from './types';
import type { WorkflowDefinition } from '../types/workflow';

export interface VersionStoreOptions {
  supabase?: SupabaseClient;
  persistToSupabase?: boolean;
}

export class VersionStore {
  private versions: Map<string, Map<number, WorkflowVersion>> = new Map();
  private supabase?: SupabaseClient;
  private persistToSupabase: boolean;

  constructor(options: VersionStoreOptions = {}) {
    this.supabase = options.supabase;
    this.persistToSupabase = options.persistToSupabase ?? false;
  }

  /**
   * Generate a deterministic hash for a workflow
   */
  private generateHash(workflow: Record<string, unknown>): string {
    // Create a deterministic string representation
    const normalized = this.normalizeForHash(workflow);
    const jsonString = JSON.stringify(normalized);
    return createHash('sha256').update(jsonString).digest('hex').substring(0, 16);
  }

  /**
   * Normalize workflow object for deterministic hashing
   */
  private normalizeForHash(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizeForHash(item));
    }

    if (typeof obj === 'object') {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(obj as Record<string, unknown>).sort();

      for (const key of keys) {
        // Skip volatile fields that shouldn't affect the hash
        if (['id', 'createdAt', 'updatedAt', 'version'].includes(key)) {
          continue;
        }
        sorted[key] = this.normalizeForHash((obj as Record<string, unknown>)[key]);
      }

      return sorted;
    }

    return obj;
  }

  /**
   * Calculate changes between two workflow snapshots
   */
  private calculateChanges(
    previous: Record<string, unknown> | null,
    current: Record<string, unknown>,
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    if (!previous) {
      changes.push({
        type: 'name_changed',
        path: 'workflow.created',
        newValue: current.name,
      });
      return changes;
    }

    const prevWorkflow = previous as unknown as WorkflowDefinition;
    const currWorkflow = current as unknown as WorkflowDefinition;

    // Check name change
    if (prevWorkflow.name !== currWorkflow.name) {
      changes.push({
        type: 'name_changed',
        path: 'workflow.name',
        oldValue: prevWorkflow.name,
        newValue: currWorkflow.name,
      });
    }

    // Check settings changes
    const prevSettings = JSON.stringify(prevWorkflow.settings || {});
    const currSettings = JSON.stringify(currWorkflow.settings || {});
    if (prevSettings !== currSettings) {
      changes.push({
        type: 'settings_changed',
        path: 'workflow.settings',
        oldValue: prevWorkflow.settings,
        newValue: currWorkflow.settings,
      });
    }

    // Check nodes
    const prevNodes = new Map(prevWorkflow.nodes.map((n) => [n.id, n]));
    const currNodes = new Map(currWorkflow.nodes.map((n) => [n.id, n]));

    // Detect added nodes
    for (const [id, node] of Array.from(currNodes.entries())) {
      if (!prevNodes.has(id)) {
        changes.push({
          type: 'node_added',
          path: `nodes.${id}`,
          newValue: node,
        });
      }
    }

    // Detect removed and modified nodes
    for (const [id, prevNode] of Array.from(prevNodes.entries())) {
      if (!currNodes.has(id)) {
        changes.push({
          type: 'node_removed',
          path: `nodes.${id}`,
          oldValue: prevNode,
        });
      } else {
        const currNode = currNodes.get(id)!;
        if (JSON.stringify(prevNode) !== JSON.stringify(currNode)) {
          changes.push({
            type: 'node_modified',
            path: `nodes.${id}`,
            oldValue: prevNode,
            newValue: currNode,
          });
        }
      }
    }

    // Check connections
    const prevConnStr = JSON.stringify(prevWorkflow.connections || {});
    const currConnStr = JSON.stringify(currWorkflow.connections || {});

    if (prevConnStr !== currConnStr) {
      const prevConns = prevWorkflow.connections || {};
      const currConns = currWorkflow.connections || {};

      // Count connection changes (simplified)
      for (const sourceNode of Object.keys(currConns)) {
        if (!prevConns[sourceNode]) {
          changes.push({
            type: 'connection_added',
            path: `connections.${sourceNode}`,
            newValue: currConns[sourceNode],
          });
        } else if (
          JSON.stringify(prevConns[sourceNode]) !== JSON.stringify(currConns[sourceNode])
        ) {
          changes.push({
            type: 'connection_added',
            path: `connections.${sourceNode}`,
            oldValue: prevConns[sourceNode],
            newValue: currConns[sourceNode],
          });
        }
      }

      for (const sourceNode of Object.keys(prevConns)) {
        if (!currConns[sourceNode]) {
          changes.push({
            type: 'connection_removed',
            path: `connections.${sourceNode}`,
            oldValue: prevConns[sourceNode],
          });
        }
      }
    }

    return changes;
  }

  /**
   * Create a new version for a workflow
   */
  async createVersion(
    workflowId: string,
    workflow: WorkflowDefinition,
    message: string,
    author: string,
  ): Promise<WorkflowVersion> {
    // Get previous version for change calculation
    const latestVersion = await this.getLatestVersion(workflowId);
    const previousSnapshot = latestVersion?.snapshot || null;

    // Create workflow snapshot
    const snapshot = JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;

    // Calculate version number
    const versionNumber = latestVersion ? latestVersion.version + 1 : 1;

    // Generate hash
    const commitHash = this.generateHash(snapshot);

    // Calculate changes
    const changes = this.calculateChanges(previousSnapshot, snapshot);

    // Create version object
    const version: WorkflowVersion = {
      id: uuidv4(),
      workflowId,
      version: versionNumber,
      commitHash,
      message,
      author,
      createdAt: new Date().toISOString(),
      snapshot,
      changes,
    };

    // Store in memory
    if (!this.versions.has(workflowId)) {
      this.versions.set(workflowId, new Map());
    }
    this.versions.get(workflowId)!.set(versionNumber, version);

    // Persist to Supabase if enabled
    if (this.persistToSupabase && this.supabase) {
      await this.persistVersionToSupabase(version);
    }

    return version;
  }

  /**
   * Persist version to Supabase
   */
  private async persistVersionToSupabase(version: WorkflowVersion): Promise<void> {
    if (!this.supabase) {
      return;
    }

    try {
      const { error } = await this.supabase.from('workflow_versions').insert({
        id: version.id,
        workflow_id: version.workflowId,
        version: version.version,
        commit_hash: version.commitHash,
        message: version.message,
        author: version.author,
        created_at: version.createdAt,
        snapshot: version.snapshot,
        changes: version.changes,
      });

      if (error) {
        console.error('Failed to persist version to Supabase:', error);
      }
    } catch (error) {
      console.error('Error persisting version:', error);
    }
  }

  /**
   * Get a specific version
   */
  async getVersion(workflowId: string, version: number): Promise<WorkflowVersion | null> {
    // Try memory first
    const workflowVersions = this.versions.get(workflowId);
    if (workflowVersions?.has(version)) {
      return workflowVersions.get(version)!;
    }

    // Try Supabase if enabled
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('workflow_versions')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('version', version)
          .single();

        if (data && !error) {
          const versionObj: WorkflowVersion = {
            id: data.id,
            workflowId: data.workflow_id,
            version: data.version,
            commitHash: data.commit_hash,
            message: data.message,
            author: data.author,
            createdAt: data.created_at,
            snapshot: data.snapshot as Record<string, unknown>,
            changes: data.changes as VersionChange[],
          };

          // Cache in memory
          if (!this.versions.has(workflowId)) {
            this.versions.set(workflowId, new Map());
          }
          this.versions.get(workflowId)!.set(version, versionObj);

          return versionObj;
        }
      } catch (error) {
        console.error('Error fetching version from Supabase:', error);
      }
    }

    return null;
  }

  /**
   * Get version history for a workflow
   */
  async getHistory(workflowId: string, limit?: number): Promise<WorkflowVersion[]> {
    // Try Supabase first if enabled
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('workflow_versions')
          .select('*')
          .eq('workflow_id', workflowId)
          .order('version', { ascending: false });

        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } = await query;

        if (data && !error) {
          return data.map((d) => ({
            id: d.id,
            workflowId: d.workflow_id,
            version: d.version,
            commitHash: d.commit_hash,
            message: d.message,
            author: d.author,
            createdAt: d.created_at,
            snapshot: d.snapshot as Record<string, unknown>,
            changes: d.changes as VersionChange[],
          }));
        }
      } catch (error) {
        console.error('Error fetching history from Supabase:', error);
      }
    }

    // Fallback to memory
    const workflowVersions = this.versions.get(workflowId);
    if (!workflowVersions) {
      return [];
    }

    const versions = Array.from(workflowVersions.values()).sort(
      (a, b) => b.version - a.version,
    );

    return limit ? versions.slice(0, limit) : versions;
  }

  /**
   * Get the latest version
   */
  async getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const history = await this.getHistory(workflowId, 1);
    return history.length > 0 ? history[0] : null;
  }

  /**
   * Delete a version
   */
  async deleteVersion(workflowId: string, version: number): Promise<boolean> {
    // Remove from memory
    const workflowVersions = this.versions.get(workflowId);
    if (workflowVersions) {
      workflowVersions.delete(version);
    }

    // Remove from Supabase if enabled
    if (this.persistToSupabase && this.supabase) {
      try {
        const { error } = await this.supabase
          .from('workflow_versions')
          .delete()
          .eq('workflow_id', workflowId)
          .eq('version', version);

        if (error) {
          console.error('Failed to delete version from Supabase:', error);
          return false;
        }
      } catch (error) {
        console.error('Error deleting version:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Clear all versions for a workflow
   */
  async clearWorkflow(workflowId: string): Promise<void> {
    this.versions.delete(workflowId);

    if (this.persistToSupabase && this.supabase) {
      try {
        await this.supabase.from('workflow_versions').delete().eq('workflow_id', workflowId);
      } catch (error) {
        console.error('Error clearing workflow versions:', error);
      }
    }
  }

  /**
   * Get all workflow IDs with versions
   */
  getWorkflowIds(): string[] {
    return Array.from(this.versions.keys());
  }
}
