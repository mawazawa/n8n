/**
 * Cost Analyzer
 * Analyzes workflow execution costs and identifies optimization opportunities
 */

import type { WorkflowDefinition, WorkflowNode } from '../types/workflow.js';
import type { CostAnalysis, TrendData } from './types.js';

interface CostRecord {
  workflowId: string;
  nodeId: string;
  timestamp: number;
  cost: number;
}

export class CostAnalyzer {
  private costRecords: Map<string, CostRecord[]>;
  private nodeCostRates: Map<string, number>;

  constructor() {
    this.costRecords = new Map();
    this.nodeCostRates = this.initializeNodeCostRates();
  }

  /**
   * Analyze workflow costs
   */
  async analyze(workflow: WorkflowDefinition): Promise<CostAnalysis> {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    // Calculate total cost
    const totalCost = this.calculateTotalCost(workflow);

    // Generate cost breakdown by node
    const breakdown = this.generateCostBreakdown(workflow);

    // Calculate cost trends
    const trends = this.calculateCostTrends(workflow.id);

    // Identify optimization opportunities
    const optimizations = this.identifyOptimizations(workflow, breakdown);

    // Project future costs
    const projectedCost = this.projectFutureCosts(workflow.id, trends);

    return {
      workflowId: workflow.id,
      totalCost,
      breakdown,
      trends,
      optimizations,
      projectedCost,
    };
  }

  /**
   * Record cost for tracking
   */
  recordCost(record: CostRecord): void {
    const key = record.workflowId;
    if (!this.costRecords.has(key)) {
      this.costRecords.set(key, []);
    }

    this.costRecords.get(key)!.push(record);

    // Keep only last 1000 records per workflow
    const records = this.costRecords.get(key)!;
    if (records.length > 1000) {
      records.shift();
    }
  }

  /**
   * Initialize node cost rates (cost per execution)
   */
  private initializeNodeCostRates(): Map<string, number> {
    const rates = new Map<string, number>();

    // AI/LLM nodes (expensive)
    rates.set('openai', 50);
    rates.set('anthropic', 45);
    rates.set('langchain', 40);
    rates.set('google-ai', 35);

    // Database operations (moderate)
    rates.set('postgres', 5);
    rates.set('mysql', 5);
    rates.set('mongodb', 5);
    rates.set('redis', 2);

    // HTTP/API calls (moderate)
    rates.set('http', 3);
    rates.set('webhook', 1);

    // Compute operations (low)
    rates.set('code', 2);
    rates.set('function', 2);
    rates.set('set', 1);

    // Control flow (very low)
    rates.set('if', 0.5);
    rates.set('switch', 0.5);
    rates.set('merge', 0.5);

    return rates;
  }

  /**
   * Calculate total cost
   */
  private calculateTotalCost(workflow: WorkflowDefinition): number {
    let total = 0;

    for (const node of workflow.nodes) {
      total += this.estimateNodeCost(node);
    }

    // Multiply by estimated executions per month
    const estimatedExecutions = this.estimateMonthlyExecutions(workflow);
    return total * estimatedExecutions;
  }

  /**
   * Estimate cost for a single node
   */
  private estimateNodeCost(node: WorkflowNode): number {
    const nodeType = node.type.toLowerCase();

    for (const [key, cost] of this.nodeCostRates) {
      if (nodeType.includes(key)) {
        return cost;
      }
    }

    // Default cost
    return 1;
  }

  /**
   * Estimate monthly executions
   */
  private estimateMonthlyExecutions(workflow: WorkflowDefinition): number {
    // Check for triggers/webhooks
    const hasTrigger = workflow.nodes.some(
      (n) => n.type.includes('Trigger') || n.type.includes('Webhook'),
    );

    if (!hasTrigger) {
      // Manual workflow, estimate fewer executions
      return 50;
    }

    // Active workflows run more often
    if (workflow.active) {
      return 500;
    }

    return 100;
  }

  /**
   * Generate cost breakdown by node
   */
  private generateCostBreakdown(
    workflow: WorkflowDefinition,
  ): CostAnalysis['breakdown'] {
    const breakdown: CostAnalysis['breakdown'] = [];
    const totalCost = this.calculateTotalCost(workflow);
    const estimatedExecutions = this.estimateMonthlyExecutions(workflow);

    for (const node of workflow.nodes) {
      const nodeCost = this.estimateNodeCost(node) * estimatedExecutions;
      const percentage = totalCost > 0 ? (nodeCost / totalCost) * 100 : 0;

      breakdown.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        cost: nodeCost,
        percentage,
        executions: estimatedExecutions,
        avgCostPerExecution: this.estimateNodeCost(node),
      });
    }

    // Sort by cost (highest first)
    breakdown.sort((a, b) => b.cost - a.cost);

    return breakdown;
  }

  /**
   * Calculate cost trends
   */
  private calculateCostTrends(workflowId: string): CostAnalysis['trends'] {
    const records = this.costRecords.get(workflowId) || [];

    if (records.length === 0) {
      // Return mock trends
      return {
        daily: this.createMockTrend('daily'),
        weekly: this.createMockTrend('weekly'),
        monthly: this.createMockTrend('monthly'),
      };
    }

    return {
      daily: this.calculateTrend(records, 24 * 60 * 60 * 1000), // 1 day
      weekly: this.calculateTrend(records, 7 * 24 * 60 * 60 * 1000), // 7 days
      monthly: this.calculateTrend(records, 30 * 24 * 60 * 60 * 1000), // 30 days
    };
  }

  /**
   * Calculate trend for a time period
   */
  private calculateTrend(records: CostRecord[], periodMs: number): TrendData {
    const now = Date.now();
    const windowStart = now - periodMs;

    const periodRecords = records.filter((r) => r.timestamp >= windowStart);

    if (periodRecords.length === 0) {
      return this.createMockTrend('custom');
    }

    const values = periodRecords.map((r) => ({
      timestamp: r.timestamp,
      value: r.cost,
    }));

    const current = periodRecords[periodRecords.length - 1]?.cost || 0;
    const previous = periodRecords[Math.floor(periodRecords.length / 2)]?.cost || current;

    const allCosts = periodRecords.map((r) => r.cost);
    const average = allCosts.reduce((a, b) => a + b, 0) / allCosts.length;
    const min = Math.min(...allCosts);
    const max = Math.max(...allCosts);

    const variance =
      allCosts.reduce((sum, cost) => sum + Math.pow(cost - average, 2), 0) /
      allCosts.length;
    const stdDev = Math.sqrt(variance);

    const changePercent = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
    let direction: 'up' | 'down' | 'stable' = 'stable';

    if (changePercent > 5) {
      direction = 'up';
    } else if (changePercent < -5) {
      direction = 'down';
    }

    return {
      metric: 'cost',
      values,
      direction,
      changePercent,
      current,
      previous,
      average,
      min,
      max,
      stdDev,
    };
  }

  /**
   * Create mock trend data
   */
  private createMockTrend(period: string): TrendData {
    const points = period === 'daily' ? 24 : period === 'weekly' ? 7 : 30;
    const baseValue = 50 + Math.random() * 50;
    const values: Array<{ timestamp: number; value: number }> = [];
    const now = Date.now();

    for (let i = 0; i < points; i++) {
      values.push({
        timestamp: now - (points - i) * (24 * 60 * 60 * 1000),
        value: baseValue + (Math.random() - 0.5) * 20,
      });
    }

    const current = values[values.length - 1].value;
    const previous = values[Math.floor(values.length / 2)].value;
    const allValues = values.map((v) => v.value);
    const average = allValues.reduce((a, b) => a + b, 0) / allValues.length;

    return {
      metric: 'cost',
      values,
      direction: current > previous ? 'up' : current < previous ? 'down' : 'stable',
      changePercent: previous !== 0 ? ((current - previous) / previous) * 100 : 0,
      current,
      previous,
      average,
      min: Math.min(...allValues),
      max: Math.max(...allValues),
      stdDev: 10,
    };
  }

  /**
   * Identify cost optimization opportunities
   */
  private identifyOptimizations(
    workflow: WorkflowDefinition,
    breakdown: CostAnalysis['breakdown'],
  ): CostAnalysis['optimizations'] {
    const optimizations: CostAnalysis['optimizations'] = [];

    // Find expensive nodes (>20% of total cost)
    const expensiveNodes = breakdown.filter((b) => b.percentage > 20);

    for (const node of expensiveNodes) {
      if (node.nodeType.toLowerCase().includes('openai') ||
          node.nodeType.toLowerCase().includes('anthropic')) {
        optimizations.push({
          description: `Reduce ${node.nodeName} calls through caching or batching`,
          potentialSavings: node.cost * 0.4,
          savingsPercent: 40,
          effort: 'medium',
        });
      }
    }

    // Check for redundant API calls
    const apiNodes = breakdown.filter((b) =>
      b.nodeType.toLowerCase().includes('http') ||
      b.nodeType.toLowerCase().includes('api'),
    );

    if (apiNodes.length > 5) {
      const totalApiCost = apiNodes.reduce((sum, n) => sum + n.cost, 0);
      optimizations.push({
        description: 'Consolidate or cache API calls to reduce redundancy',
        potentialSavings: totalApiCost * 0.3,
        savingsPercent: 30,
        effort: 'medium',
      });
    }

    // Check for inefficient loops
    const hasLoops = workflow.nodes.some((n) =>
      n.type.includes('Loop') || n.type.includes('splitInBatches'),
    );

    if (hasLoops) {
      const loopCost = breakdown.reduce((sum, b) => sum + b.cost, 0) * 0.2;
      optimizations.push({
        description: 'Optimize loop iterations or use batch operations',
        potentialSavings: loopCost,
        savingsPercent: 20,
        effort: 'high',
      });
    }

    // Check for always-active workflows that could be scheduled
    if (workflow.active && workflow.nodes.some((n) => n.type.includes('Trigger'))) {
      const currentCost = breakdown.reduce((sum, b) => sum + b.cost, 0);
      optimizations.push({
        description: 'Schedule workflow for off-peak hours or reduce trigger frequency',
        potentialSavings: currentCost * 0.15,
        savingsPercent: 15,
        effort: 'low',
      });
    }

    // Sort by potential savings
    optimizations.sort((a, b) => b.potentialSavings - a.potentialSavings);

    return optimizations.slice(0, 5); // Top 5 optimizations
  }

  /**
   * Project future costs
   */
  private projectFutureCosts(
    workflowId: string,
    trends: CostAnalysis['trends'],
  ): CostAnalysis['projectedCost'] {
    const currentCost = trends.monthly.current;
    const growthRate = trends.monthly.changePercent / 100;

    return {
      nextWeek: currentCost * (1 + growthRate * 0.25),
      nextMonth: currentCost * (1 + growthRate),
      nextQuarter: currentCost * (1 + growthRate) * 3,
    };
  }
}
