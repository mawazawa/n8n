/**
 * Workflow Testing Framework
 * Comprehensive testing tools for n8n workflow validation
 *
 * @module testing
 */

// Types
export * from './types.js';

// Core Testing
export { TestRunner, ProgressReporter, TestRunnerEvents } from './runner.js';
export { AssertionLibrary, JSONPathEvaluator, Expect, expect } from './assertions.js';

// Mocking
export { MockSystem, MockBuilder, mock, MockPresets } from './mocks.js';

// Fixtures
export { FixtureManager, DataFactory, FixtureTemplate, template, FixtureTemplates } from './fixtures.js';

// Coverage
export { CoverageAnalyzer, WorkflowCoverageTracker } from './coverage.js';

// Snapshots
export { SnapshotTester, SnapshotMatcher, SnapshotUtils } from './snapshots.js';

// Replay
export { ExecutionReplay, RegressionDetector } from './replay.js';

// Reporters
export {
  Reporter,
  ConsoleReporter,
  JsonReporter,
  JUnitReporter,
  HtmlReporter,
  TapReporter,
  MultiReporter,
} from './reporters.js';

// CLI
export { TestCLI, ConfigLoader, TestDiscovery } from './cli.js';
