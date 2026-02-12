import { z } from 'zod';

// Simulation Configuration
export const SimulationConfigSchema = z.object({
	speed: z.number().min(0.1).max(1000).default(1), // 1 = real-time, >1 = faster
	iterations: z.number().min(1).max(10000).default(100),
	seed: z.number().optional(), // For deterministic random
	mockData: z.boolean().default(true),
	chaos: z
		.object({
			enabled: z.boolean().default(false),
			failureRate: z.number().min(0).max(1).default(0.1),
			types: z.array(z.enum(['network', 'timeout', 'crash', 'corruption'])).default([]),
		})
		.optional(),
	network: z
		.object({
			latency: z.number().min(0).default(0), // ms
			bandwidth: z.number().min(0).optional(), // bytes/sec
			packetLoss: z.number().min(0).max(1).default(0), // 0-1
			jitter: z.number().min(0).default(0), // ms variance
		})
		.optional(),
	parallel: z.boolean().default(true),
	maxConcurrency: z.number().min(1).max(1000).default(10),
	timeout: z.number().min(0).default(30000), // ms
	stopOnError: z.boolean().default(false),
});

export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;

// Simulation Result
export const ExecutionMetricsSchema = z.object({
	duration: z.number(), // ms
	startTime: z.number(),
	endTime: z.number(),
	success: z.boolean(),
	nodeExecutions: z.number(),
	dataProcessed: z.number(), // bytes
	errorRate: z.number(),
	memoryUsage: z.number().optional(), // bytes
	cpuTime: z.number().optional(), // ms
});

export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

export const SimulationResultSchema = z.object({
	id: z.string(),
	workflowId: z.string(),
	config: SimulationConfigSchema,
	executions: z.array(
		z.object({
			id: z.string(),
			iteration: z.number(),
			metrics: ExecutionMetricsSchema,
			data: z.record(z.unknown()).optional(),
			error: z
				.object({
					message: z.string(),
					type: z.string(),
					stack: z.string().optional(),
				})
				.optional(),
		}),
	),
	aggregateMetrics: z.object({
		totalExecutions: z.number(),
		successRate: z.number(),
		averageDuration: z.number(),
		p50Duration: z.number(),
		p95Duration: z.number(),
		p99Duration: z.number(),
		minDuration: z.number(),
		maxDuration: z.number(),
		totalDataProcessed: z.number(),
		averageMemory: z.number().optional(),
		peakMemory: z.number().optional(),
	}),
	errors: z.array(
		z.object({
			iteration: z.number(),
			message: z.string(),
			type: z.string(),
			count: z.number(),
		}),
	),
	startedAt: z.string(),
	completedAt: z.string(),
	duration: z.number(),
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

// Test Scenarios
export const ScenarioStepSchema = z.object({
	name: z.string(),
	type: z.enum(['trigger', 'node', 'condition', 'delay', 'assertion']),
	nodeId: z.string().optional(),
	data: z.record(z.unknown()).optional(),
	assertion: z
		.object({
			field: z.string(),
			operator: z.enum(['equals', 'contains', 'greaterThan', 'lessThan', 'exists']),
			value: z.unknown(),
		})
		.optional(),
	timeout: z.number().optional(),
});

export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

export const ScenarioSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	tags: z.array(z.string()).default([]),
	steps: z.array(ScenarioStepSchema),
	setup: z
		.object({
			mockData: z.record(z.unknown()).optional(),
			environment: z.record(z.string()).optional(),
		})
		.optional(),
	teardown: z
		.object({
			cleanup: z.boolean().default(true),
		})
		.optional(),
	expectedOutcome: z.enum(['success', 'error', 'timeout']).default('success'),
	assertions: z.array(ScenarioStepSchema).default([]),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// Chaos Engineering
export const ChaosConfigSchema = z.object({
	enabled: z.boolean().default(false),
	failures: z.array(
		z.object({
			type: z.enum([
				'network_failure',
				'timeout',
				'crash',
				'data_corruption',
				'resource_exhaustion',
				'slow_response',
				'dns_failure',
				'certificate_error',
			]),
			probability: z.number().min(0).max(1),
			targets: z.array(z.string()).optional(), // Node IDs
			duration: z.number().optional(), // ms
			parameters: z.record(z.unknown()).optional(),
		}),
	),
	randomSeed: z.number().optional(),
});

export type ChaosConfig = z.infer<typeof ChaosConfigSchema>;

// Network Conditions
export const NetworkConditionSchema = z.object({
	latency: z.object({
		min: z.number().min(0).default(0),
		max: z.number().min(0).default(0),
		distribution: z.enum(['constant', 'uniform', 'normal', 'exponential']).default('constant'),
	}),
	bandwidth: z
		.object({
			download: z.number().min(0).optional(), // bytes/sec
			upload: z.number().min(0).optional(), // bytes/sec
		})
		.optional(),
	packetLoss: z.number().min(0).max(1).default(0),
	jitter: z.number().min(0).default(0), // ms
	corruption: z.number().min(0).max(1).default(0), // probability
	duplicate: z.number().min(0).max(1).default(0), // probability
	reorder: z.number().min(0).max(1).default(0), // probability
});

export type NetworkCondition = z.infer<typeof NetworkConditionSchema>;

// Recording
export const RecordingSchema = z.object({
	id: z.string(),
	workflowId: z.string(),
	executionId: z.string(),
	startedAt: z.string(),
	completedAt: z.string(),
	duration: z.number(),
	events: z.array(
		z.object({
			timestamp: z.number(),
			type: z.enum([
				'execution_start',
				'execution_end',
				'node_start',
				'node_end',
				'data_in',
				'data_out',
				'error',
				'external_call',
			]),
			nodeId: z.string().optional(),
			data: z.record(z.unknown()).optional(),
		}),
	),
	externalCalls: z.array(
		z.object({
			timestamp: z.number(),
			method: z.string(),
			url: z.string(),
			headers: z.record(z.string()).optional(),
			body: z.unknown().optional(),
			response: z
				.object({
					status: z.number(),
					headers: z.record(z.string()).optional(),
					body: z.unknown().optional(),
					duration: z.number(),
				})
				.optional(),
		}),
	),
	metadata: z.record(z.unknown()).optional(),
});

export type Recording = z.infer<typeof RecordingSchema>;

// Playback
export const PlaybackConfigSchema = z.object({
	recordingId: z.string(),
	speed: z.number().min(0.1).max(100).default(1),
	stepByStep: z.boolean().default(false),
	breakpoints: z.array(z.string()).default([]), // Node IDs
	mockExternalCalls: z.boolean().default(true),
	strictMode: z.boolean().default(false), // Fail on any difference
});

export type PlaybackConfig = z.infer<typeof PlaybackConfigSchema>;

export const PlaybackResultSchema = z.object({
	recordingId: z.string(),
	success: z.boolean(),
	differences: z.array(
		z.object({
			type: z.enum(['data', 'timing', 'error', 'external_call']),
			nodeId: z.string().optional(),
			expected: z.unknown(),
			actual: z.unknown(),
			message: z.string(),
		}),
	),
	duration: z.number(),
	events: z.array(z.unknown()),
});

export type PlaybackResult = z.infer<typeof PlaybackResultSchema>;

// Load Testing
export const LoadTestConfigSchema = z.object({
	workflowId: z.string(),
	duration: z.number().min(1000), // ms
	concurrency: z.object({
		start: z.number().min(1),
		max: z.number().min(1),
		rampUp: z.number().min(0), // ms to reach max
	}),
	rampPattern: z.enum(['linear', 'exponential', 'step']).default('linear'),
	sustainedLoad: z.boolean().default(false),
	throttle: z
		.object({
			requestsPerSecond: z.number().min(1).optional(),
			requestsPerMinute: z.number().min(1).optional(),
		})
		.optional(),
	thresholds: z
		.object({
			maxLatency: z.number().optional(), // ms
			minSuccessRate: z.number().min(0).max(1).optional(),
			maxErrorRate: z.number().min(0).max(1).optional(),
		})
		.optional(),
});

export type LoadTestConfig = z.infer<typeof LoadTestConfigSchema>;

export const LoadTestResultSchema = z.object({
	id: z.string(),
	config: LoadTestConfigSchema,
	metrics: z.object({
		totalRequests: z.number(),
		successfulRequests: z.number(),
		failedRequests: z.number(),
		successRate: z.number(),
		duration: z.number(),
		throughput: z.number(), // requests/sec
		latency: z.object({
			min: z.number(),
			max: z.number(),
			mean: z.number(),
			median: z.number(),
			p50: z.number(),
			p75: z.number(),
			p90: z.number(),
			p95: z.number(),
			p99: z.number(),
		}),
		errors: z.record(z.number()), // error type -> count
	}),
	timeSeries: z.array(
		z.object({
			timestamp: z.number(),
			concurrency: z.number(),
			throughput: z.number(),
			latency: z.number(),
			errorRate: z.number(),
		}),
	),
	thresholdViolations: z.array(
		z.object({
			metric: z.string(),
			threshold: z.number(),
			actual: z.number(),
			timestamp: z.number(),
		}),
	),
	startedAt: z.string(),
	completedAt: z.string(),
});

export type LoadTestResult = z.infer<typeof LoadTestResultSchema>;

// Comparison
export const ComparisonResultSchema = z.object({
	similar: z.boolean(),
	similarity: z.number().min(0).max(1), // 0-1
	differences: z.array(
		z.object({
			path: z.string(),
			type: z.enum(['value', 'type', 'missing', 'extra']),
			expected: z.unknown(),
			actual: z.unknown(),
		}),
	),
	performanceDelta: z
		.object({
			duration: z.number(), // percentage change
			memory: z.number().optional(),
			throughput: z.number().optional(),
		})
		.optional(),
});

export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

// Batch Results
export const BatchResultSchema = z.object({
	id: z.string(),
	results: z.array(SimulationResultSchema),
	aggregateMetrics: z.object({
		totalExecutions: z.number(),
		totalWorkflows: z.number(),
		averageSuccessRate: z.number(),
		averageDuration: z.number(),
		totalErrors: z.number(),
	}),
	duration: z.number(),
	startedAt: z.string(),
	completedAt: z.string(),
});

export type BatchResult = z.infer<typeof BatchResultSchema>;

// Visualization Data
export const TimelineDataSchema = z.object({
	events: z.array(
		z.object({
			time: z.number(),
			type: z.string(),
			label: z.string(),
			duration: z.number().optional(),
			metadata: z.record(z.unknown()).optional(),
		}),
	),
	lanes: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			events: z.array(z.number()), // indices into events array
		}),
	),
});

export type TimelineData = z.infer<typeof TimelineDataSchema>;

export const HeatmapDataSchema = z.object({
	data: z.array(
		z.array(
			z.object({
				value: z.number(),
				label: z.string().optional(),
			}),
		),
	),
	xLabels: z.array(z.string()),
	yLabels: z.array(z.string()),
	colorScale: z
		.object({
			min: z.number(),
			max: z.number(),
			colors: z.array(z.string()),
		})
		.optional(),
});

export type HeatmapData = z.infer<typeof HeatmapDataSchema>;

// Reports
export const SimulationReportSchema = z.object({
	id: z.string(),
	title: z.string(),
	summary: z.object({
		totalExecutions: z.number(),
		successRate: z.number(),
		averageDuration: z.number(),
		totalErrors: z.number(),
		recommendations: z.array(z.string()),
	}),
	sections: z.array(
		z.object({
			title: z.string(),
			type: z.enum(['metrics', 'chart', 'table', 'text']),
			data: z.unknown(),
		}),
	),
	failures: z.array(
		z.object({
			type: z.string(),
			count: z.number(),
			percentage: z.number(),
			examples: z.array(z.string()),
			recommendation: z.string().optional(),
		}),
	),
	performance: z.object({
		trends: z.array(
			z.object({
				metric: z.string(),
				trend: z.enum(['improving', 'degrading', 'stable']),
				change: z.number(),
			}),
		),
		bottlenecks: z.array(
			z.object({
				nodeId: z.string(),
				impact: z.number(),
				suggestion: z.string(),
			}),
		),
	}),
	generatedAt: z.string(),
});

export type SimulationReport = z.infer<typeof SimulationReportSchema>;

// Database Models
export interface SimulationRecord {
	id: string;
	workflow_id: string;
	config: SimulationConfig;
	result: SimulationResult | null;
	status: 'pending' | 'running' | 'completed' | 'failed';
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	created_by: string;
}

export interface RecordingRecord {
	id: string;
	workflow_id: string;
	execution_id: string;
	recording: Recording;
	size_bytes: number;
	created_at: string;
	created_by: string;
}

export interface ScenarioRecord {
	id: string;
	name: string;
	description: string | null;
	scenario: Scenario;
	tags: string[];
	is_public: boolean;
	created_at: string;
	updated_at: string;
	created_by: string;
}

export interface LoadTestRecord {
	id: string;
	workflow_id: string;
	config: LoadTestConfig;
	result: LoadTestResult | null;
	status: 'pending' | 'running' | 'completed' | 'failed';
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	created_by: string;
}
