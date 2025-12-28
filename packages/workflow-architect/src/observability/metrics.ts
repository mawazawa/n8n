import type {
	Metric,
	MetricType,
	MetricLabels,
	MetricDataPoint,
	HistogramData,
	HistogramBucket,
} from './types';
import { MetricLabelsSchema } from './types';

// ============================================================================
// Base Metric
// ============================================================================

abstract class BaseMetric {
	protected name: string;
	protected description?: string;
	protected unit?: string;
	protected labels: MetricLabels;

	constructor(name: string, labels: MetricLabels = {}, description?: string, unit?: string) {
		this.name = name;
		this.labels = MetricLabelsSchema.parse(labels);
		this.description = description;
		this.unit = unit;
	}

	getName(): string {
		return this.name;
	}

	getLabels(): MetricLabels {
		return { ...this.labels };
	}

	abstract collect(): MetricDataPoint[];
}

// ============================================================================
// Counter
// ============================================================================

export class Counter extends BaseMetric {
	private value = 0;

	inc(amount = 1, labels: MetricLabels = {}): void {
		if (amount < 0) {
			throw new Error('Counter can only be incremented with positive values');
		}
		this.value += amount;
	}

	getValue(): number {
		return this.value;
	}

	reset(): void {
		this.value = 0;
	}

	collect(): MetricDataPoint[] {
		return [{
			value: this.value,
			timestamp: Date.now(),
			labels: this.labels,
		}];
	}
}

// ============================================================================
// Gauge
// ============================================================================

export class Gauge extends BaseMetric {
	private value = 0;

	set(value: number): void {
		this.value = value;
	}

	inc(amount = 1): void {
		this.value += amount;
	}

	dec(amount = 1): void {
		this.value -= amount;
	}

	getValue(): number {
		return this.value;
	}

	reset(): void {
		this.value = 0;
	}

	collect(): MetricDataPoint[] {
		return [{
			value: this.value,
			timestamp: Date.now(),
			labels: this.labels,
		}];
	}
}

// ============================================================================
// Histogram
// ============================================================================

export class Histogram extends BaseMetric {
	private buckets: Map<number, number> = new Map();
	private sum = 0;
	private count = 0;
	private bucketBounds: number[];

	constructor(
		name: string,
		labels: MetricLabels = {},
		description?: string,
		unit?: string,
		buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	) {
		super(name, labels, description, unit);
		this.bucketBounds = [...buckets].sort((a, b) => a - b);
		this.bucketBounds.forEach(bound => this.buckets.set(bound, 0));
		this.buckets.set(Infinity, 0); // +Inf bucket
	}

	observe(value: number): void {
		this.sum += value;
		this.count++;

		// Increment all buckets where value <= bound
		for (const bound of this.bucketBounds) {
			if (value <= bound) {
				this.buckets.set(bound, (this.buckets.get(bound) ?? 0) + 1);
			}
		}
		// Always increment +Inf bucket
		this.buckets.set(Infinity, (this.buckets.get(Infinity) ?? 0) + 1);
	}

	getCount(): number {
		return this.count;
	}

	getSum(): number {
		return this.sum;
	}

	getData(): HistogramData {
		const buckets: HistogramBucket[] = [];
		for (const [bound, count] of this.buckets.entries()) {
			buckets.push({ upperBound: bound, count });
		}

		return {
			count: this.count,
			sum: this.sum,
			buckets,
		};
	}

	reset(): void {
		this.buckets.forEach((_, key) => this.buckets.set(key, 0));
		this.sum = 0;
		this.count = 0;
	}

	collect(): MetricDataPoint[] {
		// For histogram, we return a single data point with the sum
		return [{
			value: this.sum,
			timestamp: Date.now(),
			labels: this.labels,
		}];
	}
}

// ============================================================================
// Summary (approximate percentiles)
// ============================================================================

export class Summary extends BaseMetric {
	private values: number[] = [];
	private sum = 0;
	private count = 0;
	private maxAge: number; // milliseconds
	private maxSize: number;

	constructor(
		name: string,
		labels: MetricLabels = {},
		description?: string,
		unit?: string,
		maxAge = 600000, // 10 minutes
		maxSize = 1000,
	) {
		super(name, labels, description, unit);
		this.maxAge = maxAge;
		this.maxSize = maxSize;
	}

	observe(value: number): void {
		this.values.push(value);
		this.sum += value;
		this.count++;

		// Limit size
		if (this.values.length > this.maxSize) {
			this.values.shift();
		}
	}

	getCount(): number {
		return this.count;
	}

	getSum(): number {
		return this.sum;
	}

	quantile(q: number): number {
		if (this.values.length === 0) return 0;

		const sorted = [...this.values].sort((a, b) => a - b);
		const index = Math.ceil(sorted.length * q) - 1;
		return sorted[Math.max(0, index)];
	}

	reset(): void {
		this.values = [];
		this.sum = 0;
		this.count = 0;
	}

	collect(): MetricDataPoint[] {
		return [{
			value: this.sum,
			timestamp: Date.now(),
			labels: this.labels,
		}];
	}
}

// ============================================================================
// Metrics Registry
// ============================================================================

export class MetricsRegistry {
	private metrics = new Map<string, BaseMetric>();
	private collectors: Array<() => Metric[]> = [];

	/**
	 * Create or get a counter
	 */
	counter(name: string, labels: MetricLabels = {}, description?: string, unit?: string): Counter {
		const key = this.makeKey(name, labels);
		let metric = this.metrics.get(key);

		if (!metric) {
			metric = new Counter(name, labels, description, unit);
			this.metrics.set(key, metric);
		}

		if (!(metric instanceof Counter)) {
			throw new Error(`Metric ${name} already exists with different type`);
		}

		return metric;
	}

	/**
	 * Create or get a gauge
	 */
	gauge(name: string, labels: MetricLabels = {}, description?: string, unit?: string): Gauge {
		const key = this.makeKey(name, labels);
		let metric = this.metrics.get(key);

		if (!metric) {
			metric = new Gauge(name, labels, description, unit);
			this.metrics.set(key, metric);
		}

		if (!(metric instanceof Gauge)) {
			throw new Error(`Metric ${name} already exists with different type`);
		}

		return metric;
	}

	/**
	 * Create or get a histogram
	 */
	histogram(
		name: string,
		labels: MetricLabels = {},
		description?: string,
		unit?: string,
		buckets?: number[],
	): Histogram {
		const key = this.makeKey(name, labels);
		let metric = this.metrics.get(key);

		if (!metric) {
			metric = new Histogram(name, labels, description, unit, buckets);
			this.metrics.set(key, metric);
		}

		if (!(metric instanceof Histogram)) {
			throw new Error(`Metric ${name} already exists with different type`);
		}

		return metric;
	}

	/**
	 * Create or get a summary
	 */
	summary(
		name: string,
		labels: MetricLabels = {},
		description?: string,
		unit?: string,
		maxAge?: number,
		maxSize?: number,
	): Summary {
		const key = this.makeKey(name, labels);
		let metric = this.metrics.get(key);

		if (!metric) {
			metric = new Summary(name, labels, description, unit, maxAge, maxSize);
			this.metrics.set(key, metric);
		}

		if (!(metric instanceof Summary)) {
			throw new Error(`Metric ${name} already exists with different type`);
		}

		return metric;
	}

	/**
	 * Register a custom collector function
	 */
	registerCollector(collector: () => Metric[]): void {
		this.collectors.push(collector);
	}

	/**
	 * Collect all metrics
	 */
	collect(): Metric[] {
		const metrics: Metric[] = [];

		// Collect from registered metrics
		for (const [key, metric] of this.metrics.entries()) {
			const dataPoints = metric.collect();
			const type = this.getMetricType(metric);

			metrics.push({
				name: metric.getName(),
				type,
				description: (metric as any).description,
				unit: (metric as any).unit,
				dataPoints,
			});
		}

		// Collect from custom collectors
		for (const collector of this.collectors) {
			metrics.push(...collector());
		}

		return metrics;
	}

	/**
	 * Get a specific metric by name
	 */
	getMetric(name: string, labels: MetricLabels = {}): BaseMetric | undefined {
		const key = this.makeKey(name, labels);
		return this.metrics.get(key);
	}

	/**
	 * Remove a metric
	 */
	removeMetric(name: string, labels: MetricLabels = {}): boolean {
		const key = this.makeKey(name, labels);
		return this.metrics.delete(key);
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics.clear();
		this.collectors = [];
	}

	/**
	 * Get metric count
	 */
	size(): number {
		return this.metrics.size;
	}

	/**
	 * Create unique key for metric with labels
	 */
	private makeKey(name: string, labels: MetricLabels): string {
		const sortedLabels = Object.keys(labels)
			.sort()
			.map(k => `${k}="${labels[k]}"`)
			.join(',');

		return sortedLabels ? `${name}{${sortedLabels}}` : name;
	}

	/**
	 * Determine metric type
	 */
	private getMetricType(metric: BaseMetric): MetricType {
		if (metric instanceof Counter) return 'counter';
		if (metric instanceof Gauge) return 'gauge';
		if (metric instanceof Histogram) return 'histogram';
		if (metric instanceof Summary) return 'summary';
		return 'gauge'; // fallback
	}
}

// ============================================================================
// Global Registry
// ============================================================================

let globalRegistry: MetricsRegistry | null = null;

export function getMetricsRegistry(): MetricsRegistry {
	if (!globalRegistry) {
		globalRegistry = new MetricsRegistry();
	}
	return globalRegistry;
}

export function setMetricsRegistry(registry: MetricsRegistry): void {
	globalRegistry = registry;
}

// ============================================================================
// Built-in Metrics
// ============================================================================

export function initDefaultMetrics(registry: MetricsRegistry = getMetricsRegistry()): void {
	// Process metrics
	if (typeof process !== 'undefined') {
		registry.registerCollector(() => {
			const metrics: Metric[] = [];

			// Memory usage
			const memUsage = process.memoryUsage();
			metrics.push({
				name: 'process_memory_bytes',
				type: 'gauge',
				description: 'Process memory usage in bytes',
				unit: 'bytes',
				dataPoints: [
					{ value: memUsage.heapUsed, timestamp: Date.now(), labels: { type: 'heap_used' } },
					{ value: memUsage.heapTotal, timestamp: Date.now(), labels: { type: 'heap_total' } },
					{ value: memUsage.rss, timestamp: Date.now(), labels: { type: 'rss' } },
					{ value: memUsage.external, timestamp: Date.now(), labels: { type: 'external' } },
				],
			});

			// CPU usage
			const cpuUsage = process.cpuUsage();
			metrics.push({
				name: 'process_cpu_seconds_total',
				type: 'counter',
				description: 'Total CPU time spent',
				unit: 'seconds',
				dataPoints: [
					{ value: cpuUsage.user / 1000000, timestamp: Date.now(), labels: { type: 'user' } },
					{ value: cpuUsage.system / 1000000, timestamp: Date.now(), labels: { type: 'system' } },
				],
			});

			// Uptime
			metrics.push({
				name: 'process_uptime_seconds',
				type: 'gauge',
				description: 'Process uptime in seconds',
				unit: 'seconds',
				dataPoints: [
					{ value: process.uptime(), timestamp: Date.now(), labels: {} },
				],
			});

			return metrics;
		});
	}
}
