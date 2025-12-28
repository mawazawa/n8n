import crypto from 'crypto';
import type { BackendConfig, LoadBalanceStrategy, BackendHealth } from './types.js';

/**
 * Load balancer with multiple strategies
 * Supports round-robin, least-connections, random, weighted, and IP hash
 */
export class LoadBalancer {
	private strategy: LoadBalanceStrategy;
	private backends: BackendConfig[] = [];
	private healthStatus: Map<string, BackendHealth> = new Map();
	private connections: Map<string, number> = new Map();
	private stickySessions: Map<string, string> = new Map();
	private roundRobinIndex = 0;

	constructor(strategy: LoadBalanceStrategy = 'round-robin') {
		this.strategy = strategy;
	}

	/**
	 * Add backend to pool
	 */
	addBackend(backend: BackendConfig): void {
		this.backends.push(backend);
		this.connections.set(backend.id, 0);
		this.healthStatus.set(backend.id, {
			backend,
			status: 'unknown',
			lastCheck: new Date(),
			consecutiveFailures: 0,
			consecutiveSuccesses: 0,
		});
	}

	/**
	 * Remove backend from pool
	 */
	removeBackend(backendId: string): void {
		this.backends = this.backends.filter((b) => b.id !== backendId);
		this.connections.delete(backendId);
		this.healthStatus.delete(backendId);
	}

	/**
	 * Select a backend based on the configured strategy
	 */
	selectBackend(sessionKey?: string, ipAddress?: string): BackendConfig | null {
		// Filter to only healthy backends
		const healthyBackends = this.getHealthyBackends();

		if (healthyBackends.length === 0) {
			// Fallback to all backends if none are healthy
			if (this.backends.length === 0) {
				return null;
			}
			return this.backends[0] ?? null;
		}

		// Check sticky session first
		if (sessionKey) {
			const stickyBackendId = this.stickySessions.get(sessionKey);
			if (stickyBackendId) {
				const backend = healthyBackends.find((b) => b.id === stickyBackendId);
				if (backend) {
					return backend;
				}
			}
		}

		let selected: BackendConfig | null = null;

		switch (this.strategy) {
			case 'round-robin':
				selected = this.selectRoundRobin(healthyBackends);
				break;
			case 'least-connections':
				selected = this.selectLeastConnections(healthyBackends);
				break;
			case 'random':
				selected = this.selectRandom(healthyBackends);
				break;
			case 'weighted':
				selected = this.selectWeighted(healthyBackends);
				break;
			case 'ip-hash':
				if (ipAddress) {
					selected = this.selectIpHash(healthyBackends, ipAddress);
				} else {
					// Fallback to round-robin if no IP
					selected = this.selectRoundRobin(healthyBackends);
				}
				break;
		}

		// Store sticky session if configured
		if (selected && sessionKey) {
			this.stickySessions.set(sessionKey, selected.id);
		}

		return selected;
	}

	/**
	 * Round-robin selection
	 */
	private selectRoundRobin(backends: BackendConfig[]): BackendConfig | null {
		if (backends.length === 0) return null;

		const selected = backends[this.roundRobinIndex % backends.length];
		this.roundRobinIndex++;

		return selected ?? null;
	}

	/**
	 * Least connections selection
	 */
	private selectLeastConnections(backends: BackendConfig[]): BackendConfig | null {
		if (backends.length === 0) return null;

		let minConnections = Infinity;
		let selected: BackendConfig | null = null;

		for (const backend of backends) {
			const connections = this.connections.get(backend.id) ?? 0;

			// Consider max connections limit
			if (backend.maxConnections && connections >= backend.maxConnections) {
				continue;
			}

			if (connections < minConnections) {
				minConnections = connections;
				selected = backend;
			}
		}

		return selected ?? backends[0] ?? null;
	}

	/**
	 * Random selection
	 */
	private selectRandom(backends: BackendConfig[]): BackendConfig | null {
		if (backends.length === 0) return null;

		const index = Math.floor(Math.random() * backends.length);
		return backends[index] ?? null;
	}

	/**
	 * Weighted selection
	 */
	private selectWeighted(backends: BackendConfig[]): BackendConfig | null {
		if (backends.length === 0) return null;

		// Calculate total weight
		const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);

		// Generate random value
		let random = Math.random() * totalWeight;

		// Select backend based on weight
		for (const backend of backends) {
			random -= backend.weight;
			if (random <= 0) {
				return backend;
			}
		}

		return backends[0] ?? null;
	}

	/**
	 * IP hash selection (consistent hashing)
	 */
	private selectIpHash(backends: BackendConfig[], ipAddress: string): BackendConfig | null {
		if (backends.length === 0) return null;

		// Hash the IP address
		const hash = crypto.createHash('md5').update(ipAddress).digest('hex');
		const hashValue = parseInt(hash.slice(0, 8), 16);

		// Select backend based on hash
		const index = hashValue % backends.length;
		return backends[index] ?? null;
	}

	/**
	 * Get healthy backends
	 */
	private getHealthyBackends(): BackendConfig[] {
		return this.backends.filter((backend) => {
			const health = this.healthStatus.get(backend.id);
			return health && (health.status === 'healthy' || health.status === 'unknown');
		});
	}

	/**
	 * Increment connection count
	 */
	incrementConnections(backendId: string): void {
		const current = this.connections.get(backendId) ?? 0;
		this.connections.set(backendId, current + 1);
	}

	/**
	 * Decrement connection count
	 */
	decrementConnections(backendId: string): void {
		const current = this.connections.get(backendId) ?? 0;
		this.connections.set(backendId, Math.max(0, current - 1));
	}

	/**
	 * Update backend health
	 */
	updateHealth(backendId: string, health: Partial<BackendHealth>): void {
		const current = this.healthStatus.get(backendId);
		if (current) {
			this.healthStatus.set(backendId, { ...current, ...health });
		}
	}

	/**
	 * Get backend health
	 */
	getHealth(backendId: string): BackendHealth | null {
		return this.healthStatus.get(backendId) ?? null;
	}

	/**
	 * Get all backend health
	 */
	getAllHealth(): Map<string, BackendHealth> {
		return new Map(this.healthStatus);
	}

	/**
	 * Get connection count
	 */
	getConnections(backendId: string): number {
		return this.connections.get(backendId) ?? 0;
	}

	/**
	 * Clear sticky session
	 */
	clearStickySession(sessionKey: string): void {
		this.stickySessions.delete(sessionKey);
	}

	/**
	 * Clear all sticky sessions
	 */
	clearAllStickySessions(): void {
		this.stickySessions.clear();
	}

	/**
	 * Get backend count
	 */
	getBackendCount(): number {
		return this.backends.length;
	}

	/**
	 * Get all backends
	 */
	getBackends(): BackendConfig[] {
		return [...this.backends];
	}

	/**
	 * Set strategy
	 */
	setStrategy(strategy: LoadBalanceStrategy): void {
		this.strategy = strategy;
	}

	/**
	 * Get strategy
	 */
	getStrategy(): LoadBalanceStrategy {
		return this.strategy;
	}
}
