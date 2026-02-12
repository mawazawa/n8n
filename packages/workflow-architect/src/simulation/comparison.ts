import type { ComparisonResult, SimulationResult, LoadTestResult } from './types';
import { ComparisonResultSchema } from './types';

/**
 * Result Comparator
 * Compares simulation and load test results
 */

export class ResultComparator {
	/**
	 * Compare two simulation results
	 */
	compare(a: SimulationResult, b: SimulationResult): ComparisonResult {
		const differences = this.findDifferences(a, b);
		const similarity = this.calculateSimilarity(differences, a);
		const performanceDelta = this.calculatePerformanceDelta(a, b);

		return ComparisonResultSchema.parse({
			similar: differences.length === 0,
			similarity,
			differences,
			performanceDelta,
		});
	}

	/**
	 * Compare two load test results
	 */
	compareLoadTests(a: LoadTestResult, b: LoadTestResult): ComparisonResult {
		const differences = this.findLoadTestDifferences(a, b);
		const similarity = this.calculateSimilarity(differences, a);
		const performanceDelta = this.calculateLoadTestPerformanceDelta(a, b);

		return ComparisonResultSchema.parse({
			similar: differences.length === 0,
			similarity,
			differences,
			performanceDelta,
		});
	}

	/**
	 * Find differences between simulation results
	 */
	private findDifferences(
		a: SimulationResult,
		b: SimulationResult,
	): ComparisonResult['differences'] {
		const differences: ComparisonResult['differences'] = [];

		// Compare aggregate metrics
		const metricsA = a.aggregateMetrics;
		const metricsB = b.aggregateMetrics;

		// Success rate difference
		if (Math.abs(metricsA.successRate - metricsB.successRate) > 0.05) {
			differences.push({
				path: 'aggregateMetrics.successRate',
				type: 'value',
				expected: metricsA.successRate,
				actual: metricsB.successRate,
			});
		}

		// Average duration difference (>10%)
		const durationDelta = Math.abs(metricsA.averageDuration - metricsB.averageDuration);
		if (durationDelta / metricsA.averageDuration > 0.1) {
			differences.push({
				path: 'aggregateMetrics.averageDuration',
				type: 'value',
				expected: metricsA.averageDuration,
				actual: metricsB.averageDuration,
			});
		}

		// P95 duration difference (>15%)
		const p95Delta = Math.abs(metricsA.p95Duration - metricsB.p95Duration);
		if (p95Delta / metricsA.p95Duration > 0.15) {
			differences.push({
				path: 'aggregateMetrics.p95Duration',
				type: 'value',
				expected: metricsA.p95Duration,
				actual: metricsB.p95Duration,
			});
		}

		// Error count difference
		if (a.errors.length !== b.errors.length) {
			differences.push({
				path: 'errors.length',
				type: 'value',
				expected: a.errors.length,
				actual: b.errors.length,
			});
		}

		return differences;
	}

	/**
	 * Find differences between load test results
	 */
	private findLoadTestDifferences(
		a: LoadTestResult,
		b: LoadTestResult,
	): ComparisonResult['differences'] {
		const differences: ComparisonResult['differences'] = [];

		// Compare metrics
		const metricsA = a.metrics;
		const metricsB = b.metrics;

		// Throughput difference (>10%)
		const throughputDelta = Math.abs(metricsA.throughput - metricsB.throughput);
		if (throughputDelta / metricsA.throughput > 0.1) {
			differences.push({
				path: 'metrics.throughput',
				type: 'value',
				expected: metricsA.throughput,
				actual: metricsB.throughput,
			});
		}

		// Success rate difference
		if (Math.abs(metricsA.successRate - metricsB.successRate) > 0.05) {
			differences.push({
				path: 'metrics.successRate',
				type: 'value',
				expected: metricsA.successRate,
				actual: metricsB.successRate,
			});
		}

		// P95 latency difference (>20%)
		const p95Delta = Math.abs(metricsA.latency.p95 - metricsB.latency.p95);
		if (p95Delta / metricsA.latency.p95 > 0.2) {
			differences.push({
				path: 'metrics.latency.p95',
				type: 'value',
				expected: metricsA.latency.p95,
				actual: metricsB.latency.p95,
			});
		}

		return differences;
	}

	/**
	 * Calculate similarity score (0-1)
	 */
	private calculateSimilarity(
		differences: ComparisonResult['differences'],
		baseline: unknown,
	): number {
		if (differences.length === 0) {
			return 1.0;
		}

		// Simple scoring: reduce by 0.1 for each difference, min 0
		return Math.max(0, 1 - differences.length * 0.1);
	}

	/**
	 * Calculate performance delta
	 */
	private calculatePerformanceDelta(
		a: SimulationResult,
		b: SimulationResult,
	): ComparisonResult['performanceDelta'] {
		const durationChange =
			((b.aggregateMetrics.averageDuration - a.aggregateMetrics.averageDuration) /
				a.aggregateMetrics.averageDuration) *
			100;

		const memoryChangeA = a.aggregateMetrics.averageMemory ?? 0;
		const memoryChangeB = b.aggregateMetrics.averageMemory ?? 0;
		const memoryChange =
			memoryChangeA > 0 ? ((memoryChangeB - memoryChangeA) / memoryChangeA) * 100 : 0;

		return {
			duration: durationChange,
			memory: memoryChange,
		};
	}

	/**
	 * Calculate load test performance delta
	 */
	private calculateLoadTestPerformanceDelta(
		a: LoadTestResult,
		b: LoadTestResult,
	): ComparisonResult['performanceDelta'] {
		const throughputChange =
			((b.metrics.throughput - a.metrics.throughput) / a.metrics.throughput) * 100;

		return {
			duration: 0, // Not applicable for load tests
			throughput: throughputChange,
		};
	}

	/**
	 * Generate diff visualization
	 */
	generateDiff(a: unknown, b: unknown, path: string = ''): string[] {
		const diffs: string[] = [];

		if (typeof a !== typeof b) {
			diffs.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`);
			return diffs;
		}

		if (a === null || b === null) {
			if (a !== b) {
				diffs.push(`${path}: ${a} vs ${b}`);
			}
			return diffs;
		}

		if (typeof a === 'object' && typeof b === 'object') {
			const keysA = Object.keys(a as object);
			const keysB = Object.keys(b as object);

			// Missing keys
			for (const key of keysA) {
				if (!keysB.includes(key)) {
					diffs.push(`${path}.${key}: missing in second object`);
				}
			}

			// Extra keys
			for (const key of keysB) {
				if (!keysA.includes(key)) {
					diffs.push(`${path}.${key}: extra in second object`);
				}
			}

			// Recursive comparison
			for (const key of keysA) {
				if (keysB.includes(key)) {
					const newPath = path ? `${path}.${key}` : key;
					const subDiffs = this.generateDiff(
						(a as Record<string, unknown>)[key],
						(b as Record<string, unknown>)[key],
						newPath,
					);
					diffs.push(...subDiffs);
				}
			}
		} else if (a !== b) {
			diffs.push(`${path}: ${a} vs ${b}`);
		}

		return diffs;
	}

	/**
	 * Detect regression
	 */
	detectRegression(baseline: SimulationResult, current: SimulationResult): {
		hasRegression: boolean;
		regressions: Array<{ metric: string; baseline: number; current: number; change: number }>;
	} {
		const regressions: Array<{
			metric: string;
			baseline: number;
			current: number;
			change: number;
		}> = [];

		// Check for performance regressions (>10% slower)
		const durationChange =
			(current.aggregateMetrics.averageDuration - baseline.aggregateMetrics.averageDuration) /
			baseline.aggregateMetrics.averageDuration;

		if (durationChange > 0.1) {
			regressions.push({
				metric: 'averageDuration',
				baseline: baseline.aggregateMetrics.averageDuration,
				current: current.aggregateMetrics.averageDuration,
				change: durationChange * 100,
			});
		}

		// Check for success rate regression (>5% decrease)
		const successRateChange =
			baseline.aggregateMetrics.successRate - current.aggregateMetrics.successRate;

		if (successRateChange > 0.05) {
			regressions.push({
				metric: 'successRate',
				baseline: baseline.aggregateMetrics.successRate,
				current: current.aggregateMetrics.successRate,
				change: -successRateChange * 100,
			});
		}

		return {
			hasRegression: regressions.length > 0,
			regressions,
		};
	}

	/**
	 * Compare performance trends
	 */
	compareTrends(
		results: SimulationResult[],
	): Array<{ metric: string; trend: 'improving' | 'degrading' | 'stable'; change: number }> {
		if (results.length < 2) {
			return [];
		}

		const trends: Array<{
			metric: string;
			trend: 'improving' | 'degrading' | 'stable';
			change: number;
		}> = [];

		// Average duration trend
		const durations = results.map((r) => r.aggregateMetrics.averageDuration);
		const durationTrend = this.calculateTrend(durations);
		trends.push({
			metric: 'averageDuration',
			trend: durationTrend.trend,
			change: durationTrend.change,
		});

		// Success rate trend
		const successRates = results.map((r) => r.aggregateMetrics.successRate);
		const successRateTrend = this.calculateTrend(successRates);
		trends.push({
			metric: 'successRate',
			trend: successRateTrend.trend === 'improving' ? 'improving' : successRateTrend.trend === 'degrading' ? 'degrading' : 'stable',
			change: successRateTrend.change,
		});

		return trends;
	}

	/**
	 * Calculate trend from values
	 */
	private calculateTrend(values: number[]): {
		trend: 'improving' | 'degrading' | 'stable';
		change: number;
	} {
		const first = values[0];
		const last = values[values.length - 1];
		const change = ((last - first) / first) * 100;

		let trend: 'improving' | 'degrading' | 'stable';
		if (Math.abs(change) < 5) {
			trend = 'stable';
		} else if (change > 0) {
			trend = 'degrading'; // Higher duration is worse
		} else {
			trend = 'improving'; // Lower duration is better
		}

		return { trend, change };
	}
}
