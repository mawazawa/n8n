/**
 * Collaboration Sync
 * Implements Operational Transform for concurrent edits with conflict resolution
 */

import { EventEmitter } from 'events';
import type { CollaborationSession, CollaborationEvent } from './types';

export type OperationType = 'insert' | 'delete' | 'update' | 'move';

export interface Operation {
  id: string;
  type: OperationType;
  userId: string;
  timestamp: number;
  version: number; // Version vector component for this user
  nodeId?: string;
  path: string[]; // JSON path to the property being modified
  value?: unknown;
  oldValue?: unknown;
  position?: number; // For array operations
  metadata?: Record<string, unknown>;
}

export interface VersionVector {
  [userId: string]: number;
}

export interface TransformResult {
  operation: Operation;
  transformed: boolean;
  conflicts: Conflict[];
}

export interface Conflict {
  type: 'concurrent_edit' | 'delete_modified' | 'move_modified' | 'value_mismatch';
  operation1: Operation;
  operation2: Operation;
  resolution?: 'operation1_wins' | 'operation2_wins' | 'merged' | 'manual_required';
  mergedValue?: unknown;
}

export interface LocalState {
  data: Record<string, unknown>;
  versionVector: VersionVector;
  pendingOperations: Operation[];
}

export type MergeStrategy = 'last_write_wins' | 'first_write_wins' | 'custom';

export interface SyncConfig {
  mergeStrategy: MergeStrategy;
  customMerger?: (op1: Operation, op2: Operation) => Operation;
  conflictResolver?: (conflict: Conflict) => Conflict;
}

export class CollaborationSync extends EventEmitter {
  private versionVectors: Map<string, VersionVector> = new Map(); // sessionId -> version vector
  private operationHistory: Map<string, Operation[]> = new Map(); // sessionId -> operations
  private readonly config: SyncConfig;
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor(config?: Partial<SyncConfig>) {
    super();
    this.config = {
      mergeStrategy: 'last_write_wins',
      ...config,
    };
    this.setMaxListeners(100);
  }

  /**
   * Apply an operation to a session with OT
   */
  async applyOperation(
    session: CollaborationSession,
    operation: Operation,
  ): Promise<TransformResult> {
    const sessionId = session.id;

    // Initialize version vector if needed
    if (!this.versionVectors.has(sessionId)) {
      this.versionVectors.set(sessionId, {});
    }

    // Initialize operation history if needed
    if (!this.operationHistory.has(sessionId)) {
      this.operationHistory.set(sessionId, []);
    }

    const versionVector = this.versionVectors.get(sessionId)!;
    const history = this.operationHistory.get(sessionId)!;

    // Update version vector for the user
    if (!versionVector[operation.userId]) {
      versionVector[operation.userId] = 0;
    }
    operation.version = ++versionVector[operation.userId];

    // Find concurrent operations that need transformation
    const concurrentOps = this.findConcurrentOperations(sessionId, operation);

    // Transform operation against concurrent operations
    const transformResult = this.transformOperation(operation, concurrentOps);

    // Add to history
    history.push(transformResult.operation);

    // Trim history if too large
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.splice(0, history.length - this.MAX_HISTORY_SIZE);
    }

    // Emit workflow changed event
    this.emitEvent(sessionId, {
      type: 'workflow_changed',
      userId: operation.userId,
      timestamp: Date.now(),
      data: {
        operation: transformResult.operation,
        conflicts: transformResult.conflicts,
      },
    });

    return transformResult;
  }

  /**
   * Resolve conflict between operations
   */
  resolveConflict(operation: Operation, localState: LocalState): TransformResult {
    const conflicts: Conflict[] = [];

    // Check for conflicts with pending operations
    for (const pendingOp of localState.pendingOperations) {
      const conflict = this.detectConflict(operation, pendingOp);
      if (conflict) {
        // Apply conflict resolution
        const resolvedConflict = this.config.conflictResolver
          ? this.config.conflictResolver(conflict)
          : this.defaultConflictResolver(conflict);
        conflicts.push(resolvedConflict);
      }
    }

    // Transform operation based on conflicts
    let transformedOp = operation;
    let transformed = false;

    if (conflicts.length > 0) {
      transformedOp = this.applyConflictResolutions(operation, conflicts);
      transformed = true;
    }

    return {
      operation: transformedOp,
      transformed,
      conflicts,
    };
  }

  /**
   * Get version vector for a session
   */
  getVersionVector(sessionId: string): VersionVector {
    return this.versionVectors.get(sessionId) || {};
  }

  /**
   * Get operation history for a session
   */
  getHistory(sessionId: string, since?: number): Operation[] {
    const history = this.operationHistory.get(sessionId) || [];

    if (since !== undefined) {
      return history.filter((op) => op.timestamp > since);
    }

    return [...history];
  }

  /**
   * Find concurrent operations that need to be transformed against
   */
  private findConcurrentOperations(sessionId: string, operation: Operation): Operation[] {
    const history = this.operationHistory.get(sessionId) || [];
    const concurrent: Operation[] = [];

    // Find operations that happened after the base version of this operation
    // but before this operation was received
    for (const historicalOp of history) {
      if (
        historicalOp.userId !== operation.userId &&
        historicalOp.timestamp < operation.timestamp &&
        this.operationsOverlap(operation, historicalOp)
      ) {
        concurrent.push(historicalOp);
      }
    }

    return concurrent;
  }

  /**
   * Transform an operation against concurrent operations
   */
  private transformOperation(operation: Operation, concurrentOps: Operation[]): TransformResult {
    const conflicts: Conflict[] = [];
    let transformedOp = { ...operation };
    let transformed = false;

    for (const concurrentOp of concurrentOps) {
      const conflict = this.detectConflict(transformedOp, concurrentOp);

      if (conflict) {
        const resolvedConflict = this.config.conflictResolver
          ? this.config.conflictResolver(conflict)
          : this.defaultConflictResolver(conflict);

        conflicts.push(resolvedConflict);

        // Apply transformation based on resolution
        if (resolvedConflict.resolution === 'operation2_wins') {
          // Concurrent operation wins, transform this operation
          transformedOp = this.transformAgainst(transformedOp, concurrentOp);
          transformed = true;
        } else if (resolvedConflict.resolution === 'merged') {
          // Merge the operations
          transformedOp.value = resolvedConflict.mergedValue;
          transformed = true;
        }
      }
    }

    return {
      operation: transformedOp,
      transformed,
      conflicts,
    };
  }

  /**
   * Detect conflict between two operations
   */
  private detectConflict(op1: Operation, op2: Operation): Conflict | null {
    // Same path means potential conflict
    if (this.pathsEqual(op1.path, op2.path)) {
      // Both updating same property
      if (op1.type === 'update' && op2.type === 'update') {
        return {
          type: 'concurrent_edit',
          operation1: op1,
          operation2: op2,
        };
      }

      // One deleting, one modifying
      if (
        (op1.type === 'delete' && op2.type === 'update') ||
        (op1.type === 'update' && op2.type === 'delete')
      ) {
        return {
          type: 'delete_modified',
          operation1: op1,
          operation2: op2,
        };
      }

      // One moving, one modifying
      if (
        (op1.type === 'move' && op2.type === 'update') ||
        (op1.type === 'update' && op2.type === 'move')
      ) {
        return {
          type: 'move_modified',
          operation1: op1,
          operation2: op2,
        };
      }
    }

    // Check if paths overlap (one is parent of other)
    if (this.pathsOverlap(op1.path, op2.path)) {
      // Parent-child modifications
      if (op1.type === 'delete' || op2.type === 'delete') {
        return {
          type: 'delete_modified',
          operation1: op1,
          operation2: op2,
        };
      }
    }

    return null;
  }

  /**
   * Default conflict resolver using configured merge strategy
   */
  private defaultConflictResolver(conflict: Conflict): Conflict {
    const { mergeStrategy } = this.config;

    if (mergeStrategy === 'last_write_wins') {
      // Later timestamp wins
      conflict.resolution =
        conflict.operation1.timestamp > conflict.operation2.timestamp
          ? 'operation1_wins'
          : 'operation2_wins';
    } else if (mergeStrategy === 'first_write_wins') {
      // Earlier timestamp wins
      conflict.resolution =
        conflict.operation1.timestamp < conflict.operation2.timestamp
          ? 'operation1_wins'
          : 'operation2_wins';
    } else if (mergeStrategy === 'custom' && this.config.customMerger) {
      // Use custom merger
      const mergedOp = this.config.customMerger(conflict.operation1, conflict.operation2);
      conflict.resolution = 'merged';
      conflict.mergedValue = mergedOp.value;
    } else {
      // Require manual resolution
      conflict.resolution = 'manual_required';
    }

    return conflict;
  }

  /**
   * Apply conflict resolutions to an operation
   */
  private applyConflictResolutions(operation: Operation, conflicts: Conflict[]): Operation {
    let transformedOp = { ...operation };

    for (const conflict of conflicts) {
      if (conflict.resolution === 'merged') {
        transformedOp.value = conflict.mergedValue;
      } else if (conflict.resolution === 'operation2_wins') {
        // This operation should be transformed/ignored
        transformedOp.metadata = {
          ...transformedOp.metadata,
          superseded: true,
          supersededBy: conflict.operation2.id,
        };
      }
    }

    return transformedOp;
  }

  /**
   * Transform operation against another operation (OT)
   */
  private transformAgainst(operation: Operation, against: Operation): Operation {
    const transformed = { ...operation };

    // Handle array position adjustments for insert/delete
    if (operation.path[operation.path.length - 1] === against.path[against.path.length - 1]) {
      if (against.type === 'insert' && operation.position !== undefined) {
        // Adjust position if insertion happened before
        if (
          against.position !== undefined &&
          against.position <= operation.position &&
          against.timestamp < operation.timestamp
        ) {
          transformed.position = operation.position + 1;
        }
      } else if (against.type === 'delete' && operation.position !== undefined) {
        // Adjust position if deletion happened before
        if (
          against.position !== undefined &&
          against.position < operation.position &&
          against.timestamp < operation.timestamp
        ) {
          transformed.position = operation.position - 1;
        }
      }
    }

    return transformed;
  }

  /**
   * Check if two operations overlap (one affects the other)
   */
  private operationsOverlap(op1: Operation, op2: Operation): boolean {
    // Same node
    if (op1.nodeId && op2.nodeId && op1.nodeId === op2.nodeId) {
      return true;
    }

    // Same or overlapping paths
    if (this.pathsEqual(op1.path, op2.path) || this.pathsOverlap(op1.path, op2.path)) {
      return true;
    }

    return false;
  }

  /**
   * Check if two paths are equal
   */
  private pathsEqual(path1: string[], path2: string[]): boolean {
    if (path1.length !== path2.length) {
      return false;
    }

    return path1.every((segment, index) => segment === path2[index]);
  }

  /**
   * Check if two paths overlap (one is parent of other)
   */
  private pathsOverlap(path1: string[], path2: string[]): boolean {
    const shorter = path1.length < path2.length ? path1 : path2;
    const longer = path1.length < path2.length ? path2 : path1;

    // Check if shorter path is prefix of longer path
    return shorter.every((segment, index) => segment === longer[index]);
  }

  /**
   * Emit collaboration event
   */
  private emitEvent(sessionId: string, event: CollaborationEvent): void {
    this.emit('event', sessionId, event);
    this.emit(`event:${sessionId}`, event);
    this.emit(`event:${sessionId}:${event.type}`, event);
  }

  /**
   * Clear history for a session
   */
  clearHistory(sessionId: string): void {
    this.operationHistory.delete(sessionId);
    this.versionVectors.delete(sessionId);
  }

  /**
   * Destroy the sync manager and clean up all resources
   */
  async destroy(): Promise<void> {
    this.operationHistory.clear();
    this.versionVectors.clear();
    this.removeAllListeners();
  }
}
