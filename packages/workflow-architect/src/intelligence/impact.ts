/**
 * Impact Analyzer
 * Analyzes the impact of workflow changes on dependencies and connected systems
 */

import type { WorkflowDefinition, WorkflowNode } from '../types/workflow.js';
import type { ImpactReport } from './types.js';
import { v4 as uuidv4 } from 'uuid';

interface WorkflowChange {
  type: 'add' | 'remove' | 'modify';
  nodeId?: string;
  nodeBefore?: WorkflowNode;
  nodeAfter?: WorkflowNode;
  description: string;
}

interface DependencyGraph {
  workflowId: string;
  upstreamWorkflows: string[];
  downstreamWorkflows: string[];
  externalServices: string[];
}

export class ImpactAnalyzer {
  private dependencyGraph: Map<string, DependencyGraph>;

  constructor() {
    this.dependencyGraph = new Map();
  }

  /**
   * Analyze impact of changes to a workflow
   */
  async analyzeImpact(
    workflowBefore: WorkflowDefinition,
    workflowAfter: WorkflowDefinition,
  ): Promise<ImpactReport> {
    if (!workflowBefore.id || !workflowAfter.id) {
      throw new Error('Workflows must have IDs');
    }

    if (workflowBefore.id !== workflowAfter.id) {
      throw new Error('Workflows must have the same ID');
    }

    const changeId = uuidv4();
    const workflowId = workflowBefore.id;

    // Detect changes
    const changes = this.detectChanges(workflowBefore, workflowAfter);

    // Analyze impact on nodes
    const impact = this.analyzeNodeImpact(workflowAfter, changes);

    // Analyze risks
    const risks = this.analyzeRisks(changes, workflowAfter);

    // Analyze dependencies
    const dependencies = this.analyzeDependencies(workflowId, changes);

    // Generate recommendations
    const recommendations = this.generateRecommendations(changes, risks, impact);

    // Create rollback plan
    const rollbackPlan = this.createRollbackPlan(changes);

    return {
      changeId,
      workflowId,
      changes: changes.map((c) => ({
        type: c.type,
        nodeId: c.nodeId,
        description: c.description,
      })),
      impact,
      risks,
      dependencies,
      recommendations,
      rollbackPlan,
    };
  }

  /**
   * Register workflow dependencies
   */
  registerDependencies(
    workflowId: string,
    upstreamWorkflows: string[],
    downstreamWorkflows: string[],
    externalServices: string[],
  ): void {
    this.dependencyGraph.set(workflowId, {
      workflowId,
      upstreamWorkflows,
      downstreamWorkflows,
      externalServices,
    });
  }

  /**
   * Detect changes between two workflow versions
   */
  private detectChanges(
    before: WorkflowDefinition,
    after: WorkflowDefinition,
  ): WorkflowChange[] {
    const changes: WorkflowChange[] = [];

    // Create maps for quick lookup
    const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
    const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));

    // Find removed nodes
    for (const [nodeId, node] of beforeNodes) {
      if (!afterNodes.has(nodeId)) {
        changes.push({
          type: 'remove',
          nodeId,
          nodeBefore: node,
          description: `Removed node: ${node.name} (${node.type})`,
        });
      }
    }

    // Find added nodes
    for (const [nodeId, node] of afterNodes) {
      if (!beforeNodes.has(nodeId)) {
        changes.push({
          type: 'add',
          nodeId,
          nodeAfter: node,
          description: `Added node: ${node.name} (${node.type})`,
        });
      }
    }

    // Find modified nodes
    for (const [nodeId, afterNode] of afterNodes) {
      const beforeNode = beforeNodes.get(nodeId);
      if (beforeNode && this.isNodeModified(beforeNode, afterNode)) {
        changes.push({
          type: 'modify',
          nodeId,
          nodeBefore: beforeNode,
          nodeAfter: afterNode,
          description: `Modified node: ${afterNode.name}`,
        });
      }
    }

    return changes;
  }

  /**
   * Check if node has been modified
   */
  private isNodeModified(before: WorkflowNode, after: WorkflowNode): boolean {
    // Compare parameters
    if (JSON.stringify(before.parameters) !== JSON.stringify(after.parameters)) {
      return true;
    }

    // Compare credentials
    if (JSON.stringify(before.credentials) !== JSON.stringify(after.credentials)) {
      return true;
    }

    // Compare disabled status
    if (before.disabled !== after.disabled) {
      return true;
    }

    return false;
  }

  /**
   * Analyze impact on workflow nodes
   */
  private analyzeNodeImpact(
    workflow: WorkflowDefinition,
    changes: WorkflowChange[],
  ): ImpactReport['impact'] {
    const directNodes: string[] = [];
    const indirectNodes: string[] = [];
    const affectedWorkflows: string[] = [];

    // Direct impact: changed nodes
    for (const change of changes) {
      if (change.nodeId) {
        directNodes.push(change.nodeId);
      }
    }

    // Indirect impact: downstream nodes
    for (const change of changes) {
      if (change.nodeId) {
        const downstream = this.findDownstreamNodes(workflow, change.nodeId);
        for (const nodeId of downstream) {
          if (!directNodes.includes(nodeId) && !indirectNodes.includes(nodeId)) {
            indirectNodes.push(nodeId);
          }
        }
      }
    }

    // Affected workflows (from dependency graph)
    const deps = this.dependencyGraph.get(workflow.id!);
    if (deps) {
      affectedWorkflows.push(...deps.downstreamWorkflows);
    }

    // Estimate downtime
    const estimatedDowntime = this.estimateDowntime(changes);

    return {
      directNodes,
      indirectNodes,
      affectedWorkflows,
      estimatedDowntime,
    };
  }

  /**
   * Find downstream nodes
   */
  private findDownstreamNodes(workflow: WorkflowDefinition, startNodeId: string): string[] {
    const downstream: string[] = [];
    const visited = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const connections = workflow.connections[nodeId];
      if (!connections) continue;

      for (const connType of Object.values(connections)) {
        for (const connArray of connType) {
          for (const conn of connArray) {
            if (!visited.has(conn.node)) {
              downstream.push(conn.node);
              queue.push(conn.node);
            }
          }
        }
      }
    }

    return downstream;
  }

  /**
   * Estimate downtime in minutes
   */
  private estimateDowntime(changes: WorkflowChange[]): number {
    let downtime = 0;

    for (const change of changes) {
      switch (change.type) {
        case 'add':
          downtime += 2; // 2 minutes to add and test
          break;
        case 'remove':
          downtime += 1; // 1 minute to remove
          break;
        case 'modify':
          downtime += 3; // 3 minutes to modify and test
          break;
      }
    }

    // Add base downtime for deployment
    downtime += 5;

    return downtime;
  }

  /**
   * Analyze risks
   */
  private analyzeRisks(
    changes: WorkflowChange[],
    workflow: WorkflowDefinition,
  ): ImpactReport['risks'] {
    const risks: ImpactReport['risks'] = [];

    // Check for removal of critical nodes
    const criticalNodeTypes = ['Webhook', 'Trigger', 'Database', 'Http'];
    for (const change of changes) {
      if (change.type === 'remove' && change.nodeBefore) {
        const isCritical = criticalNodeTypes.some((type) =>
          change.nodeBefore!.type.includes(type),
        );
        if (isCritical) {
          risks.push({
            severity: 'high',
            description: `Removing critical node: ${change.nodeBefore.name}`,
            probability: 0.8,
            mitigation: 'Ensure alternative path exists or add replacement node',
          });
        }
      }
    }

    // Check for credential changes
    for (const change of changes) {
      if (change.type === 'modify' && change.nodeBefore && change.nodeAfter) {
        const credsBefore = JSON.stringify(change.nodeBefore.credentials || {});
        const credsAfter = JSON.stringify(change.nodeAfter.credentials || {});

        if (credsBefore !== credsAfter) {
          risks.push({
            severity: 'medium',
            description: `Credential change in node: ${change.nodeAfter.name}`,
            probability: 0.6,
            mitigation: 'Test authentication before deployment',
          });
        }
      }
    }

    // Check for many changes at once
    if (changes.length > 10) {
      risks.push({
        severity: 'medium',
        description: `Large number of changes (${changes.length}) increases risk`,
        probability: 0.7,
        mitigation: 'Consider breaking into smaller deployments',
      });
    }

    // Check for changes to active workflows
    if (workflow.active) {
      risks.push({
        severity: 'medium',
        description: 'Modifying active workflow may impact live executions',
        probability: 0.5,
        mitigation: 'Deactivate workflow during update or use blue-green deployment',
      });
    }

    // Check for broken connections
    const brokenConnections = this.findBrokenConnections(workflow);
    if (brokenConnections.length > 0) {
      risks.push({
        severity: 'critical',
        description: 'Changes may result in broken connections',
        probability: 0.9,
        mitigation: 'Review and fix all connection paths',
      });
    }

    return risks;
  }

  /**
   * Find broken connections in workflow
   */
  private findBrokenConnections(workflow: WorkflowDefinition): string[] {
    const broken: string[] = [];
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));

    for (const [sourceId, connections] of Object.entries(workflow.connections)) {
      if (!nodeIds.has(sourceId)) {
        broken.push(sourceId);
        continue;
      }

      for (const connType of Object.values(connections)) {
        for (const connArray of connType) {
          for (const conn of connArray) {
            if (!nodeIds.has(conn.node)) {
              broken.push(conn.node);
            }
          }
        }
      }
    }

    return broken;
  }

  /**
   * Analyze dependencies
   */
  private analyzeDependencies(
    workflowId: string,
    changes: WorkflowChange[],
  ): ImpactReport['dependencies'] {
    const deps = this.dependencyGraph.get(workflowId);

    if (!deps) {
      return {
        upstream: [],
        downstream: [],
        external: [],
      };
    }

    // Identify affected external services
    const affectedExternal: string[] = [];
    for (const change of changes) {
      if (change.nodeAfter) {
        const service = this.extractExternalService(change.nodeAfter);
        if (service && !affectedExternal.includes(service)) {
          affectedExternal.push(service);
        }
      }
    }

    return {
      upstream: deps.upstreamWorkflows,
      downstream: deps.downstreamWorkflows,
      external: affectedExternal.length > 0 ? affectedExternal : deps.externalServices,
    };
  }

  /**
   * Extract external service from node
   */
  private extractExternalService(node: WorkflowNode): string | undefined {
    const type = node.type.toLowerCase();

    if (type.includes('http')) return 'HTTP API';
    if (type.includes('database') || type.includes('postgres') || type.includes('mysql'))
      return 'Database';
    if (type.includes('webhook')) return 'Webhook Endpoint';
    if (type.includes('openai')) return 'OpenAI';
    if (type.includes('anthropic')) return 'Anthropic';
    if (type.includes('slack')) return 'Slack';
    if (type.includes('github')) return 'GitHub';

    return undefined;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    changes: WorkflowChange[],
    risks: ImpactReport['risks'],
    impact: ImpactReport['impact'],
  ): string[] {
    const recommendations: string[] = [];

    // High risk recommendations
    const criticalRisks = risks.filter((r) => r.severity === 'critical');
    if (criticalRisks.length > 0) {
      recommendations.push('Address all critical risks before deployment');
      recommendations.push('Conduct thorough testing in staging environment');
    }

    // Many changes recommendation
    if (changes.length > 10) {
      recommendations.push('Consider phased rollout for large change sets');
    }

    // Downstream impact recommendation
    if (impact.affectedWorkflows.length > 0) {
      recommendations.push(
        `Notify owners of ${impact.affectedWorkflows.length} dependent workflows`,
      );
    }

    // Downtime recommendation
    if (impact.estimatedDowntime > 10) {
      recommendations.push(
        `Schedule deployment during low-traffic window (estimated ${impact.estimatedDowntime}min downtime)`,
      );
    }

    // Testing recommendation
    recommendations.push('Test all modified nodes individually before full workflow test');
    recommendations.push('Keep previous version available for quick rollback');

    // Monitoring recommendation
    recommendations.push('Monitor error rates and execution times after deployment');

    return recommendations;
  }

  /**
   * Create rollback plan
   */
  private createRollbackPlan(changes: WorkflowChange[]): string[] {
    const plan: string[] = [];

    plan.push('1. Deactivate the workflow immediately if issues are detected');
    plan.push('2. Revert to previous workflow version from version control');

    // Specific rollback steps for each change type
    const addedNodes = changes.filter((c) => c.type === 'add').length;
    const removedNodes = changes.filter((c) => c.type === 'remove').length;
    const modifiedNodes = changes.filter((c) => c.type === 'modify').length;

    if (addedNodes > 0) {
      plan.push(`3. Remove ${addedNodes} added node(s)`);
    }

    if (removedNodes > 0) {
      plan.push(`4. Restore ${removedNodes} removed node(s) from backup`);
    }

    if (modifiedNodes > 0) {
      plan.push(`5. Revert ${modifiedNodes} modified node(s) to previous configuration`);
    }

    plan.push('6. Test rolled-back workflow in staging');
    plan.push('7. Reactivate workflow after verification');
    plan.push('8. Monitor for 24 hours to ensure stability');

    return plan;
  }
}
