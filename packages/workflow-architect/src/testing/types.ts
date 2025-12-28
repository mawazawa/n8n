/**
 * Workflow Testing Framework Type Definitions
 * Comprehensive types for testing n8n workflows
 */

export type AssertionType = 'equals' | 'contains' | 'matches' | 'exists' | 'type' | 'length' | 'range' | 'custom';
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  workflowId: string;
  setup?: TestSetup;
  input: Record<string, unknown>;
  assertions: Assertion[];
  timeout?: number;
  retries?: number;
  tags?: string[];
}

export interface Assertion {
  id: string;
  type: AssertionType;
  target: string; // JSONPath to value
  expected?: unknown;
  operator?: string;
  message?: string;
}

export interface TestSetup {
  mocks: MockDefinition[];
  fixtures: string[];
  environment?: Record<string, string>;
}

export interface MockDefinition {
  nodeType: string;
  nodeName?: string;
  response: unknown;
  delay?: number;
  errorRate?: number;
}

export interface TestResult {
  testId: string;
  status: TestStatus;
  duration: number;
  assertions: AssertionResult[];
  output?: Record<string, unknown>;
  error?: { message: string; stack?: string };
  coverage?: CoverageInfo;
}

export interface AssertionResult {
  assertionId: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  message?: string;
}

export interface CoverageInfo {
  totalNodes: number;
  executedNodes: number;
  percentage: number;
  uncoveredNodes: string[];
}

export interface TestSuite {
  id: string;
  name: string;
  tests: TestCase[];
  beforeAll?: TestSetup;
  afterAll?: () => Promise<void>;
}

export interface TestRunOptions {
  parallel?: boolean;
  maxConcurrency?: number;
  bail?: boolean; // Stop on first failure
  grep?: string; // Run tests matching pattern
  retries?: number;
  timeout?: number;
  reporter?: string;
  coverage?: boolean;
}

export interface TestExecutionContext {
  testId: string;
  workflowId: string;
  mocks: Map<string, MockDefinition>;
  fixtures: Map<string, unknown>;
  environment: Record<string, string>;
  startTime: number;
}

export interface SnapshotMetadata {
  testId: string;
  testName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Snapshot {
  id: string;
  metadata: SnapshotMetadata;
  data: unknown;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  changed: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

export interface RecordedExecution {
  id: string;
  workflowId: string;
  timestamp: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  nodeExecutions: RecordedNodeExecution[];
  duration: number;
  status: 'success' | 'error';
  error?: { message: string; stack?: string };
}

export interface RecordedNodeExecution {
  nodeName: string;
  nodeType: string;
  input: unknown;
  output: unknown;
  duration: number;
  error?: string;
}

export interface TestReport {
  summary: TestSummary;
  results: TestResult[];
  coverage?: CoverageReport;
  duration: number;
  timestamp: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
}

export interface CoverageReport {
  overall: CoverageInfo;
  byWorkflow: Record<string, CoverageInfo>;
  uncoveredPaths: string[];
}

export interface FixtureSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, FixtureSchema>;
  items?: FixtureSchema;
  required?: string[];
  default?: unknown;
  generate?: () => unknown;
}

export interface MockRequest {
  nodeType: string;
  nodeName: string;
  input: unknown;
  timestamp: number;
}

export interface MockResponse {
  output: unknown;
  duration: number;
  timestamp: number;
}

export interface MockInterception {
  request: MockRequest;
  response: MockResponse;
}

export interface TestConfig {
  testDir?: string;
  fixtureDir?: string;
  snapshotDir?: string;
  coverageThreshold?: number;
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  maxConcurrency?: number;
  reporters?: string[];
  setupFiles?: string[];
}

export interface AssertionError extends Error {
  assertion: Assertion;
  actual: unknown;
  expected: unknown;
  operator?: string;
}
