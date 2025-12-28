/**
 * RollbackManager - Safely rollback workflows to previous versions
 */

import type { VersionStore } from './store';
import type { WorkflowDiff } from './diff';
import type { RollbackPreview, WorkflowVersion, VersionChange } from './types';
import type { WorkflowDefinition } from '../types/workflow';

export interface RollbackOptions {
  createRollbackVersion?: boolean; // Create new version instead of hard rollback
  validateBeforeRollback?: boolean; // Validate workflow before rollback
  author?: string; // Author for rollback version
}

export class RollbackManager {
  constructor(
    private versionStore: VersionStore,
    private workflowDiff: WorkflowDiff,
  ) {}

  /**
   * Rollback workflow to a specific version
   * Returns the rolled-back workflow definition
   */
  async rollbackTo(
    workflowId: string,
    targetVersion: number,
    options: RollbackOptions = {},
  ): Promise<WorkflowDefinition> {
    const {
      createRollbackVersion = true,
      validateBeforeRollback = true,
      author = 'system',
    } = options;

    // Get target version
    const targetVersionObj = await this.versionStore.getVersion(workflowId, targetVersion);
    if (!targetVersionObj) {
      throw new Error(`Version ${targetVersion} not found for workflow ${workflowId}`);
    }

    // Get current version
    const currentVersion = await this.versionStore.getLatestVersion(workflowId);
    if (!currentVersion) {
      throw new Error(`No current version found for workflow ${workflowId}`);
    }

    // Check if already at target version
    if (currentVersion.version === targetVersion) {
      return targetVersionObj.snapshot as unknown as WorkflowDefinition;
    }

    // Validate rollback if requested
    if (validateBeforeRollback) {
      const canRollback = await this.canRollback(workflowId, targetVersion);
      if (!canRollback) {
        throw new Error(
          `Cannot rollback to version ${targetVersion}: validation failed`,
        );
      }
    }

    // Get the workflow definition from target version
    const rolledBackWorkflow = JSON.parse(
      JSON.stringify(targetVersionObj.snapshot),
    ) as unknown as WorkflowDefinition;

    // Create a new version documenting the rollback
    if (createRollbackVersion) {
      await this.createRollbackVersion(
        workflowId,
        targetVersion,
        rolledBackWorkflow,
        author,
      );
    }

    return rolledBackWorkflow;
  }

  /**
   * Create a new version that represents a rollback
   * This preserves history and makes rollbacks auditable
   */
  async createRollbackVersion(
    workflowId: string,
    targetVersion: number,
    rolledBackWorkflow?: WorkflowDefinition,
    author: string = 'system',
  ): Promise<WorkflowVersion> {
    // Get target version if workflow not provided
    let workflow = rolledBackWorkflow;
    if (!workflow) {
      const targetVersionObj = await this.versionStore.getVersion(workflowId, targetVersion);
      if (!targetVersionObj) {
        throw new Error(`Version ${targetVersion} not found`);
      }
      workflow = targetVersionObj.snapshot as unknown as WorkflowDefinition;
    }

    // Create new version with rollback message
    const message = `Rollback to version ${targetVersion}`;
    return await this.versionStore.createVersion(workflowId, workflow, message, author);
  }

  /**
   * Check if rollback to a specific version is safe
   */
  async canRollback(workflowId: string, targetVersion: number): Promise<boolean> {
    try {
      // Check if target version exists
      const targetVersionObj = await this.versionStore.getVersion(workflowId, targetVersion);
      if (!targetVersionObj) {
        return false;
      }

      // Check if workflow is valid
      const workflow = targetVersionObj.snapshot as unknown as WorkflowDefinition;
      if (!this.isValidWorkflow(workflow)) {
        return false;
      }

      // Additional validation checks
      // - Check if all nodes have valid types
      // - Check if connections reference existing nodes
      if (!this.validateWorkflowStructure(workflow)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a preview of what will change if we rollback
   */
  async getRollbackPreview(
    workflowId: string,
    targetVersion: number,
  ): Promise<RollbackPreview> {
    const warnings: string[] = [];

    // Get current and target versions
    const currentVersion = await this.versionStore.getLatestVersion(workflowId);
    if (!currentVersion) {
      throw new Error(`No current version found for workflow ${workflowId}`);
    }

    const targetVersionObj = await this.versionStore.getVersion(workflowId, targetVersion);
    if (!targetVersionObj) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    // Calculate diff
    const diff = this.workflowDiff.diff(targetVersionObj, currentVersion);

    // Generate warnings based on changes
    if (diff.nodesRemoved.length > 0) {
      warnings.push(
        `${diff.nodesRemoved.length} node(s) will be removed: ${diff.nodesRemoved.join(', ')}`,
      );
    }

    if (diff.connectionsRemoved > 0) {
      warnings.push(`${diff.connectionsRemoved} connection(s) will be removed`);
    }

    if (diff.nodesModified.length > 0) {
      warnings.push(
        `${diff.nodesModified.length} node(s) will be reverted to previous state`,
      );
    }

    // Check for potential data loss
    const currentWorkflow = currentVersion.snapshot as unknown as WorkflowDefinition;
    const targetWorkflow = targetVersionObj.snapshot as unknown as WorkflowDefinition;

    if (currentWorkflow.pinData && Object.keys(currentWorkflow.pinData).length > 0) {
      warnings.push('Pinned data may be lost');
    }

    if (currentWorkflow.staticData && Object.keys(currentWorkflow.staticData).length > 0) {
      warnings.push('Static data may be affected');
    }

    // Determine if rollback can proceed
    const canRollback = await this.canRollback(workflowId, targetVersion);

    return {
      workflowId,
      currentVersion: currentVersion.version,
      targetVersion,
      changes: this.invertChanges(diff.changes),
      affectedNodes: [
        ...diff.nodesAdded,
        ...diff.nodesRemoved,
        ...diff.nodesModified,
      ],
      affectedConnections: diff.connectionsAdded + diff.connectionsRemoved,
      canRollback,
      warnings,
    };
  }

  /**
   * Invert changes to show what will happen during rollback
   */
  private invertChanges(changes: VersionChange[]): VersionChange[] {
    return changes.map((change) => {
      // Swap oldValue and newValue
      const inverted: VersionChange = {
        type: change.type,
        path: change.path,
      };

      if (change.newValue !== undefined) {
        inverted.oldValue = change.newValue;
      }

      if (change.oldValue !== undefined) {
        inverted.newValue = change.oldValue;
      }

      // Invert change types
      if (change.type === 'node_added') {
        inverted.type = 'node_removed';
      } else if (change.type === 'node_removed') {
        inverted.type = 'node_added';
      } else if (change.type === 'connection_added') {
        inverted.type = 'connection_removed';
      } else if (change.type === 'connection_removed') {
        inverted.type = 'connection_added';
      }

      return inverted;
    });
  }

  /**
   * Validate basic workflow structure
   */
  private isValidWorkflow(workflow: WorkflowDefinition): boolean {
    if (!workflow || typeof workflow !== 'object') {
      return false;
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      return false;
    }

    if (!Array.isArray(workflow.nodes)) {
      return false;
    }

    if (workflow.connections && typeof workflow.connections !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Validate workflow structure integrity
   */
  private validateWorkflowStructure(workflow: WorkflowDefinition): boolean {
    // Create a set of valid node IDs
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));

    // Validate each node
    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type) {
        return false;
      }

      if (!node.position || node.position.length !== 2) {
        return false;
      }

      if (!node.parameters || typeof node.parameters !== 'object') {
        return false;
      }
    }

    // Validate connections reference existing nodes
    if (workflow.connections) {
      for (const [sourceNode, connectionTypes] of Object.entries(workflow.connections)) {
        // Check source node exists
        if (!nodeIds.has(sourceNode)) {
          return false;
        }

        // Check all target nodes exist
        for (const outputs of Object.values(connectionTypes)) {
          for (const outputGroup of outputs) {
            for (const connection of outputGroup) {
              if (!nodeIds.has(connection.node)) {
                return false;
              }
            }
          }
        }
      }
    }

    return true;
  }

  /**
   * Get rollback history - list of all versions that were rollbacks
   */
  async getRollbackHistory(workflowId: string): Promise<WorkflowVersion[]> {
    const history = await this.versionStore.getHistory(workflowId);
    return history.filter((v) => v.message.startsWith('Rollback to version'));
  }

  /**
   * Find the version before a specific version (for undo-like functionality)
   */
  async getPreviousVersion(
    workflowId: string,
    currentVersion: number,
  ): Promise<WorkflowVersion | null> {
    const history = await this.versionStore.getHistory(workflowId);
    const sortedHistory = history.sort((a, b) => b.version - a.version);

    for (const version of sortedHistory) {
      if (version.version < currentVersion) {
        return version;
      }
    }

    return null;
  }

  /**
   * Rollback to previous version (quick undo)
   */
  async rollbackToPrevious(
    workflowId: string,
    options: RollbackOptions = {},
  ): Promise<WorkflowDefinition> {
    const currentVersion = await this.versionStore.getLatestVersion(workflowId);
    if (!currentVersion) {
      throw new Error(`No current version found for workflow ${workflowId}`);
    }

    const previousVersion = await this.getPreviousVersion(workflowId, currentVersion.version);
    if (!previousVersion) {
      throw new Error('No previous version available');
    }

    return await this.rollbackTo(workflowId, previousVersion.version, options);
  }

  /**
   * Compare current state with a specific version
   */
  async compareWithVersion(
    workflowId: string,
    versionNumber: number,
  ): Promise<{
    current: WorkflowVersion;
    target: WorkflowVersion;
    summary: string;
  }> {
    const current = await this.versionStore.getLatestVersion(workflowId);
    if (!current) {
      throw new Error(`No current version found for workflow ${workflowId}`);
    }

    const target = await this.versionStore.getVersion(workflowId, versionNumber);
    if (!target) {
      throw new Error(`Version ${versionNumber} not found`);
    }

    const diff = this.workflowDiff.diff(target, current);
    const summary = this.workflowDiff.summarizeDiff(diff);

    return {
      current,
      target,
      summary,
    };
  }
}
