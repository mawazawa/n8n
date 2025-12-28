import type { Request, Response, NextFunction } from 'express';
import type { HttpMethod, GatewayMetrics } from './types.js';

interface MetricPoint {
	timestamp: number;
	value: number;
}

/**
 * Gateway metrics collector
 * Tracks requests, latency, errors, and backend health
 */
export class GatewayMetricsCollector {
	private metrics: GatewayMetrics;
	private latencyBuffer: number[] = [];
	private maxBufferSize = 1000;

	constructor() {
		this.metrics = {
			requests: {
				total: 0,
				successful: 0,
				failed: 0,
				byRoute: new Map(),
				byMethod: new Map(),
				byStatusCode: new Map(),
			},
			latency: {
				p50: 0,
				p95: 0,
				p99: 0,
				mean: 0,
			},
			backends: new Map(),
			cache: {
				hits: 0,
				misses: 0,
				size: 0,
			},
			circuitBreakers: new Map(),
		};
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return (req: Request, res: Response, next: NextFunction): void => {
			const startTime = Date.now();

			// Capture response
			const originalSend = res.send.bind(res);
			res.send = ((body: unknown): Response => {
				const duration = Date.now() - startTime;
				this.recordRequest(req, res, duration);
				return originalSend(body);
			}) as Response['send'];

			next();
		};
	}

	/**
	 * Record request metrics
	 */
	private recordRequest(req: Request, res: Response, duration: number): void {
		const statusCode = res.statusCode;
		const method = req.method as HttpMethod;
		const route = (req as Request & { route?: { path?: string } }).route?.path ?? req.path;

		// Total requests
		this.metrics.requests.total++;

		// Success/failure
		if (statusCode >= 200 && statusCode < 400) {
			this.metrics.requests.successful++;
		} else {
			this.metrics.requests.failed++;
		}

		// By route
		const routeCount = this.metrics.requests.byRoute.get(route) ?? 0;
		this.metrics.requests.byRoute.set(route, routeCount + 1);

		// By method
		const methodCount = this.metrics.requests.byMethod.get(method) ?? 0;
		this.metrics.requests.byMethod.set(method, methodCount + 1);

		// By status code
		const statusCount = this.metrics.requests.byStatusCode.get(statusCode) ?? 0;
		this.metrics.requests.byStatusCode.set(statusCode, statusCount + 1);

		// Latency
		this.recordLatency(duration);
	}

	/**
	 * Record latency
	 */
	private recordLatency(duration: number): void {
		this.latencyBuffer.push(duration);

		// Trim buffer
		if (this.latencyBuffer.length > this.maxBufferSize) {
			this.latencyBuffer.shift();
		}

		// Calculate percentiles
		const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
		const len = sorted.length;

		this.metrics.latency.p50 = this.getPercentile(sorted, 0.5);
		this.metrics.latency.p95 = this.getPercentile(sorted, 0.95);
		this.metrics.latency.p99 = this.getPercentile(sorted, 0.99);
		this.metrics.latency.mean = sorted.reduce((sum, val) => sum + val, 0) / len;
	}

	/**
	 * Get percentile value
	 */
	private getPercentile(sorted: number[], percentile: number): number {
		const index = Math.ceil(sorted.length * percentile) - 1;
		return sorted[Math.max(0, index)] ?? 0;
	}

	/**
	 * Record backend request
	 */
	recordBackendRequest(
		backendId: string,
		success: boolean,
		latency: number,
	): void {
		let backend = this.metrics.backends.get(backendId);
		if (!backend) {
			backend = {
				requests: 0,
				failures: 0,
				latency: [],
				activeConnections: 0,
			};
			this.metrics.backends.set(backendId, backend);
		}

		backend.requests++;
		if (!success) {
			backend.failures++;
		}

		// Store latency (keep last 100 values)
		backend.latency.push(latency);
		if (backend.latency.length > 100) {
			backend.latency.shift();
		}
	}

	/**
	 * Record cache hit
	 */
	recordCacheHit(): void {
		this.metrics.cache.hits++;
	}

	/**
	 * Record cache miss
	 */
	recordCacheMiss(): void {
		this.metrics.cache.misses++;
	}

	/**
	 * Update cache size
	 */
	updateCacheSize(size: number): void {
		this.metrics.cache.size = size;
	}

	/**
	 * Get metrics
	 */
	getMetrics(): GatewayMetrics {
		return JSON.parse(JSON.stringify(this.metrics)) as GatewayMetrics;
	}

	/**
	 * Get metrics summary
	 */
	getSummary(): {
		totalRequests: number;
		successRate: number;
		errorRate: number;
		avgLatency: number;
		cacheHitRate: number;
	} {
		const total = this.metrics.requests.total;
		const successful = this.metrics.requests.successful;
		const failed = this.metrics.requests.failed;
		const cacheTotal = this.metrics.cache.hits + this.metrics.cache.misses;

		return {
			totalRequests: total,
			successRate: total > 0 ? (successful / total) * 100 : 0,
			errorRate: total > 0 ? (failed / total) * 100 : 0,
			avgLatency: this.metrics.latency.mean,
			cacheHitRate: cacheTotal > 0 ? (this.metrics.cache.hits / cacheTotal) * 100 : 0,
		};
	}

	/**
	 * Export metrics in Prometheus format
	 */
	exportPrometheus(): string {
		const lines: string[] = [];

		// Request metrics
		lines.push('# HELP gateway_requests_total Total number of requests');
		lines.push('# TYPE gateway_requests_total counter');
		lines.push(`gateway_requests_total ${this.metrics.requests.total}`);

		lines.push('# HELP gateway_requests_successful Total number of successful requests');
		lines.push('# TYPE gateway_requests_successful counter');
		lines.push(`gateway_requests_successful ${this.metrics.requests.successful}`);

		lines.push('# HELP gateway_requests_failed Total number of failed requests');
		lines.push('# TYPE gateway_requests_failed counter');
		lines.push(`gateway_requests_failed ${this.metrics.requests.failed}`);

		// Latency metrics
		lines.push('# HELP gateway_latency_p50 50th percentile latency in milliseconds');
		lines.push('# TYPE gateway_latency_p50 gauge');
		lines.push(`gateway_latency_p50 ${this.metrics.latency.p50}`);

		lines.push('# HELP gateway_latency_p95 95th percentile latency in milliseconds');
		lines.push('# TYPE gateway_latency_p95 gauge');
		lines.push(`gateway_latency_p95 ${this.metrics.latency.p95}`);

		lines.push('# HELP gateway_latency_p99 99th percentile latency in milliseconds');
		lines.push('# TYPE gateway_latency_p99 gauge');
		lines.push(`gateway_latency_p99 ${this.metrics.latency.p99}`);

		// Cache metrics
		lines.push('# HELP gateway_cache_hits Total number of cache hits');
		lines.push('# TYPE gateway_cache_hits counter');
		lines.push(`gateway_cache_hits ${this.metrics.cache.hits}`);

		lines.push('# HELP gateway_cache_misses Total number of cache misses');
		lines.push('# TYPE gateway_cache_misses counter');
		lines.push(`gateway_cache_misses ${this.metrics.cache.misses}`);

		lines.push('# HELP gateway_cache_size Current cache size');
		lines.push('# TYPE gateway_cache_size gauge');
		lines.push(`gateway_cache_size ${this.metrics.cache.size}`);

		// By method
		lines.push('# HELP gateway_requests_by_method Requests grouped by HTTP method');
		lines.push('# TYPE gateway_requests_by_method counter');
		for (const [method, count] of this.metrics.requests.byMethod) {
			lines.push(`gateway_requests_by_method{method="${method}"} ${count}`);
		}

		// By status code
		lines.push('# HELP gateway_requests_by_status Requests grouped by status code');
		lines.push('# TYPE gateway_requests_by_status counter');
		for (const [status, count] of this.metrics.requests.byStatusCode) {
			lines.push(`gateway_requests_by_status{status="${status}"} ${count}`);
		}

		// Backend metrics
		for (const [backendId, backend] of this.metrics.backends) {
			lines.push(`# HELP gateway_backend_requests_total Total requests to backend ${backendId}`);
			lines.push('# TYPE gateway_backend_requests_total counter');
			lines.push(`gateway_backend_requests_total{backend="${backendId}"} ${backend.requests}`);

			lines.push(`# HELP gateway_backend_failures_total Total failures for backend ${backendId}`);
			lines.push('# TYPE gateway_backend_failures_total counter');
			lines.push(`gateway_backend_failures_total{backend="${backendId}"} ${backend.failures}`);

			if (backend.latency.length > 0) {
				const avgLatency = backend.latency.reduce((sum, val) => sum + val, 0) / backend.latency.length;
				lines.push(`# HELP gateway_backend_latency_avg Average latency for backend ${backendId}`);
				lines.push('# TYPE gateway_backend_latency_avg gauge');
				lines.push(`gateway_backend_latency_avg{backend="${backendId}"} ${avgLatency}`);
			}
		}

		return lines.join('\n') + '\n';
	}

	/**
	 * Reset metrics
	 */
	reset(): void {
		this.metrics = {
			requests: {
				total: 0,
				successful: 0,
				failed: 0,
				byRoute: new Map(),
				byMethod: new Map(),
				byStatusCode: new Map(),
			},
			latency: {
				p50: 0,
				p95: 0,
				p99: 0,
				mean: 0,
			},
			backends: new Map(),
			cache: {
				hits: 0,
				misses: 0,
				size: 0,
			},
			circuitBreakers: new Map(),
		};
		this.latencyBuffer = [];
	}

	/**
	 * Increment active connections for backend
	 */
	incrementBackendConnections(backendId: string): void {
		const backend = this.metrics.backends.get(backendId);
		if (backend) {
			backend.activeConnections++;
		}
	}

	/**
	 * Decrement active connections for backend
	 */
	decrementBackendConnections(backendId: string): void {
		const backend = this.metrics.backends.get(backendId);
		if (backend && backend.activeConnections > 0) {
			backend.activeConnections--;
		}
	}
}
