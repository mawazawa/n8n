/**
 * Recommendation Engine
 * Generates actionable recommendations with quantified impact
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { Insight, Recommendation } from './types.js';
import { RecommendationSchema } from './types.js';
import { InsightGenerator } from './insights.js';
import { v4 as uuidv4 } from 'uuid';

interface ROICalculation {
  timeSavings: number; // hours per week
  costSavings: number; // dollars per month
  reliabilityGain: number; // percentage
  implementationCost: number; // hours
}

export class RecommendationEngine {
  private insightGenerator: InsightGenerator;

  constructor() {
    this.insightGenerator = new InsightGenerator();
  }

  /**
   * Generate recommendations for a workflow
   * Ensures at least 3 optimization opportunities per workflow
   */
  async recommend(workflow: WorkflowDefinition): Promise<Recommendation[]> {
    // Get insights first
    const insights = await this.insightGenerator.generate(workflow);

    // Convert insights to recommendations
    const recommendations = await Promise.all(
      insights.map((insight) => this.insightToRecommendation(insight, workflow)),
    );

    // Rank by ROI
    const ranked = this.rankByROI(recommendations);

    // Ensure we have at least 3 optimization opportunities
    const optimizations = ranked.filter(
      (r) =>
        r.insight.type === 'performance' ||
        r.insight.type === 'cost' ||
        r.insight.type === 'reliability',
    );

    if (optimizations.length < 3) {
      // Add generic optimization recommendations
      ranked.push(...this.generateGenericOptimizations(workflow, 3 - optimizations.length));
    }

    // Validate and return
    return ranked.map((rec) => RecommendationSchema.parse(rec));
  }

  /**
   * Convert insight to recommendation with quantified impact
   */
  private async insightToRecommendation(
    insight: Insight,
    workflow: WorkflowDefinition,
  ): Promise<Recommendation> {
    const roi = this.calculateROI(insight, workflow);
    const improvement = this.estimateImprovement(insight, workflow);
    const steps = this.generateImplementationSteps(insight);
    const alternatives = this.generateAlternatives(insight);

    const recommendation: Recommendation = {
      id: uuidv4(),
      insight,
      title: insight.title,
      description: this.expandDescription(insight, workflow),
      impact: insight.severity === 'critical' || insight.severity === 'high' ? 'high' :
              insight.severity === 'medium' ? 'medium' : 'low',
      effort: this.estimateEffort(insight, workflow),
      confidence: this.calculateConfidence(insight, workflow),
      roi: roi.timeSavings * 10 + roi.costSavings - roi.implementationCost,
      steps,
      estimatedImprovement: improvement,
      alternatives,
    };

    return recommendation;
  }

  /**
   * Calculate ROI for a recommendation
   */
  private calculateROI(insight: Insight, workflow: WorkflowDefinition): ROICalculation {
    const baseROI: ROICalculation = {
      timeSavings: 0,
      costSavings: 0,
      reliabilityGain: 0,
      implementationCost: 1,
    };

    switch (insight.type) {
      case 'performance':
        baseROI.timeSavings = (insight.affectedNodes?.length || 1) * 0.5;
        baseROI.implementationCost = 2;
        break;

      case 'cost':
        baseROI.costSavings = (insight.affectedNodes?.length || 1) * 50;
        baseROI.implementationCost = 1.5;
        break;

      case 'reliability':
        baseROI.reliabilityGain = 10;
        baseROI.timeSavings = 1; // Less debugging time
        baseROI.implementationCost = 2;
        break;

      case 'security':
        baseROI.reliabilityGain = 15;
        baseROI.implementationCost = 3;
        break;

      case 'usage':
        baseROI.timeSavings = 0.5;
        baseROI.implementationCost = 1;
        break;
    }

    // Adjust based on workflow size
    const complexityMultiplier = Math.min(workflow.nodes.length / 20, 2);
    baseROI.timeSavings *= complexityMultiplier;
    baseROI.costSavings *= complexityMultiplier;

    return baseROI;
  }

  /**
   * Estimate improvement metrics
   */
  private estimateImprovement(
    insight: Insight,
    workflow: WorkflowDefinition,
  ): Recommendation['estimatedImprovement'] {
    const affectedNodeCount = insight.affectedNodes?.length || 1;
    const totalNodes = workflow.nodes.length;

    switch (insight.type) {
      case 'performance':
        return {
          metric: 'Execution Time',
          currentValue: 100,
          projectedValue: Math.max(100 - affectedNodeCount * 10, 50),
          unit: 'seconds',
          improvementPercent: Math.min(affectedNodeCount * 10, 50),
        };

      case 'cost':
        return {
          metric: 'Monthly Cost',
          currentValue: 100,
          projectedValue: Math.max(100 - affectedNodeCount * 15, 40),
          unit: 'USD',
          improvementPercent: Math.min(affectedNodeCount * 15, 60),
        };

      case 'reliability':
        return {
          metric: 'Success Rate',
          currentValue: 85,
          projectedValue: Math.min(85 + affectedNodeCount * 3, 99),
          unit: '%',
          improvementPercent: Math.min(affectedNodeCount * 3, 14),
        };

      case 'security':
        return {
          metric: 'Security Score',
          currentValue: 70,
          projectedValue: Math.min(70 + affectedNodeCount * 5, 95),
          unit: 'score',
          improvementPercent: Math.min(affectedNodeCount * 5, 25),
        };

      default:
        return {
          metric: 'Maintainability',
          currentValue: 60,
          projectedValue: Math.min(60 + (affectedNodeCount / totalNodes) * 20, 90),
          unit: 'score',
          improvementPercent: Math.min((affectedNodeCount / totalNodes) * 20, 30),
        };
    }
  }

  /**
   * Generate implementation steps
   */
  private generateImplementationSteps(insight: Insight): string[] {
    const steps: string[] = [];

    // Generic first steps
    steps.push(`Review affected nodes: ${insight.affectedNodes?.join(', ') || 'N/A'}`);
    steps.push(`Understand current behavior: ${insight.description}`);

    // Type-specific steps
    switch (insight.type) {
      case 'performance':
        steps.push('Identify bottlenecks using execution data');
        steps.push('Implement optimization (caching, parallelization, or batching)');
        steps.push('Test performance improvements');
        steps.push('Monitor execution times after deployment');
        break;

      case 'cost':
        steps.push('Analyze current cost breakdown');
        steps.push('Implement cost reduction strategy');
        steps.push('Set up cost monitoring alerts');
        steps.push('Review and optimize regularly');
        break;

      case 'reliability':
        steps.push('Add error handling or retry logic');
        steps.push('Configure appropriate timeouts');
        steps.push('Test failure scenarios');
        steps.push('Set up monitoring and alerts');
        break;

      case 'security':
        steps.push('Audit current security configuration');
        steps.push('Implement security improvements');
        steps.push('Test authentication and authorization');
        steps.push('Document security measures');
        break;

      case 'usage':
        steps.push('Refactor workflow structure');
        steps.push('Update documentation');
        steps.push('Train team on changes');
        break;
    }

    return steps;
  }

  /**
   * Generate alternative approaches
   */
  private generateAlternatives(insight: Insight): Recommendation['alternatives'] {
    const alternatives: NonNullable<Recommendation['alternatives']> = [];

    if (insight.type === 'performance') {
      alternatives.push(
        {
          title: 'Caching Strategy',
          description: 'Implement caching layer for repeated operations',
          tradeoffs: ['Requires cache invalidation logic', 'May use more memory'],
        },
        {
          title: 'Async Processing',
          description: 'Move heavy operations to background jobs',
          tradeoffs: ['More complex architecture', 'Delayed results'],
        },
      );
    }

    if (insight.type === 'cost') {
      alternatives.push(
        {
          title: 'Batch Operations',
          description: 'Group multiple operations to reduce API calls',
          tradeoffs: ['Less real-time processing', 'Requires buffering'],
        },
        {
          title: 'Alternative Services',
          description: 'Use cheaper alternative services where possible',
          tradeoffs: ['May have different features', 'Migration effort required'],
        },
      );
    }

    if (insight.type === 'reliability') {
      alternatives.push(
        {
          title: 'Error Workflow',
          description: 'Create dedicated error handling workflow',
          tradeoffs: ['Additional workflow to maintain'],
        },
        {
          title: 'Circuit Breaker',
          description: 'Implement circuit breaker pattern',
          tradeoffs: ['More complex logic', 'Requires monitoring'],
        },
      );
    }

    return alternatives.length > 0 ? alternatives : undefined;
  }

  /**
   * Estimate effort required
   */
  private estimateEffort(insight: Insight, workflow: WorkflowDefinition): 'low' | 'medium' | 'high' {
    const affectedNodeCount = insight.affectedNodes?.length || 1;
    const totalNodes = workflow.nodes.length;
    const impactRatio = affectedNodeCount / totalNodes;

    if (insight.type === 'security' || insight.type === 'reliability') {
      return impactRatio > 0.3 ? 'high' : 'medium';
    }

    if (insight.type === 'performance' || insight.type === 'cost') {
      return affectedNodeCount > 5 ? 'high' : affectedNodeCount > 2 ? 'medium' : 'low';
    }

    return impactRatio > 0.5 ? 'medium' : 'low';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(insight: Insight, workflow: WorkflowDefinition): number {
    let confidence = 70; // Base confidence

    // Higher confidence for pattern-based insights
    if (insight.metadata?.confidence) {
      confidence = (insight.metadata.confidence as number) * 100;
    }

    // Adjust based on affected nodes
    const affectedNodeCount = insight.affectedNodes?.length || 0;
    if (affectedNodeCount > 0) {
      confidence += 10;
    }

    // Higher confidence for critical security issues
    if (insight.type === 'security' && insight.severity === 'critical') {
      confidence = 95;
    }

    return Math.min(Math.max(confidence, 0), 100);
  }

  /**
   * Expand description with context
   */
  private expandDescription(insight: Insight, workflow: WorkflowDefinition): string {
    let description = insight.description;

    if (insight.affectedNodes && insight.affectedNodes.length > 0) {
      const nodeNames = insight.affectedNodes
        .map((id) => {
          const node = workflow.nodes.find((n) => n.id === id);
          return node ? node.name : id;
        })
        .slice(0, 3)
        .join(', ');

      description += ` Affects nodes: ${nodeNames}${insight.affectedNodes.length > 3 ? ', ...' : ''}.`;
    }

    description += ` ${insight.action}`;

    return description;
  }

  /**
   * Rank recommendations by ROI
   */
  private rankByROI(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.sort((a, b) => {
      // Primary sort: ROI
      if (b.roi !== a.roi) {
        return b.roi - a.roi;
      }

      // Secondary sort: Impact
      const impactScore = { high: 3, medium: 2, low: 1 };
      if (impactScore[b.impact] !== impactScore[a.impact]) {
        return impactScore[b.impact] - impactScore[a.impact];
      }

      // Tertiary sort: Effort (prefer lower effort)
      const effortScore = { low: 3, medium: 2, high: 1 };
      return effortScore[b.effort] - effortScore[a.effort];
    });
  }

  /**
   * Generate generic optimization recommendations
   */
  private generateGenericOptimizations(
    workflow: WorkflowDefinition,
    count: number,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    const genericOptimizations = [
      {
        type: 'performance' as const,
        title: 'Enable Workflow Execution Data Retention',
        description:
          'Save execution data to analyze performance patterns and identify bottlenecks over time',
        metric: 'Debug Time',
        currentValue: 60,
        projectedValue: 30,
        unit: 'minutes/week',
      },
      {
        type: 'cost' as const,
        title: 'Implement Conditional Execution',
        description:
          'Add conditions to skip unnecessary operations based on data, reducing execution costs',
        metric: 'Execution Cost',
        currentValue: 100,
        projectedValue: 75,
        unit: 'USD/month',
      },
      {
        type: 'reliability' as const,
        title: 'Add Execution Timeout',
        description:
          'Configure workflow-level timeout to prevent hanging executions and resource waste',
        metric: 'Hanging Executions',
        currentValue: 5,
        projectedValue: 0,
        unit: 'per month',
      },
      {
        type: 'performance' as const,
        title: 'Optimize Data Transfer',
        description:
          'Reduce data passed between nodes by selecting only required fields, improving performance',
        metric: 'Data Transfer',
        currentValue: 100,
        projectedValue: 60,
        unit: 'MB/execution',
      },
      {
        type: 'cost' as const,
        title: 'Schedule Non-Urgent Workflows',
        description:
          'Move non-urgent workflows to off-peak hours to optimize resource usage and reduce costs',
        metric: 'Resource Cost',
        currentValue: 100,
        projectedValue: 70,
        unit: 'USD/month',
      },
    ];

    for (let i = 0; i < Math.min(count, genericOptimizations.length); i++) {
      const opt = genericOptimizations[i];

      const insight: Insight = {
        id: uuidv4(),
        type: opt.type,
        severity: 'medium',
        title: opt.title,
        description: opt.description,
        action: 'Consider implementing this optimization',
        timestamp: Date.now(),
        workflowId: workflow.id!,
      };

      recommendations.push({
        id: uuidv4(),
        insight,
        title: opt.title,
        description: opt.description,
        impact: 'medium',
        effort: 'low',
        confidence: 75,
        roi: 50,
        steps: [
          'Review current workflow configuration',
          'Implement the optimization',
          'Test the changes',
          'Monitor the impact',
        ],
        estimatedImprovement: {
          metric: opt.metric,
          currentValue: opt.currentValue,
          projectedValue: opt.projectedValue,
          unit: opt.unit,
          improvementPercent: ((opt.currentValue - opt.projectedValue) / opt.currentValue) * 100,
        },
      });
    }

    return recommendations;
  }
}
