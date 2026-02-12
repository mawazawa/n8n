import type { ChaosConfig } from './types';
import { ChaosConfigSchema } from './types';

/**
 * Chaos Injector
 * Injects various types of failures for chaos engineering
 */

export type FailureType =
	| 'network_failure'
	| 'timeout'
	| 'crash'
	| 'data_corruption'
	| 'resource_exhaustion'
	| 'slow_response'
	| 'dns_failure'
	| 'certificate_error';

export interface ChaosResult {
	injected: boolean;
	type?: FailureType;
	message?: string;
	delay?: number;
}

export class ChaosInjector {
	private config: ChaosConfig;
	private random: () => number;
	private injectionCount: Map<FailureType, number> = new Map();

	constructor(config: ChaosConfig) {
		this.config = ChaosConfigSchema.parse(config);
		this.random = this.createRandom(config.randomSeed);
	}

	/**
	 * Check if failure should be injected
	 */
	shouldInject(nodeId?: string): ChaosResult {
		if (!this.config.enabled) {
			return { injected: false };
		}

		// Check each configured failure type
		for (const failure of this.config.failures) {
			// Check if this node is targeted
			if (failure.targets && nodeId && !failure.targets.includes(nodeId)) {
				continue;
			}

			// Check probability
			if (this.random() < failure.probability) {
				this.injectionCount.set(failure.type, (this.injectionCount.get(failure.type) ?? 0) + 1);

				return {
					injected: true,
					type: failure.type,
					message: this.getFailureMessage(failure.type),
					delay: failure.duration,
				};
			}
		}

		return { injected: false };
	}

	/**
	 * Inject network failure
	 */
	async injectNetworkFailure(): Promise<void> {
		throw new Error('Network connection failed');
	}

	/**
	 * Inject timeout
	 */
	async injectTimeout(duration?: number): Promise<void> {
		const delay = duration ?? 30000;
		await new Promise((resolve) => setTimeout(resolve, delay));
		throw new Error(`Operation timed out after ${delay}ms`);
	}

	/**
	 * Inject crash
	 */
	injectCrash(): never {
		throw new Error('Simulated process crash');
	}

	/**
	 * Inject data corruption
	 */
	corruptData<T>(data: T): T {
		if (typeof data === 'string') {
			// Corrupt random characters
			const chars = data.split('');
			const index = Math.floor(this.random() * chars.length);
			chars[index] = String.fromCharCode(Math.floor(this.random() * 128));
			return chars.join('') as T;
		}

		if (typeof data === 'number') {
			// Add random noise
			return ((data as number) * (1 + (this.random() - 0.5) * 0.1)) as T;
		}

		if (Array.isArray(data)) {
			// Remove random element
			const corrupted = [...data];
			const index = Math.floor(this.random() * corrupted.length);
			corrupted.splice(index, 1);
			return corrupted as T;
		}

		if (typeof data === 'object' && data !== null) {
			// Corrupt random field
			const keys = Object.keys(data);
			if (keys.length > 0) {
				const corrupted = { ...data };
				const key = keys[Math.floor(this.random() * keys.length)];
				(corrupted as Record<string, unknown>)[key] = null;
				return corrupted;
			}
		}

		return data;
	}

	/**
	 * Inject resource exhaustion
	 */
	async injectResourceExhaustion(type: 'memory' | 'cpu' | 'disk' = 'memory'): Promise<void> {
		throw new Error(`${type} resources exhausted`);
	}

	/**
	 * Inject slow response
	 */
	async injectSlowResponse(baseDelay: number = 5000): Promise<void> {
		const delay = baseDelay + this.random() * 5000;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	/**
	 * Inject DNS failure
	 */
	async injectDnsFailure(): Promise<void> {
		throw new Error('DNS resolution failed');
	}

	/**
	 * Inject certificate error
	 */
	async injectCertificateError(): Promise<void> {
		throw new Error('SSL certificate verification failed');
	}

	/**
	 * Execute failure based on type
	 */
	async executeFailure(type: FailureType, duration?: number): Promise<void> {
		switch (type) {
			case 'network_failure':
				await this.injectNetworkFailure();
				break;
			case 'timeout':
				await this.injectTimeout(duration);
				break;
			case 'crash':
				this.injectCrash();
				break;
			case 'resource_exhaustion':
				await this.injectResourceExhaustion();
				break;
			case 'slow_response':
				await this.injectSlowResponse(duration);
				break;
			case 'dns_failure':
				await this.injectDnsFailure();
				break;
			case 'certificate_error':
				await this.injectCertificateError();
				break;
			default:
				throw new Error(`Unknown failure type: ${type}`);
		}
	}

	/**
	 * Get failure message
	 */
	private getFailureMessage(type: FailureType): string {
		const messages: Record<FailureType, string> = {
			network_failure: 'Network connection failed',
			timeout: 'Operation timed out',
			crash: 'Process crashed unexpectedly',
			data_corruption: 'Data was corrupted',
			resource_exhaustion: 'System resources exhausted',
			slow_response: 'Response time exceeded threshold',
			dns_failure: 'DNS resolution failed',
			certificate_error: 'SSL certificate error',
		};

		return messages[type];
	}

	/**
	 * Get injection statistics
	 */
	getStats(): {
		totalInjections: number;
		byType: Record<FailureType, number>;
	} {
		const totalInjections = Array.from(this.injectionCount.values()).reduce(
			(sum, count) => sum + count,
			0,
		);

		const byType = Object.fromEntries(this.injectionCount.entries()) as Record<FailureType, number>;

		return { totalInjections, byType };
	}

	/**
	 * Reset injection counters
	 */
	reset(): void {
		this.injectionCount.clear();
	}

	/**
	 * Create seeded random function
	 */
	private createRandom(seed?: number): () => number {
		let s = seed ?? Date.now();
		return () => {
			s = (s * 9301 + 49297) % 233280;
			return s / 233280;
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ChaosConfig>): void {
		this.config = ChaosConfigSchema.parse({
			...this.config,
			...config,
		});
	}

	/**
	 * Enable chaos
	 */
	enable(): void {
		this.config.enabled = true;
	}

	/**
	 * Disable chaos
	 */
	disable(): void {
		this.config.enabled = false;
	}

	/**
	 * Check if chaos is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}
}

/**
 * Chaos Scenarios - predefined chaos patterns
 */
export class ChaosScenarios {
	/**
	 * Intermittent network failures
	 */
	static intermittentNetwork(): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{
					type: 'network_failure',
					probability: 0.1,
				},
			],
		};
	}

	/**
	 * Random timeouts
	 */
	static randomTimeouts(): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{
					type: 'timeout',
					probability: 0.05,
					duration: 10000,
				},
			],
		};
	}

	/**
	 * Slow responses
	 */
	static slowResponses(): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{
					type: 'slow_response',
					probability: 0.2,
					duration: 5000,
				},
			],
		};
	}

	/**
	 * Data corruption
	 */
	static dataCorruption(): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{
					type: 'data_corruption',
					probability: 0.05,
				},
			],
		};
	}

	/**
	 * Complete chaos - all failure types
	 */
	static completeChaos(): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{ type: 'network_failure', probability: 0.05 },
				{ type: 'timeout', probability: 0.03 },
				{ type: 'slow_response', probability: 0.1 },
				{ type: 'data_corruption', probability: 0.02 },
				{ type: 'resource_exhaustion', probability: 0.01 },
			],
		};
	}

	/**
	 * Targeted chaos - specific nodes
	 */
	static targeted(nodeIds: string[], failureType: FailureType, probability: number): ChaosConfig {
		return {
			enabled: true,
			failures: [
				{
					type: failureType,
					probability,
					targets: nodeIds,
				},
			],
		};
	}
}
