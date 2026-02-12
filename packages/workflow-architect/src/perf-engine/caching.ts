/**
 * Smart Caching Advisor
 * Analyzes workflows and recommends caching strategies
 */

import { ProfileResult, NodeMetrics, CacheRecommendation } from './types';

interface WorkflowDefinition {
  id: string;
  nodes: Array<{
    id: string;
    type: string;
    parameters: Record<string, unknown>;
  }>;
}

export class CacheAdvisor {
  /**
   * Analyze workflow and generate cache recommendations
   */
  async analyze(
    workflow: WorkflowDefinition,
    profile?: ProfileResult,
  ): Promise<CacheRecommendation[]> {
    const recommendations: CacheRecommendation[] = [];

    for (const node of workflow.nodes) {
      const nodeMetric = profile?.nodeMetrics.find((m) => m.nodeId === node.id);
      const recommendation = await this.analyzeNode(node, nodeMetric);

      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // Sort by estimated savings
    recommendations.sort((a, b) => {
      const aSavings = a.estimatedSavings.executionTime;
      const bSavings = b.estimatedSavings.executionTime;
      return bSavings - aSavings;
    });

    return recommendations;
  }

  /**
   * Analyze a single node for caching potential
   */
  private async analyzeNode(
    node: WorkflowDefinition['nodes'][0],
    metric?: NodeMetrics,
  ): Promise<CacheRecommendation | null> {
    // Check if node is cacheable
    const cacheability = this.calculateCacheability(node, metric);

    if (cacheability < 0.3) {
      return null; // Not worth caching
    }

    // Estimate hit rate based on node type and historical data
    const estimatedHitRate = this.estimateHitRate(node, metric);

    // Recommend TTL based on node type
    const ttlRecommendation = this.recommendTtl(node);

    // Determine invalidation strategy
    const invalidationStrategy = this.determineInvalidationStrategy(node);

    // Generate cache key strategy
    const keyStrategy = this.generateKeyStrategy(node);

    // Calculate estimated savings
    const estimatedSavings = this.calculateSavings(node, metric, estimatedHitRate);

    return {
      nodeId: node.id,
      nodeName: node.parameters.name as string || node.id,
      cacheability,
      estimatedHitRate,
      ttlRecommendation,
      invalidationStrategy,
      keyStrategy,
      estimatedSavings,
      metadata: {
        nodeType: node.type,
        reasoning: this.explainCacheability(node, cacheability),
      },
    };
  }

  /**
   * Calculate cacheability score (0-1)
   */
  private calculateCacheability(
    node: WorkflowDefinition['nodes'][0],
    metric?: NodeMetrics,
  ): number {
    let score = 0;

    // Check if node type is cacheable
    const cacheableTypes = [
      'http',
      'webhook',
      'api',
      'database',
      'function',
      'code',
      'spreadsheet',
    ];
    const isCacheableType = cacheableTypes.some((type) =>
      node.type.toLowerCase().includes(type),
    );

    if (!isCacheableType) {
      return 0;
    }

    score += 0.3; // Base score for cacheable type

    // Higher score for read operations
    if (this.isReadOperation(node)) {
      score += 0.3;
    }

    // Higher score for slow operations
    if (metric && metric.executionTime > 1000) {
      score += 0.2;
    }

    // Higher score for external calls
    if (this.isExternalCall(node)) {
      score += 0.2;
    }

    // Lower score if operation has side effects
    if (this.hasSideEffects(node)) {
      score -= 0.4;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Estimate cache hit rate
   */
  private estimateHitRate(
    node: WorkflowDefinition['nodes'][0],
    metric?: NodeMetrics,
  ): number {
    // Default to 50% hit rate
    let hitRate = 0.5;

    // Higher hit rate for read-only operations
    if (this.isReadOperation(node)) {
      hitRate = 0.7;
    }

    // Lower hit rate for dynamic operations
    if (this.isDynamicOperation(node)) {
      hitRate = 0.3;
    }

    // Adjust based on execution frequency
    // (Would need historical data for accurate estimate)

    return hitRate;
  }

  /**
   * Recommend TTL in seconds
   */
  private recommendTtl(node: WorkflowDefinition['nodes'][0]): number {
    const nodeType = node.type.toLowerCase();

    // Static data - long TTL
    if (nodeType.includes('spreadsheet') || nodeType.includes('file')) {
      return 86400; // 24 hours
    }

    // API data - medium TTL
    if (nodeType.includes('http') || nodeType.includes('api')) {
      return 3600; // 1 hour
    }

    // Database queries - short TTL
    if (nodeType.includes('database') || nodeType.includes('sql')) {
      return 300; // 5 minutes
    }

    // Default
    return 1800; // 30 minutes
  }

  /**
   * Determine cache invalidation strategy
   */
  private determineInvalidationStrategy(
    node: WorkflowDefinition['nodes'][0],
  ): CacheRecommendation['invalidationStrategy'] {
    // Event-based for webhooks
    if (node.type.toLowerCase().includes('webhook')) {
      return 'event_based';
    }

    // Hybrid for APIs
    if (node.type.toLowerCase().includes('http') || node.type.toLowerCase().includes('api')) {
      return 'hybrid';
    }

    // Time-based for others
    return 'time_based';
  }

  /**
   * Generate cache key strategy
   */
  private generateKeyStrategy(node: WorkflowDefinition['nodes'][0]): string {
    const parts: string[] = ['nodeId'];

    // Include relevant parameters in cache key
    const params = node.parameters;

    if (params.url) parts.push('url');
    if (params.query) parts.push('query');
    if (params.operation) parts.push('operation');
    if (params.resource) parts.push('resource');

    return parts.join(':');
  }

  /**
   * Calculate estimated savings
   */
  private calculateSavings(
    node: WorkflowDefinition['nodes'][0],
    metric?: NodeMetrics,
    hitRate = 0.5,
  ): CacheRecommendation['estimatedSavings'] {
    const executionTime = metric?.executionTime || 1000;
    const networkRequests = metric?.resourceUsage.network.requests || 1;

    return {
      executionTime: executionTime * hitRate,
      apiCalls: networkRequests * hitRate,
      cost: this.estimateCostSavings(node, networkRequests, hitRate),
    };
  }

  /**
   * Estimate cost savings
   */
  private estimateCostSavings(
    node: WorkflowDefinition['nodes'][0],
    requests: number,
    hitRate: number,
  ): number {
    // Rough cost estimates (would need actual pricing data)
    const costPerRequest = 0.001; // $0.001 per request
    return requests * hitRate * costPerRequest;
  }

  /**
   * Check if operation is read-only
   */
  private isReadOperation(node: WorkflowDefinition['nodes'][0]): boolean {
    const operation = (node.parameters.operation as string)?.toLowerCase() || '';
    const method = (node.parameters.method as string)?.toLowerCase() || '';

    return (
      operation.includes('get') ||
      operation.includes('read') ||
      operation.includes('select') ||
      operation.includes('find') ||
      method === 'get'
    );
  }

  /**
   * Check if operation is external call
   */
  private isExternalCall(node: WorkflowDefinition['nodes'][0]): boolean {
    const externalTypes = ['http', 'webhook', 'api', 'rest', 'graphql'];
    return externalTypes.some((type) => node.type.toLowerCase().includes(type));
  }

  /**
   * Check if operation has side effects
   */
  private hasSideEffects(node: WorkflowDefinition['nodes'][0]): boolean {
    const operation = (node.parameters.operation as string)?.toLowerCase() || '';
    const method = (node.parameters.method as string)?.toLowerCase() || '';

    const sideEffectOperations = [
      'create',
      'update',
      'delete',
      'insert',
      'post',
      'put',
      'patch',
    ];

    return (
      sideEffectOperations.some((op) => operation.includes(op)) ||
      ['post', 'put', 'patch', 'delete'].includes(method)
    );
  }

  /**
   * Check if operation is dynamic
   */
  private isDynamicOperation(node: WorkflowDefinition['nodes'][0]): boolean {
    // Operations with variables or expressions are dynamic
    const params = JSON.stringify(node.parameters);
    return params.includes('{{') || params.includes('$json');
  }

  /**
   * Explain cacheability score
   */
  private explainCacheability(
    node: WorkflowDefinition['nodes'][0],
    score: number,
  ): string {
    if (score < 0.3) {
      return 'Low cacheability due to side effects or non-cacheable operation type';
    }
    if (score < 0.6) {
      return 'Moderate cacheability. May benefit from caching with appropriate TTL';
    }
    return 'High cacheability. Strong candidate for caching to improve performance';
  }
}
