import type { HealingAction, HealingResult, FailurePattern } from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Failure Learning System
 *
 * Learns from failures and resolutions to improve healing strategies over time.
 */
export class FailureLearner {
  private readonly patterns: Map<string, FailurePattern> = new Map();
  private readonly failureHistory: Array<FailureRecord> = [];
  private readonly resolutionHistory: Map<string, ResolutionRecord[]> = new Map();

  /**
   * Learn from a failure and its resolution
   */
  async learn(failure: FailureRecord, resolution: HealingResult): Promise<void> {
    // Store failure in history
    this.failureHistory.push(failure);

    // Extract pattern from failure
    const pattern = this.extractPattern(failure);

    // Update or create pattern
    if (this.patterns.has(pattern.id)) {
      this.updatePattern(pattern.id, failure, resolution);
    } else {
      this.createPattern(pattern, failure, resolution);
    }

    // Store resolution
    const resolutions = this.resolutionHistory.get(failure.errorType) || [];
    resolutions.push({
      failureId: failure.id,
      action: resolution.action,
      success: resolution.success,
      duration: resolution.duration,
      timestamp: Date.now(),
    });
    this.resolutionHistory.set(failure.errorType, resolutions);

    // Analyze patterns
    await this.analyzePatterns();
  }

  /**
   * Extract pattern from failure
   */
  private extractPattern(failure: FailureRecord): FailurePattern {
    // Normalize error type
    const errorType = this.normalizeErrorType(failure.errorType);

    // Find existing pattern or create new
    const existingPattern = Array.from(this.patterns.values()).find(
      (p) => p.errorType === errorType
    );

    if (existingPattern) {
      return existingPattern;
    }

    return {
      id: uuidv4(),
      errorType,
      frequency: 0,
      resolution: {
        type: 'RETRY',
        target: '',
        params: {},
        priority: 5,
      },
      successRate: 0,
      avgResolutionTime: 0,
      lastOccurred: Date.now(),
      metadata: {},
    };
  }

  /**
   * Normalize error type for pattern matching
   */
  private normalizeErrorType(errorType: string): string {
    // Remove specifics like IDs, timestamps, etc.
    return errorType
      .toLowerCase()
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID') // Replace UUIDs
      .replace(/\s+/g, '_')
      .trim();
  }

  /**
   * Create new pattern
   */
  private createPattern(
    pattern: FailurePattern,
    failure: FailureRecord,
    resolution: HealingResult
  ): void {
    pattern.frequency = 1;
    pattern.resolution = resolution.action;
    pattern.successRate = resolution.success ? 1 : 0;
    pattern.avgResolutionTime = resolution.duration;
    pattern.lastOccurred = failure.timestamp;
    pattern.metadata = {
      firstOccurred: failure.timestamp,
      workflowId: failure.workflowId,
    };

    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Update existing pattern
   */
  private updatePattern(
    patternId: string,
    failure: FailureRecord,
    resolution: HealingResult
  ): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return;
    }

    // Update frequency
    pattern.frequency++;

    // Update success rate (exponential moving average)
    const alpha = 0.3; // Smoothing factor
    const newSuccess = resolution.success ? 1 : 0;
    pattern.successRate = alpha * newSuccess + (1 - alpha) * pattern.successRate;

    // Update average resolution time
    pattern.avgResolutionTime =
      (pattern.avgResolutionTime * (pattern.frequency - 1) + resolution.duration) /
      pattern.frequency;

    // Update last occurred
    pattern.lastOccurred = failure.timestamp;

    // Update resolution if new one is more successful
    if (resolution.success && pattern.resolution.type !== resolution.action.type) {
      const currentSuccessRate = this.getActionSuccessRate(pattern.errorType, pattern.resolution.type);
      const newSuccessRate = this.getActionSuccessRate(pattern.errorType, resolution.action.type);

      if (newSuccessRate > currentSuccessRate) {
        pattern.resolution = resolution.action;
      }
    }

    this.patterns.set(patternId, pattern);
  }

  /**
   * Get success rate for a specific action type
   */
  private getActionSuccessRate(errorType: string, actionType: string): number {
    const resolutions = this.resolutionHistory.get(errorType) || [];
    const actionResolutions = resolutions.filter((r) => r.action.type === actionType);

    if (actionResolutions.length === 0) {
      return 0;
    }

    const successful = actionResolutions.filter((r) => r.success).length;
    return successful / actionResolutions.length;
  }

  /**
   * Analyze patterns to find insights
   */
  private async analyzePatterns(): Promise<void> {
    // Find patterns with low success rates
    const problematicPatterns = Array.from(this.patterns.values()).filter(
      (p) => p.frequency > 5 && p.successRate < 0.5
    );

    if (problematicPatterns.length > 0) {
      console.log('[LEARNING] Problematic patterns detected:', problematicPatterns.length);
      // In real implementation, would trigger alerts or strategy updates
    }

    // Find frequently occurring patterns
    const frequentPatterns = Array.from(this.patterns.values())
      .filter((p) => p.frequency > 10)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    if (frequentPatterns.length > 0) {
      console.log('[LEARNING] Most frequent failure patterns:', frequentPatterns.map(p => p.errorType));
    }
  }

  /**
   * Get recommended action for a failure
   */
  async getRecommendedAction(errorType: string): Promise<HealingAction | null> {
    const normalizedType = this.normalizeErrorType(errorType);

    // Find matching pattern
    const pattern = Array.from(this.patterns.values()).find(
      (p) => p.errorType === normalizedType && p.successRate > 0.5
    );

    if (!pattern) {
      return null;
    }

    return pattern.resolution;
  }

  /**
   * Get pattern statistics
   */
  getPatternStatistics(): FailurePatternStatistics {
    const patterns = Array.from(this.patterns.values());

    return {
      totalPatterns: patterns.length,
      totalFailures: this.failureHistory.length,
      averageSuccessRate:
        patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length || 0,
      mostFrequent: patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 10),
      leastSuccessful: patterns
        .filter((p) => p.frequency > 3)
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 10),
    };
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): FailurePattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): FailurePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by error type
   */
  getPatternsByErrorType(errorType: string): FailurePattern[] {
    const normalizedType = this.normalizeErrorType(errorType);
    return Array.from(this.patterns.values()).filter((p) => p.errorType === normalizedType);
  }

  /**
   * Get failure history
   */
  getFailureHistory(limit?: number): FailureRecord[] {
    if (limit) {
      return this.failureHistory.slice(-limit);
    }
    return [...this.failureHistory];
  }

  /**
   * Clear learned patterns
   */
  clearPatterns(): void {
    this.patterns.clear();
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.failureHistory.length = 0;
    this.resolutionHistory.clear();
  }

  /**
   * Export learned patterns
   */
  exportPatterns(): string {
    const data = {
      patterns: Array.from(this.patterns.values()),
      statistics: this.getPatternStatistics(),
      exportedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import learned patterns
   */
  importPatterns(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.patterns && Array.isArray(parsed.patterns)) {
        parsed.patterns.forEach((pattern: FailurePattern) => {
          this.patterns.set(pattern.id, pattern);
        });
      }
    } catch (error) {
      throw new Error('Failed to import patterns: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

/**
 * Failure Record
 */
export interface FailureRecord {
  id: string;
  workflowId: string;
  nodeId?: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Resolution Record
 */
interface ResolutionRecord {
  failureId: string;
  action: HealingAction;
  success: boolean;
  duration: number;
  timestamp: number;
}

/**
 * Failure Pattern Statistics
 */
interface FailurePatternStatistics {
  totalPatterns: number;
  totalFailures: number;
  averageSuccessRate: number;
  mostFrequent: FailurePattern[];
  leastSuccessful: FailurePattern[];
}
