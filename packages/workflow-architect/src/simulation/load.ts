import type { LoadTestConfig, LoadTestResult } from './types';
import { LoadTestConfigSchema, LoadTestResultSchema } from './types';

/**
 * Load Test Runner
 * Runs load tests with concurrent execution and various ramp patterns
 */

export interface ExecutionResult {
	success: boolean;
	duration: number;
	error?: string;
	timestamp: number;
}

export class LoadTestRunner {
	private running: boolean = false;
	private abortController: AbortController | null = null;
	private results: ExecutionResult[] = [];
	private startTime: number = 0;

	/**
	 * Run load test
	 */
	async run(
		executor: () => Promise<{ success: boolean; duration: number }>,
		config: LoadTestConfig,
	): Promise<LoadTestResult> {
		const validatedConfig = LoadTestConfigSchema.parse(config);

		this.running = true;
		this.abortController = new AbortController();
		this.results = [];
		this.startTime = Date.now();

		const testId = this.generateId();
		const timeSeries: LoadTestResult['timeSeries'] = [];

		try {
			// Calculate ramp schedule
			const schedule = this.calculateRampSchedule(validatedConfig);

			// Execute load test with ramp pattern
			await this.executeWithRamp(executor, schedule, validatedConfig, timeSeries);
		} finally {
			this.running = false;
			this.abortController = null;
		}

		const completedAt = new Date().toISOString();
		const totalDuration = Date.now() - this.startTime;

		// Calculate metrics
		const metrics = this.calculateMetrics(this.results, totalDuration);

		// Check threshold violations
		const thresholdViolations = this.checkThresholds(validatedConfig, metrics, timeSeries);

		return LoadTestResultSchema.parse({
			id: testId,
			config: validatedConfig,
			metrics,
			timeSeries,
			thresholdViolations,
			startedAt: new Date(this.startTime).toISOString(),
			completedAt,
		});
	}

	/**
	 * Calculate ramp schedule
	 */
	private calculateRampSchedule(
		config: LoadTestConfig,
	): Array<{ time: number; concurrency: number }> {
		const schedule: Array<{ time: number; concurrency: number }> = [];
		const rampDuration = config.concurrency.rampUp;
		const steps = 10; // Number of ramp steps

		const startConcurrency = config.concurrency.start;
		const maxConcurrency = config.concurrency.max;

		for (let i = 0; i <= steps; i++) {
			const progress = i / steps;
			let concurrency: number;

			switch (config.rampPattern) {
				case 'linear':
					concurrency =
						startConcurrency + (maxConcurrency - startConcurrency) * progress;
					break;

				case 'exponential':
					concurrency =
						startConcurrency +
						(maxConcurrency - startConcurrency) * Math.pow(progress, 2);
					break;

				case 'step':
					concurrency = progress < 0.5 ? startConcurrency : maxConcurrency;
					break;

				default:
					concurrency = maxConcurrency;
			}

			schedule.push({
				time: (rampDuration * progress),
				concurrency: Math.round(concurrency),
			});
		}

		// Add sustained load period
		if (config.sustainedLoad) {
			const sustainedDuration = config.duration - rampDuration;
			schedule.push({
				time: config.duration,
				concurrency: maxConcurrency,
			});
		}

		return schedule;
	}

	/**
	 * Execute with ramp pattern
	 */
	private async executeWithRamp(
		executor: () => Promise<{ success: boolean; duration: number }>,
		schedule: Array<{ time: number; concurrency: number }>,
		config: LoadTestConfig,
		timeSeries: LoadTestResult['timeSeries'],
	): Promise<void> {
		let currentConcurrency = 0;
		let scheduleIndex = 0;
		const active = new Set<Promise<void>>();
		const sampleInterval = 1000; // 1 second
		let lastSample = Date.now();

		while (Date.now() - this.startTime < config.duration) {
			if (this.abortController?.signal.aborted) {
				break;
			}

			// Update concurrency based on schedule
			const elapsed = Date.now() - this.startTime;
			while (
				scheduleIndex < schedule.length - 1 &&
				elapsed >= schedule[scheduleIndex + 1].time
			) {
				scheduleIndex++;
			}
			const targetConcurrency = schedule[scheduleIndex].concurrency;

			// Adjust active requests to match target concurrency
			while (active.size < targetConcurrency) {
				const promise = this.executeRequest(executor);
				active.add(promise);
				promise.finally(() => active.delete(promise));
			}

			// Sample metrics
			const now = Date.now();
			if (now - lastSample >= sampleInterval) {
				const recentResults = this.results.filter(
					(r) => r.timestamp > now - sampleInterval,
				);
				const avgLatency =
					recentResults.length > 0
						? recentResults.reduce((sum, r) => sum + r.duration, 0) / recentResults.length
						: 0;
				const errorRate =
					recentResults.length > 0
						? recentResults.filter((r) => !r.success).length / recentResults.length
						: 0;
				const throughput = recentResults.length / (sampleInterval / 1000);

				timeSeries.push({
					timestamp: now,
					concurrency: active.size,
					throughput,
					latency: avgLatency,
					errorRate,
				});

				lastSample = now;
			}

			// Small delay to avoid busy waiting
			await this.delay(10);
		}

		// Wait for remaining requests
		await Promise.all(active);
	}

	/**
	 * Execute single request
	 */
	private async executeRequest(
		executor: () => Promise<{ success: boolean; duration: number }>,
	): Promise<void> {
		const timestamp = Date.now();

		try {
			const result = await executor();
			this.results.push({
				success: result.success,
				duration: result.duration,
				timestamp,
			});
		} catch (err) {
			this.results.push({
				success: false,
				duration: Date.now() - timestamp,
				error: err instanceof Error ? err.message : String(err),
				timestamp,
			});
		}
	}

	/**
	 * Calculate metrics from results
	 */
	private calculateMetrics(
		results: ExecutionResult[],
		totalDuration: number,
	): LoadTestResult['metrics'] {
		const successful = results.filter((r) => r.success);
		const failed = results.filter((r) => !r.success);
		const durations = results.map((r) => r.duration).sort((a, b) => a - b);

		// Calculate percentiles
		const p50 = this.percentile(durations, 0.5);
		const p75 = this.percentile(durations, 0.75);
		const p90 = this.percentile(durations, 0.9);
		const p95 = this.percentile(durations, 0.95);
		const p99 = this.percentile(durations, 0.99);

		// Group errors
		const errors: Record<string, number> = {};
		for (const result of failed) {
			const errorType = result.error ?? 'Unknown error';
			errors[errorType] = (errors[errorType] ?? 0) + 1;
		}

		return {
			totalRequests: results.length,
			successfulRequests: successful.length,
			failedRequests: failed.length,
			successRate: results.length > 0 ? successful.length / results.length : 0,
			duration: totalDuration,
			throughput: results.length / (totalDuration / 1000),
			latency: {
				min: durations.length > 0 ? Math.min(...durations) : 0,
				max: durations.length > 0 ? Math.max(...durations) : 0,
				mean:
					durations.length > 0
						? durations.reduce((sum, d) => sum + d, 0) / durations.length
						: 0,
				median: p50,
				p50,
				p75,
				p90,
				p95,
				p99,
			},
			errors,
		};
	}

	/**
	 * Calculate percentile
	 */
	private percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.ceil(sorted.length * p) - 1;
		return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
	}

	/**
	 * Check threshold violations
	 */
	private checkThresholds(
		config: LoadTestConfig,
		metrics: LoadTestResult['metrics'],
		timeSeries: LoadTestResult['timeSeries'],
	): LoadTestResult['thresholdViolations'] {
		const violations: LoadTestResult['thresholdViolations'] = [];
		const thresholds = config.thresholds;

		if (!thresholds) {
			return violations;
		}

		// Check max latency
		if (thresholds.maxLatency && metrics.latency.max > thresholds.maxLatency) {
			violations.push({
				metric: 'maxLatency',
				threshold: thresholds.maxLatency,
				actual: metrics.latency.max,
				timestamp: Date.now(),
			});
		}

		// Check min success rate
		if (thresholds.minSuccessRate && metrics.successRate < thresholds.minSuccessRate) {
			violations.push({
				metric: 'minSuccessRate',
				threshold: thresholds.minSuccessRate,
				actual: metrics.successRate,
				timestamp: Date.now(),
			});
		}

		// Check max error rate
		const errorRate = 1 - metrics.successRate;
		if (thresholds.maxErrorRate && errorRate > thresholds.maxErrorRate) {
			violations.push({
				metric: 'maxErrorRate',
				threshold: thresholds.maxErrorRate,
				actual: errorRate,
				timestamp: Date.now(),
			});
		}

		return violations;
	}

	/**
	 * Stop running load test
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.running = false;
	}

	/**
	 * Check if load test is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Predefined Load Test Scenarios
 */
export class LoadTestScenarios {
	/**
	 * Spike test - sudden increase in load
	 */
	static spike(workflowId: string, peakConcurrency: number = 100): LoadTestConfig {
		return {
			workflowId,
			duration: 60000, // 1 minute
			concurrency: {
				start: 1,
				max: peakConcurrency,
				rampUp: 5000, // 5 seconds
			},
			rampPattern: 'step',
			sustainedLoad: false,
		};
	}

	/**
	 * Stress test - gradually increasing load
	 */
	static stress(workflowId: string, maxConcurrency: number = 200): LoadTestConfig {
		return {
			workflowId,
			duration: 300000, // 5 minutes
			concurrency: {
				start: 1,
				max: maxConcurrency,
				rampUp: 240000, // 4 minutes
			},
			rampPattern: 'linear',
			sustainedLoad: true,
		};
	}

	/**
	 * Soak test - sustained load over time
	 */
	static soak(workflowId: string, concurrency: number = 50): LoadTestConfig {
		return {
			workflowId,
			duration: 3600000, // 1 hour
			concurrency: {
				start: concurrency,
				max: concurrency,
				rampUp: 60000, // 1 minute
			},
			rampPattern: 'linear',
			sustainedLoad: true,
		};
	}

	/**
	 * Smoke test - minimal load
	 */
	static smoke(workflowId: string): LoadTestConfig {
		return {
			workflowId,
			duration: 60000, // 1 minute
			concurrency: {
				start: 1,
				max: 5,
				rampUp: 10000, // 10 seconds
			},
			rampPattern: 'linear',
			sustainedLoad: false,
		};
	}

	/**
	 * Breakpoint test - find breaking point
	 */
	static breakpoint(workflowId: string): LoadTestConfig {
		return {
			workflowId,
			duration: 600000, // 10 minutes
			concurrency: {
				start: 1,
				max: 1000,
				rampUp: 540000, // 9 minutes
			},
			rampPattern: 'exponential',
			sustainedLoad: false,
			thresholds: {
				maxLatency: 5000,
				minSuccessRate: 0.95,
			},
		};
	}
}
