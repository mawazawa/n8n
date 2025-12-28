import type { Anomaly, RootCause, HealingActionType } from './types.js';
import { RootCauseSchema, HealingActionType as ActionType } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import type { ErrorContext } from '../recovery/types.js';

/**
 * Diagnostic Engine for Root Cause Analysis
 *
 * Analyzes anomalies to identify root causes, trace error propagation,
 * and suggest appropriate healing actions.
 */
export class DiagnosticEngine {
  private readonly errorPropagationGraph: Map<string, Set<string>> = new Map();
  private readonly componentDependencies: Map<string, string[]> = new Map();

  /**
   * Diagnose an anomaly and determine root cause
   */
  async diagnose(anomaly: Anomaly, context?: ErrorContext): Promise<RootCause> {
    const probableCauses = await this.identifyProbableCauses(anomaly, context);
    const affectedComponents = this.identifyAffectedComponents(anomaly);
    const errorPath = this.traceErrorPropagation(anomaly, context);

    const rootCause: RootCause = {
      anomalyId: anomaly.id || uuidv4(),
      probableCauses,
      affectedComponents,
      errorPropagationPath: errorPath,
      timestamp: Date.now(),
    };

    return RootCauseSchema.parse(rootCause);
  }

  /**
   * Identify probable causes for an anomaly
   */
  private async identifyProbableCauses(
    anomaly: Anomaly,
    context?: ErrorContext
  ): Promise<
    Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }>
  > {
    const causes: Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }> = [];

    switch (anomaly.type) {
      case 'LATENCY':
        causes.push(...this.diagnoseLatencyIssues(anomaly, context));
        break;
      case 'ERROR_RATE':
        causes.push(...this.diagnoseErrorRateIssues(anomaly, context));
        break;
      case 'MEMORY':
        causes.push(...this.diagnoseMemoryIssues(anomaly, context));
        break;
      case 'TIMEOUT':
        causes.push(...this.diagnoseTimeoutIssues(anomaly, context));
        break;
      case 'RESOURCE_EXHAUSTION':
        causes.push(...this.diagnoseResourceExhaustionIssues(anomaly, context));
        break;
      case 'CIRCUIT_OPEN':
        causes.push(...this.diagnoseCircuitBreakerIssues(anomaly, context));
        break;
      case 'DEGRADED_PERFORMANCE':
        causes.push(...this.diagnoseDegradedPerformance(anomaly, context));
        break;
    }

    // Sort by confidence (highest first)
    return causes.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Diagnose latency issues
   */
  private diagnoseLatencyIssues(
    anomaly: Anomaly,
    context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    const causes: Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }> = [];

    // High latency could be due to network issues
    if (anomaly.value > 10000) {
      causes.push({
        description: 'Network congestion or slow external API response',
        confidence: 0.85,
        evidence: [
          `Latency ${anomaly.value}ms exceeds normal range`,
          `Baseline latency was ${anomaly.baseline}ms`,
        ],
        suggestedActions: [ActionType.RETRY, ActionType.FALLBACK, ActionType.THROTTLE],
      });
    }

    // Database query slowness
    if (context?.nodeType?.includes('database') || context?.nodeType?.includes('sql')) {
      causes.push({
        description: 'Slow database query execution',
        confidence: 0.9,
        evidence: [
          'Node type indicates database operation',
          `Query took ${anomaly.value}ms`,
        ],
        suggestedActions: [ActionType.RETRY, ActionType.SCALE],
      });
    }

    // Resource contention
    if (anomaly.severity > 0.8) {
      causes.push({
        description: 'Resource contention or system overload',
        confidence: 0.75,
        evidence: [`High severity score: ${anomaly.severity}`, 'Possible CPU/memory pressure'],
        suggestedActions: [ActionType.SCALE, ActionType.THROTTLE],
      });
    }

    return causes;
  }

  /**
   * Diagnose error rate issues
   */
  private diagnoseErrorRateIssues(
    anomaly: Anomaly,
    context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    const causes: Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }> = [];

    // External service failure
    if (context?.errorMessage?.includes('ECONNREFUSED') || context?.errorMessage?.includes('503')) {
      causes.push({
        description: 'External service unavailable or refusing connections',
        confidence: 0.95,
        evidence: [
          context.errorMessage,
          'Connection refused or service unavailable error',
        ],
        suggestedActions: [
          ActionType.RETRY,
          ActionType.CIRCUIT_BREAK,
          ActionType.FALLBACK,
        ],
      });
    }

    // Authentication failures
    if (context?.errorMessage?.includes('401') || context?.errorMessage?.includes('unauthorized')) {
      causes.push({
        description: 'Authentication credentials expired or invalid',
        confidence: 0.9,
        evidence: [
          context.errorMessage,
          'Unauthorized access error',
        ],
        suggestedActions: [ActionType.RETRY, ActionType.SKIP],
      });
    }

    // Rate limiting
    if (context?.errorMessage?.includes('429') || context?.errorMessage?.includes('rate limit')) {
      causes.push({
        description: 'API rate limit exceeded',
        confidence: 0.95,
        evidence: [
          context.errorMessage,
          'Rate limit error detected',
        ],
        suggestedActions: [ActionType.THROTTLE, ActionType.RETRY],
      });
    }

    // General high error rate
    causes.push({
      description: 'Systematic failure in workflow execution',
      confidence: 0.7,
      evidence: [`Error rate: ${(anomaly.value * 100).toFixed(1)}%`],
      suggestedActions: [ActionType.ROLLBACK, ActionType.CIRCUIT_BREAK],
    });

    return causes;
  }

  /**
   * Diagnose memory issues
   */
  private diagnoseMemoryIssues(
    anomaly: Anomaly,
    _context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    const causes: Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }> = [];

    // Memory leak
    if (anomaly.deviation > 0.3) {
      causes.push({
        description: 'Memory leak or inefficient memory usage',
        confidence: 0.85,
        evidence: [
          `Memory usage: ${(anomaly.value * 100).toFixed(1)}%`,
          `Deviation from baseline: ${(anomaly.deviation * 100).toFixed(1)}%`,
        ],
        suggestedActions: [ActionType.RESTART, ActionType.SCALE],
      });
    }

    // Large data processing
    causes.push({
      description: 'Processing large dataset exceeding memory limits',
      confidence: 0.75,
      evidence: [`Memory usage at ${(anomaly.value * 100).toFixed(1)}%`],
      suggestedActions: [ActionType.SCALE, ActionType.SKIP],
    });

    return causes;
  }

  /**
   * Diagnose timeout issues
   */
  private diagnoseTimeoutIssues(
    anomaly: Anomaly,
    context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    const causes: Array<{
      description: string;
      confidence: number;
      evidence: string[];
      suggestedActions: HealingActionType[];
    }> = [];

    // External service timeout
    causes.push({
      description: 'External service not responding within timeout period',
      confidence: 0.9,
      evidence: [
        `Operation took ${anomaly.value}ms`,
        `Timeout threshold: ${anomaly.baseline}ms`,
      ],
      suggestedActions: [
        ActionType.RETRY,
        ActionType.FALLBACK,
        ActionType.CIRCUIT_BREAK,
      ],
    });

    // Long-running operation
    if (context?.nodeType?.includes('loop') || context?.nodeType?.includes('batch')) {
      causes.push({
        description: 'Long-running batch or loop operation',
        confidence: 0.8,
        evidence: ['Node type indicates iterative processing'],
        suggestedActions: [ActionType.SKIP, ActionType.SCALE],
      });
    }

    return causes;
  }

  /**
   * Diagnose resource exhaustion issues
   */
  private diagnoseResourceExhaustionIssues(
    anomaly: Anomaly,
    _context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    return [
      {
        description: 'System resources (CPU/Memory/Connections) exhausted',
        confidence: 0.9,
        evidence: [
          `Resource usage at critical level: ${(anomaly.value * 100).toFixed(1)}%`,
        ],
        suggestedActions: [ActionType.SCALE, ActionType.RESTART, ActionType.THROTTLE],
      },
    ];
  }

  /**
   * Diagnose circuit breaker issues
   */
  private diagnoseCircuitBreakerIssues(
    anomaly: Anomaly,
    _context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    return [
      {
        description: 'Circuit breaker opened due to repeated failures',
        confidence: 0.95,
        evidence: ['Circuit breaker in OPEN state', 'Preventing cascading failures'],
        suggestedActions: [ActionType.FALLBACK, ActionType.SKIP, ActionType.ROLLBACK],
      },
    ];
  }

  /**
   * Diagnose degraded performance
   */
  private diagnoseDegradedPerformance(
    anomaly: Anomaly,
    _context?: ErrorContext
  ): Array<{
    description: string;
    confidence: number;
    evidence: string[];
    suggestedActions: HealingActionType[];
  }> {
    return [
      {
        description: 'Overall system performance degradation',
        confidence: 0.8,
        evidence: [
          `Performance degraded by ${(anomaly.deviation * 100).toFixed(1)}%`,
        ],
        suggestedActions: [ActionType.SCALE, ActionType.THROTTLE, ActionType.RESTART],
      },
    ];
  }

  /**
   * Identify affected components
   */
  private identifyAffectedComponents(anomaly: Anomaly): string[] {
    const components: Set<string> = new Set();

    // Add the directly affected node/workflow
    if (anomaly.nodeId) {
      components.add(anomaly.nodeId);
    }
    components.add(anomaly.workflowId);

    // Add dependent components
    const nodeKey = `${anomaly.workflowId}:${anomaly.nodeId || 'workflow'}`;
    const dependencies = this.componentDependencies.get(nodeKey) || [];
    dependencies.forEach((dep) => components.add(dep));

    return Array.from(components);
  }

  /**
   * Trace error propagation path
   */
  private traceErrorPropagation(anomaly: Anomaly, context?: ErrorContext): string[] {
    const path: string[] = [];

    if (!anomaly.nodeId) {
      return [anomaly.workflowId];
    }

    // Start with the affected node
    path.push(anomaly.nodeId);

    // Check for error propagation graph
    const nodeKey = anomaly.nodeId;
    const visited = new Set<string>();

    this.traverseErrorGraph(nodeKey, path, visited);

    // Add execution context if available
    if (context?.previousErrors) {
      context.previousErrors.forEach((prevError) => {
        if (!path.includes(prevError.nodeName)) {
          path.push(prevError.nodeName);
        }
      });
    }

    return path;
  }

  /**
   * Traverse error propagation graph
   */
  private traverseErrorGraph(nodeId: string, path: string[], visited: Set<string>): void {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    const connectedNodes = this.errorPropagationGraph.get(nodeId);

    if (connectedNodes) {
      connectedNodes.forEach((connectedNode) => {
        if (!path.includes(connectedNode)) {
          path.push(connectedNode);
        }
        this.traverseErrorGraph(connectedNode, path, visited);
      });
    }
  }

  /**
   * Register component dependency
   */
  registerDependency(component: string, dependencies: string[]): void {
    this.componentDependencies.set(component, dependencies);
  }

  /**
   * Register error propagation connection
   */
  registerErrorPropagation(fromNode: string, toNode: string): void {
    if (!this.errorPropagationGraph.has(fromNode)) {
      this.errorPropagationGraph.set(fromNode, new Set());
    }
    this.errorPropagationGraph.get(fromNode)!.add(toNode);
  }

  /**
   * Clear diagnostic data
   */
  clear(): void {
    this.errorPropagationGraph.clear();
    this.componentDependencies.clear();
  }
}
