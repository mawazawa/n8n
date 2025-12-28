/**
 * Performance Benchmark Runner
 * Runs statistical performance benchmarks on workflows
 */

import { v4 as uuidv4 } from 'uuid';
import { BenchmarkResult, BenchmarkConfig, BenchmarkConfigSchema, BenchmarkComparison } from './types';

interface ExecutionFunction {
  (): Promise<{ duration: number; success: boolean; error?: string }>;
}

export class BenchmarkRunner {
  /**
   * Run performance benchmark
   */
  async run(
    workflowId: string,
    executeWorkflow: ExecutionFunction,
    config: BenchmarkConfig,
  ): Promise<BenchmarkResult> {
    // Validate configuration
    const validatedConfig = BenchmarkConfigSchema.parse(config);

    const durations: number[] = [];
    const errors: string[] = [];

    // Warm-up runs
    for (let i = 0; i < validatedConfig.warmupRuns; i++) {
      try {
        await executeWorkflow();
      } catch (error) {
        console.warn('Warm-up run failed:', error);
      }
    }

    // Actual benchmark runs
    for (let i = 0; i < validatedConfig.iterations; i++) {
      try {
        const result = await this.runWithTimeout(executeWorkflow, validatedConfig.timeout);

        if (result.success) {
          durations.push(result.duration);
        } else {
          errors.push(result.error || 'Unknown error');
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Remove outliers if requested
    const cleanedDurations = validatedConfig.skipOutliers
      ? this.removeOutliers(durations, validatedConfig.outlierThreshold || 2)
      : durations;

    // Calculate statistics
    const metrics = this.calculateStatistics(cleanedDurations);
    const outliers = this.findOutliers(durations, validatedConfig.outlierThreshold || 2);

    return {
      id: uuidv4(),
      workflowId,
      iterations: validatedConfig.iterations,
      warmupRuns: validatedConfig.warmupRuns,
      metrics,
      outliers,
      timestamp: new Date().toISOString(),
      metadata: {
        successRate: (cleanedDurations.length / validatedConfig.iterations) * 100,
        errors,
      },
    };
  }

  /**
   * Run execution with timeout
   */
  private async runWithTimeout(
    fn: ExecutionFunction,
    timeout?: number,
  ): Promise<{ duration: number; success: boolean; error?: string }> {
    if (!timeout) {
      return await fn();
    }

    return Promise.race([
      fn(),
      new Promise<{ duration: number; success: boolean; error: string }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              duration: timeout,
              success: false,
              error: `Execution timeout after ${timeout}ms`,
            }),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * Calculate statistical metrics
   */
  private calculateStatistics(
    durations: number[],
  ): BenchmarkResult['metrics'] {
    if (durations.length === 0) {
      return {
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median: this.percentile(sorted, 50),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stdDev,
      p50: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Remove outliers using standard deviation
   */
  private removeOutliers(values: number[], threshold = 2): number[] {
    if (values.length < 3) return values;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length,
    );

    return values.filter((v) => Math.abs(v - mean) <= threshold * stdDev);
  }

  /**
   * Find outliers
   */
  private findOutliers(values: number[], threshold = 2): number[] {
    if (values.length < 3) return [];

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length,
    );

    return values.filter((v) => Math.abs(v - mean) > threshold * stdDev);
  }

  /**
   * Compare two benchmark results
   */
  compare(
    baseline: BenchmarkResult,
    current: BenchmarkResult,
  ): BenchmarkComparison {
    const improvement =
      ((baseline.metrics.mean - current.metrics.mean) / baseline.metrics.mean) * 100;

    // Simple t-test for statistical significance
    const significant = this.isSignificantDifference(baseline, current);
    const pValue = this.calculatePValue(baseline, current);

    return {
      baselineId: baseline.id,
      currentId: current.id,
      improvement,
      significant,
      pValue,
    };
  }

  /**
   * Check if difference is statistically significant
   */
  private isSignificantDifference(
    baseline: BenchmarkResult,
    current: BenchmarkResult,
  ): boolean {
    // Simple heuristic: difference > 2 * combined std dev
    const combinedStdDev = Math.sqrt(
      Math.pow(baseline.metrics.stdDev, 2) + Math.pow(current.metrics.stdDev, 2),
    );

    return (
      Math.abs(baseline.metrics.mean - current.metrics.mean) > 2 * combinedStdDev
    );
  }

  /**
   * Calculate p-value (simplified t-test)
   */
  private calculatePValue(
    baseline: BenchmarkResult,
    current: BenchmarkResult,
  ): number {
    // Simplified calculation - real implementation would use proper statistical library
    const meanDiff = Math.abs(baseline.metrics.mean - current.metrics.mean);
    const pooledStdDev = Math.sqrt(
      (Math.pow(baseline.metrics.stdDev, 2) + Math.pow(current.metrics.stdDev, 2)) / 2,
    );

    if (pooledStdDev === 0) return 1;

    const tStat = meanDiff / pooledStdDev;

    // Rough approximation of p-value from t-statistic
    if (tStat < 1) return 0.3;
    if (tStat < 2) return 0.05;
    if (tStat < 3) return 0.01;
    return 0.001;
  }

  /**
   * Run comparative benchmark
   */
  async runComparative(
    workflowId: string,
    baselineExecution: ExecutionFunction,
    optimizedExecution: ExecutionFunction,
    config: BenchmarkConfig,
  ): Promise<{ baseline: BenchmarkResult; optimized: BenchmarkResult; comparison: BenchmarkComparison }> {
    const baseline = await this.run(workflowId, baselineExecution, config);
    const optimized = await this.run(workflowId, optimizedExecution, config);
    const comparison = this.compare(baseline, optimized);

    return { baseline, optimized, comparison };
  }
}
