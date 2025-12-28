/**
 * WorkflowDiff - Generate detailed diffs between workflow versions
 */

import type { VersionDiff, VersionChange, WorkflowVersion } from './types';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnections,
  WorkflowSettings,
} from '../types/workflow';

export class WorkflowDiff {
  /**
   * Generate a complete diff between two versions
   */
  diff(versionA: WorkflowVersion, versionB: WorkflowVersion): VersionDiff {
    const workflowA = versionA.snapshot as unknown as WorkflowDefinition;
    const workflowB = versionB.snapshot as unknown as WorkflowDefinition;

    const changes: VersionChange[] = [];
    const nodesAdded: string[] = [];
    const nodesRemoved: string[] = [];
    const nodesModified: string[] = [];

    // Diff nodes
    const nodeDiff = this.diffNodes(workflowA.nodes, workflowB.nodes);
    changes.push(...nodeDiff.changes);
    nodesAdded.push(...nodeDiff.added);
    nodesRemoved.push(...nodeDiff.removed);
    nodesModified.push(...nodeDiff.modified);

    // Diff connections
    const connectionDiff = this.diffConnections(
      workflowA.connections || {},
      workflowB.connections || {},
    );
    changes.push(...connectionDiff.changes);

    // Diff workflow-level properties
    if (workflowA.name !== workflowB.name) {
      changes.push({
        type: 'name_changed',
        path: 'workflow.name',
        oldValue: workflowA.name,
        newValue: workflowB.name,
      });
    }

    // Diff settings
    const settingsChanges = this.diffSettings(workflowA.settings, workflowB.settings);
    changes.push(...settingsChanges);

    return {
      fromVersion: versionA.version,
      toVersion: versionB.version,
      changes,
      nodesAdded,
      nodesRemoved,
      nodesModified,
      connectionsAdded: connectionDiff.added,
      connectionsRemoved: connectionDiff.removed,
    };
  }

  /**
   * Generate node-level diff
   */
  diffNodes(
    nodesA: WorkflowNode[],
    nodesB: WorkflowNode[],
  ): {
    changes: VersionChange[];
    added: string[];
    removed: string[];
    modified: string[];
  } {
    const changes: VersionChange[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    const nodesAMap = new Map(nodesA.map((n) => [n.id, n]));
    const nodesBMap = new Map(nodesB.map((n) => [n.id, n]));

    // Find added nodes
    for (const [id, node] of Array.from(nodesBMap.entries())) {
      if (!nodesAMap.has(id)) {
        added.push(id);
        changes.push({
          type: 'node_added',
          path: `nodes.${id}`,
          newValue: node,
        });
      }
    }

    // Find removed and modified nodes
    for (const [id, nodeA] of Array.from(nodesAMap.entries())) {
      if (!nodesBMap.has(id)) {
        removed.push(id);
        changes.push({
          type: 'node_removed',
          path: `nodes.${id}`,
          oldValue: nodeA,
        });
      } else {
        const nodeB = nodesBMap.get(id)!;
        const nodeChanges = this.diffNodeDetails(nodeA, nodeB, id);
        if (nodeChanges.length > 0) {
          modified.push(id);
          changes.push(...nodeChanges);
        }
      }
    }

    return { changes, added, removed, modified };
  }

  /**
   * Detailed diff for a single node
   */
  private diffNodeDetails(nodeA: WorkflowNode, nodeB: WorkflowNode, nodeId: string): VersionChange[] {
    const changes: VersionChange[] = [];

    // Check each property
    if (nodeA.name !== nodeB.name) {
      changes.push({
        type: 'node_modified',
        path: `nodes.${nodeId}.name`,
        oldValue: nodeA.name,
        newValue: nodeB.name,
      });
    }

    if (nodeA.type !== nodeB.type) {
      changes.push({
        type: 'node_modified',
        path: `nodes.${nodeId}.type`,
        oldValue: nodeA.type,
        newValue: nodeB.type,
      });
    }

    if (nodeA.disabled !== nodeB.disabled) {
      changes.push({
        type: 'node_modified',
        path: `nodes.${nodeId}.disabled`,
        oldValue: nodeA.disabled,
        newValue: nodeB.disabled,
      });
    }

    // Check position
    if (
      nodeA.position[0] !== nodeB.position[0] ||
      nodeA.position[1] !== nodeB.position[1]
    ) {
      changes.push({
        type: 'node_modified',
        path: `nodes.${nodeId}.position`,
        oldValue: nodeA.position,
        newValue: nodeB.position,
      });
    }

    // Check parameters
    const paramChanges = this.diffParameters(
      nodeA.parameters,
      nodeB.parameters,
      `nodes.${nodeId}.parameters`,
    );
    changes.push(...paramChanges);

    return changes;
  }

  /**
   * Diff connection structures
   */
  diffConnections(
    connectionsA: WorkflowConnections,
    connectionsB: WorkflowConnections,
  ): {
    changes: VersionChange[];
    added: number;
    removed: number;
  } {
    const changes: VersionChange[] = [];
    let added = 0;
    let removed = 0;

    const sourceNodesA = new Set(Object.keys(connectionsA));
    const sourceNodesB = new Set(Object.keys(connectionsB));

    // Check for added source nodes
    for (const sourceNode of Array.from(sourceNodesB)) {
      if (!sourceNodesA.has(sourceNode)) {
        const connectionCount = this.countConnections(connectionsB[sourceNode]);
        added += connectionCount;
        changes.push({
          type: 'connection_added',
          path: `connections.${sourceNode}`,
          newValue: connectionsB[sourceNode],
        });
      }
    }

    // Check for removed source nodes
    for (const sourceNode of Array.from(sourceNodesA)) {
      if (!sourceNodesB.has(sourceNode)) {
        const connectionCount = this.countConnections(connectionsA[sourceNode]);
        removed += connectionCount;
        changes.push({
          type: 'connection_removed',
          path: `connections.${sourceNode}`,
          oldValue: connectionsA[sourceNode],
        });
      }
    }

    // Check for modified connections on same source nodes
    for (const sourceNode of Array.from(sourceNodesA)) {
      if (sourceNodesB.has(sourceNode)) {
        const connA = connectionsA[sourceNode];
        const connB = connectionsB[sourceNode];

        if (JSON.stringify(connA) !== JSON.stringify(connB)) {
          const countA = this.countConnections(connA);
          const countB = this.countConnections(connB);

          if (countB > countA) {
            added += countB - countA;
            changes.push({
              type: 'connection_added',
              path: `connections.${sourceNode}`,
              oldValue: connA,
              newValue: connB,
            });
          } else if (countA > countB) {
            removed += countA - countB;
            changes.push({
              type: 'connection_removed',
              path: `connections.${sourceNode}`,
              oldValue: connA,
              newValue: connB,
            });
          }
        }
      }
    }

    return { changes, added, removed };
  }

  /**
   * Count total connections from a source node
   */
  private countConnections(connectionTypes: {
    [connectionType: string]: Array<Array<{ node: string; type: string; index: number }>>;
  }): number {
    let count = 0;
    for (const outputs of Object.values(connectionTypes)) {
      for (const outputGroup of outputs) {
        count += outputGroup.length;
      }
    }
    return count;
  }

  /**
   * Diff node parameters (recursive)
   */
  diffParameters(
    paramsA: Record<string, unknown>,
    paramsB: Record<string, unknown>,
    basePath: string,
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    const allKeys = new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]);

    for (const key of Array.from(allKeys)) {
      const path = `${basePath}.${key}`;
      const valueA = paramsA[key];
      const valueB = paramsB[key];

      if (!(key in paramsA)) {
        // Parameter added
        changes.push({
          type: 'node_modified',
          path,
          newValue: valueB,
        });
      } else if (!(key in paramsB)) {
        // Parameter removed
        changes.push({
          type: 'node_modified',
          path,
          oldValue: valueA,
        });
      } else if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
        // Parameter changed
        changes.push({
          type: 'node_modified',
          path,
          oldValue: valueA,
          newValue: valueB,
        });
      }
    }

    return changes;
  }

  /**
   * Diff workflow settings
   */
  private diffSettings(
    settingsA: Record<string, unknown> | undefined | WorkflowSettings,
    settingsB: Record<string, unknown> | undefined | WorkflowSettings,
  ): VersionChange[] {
    const changes: VersionChange[] = [];

    const a = settingsA || {};
    const b = settingsB || {};

    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({
        type: 'settings_changed',
        path: 'workflow.settings',
        oldValue: a,
        newValue: b,
      });
    }

    return changes;
  }

  /**
   * Generate human-readable summary of diff
   */
  summarizeDiff(diff: VersionDiff): string {
    const summary: string[] = [];

    summary.push(`Diff from version ${diff.fromVersion} to ${diff.toVersion}`);
    summary.push('');

    // Node changes
    if (diff.nodesAdded.length > 0) {
      summary.push(`Nodes added (${diff.nodesAdded.length}):`);
      diff.nodesAdded.forEach((id) => {
        summary.push(`  + ${id}`);
      });
    }

    if (diff.nodesRemoved.length > 0) {
      summary.push(`Nodes removed (${diff.nodesRemoved.length}):`);
      diff.nodesRemoved.forEach((id) => {
        summary.push(`  - ${id}`);
      });
    }

    if (diff.nodesModified.length > 0) {
      summary.push(`Nodes modified (${diff.nodesModified.length}):`);
      diff.nodesModified.forEach((id) => {
        summary.push(`  ~ ${id}`);
      });
    }

    // Connection changes
    if (diff.connectionsAdded > 0 || diff.connectionsRemoved > 0) {
      summary.push('');
      summary.push('Connection changes:');
      if (diff.connectionsAdded > 0) {
        summary.push(`  + ${diff.connectionsAdded} added`);
      }
      if (diff.connectionsRemoved > 0) {
        summary.push(`  - ${diff.connectionsRemoved} removed`);
      }
    }

    // Other changes
    const otherChanges = diff.changes.filter(
      (c) =>
        c.type === 'name_changed' || c.type === 'settings_changed',
    );

    if (otherChanges.length > 0) {
      summary.push('');
      summary.push('Other changes:');
      otherChanges.forEach((change) => {
        summary.push(`  ~ ${change.type}: ${change.path}`);
      });
    }

    if (diff.changes.length === 0) {
      return 'No changes detected';
    }

    return summary.join('\n');
  }
}
