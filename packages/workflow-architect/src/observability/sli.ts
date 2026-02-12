import { randomBytes } from 'node:crypto';
import type {
	SLO,
	SLIConfig,
	SLIWindow,
	ErrorBudget,
	Metric,
} from './types';
import { SLOSchema, ErrorBudgetSchema } from './types';

// ============================================================================
// SLI Tracker
// ============================================================================

export class SLITracker {
	private slos = new Map<string, SLO>();
	private metricsProvider?: () => Metric[];
	private measurements = new Map<string, SLIMeasurement[]>();

	/**
	 * Set metrics provider function
	 */
	setMetricsProvider(provider: () => Metric[]): void {
		this.metricsProvider = provider;
	}

	/**
	 * Define an SLO
	 */
	async defineSLO(config: Omit<SLO, 'id' | 'createdAt' | 'updatedAt'>): Promise<SLO> {
		const slo: SLO = {
			id: randomBytes(8).toString('hex'),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			...config,
		};

		SLOSchema.parse(slo);
		this.slos.set(slo.id, slo);

		return slo;
	}

	/**
	 * Update an SLO
	 */
	async updateSLO(id: string, updates: Partial<SLO>): Promise<SLO | null> {
		const slo = this.slos.get(id);
		if (!slo) return null;

		const updated = {
			...slo,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: Date.now(),
		};

		SLOSchema.parse(updated);
		this.slos.set(id, updated);

		return updated;
	}

	/**
	 * Delete an SLO
	 */
	async deleteSLO(id: string): Promise<boolean> {
		this.measurements.delete(id);
		return this.slos.delete(id);
	}

	/**
	 * Get all SLOs
	 */
	listSLOs(): SLO[] {
		return Array.from(this.slos.values());
	}

	/**
	 * Get SLO by ID
	 */
	getSLO(id: string): SLO | undefined {
		return this.slos.get(id);
	}

	/**
	 * Record an SLI measurement
	 */
	recordMeasurement(sloId: string, success: boolean, value?: number): void {
		const measurements = this.measurements.get(sloId) ?? [];
		measurements.push({
			timestamp: Date.now(),
			success,
			value,
		});

		// Limit measurements (keep last 30 days)
		const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const filtered = measurements.filter(m => m.timestamp >= cutoff);

		this.measurements.set(sloId, filtered);
	}

	/**
	 * Calculate error budget
	 */
	async calculateErrorBudget(sloId: string): Promise<ErrorBudget> {
		const slo = this.slos.get(sloId);
		if (!slo) {
			throw new Error(`SLO ${sloId} not found`);
		}

		// Get measurements within window
		const measurements = this.getMeasurementsInWindow(sloId, slo.window);
		const totalMeasurements = measurements.length;

		if (totalMeasurements === 0) {
			return {
				sloId,
				total: 100,
				consumed: 0,
				remaining: 100,
				remainingPercentage: 100,
				burnRate: 0,
				status: 'healthy',
			};
		}

		// Calculate success rate
		const successfulMeasurements = measurements.filter(m => m.success).length;
		const actualSuccessRate = (successfulMeasurements / totalMeasurements) * 100;

		// Calculate error budget
		const targetSuccessRate = slo.target;
		const errorBudget = 100 - targetSuccessRate; // Total allowed error percentage
		const errorRate = 100 - actualSuccessRate;
		const consumedBudget = (errorRate / errorBudget) * 100;
		const remainingBudget = Math.max(0, 100 - consumedBudget);

		// Calculate burn rate (rate of error budget consumption)
		const burnRate = this.calculateBurnRate(sloId, slo.window);

		// Determine status
		let status: 'healthy' | 'warning' | 'critical';
		if (remainingBudget > 50) {
			status = 'healthy';
		} else if (remainingBudget > 20) {
			status = 'warning';
		} else {
			status = 'critical';
		}

		const errorBudgetResult: ErrorBudget = {
			sloId,
			total: errorBudget,
			consumed: consumedBudget,
			remaining: remainingBudget,
			remainingPercentage: remainingBudget,
			burnRate,
			status,
		};

		ErrorBudgetSchema.parse(errorBudgetResult);
		return errorBudgetResult;
	}

	/**
	 * Calculate burn rate
	 */
	private calculateBurnRate(sloId: string, window: SLIWindow): number {
		// Get measurements for last hour
		const now = Date.now();
		const hourAgo = now - 60 * 60 * 1000;
		const measurements = this.measurements.get(sloId) ?? [];
		const recentMeasurements = measurements.filter(m => m.timestamp >= hourAgo);

		if (recentMeasurements.length === 0) return 0;

		// Calculate current error rate
		const failures = recentMeasurements.filter(m => !m.success).length;
		const hourlyErrorRate = failures / recentMeasurements.length;

		// Calculate expected error rate for window
		const windowMs = this.parseWindow(window);
		const expectedRate = (100 - (this.slos.get(sloId)?.target ?? 99)) / 100;

		// Burn rate is ratio of actual to expected error rate
		return hourlyErrorRate / expectedRate;
	}

	/**
	 * Get measurements within window
	 */
	private getMeasurementsInWindow(sloId: string, window: SLIWindow): SLIMeasurement[] {
		const now = Date.now();
		const windowMs = this.parseWindow(window);
		const startTime = now - windowMs;

		const measurements = this.measurements.get(sloId) ?? [];
		return measurements.filter(m => m.timestamp >= startTime);
	}

	/**
	 * Parse window string to milliseconds
	 */
	private parseWindow(window: SLIWindow): number {
		const windowMap: Record<SLIWindow, number> = {
			'1h': 60 * 60 * 1000,
			'6h': 6 * 60 * 60 * 1000,
			'24h': 24 * 60 * 60 * 1000,
			'7d': 7 * 24 * 60 * 60 * 1000,
			'30d': 30 * 24 * 60 * 60 * 1000,
		};
		return windowMap[window];
	}

	/**
	 * Calculate SLI from metrics
	 */
	async calculateSLI(slo: SLO): Promise<number> {
		if (!this.metricsProvider) {
			throw new Error('Metrics provider not set');
		}

		const metrics = this.metricsProvider();
		const metric = metrics.find(m => m.name === slo.sli.query);

		if (!metric) {
			return 0;
		}

		// Get measurements in window
		const windowMs = this.parseWindow(slo.window);
		const startTime = Date.now() - windowMs;

		const relevantDataPoints = metric.dataPoints.filter(
			dp => dp.timestamp >= startTime,
		);

		if (relevantDataPoints.length === 0) return 0;

		// Calculate based on SLI type
		switch (slo.sli.type) {
			case 'availability':
				return this.calculateAvailability(relevantDataPoints);

			case 'latency':
				return this.calculateLatency(relevantDataPoints, slo.sli.threshold);

			case 'error_rate':
				return this.calculateErrorRate(relevantDataPoints);

			case 'throughput':
				return this.calculateThroughput(relevantDataPoints, slo.sli.threshold);

			default:
				return 0;
		}
	}

	/**
	 * Calculate availability SLI
	 */
	private calculateAvailability(dataPoints: Array<{ value: number; timestamp: number }>): number {
		const total = dataPoints.length;
		const successful = dataPoints.filter(dp => dp.value === 1).length;
		return (successful / total) * 100;
	}

	/**
	 * Calculate latency SLI
	 */
	private calculateLatency(
		dataPoints: Array<{ value: number; timestamp: number }>,
		threshold?: number,
	): number {
		if (!threshold) return 0;

		const total = dataPoints.length;
		const withinThreshold = dataPoints.filter(dp => dp.value <= threshold).length;
		return (withinThreshold / total) * 100;
	}

	/**
	 * Calculate error rate SLI
	 */
	private calculateErrorRate(dataPoints: Array<{ value: number; timestamp: number }>): number {
		const values = dataPoints.map(dp => dp.value);
		const avgErrorRate = values.reduce((sum, v) => sum + v, 0) / values.length;
		return (1 - avgErrorRate) * 100; // Convert to success rate
	}

	/**
	 * Calculate throughput SLI
	 */
	private calculateThroughput(
		dataPoints: Array<{ value: number; timestamp: number }>,
		threshold?: number,
	): number {
		if (!threshold) return 0;

		const values = dataPoints.map(dp => dp.value);
		const avgThroughput = values.reduce((sum, v) => sum + v, 0) / values.length;
		return Math.min((avgThroughput / threshold) * 100, 100);
	}

	/**
	 * Get SLO compliance status
	 */
	async getComplianceStatus(sloId: string): Promise<SLOComplianceStatus> {
		const slo = this.slos.get(sloId);
		if (!slo) {
			throw new Error(`SLO ${sloId} not found`);
		}

		const actualSLI = await this.calculateSLI(slo);
		const errorBudget = await this.calculateErrorBudget(sloId);

		return {
			sloId,
			name: slo.name,
			target: slo.target,
			actual: actualSLI,
			compliant: actualSLI >= slo.target,
			errorBudget,
			window: slo.window,
		};
	}

	/**
	 * Get all SLO compliance statuses
	 */
	async getAllComplianceStatuses(): Promise<SLOComplianceStatus[]> {
		const statuses: SLOComplianceStatus[] = [];

		for (const slo of this.slos.values()) {
			const status = await this.getComplianceStatus(slo.id);
			statuses.push(status);
		}

		return statuses;
	}
}

// ============================================================================
// Types
// ============================================================================

interface SLIMeasurement {
	timestamp: number;
	success: boolean;
	value?: number;
}

export interface SLOComplianceStatus {
	sloId: string;
	name: string;
	target: number;
	actual: number;
	compliant: boolean;
	errorBudget: ErrorBudget;
	window: SLIWindow;
}

// ============================================================================
// SLO Builder
// ============================================================================

export class SLOBuilder {
	private name: string;
	private description?: string;
	private sli: SLIConfig;
	private target: number;
	private window: SLIWindow;

	constructor(name: string) {
		this.name = name;
		this.target = 99.9;
		this.window = '30d';
		this.sli = {
			type: 'availability',
			query: '',
		};
	}

	setDescription(description: string): this {
		this.description = description;
		return this;
	}

	setAvailabilitySLI(query: string): this {
		this.sli = {
			type: 'availability',
			query,
		};
		return this;
	}

	setLatencySLI(query: string, threshold: number): this {
		this.sli = {
			type: 'latency',
			query,
			threshold,
		};
		return this;
	}

	setErrorRateSLI(query: string): this {
		this.sli = {
			type: 'error_rate',
			query,
		};
		return this;
	}

	setThroughputSLI(query: string, threshold: number): this {
		this.sli = {
			type: 'throughput',
			query,
			threshold,
		};
		return this;
	}

	setTarget(target: number): this {
		if (target < 0 || target > 100) {
			throw new Error('Target must be between 0 and 100');
		}
		this.target = target;
		return this;
	}

	setWindow(window: SLIWindow): this {
		this.window = window;
		return this;
	}

	build(): Omit<SLO, 'id' | 'createdAt' | 'updatedAt'> {
		if (!this.sli.query) {
			throw new Error('SLI query is required');
		}

		return {
			name: this.name,
			description: this.description,
			sli: this.sli,
			target: this.target,
			window: this.window,
		};
	}
}
