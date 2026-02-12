import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';
import type {
	PluginExecutionContext,
	PluginExecutionResult,
	ResourceLimits,
	Plugin,
} from './types';

/**
 * Execution timeout error
 */
export class ExecutionTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Plugin execution exceeded timeout of ${timeoutMs}ms`);
		this.name = 'ExecutionTimeoutError';
	}
}

/**
 * Memory limit exceeded error
 */
export class MemoryLimitError extends Error {
	constructor(limitMB: number, usedMB: number) {
		super(`Plugin exceeded memory limit of ${limitMB}MB (used: ${usedMB}MB)`);
		this.name = 'MemoryLimitError';
	}
}

/**
 * CPU time limit exceeded error
 */
export class CpuTimeLimitError extends Error {
	constructor(limitMs: number, usedMs: number) {
		super(`Plugin exceeded CPU time limit of ${limitMs}ms (used: ${usedMs}ms)`);
		this.name = 'CpuTimeLimitError';
	}
}

/**
 * Secure sandbox for plugin execution
 */
export class PluginSandbox {
	private workers = new Map<string, Worker>();
	private executionMetrics = new Map<
		string,
		{
			startTime: number;
			memoryUsed: number;
			cpuTime: number;
		}
	>();

	/**
	 * Execute plugin code in a sandboxed environment
	 */
	async execute<T = unknown>(
		plugin: Plugin,
		context: PluginExecutionContext,
		code: string,
	): Promise<PluginExecutionResult<T>> {
		const startTime = performance.now();
		const executionId = `${plugin.manifest.id}-${Date.now()}`;

		// Get resource limits
		const limits = this.getResourceLimits(plugin);

		try {
			// Create sandboxed execution context
			const sandboxContext = this.createSandboxContext(context, limits);

			// Execute in worker thread for isolation
			const result = await this.executeInWorker<T>(
				executionId,
				code,
				sandboxContext,
				limits.maxExecutionTimeMs,
			);

			// Calculate metrics
			const executionTime = performance.now() - startTime;
			const metrics = this.executionMetrics.get(executionId);

			// Cleanup
			this.cleanup(executionId);

			return {
				success: true,
				data: result,
				executionTime,
				resourceUsage: {
					memoryUsedMB: metrics?.memoryUsed || 0,
					cpuTimeMs: metrics?.cpuTime || 0,
				},
			};
		} catch (error) {
			const executionTime = performance.now() - startTime;
			const metrics = this.executionMetrics.get(executionId);

			// Cleanup
			this.cleanup(executionId);

			const message = error instanceof Error ? error.message : String(error);

			return {
				success: false,
				error: message,
				executionTime,
				resourceUsage: {
					memoryUsedMB: metrics?.memoryUsed || 0,
					cpuTimeMs: metrics?.cpuTime || 0,
				},
			};
		}
	}

	/**
	 * Execute code in a worker thread
	 */
	private async executeInWorker<T>(
		executionId: string,
		code: string,
		context: Record<string, unknown>,
		timeoutMs: number,
	): Promise<T> {
		return new Promise((resolve, reject) => {
			// Create worker code
			const workerCode = `
				const { parentPort, workerData } = require('worker_threads');
				const vm = require('vm');

				const { code, context } = workerData;

				try {
					// Create sandbox
					const sandbox = vm.createContext(context);

					// Execute code
					const result = vm.runInContext(code, sandbox, {
						timeout: ${timeoutMs},
						displayErrors: true,
					});

					parentPort.postMessage({ success: true, result });
				} catch (error) {
					parentPort.postMessage({
						success: false,
						error: error.message || String(error)
					});
				}
			`;

			// Create worker
			const worker = new Worker(workerCode, {
				eval: true,
				workerData: { code, context },
				resourceLimits: {
					maxOldGenerationSizeMb: context.resourceLimits?.maxMemoryMB || 100,
					maxYoungGenerationSizeMb: Math.floor((context.resourceLimits?.maxMemoryMB || 100) / 2),
				},
			});

			this.workers.set(executionId, worker);

			// Set timeout
			const timeout = setTimeout(() => {
				worker.terminate();
				reject(new ExecutionTimeoutError(timeoutMs));
			}, timeoutMs);

			// Track metrics
			const startMemory = process.memoryUsage().heapUsed;
			const startTime = performance.now();

			this.executionMetrics.set(executionId, {
				startTime,
				memoryUsed: 0,
				cpuTime: 0,
			});

			// Monitor resource usage
			const monitorInterval = setInterval(() => {
				const metrics = this.executionMetrics.get(executionId);
				if (metrics) {
					const currentMemory = process.memoryUsage().heapUsed;
					const memoryUsedMB = (currentMemory - startMemory) / 1024 / 1024;
					const cpuTimeMs = performance.now() - startTime;

					metrics.memoryUsed = memoryUsedMB;
					metrics.cpuTime = cpuTimeMs;

					// Check limits
					const limits = context.resourceLimits as ResourceLimits;
					if (memoryUsedMB > limits.maxMemoryMB) {
						worker.terminate();
						reject(new MemoryLimitError(limits.maxMemoryMB, memoryUsedMB));
					}

					if (cpuTimeMs > limits.maxCpuTimeMs) {
						worker.terminate();
						reject(new CpuTimeLimitError(limits.maxCpuTimeMs, cpuTimeMs));
					}
				}
			}, 100);

			// Handle worker messages
			worker.on('message', (message: { success: boolean; result?: T; error?: string }) => {
				clearTimeout(timeout);
				clearInterval(monitorInterval);

				if (message.success) {
					resolve(message.result as T);
				} else {
					reject(new Error(message.error || 'Plugin execution failed'));
				}
			});

			// Handle worker errors
			worker.on('error', (error) => {
				clearTimeout(timeout);
				clearInterval(monitorInterval);
				reject(error);
			});

			// Handle worker exit
			worker.on('exit', (code) => {
				clearTimeout(timeout);
				clearInterval(monitorInterval);

				if (code !== 0) {
					reject(new Error(`Worker exited with code ${code}`));
				}
			});
		});
	}

	/**
	 * Create sandboxed execution context
	 */
	private createSandboxContext(
		context: PluginExecutionContext,
		limits: ResourceLimits,
	): Record<string, unknown> {
		// Safe globals to expose
		const safeGlobals = {
			console: {
				log: (...args: unknown[]) => console.log(`[Plugin:${context.pluginId}]`, ...args),
				error: (...args: unknown[]) => console.error(`[Plugin:${context.pluginId}]`, ...args),
				warn: (...args: unknown[]) => console.warn(`[Plugin:${context.pluginId}]`, ...args),
				info: (...args: unknown[]) => console.info(`[Plugin:${context.pluginId}]`, ...args),
			},
			setTimeout,
			setInterval,
			clearTimeout,
			clearInterval,
			Promise,
			JSON,
			Math,
			Date,
			Array,
			Object,
			String,
			Number,
			Boolean,
			RegExp,
			Error,
			Map,
			Set,
			WeakMap,
			WeakSet,
		};

		return {
			...safeGlobals,
			pluginContext: {
				pluginId: context.pluginId,
				userId: context.userId,
				workflowId: context.workflowId,
				executionId: context.executionId,
				data: context.data,
				permissions: Array.from(context.permissions),
			},
			resourceLimits: limits,
		};
	}

	/**
	 * Get resource limits for plugin
	 */
	private getResourceLimits(plugin: Plugin): ResourceLimits {
		const manifestLimits = plugin.manifest.resourceLimits;
		const configOverrides = plugin.config.overrideLimits;

		return {
			maxMemoryMB: configOverrides?.maxMemoryMB || manifestLimits?.maxMemoryMB || 100,
			maxCpuTimeMs: configOverrides?.maxCpuTimeMs || manifestLimits?.maxCpuTimeMs || 5000,
			maxExecutionTimeMs:
				configOverrides?.maxExecutionTimeMs || manifestLimits?.maxExecutionTimeMs || 30000,
			maxStorageMB: configOverrides?.maxStorageMB || manifestLimits?.maxStorageMB || 50,
			maxNetworkRequests:
				configOverrides?.maxNetworkRequests || manifestLimits?.maxNetworkRequests || 100,
		};
	}

	/**
	 * Cleanup execution resources
	 */
	private cleanup(executionId: string): void {
		const worker = this.workers.get(executionId);
		if (worker) {
			worker.terminate();
			this.workers.delete(executionId);
		}

		this.executionMetrics.delete(executionId);
	}

	/**
	 * Terminate all workers
	 */
	async terminateAll(): Promise<void> {
		const terminatePromises = Array.from(this.workers.values()).map((worker) =>
			worker.terminate(),
		);

		await Promise.all(terminatePromises);

		this.workers.clear();
		this.executionMetrics.clear();
	}

	/**
	 * Get active execution count
	 */
	getActiveExecutions(): number {
		return this.workers.size;
	}

	/**
	 * Get execution metrics
	 */
	getMetrics(executionId: string): { memoryUsedMB: number; cpuTimeMs: number } | undefined {
		const metrics = this.executionMetrics.get(executionId);
		if (!metrics) {
			return undefined;
		}

		return {
			memoryUsedMB: metrics.memoryUsed,
			cpuTimeMs: metrics.cpuTime,
		};
	}
}

/**
 * VM-based sandbox (alternative to worker threads)
 */
export class VMSandbox {
	/**
	 * Execute code in VM context
	 */
	async execute<T = unknown>(
		plugin: Plugin,
		context: PluginExecutionContext,
		code: string,
	): Promise<PluginExecutionResult<T>> {
		const { VM } = await import('vm2');
		const startTime = performance.now();

		try {
			const limits = this.getResourceLimits(plugin);

			const vm = new VM({
				timeout: limits.maxExecutionTimeMs,
				sandbox: {
					pluginContext: {
						pluginId: context.pluginId,
						userId: context.userId,
						workflowId: context.workflowId,
						executionId: context.executionId,
						data: context.data,
						permissions: Array.from(context.permissions),
					},
				},
			});

			const result = vm.run(code) as T;
			const executionTime = performance.now() - startTime;

			return {
				success: true,
				data: result,
				executionTime,
				resourceUsage: {
					memoryUsedMB: 0, // VM2 doesn't provide memory metrics
					cpuTimeMs: executionTime,
				},
			};
		} catch (error) {
			const executionTime = performance.now() - startTime;
			const message = error instanceof Error ? error.message : String(error);

			return {
				success: false,
				error: message,
				executionTime,
				resourceUsage: {
					memoryUsedMB: 0,
					cpuTimeMs: executionTime,
				},
			};
		}
	}

	private getResourceLimits(plugin: Plugin): ResourceLimits {
		const manifestLimits = plugin.manifest.resourceLimits;
		const configOverrides = plugin.config.overrideLimits;

		return {
			maxMemoryMB: configOverrides?.maxMemoryMB || manifestLimits?.maxMemoryMB || 100,
			maxCpuTimeMs: configOverrides?.maxCpuTimeMs || manifestLimits?.maxCpuTimeMs || 5000,
			maxExecutionTimeMs:
				configOverrides?.maxExecutionTimeMs || manifestLimits?.maxExecutionTimeMs || 30000,
			maxStorageMB: configOverrides?.maxStorageMB || manifestLimits?.maxStorageMB || 50,
			maxNetworkRequests:
				configOverrides?.maxNetworkRequests || manifestLimits?.maxNetworkRequests || 100,
		};
	}
}
