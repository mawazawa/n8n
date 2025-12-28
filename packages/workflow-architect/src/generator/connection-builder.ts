/**
 * Connection Builder
 * Automatically connects nodes based on data flow inference
 */

import type { NodeBlueprint, ConnectionBlueprint, WorkflowBlueprint } from './types';
import { wrapError } from '../errors';

export interface ConnectionBuilderConfig {
  allowParallel?: boolean;
  preferExplicit?: boolean;
}

export interface ConnectionValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConnectionBuilder {
  private allowParallel: boolean;
  private preferExplicit: boolean;

  constructor(config: ConnectionBuilderConfig = {}) {
    this.allowParallel = config.allowParallel ?? true;
    this.preferExplicit = config.preferExplicit ?? false;
  }

  /**
   * Build connections based on node sequence
   */
  async buildConnections(nodes: NodeBlueprint[]): Promise<ConnectionBlueprint[]> {
    try {
      if (nodes.length === 0) {
        return [];
      }

      // Detect node roles
      const nodeRoles = this.detectNodeRoles(nodes);

      // Build connections based on roles and data flow
      const connections: ConnectionBlueprint[] = [];

      // Connect trigger to first processing node
      const triggers = nodeRoles.triggers;
      const processors = nodeRoles.processors;
      const actions = nodeRoles.actions;

      if (triggers.length > 0 && processors.length > 0) {
        connections.push({
          source: triggers[0].id,
          sourceOutput: 'main',
          target: processors[0].id,
          targetInput: 'main',
        });
      } else if (triggers.length > 0 && actions.length > 0) {
        // Direct trigger to action if no processors
        connections.push({
          source: triggers[0].id,
          sourceOutput: 'main',
          target: actions[0].id,
          targetInput: 'main',
        });
      }

      // Connect processors in sequence
      for (let i = 0; i < processors.length - 1; i++) {
        connections.push({
          source: processors[i].id,
          sourceOutput: 'main',
          target: processors[i + 1].id,
          targetInput: 'main',
        });
      }

      // Connect last processor to actions
      if (processors.length > 0 && actions.length > 0) {
        const lastProcessor = processors[processors.length - 1];

        if (this.allowParallel && actions.length > 1) {
          // Parallel connections to multiple actions
          actions.forEach((action) => {
            connections.push({
              source: lastProcessor.id,
              sourceOutput: 'main',
              target: action.id,
              targetInput: 'main',
            });
          });
        } else {
          // Sequential connections
          connections.push({
            source: lastProcessor.id,
            sourceOutput: 'main',
            target: actions[0].id,
            targetInput: 'main',
          });
        }
      }

      // Handle conditional nodes (IF, Switch)
      const conditionals = nodeRoles.conditionals;
      connections.push(...this.buildConditionalConnections(conditionals, nodes));

      // Remove duplicates
      return this.deduplicateConnections(connections);
    } catch (error) {
      throw wrapError(error, 'Failed to build connections');
    }
  }

  /**
   * Infer data flow from node types
   */
  inferDataFlow(nodes: NodeBlueprint[]): Map<string, string[]> {
    const dataFlow = new Map<string, string[]>();

    nodes.forEach((node) => {
      const outputs = this.getNodeOutputs(node);
      dataFlow.set(node.id, outputs);
    });

    return dataFlow;
  }

  /**
   * Handle branching logic
   */
  buildBranchingConnections(
    sourceNode: NodeBlueprint,
    branches: NodeBlueprint[],
  ): ConnectionBlueprint[] {
    const connections: ConnectionBlueprint[] = [];

    if (sourceNode.type.includes('if')) {
      // IF node has true/false outputs
      branches.forEach((branch, index) => {
        connections.push({
          source: sourceNode.id,
          sourceOutput: index === 0 ? 'true' : 'false',
          target: branch.id,
          targetInput: 'main',
        });
      });
    } else if (sourceNode.type.includes('switch')) {
      // Switch node has numbered outputs
      branches.forEach((branch, index) => {
        connections.push({
          source: sourceNode.id,
          sourceOutput: `${index}`,
          target: branch.id,
          targetInput: 'main',
        });
      });
    } else {
      // Default: parallel connections
      branches.forEach((branch) => {
        connections.push({
          source: sourceNode.id,
          sourceOutput: 'main',
          target: branch.id,
          targetInput: 'main',
        });
      });
    }

    return connections;
  }

  /**
   * Handle merging logic
   */
  buildMergingConnections(
    sourceNodes: NodeBlueprint[],
    mergeNode: NodeBlueprint,
  ): ConnectionBlueprint[] {
    return sourceNodes.map((source, index) => ({
      source: source.id,
      sourceOutput: 'main',
      target: mergeNode.id,
      targetInput: `${index}`, // Merge node accepts multiple inputs
    }));
  }

  /**
   * Validate connection compatibility
   */
  validateConnection(
    source: NodeBlueprint,
    target: NodeBlueprint,
    outputType: string,
    inputType: string,
  ): ConnectionValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if source has the output
    const sourceOutputs = this.getNodeOutputs(source);
    if (!sourceOutputs.includes(outputType)) {
      errors.push(`Source node ${source.name} does not have output ${outputType}`);
    }

    // Check if target accepts the input
    const targetInputs = this.getNodeInputs(target);
    if (!targetInputs.includes(inputType)) {
      errors.push(`Target node ${target.name} does not accept input ${inputType}`);
    }

    // Check data type compatibility
    const compatibility = this.checkDataTypeCompatibility(source, target);
    if (!compatibility.compatible) {
      warnings.push(
        `Potential data type mismatch: ${compatibility.reason}`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private detectNodeRoles(nodes: NodeBlueprint[]): {
    triggers: NodeBlueprint[];
    processors: NodeBlueprint[];
    actions: NodeBlueprint[];
    conditionals: NodeBlueprint[];
  } {
    const triggers: NodeBlueprint[] = [];
    const processors: NodeBlueprint[] = [];
    const actions: NodeBlueprint[] = [];
    const conditionals: NodeBlueprint[] = [];

    const triggerKeywords = ['trigger', 'webhook', 'schedule', 'manual'];
    const processorKeywords = ['set', 'code', 'filter', 'aggregate', 'transform'];
    const conditionalKeywords = ['if', 'switch'];
    const actionKeywords = ['gmail', 'slack', 'http', 'postgres', 'api'];

    nodes.forEach((node) => {
      const nodeType = node.type.toLowerCase();

      if (triggerKeywords.some((kw) => nodeType.includes(kw))) {
        triggers.push(node);
      } else if (conditionalKeywords.some((kw) => nodeType.includes(kw))) {
        conditionals.push(node);
      } else if (processorKeywords.some((kw) => nodeType.includes(kw))) {
        processors.push(node);
      } else if (actionKeywords.some((kw) => nodeType.includes(kw))) {
        actions.push(node);
      } else {
        // Default to processor
        processors.push(node);
      }
    });

    return { triggers, processors, actions, conditionals };
  }

  private buildConditionalConnections(
    conditionals: NodeBlueprint[],
    allNodes: NodeBlueprint[],
  ): ConnectionBlueprint[] {
    const connections: ConnectionBlueprint[] = [];

    // For now, just ensure conditionals are properly connected
    // More sophisticated logic can be added later

    return connections;
  }

  private getNodeOutputs(node: NodeBlueprint): string[] {
    const nodeType = node.type.toLowerCase();

    if (nodeType.includes('if')) {
      return ['true', 'false'];
    } else if (nodeType.includes('switch')) {
      // Switch can have multiple outputs
      return ['0', '1', '2', '3'];
    } else {
      return ['main'];
    }
  }

  private getNodeInputs(node: NodeBlueprint): string[] {
    const nodeType = node.type.toLowerCase();

    if (nodeType.includes('merge')) {
      // Merge can accept multiple inputs
      return ['0', '1', '2', '3'];
    } else {
      return ['main'];
    }
  }

  private checkDataTypeCompatibility(
    source: NodeBlueprint,
    target: NodeBlueprint,
  ): { compatible: boolean; reason?: string } {
    // Basic compatibility check
    // In a real implementation, this would check actual data schemas

    const sourceType = source.type;
    const targetType = target.type;

    // Trigger nodes can output to any node
    if (sourceType.includes('trigger')) {
      return { compatible: true };
    }

    // Code and Set nodes can transform any data
    if (targetType.includes('code') || targetType.includes('set')) {
      return { compatible: true };
    }

    // Default: compatible
    return { compatible: true };
  }

  private deduplicateConnections(connections: ConnectionBlueprint[]): ConnectionBlueprint[] {
    const seen = new Set<string>();
    const unique: ConnectionBlueprint[] = [];

    connections.forEach((conn) => {
      const key = `${conn.source}-${conn.sourceOutput}-${conn.target}-${conn.targetInput}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(conn);
      }
    });

    return unique;
  }
}

/**
 * Convenience function to build connections
 */
export async function buildConnections(nodes: NodeBlueprint[]): Promise<ConnectionBlueprint[]> {
  const builder = new ConnectionBuilder();
  return builder.buildConnections(nodes);
}

/**
 * Auto-connect a workflow blueprint
 */
export async function autoConnectWorkflow(
  blueprint: WorkflowBlueprint,
): Promise<WorkflowBlueprint> {
  const builder = new ConnectionBuilder();
  const connections = await builder.buildConnections(blueprint.nodes);

  return {
    ...blueprint,
    connections,
  };
}
