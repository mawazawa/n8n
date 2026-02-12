/**
 * AI-Powered Execution Suggestions
 * Generates actionable improvement suggestions based on execution analysis
 */

import type { ExecutionResult, ExecutionNode } from './types.js';
import { ExecutionAnalyzer, type BottleneckNode } from './analyzer.js';

export type SuggestionCategory = 'performance' | 'reliability' | 'cost' | 'security';
export type SuggestionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ExecutionSuggestion {
  id: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  message: string;
  action: string;
  node?: string;
  impact?: string;
  estimatedTimeSavings?: number;
  references?: string[];
}

export class SuggestionGenerator {
  private analyzer: ExecutionAnalyzer;

  constructor() {
    this.analyzer = new ExecutionAnalyzer();
  }

  /**
   * Generate suggestions for a single execution
   */
  generateSuggestions(result: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];

    // Performance suggestions
    suggestions.push(...this.generatePerformanceSuggestions(result));

    // Reliability suggestions
    suggestions.push(...this.generateReliabilitySuggestions(result));

    // Cost suggestions
    suggestions.push(...this.generateCostSuggestions(result));

    // Security suggestions
    suggestions.push(...this.generateSecuritySuggestions(result));

    return suggestions.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate performance-related suggestions
   */
  private generatePerformanceSuggestions(result: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];

    // Detect bottlenecks
    const bottlenecks = this.analyzer.detectBottlenecks(result);
    for (const bottleneck of bottlenecks) {
      const severity: SuggestionSeverity = bottleneck.duration > 30000 ? 'critical' : bottleneck.duration > 10000 ? 'high' : 'medium';

      suggestions.push({
        id: this.generateId(),
        category: 'performance',
        severity,
        message: `Node "${bottleneck.nodeName}" is a performance bottleneck`,
        action: this.getBottleneckAction(bottleneck),
        node: bottleneck.nodeName,
        impact: `This node accounts for ${bottleneck.percentageOfTotal.toFixed(1)}% of total execution time`,
        estimatedTimeSavings: Math.floor(bottleneck.duration * 0.5), // Assume 50% improvement is possible
        references: [
          'https://docs.n8n.io/hosting/scaling/execution-mode/',
          'https://docs.n8n.io/workflows/performance/',
        ],
      });
    }

    // Check for sequential HTTP requests that could be parallelized
    const httpNodes = result.nodes.filter(n => n.nodeType.toLowerCase().includes('http') || n.nodeType.toLowerCase().includes('request'));
    if (httpNodes.length > 1) {
      const sequentialRequests = this.detectSequentialHttpRequests(result, httpNodes);
      if (sequentialRequests) {
        suggestions.push({
          id: this.generateId(),
          category: 'performance',
          severity: 'medium',
          message: 'Multiple HTTP requests executed sequentially',
          action: 'Use the Split in Batches node with Execute Once mode to parallelize independent HTTP requests',
          impact: 'Could reduce execution time by running requests concurrently',
          estimatedTimeSavings: Math.floor(httpNodes.reduce((sum, n) => sum + ((n.endTime || 0) - n.startTime), 0) * 0.6),
          references: [
            'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/',
          ],
        });
      }
    }

    // Check for large data processing
    const highVolumeNodes = result.nodes.filter(n => n.outputItems > 1000);
    for (const node of highVolumeNodes) {
      suggestions.push({
        id: this.generateId(),
        category: 'performance',
        severity: 'medium',
        message: `Node "${node.nodeName}" processes large data volumes (${node.outputItems} items)`,
        action: 'Implement pagination or use Split in Batches to process data in smaller chunks',
        node: node.nodeName,
        impact: 'Reduces memory usage and prevents timeouts for large datasets',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/',
        ],
      });
    }

    // Check for loops that could be optimized
    const loopNodes = result.nodes.filter(n => n.nodeType.toLowerCase().includes('loop'));
    if (loopNodes.length > 0 && result.duration && result.duration > 30000) {
      suggestions.push({
        id: this.generateId(),
        category: 'performance',
        severity: 'medium',
        message: 'Workflow uses loops which may impact performance',
        action: 'Consider using built-in batch operations or vectorized operations instead of loops when possible',
        impact: 'Batch operations are generally faster than iterating with loops',
        references: [
          'https://docs.n8n.io/workflows/performance/',
        ],
      });
    }

    return suggestions;
  }

  /**
   * Generate reliability-related suggestions
   */
  private generateReliabilitySuggestions(result: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];

    // Check for errors
    if (result.status === 'error' && result.error) {
      const severity: SuggestionSeverity = 'critical';

      suggestions.push({
        id: this.generateId(),
        category: 'reliability',
        severity,
        message: 'Execution failed without proper error handling',
        action: 'Add an Error Trigger workflow to handle failures gracefully and implement retry logic',
        node: result.error.node,
        impact: 'Prevents data loss and allows automated recovery from failures',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/',
          'https://docs.n8n.io/workflows/error-handling/',
        ],
      });

      // Specific error pattern suggestions
      if (result.error.message.toLowerCase().includes('timeout')) {
        suggestions.push({
          id: this.generateId(),
          category: 'reliability',
          severity: 'high',
          message: 'Execution failed due to timeout',
          action: 'Increase timeout settings in HTTP Request nodes or workflow settings, or optimize long-running operations',
          node: result.error.node,
          impact: 'Prevents timeout failures for legitimate long-running operations',
          references: [
            'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/',
          ],
        });
      } else if (result.error.message.toLowerCase().includes('rate limit')) {
        suggestions.push({
          id: this.generateId(),
          category: 'reliability',
          severity: 'high',
          message: 'Execution failed due to rate limiting',
          action: 'Implement rate limiting with Wait node or use queue-based execution',
          node: result.error.node,
          impact: 'Prevents API rate limit errors and ensures reliable execution',
          references: [
            'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/',
          ],
        });
      } else if (result.error.message.toLowerCase().includes('authentication') || result.error.message.toLowerCase().includes('unauthorized')) {
        suggestions.push({
          id: this.generateId(),
          category: 'security',
          severity: 'critical',
          message: 'Authentication failure detected',
          action: 'Verify credentials are valid and have not expired, implement credential refresh logic',
          node: result.error.node,
          impact: 'Ensures workflow can authenticate successfully with external services',
          references: [
            'https://docs.n8n.io/credentials/',
          ],
        });
      }
    }

    // Check for nodes with no output
    const emptyOutputNodes = result.nodes.filter(n => n.status === 'success' && n.outputItems === 0 && n.inputItems > 0);
    for (const node of emptyOutputNodes) {
      suggestions.push({
        id: this.generateId(),
        category: 'reliability',
        severity: 'medium',
        message: `Node "${node.nodeName}" filtered out all data`,
        action: 'Review filter conditions or add an IF node to handle empty results gracefully',
        node: node.nodeName,
        impact: 'Prevents silent data loss and makes workflow behavior more predictable',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/',
        ],
      });
    }

    // Check for missing error handling
    const hasErrorTrigger = result.nodes.some(n => n.nodeType === 'n8n-nodes-base.errorTrigger');
    if (!hasErrorTrigger && result.nodes.length > 3) {
      suggestions.push({
        id: this.generateId(),
        category: 'reliability',
        severity: 'medium',
        message: 'Workflow lacks error handling',
        action: 'Create an Error Trigger workflow to handle failures and send notifications',
        impact: 'Improves workflow reliability and enables proactive error monitoring',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/',
        ],
      });
    }

    return suggestions;
  }

  /**
   * Generate cost-related suggestions
   */
  private generateCostSuggestions(result: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];

    // Check for expensive API calls
    const apiNodes = result.nodes.filter(n =>
      n.nodeType.toLowerCase().includes('openai') ||
      n.nodeType.toLowerCase().includes('anthropic') ||
      n.nodeType.toLowerCase().includes('gpt')
    );

    for (const node of apiNodes) {
      if (node.outputItems > 100) {
        suggestions.push({
          id: this.generateId(),
          category: 'cost',
          severity: 'high',
          message: `Node "${node.nodeName}" made ${node.outputItems} AI API calls`,
          action: 'Implement caching for repeated queries or batch similar requests together',
          node: node.nodeName,
          impact: 'Reduces API costs by avoiding redundant calls',
          references: [
            'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybuffermemory/',
          ],
        });
      }
    }

    // Check for polling triggers
    const pollingTriggers = result.nodes.filter(n =>
      n.nodeType.toLowerCase().includes('trigger') &&
      !n.nodeType.toLowerCase().includes('webhook')
    );

    if (pollingTriggers.length > 0) {
      suggestions.push({
        id: this.generateId(),
        category: 'cost',
        severity: 'low',
        message: 'Workflow uses polling triggers',
        action: 'Consider switching to webhook-based triggers where available to reduce execution count',
        impact: 'Reduces execution count and associated costs',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
        ],
      });
    }

    // Check for frequent manual executions
    if (result.mode === 'manual' && result.duration && result.duration < 5000) {
      suggestions.push({
        id: this.generateId(),
        category: 'cost',
        severity: 'low',
        message: 'Fast manual execution could be automated',
        action: 'Add a trigger to automate this workflow and reduce manual intervention',
        impact: 'Saves time and reduces the need for manual execution',
        references: [
          'https://docs.n8n.io/workflows/triggers/',
        ],
      });
    }

    return suggestions;
  }

  /**
   * Generate security-related suggestions
   */
  private generateSecuritySuggestions(result: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];

    // Check for HTTP nodes without authentication
    const httpNodes = result.nodes.filter(n => n.nodeType.toLowerCase().includes('http'));
    if (httpNodes.length > 0) {
      suggestions.push({
        id: this.generateId(),
        category: 'security',
        severity: 'medium',
        message: 'Workflow contains HTTP requests',
        action: 'Ensure all HTTP requests use HTTPS and proper authentication',
        impact: 'Prevents data interception and unauthorized access',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/',
        ],
      });
    }

    // Check for code nodes (potential security risk)
    const codeNodes = result.nodes.filter(n => n.nodeType.toLowerCase().includes('code') || n.nodeType.toLowerCase().includes('function'));
    if (codeNodes.length > 0) {
      suggestions.push({
        id: this.generateId(),
        category: 'security',
        severity: 'medium',
        message: 'Workflow uses Code nodes',
        action: 'Review code for security vulnerabilities, avoid processing untrusted input directly, and use task runners in production',
        impact: 'Prevents code injection and ensures secure code execution',
        references: [
          'https://docs.n8n.io/code-examples/expressions/code-node/',
          'https://docs.n8n.io/hosting/configuration/task-runners/',
        ],
      });
    }

    // Check for credential usage
    const nodesWithCredentials = result.nodes.filter(n => n.nodeType !== 'n8n-nodes-base.start');
    if (nodesWithCredentials.length > 0) {
      suggestions.push({
        id: this.generateId(),
        category: 'security',
        severity: 'low',
        message: 'Workflow uses credentials',
        action: 'Regularly rotate credentials and use least-privilege access principles',
        impact: 'Reduces risk of credential compromise',
        references: [
          'https://docs.n8n.io/credentials/',
        ],
      });
    }

    // Check for webhook nodes
    const webhookNodes = result.nodes.filter(n => n.nodeType.toLowerCase().includes('webhook'));
    if (webhookNodes.length > 0) {
      suggestions.push({
        id: this.generateId(),
        category: 'security',
        severity: 'medium',
        message: 'Workflow exposes webhook endpoints',
        action: 'Implement webhook authentication and validate all incoming data',
        impact: 'Prevents unauthorized access and malicious payloads',
        references: [
          'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
        ],
      });
    }

    return suggestions;
  }

  /**
   * Get specific action for a bottleneck node
   */
  private getBottleneckAction(bottleneck: BottleneckNode): string {
    const nodeType = bottleneck.nodeType.toLowerCase();

    if (nodeType.includes('http') || nodeType.includes('request')) {
      return 'Optimize API request parameters, implement caching, or check external service performance';
    } else if (nodeType.includes('database') || nodeType.includes('mysql') || nodeType.includes('postgres')) {
      return 'Add database indexes, optimize query, or limit result set size';
    } else if (nodeType.includes('code') || nodeType.includes('function')) {
      return 'Optimize code logic, reduce iterations, or move heavy processing to external service';
    } else if (nodeType.includes('spreadsheet') || nodeType.includes('excel') || nodeType.includes('google sheets')) {
      return 'Reduce data range, use filters on API side, or implement pagination';
    } else if (nodeType.includes('ai') || nodeType.includes('openai') || nodeType.includes('gpt')) {
      return 'Reduce prompt length, use streaming, or implement result caching';
    } else if (nodeType.includes('wait')) {
      return 'Reduce wait time if possible or consider using webhook for async operations';
    } else {
      return 'Review node configuration and check external service performance';
    }
  }

  /**
   * Detect sequential HTTP requests
   */
  private detectSequentialHttpRequests(result: ExecutionResult, httpNodes: ExecutionNode[]): boolean {
    if (httpNodes.length < 2) return false;

    // Check if HTTP nodes are executed sequentially (end time of one before start of next)
    const sortedNodes = [...httpNodes].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sortedNodes.length - 1; i++) {
      const current = sortedNodes[i];
      const next = sortedNodes[i + 1];

      if (!current.endTime || !next.startTime) continue;

      // If next node starts after current ends, they're sequential
      if (next.startTime >= current.endTime) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate unique suggestion ID
   */
  private generateId(): string {
    return `sugg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate comparative suggestions by comparing two executions
   */
  generateComparativeSuggestions(current: ExecutionResult, previous: ExecutionResult): ExecutionSuggestion[] {
    const suggestions: ExecutionSuggestion[] = [];
    const comparison = this.analyzer.compareExecutions(previous, current);

    // Duration regression
    if (comparison.durationDelta > 5000 && comparison.durationDeltaPercent > 20) {
      suggestions.push({
        id: this.generateId(),
        category: 'performance',
        severity: 'high',
        message: `Execution time increased by ${(comparison.durationDelta / 1000).toFixed(2)}s (${comparison.durationDeltaPercent.toFixed(1)}%)`,
        action: 'Investigate recent workflow changes and performance degradation',
        impact: 'Performance regression detected compared to previous execution',
      });
    }

    // Status change
    if (comparison.statusChanged && current.status === 'error' && previous.status === 'success') {
      suggestions.push({
        id: this.generateId(),
        category: 'reliability',
        severity: 'critical',
        message: 'Workflow started failing after previously succeeding',
        action: 'Review recent changes and check for external service issues',
        impact: 'Regression in workflow reliability detected',
      });
    }

    // Slower nodes
    for (const node of comparison.performanceChanges.slower.slice(0, 3)) {
      suggestions.push({
        id: this.generateId(),
        category: 'performance',
        severity: 'medium',
        message: `Node "${node.nodeName}" is ${node.degradation.toFixed(1)}% slower than previous execution`,
        action: 'Investigate node configuration changes or external service degradation',
        node: node.nodeName,
        impact: 'Performance degradation detected for this node',
      });
    }

    return suggestions;
  }
}

/**
 * Convenience function to generate suggestions for an execution
 */
export function generateSuggestions(result: ExecutionResult): ExecutionSuggestion[] {
  const generator = new SuggestionGenerator();
  return generator.generateSuggestions(result);
}

/**
 * Generate comparative suggestions
 */
export function generateComparativeSuggestions(current: ExecutionResult, previous: ExecutionResult): ExecutionSuggestion[] {
  const generator = new SuggestionGenerator();
  return generator.generateComparativeSuggestions(current, previous);
}
