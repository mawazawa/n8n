/**
 * Workflow Simulation Environment
 * Phase 5 Action 2: Complete simulation system for workflow testing
 */

// Core engine
export { SimulationEngine, type WorkflowDefinition, type ExecutionContext } from './engine';

// Virtual clock
export { VirtualClock, getGlobalClock, setGlobalClock, resetGlobalClock } from './clock';

// Data generation
export { DataGenerator, CommonSchemas, type DataSchema } from './data-generator';

// Test scenarios
export {
	ScenarioBuilder,
	PredefinedScenarios,
	ScenarioComposer,
	AssertionHelpers,
} from './scenarios';

// Recording and playback
export { ExecutionRecorder, RecordingManager, type RecordingOptions } from './recorder';
export { PlaybackEngine, PlaybackComparator, PlaybackDebugger } from './playback';

// Chaos engineering
export { ChaosInjector, ChaosScenarios, type FailureType, type ChaosResult } from './chaos';

// Network simulation
export { NetworkSimulator, NetworkProfiles, NetworkEventLogger } from './network';

// Load testing
export { LoadTestRunner, LoadTestScenarios, type ExecutionResult } from './load';

// Comparison and analysis
export { ResultComparator } from './comparison';

// Visualization
export { SimulationVisualizer } from './visualization';

// Reporting
export { ReportBuilder } from './reports';

// REST API
export { SimulationAPI } from './api';

// Types
export type {
	SimulationConfig,
	SimulationResult,
	ExecutionMetrics,
	Scenario,
	ScenarioStep,
	ChaosConfig,
	NetworkCondition,
	Recording,
	PlaybackConfig,
	PlaybackResult,
	LoadTestConfig,
	LoadTestResult,
	ComparisonResult,
	BatchResult,
	TimelineData,
	HeatmapData,
	SimulationReport,
	SimulationRecord,
	RecordingRecord,
	ScenarioRecord,
	LoadTestRecord,
} from './types';

export {
	SimulationConfigSchema,
	SimulationResultSchema,
	ScenarioSchema,
	ChaosConfigSchema,
	NetworkConditionSchema,
	RecordingSchema,
	PlaybackConfigSchema,
	PlaybackResultSchema,
	LoadTestConfigSchema,
	LoadTestResultSchema,
	ComparisonResultSchema,
	SimulationReportSchema,
} from './types';

// Main Simulator class
import { SimulationEngine, type WorkflowDefinition } from './engine';
import { VirtualClock } from './clock';
import { DataGenerator } from './data-generator';
import { ExecutionRecorder, RecordingManager } from './recorder';
import { PlaybackEngine } from './playback';
import { ChaosInjector } from './chaos';
import { NetworkSimulator } from './network';
import { LoadTestRunner } from './load';
import { ResultComparator } from './comparison';
import { SimulationVisualizer } from './visualization';
import { ReportBuilder } from './reports';
import type {
	SimulationConfig,
	SimulationResult,
	Recording,
	PlaybackConfig,
	PlaybackResult,
	LoadTestConfig,
	LoadTestResult,
	ChaosConfig,
	NetworkCondition,
} from './types';

/**
 * Main Simulator class
 * Unified interface for all simulation functionality
 */
export class Simulator {
	private engine: SimulationEngine;
	private clock: VirtualClock;
	private dataGenerator: DataGenerator;
	private recorder: ExecutionRecorder;
	private recordingManager: RecordingManager;
	private playbackEngine: PlaybackEngine;
	private chaosInjector: ChaosInjector | null = null;
	private networkSimulator: NetworkSimulator | null = null;
	private loadTestRunner: LoadTestRunner;
	private comparator: ResultComparator;
	private visualizer: SimulationVisualizer;
	private reportBuilder: ReportBuilder;

	constructor(options: { seed?: number; chaosConfig?: ChaosConfig } = {}) {
		this.engine = new SimulationEngine(options.seed);
		this.clock = new VirtualClock();
		this.dataGenerator = new DataGenerator(options.seed);
		this.recorder = new ExecutionRecorder();
		this.recordingManager = new RecordingManager();
		this.playbackEngine = new PlaybackEngine();
		this.loadTestRunner = new LoadTestRunner();
		this.comparator = new ResultComparator();
		this.visualizer = new SimulationVisualizer();
		this.reportBuilder = new ReportBuilder();

		if (options.chaosConfig) {
			this.chaosInjector = new ChaosInjector(options.chaosConfig);
		}
	}

	/**
	 * Run a simulation
	 */
	async simulate(workflow: WorkflowDefinition, config: SimulationConfig): Promise<SimulationResult> {
		return this.engine.run(workflow, config);
	}

	/**
	 * Run simulations for multiple workflows
	 */
	async simulateBatch(workflows: WorkflowDefinition[], config: SimulationConfig) {
		return this.engine.runBatch(workflows, config);
	}

	/**
	 * Start recording an execution
	 */
	startRecording(workflowId: string, executionId: string): void {
		this.recorder.start(workflowId, executionId);
	}

	/**
	 * Stop recording and save
	 */
	async stopRecording(): Promise<Recording> {
		const recording = await this.recorder.stop();
		await this.recordingManager.save(recording);
		return recording;
	}

	/**
	 * Playback a recording
	 */
	async playback(recording: Recording, config: PlaybackConfig): Promise<PlaybackResult> {
		return this.playbackEngine.play(recording, config);
	}

	/**
	 * Run a load test
	 */
	async loadTest(
		executor: () => Promise<{ success: boolean; duration: number }>,
		config: LoadTestConfig,
	): Promise<LoadTestResult> {
		return this.loadTestRunner.run(executor, config);
	}

	/**
	 * Compare two simulation results
	 */
	compare(a: SimulationResult, b: SimulationResult) {
		return this.comparator.compare(a, b);
	}

	/**
	 * Generate visualization data
	 */
	visualize(result: SimulationResult) {
		return {
			timeline: this.visualizer.generateTimeline(result),
			latencyDistribution: this.visualizer.generateLatencyDistribution(result),
		};
	}

	/**
	 * Generate report
	 */
	generateReport(results: SimulationResult | SimulationResult[]) {
		return this.reportBuilder.build(results);
	}

	/**
	 * Enable chaos engineering
	 */
	enableChaos(config: ChaosConfig): void {
		if (!this.chaosInjector) {
			this.chaosInjector = new ChaosInjector(config);
		} else {
			this.chaosInjector.updateConfig(config);
			this.chaosInjector.enable();
		}
	}

	/**
	 * Disable chaos engineering
	 */
	disableChaos(): void {
		if (this.chaosInjector) {
			this.chaosInjector.disable();
		}
	}

	/**
	 * Set network conditions
	 */
	setNetworkConditions(conditions: NetworkCondition): void {
		if (!this.networkSimulator) {
			this.networkSimulator = new NetworkSimulator(conditions);
		} else {
			this.networkSimulator.setConditions(conditions);
		}
	}

	/**
	 * Generate mock data
	 */
	generateData(schema: Parameters<DataGenerator['generate']>[0]) {
		return this.dataGenerator.generate(schema);
	}

	/**
	 * Get virtual clock
	 */
	getClock(): VirtualClock {
		return this.clock;
	}

	/**
	 * Get recording manager
	 */
	getRecordingManager(): RecordingManager {
		return this.recordingManager;
	}

	/**
	 * Get chaos injector
	 */
	getChaosInjector(): ChaosInjector | null {
		return this.chaosInjector;
	}

	/**
	 * Get network simulator
	 */
	getNetworkSimulator(): NetworkSimulator | null {
		return this.networkSimulator;
	}

	/**
	 * Stop all running simulations
	 */
	stop(): void {
		this.engine.stop();
		this.loadTestRunner.stop();
		this.clock.stop();
	}

	/**
	 * Reset simulator state
	 */
	reset(): void {
		this.clock.reset();
		this.recorder = new ExecutionRecorder();
		if (this.chaosInjector) {
			this.chaosInjector.reset();
		}
		if (this.networkSimulator) {
			this.networkSimulator.resetStats();
		}
	}
}

/**
 * Convenience functions
 */

/**
 * Create a new simulator instance
 */
export function createSimulator(options?: { seed?: number; chaosConfig?: ChaosConfig }): Simulator {
	return new Simulator(options);
}

/**
 * Quick simulation run
 */
export async function quickSimulate(
	workflow: WorkflowDefinition,
	iterations: number = 100,
	seed?: number,
): Promise<SimulationResult> {
	const simulator = new Simulator({ seed });
	return simulator.simulate(workflow, {
		iterations,
		speed: 100, // 100x speed
		mockData: true,
		parallel: true,
		maxConcurrency: 10,
	});
}

/**
 * Quick load test
 */
export async function quickLoadTest(
	executor: () => Promise<{ success: boolean; duration: number }>,
	concurrency: number = 50,
): Promise<LoadTestResult> {
	const simulator = new Simulator();
	return simulator.loadTest(executor, {
		workflowId: 'quick-test',
		duration: 60000, // 1 minute
		concurrency: {
			start: 1,
			max: concurrency,
			rampUp: 10000, // 10 seconds
		},
		rampPattern: 'linear',
	});
}

/**
 * Export report to HTML
 */
export async function exportReportHTML(
	results: SimulationResult | SimulationResult[],
): Promise<string> {
	const reportBuilder = new ReportBuilder();
	const report = reportBuilder.build(results);
	return reportBuilder.exportToHTML(report);
}
