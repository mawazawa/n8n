import { VirtualClock } from './clock';
import { DataGenerator } from './data-generator';
import type {
	SimulationConfig,
	SimulationResult,
	ExecutionMetrics,
	BatchResult,
} from './types';
import { SimulationConfigSchema, SimulationResultSchema } from './types';

/**
 * Core Simulation Engine
 * Runs workflow simulations with virtual time and mock data
 */

export interface WorkflowDefinition {
	id: string;
	name: string;
	nodes: Array<{
		id: string;
		type: string;
		parameters: Record<string, unknown>;
	}>;
	connections: Record<string, unknown>;
}

export interface ExecutionContext {
	workflowId: string;
	executionId: string;
	iteration: number;
	data: Record<string, unknown>;
	clock: VirtualClock;
	dataGenerator: DataGenerator;
}

export class SimulationEngine {
	private clock: VirtualClock;
	private dataGenerator: DataGenerator;
	private running: boolean = false;
	private abortController: AbortController | null = null;

	constructor(seed?: number) {
		this.clock = new VirtualClock();
		this.dataGenerator = new DataGenerator(seed);
	}

	/**
	 * Run simulation for a single workflow
	 */
	async run(workflow: WorkflowDefinition, config: SimulationConfig): Promise<SimulationResult> {
		// Validate config
		const validatedConfig = SimulationConfigSchema.parse(config);

		// Reset for new simulation
		this.reset(validatedConfig.seed);
		this.clock.setSpeed(validatedConfig.speed);

		const simulationId = this.generateId();
		const startedAt = new Date().toISOString();
		const startTime = Date.now();

		const executions: SimulationResult['executions'] = [];
		const errors: SimulationResult['errors'] = [];

		this.running = true;
		this.abortController = new AbortController();

		try {
			if (validatedConfig.parallel) {
				// Parallel execution with concurrency limit
				await this.runParallel(
					workflow,
					validatedConfig,
					executions,
					errors,
					this.abortController.signal,
				);
			} else {
				// Sequential execution
				await this.runSequential(
					workflow,
					validatedConfig,
					executions,
					errors,
					this.abortController.signal,
				);
			}
		} finally {
			this.running = false;
			this.abortController = null;
		}

		const completedAt = new Date().toISOString();
		const duration = Date.now() - startTime;

		// Calculate aggregate metrics
		const aggregateMetrics = this.calculateAggregateMetrics(executions);

		// Group errors by type
		const groupedErrors = this.groupErrors(executions);

		const result: SimulationResult = {
			id: simulationId,
			workflowId: workflow.id,
			config: validatedConfig,
			executions,
			aggregateMetrics,
			errors: groupedErrors,
			startedAt,
			completedAt,
			duration,
		};

		return SimulationResultSchema.parse(result);
	}

	/**
	 * Run simulation for multiple workflows
	 */
	async runBatch(
		workflows: WorkflowDefinition[],
		config: SimulationConfig,
	): Promise<BatchResult> {
		const batchId = this.generateId();
		const startedAt = new Date().toISOString();
		const startTime = Date.now();

		const results: SimulationResult[] = [];

		for (const workflow of workflows) {
			const result = await this.run(workflow, config);
			results.push(result);

			if (this.abortController?.signal.aborted) {
				break;
			}
		}

		const completedAt = new Date().toISOString();
		const duration = Date.now() - startTime;

		// Calculate batch aggregate metrics
		const aggregateMetrics = {
			totalExecutions: results.reduce((sum, r) => sum + r.aggregateMetrics.totalExecutions, 0),
			totalWorkflows: workflows.length,
			averageSuccessRate:
				results.reduce((sum, r) => sum + r.aggregateMetrics.successRate, 0) / results.length,
			averageDuration:
				results.reduce((sum, r) => sum + r.aggregateMetrics.averageDuration, 0) / results.length,
			totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
		};

		return {
			id: batchId,
			results,
			aggregateMetrics,
			duration,
			startedAt,
			completedAt,
		};
	}

	/**
	 * Execute workflow iterations in parallel
	 */
	private async runParallel(
		workflow: WorkflowDefinition,
		config: SimulationConfig,
		executions: SimulationResult['executions'],
		errors: SimulationResult['errors'],
		signal: AbortSignal,
	): Promise<void> {
		const concurrency = config.maxConcurrency;
		const iterations = config.iterations;

		const queue: number[] = Array.from({ length: iterations }, (_, i) => i);
		const active: Set<Promise<void>> = new Set();

		while (queue.length > 0 || active.size > 0) {
			if (signal.aborted) {
				break;
			}

			// Fill up to concurrency limit
			while (queue.length > 0 && active.size < concurrency) {
				const iteration = queue.shift()!;
				const promise = this.executeIteration(workflow, iteration, config).then((result) => {
					executions.push(result);
					active.delete(promise);
				});
				active.add(promise);
			}

			// Wait for at least one to complete
			if (active.size > 0) {
				await Promise.race(active);
			}
		}

		// Wait for all remaining
		await Promise.all(active);
	}

	/**
	 * Execute workflow iterations sequentially
	 */
	private async runSequential(
		workflow: WorkflowDefinition,
		config: SimulationConfig,
		executions: SimulationResult['executions'],
		errors: SimulationResult['errors'],
		signal: AbortSignal,
	): Promise<void> {
		for (let i = 0; i < config.iterations; i++) {
			if (signal.aborted) {
				break;
			}

			const result = await this.executeIteration(workflow, i, config);
			executions.push(result);

			if (config.stopOnError && result.error) {
				break;
			}
		}
	}

	/**
	 * Execute a single workflow iteration
	 */
	private async executeIteration(
		workflow: WorkflowDefinition,
		iteration: number,
		config: SimulationConfig,
	): Promise<SimulationResult['executions'][0]> {
		const executionId = this.generateId();
		const startTime = this.clock.now();

		const context: ExecutionContext = {
			workflowId: workflow.id,
			executionId,
			iteration,
			data: {},
			clock: this.clock,
			dataGenerator: this.dataGenerator,
		};

		let success = true;
		let error: { message: string; type: string; stack?: string } | undefined;
		let nodeExecutions = 0;
		let dataProcessed = 0;

		try {
			// Simulate workflow execution
			for (const node of workflow.nodes) {
				// Generate mock data if enabled
				if (config.mockData) {
					context.data[node.id] = this.dataGenerator.generateWorkflowData(node.id, 'output');
					dataProcessed += JSON.stringify(context.data[node.id]).length;
				}

				// Simulate node execution time (10-100ms per node)
				const nodeDelay = this.dataGenerator.generateNumber({
					type: 'number',
					min: 10,
					max: 100,
				});
				await this.delay(nodeDelay / config.speed);

				nodeExecutions++;

				// Check timeout
				const elapsed = this.clock.now() - startTime;
				if (elapsed > config.timeout) {
					throw new Error(`Execution timeout after ${elapsed}ms`);
				}
			}
		} catch (err) {
			success = false;
			error = {
				message: err instanceof Error ? err.message : String(err),
				type: err instanceof Error ? err.constructor.name : 'Error',
				stack: err instanceof Error ? err.stack : undefined,
			};
		}

		const endTime = this.clock.now();

		const metrics: ExecutionMetrics = {
			duration: endTime - startTime,
			startTime,
			endTime,
			success,
			nodeExecutions,
			dataProcessed,
			errorRate: success ? 0 : 1,
		};

		return {
			id: executionId,
			iteration,
			metrics,
			data: config.mockData ? context.data : undefined,
			error,
		};
	}

	/**
	 * Calculate aggregate metrics from executions
	 */
	private calculateAggregateMetrics(
		executions: SimulationResult['executions'],
	): SimulationResult['aggregateMetrics'] {
		const durations = executions.map((e) => e.metrics.duration);
		const successful = executions.filter((e) => e.metrics.success);

		const sorted = [...durations].sort((a, b) => a - b);
		const p50 = this.percentile(sorted, 0.5);
		const p95 = this.percentile(sorted, 0.95);
		const p99 = this.percentile(sorted, 0.99);

		return {
			totalExecutions: executions.length,
			successRate: successful.length / executions.length,
			averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
			p50Duration: p50,
			p95Duration: p95,
			p99Duration: p99,
			minDuration: Math.min(...durations),
			maxDuration: Math.max(...durations),
			totalDataProcessed: executions.reduce((sum, e) => sum + e.metrics.dataProcessed, 0),
		};
	}

	/**
	 * Group errors by type and count
	 */
	private groupErrors(executions: SimulationResult['executions']): SimulationResult['errors'] {
		const errorMap = new Map<string, { count: number; iterations: number[] }>();

		for (const exec of executions) {
			if (exec.error) {
				const key = `${exec.error.type}:${exec.error.message}`;
				const existing = errorMap.get(key) ?? { count: 0, iterations: [] };
				existing.count++;
				existing.iterations.push(exec.iteration);
				errorMap.set(key, existing);
			}
		}

		return Array.from(errorMap.entries()).map(([key, value]) => {
			const [type, message] = key.split(':');
			return {
				type,
				message,
				count: value.count,
				iteration: value.iterations[0], // First occurrence
			};
		});
	}

	/**
	 * Calculate percentile from sorted array
	 */
	private percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.ceil(sorted.length * p) - 1;
		return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
	}

	/**
	 * Stop running simulation
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.running = false;
	}

	/**
	 * Check if simulation is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Reset engine state
	 */
	private reset(seed?: number): void {
		this.clock.reset();
		if (seed !== undefined) {
			this.dataGenerator.setSeed(seed);
		}
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get current clock
	 */
	getClock(): VirtualClock {
		return this.clock;
	}

	/**
	 * Get data generator
	 */
	getDataGenerator(): DataGenerator {
		return this.dataGenerator;
	}
}
