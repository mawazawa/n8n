/**
 * Benchmark Service
 * Compares workflow performance against similar workflows and industry standards
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { BenchmarkResult } from './types.js';
import { BenchmarkResultSchema } from './types.js';
import { SimilarityFinder } from './similarity.js';

interface BenchmarkData {
  workflowId: string;
  category: string;
  executionTime: number;
  successRate: number;
  cost: number;
}

export class BenchmarkService {
  private similarityFinder: SimilarityFinder;
  private benchmarkData: Map<string, BenchmarkData>;

  constructor() {
    this.similarityFinder = new SimilarityFinder();
    this.benchmarkData = new Map();
  }

  /**
   * Benchmark a workflow against similar workflows
   */
  async benchmark(
    workflow: WorkflowDefinition,
    allWorkflows: WorkflowDefinition[],
  ): Promise<BenchmarkResult> {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    // Determine workflow category
    const category = this.categorizeWorkflow(workflow);

    // Find similar workflows
    const similarWorkflows = await this.similarityFinder.findSimilar(
      workflow,
      20,
      allWorkflows,
    );

    // Get current metrics
    const currentMetrics = this.getWorkflowMetrics(workflow.id);

    // Calculate industry benchmarks
    const industryBenchmarks = this.calculateIndustryBenchmarks(category);

    // Calculate percentiles
    const percentiles = this.calculatePercentiles(
      currentMetrics,
      similarWorkflows.map((sw) => sw.metrics!),
    );

    // Generate benchmark result
    const result: BenchmarkResult = {
      workflowId: workflow.id,
      category,
      percentile: percentiles.overall,
      metrics: {
        executionTime: {
          value: currentMetrics.executionTime,
          unit: 'ms',
          percentile: percentiles.executionTime,
          industryAvg: industryBenchmarks.executionTime,
          bestInClass: this.getBestInClass(similarWorkflows, 'executionTime'),
        },
        successRate: {
          value: currentMetrics.successRate,
          unit: '%',
          percentile: percentiles.successRate,
          industryAvg: industryBenchmarks.successRate,
          bestInClass: this.getBestInClass(similarWorkflows, 'successRate'),
        },
        cost: {
          value: currentMetrics.cost,
          unit: 'credits',
          percentile: percentiles.cost,
          industryAvg: industryBenchmarks.cost,
          bestInClass: this.getBestInClass(similarWorkflows, 'cost'),
        },
      },
      comparison: {
        similarWorkflows: similarWorkflows.length,
        betterThan: Math.floor(similarWorkflows.length * (percentiles.overall / 100)),
        worseThan: Math.ceil(similarWorkflows.length * (1 - percentiles.overall / 100)),
      },
      recommendations: this.generateBenchmarkRecommendations(
        currentMetrics,
        industryBenchmarks,
        percentiles,
      ),
    };

    return BenchmarkResultSchema.parse(result);
  }

  /**
   * Record benchmark data for a workflow
   */
  recordBenchmark(data: BenchmarkData): void {
    this.benchmarkData.set(data.workflowId, data);
  }

  /**
   * Get workflow metrics
   */
  private getWorkflowMetrics(workflowId: string): {
    executionTime: number;
    successRate: number;
    cost: number;
  } {
    const data = this.benchmarkData.get(workflowId);

    if (data) {
      return {
        executionTime: data.executionTime,
        successRate: data.successRate,
        cost: data.cost,
      };
    }

    // Default mock metrics
    return {
      executionTime: 2000 + Math.random() * 3000,
      successRate: 85 + Math.random() * 15,
      cost: 50 + Math.random() * 50,
    };
  }

  /**
   * Categorize workflow
   */
  private categorizeWorkflow(workflow: WorkflowDefinition): string {
    const nodeTypes = workflow.nodes.map((n) => n.type);

    // AI/LangChain workflows
    if (
      nodeTypes.some(
        (t) =>
          t.includes('langchain') ||
          t.includes('openai') ||
          t.includes('anthropic') ||
          t.includes('Agent'),
      )
    ) {
      return 'AI Agent';
    }

    // Data pipelines
    if (
      nodeTypes.some((t) => t.includes('Database') || t.includes('Postgres') || t.includes('MySQL'))
    ) {
      return 'Data Pipeline';
    }

    // Integration workflows
    if (nodeTypes.some((t) => t.includes('Http') || t.includes('Api'))) {
      return 'Integration';
    }

    // Webhook/Trigger workflows
    if (nodeTypes.some((t) => t.includes('Webhook') || t.includes('Trigger'))) {
      return 'Event-Driven';
    }

    // Processing workflows
    if (nodeTypes.some((t) => t.includes('Code') || t.includes('Function') || t.includes('Set'))) {
      return 'Data Processing';
    }

    return 'General Automation';
  }

  /**
   * Calculate industry benchmarks
   */
  private calculateIndustryBenchmarks(category: string): {
    executionTime: number;
    successRate: number;
    cost: number;
  } {
    // Industry standard benchmarks by category
    const benchmarks: Record<
      string,
      { executionTime: number; successRate: number; cost: number }
    > = {
      'AI Agent': {
        executionTime: 5000,
        successRate: 90,
        cost: 100,
      },
      'Data Pipeline': {
        executionTime: 3000,
        successRate: 95,
        cost: 50,
      },
      Integration: {
        executionTime: 2000,
        successRate: 92,
        cost: 40,
      },
      'Event-Driven': {
        executionTime: 1500,
        successRate: 94,
        cost: 30,
      },
      'Data Processing': {
        executionTime: 2500,
        successRate: 93,
        cost: 45,
      },
      'General Automation': {
        executionTime: 2000,
        successRate: 90,
        cost: 35,
      },
    };

    return (
      benchmarks[category] || {
        executionTime: 2500,
        successRate: 90,
        cost: 50,
      }
    );
  }

  /**
   * Calculate percentiles
   */
  private calculatePercentiles(
    current: { executionTime: number; successRate: number; cost: number },
    similar: Array<{ avgExecutionTime: number; successRate: number; cost: number }>,
  ): {
    executionTime: number;
    successRate: number;
    cost: number;
    overall: number;
  } {
    if (similar.length === 0) {
      return {
        executionTime: 50,
        successRate: 50,
        cost: 50,
        overall: 50,
      };
    }

    // Execution time percentile (lower is better)
    const executionTimes = similar.map((s) => s.avgExecutionTime).sort((a, b) => a - b);
    const execTimePercentile = this.calculatePercentile(
      current.executionTime,
      executionTimes,
      false,
    );

    // Success rate percentile (higher is better)
    const successRates = similar.map((s) => s.successRate).sort((a, b) => a - b);
    const successRatePercentile = this.calculatePercentile(
      current.successRate,
      successRates,
      true,
    );

    // Cost percentile (lower is better)
    const costs = similar.map((s) => s.cost).sort((a, b) => a - b);
    const costPercentile = this.calculatePercentile(current.cost, costs, false);

    // Overall percentile (weighted average)
    const overall = (execTimePercentile + successRatePercentile + costPercentile) / 3;

    return {
      executionTime: execTimePercentile,
      successRate: successRatePercentile,
      cost: costPercentile,
      overall,
    };
  }

  /**
   * Calculate percentile for a value
   */
  private calculatePercentile(
    value: number,
    sortedValues: number[],
    higherIsBetter: boolean,
  ): number {
    if (sortedValues.length === 0) return 50;

    let betterCount = 0;

    for (const v of sortedValues) {
      if (higherIsBetter) {
        if (value > v) betterCount++;
      } else {
        if (value < v) betterCount++;
      }
    }

    return (betterCount / sortedValues.length) * 100;
  }

  /**
   * Get best-in-class metric
   */
  private getBestInClass(
    similarWorkflows: Array<{ metrics?: { avgExecutionTime: number; successRate: number; cost: number } }>,
    metric: 'executionTime' | 'successRate' | 'cost',
  ): number {
    const values = similarWorkflows
      .filter((sw) => sw.metrics)
      .map((sw) => {
        if (metric === 'executionTime') return sw.metrics!.avgExecutionTime;
        if (metric === 'successRate') return sw.metrics!.successRate;
        return sw.metrics!.cost;
      });

    if (values.length === 0) {
      // Default best-in-class values
      if (metric === 'executionTime') return 1000;
      if (metric === 'successRate') return 99;
      return 20;
    }

    // Best-in-class is min for time/cost, max for success rate
    if (metric === 'successRate') {
      return Math.max(...values);
    } else {
      return Math.min(...values);
    }
  }

  /**
   * Generate benchmark recommendations
   */
  private generateBenchmarkRecommendations(
    current: { executionTime: number; successRate: number; cost: number },
    industry: { executionTime: number; successRate: number; cost: number },
    percentiles: { executionTime: number; successRate: number; cost: number; overall: number },
  ): string[] {
    const recommendations: string[] = [];

    // Execution time
    if (percentiles.executionTime < 50) {
      const diff = ((current.executionTime - industry.executionTime) / industry.executionTime) * 100;
      recommendations.push(
        `Execution time is ${diff.toFixed(0)}% slower than industry average. Consider optimizing slow nodes.`,
      );
    } else if (percentiles.executionTime > 75) {
      recommendations.push(
        'Excellent execution time! Consider sharing your optimization strategies.',
      );
    }

    // Success rate
    if (percentiles.successRate < 50) {
      const diff = industry.successRate - current.successRate;
      recommendations.push(
        `Success rate is ${diff.toFixed(1)}% below industry average. Review error handling and reliability.`,
      );
    } else if (percentiles.successRate > 75) {
      recommendations.push('Great success rate! Your workflow is highly reliable.');
    }

    // Cost
    if (percentiles.cost < 50) {
      const diff = ((current.cost - industry.cost) / industry.cost) * 100;
      recommendations.push(
        `Cost is ${diff.toFixed(0)}% higher than industry average. Look for cost optimization opportunities.`,
      );
    } else if (percentiles.cost > 75) {
      recommendations.push('Excellent cost efficiency! You are using resources optimally.');
    }

    // Overall
    if (percentiles.overall < 33) {
      recommendations.push(
        'Overall performance is below average. Prioritize improvements in weak areas.',
      );
    } else if (percentiles.overall > 75) {
      recommendations.push(
        'Outstanding performance! Your workflow is in the top quartile.',
      );
    }

    return recommendations;
  }
}
