/**
 * Failure Predictor
 * Predicts workflow failures based on historical data and patterns
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { Prediction, PredictionResult } from './types.js';
import { PredictionResultSchema } from './types.js';
import { v4 as uuidv4 } from 'uuid';

interface HistoricalExecution {
  workflowId: string;
  timestamp: number;
  success: boolean;
  duration: number;
  error?: string;
}

export class FailurePredictor {
  private history: Map<string, HistoricalExecution[]>;
  private predictionAccuracy: Map<string, number[]>;

  constructor() {
    this.history = new Map();
    this.predictionAccuracy = new Map();
  }

  /**
   * Predict failure probability for a workflow
   */
  async predictFailure(workflow: WorkflowDefinition): Promise<Prediction> {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    const historicalData = this.history.get(workflow.id) || [];
    const predictionResult = this.generatePrediction(workflow, historicalData);

    // Calculate historical accuracy
    const historicalAccuracy = this.calculateHistoricalAccuracy(workflow.id);

    // Find similar cases
    const similarCases = this.findSimilarCases(predictionResult);

    const prediction: Prediction = {
      result: PredictionResultSchema.parse(predictionResult),
      historicalAccuracy,
      similarCases,
    };

    return prediction;
  }

  /**
   * Record execution for learning
   */
  recordExecution(execution: HistoricalExecution): void {
    if (!this.history.has(execution.workflowId)) {
      this.history.set(execution.workflowId, []);
    }

    const executions = this.history.get(execution.workflowId)!;
    executions.push(execution);

    // Keep only last 1000 executions
    if (executions.length > 1000) {
      executions.shift();
    }
  }

  /**
   * Validate prediction against actual outcome
   */
  validatePrediction(
    predictionId: string,
    workflowId: string,
    actualFailure: boolean,
  ): void {
    if (!this.predictionAccuracy.has(workflowId)) {
      this.predictionAccuracy.set(workflowId, []);
    }

    // Store accuracy (1 if correct, 0 if wrong)
    const accuracy = actualFailure ? 1 : 0;
    this.predictionAccuracy.get(workflowId)!.push(accuracy);

    // Keep only last 100 predictions
    const accuracyHistory = this.predictionAccuracy.get(workflowId)!;
    if (accuracyHistory.length > 100) {
      accuracyHistory.shift();
    }
  }

  /**
   * Generate prediction result
   */
  private generatePrediction(
    workflow: WorkflowDefinition,
    historicalData: HistoricalExecution[],
  ): PredictionResult {
    const now = Date.now();

    // Analyze risk factors
    const riskFactors = this.analyzeRiskFactors(workflow, historicalData);

    // Calculate failure probability
    const probability = this.calculateFailureProbability(riskFactors);

    // Predict timeframe
    const timeframe = this.predictTimeframe(workflow, historicalData, probability);

    // Determine prediction type
    const type = this.determinePredictionType(riskFactors);

    // Calculate confidence
    const confidence = this.calculateConfidence(historicalData.length, riskFactors);

    // Generate mitigation strategies
    const mitigation = this.generateMitigation(riskFactors, type);

    return {
      id: uuidv4(),
      workflowId: workflow.id!,
      type,
      probability,
      timeframe,
      factors: riskFactors.map((factor) => ({
        name: factor.name,
        contribution: factor.weight * 100,
        description: factor.description,
      })),
      confidence,
      mitigation,
      generatedAt: now,
    };
  }

  /**
   * Analyze risk factors
   */
  private analyzeRiskFactors(
    workflow: WorkflowDefinition,
    historicalData: HistoricalExecution[],
  ): Array<{ name: string; weight: number; description: string }> {
    const factors: Array<{ name: string; weight: number; description: string }> = [];

    // Historical failure rate
    if (historicalData.length > 0) {
      const failureRate =
        historicalData.filter((e) => !e.success).length / historicalData.length;
      if (failureRate > 0.1) {
        factors.push({
          name: 'Historical Failure Rate',
          weight: failureRate,
          description: `${(failureRate * 100).toFixed(1)}% failure rate in past executions`,
        });
      }
    }

    // Complexity factor
    const complexityScore = workflow.nodes.length / 50;
    if (complexityScore > 0.5) {
      factors.push({
        name: 'Workflow Complexity',
        weight: Math.min(complexityScore, 1) * 0.3,
        description: `High complexity with ${workflow.nodes.length} nodes`,
      });
    }

    // Missing error handling
    const hasErrorHandling =
      workflow.nodes.some((n) => n.type.includes('Error')) ||
      Boolean(workflow.settings?.errorWorkflow);
    if (!hasErrorHandling) {
      factors.push({
        name: 'No Error Handling',
        weight: 0.4,
        description: 'Workflow lacks error handling mechanisms',
      });
    }

    // External dependencies
    const externalNodes = workflow.nodes.filter(
      (n) =>
        n.type.includes('Http') ||
        n.type.includes('Api') ||
        n.type.includes('Database') ||
        n.type.includes('Webhook'),
    );
    if (externalNodes.length > 5) {
      factors.push({
        name: 'External Dependencies',
        weight: Math.min(externalNodes.length / 20, 0.5),
        description: `${externalNodes.length} external service dependencies`,
      });
    }

    // Recent degradation
    if (historicalData.length >= 10) {
      const recent = historicalData.slice(-10);
      const recentFailureRate = recent.filter((e) => !e.success).length / recent.length;
      const overall =
        historicalData.filter((e) => !e.success).length / historicalData.length;

      if (recentFailureRate > overall * 1.5) {
        factors.push({
          name: 'Recent Degradation',
          weight: 0.6,
          description: 'Failure rate has increased recently',
        });
      }
    }

    // Performance degradation
    if (historicalData.length >= 10) {
      const recent = historicalData.slice(-5);
      const older = historicalData.slice(-15, -5);

      if (recent.length > 0 && older.length > 0) {
        const recentAvgDuration =
          recent.reduce((sum, e) => sum + e.duration, 0) / recent.length;
        const olderAvgDuration =
          older.reduce((sum, e) => sum + e.duration, 0) / older.length;

        if (recentAvgDuration > olderAvgDuration * 1.5) {
          factors.push({
            name: 'Performance Degradation',
            weight: 0.5,
            description: 'Execution time has increased significantly',
          });
        }
      }
    }

    // No recent executions
    if (historicalData.length > 0) {
      const lastExecution = historicalData[historicalData.length - 1];
      const daysSinceExecution = (Date.now() - lastExecution.timestamp) / (24 * 60 * 60 * 1000);

      if (daysSinceExecution > 30) {
        factors.push({
          name: 'Stale Workflow',
          weight: 0.3,
          description: `No executions in ${Math.round(daysSinceExecution)} days`,
        });
      }
    }

    return factors;
  }

  /**
   * Calculate failure probability
   */
  private calculateFailureProbability(
    factors: Array<{ name: string; weight: number; description: string }>,
  ): number {
    if (factors.length === 0) return 5; // 5% baseline

    // Combine factors (not simple addition, use probabilistic model)
    let combinedProbability = 0;

    for (const factor of factors) {
      combinedProbability = combinedProbability + factor.weight * (1 - combinedProbability);
    }

    return Math.min(Math.max(combinedProbability * 100, 0), 100);
  }

  /**
   * Predict timeframe for potential failure
   */
  private predictTimeframe(
    workflow: WorkflowDefinition,
    historicalData: HistoricalExecution[],
    probability: number,
  ): PredictionResult['timeframe'] {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Higher probability = sooner timeframe
    let daysToFailure = 30;

    if (probability > 80) {
      daysToFailure = 1;
    } else if (probability > 60) {
      daysToFailure = 3;
    } else if (probability > 40) {
      daysToFailure = 7;
    } else if (probability > 20) {
      daysToFailure = 14;
    }

    return {
      start: now,
      end: now + daysToFailure * dayMs,
      mostLikely: now + Math.floor(daysToFailure / 2) * dayMs,
    };
  }

  /**
   * Determine prediction type
   */
  private determinePredictionType(
    factors: Array<{ name: string; weight: number; description: string }>,
  ): PredictionResult['type'] {
    const hasPerformanceFactor = factors.some(
      (f) => f.name === 'Performance Degradation' || f.name === 'Workflow Complexity',
    );
    const hasRecentDegradation = factors.some((f) => f.name === 'Recent Degradation');
    const hasExternalDeps = factors.some((f) => f.name === 'External Dependencies');

    if (hasPerformanceFactor && hasRecentDegradation) {
      return 'degradation';
    } else if (hasExternalDeps && factors.find((f) => f.name === 'External Dependencies')!.weight > 0.4) {
      return 'overload';
    } else {
      return 'failure';
    }
  }

  /**
   * Calculate confidence in prediction
   */
  private calculateConfidence(
    dataPoints: number,
    factors: Array<{ name: string; weight: number; description: string }>,
  ): number {
    let confidence = 50; // Base confidence

    // More data = higher confidence
    if (dataPoints > 100) {
      confidence += 30;
    } else if (dataPoints > 50) {
      confidence += 20;
    } else if (dataPoints > 10) {
      confidence += 10;
    }

    // More factors = higher confidence
    confidence += Math.min(factors.length * 5, 20);

    return Math.min(Math.max(confidence, 0), 100);
  }

  /**
   * Generate mitigation strategies
   */
  private generateMitigation(
    factors: Array<{ name: string; weight: number; description: string }>,
    type: PredictionResult['type'],
  ): string[] {
    const mitigation: string[] = [];

    for (const factor of factors) {
      switch (factor.name) {
        case 'Historical Failure Rate':
          mitigation.push('Review and fix recurring error patterns');
          break;
        case 'Workflow Complexity':
          mitigation.push('Consider breaking workflow into smaller sub-workflows');
          break;
        case 'No Error Handling':
          mitigation.push('Add error handling nodes and configure error workflow');
          break;
        case 'External Dependencies':
          mitigation.push('Implement retry logic and circuit breaker patterns');
          mitigation.push('Add health checks for external services');
          break;
        case 'Recent Degradation':
          mitigation.push('Investigate recent changes and roll back if necessary');
          mitigation.push('Monitor execution logs for error patterns');
          break;
        case 'Performance Degradation':
          mitigation.push('Optimize slow nodes and add caching');
          mitigation.push('Review and optimize data transformations');
          break;
        case 'Stale Workflow':
          mitigation.push('Test workflow thoroughly before next execution');
          mitigation.push('Update dependencies and node versions');
          break;
      }
    }

    // Type-specific mitigation
    if (type === 'overload') {
      mitigation.push('Implement rate limiting and queuing');
      mitigation.push('Scale horizontally if possible');
    } else if (type === 'degradation') {
      mitigation.push('Perform performance profiling');
      mitigation.push('Optimize database queries and API calls');
    }

    return [...new Set(mitigation)]; // Remove duplicates
  }

  /**
   * Calculate historical accuracy of predictions
   */
  private calculateHistoricalAccuracy(workflowId: string): number {
    const accuracy = this.predictionAccuracy.get(workflowId);

    if (!accuracy || accuracy.length === 0) {
      return 50; // No history, assume 50%
    }

    const correctPredictions = accuracy.reduce((sum, a) => sum + a, 0);
    return (correctPredictions / accuracy.length) * 100;
  }

  /**
   * Find similar cases in history
   */
  private findSimilarCases(prediction: PredictionResult): number {
    let similarCount = 0;

    for (const [, executions] of this.history) {
      const failures = executions.filter((e) => !e.success);
      if (failures.length > 0) {
        similarCount++;
      }
    }

    return similarCount;
  }
}
