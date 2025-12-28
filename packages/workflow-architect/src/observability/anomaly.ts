import { randomBytes } from 'node:crypto';
import type { Anomaly, AnomalyType, Metric, MetricDataPoint } from './types';
import { AnomalySchema } from './types';

// ============================================================================
// Anomaly Detector
// ============================================================================

export class AnomalyDetector {
	private metricsProvider?: () => Metric[];
	private detectedAnomalies: Anomaly[] = [];
	private handlers: Array<(anomaly: Anomaly) => void> = [];
	private zScoreThreshold = 3.0;
	private madThreshold = 3.0;

	/**
	 * Set metrics provider function
	 */
	setMetricsProvider(provider: () => Metric[]): void {
		this.metricsProvider = provider;
	}

	/**
	 * Add anomaly handler
	 */
	addHandler(handler: (anomaly: Anomaly) => void): void {
		this.handlers.push(handler);
	}

	/**
	 * Configure detection thresholds
	 */
	configure(options: {
		zScoreThreshold?: number;
		madThreshold?: number;
	}): void {
		if (options.zScoreThreshold !== undefined) {
			this.zScoreThreshold = options.zScoreThreshold;
		}
		if (options.madThreshold !== undefined) {
			this.madThreshold = options.madThreshold;
		}
	}

	/**
	 * Detect anomalies in metrics
	 */
	async detect(metrics?: Metric[]): Promise<Anomaly[]> {
		const metricsToAnalyze = metrics ?? (this.metricsProvider ? this.metricsProvider() : []);
		const anomalies: Anomaly[] = [];

		for (const metric of metricsToAnalyze) {
			const metricAnomalies = await this.detectInMetric(metric);
			anomalies.push(...metricAnomalies);
		}

		// Store and notify
		this.detectedAnomalies.push(...anomalies);
		for (const anomaly of anomalies) {
			this.notifyHandlers(anomaly);
		}

		return anomalies;
	}

	/**
	 * Detect anomalies in a single metric
	 */
	private async detectInMetric(metric: Metric): Promise<Anomaly[]> {
		const anomalies: Anomaly[] = [];

		// Extract values and timestamps
		const dataPoints = metric.dataPoints;
		if (dataPoints.length < 10) {
			return []; // Need sufficient data
		}

		// Z-score method
		const zScoreAnomalies = this.detectWithZScore(metric, dataPoints);
		anomalies.push(...zScoreAnomalies);

		// MAD method
		const madAnomalies = this.detectWithMAD(metric, dataPoints);
		anomalies.push(...madAnomalies);

		// Spike detection
		const spikeAnomalies = this.detectSpikes(metric, dataPoints);
		anomalies.push(...spikeAnomalies);

		// Drop detection
		const dropAnomalies = this.detectDrops(metric, dataPoints);
		anomalies.push(...dropAnomalies);

		return anomalies;
	}

	/**
	 * Detect anomalies using Z-score method
	 */
	private detectWithZScore(metric: Metric, dataPoints: MetricDataPoint[]): Anomaly[] {
		const values = dataPoints.map(dp => dp.value);
		const mean = this.calculateMean(values);
		const stdDev = this.calculateStdDev(values, mean);

		if (stdDev === 0) return [];

		const anomalies: Anomaly[] = [];

		for (let i = 0; i < dataPoints.length; i++) {
			const dp = dataPoints[i];
			const zScore = Math.abs((dp.value - mean) / stdDev);

			if (zScore > this.zScoreThreshold) {
				const anomaly: Anomaly = {
					id: randomBytes(8).toString('hex'),
					type: dp.value > mean ? 'spike' : 'drop',
					metric: metric.name,
					timestamp: dp.timestamp,
					actualValue: dp.value,
					expectedValue: mean,
					deviation: zScore,
					severity: Math.min(zScore / 5, 1), // Normalize to 0-1
					confidence: Math.min(zScore / this.zScoreThreshold, 1),
					context: {
						method: 'z-score',
						mean,
						stdDev,
						labels: dp.labels,
					},
				};

				AnomalySchema.parse(anomaly);
				anomalies.push(anomaly);
			}
		}

		return anomalies;
	}

	/**
	 * Detect anomalies using MAD (Median Absolute Deviation) method
	 */
	private detectWithMAD(metric: Metric, dataPoints: MetricDataPoint[]): Anomaly[] {
		const values = dataPoints.map(dp => dp.value);
		const median = this.calculateMedian(values);
		const mad = this.calculateMAD(values, median);

		if (mad === 0) return [];

		const anomalies: Anomaly[] = [];

		for (let i = 0; i < dataPoints.length; i++) {
			const dp = dataPoints[i];
			const madScore = Math.abs((dp.value - median) / (mad * 1.4826)); // Normalized MAD

			if (madScore > this.madThreshold) {
				const anomaly: Anomaly = {
					id: randomBytes(8).toString('hex'),
					type: dp.value > median ? 'spike' : 'drop',
					metric: metric.name,
					timestamp: dp.timestamp,
					actualValue: dp.value,
					expectedValue: median,
					deviation: madScore,
					severity: Math.min(madScore / 5, 1),
					confidence: Math.min(madScore / this.madThreshold, 1),
					context: {
						method: 'mad',
						median,
						mad,
						labels: dp.labels,
					},
				};

				AnomalySchema.parse(anomaly);
				anomalies.push(anomaly);
			}
		}

		return anomalies;
	}

	/**
	 * Detect spikes
	 */
	private detectSpikes(metric: Metric, dataPoints: MetricDataPoint[]): Anomaly[] {
		const anomalies: Anomaly[] = [];

		for (let i = 1; i < dataPoints.length; i++) {
			const current = dataPoints[i];
			const previous = dataPoints[i - 1];

			const percentChange = ((current.value - previous.value) / previous.value) * 100;

			if (percentChange > 50) { // 50% increase
				const anomaly: Anomaly = {
					id: randomBytes(8).toString('hex'),
					type: 'spike',
					metric: metric.name,
					timestamp: current.timestamp,
					actualValue: current.value,
					expectedValue: previous.value,
					deviation: percentChange / 100,
					severity: Math.min(percentChange / 100, 1),
					confidence: 0.8,
					context: {
						method: 'spike-detection',
						percentChange,
						labels: current.labels,
					},
				};

				AnomalySchema.parse(anomaly);
				anomalies.push(anomaly);
			}
		}

		return anomalies;
	}

	/**
	 * Detect drops
	 */
	private detectDrops(metric: Metric, dataPoints: MetricDataPoint[]): Anomaly[] {
		const anomalies: Anomaly[] = [];

		for (let i = 1; i < dataPoints.length; i++) {
			const current = dataPoints[i];
			const previous = dataPoints[i - 1];

			const percentChange = ((previous.value - current.value) / previous.value) * 100;

			if (percentChange > 50) { // 50% decrease
				const anomaly: Anomaly = {
					id: randomBytes(8).toString('hex'),
					type: 'drop',
					metric: metric.name,
					timestamp: current.timestamp,
					actualValue: current.value,
					expectedValue: previous.value,
					deviation: percentChange / 100,
					severity: Math.min(percentChange / 100, 1),
					confidence: 0.8,
					context: {
						method: 'drop-detection',
						percentChange,
						labels: current.labels,
					},
				};

				AnomalySchema.parse(anomaly);
				anomalies.push(anomaly);
			}
		}

		return anomalies;
	}

	/**
	 * Get detected anomalies
	 */
	getAnomalies(filters?: {
		metric?: string;
		type?: AnomalyType;
		minSeverity?: number;
		since?: number;
	}): Anomaly[] {
		let anomalies = [...this.detectedAnomalies];

		if (filters?.metric) {
			anomalies = anomalies.filter(a => a.metric === filters.metric);
		}

		if (filters?.type) {
			anomalies = anomalies.filter(a => a.type === filters.type);
		}

		if (filters?.minSeverity !== undefined) {
			anomalies = anomalies.filter(a => a.severity >= filters.minSeverity!);
		}

		if (filters?.since) {
			anomalies = anomalies.filter(a => a.timestamp >= filters.since!);
		}

		return anomalies;
	}

	/**
	 * Clear detected anomalies
	 */
	clearAnomalies(before?: number): void {
		if (before) {
			this.detectedAnomalies = this.detectedAnomalies.filter(a => a.timestamp >= before);
		} else {
			this.detectedAnomalies = [];
		}
	}

	/**
	 * Notify handlers
	 */
	private notifyHandlers(anomaly: Anomaly): void {
		for (const handler of this.handlers) {
			try {
				handler(anomaly);
			} catch (err) {
				console.error('Anomaly handler error:', err);
			}
		}
	}

	// ============================================================================
	// Statistical Methods
	// ============================================================================

	private calculateMean(values: number[]): number {
		return values.reduce((sum, v) => sum + v, 0) / values.length;
	}

	private calculateStdDev(values: number[], mean: number): number {
		const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
		const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
		return Math.sqrt(variance);
	}

	private calculateMedian(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);

		if (sorted.length % 2 === 0) {
			return (sorted[mid - 1] + sorted[mid]) / 2;
		} else {
			return sorted[mid];
		}
	}

	private calculateMAD(values: number[], median: number): number {
		const absoluteDeviations = values.map(v => Math.abs(v - median));
		return this.calculateMedian(absoluteDeviations);
	}
}
