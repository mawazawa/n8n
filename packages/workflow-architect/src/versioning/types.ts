/**
 * Workflow Version Control Type Definitions
 */

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  commitHash: string;
  message: string;
  author: string;
  createdAt: string;
  snapshot: Record<string, unknown>; // Full workflow JSON at this version
  changes: VersionChange[];
}

export interface VersionChange {
  type:
    | 'node_added'
    | 'node_removed'
    | 'node_modified'
    | 'connection_added'
    | 'connection_removed'
    | 'settings_changed'
    | 'name_changed';
  path: string; // JSON path to change
  oldValue?: unknown;
  newValue?: unknown;
}

export interface WorkflowBranch {
  name: string;
  workflowId: string;
  headVersion: number;
  createdAt: string;
  createdBy: string;
  isDefault: boolean;
}

export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  changes: VersionChange[];
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  connectionsAdded: number;
  connectionsRemoved: number;
}

export interface MergeConflict {
  path: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
  resolution?: 'ours' | 'theirs' | 'manual';
}

export interface MergeResult {
  success: boolean;
  conflicts: MergeConflict[];
  merged?: Record<string, unknown>;
  error?: string;
}

export interface RollbackPreview {
  workflowId: string;
  currentVersion: number;
  targetVersion: number;
  changes: VersionChange[];
  affectedNodes: string[];
  affectedConnections: number;
  canRollback: boolean;
  warnings: string[];
}
