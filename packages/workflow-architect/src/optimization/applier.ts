/**
 * Optimization Applier
 * Applies optimizations to workflows with preview, validation, and rollback support
 */

import type { WorkflowDefinition, WorkflowNode, WorkflowConnections } from '../types/workflow.js';
import type {
  Optimization,
  AppliedOptimization,
  OptimizationChange,
  OptimizationPreview,
  RollbackData,
} from './types.js';
import { randomUUID } from 'crypto';

export class OptimizationApplier {
  private rollbackHistory: Map<string, RollbackData> = new Map();

  /**
   * Apply a single optimization to a workflow
   */
  async apply(
    workflow: WorkflowDefinition,
    optimization: Optimization,
  ): Promise<AppliedOptimization> {
    const changes: OptimizationChange[] = [];

    try {
      // Validate optimization can be applied
      const validation = this.validateOptimization(workflow, optimization);
      if (!validation.valid) {
        return {
          optimization,
          appliedAt: new Date().toISOString(),
          status: 'failed',
          changes: [],
          error: validation.error,
        };
      }

      // Apply based on action type
      switch (optimization.action.type) {
        case 'add_node':
          changes.push(...this.applyAddNode(workflow, optimization));
          break;
        case 'remove_node':
          changes.push(...this.applyRemoveNode(workflow, optimization));
          break;
        case 'modify_node':
          changes.push(...this.applyModifyNode(workflow, optimization));
          break;
        case 'reorder':
          changes.push(...this.applyReorder(workflow, optimization));
          break;
        case 'parallelize':
          changes.push(...this.applyParallelize(workflow, optimization));
          break;
        case 'batch':
          changes.push(...this.applyBatch(workflow, optimization));
          break;
        case 'cache':
          changes.push(...this.applyCache(workflow, optimization));
          break;
        default:
          throw new Error(`Unknown action type: ${optimization.action.type}`);
      }

      // Store rollback data
      this.storeRollback(optimization.id, changes);

      return {
        optimization,
        appliedAt: new Date().toISOString(),
        status: 'success',
        changes,
      };
    } catch (error) {
      return {
        optimization,
        appliedAt: new Date().toISOString(),
        status: 'failed',
        changes,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply multiple optimizations in sequence
   */
  async applyAll(
    workflow: WorkflowDefinition,
    optimizations: Optimization[],
  ): Promise<AppliedOptimization[]> {
    const results: AppliedOptimization[] = [];

    for (const optimization of optimizations) {
      const result = await this.apply(workflow, optimization);
      results.push(result);

      // Stop if an optimization fails
      if (result.status === 'failed') {
        break;
      }
    }

    return results;
  }

  /**
   * Preview changes before applying
   */
  preview(workflow: WorkflowDefinition, optimization: Optimization): OptimizationPreview {
    const workflowCopy = this.cloneWorkflow(workflow);
    const changes: OptimizationChange[] = [];
    const warnings: string[] = [];

    try {
      // Simulate the application
      switch (optimization.action.type) {
        case 'add_node':
          changes.push(...this.applyAddNode(workflowCopy, optimization));
          break;
        case 'remove_node':
          changes.push(...this.applyRemoveNode(workflowCopy, optimization));
          warnings.push('Removing nodes may affect workflow functionality');
          break;
        case 'modify_node':
          changes.push(...this.applyModifyNode(workflowCopy, optimization));
          break;
        case 'reorder':
          changes.push(...this.applyReorder(workflowCopy, optimization));
          warnings.push('Reordering may affect data flow');
          break;
        case 'parallelize':
          changes.push(...this.applyParallelize(workflowCopy, optimization));
          break;
        default:
          warnings.push(`Preview not available for ${optimization.action.type}`);
      }

      // Calculate estimated impact
      const estimatedImpact = this.calculateEstimatedImpact(optimization);

      return {
        optimization,
        changes,
        estimatedImpact,
        warnings,
      };
    } catch (error) {
      return {
        optimization,
        changes: [],
        estimatedImpact: {},
        warnings: [error instanceof Error ? error.message : 'Preview failed'],
      };
    }
  }

  /**
   * Validate that an optimization can be applied
   */
  validate(workflow: WorkflowDefinition, optimization: Optimization): { valid: boolean; error?: string } {
    return this.validateOptimization(workflow, optimization);
  }

  /**
   * Rollback a previously applied optimization
   */
  rollback(workflow: WorkflowDefinition, optimizationId: string): boolean {
    const rollbackData = this.rollbackHistory.get(optimizationId);

    if (!rollbackData) {
      return false;
    }

    try {
      // Reverse the changes
      for (const change of rollbackData.changes.reverse()) {
        this.reverseChange(workflow, change);
      }

      this.rollbackHistory.delete(optimizationId);
      return true;
    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  // Private helper methods

  private validateOptimization(
    workflow: WorkflowDefinition,
    optimization: Optimization,
  ): { valid: boolean; error?: string } {
    // Check that affected nodes exist
    for (const nodeId of optimization.affectedNodes) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) {
        return {
          valid: false,
          error: `Node ${nodeId} not found in workflow`,
        };
      }
    }

    return { valid: true };
  }

  private applyAddNode(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    const params = optimization.action.params;

    const newNode: WorkflowNode = {
      id: randomUUID(),
      name: params.nodeName as string ?? 'New Node',
      type: params.nodeType as string ?? 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [0, 0],
      parameters: params.nodeParameters as Record<string, unknown> ?? {},
    };

    workflow.nodes.push(newNode);

    changes.push({
      type: 'node_added',
      nodeId: newNode.id,
      after: newNode,
    });

    // Add connections if specified
    if (params.insertAfter) {
      this.insertNodeAfter(workflow, newNode.id, params.insertAfter as string);
      changes.push({
        type: 'connection_added',
        nodeId: newNode.id,
      });
    }

    return changes;
  }

  private applyRemoveNode(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    const params = optimization.action.params;
    const nodesToRemove = params.nodesToRemove as string[] ?? [];

    for (const nodeId of nodesToRemove) {
      const nodeIndex = workflow.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex >= 0) {
        const removedNode = workflow.nodes[nodeIndex];

        changes.push({
          type: 'node_removed',
          nodeId,
          before: removedNode,
        });

        workflow.nodes.splice(nodeIndex, 1);

        // Remove connections
        this.removeNodeConnections(workflow, nodeId);
      }
    }

    return changes;
  }

  private applyModifyNode(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    const params = optimization.action.params;
    const nodeId = params.nodeId as string;

    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const before = { ...node };

    // Apply modifications
    if (params.continueOnFail !== undefined) {
      node.parameters.continueOnFail = params.continueOnFail;
    }

    if (params.maxRetries !== undefined) {
      node.parameters.retry = {
        maxRetries: params.maxRetries,
        retryInterval: params.retryInterval ?? 1000,
      };
    }

    if (params.timeout !== undefined) {
      node.parameters.timeout = params.timeout;
    }

    if (params.batchSize !== undefined) {
      node.parameters.batchSize = params.batchSize;
    }

    changes.push({
      type: 'node_modified',
      nodeId,
      before,
      after: { ...node },
    });

    return changes;
  }

  private applyReorder(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    const params = optimization.action.params;
    const moveNodeId = params.moveNode as string;
    const beforeNodeId = params.before as string;

    // Remove current connections
    const oldConnections = this.getNodeConnections(workflow, moveNodeId);
    this.removeNodeConnections(workflow, moveNodeId);

    // Insert node before target
    this.insertNodeBefore(workflow, moveNodeId, beforeNodeId);

    changes.push({
      type: 'connection_removed',
      before: oldConnections,
    });

    changes.push({
      type: 'connection_added',
      after: this.getNodeConnections(workflow, moveNodeId),
    });

    return changes;
  }

  private applyParallelize(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    // Implementation would add parallel execution nodes
    // This is a placeholder for the actual implementation

    changes.push({
      type: 'node_modified',
      nodeId: 'parallel-execution',
    });

    return changes;
  }

  private applyBatch(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    // Implementation would modify batch size
    // This is a placeholder for the actual implementation

    return changes;
  }

  private applyCache(workflow: WorkflowDefinition, optimization: Optimization): OptimizationChange[] {
    const changes: OptimizationChange[] = [];
    // Implementation would add caching layer
    // This is a placeholder for the actual implementation

    return changes;
  }

  private insertNodeAfter(workflow: WorkflowDefinition, nodeId: string, afterNodeId: string): void {
    const connections = workflow.connections;

    // Find connections from afterNode
    const afterConnections = connections[afterNodeId];
    if (afterConnections?.main) {
      // Insert new node in between
      connections[nodeId] = { main: afterConnections.main };
      connections[afterNodeId] = {
        main: [[{ node: nodeId, type: 'main', index: 0 }]],
      };
    }
  }

  private insertNodeBefore(workflow: WorkflowDefinition, nodeId: string, beforeNodeId: string): void {
    const connections = workflow.connections;

    // Find all connections pointing to beforeNode
    for (const sourceId in connections) {
      const sourceConnections = connections[sourceId];
      for (const type in sourceConnections) {
        for (let i = 0; i < sourceConnections[type].length; i++) {
          const connArray = sourceConnections[type][i];
          for (let j = 0; j < connArray.length; j++) {
            if (connArray[j].node === beforeNodeId) {
              // Redirect to new node
              connArray[j].node = nodeId;
            }
          }
        }
      }
    }

    // Connect new node to beforeNode
    connections[nodeId] = {
      main: [[{ node: beforeNodeId, type: 'main', index: 0 }]],
    };
  }

  private removeNodeConnections(workflow: WorkflowDefinition, nodeId: string): void {
    const connections = workflow.connections;

    // Remove outgoing connections
    delete connections[nodeId];

    // Remove incoming connections
    for (const sourceId in connections) {
      const sourceConnections = connections[sourceId];
      for (const type in sourceConnections) {
        for (let i = 0; i < sourceConnections[type].length; i++) {
          sourceConnections[type][i] = sourceConnections[type][i].filter(
            conn => conn.node !== nodeId
          );
        }
      }
    }
  }

  private getNodeConnections(workflow: WorkflowDefinition, nodeId: string): WorkflowConnections {
    return { [nodeId]: workflow.connections[nodeId] ?? {} };
  }

  private storeRollback(optimizationId: string, changes: OptimizationChange[]): void {
    this.rollbackHistory.set(optimizationId, {
      optimizationId,
      changes,
      timestamp: new Date().toISOString(),
    });
  }

  private reverseChange(workflow: WorkflowDefinition, change: OptimizationChange): void {
    switch (change.type) {
      case 'node_added':
        if (change.nodeId) {
          const index = workflow.nodes.findIndex(n => n.id === change.nodeId);
          if (index >= 0) {
            workflow.nodes.splice(index, 1);
          }
        }
        break;
      case 'node_removed':
        if (change.before) {
          workflow.nodes.push(change.before as WorkflowNode);
        }
        break;
      case 'node_modified':
        if (change.nodeId && change.before) {
          const node = workflow.nodes.find(n => n.id === change.nodeId);
          if (node) {
            Object.assign(node, change.before);
          }
        }
        break;
    }
  }

  private cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
    return JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;
  }

  private calculateEstimatedImpact(optimization: Optimization): Record<string, string> {
    const impact: Record<string, string> = {};

    if (optimization.estimatedImprovement) {
      const improvement = optimization.estimatedImprovement;
      const percentChange = Math.round(
        ((improvement.currentValue - improvement.projectedValue) / improvement.currentValue) * 100
      );

      switch (optimization.type) {
        case 'performance':
          impact.performanceGain = `${percentChange}% improvement`;
          break;
        case 'cost':
          impact.costReduction = `${percentChange}% reduction`;
          break;
        case 'reliability':
          impact.reliabilityImprovement = `${percentChange}% improvement`;
          break;
      }
    }

    return impact;
  }
}
