/**
 * Load Balancer
 * Dynamically routes requests based on current load and latency metrics
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ModelRouter, type ModelId } from './router.js';
import { getLatencyMonitor, type LatencyMetrics } from './latency-monitor.js';
import type { TaskType } from './task-router.js';

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-loaded' | 'fastest' | 'weighted' | 'adaptive';
  maxLoadPerModel?: number;
  latencyThresholdMs?: number;
  adaptiveWindowMs?: number;
  weights?: Partial<Record<ModelId, number>>;
  enableHealthChecks?: boolean;
  healthCheckIntervalMs?: number;
}

export interface ModelLoad {
  modelId: ModelId;
  currentLoad: number;
  avgLatency: number;
  p95Latency: number;
  healthScore: number;
  isHealthy: boolean;
}

const DEFAULT_CONFIG: LoadBalancerConfig = {
  strategy: 'adaptive',
  maxLoadPerModel: 10,
  latencyThresholdMs: 3000,
  adaptiveWindowMs: 300000, // 5 minutes
  enableHealthChecks: true,
  healthCheckIntervalMs: 60000, // 1 minute
};

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private router: ModelRouter;
  private latencyMonitor: ReturnType<typeof getLatencyMonitor>;
  private roundRobinIndex = 0;
  private modelHealth: Map<ModelId, boolean> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.router = new ModelRouter();
    this.latencyMonitor = getLatencyMonitor();

    // Start health check interval
    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  /**
   * Select the best model based on current load and performance
   */
  selectModel(options: {
    taskType?: TaskType;
    candidateModels?: ModelId[];
    requiresTools?: boolean;
  }): ModelId {
    const candidates = this.getCandidateModels(options);

    if (candidates.length === 0) {
      throw new Error('No available models');
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    switch (this.config.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(candidates);
      case 'least-loaded':
        return this.selectLeastLoaded(candidates);
      case 'fastest':
        return this.selectFastest(candidates);
      case 'weighted':
        return this.selectWeighted(candidates);
      case 'adaptive':
      default:
        return this.selectAdaptive(candidates);
    }
  }

  /**
   * Get model instance with load balancing
   */
  getModel(options: {
    taskType?: TaskType;
    candidateModels?: ModelId[];
    requiresTools?: boolean;
  }): BaseChatModel {
    const modelId = this.selectModel(options);
    return this.router.getModel(modelId);
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(candidates: ModelId[]): ModelId {
    const index = this.roundRobinIndex % candidates.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % candidates.length;
    return candidates[index];
  }

  /**
   * Select model with least current load
   */
  private selectLeastLoaded(candidates: ModelId[]): ModelId {
    const loads = this.getCurrentLoads(candidates);
    return loads.reduce((min, current) =>
      current.currentLoad < min.currentLoad ? current : min
    ).modelId;
  }

  /**
   * Select fastest model based on recent latency
   */
  private selectFastest(candidates: ModelId[]): ModelId {
    const loads = this.getCurrentLoads(candidates);

    // Filter out unhealthy models
    const healthy = loads.filter(l => l.isHealthy);

    if (healthy.length === 0) {
      // Fall back to least loaded if all unhealthy
      return this.selectLeastLoaded(candidates);
    }

    return healthy.reduce((fastest, current) =>
      current.avgLatency < fastest.avgLatency ? current : fastest
    ).modelId;
  }

  /**
   * Weighted selection based on configured weights
   */
  private selectWeighted(candidates: ModelId[]): ModelId {
    const weights = this.config.weights || {};
    const loads = this.getCurrentLoads(candidates);

    // Calculate scores based on weights and health
    const scores = loads.map(load => {
      const weight = weights[load.modelId] || 1;
      const healthFactor = load.isHealthy ? 1 : 0.5;
      const loadFactor = 1 - (load.currentLoad / (this.config.maxLoadPerModel || 10));
      return {
        modelId: load.modelId,
        score: weight * healthFactor * loadFactor,
      };
    });

    // Select model with highest score
    return scores.reduce((max, current) =>
      current.score > max.score ? current : max
    ).modelId;
  }

  /**
   * Adaptive selection based on current performance
   */
  private selectAdaptive(candidates: ModelId[]): ModelId {
    const loads = this.getCurrentLoads(candidates);

    // Calculate composite score for each model
    const scores = loads.map(load => {
      // Health score (0-100)
      const healthScore = load.healthScore;

      // Load score (0-100, higher is better)
      const maxLoad = this.config.maxLoadPerModel || 10;
      const loadScore = Math.max(0, 100 - (load.currentLoad / maxLoad) * 100);

      // Latency score (0-100, lower latency is better)
      const maxLatency = this.config.latencyThresholdMs || 3000;
      const latencyScore = Math.max(0, 100 - (load.p95Latency / maxLatency) * 100);

      // Weighted composite score
      const compositeScore =
        healthScore * 0.4 +
        loadScore * 0.3 +
        latencyScore * 0.3;

      return {
        modelId: load.modelId,
        score: compositeScore,
        breakdown: { healthScore, loadScore, latencyScore },
      };
    });

    // Select model with highest score
    const selected = scores.reduce((max, current) =>
      current.score > max.score ? current : max
    );

    return selected.modelId;
  }

  /**
   * Get candidate models based on requirements
   */
  private getCandidateModels(options: {
    taskType?: TaskType;
    candidateModels?: ModelId[];
    requiresTools?: boolean;
  }): ModelId[] {
    // Start with provided candidates or all available models
    let candidates = options.candidateModels || this.router.getAvailableModels().map(m => m.id);

    // Filter by tool support if required
    if (options.requiresTools) {
      candidates = candidates.filter(modelId => {
        const config = this.router.selectModel([]);
        return config.supportsTools;
      });
    }

    // Filter out unhealthy models (if all are unhealthy, keep them as fallback)
    const healthy = candidates.filter(m => this.modelHealth.get(m) !== false);
    if (healthy.length > 0) {
      candidates = healthy;
    }

    return candidates;
  }

  /**
   * Get current load and metrics for models
   */
  private getCurrentLoads(modelIds: ModelId[]): ModelLoad[] {
    const loadByModel = this.latencyMonitor.getCurrentLoadByModel();
    const windowMs = this.config.adaptiveWindowMs || 300000;

    return modelIds.map(modelId => {
      const metrics = this.latencyMonitor.getModelMetrics(modelId, windowMs);
      const currentLoad = loadByModel[modelId] || 0;

      return {
        modelId,
        currentLoad,
        avgLatency: metrics?.mean || 0,
        p95Latency: metrics?.p95 || 0,
        healthScore: this.calculateHealthScore(modelId, metrics, currentLoad),
        isHealthy: this.modelHealth.get(modelId) !== false,
      };
    });
  }

  /**
   * Calculate health score for a model (0-100)
   */
  private calculateHealthScore(
    modelId: ModelId,
    metrics: LatencyMetrics | null,
    currentLoad: number
  ): number {
    let score = 100;

    // Penalize high load
    const maxLoad = this.config.maxLoadPerModel || 10;
    if (currentLoad >= maxLoad) {
      score -= 50;
    } else if (currentLoad >= maxLoad * 0.8) {
      score -= 25;
    }

    // Penalize high latency
    if (metrics) {
      const threshold = this.config.latencyThresholdMs || 3000;
      if (metrics.p95 >= threshold) {
        score -= 30;
      } else if (metrics.p95 >= threshold * 0.8) {
        score -= 15;
      }
    }

    // Check explicit health status
    if (this.modelHealth.get(modelId) === false) {
      score -= 40;
    }

    return Math.max(0, score);
  }

  /**
   * Start periodic health checks
   * Stores interval reference for proper cleanup
   */
  private startHealthChecks(): void {
    // Clear existing interval if any to prevent duplicates
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const interval = this.config.healthCheckIntervalMs || 60000;

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, interval);
  }

  /**
   * Stop health checks and clean up resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.modelHealth.clear();
  }

  /**
   * Perform health checks on all models
   */
  private performHealthChecks(): void {
    const availableModels = this.router.getAvailableModels();
    const threshold = this.config.latencyThresholdMs || 3000;

    for (const model of availableModels) {
      const isHealthy = this.latencyMonitor.isModelHealthy(model.id, threshold);
      this.modelHealth.set(model.id, isHealthy);
    }
  }

  /**
   * Manually mark a model as healthy/unhealthy
   */
  setModelHealth(modelId: ModelId, isHealthy: boolean): void {
    this.modelHealth.set(modelId, isHealthy);
    console.log(`[LoadBalancer] Model ${modelId} marked as ${isHealthy ? 'healthy' : 'unhealthy'}`);
  }

  /**
   * Get current load statistics
   */
  getLoadStats(): {
    totalLoad: number;
    byModel: Record<string, { load: number; health: string }>;
  } {
    const loadByModel = this.latencyMonitor.getCurrentLoadByModel();
    const totalLoad = Object.values(loadByModel).reduce((sum, load) => sum + load, 0);

    const byModel: Record<string, { load: number; health: string }> = {};

    for (const [modelId, load] of Object.entries(loadByModel)) {
      const isHealthy = this.modelHealth.get(modelId as ModelId);
      byModel[modelId] = {
        load,
        health: isHealthy === undefined ? 'unknown' : isHealthy ? 'healthy' : 'unhealthy',
      };
    }

    return { totalLoad, byModel };
  }

  /**
   * Get recommended model for a task
   */
  getRecommendation(taskType: TaskType): {
    modelId: ModelId;
    reason: string;
    alternatives: ModelId[];
  } {
    const modelId = this.selectModel({ taskType });
    const loads = this.getCurrentLoads(this.router.getAvailableModels().map(m => m.id));

    const selected = loads.find(l => l.modelId === modelId);
    const alternatives = loads
      .filter(l => l.modelId !== modelId && l.isHealthy)
      .sort((a, b) => b.healthScore - a.healthScore)
      .slice(0, 2)
      .map(l => l.modelId);

    let reason = `Selected based on ${this.config.strategy} strategy. `;

    if (selected) {
      reason += `Health: ${selected.healthScore.toFixed(0)}/100, `;
      reason += `Load: ${selected.currentLoad}, `;
      reason += `P95 Latency: ${selected.p95Latency.toFixed(0)}ms`;
    }

    return { modelId, reason, alternatives };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[LoadBalancer] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): LoadBalancerConfig {
    return { ...this.config };
  }
}

// Singleton instance
let balancerInstance: LoadBalancer | null = null;

/**
 * Get or create the load balancer singleton
 * Note: Config is only used when creating the initial instance.
 * To update config on an existing instance, use updateConfig() instead.
 */
export function getLoadBalancer(config?: Partial<LoadBalancerConfig>): LoadBalancer {
  if (!balancerInstance) {
    balancerInstance = new LoadBalancer(config);
  } else if (config) {
    // Update config on existing instance instead of recreating
    balancerInstance.updateConfig(config);
  }
  return balancerInstance;
}

/**
 * Reset the load balancer singleton (for testing purposes)
 */
export function resetLoadBalancer(): void {
  if (balancerInstance) {
    balancerInstance.destroy();
    balancerInstance = null;
  }
}
