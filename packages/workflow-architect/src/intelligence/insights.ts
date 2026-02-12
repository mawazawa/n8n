/**
 * Insight Generator
 * Generates actionable insights from workflow analysis
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { Insight, Pattern } from './types.js';
import { InsightType, InsightSeverity, InsightSchema } from './types.js';
import { WorkflowAnalyzer } from './analyzer.js';
import { v4 as uuidv4 } from 'uuid';

interface InsightHistory {
  insightId: string;
  workflowId: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export class InsightGenerator {
  private analyzer: WorkflowAnalyzer;
  private history: Map<string, InsightHistory[]>;

  constructor() {
    this.analyzer = new WorkflowAnalyzer();
    this.history = new Map();
  }

  /**
   * Generate insights for a workflow
   */
  async generate(workflow: WorkflowDefinition): Promise<Insight[]> {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    const insights: Insight[] = [];

    // Get patterns from analyzer
    const patterns = await this.analyzer.analyzePatterns(workflow);

    // Convert patterns to insights
    insights.push(...this.patternsToInsights(patterns, workflow));

    // Generate additional insights
    insights.push(...this.generatePerformanceInsights(workflow));
    insights.push(...this.generateReliabilityInsights(workflow));
    insights.push(...this.generateCostInsights(workflow));
    insights.push(...this.generateSecurityInsights(workflow));
    insights.push(...this.generateUsageInsights(workflow));

    // Aggregate similar insights
    const aggregated = this.aggregateSimilarInsights(insights);

    // Prioritize by impact and actionability
    const prioritized = this.prioritizeInsights(aggregated);

    // Track in history
    this.updateHistory(workflow.id, prioritized);

    // Validate and return
    return prioritized.map((insight) => InsightSchema.parse(insight));
  }

  /**
   * Get insight history for a workflow
   */
  getHistory(workflowId: string): InsightHistory[] {
    return this.history.get(workflowId) || [];
  }

  /**
   * Mark insight as resolved
   */
  resolveInsight(workflowId: string, insightId: string): void {
    const workflowHistory = this.history.get(workflowId);
    if (!workflowHistory) return;

    const insight = workflowHistory.find((h) => h.insightId === insightId);
    if (insight) {
      insight.resolved = true;
      insight.resolvedAt = Date.now();
    }
  }

  /**
   * Convert patterns to insights
   */
  private patternsToInsights(patterns: Pattern[], workflow: WorkflowDefinition): Insight[] {
    return patterns.map((pattern) => {
      const type = this.patternTypeToInsightType(pattern.type);
      const severity = this.patternImpactToSeverity(pattern.impact);

      return {
        id: pattern.id,
        type,
        severity,
        title: pattern.name,
        description: pattern.description,
        action: pattern.recommendation || 'Review and consider improvements',
        affectedNodes: pattern.occurrences.flatMap((o) => o.nodeIds),
        metadata: {
          patternType: pattern.type,
          confidence: Math.max(...pattern.occurrences.map((o) => o.confidence)),
        },
        timestamp: Date.now(),
        workflowId: workflow.id!,
      };
    });
  }

  /**
   * Generate performance-specific insights
   */
  private generatePerformanceInsights(workflow: WorkflowDefinition): Insight[] {
    const insights: Insight[] = [];

    // Check for long sequential chains
    const longChains = this.findLongSequentialChains(workflow);
    if (longChains.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.PERFORMANCE,
        severity: InsightSeverity.MEDIUM,
        title: 'Long Sequential Execution Chain',
        description: `Found ${longChains.length} long sequential chains that may impact performance`,
        action: 'Consider breaking into parallel branches or sub-workflows',
        affectedNodes: longChains.flat(),
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for heavy transformations
    const heavyTransforms = this.findHeavyTransformations(workflow);
    if (heavyTransforms.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.PERFORMANCE,
        severity: InsightSeverity.LOW,
        title: 'Heavy Data Transformations',
        description: 'Multiple data transformation nodes detected',
        action: 'Consider consolidating transformations or using more efficient methods',
        affectedNodes: heavyTransforms,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    return insights;
  }

  /**
   * Generate reliability-specific insights
   */
  private generateReliabilityInsights(workflow: WorkflowDefinition): Insight[] {
    const insights: Insight[] = [];

    // Check for timeout configurations
    const noTimeouts = this.findNodesWithoutTimeouts(workflow);
    if (noTimeouts.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.RELIABILITY,
        severity: InsightSeverity.MEDIUM,
        title: 'Missing Timeout Configuration',
        description: `${noTimeouts.length} external nodes lack timeout configuration`,
        action: 'Configure timeouts to prevent hanging executions',
        affectedNodes: noTimeouts,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for retry logic
    const noRetries = this.findNodesWithoutRetries(workflow);
    if (noRetries.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.RELIABILITY,
        severity: InsightSeverity.LOW,
        title: 'Missing Retry Logic',
        description: `${noRetries.length} API nodes lack retry configuration`,
        action: 'Add retry logic for transient failures',
        affectedNodes: noRetries,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for data validation
    const noValidation = this.findNodesWithoutValidation(workflow);
    if (noValidation.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.RELIABILITY,
        severity: InsightSeverity.MEDIUM,
        title: 'Missing Data Validation',
        description: 'Workflow processes data without validation',
        action: 'Add validation nodes to ensure data quality',
        affectedNodes: noValidation,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    return insights;
  }

  /**
   * Generate cost-specific insights
   */
  private generateCostInsights(workflow: WorkflowDefinition): Insight[] {
    const insights: Insight[] = [];

    // Check for expensive operations
    const expensiveOps = this.findExpensiveOperations(workflow);
    if (expensiveOps.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.COST,
        severity: InsightSeverity.MEDIUM,
        title: 'Expensive Operations Detected',
        description: `${expensiveOps.length} nodes use expensive external services`,
        action: 'Review usage and consider cheaper alternatives or caching',
        affectedNodes: expensiveOps,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for redundant API calls
    const redundant = this.findRedundantCalls(workflow);
    if (redundant.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.COST,
        severity: InsightSeverity.HIGH,
        title: 'Redundant API Calls',
        description: 'Duplicate API calls detected that increase costs',
        action: 'Implement caching or consolidate duplicate calls',
        affectedNodes: redundant,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    return insights;
  }

  /**
   * Generate security-specific insights
   */
  private generateSecurityInsights(workflow: WorkflowDefinition): Insight[] {
    const insights: Insight[] = [];

    // Check for webhook security
    const unsecureWebhooks = this.findUnsecureWebhooks(workflow);
    if (unsecureWebhooks.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.SECURITY,
        severity: InsightSeverity.HIGH,
        title: 'Unsecured Webhooks',
        description: `${unsecureWebhooks.length} webhooks lack authentication`,
        action: 'Add webhook authentication to prevent unauthorized access',
        affectedNodes: unsecureWebhooks,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for data exposure
    const dataExposure = this.findDataExposureRisks(workflow);
    if (dataExposure.length > 0) {
      insights.push({
        id: uuidv4(),
        type: InsightType.SECURITY,
        severity: InsightSeverity.CRITICAL,
        title: 'Potential Data Exposure',
        description: 'Sensitive data may be exposed in logs or responses',
        action: 'Review and sanitize data before logging or sending',
        affectedNodes: dataExposure,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    return insights;
  }

  /**
   * Generate usage-specific insights
   */
  private generateUsageInsights(workflow: WorkflowDefinition): Insight[] {
    const insights: Insight[] = [];

    // Check workflow complexity
    if (workflow.nodes.length > 50) {
      insights.push({
        id: uuidv4(),
        type: InsightType.USAGE,
        severity: InsightSeverity.MEDIUM,
        title: 'High Workflow Complexity',
        description: `Workflow has ${workflow.nodes.length} nodes, which may be difficult to maintain`,
        action: 'Consider breaking into smaller sub-workflows',
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    // Check for disabled nodes
    const disabledNodes = workflow.nodes.filter((n) => n.disabled).map((n) => n.id);
    if (disabledNodes.length > 3) {
      insights.push({
        id: uuidv4(),
        type: InsightType.USAGE,
        severity: InsightSeverity.LOW,
        title: 'Many Disabled Nodes',
        description: `${disabledNodes.length} nodes are disabled`,
        action: 'Remove unused disabled nodes to reduce clutter',
        affectedNodes: disabledNodes,
        timestamp: Date.now(),
        workflowId: workflow.id!,
      });
    }

    return insights;
  }

  /**
   * Aggregate similar insights to reduce noise
   */
  private aggregateSimilarInsights(insights: Insight[]): Insight[] {
    const grouped = new Map<string, Insight[]>();

    // Group by type and title
    for (const insight of insights) {
      const key = `${insight.type}:${insight.title}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(insight);
    }

    // Aggregate each group
    const aggregated: Insight[] = [];
    for (const [, group] of grouped) {
      if (group.length === 1) {
        aggregated.push(group[0]);
      } else {
        // Combine multiple similar insights
        const first = group[0];
        const allAffectedNodes = group
          .flatMap((i) => i.affectedNodes || [])
          .filter((v, i, a) => a.indexOf(v) === i);

        aggregated.push({
          ...first,
          description: `${first.description} (${group.length} instances)`,
          affectedNodes: allAffectedNodes,
        });
      }
    }

    return aggregated;
  }

  /**
   * Prioritize insights by impact and actionability
   */
  private prioritizeInsights(insights: Insight[]): Insight[] {
    const severityScore = {
      [InsightSeverity.CRITICAL]: 5,
      [InsightSeverity.HIGH]: 4,
      [InsightSeverity.MEDIUM]: 3,
      [InsightSeverity.LOW]: 2,
      [InsightSeverity.INFO]: 1,
    };

    return insights.sort((a, b) => {
      const scoreA = severityScore[a.severity];
      const scoreB = severityScore[b.severity];
      return scoreB - scoreA;
    });
  }

  /**
   * Update insight history
   */
  private updateHistory(workflowId: string, insights: Insight[]): void {
    const history: InsightHistory[] = insights.map((insight) => ({
      insightId: insight.id,
      workflowId,
      timestamp: insight.timestamp,
      resolved: false,
    }));

    if (!this.history.has(workflowId)) {
      this.history.set(workflowId, []);
    }
    this.history.get(workflowId)!.push(...history);
  }

  // Helper methods
  private patternTypeToInsightType(
    patternType: Pattern['type'],
  ): InsightType {
    switch (patternType) {
      case 'anti_pattern':
        return InsightType.RELIABILITY;
      case 'optimization_opportunity':
        return InsightType.PERFORMANCE;
      case 'best_practice':
        return InsightType.USAGE;
      default:
        return InsightType.USAGE;
    }
  }

  private patternImpactToSeverity(
    impact: 'low' | 'medium' | 'high',
  ): InsightSeverity {
    switch (impact) {
      case 'high':
        return InsightSeverity.HIGH;
      case 'medium':
        return InsightSeverity.MEDIUM;
      case 'low':
        return InsightSeverity.LOW;
      default:
        return InsightSeverity.INFO;
    }
  }

  private findLongSequentialChains(workflow: WorkflowDefinition): string[][] {
    const chains: string[][] = [];
    const visited = new Set<string>();

    for (const node of workflow.nodes) {
      if (visited.has(node.id)) continue;

      const chain = [node.id];
      let current = node.id;

      while (true) {
        const connections = workflow.connections[current];
        if (!connections) break;

        const outputs = Object.values(connections).flat().flat();
        if (outputs.length !== 1) break; // Branch or end

        const next = outputs[0].node;
        if (visited.has(next)) break;

        chain.push(next);
        visited.add(next);
        current = next;
      }

      if (chain.length >= 8) {
        chains.push(chain);
      }
    }

    return chains;
  }

  private findHeavyTransformations(workflow: WorkflowDefinition): string[] {
    return workflow.nodes
      .filter(
        (n) =>
          n.type === 'n8n-nodes-base.code' ||
          n.type === 'n8n-nodes-base.function' ||
          n.type === 'n8n-nodes-base.set',
      )
      .map((n) => n.id);
  }

  private findNodesWithoutTimeouts(workflow: WorkflowDefinition): string[] {
    return workflow.nodes
      .filter(
        (n) =>
          (n.type.includes('Http') || n.type.includes('Request')) &&
          !JSON.stringify(n.parameters).includes('timeout'),
      )
      .map((n) => n.id);
  }

  private findNodesWithoutRetries(workflow: WorkflowDefinition): string[] {
    return workflow.nodes
      .filter(
        (n) =>
          (n.type.includes('Http') || n.type.includes('Api')) &&
          !JSON.stringify(n.parameters).includes('retry'),
      )
      .map((n) => n.id);
  }

  private findNodesWithoutValidation(workflow: WorkflowDefinition): string[] {
    const hasValidation = workflow.nodes.some(
      (n) =>
        n.type === 'n8n-nodes-base.if' ||
        n.type === 'n8n-nodes-base.switch' ||
        JSON.stringify(n.parameters).includes('validate'),
    );

    if (hasValidation) return [];

    return workflow.nodes.filter((n) => n.type.includes('Webhook')).map((n) => n.id);
  }

  private findExpensiveOperations(workflow: WorkflowDefinition): string[] {
    const expensiveTypes = ['OpenAi', 'Anthropic', 'Google', 'Azure'];
    return workflow.nodes
      .filter((n) => expensiveTypes.some((type) => n.type.includes(type)))
      .map((n) => n.id);
  }

  private findRedundantCalls(workflow: WorkflowDefinition): string[] {
    const apiNodes = workflow.nodes.filter((n) => n.type.includes('Http'));
    const seen = new Map<string, string[]>();

    for (const node of apiNodes) {
      const key = JSON.stringify(node.parameters);
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(node.id);
    }

    const redundant: string[] = [];
    for (const [, ids] of seen) {
      if (ids.length > 1) {
        redundant.push(...ids);
      }
    }

    return redundant;
  }

  private findUnsecureWebhooks(workflow: WorkflowDefinition): string[] {
    return workflow.nodes
      .filter((n) => {
        if (!n.type.includes('Webhook')) return false;
        const params = JSON.stringify(n.parameters);
        return !params.includes('authentication') && !params.includes('auth');
      })
      .map((n) => n.id);
  }

  private findDataExposureRisks(workflow: WorkflowDefinition): string[] {
    return workflow.nodes
      .filter((n) => {
        const params = JSON.stringify(n.parameters);
        return (
          params.includes('password') ||
          params.includes('secret') ||
          params.includes('token') ||
          params.includes('apiKey')
        );
      })
      .map((n) => n.id);
  }
}
