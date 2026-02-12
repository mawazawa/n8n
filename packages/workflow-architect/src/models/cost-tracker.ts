/**
 * Cost Tracker
 * Tracks API costs per request and aggregates usage statistics
 */

import { MODEL_CONFIGS, type ModelId } from './router.js';

export interface CostEntry {
  requestId: string;
  modelId: ModelId;
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  taskType?: string;
  userId?: string;
  sessionId?: string;
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, {
    cost: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byTaskType?: Record<string, {
    cost: number;
    requests: number;
  }>;
  byUser?: Record<string, {
    cost: number;
    requests: number;
  }>;
}

export interface CostTrackerConfig {
  enablePersistence?: boolean;
  persistPath?: string;
  enableAlerts?: boolean;
  costAlertThreshold?: number;
  retentionDays?: number;
}

export class CostTracker {
  private entries: CostEntry[] = [];
  private config: CostTrackerConfig;

  constructor(config: CostTrackerConfig = {}) {
    this.config = {
      enablePersistence: config.enablePersistence ?? false,
      persistPath: config.persistPath ?? './data/cost-tracking.json',
      enableAlerts: config.enableAlerts ?? false,
      costAlertThreshold: config.costAlertThreshold ?? 100, // $100
      retentionDays: config.retentionDays ?? 90,
    };
  }

  /**
   * Track a single request
   */
  trackRequest(params: {
    requestId: string;
    modelId: ModelId;
    inputTokens: number;
    outputTokens: number;
    taskType?: string;
    userId?: string;
    sessionId?: string;
  }): CostEntry {
    const config = MODEL_CONFIGS[params.modelId];

    const inputCost = (params.inputTokens / 1_000_000) * config.costPerMillionInput;
    const outputCost = (params.outputTokens / 1_000_000) * config.costPerMillionOutput;
    const totalCost = inputCost + outputCost;

    const entry: CostEntry = {
      requestId: params.requestId,
      modelId: params.modelId,
      timestamp: new Date(),
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      inputCost,
      outputCost,
      totalCost,
      taskType: params.taskType,
      userId: params.userId,
      sessionId: params.sessionId,
    };

    this.entries.push(entry);

    // Check alert threshold
    if (this.config.enableAlerts) {
      this.checkCostAlerts();
    }

    // Persist if enabled
    if (this.config.enablePersistence) {
      this.persist();
    }

    return entry;
  }

  /**
   * Get cost summary for a time period
   */
  getSummary(options?: {
    startDate?: Date;
    endDate?: Date;
    modelId?: ModelId;
    taskType?: string;
    userId?: string;
  }): CostSummary {
    let filteredEntries = this.entries;

    // Apply filters
    if (options?.startDate) {
      filteredEntries = filteredEntries.filter(e => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      filteredEntries = filteredEntries.filter(e => e.timestamp <= options.endDate!);
    }
    if (options?.modelId) {
      filteredEntries = filteredEntries.filter(e => e.modelId === options.modelId);
    }
    if (options?.taskType) {
      filteredEntries = filteredEntries.filter(e => e.taskType === options.taskType);
    }
    if (options?.userId) {
      filteredEntries = filteredEntries.filter(e => e.userId === options.userId);
    }

    // Calculate summary
    const summary: CostSummary = {
      totalCost: 0,
      totalRequests: filteredEntries.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byModel: {},
      byTaskType: {},
      byUser: {},
    };

    for (const entry of filteredEntries) {
      summary.totalCost += entry.totalCost;
      summary.totalInputTokens += entry.inputTokens;
      summary.totalOutputTokens += entry.outputTokens;

      // By model
      if (!summary.byModel[entry.modelId]) {
        summary.byModel[entry.modelId] = {
          cost: 0,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      summary.byModel[entry.modelId].cost += entry.totalCost;
      summary.byModel[entry.modelId].requests += 1;
      summary.byModel[entry.modelId].inputTokens += entry.inputTokens;
      summary.byModel[entry.modelId].outputTokens += entry.outputTokens;

      // By task type
      if (entry.taskType) {
        if (!summary.byTaskType![entry.taskType]) {
          summary.byTaskType![entry.taskType] = { cost: 0, requests: 0 };
        }
        summary.byTaskType![entry.taskType].cost += entry.totalCost;
        summary.byTaskType![entry.taskType].requests += 1;
      }

      // By user
      if (entry.userId) {
        if (!summary.byUser![entry.userId]) {
          summary.byUser![entry.userId] = { cost: 0, requests: 0 };
        }
        summary.byUser![entry.userId].cost += entry.totalCost;
        summary.byUser![entry.userId].requests += 1;
      }
    }

    return summary;
  }

  /**
   * Get entries for a specific time period
   */
  getEntries(options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): CostEntry[] {
    let entries = this.entries;

    if (options?.startDate) {
      entries = entries.filter(e => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      entries = entries.filter(e => e.timestamp <= options.endDate!);
    }

    // Sort by timestamp descending
    entries = entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get today's cost
   */
  getTodayCost(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const summary = this.getSummary({ startDate: today });
    return summary.totalCost;
  }

  /**
   * Get this month's cost
   */
  getMonthCost(): number {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const summary = this.getSummary({ startDate: startOfMonth });
    return summary.totalCost;
  }

  /**
   * Get cost projection for the month
   */
  getMonthlyProjection(): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();

    const currentMonthCost = this.getMonthCost();
    const avgDailyCost = currentMonthCost / daysPassed;

    return avgDailyCost * daysInMonth;
  }

  /**
   * Export data as CSV
   */
  exportCSV(): string {
    const headers = [
      'Request ID',
      'Model',
      'Timestamp',
      'Input Tokens',
      'Output Tokens',
      'Input Cost',
      'Output Cost',
      'Total Cost',
      'Task Type',
      'User ID',
      'Session ID',
    ];

    const rows = this.entries.map(entry => [
      entry.requestId,
      entry.modelId,
      entry.timestamp.toISOString(),
      entry.inputTokens.toString(),
      entry.outputTokens.toString(),
      entry.inputCost.toFixed(6),
      entry.outputCost.toFixed(6),
      entry.totalCost.toFixed(6),
      entry.taskType || '',
      entry.userId || '',
      entry.sessionId || '',
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Check if cost alerts should be triggered
   */
  private checkCostAlerts(): void {
    const monthCost = this.getMonthCost();
    const threshold = this.config.costAlertThreshold || 100;

    if (monthCost >= threshold) {
      console.warn(`[Cost Alert] Monthly cost (${monthCost.toFixed(2)}) exceeds threshold (${threshold})`);
    }

    // Check projection
    const projection = this.getMonthlyProjection();
    if (projection >= threshold * 1.2) {
      console.warn(`[Cost Alert] Projected monthly cost (${projection.toFixed(2)}) is 20% above threshold`);
    }
  }

  /**
   * Persist cost data to file
   */
  private async persist(): Promise<void> {
    // Implementation would use fs.writeFile
    // For now, just a placeholder
  }

  /**
   * Clean up old entries based on retention policy
   */
  cleanOldEntries(): void {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - (this.config.retentionDays || 90));

    const beforeCount = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= retentionDate);
    const afterCount = this.entries.length;

    if (beforeCount !== afterCount) {
      console.log(`Cleaned up ${beforeCount - afterCount} old cost entries`);
    }
  }

  /**
   * Reset all tracked data
   */
  reset(): void {
    this.entries = [];
  }

  /**
   * Get the most expensive requests
   */
  getTopExpensiveRequests(limit: number = 10): CostEntry[] {
    return [...this.entries]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit);
  }
}

// Singleton instance
let trackerInstance: CostTracker | null = null;

export function getCostTracker(config?: CostTrackerConfig): CostTracker {
  if (!trackerInstance || config) {
    trackerInstance = new CostTracker(config);
  }
  return trackerInstance;
}
