import type { BackendConfig, BackendHealth, HealthStatus } from './types.js';

/**
 * Health checker for backend services
 * Supports active probing and passive health detection
 */
export class HealthChecker {
	private healthStatus: Map<string, BackendHealth> = new Map();
	private intervals: Map<string, NodeJS.Timeout> = new Map();
	private activeChecks = true;

	constructor(activeChecks = true) {
		this.activeChecks = activeChecks;
	}

	/**
	 * Configure health check for a backend
	 */
	configure(backend: BackendConfig): void {
		// Initialize health status
		this.healthStatus.set(backend.id, {
			backend,
			status: 'unknown',
			lastCheck: new Date(),
			consecutiveFailures: 0,
			consecutiveSuccesses: 0,
		});

		// Start active health checking if enabled
		if (this.activeChecks && backend.healthCheck?.enabled) {
			this.startActiveCheck(backend);
		}
	}

	/**
	 * Remove health check for a backend
	 */
	remove(backendId: string): void {
		this.stopActiveCheck(backendId);
		this.healthStatus.delete(backendId);
	}

	/**
	 * Start active health checking
	 */
	private startActiveCheck(backend: BackendConfig): void {
		if (!backend.healthCheck) return;

		// Stop existing check if any
		this.stopActiveCheck(backend.id);

		// Start periodic health check
		const interval = setInterval(async () => {
			await this.performHealthCheck(backend);
		}, backend.healthCheck.interval);

		this.intervals.set(backend.id, interval);

		// Perform initial check
		void this.performHealthCheck(backend);
	}

	/**
	 * Stop active health checking
	 */
	private stopActiveCheck(backendId: string): void {
		const interval = this.intervals.get(backendId);
		if (interval) {
			clearInterval(interval);
			this.intervals.delete(backendId);
		}
	}

	/**
	 * Perform health check on a backend
	 */
	private async performHealthCheck(backend: BackendConfig): Promise<void> {
		if (!backend.healthCheck) return;

		const startTime = Date.now();
		const healthPath = backend.healthCheck.path ?? '/health';
		const url = `${backend.url}${healthPath}`;

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => {
				controller.abort();
			}, backend.healthCheck.timeout);

			const response = await fetch(url, {
				method: 'GET',
				signal: controller.signal,
			});

			clearTimeout(timeout);

			const latency = Date.now() - startTime;
			const isHealthy = response.status === backend.healthCheck.expectedStatus;

			if (isHealthy) {
				this.recordSuccess(backend.id, latency);
			} else {
				this.recordFailure(backend.id, latency);
			}
		} catch (error) {
			const latency = Date.now() - startTime;
			this.recordFailure(backend.id, latency);
		}
	}

	/**
	 * Record successful health check
	 */
	private recordSuccess(backendId: string, latency: number): void {
		const health = this.healthStatus.get(backendId);
		if (!health) return;

		health.consecutiveSuccesses++;
		health.consecutiveFailures = 0;
		health.lastCheck = new Date();
		health.latency = latency;

		const backend = health.backend;
		const threshold = backend.healthCheck?.healthyThreshold ?? 2;

		// Update status based on threshold
		if (health.consecutiveSuccesses >= threshold) {
			health.status = 'healthy';
		}

		this.healthStatus.set(backendId, health);
	}

	/**
	 * Record failed health check
	 */
	private recordFailure(backendId: string, latency: number): void {
		const health = this.healthStatus.get(backendId);
		if (!health) return;

		health.consecutiveFailures++;
		health.consecutiveSuccesses = 0;
		health.lastCheck = new Date();
		health.latency = latency;

		const backend = health.backend;
		const threshold = backend.healthCheck?.unhealthyThreshold ?? 3;

		// Update status based on threshold
		if (health.consecutiveFailures >= threshold) {
			health.status = 'unhealthy';
		} else if (health.consecutiveFailures > 0) {
			health.status = 'degraded';
		}

		this.healthStatus.set(backendId, health);
	}

	/**
	 * Record passive health check (based on actual requests)
	 */
	recordPassiveCheck(backendId: string, success: boolean, latency: number): void {
		const health = this.healthStatus.get(backendId);
		if (!health) return;

		if (success) {
			health.consecutiveSuccesses++;
			health.consecutiveFailures = 0;

			// Improve status
			if (health.consecutiveSuccesses >= 3) {
				health.status = 'healthy';
			} else if (health.status === 'unhealthy') {
				health.status = 'degraded';
			}
		} else {
			health.consecutiveFailures++;
			health.consecutiveSuccesses = 0;

			// Degrade status
			if (health.consecutiveFailures >= 5) {
				health.status = 'unhealthy';
			} else if (health.consecutiveFailures >= 2) {
				health.status = 'degraded';
			}
		}

		health.lastCheck = new Date();
		health.latency = latency;

		this.healthStatus.set(backendId, health);
	}

	/**
	 * Get health status for a backend
	 */
	getHealth(backendId: string): BackendHealth | null {
		return this.healthStatus.get(backendId) ?? null;
	}

	/**
	 * Get all health statuses
	 */
	getAllHealth(): Map<string, BackendHealth> {
		return new Map(this.healthStatus);
	}

	/**
	 * Get aggregated health status
	 */
	getAggregatedStatus(): HealthStatus {
		const statuses = Array.from(this.healthStatus.values()).map((h) => h.status);

		if (statuses.length === 0) return 'unknown';

		const unhealthyCount = statuses.filter((s) => s === 'unhealthy').length;
		const degradedCount = statuses.filter((s) => s === 'degraded').length;
		const healthyCount = statuses.filter((s) => s === 'healthy').length;

		// If all backends are unhealthy, gateway is unhealthy
		if (unhealthyCount === statuses.length) {
			return 'unhealthy';
		}

		// If some backends are unhealthy or degraded, gateway is degraded
		if (unhealthyCount > 0 || degradedCount > 0) {
			return 'degraded';
		}

		// If all backends are healthy, gateway is healthy
		if (healthyCount === statuses.length) {
			return 'healthy';
		}

		return 'unknown';
	}

	/**
	 * Check if a backend is healthy
	 */
	isHealthy(backendId: string): boolean {
		const health = this.healthStatus.get(backendId);
		return health?.status === 'healthy';
	}

	/**
	 * Force mark backend as healthy
	 */
	markHealthy(backendId: string): void {
		const health = this.healthStatus.get(backendId);
		if (health) {
			health.status = 'healthy';
			health.consecutiveSuccesses = 10;
			health.consecutiveFailures = 0;
			this.healthStatus.set(backendId, health);
		}
	}

	/**
	 * Force mark backend as unhealthy
	 */
	markUnhealthy(backendId: string): void {
		const health = this.healthStatus.get(backendId);
		if (health) {
			health.status = 'unhealthy';
			health.consecutiveFailures = 10;
			health.consecutiveSuccesses = 0;
			this.healthStatus.set(backendId, health);
		}
	}

	/**
	 * Get healthy backend IDs
	 */
	getHealthyBackends(): string[] {
		return Array.from(this.healthStatus.entries())
			.filter(([, health]) => health.status === 'healthy')
			.map(([id]) => id);
	}

	/**
	 * Get unhealthy backend IDs
	 */
	getUnhealthyBackends(): string[] {
		return Array.from(this.healthStatus.entries())
			.filter(([, health]) => health.status === 'unhealthy')
			.map(([id]) => id);
	}

	/**
	 * Destroy health checker (stop all active checks)
	 */
	destroy(): void {
		for (const [backendId] of this.intervals) {
			this.stopActiveCheck(backendId);
		}
		this.healthStatus.clear();
	}
}
