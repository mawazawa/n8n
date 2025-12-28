/**
 * WorkflowMerge - Three-way merge for workflow versions
 */

import type { MergeConflict, MergeResult } from './types';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnections,
} from '../types/workflow';

export class WorkflowMerge {
  /**
   * Perform a three-way merge of workflows
   * @param base - Common ancestor version
   * @param ours - Our version
   * @param theirs - Their version
   */
  merge(
    base: WorkflowDefinition,
    ours: WorkflowDefinition,
    theirs: WorkflowDefinition,
  ): MergeResult {
    const conflicts: MergeConflict[] = [];

    // Detect conflicts first
    const detectedConflicts = this.detectConflicts(base, ours, theirs);
    conflicts.push(...detectedConflicts);

    // If there are unresolved conflicts, return early
    if (conflicts.length > 0) {
      return {
        success: false,
        conflicts,
      };
    }

    // Perform the merge
    try {
      const merged = this.performMerge(base, ours, theirs);
      return {
        success: true,
        conflicts: [],
        merged: merged as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return {
        success: false,
        conflicts,
        error: error instanceof Error ? error.message : 'Unknown merge error',
      };
    }
  }

  /**
   * Detect all conflicts between versions
   */
  detectConflicts(
    base: WorkflowDefinition,
    ours: WorkflowDefinition,
    theirs: WorkflowDefinition,
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    // Check name conflicts
    if (base.name !== ours.name && base.name !== theirs.name && ours.name !== theirs.name) {
      conflicts.push({
        path: 'workflow.name',
        base: base.name,
        ours: ours.name,
        theirs: theirs.name,
      });
    }

    // Check settings conflicts
    const baseSettings = JSON.stringify(base.settings || {});
    const oursSettings = JSON.stringify(ours.settings || {});
    const theirsSettings = JSON.stringify(theirs.settings || {});

    if (
      baseSettings !== oursSettings &&
      baseSettings !== theirsSettings &&
      oursSettings !== theirsSettings
    ) {
      conflicts.push({
        path: 'workflow.settings',
        base: base.settings,
        ours: ours.settings,
        theirs: theirs.settings,
      });
    }

    // Check node conflicts
    const nodeConflicts = this.detectNodeConflicts(base.nodes, ours.nodes, theirs.nodes);
    conflicts.push(...nodeConflicts);

    // Check connection conflicts
    const connectionConflicts = this.detectConnectionConflicts(
      base.connections || {},
      ours.connections || {},
      theirs.connections || {},
    );
    conflicts.push(...connectionConflicts);

    return conflicts;
  }

  /**
   * Detect conflicts in nodes
   */
  private detectNodeConflicts(
    baseNodes: WorkflowNode[],
    oursNodes: WorkflowNode[],
    theirsNodes: WorkflowNode[],
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    const baseMap = new Map(baseNodes.map((n) => [n.id, n]));
    const oursMap = new Map(oursNodes.map((n) => [n.id, n]));
    const theirsMap = new Map(theirsNodes.map((n) => [n.id, n]));

    // Check all node IDs that exist in any version
    const allNodeIds = new Set([
      ...Array.from(baseMap.keys()),
      ...Array.from(oursMap.keys()),
      ...Array.from(theirsMap.keys()),
    ]);

    for (const nodeId of Array.from(allNodeIds)) {
      const baseNode = baseMap.get(nodeId);
      const oursNode = oursMap.get(nodeId);
      const theirsNode = theirsMap.get(nodeId);

      // Case 1: Node deleted in both - no conflict
      if (!oursNode && !theirsNode) {
        continue;
      }

      // Case 2: Node added in both with different content
      if (!baseNode && oursNode && theirsNode) {
        if (JSON.stringify(oursNode) !== JSON.stringify(theirsNode)) {
          conflicts.push({
            path: `nodes.${nodeId}`,
            base: undefined,
            ours: oursNode,
            theirs: theirsNode,
          });
        }
        continue;
      }

      // Case 3: Node deleted in one, modified in other
      if (baseNode) {
        const baseJson = JSON.stringify(baseNode);
        const oursJson = oursNode ? JSON.stringify(oursNode) : null;
        const theirsJson = theirsNode ? JSON.stringify(theirsNode) : null;

        // Deleted in ours, modified in theirs
        if (!oursNode && theirsNode && baseJson !== theirsJson) {
          conflicts.push({
            path: `nodes.${nodeId}`,
            base: baseNode,
            ours: undefined,
            theirs: theirsNode,
          });
        }

        // Deleted in theirs, modified in ours
        if (oursNode && !theirsNode && baseJson !== oursJson) {
          conflicts.push({
            path: `nodes.${nodeId}`,
            base: baseNode,
            ours: oursNode,
            theirs: undefined,
          });
        }

        // Modified in both differently
        if (
          oursNode &&
          theirsNode &&
          baseJson !== oursJson &&
          baseJson !== theirsJson &&
          oursJson !== theirsJson
        ) {
          conflicts.push({
            path: `nodes.${nodeId}`,
            base: baseNode,
            ours: oursNode,
            theirs: theirsNode,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect conflicts in connections
   */
  private detectConnectionConflicts(
    baseConns: WorkflowConnections,
    oursConns: WorkflowConnections,
    theirsConns: WorkflowConnections,
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    const allSourceNodes = new Set([
      ...Object.keys(baseConns),
      ...Object.keys(oursConns),
      ...Object.keys(theirsConns),
    ]);

    for (const sourceNode of Array.from(allSourceNodes)) {
      const baseConn = baseConns[sourceNode];
      const oursConn = oursConns[sourceNode];
      const theirsConn = theirsConns[sourceNode];

      const baseJson = baseConn ? JSON.stringify(baseConn) : null;
      const oursJson = oursConn ? JSON.stringify(oursConn) : null;
      const theirsJson = theirsConn ? JSON.stringify(theirsConn) : null;

      // Both modified differently
      if (
        baseJson &&
        oursJson &&
        theirsJson &&
        baseJson !== oursJson &&
        baseJson !== theirsJson &&
        oursJson !== theirsJson
      ) {
        conflicts.push({
          path: `connections.${sourceNode}`,
          base: baseConn,
          ours: oursConn,
          theirs: theirsConn,
        });
      }

      // Deleted in one, modified in other
      if (baseJson) {
        if (!oursJson && theirsJson && baseJson !== theirsJson) {
          conflicts.push({
            path: `connections.${sourceNode}`,
            base: baseConn,
            ours: undefined,
            theirs: theirsConn,
          });
        }

        if (oursJson && !theirsJson && baseJson !== oursJson) {
          conflicts.push({
            path: `connections.${sourceNode}`,
            base: baseConn,
            ours: oursConn,
            theirs: undefined,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict with a specific resolution strategy
   */
  resolveConflict(
    conflict: MergeConflict,
    resolution: 'ours' | 'theirs' | 'manual',
    manualValue?: unknown,
  ): unknown {
    if (resolution === 'ours') {
      return conflict.ours;
    } else if (resolution === 'theirs') {
      return conflict.theirs;
    } else if (resolution === 'manual' && manualValue !== undefined) {
      return manualValue;
    } else {
      throw new Error(`Invalid resolution for conflict at ${conflict.path}`);
    }
  }

  /**
   * Check if merge can be done automatically (no conflicts)
   */
  canAutoMerge(
    base: WorkflowDefinition,
    ours: WorkflowDefinition,
    theirs: WorkflowDefinition,
  ): boolean {
    const conflicts = this.detectConflicts(base, ours, theirs);
    return conflicts.length === 0;
  }

  /**
   * Perform the actual merge (assuming no conflicts)
   */
  private performMerge(
    base: WorkflowDefinition,
    ours: WorkflowDefinition,
    theirs: WorkflowDefinition,
  ): WorkflowDefinition {
    const merged: WorkflowDefinition = {
      name: this.mergeScalar(base.name, ours.name, theirs.name),
      active: this.mergeScalar(base.active, ours.active, theirs.active),
      nodes: this.mergeNodes(base.nodes, ours.nodes, theirs.nodes),
      connections: this.mergeConnections(
        base.connections || {},
        ours.connections || {},
        theirs.connections || {},
      ),
    };

    // Merge settings if they exist
    if (base.settings || ours.settings || theirs.settings) {
      merged.settings = this.mergeScalar(
        base.settings || {},
        ours.settings || {},
        theirs.settings || {},
      );
    }

    // Merge other optional fields
    if (base.staticData || ours.staticData || theirs.staticData) {
      merged.staticData = this.mergeScalar(
        base.staticData || {},
        ours.staticData || {},
        theirs.staticData || {},
      );
    }

    if (base.tags || ours.tags || theirs.tags) {
      merged.tags = this.mergeScalar(base.tags || [], ours.tags || [], theirs.tags || []);
    }

    return merged;
  }

  /**
   * Merge scalar values using three-way logic
   */
  private mergeScalar<T>(base: T, ours: T, theirs: T): T {
    // If both changed to same value, use it
    if (JSON.stringify(ours) === JSON.stringify(theirs)) {
      return ours;
    }

    // If only ours changed, use ours
    if (JSON.stringify(base) === JSON.stringify(theirs)) {
      return ours;
    }

    // If only theirs changed, use theirs
    if (JSON.stringify(base) === JSON.stringify(ours)) {
      return theirs;
    }

    // Both changed differently - prefer ours (this should not happen if conflicts are detected)
    return ours;
  }

  /**
   * Merge node arrays
   */
  private mergeNodes(
    baseNodes: WorkflowNode[],
    oursNodes: WorkflowNode[],
    theirsNodes: WorkflowNode[],
  ): WorkflowNode[] {
    const baseMap = new Map(baseNodes.map((n) => [n.id, n]));
    const oursMap = new Map(oursNodes.map((n) => [n.id, n]));
    const theirsMap = new Map(theirsNodes.map((n) => [n.id, n]));

    const mergedMap = new Map<string, WorkflowNode>();

    // Start with all nodes from ours
    for (const [id, node] of Array.from(oursMap.entries())) {
      mergedMap.set(id, node);
    }

    // Add nodes that were added in theirs
    for (const [id, node] of Array.from(theirsMap.entries())) {
      if (!baseMap.has(id) && !oursMap.has(id)) {
        mergedMap.set(id, node);
      }
    }

    // Remove nodes that were deleted in theirs (if we didn't modify them)
    for (const [id] of Array.from(baseMap.entries())) {
      if (!theirsMap.has(id) && oursMap.has(id)) {
        const baseNode = baseMap.get(id)!;
        const oursNode = oursMap.get(id)!;

        // Only delete if we didn't modify it
        if (JSON.stringify(baseNode) === JSON.stringify(oursNode)) {
          mergedMap.delete(id);
        }
      }
    }

    return Array.from(mergedMap.values());
  }

  /**
   * Merge connection objects
   */
  private mergeConnections(
    baseConns: WorkflowConnections,
    oursConns: WorkflowConnections,
    theirsConns: WorkflowConnections,
  ): WorkflowConnections {
    const merged: WorkflowConnections = { ...oursConns };

    // Add connections added in theirs
    for (const [sourceNode, conn] of Object.entries(theirsConns)) {
      if (!baseConns[sourceNode] && !oursConns[sourceNode]) {
        merged[sourceNode] = conn;
      }
    }

    // Remove connections deleted in theirs (if we didn't modify them)
    for (const sourceNode of Object.keys(baseConns)) {
      if (!theirsConns[sourceNode] && oursConns[sourceNode]) {
        const baseConn = baseConns[sourceNode];
        const oursConn = oursConns[sourceNode];

        // Only delete if we didn't modify it
        if (JSON.stringify(baseConn) === JSON.stringify(oursConn)) {
          delete merged[sourceNode];
        }
      }
    }

    return merged;
  }

  /**
   * Apply conflict resolutions to perform merge
   */
  mergeWithResolutions(
    base: WorkflowDefinition,
    ours: WorkflowDefinition,
    theirs: WorkflowDefinition,
    resolutions: Map<string, { resolution: 'ours' | 'theirs' | 'manual'; value?: unknown }>,
  ): MergeResult {
    const conflicts = this.detectConflicts(base, ours, theirs);

    // Check all conflicts have resolutions
    const unresolvedConflicts = conflicts.filter((c) => !resolutions.has(c.path));
    if (unresolvedConflicts.length > 0) {
      return {
        success: false,
        conflicts: unresolvedConflicts,
        error: 'Not all conflicts have been resolved',
      };
    }

    try {
      // Start with automatic merge
      const merged = this.performMerge(base, ours, theirs);

      // Apply manual resolutions
      for (const conflict of conflicts) {
        const resolution = resolutions.get(conflict.path);
        if (resolution) {
          const resolvedValue = this.resolveConflict(
            conflict,
            resolution.resolution,
            resolution.value,
          );
          this.applyResolution(merged, conflict.path, resolvedValue);
        }
      }

      return {
        success: true,
        conflicts: [],
        merged: merged as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return {
        success: false,
        conflicts,
        error: error instanceof Error ? error.message : 'Merge failed',
      };
    }
  }

  /**
   * Apply a resolved value to the merged workflow
   */
  private applyResolution(
    workflow: WorkflowDefinition,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split('.');

    if (parts[0] === 'workflow') {
      // Workflow-level property
      if (parts[1] === 'name') {
        workflow.name = value as string;
      } else if (parts[1] === 'settings') {
        workflow.settings = value as typeof workflow.settings;
      }
    } else if (parts[0] === 'nodes') {
      // Node modification
      const nodeId = parts[1];
      const nodeIndex = workflow.nodes.findIndex((n) => n.id === nodeId);

      if (value === undefined) {
        // Remove node
        if (nodeIndex >= 0) {
          workflow.nodes.splice(nodeIndex, 1);
        }
      } else if (nodeIndex >= 0) {
        // Update existing node
        workflow.nodes[nodeIndex] = value as WorkflowNode;
      } else {
        // Add new node
        workflow.nodes.push(value as WorkflowNode);
      }
    } else if (parts[0] === 'connections') {
      // Connection modification
      const sourceNode = parts[1];
      if (value === undefined) {
        delete workflow.connections![sourceNode];
      } else {
        workflow.connections = workflow.connections || {};
        workflow.connections[sourceNode] = value as WorkflowConnections[string];
      }
    }
  }
}
