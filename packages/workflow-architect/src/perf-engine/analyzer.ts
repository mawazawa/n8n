/**
 * Performance Analyzer
 * Analyzes workflow performance and generates insights
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  AnalysisResult,
  PerformanceTrend,
  HistoricalComparison,
  ProfileResult,
  PerformanceMetric,
  Bottleneck,
  OptimizationSuggestion,
} from './types';
import { BottleneckDetector } from './bottlenecks';

interface WorkflowData {
  id: string;
  name: string;
  nodes: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
  connections: Array<{ source: string; target: string }>;
}

export class PerformanceAnalyzer {
  private bottleneckDetector: BottleneckDetector;

  constructor(private supabase: SupabaseClient) {
    this.bottleneckDetector = new BottleneckDetector();
  }

  /**
   * Analyze workflow performance
   */
  async analyze(workflow: WorkflowData): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Get historical profiles
    const profiles = await this.getHistoricalProfiles(workflow.id);

    if (profiles.length === 0) {
      return this.createEmptyAnalysis(workflow.id);
    }

    // Analyze current performance
    const latestProfile = profiles[0];
    const performanceScore = this.calculatePerformanceScore(latestProfile);

    // Detect trends
    const trends = await this.detectTrends(profiles);

    // Detect bottlenecks
    const bottlenecks = await this.bottleneckDetector.detect(latestProfile);

    // Generate optimizations (basic recommendations)
    const optimizations = this.generateOptimizations(bottlenecks, latestProfile);

    // Historical comparison
    const historicalComparison = this.compareWithHistorical(profiles);

    const analysisOverhead = Date.now() - startTime;

    return {
      workflowId: workflow.id,
      analysisTimestamp: new Date().toISOString(),
      performanceScore,
      trends,
      bottlenecks,
      optimizations,
      historicalComparison,
      metadata: {
        profileCount: profiles.length,
        analysisOverheadMs: analysisOverhead,
      },
    };
  }

  /**
   * Calculate overall performance score (0-100)
   */
  private calculatePerformanceScore(profile: ProfileResult): number {
    let score = 100;

    // Deduct points for slow execution
    const avgNodeTime = profile.duration / profile.nodeMetrics.length;
    if (avgNodeTime > 5000) score -= 20; // > 5s per node
    else if (avgNodeTime > 2000) score -= 10; // > 2s per node
    else if (avgNodeTime > 1000) score -= 5; // > 1s per node

    // Deduct points for high resource usage
    if (profile.totalResourceUsage.cpu.usage > 80) score -= 15;
    else if (profile.totalResourceUsage.cpu.usage > 60) score -= 10;

    if (profile.totalResourceUsage.memory.peak > 1024 * 1024 * 1024) score -= 15; // > 1GB
    else if (profile.totalResourceUsage.memory.peak > 512 * 1024 * 1024) score -= 10; // > 512MB

    // Deduct points for errors
    const errorCount = profile.nodeMetrics.reduce((sum, n) => sum + n.errorCount, 0);
    score -= errorCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect performance trends
   */
  private async detectTrends(profiles: ProfileResult[]): Promise<PerformanceTrend[]> {
    if (profiles.length < 2) {
      return [];
    }

    const trends: PerformanceTrend[] = [];

    // Analyze execution time trend
    const executionTimeTrend = this.analyzeTrend(
      'execution_time',
      profiles.map((p) => ({ timestamp: p.startTime, value: p.duration })),
    );
    if (executionTimeTrend) trends.push(executionTimeTrend);

    // Analyze CPU usage trend
    const cpuTrend = this.analyzeTrend(
      'cpu_usage',
      profiles.map((p) => ({
        timestamp: p.startTime,
        value: p.totalResourceUsage.cpu.usage,
      })),
    );
    if (cpuTrend) trends.push(cpuTrend);

    // Analyze memory usage trend
    const memoryTrend = this.analyzeTrend(
      'memory_peak',
      profiles.map((p) => ({
        timestamp: p.startTime,
        value: p.totalResourceUsage.memory.peak,
      })),
    );
    if (memoryTrend) trends.push(memoryTrend);

    return trends;
  }

  /**
   * Analyze a single metric trend
   */
  private analyzeTrend(
    metric: string,
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): PerformanceTrend | null {
    if (dataPoints.length < 2) return null;

    // Calculate change from first to last
    const first = dataPoints[dataPoints.length - 1].value;
    const last = dataPoints[0].value;
    const change = last - first;
    const changePercent = (change / first) * 100;

    // Determine direction
    let direction: PerformanceTrend['direction'] = 'stable';
    if (Math.abs(changePercent) > 10) {
      direction = changePercent > 0 ? 'degrading' : 'improving';
    }

    return {
      metric,
      direction,
      changePercent,
      dataPoints,
      period: this.determinePeriod(dataPoints),
    };
  }

  /**
   * Determine the time period of data points
   */
  private determinePeriod(
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): 'hour' | 'day' | 'week' | 'month' {
    if (dataPoints.length < 2) return 'day';

    const span = dataPoints[0].timestamp - dataPoints[dataPoints.length - 1].timestamp;
    const spanHours = span / (1000 * 60 * 60);

    if (spanHours < 2) return 'hour';
    if (spanHours < 48) return 'day';
    if (spanHours < 336) return 'week'; // 14 days
    return 'month';
  }

  /**
   * Compare with historical performance
   */
  private compareWithHistorical(profiles: ProfileResult[]): HistoricalComparison | undefined {
    if (profiles.length < 2) return undefined;

    const baseline = profiles[profiles.length - 1];
    const current = profiles[0];

    const changes = [
      {
        metric: 'execution_time',
        change: current.duration - baseline.duration,
        changePercent: ((current.duration - baseline.duration) / baseline.duration) * 100,
        significant: Math.abs(current.duration - baseline.duration) > baseline.duration * 0.1,
      },
      {
        metric: 'cpu_usage',
        change:
          current.totalResourceUsage.cpu.usage - baseline.totalResourceUsage.cpu.usage,
        changePercent:
          ((current.totalResourceUsage.cpu.usage - baseline.totalResourceUsage.cpu.usage) /
            baseline.totalResourceUsage.cpu.usage) *
          100,
        significant:
          Math.abs(
            current.totalResourceUsage.cpu.usage - baseline.totalResourceUsage.cpu.usage,
          ) >
          baseline.totalResourceUsage.cpu.usage * 0.15,
      },
      {
        metric: 'memory_peak',
        change:
          current.totalResourceUsage.memory.peak - baseline.totalResourceUsage.memory.peak,
        changePercent:
          ((current.totalResourceUsage.memory.peak -
            baseline.totalResourceUsage.memory.peak) /
            baseline.totalResourceUsage.memory.peak) *
          100,
        significant:
          Math.abs(
            current.totalResourceUsage.memory.peak -
              baseline.totalResourceUsage.memory.peak,
          ) >
          baseline.totalResourceUsage.memory.peak * 0.2,
      },
    ];

    return {
      baseline: {
        executionId: baseline.executionId,
        timestamp: new Date(baseline.startTime).toISOString(),
        metrics: this.extractMetrics(baseline),
      },
      current: {
        executionId: current.executionId,
        timestamp: new Date(current.startTime).toISOString(),
        metrics: this.extractMetrics(current),
      },
      changes,
    };
  }

  /**
   * Extract metrics from profile
   */
  private extractMetrics(profile: ProfileResult): PerformanceMetric[] {
    return [
      {
        name: 'execution_time',
        value: profile.duration,
        unit: 'ms',
        timestamp: profile.startTime,
        executionId: profile.executionId,
      },
      {
        name: 'cpu_usage',
        value: profile.totalResourceUsage.cpu.usage,
        unit: 'percent',
        timestamp: profile.startTime,
        executionId: profile.executionId,
      },
      {
        name: 'memory_peak',
        value: profile.totalResourceUsage.memory.peak,
        unit: 'bytes',
        timestamp: profile.startTime,
        executionId: profile.executionId,
      },
    ];
  }

  /**
   * Generate optimization suggestions based on bottlenecks
   */
  private generateOptimizations(
    bottlenecks: Bottleneck[],
    profile: ProfileResult,
  ): OptimizationSuggestion[] {
    const optimizations: OptimizationSuggestion[] = [];

    // Group bottlenecks by type
    const bottlenecksByType = bottlenecks.reduce(
      (acc, b) => {
        if (!acc[b.type]) acc[b.type] = [];
        acc[b.type].push(b);
        return acc;
      },
      {} as Record<string, Bottleneck[]>,
    );

    // Generate suggestions for each type
    for (const [type, typeBottlenecks] of Object.entries(bottlenecksByType)) {
      const suggestion = this.createOptimizationForBottleneckType(
        type,
        typeBottlenecks,
        profile,
      );
      if (suggestion) optimizations.push(suggestion);
    }

    return optimizations;
  }

  /**
   * Create optimization suggestion for bottleneck type
   */
  private createOptimizationForBottleneckType(
    type: string,
    bottlenecks: Bottleneck[],
    profile: ProfileResult,
  ): OptimizationSuggestion | null {
    const affectedNodes = bottlenecks.map((b) => b.nodeId);

    switch (type) {
      case 'external_api':
        return {
          id: `opt-${Date.now()}-caching`,
          type: 'caching',
          title: 'Add caching for external API calls',
          description: `${bottlenecks.length} nodes are making slow external API calls. Consider caching responses.`,
          expectedGain: {
            metric: 'execution_time',
            currentValue: profile.duration,
            expectedValue: profile.duration * 0.6,
            unit: 'ms',
            confidence: 0.7,
          },
          affectedNodes,
          safeToAutoApply: false,
          complexity: 'medium',
        };

      case 'cpu':
        return {
          id: `opt-${Date.now()}-resource`,
          type: 'resource_allocation',
          title: 'Increase CPU allocation',
          description: `${bottlenecks.length} nodes are CPU-bound. Consider increasing CPU resources.`,
          expectedGain: {
            metric: 'execution_time',
            currentValue: profile.duration,
            expectedValue: profile.duration * 0.7,
            unit: 'ms',
            confidence: 0.8,
          },
          affectedNodes,
          safeToAutoApply: false,
          complexity: 'low',
        };

      case 'memory':
        return {
          id: `opt-${Date.now()}-batching`,
          type: 'batching',
          title: 'Process items in batches',
          description: `${bottlenecks.length} nodes are using excessive memory. Consider batch processing.`,
          expectedGain: {
            metric: 'memory_peak',
            currentValue: profile.totalResourceUsage.memory.peak,
            expectedValue: profile.totalResourceUsage.memory.peak * 0.5,
            unit: 'bytes',
            confidence: 0.75,
          },
          affectedNodes,
          safeToAutoApply: false,
          complexity: 'high',
        };

      default:
        return null;
    }
  }

  /**
   * Get historical profiles for a workflow
   */
  private async getHistoricalProfiles(workflowId: string): Promise<ProfileResult[]> {
    const { data, error } = await this.supabase
      .from('performance_profiles')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('start_time', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching historical profiles:', error);
      return [];
    }

    return (data || []).map((row) => this.mapRowToProfile(row));
  }

  /**
   * Map database row to ProfileResult
   */
  private mapRowToProfile(row: Record<string, unknown>): ProfileResult {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string,
      executionId: row.execution_id as string,
      startTime: new Date(row.start_time as string).getTime(),
      endTime: new Date(row.end_time as string).getTime(),
      duration: row.duration as number,
      nodeMetrics: row.node_metrics as ProfileResult['nodeMetrics'],
      totalResourceUsage: row.total_resource_usage as ProfileResult['totalResourceUsage'],
      flameGraph: row.flame_graph as ProfileResult['flameGraph'],
      metadata: row.metadata as Record<string, unknown>,
    };
  }

  /**
   * Create empty analysis for workflows with no history
   */
  private createEmptyAnalysis(workflowId: string): AnalysisResult {
    return {
      workflowId,
      analysisTimestamp: new Date().toISOString(),
      performanceScore: 100,
      trends: [],
      bottlenecks: [],
      optimizations: [],
      metadata: {
        note: 'No historical data available',
      },
    };
  }
}
