/**
 * Workflow Optimization Engine
 *
 * Comprehensive workflow analysis, optimization detection, and application system
 * with performance benchmarking and statistical analysis.
 */

export * from './types.js';
export * from './analyzer.js';
export * from './applier.js';
export * from './benchmark.js';
export * as detectors from './detectors/index.js';
export * as performanceDetectors from './detectors/performance.js';
export * as reliabilityDetectors from './detectors/reliability.js';

// Re-export main classes for convenience
export { WorkflowOptimizer } from './analyzer.js';
export { OptimizationApplier } from './applier.js';
export { WorkflowBenchmark } from './benchmark.js';
