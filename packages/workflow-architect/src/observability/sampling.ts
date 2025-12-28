import type { SamplingConfig, SamplingStrategy, Span } from './types';
import { SamplingConfigSchema } from './types';

// ============================================================================
// Adaptive Sampler
// ============================================================================

export class AdaptiveSampler {
	private config: SamplingConfig;
	private tracesThisSecond = 0;
	private lastResetTime = Date.now();
	private spanBuffer: Span[] = [];
	private bufferMaxSize = 10000;

	constructor(config?: SamplingConfig) {
		this.config = config ?? {
			strategy: 'probabilistic',
			rate: 0.1, // 10% default
		};
		SamplingConfigSchema.parse(this.config);
	}

	/**
	 * Configure sampling strategy
	 */
	configure(config: SamplingConfig): void {
		SamplingConfigSchema.parse(config);
		this.config = config;
	}

	/**
	 * Decide whether to sample a span (head-based sampling)
	 */
	shouldSample(span: Span): boolean {
		switch (this.config.strategy) {
			case 'always':
				return true;

			case 'never':
				return false;

			case 'probabilistic':
				return this.probabilisticSample();

			case 'rate_limiting':
				return this.rateLimitingSample();

			case 'tail_based':
				// Tail-based requires buffering
				this.bufferSpan(span);
				return false; // Decision made later

			default:
				return false;
		}
	}

	/**
	 * Probabilistic sampling
	 */
	private probabilisticSample(): boolean {
		const rate = this.config.rate ?? 0.1;
		return Math.random() < rate;
	}

	/**
	 * Rate-limiting sampling
	 */
	private rateLimitingSample(): boolean {
		const now = Date.now();

		// Reset counter every second
		if (now - this.lastResetTime >= 1000) {
			this.tracesThisSecond = 0;
			this.lastResetTime = now;
		}

		const maxPerSecond = this.config.maxTracesPerSecond ?? 100;

		if (this.tracesThisSecond < maxPerSecond) {
			this.tracesThisSecond++;
			return true;
		}

		return false;
	}

	/**
	 * Buffer span for tail-based sampling
	 */
	private bufferSpan(span: Span): void {
		this.spanBuffer.push(span);

		// Limit buffer size
		if (this.spanBuffer.length > this.bufferMaxSize) {
			this.spanBuffer.shift();
		}
	}

	/**
	 * Evaluate buffered spans for tail-based sampling
	 */
	evaluateTailBasedSampling(): Span[] {
		const sampled: Span[] = [];

		// Group spans by trace
		const traces = new Map<string, Span[]>();
		for (const span of this.spanBuffer) {
			const traceSpans = traces.get(span.traceId) ?? [];
			traceSpans.push(span);
			traces.set(span.traceId, traceSpans);
		}

		// Evaluate each trace
		for (const [traceId, spans] of traces.entries()) {
			if (this.shouldSampleTrace(spans)) {
				sampled.push(...spans);
			}
		}

		// Clear buffer
		this.spanBuffer = [];

		return sampled;
	}

	/**
	 * Decide whether to sample a complete trace
	 */
	private shouldSampleTrace(spans: Span[]): boolean {
		// Apply rules
		if (this.config.rules) {
			for (const rule of this.config.rules) {
				if (this.evaluateRule(rule, spans)) {
					return rule.sample;
				}
			}
		}

		// Default to probabilistic sampling
		return this.probabilisticSample();
	}

	/**
	 * Evaluate sampling rule
	 */
	private evaluateRule(
		rule: { condition: string; sample: boolean },
		spans: Span[],
	): boolean {
		// Parse condition (simple implementation)
		// Format: "status:error" or "duration>1000" or "name:checkout"

		for (const span of spans) {
			if (rule.condition.startsWith('status:')) {
				const status = rule.condition.split(':')[1];
				if (span.status === status) return true;
			}

			if (rule.condition.startsWith('duration>')) {
				const threshold = parseInt(rule.condition.split('>')[1], 10);
				if ((span.duration ?? 0) > threshold) return true;
			}

			if (rule.condition.startsWith('name:')) {
				const name = rule.condition.split(':')[1];
				if (span.name.includes(name)) return true;
			}

			// Check attributes
			if (rule.condition.includes('=')) {
				const [key, value] = rule.condition.split('=');
				if (span.attributes[key] === value) return true;
			}
		}

		return false;
	}

	/**
	 * Get current sampling rate (approximate)
	 */
	getSamplingRate(): number {
		switch (this.config.strategy) {
			case 'always':
				return 1.0;
			case 'never':
				return 0.0;
			case 'probabilistic':
				return this.config.rate ?? 0.1;
			case 'rate_limiting':
				// Approximate based on current load
				return Math.min(
					1.0,
					(this.config.maxTracesPerSecond ?? 100) / (this.tracesThisSecond || 1),
				);
			case 'tail_based':
				return this.config.rate ?? 0.1;
			default:
				return 0.0;
		}
	}

	/**
	 * Get buffered span count
	 */
	getBufferSize(): number {
		return this.spanBuffer.length;
	}

	/**
	 * Adjust sampling rate dynamically based on load
	 */
	adjustRateBasedOnLoad(currentLoad: number, targetLoad: number): void {
		if (this.config.strategy !== 'probabilistic') return;

		const currentRate = this.config.rate ?? 0.1;
		const ratio = targetLoad / currentLoad;

		// Adjust rate to meet target load
		const newRate = Math.min(1.0, Math.max(0.01, currentRate * ratio));

		this.config.rate = newRate;
	}
}

// ============================================================================
// Sampling Decision
// ============================================================================

export class SamplingDecision {
	readonly isSampled: boolean;
	readonly reason?: string;
	readonly priority?: number;

	constructor(isSampled: boolean, reason?: string, priority?: number) {
		this.isSampled = isSampled;
		this.reason = reason;
		this.priority = priority;
	}

	static sampled(reason?: string, priority = 1): SamplingDecision {
		return new SamplingDecision(true, reason, priority);
	}

	static notSampled(reason?: string): SamplingDecision {
		return new SamplingDecision(false, reason);
	}
}

// ============================================================================
// Sampling Strategies
// ============================================================================

export class SamplingStrategies {
	/**
	 * Always sample errors
	 */
	static alwaysSampleErrors(): (span: Span) => SamplingDecision {
		return (span: Span) => {
			if (span.status === 'error') {
				return SamplingDecision.sampled('error', 10);
			}
			return SamplingDecision.notSampled('not-error');
		};
	}

	/**
	 * Always sample slow traces
	 */
	static alwaysSampleSlowTraces(thresholdMs: number): (span: Span) => SamplingDecision {
		return (span: Span) => {
			if ((span.duration ?? 0) > thresholdMs) {
				return SamplingDecision.sampled('slow', 8);
			}
			return SamplingDecision.notSampled('not-slow');
		};
	}

	/**
	 * Sample based on trace attributes
	 */
	static sampleByAttribute(
		attributeKey: string,
		attributeValue: string | number | boolean,
	): (span: Span) => SamplingDecision {
		return (span: Span) => {
			if (span.attributes[attributeKey] === attributeValue) {
				return SamplingDecision.sampled(`attribute-match:${attributeKey}`, 5);
			}
			return SamplingDecision.notSampled('no-attribute-match');
		};
	}

	/**
	 * Composite sampler (combines multiple strategies)
	 */
	static composite(
		strategies: Array<(span: Span) => SamplingDecision>,
	): (span: Span) => SamplingDecision {
		return (span: Span) => {
			let highestPriorityDecision: SamplingDecision | null = null;

			for (const strategy of strategies) {
				const decision = strategy(span);

				if (decision.isSampled) {
					if (!highestPriorityDecision ||
						(decision.priority ?? 0) > (highestPriorityDecision.priority ?? 0)) {
						highestPriorityDecision = decision;
					}
				}
			}

			return highestPriorityDecision ?? SamplingDecision.notSampled('no-match');
		};
	}
}
