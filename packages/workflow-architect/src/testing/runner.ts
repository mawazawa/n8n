/**
 * Test Runner for Workflow Testing
 * Executes test cases and suites with parallel execution support
 */

import {
  TestCase,
  TestSuite,
  TestResult,
  TestRunOptions,
  TestStatus,
  TestExecutionContext,
  AssertionResult,
} from './types.js';
import { AssertionLibrary } from './assertions.js';
import { MockSystem } from './mocks.js';
import { FixtureManager } from './fixtures.js';
import { CoverageAnalyzer } from './coverage.js';

/**
 * Event emitter for test runner events
 */
export class TestRunnerEvents {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, listener: (...args: any[]) => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * Main test runner for executing workflow tests
 */
export class TestRunner {
  private mockSystem: MockSystem;
  private fixtureManager: FixtureManager;
  private coverageAnalyzer: CoverageAnalyzer;
  private events: TestRunnerEvents;
  private activeTests = 0;

  constructor(
    mockSystem?: MockSystem,
    fixtureManager?: FixtureManager,
    coverageAnalyzer?: CoverageAnalyzer
  ) {
    this.mockSystem = mockSystem ?? new MockSystem();
    this.fixtureManager = fixtureManager ?? new FixtureManager();
    this.coverageAnalyzer = coverageAnalyzer ?? new CoverageAnalyzer();
    this.events = new TestRunnerEvents();
  }

  /**
   * Run a single test case
   */
  async run(test: TestCase, options: TestRunOptions = {}): Promise<TestResult> {
    const startTime = Date.now();
    const context = await this.setupTest(test);

    this.events.emit('test:start', test);
    this.activeTests++;

    try {
      // Execute with retries
      const maxAttempts = (options.retries ?? test.retries ?? 0) + 1;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await this.executeTest(test, context, options);

          this.activeTests--;
          this.events.emit('test:complete', test, result);

          return result;
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxAttempts - 1) {
            this.events.emit('test:retry', test, attempt + 1, lastError);
            // Brief delay before retry
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      // All retries failed
      const result: TestResult = {
        testId: test.id,
        status: 'failed',
        duration: Date.now() - startTime,
        assertions: [],
        error: {
          message: lastError?.message ?? 'Test failed',
          stack: lastError?.stack,
        },
      };

      this.activeTests--;
      this.events.emit('test:complete', test, result);

      return result;
    } catch (error) {
      this.activeTests--;

      const result: TestResult = {
        testId: test.id,
        status: 'failed',
        duration: Date.now() - startTime,
        assertions: [],
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };

      this.events.emit('test:complete', test, result);
      return result;
    } finally {
      await this.teardownTest(context);
    }
  }

  /**
   * Run a test suite
   */
  async runSuite(suite: TestSuite, options: TestRunOptions = {}): Promise<TestResult[]> {
    this.events.emit('suite:start', suite);

    // Setup suite
    if (suite.beforeAll) {
      await this.setupSuite(suite);
    }

    try {
      // Filter tests by grep pattern if provided
      let tests = suite.tests;
      if (options.grep) {
        const pattern = new RegExp(options.grep);
        tests = tests.filter(t => pattern.test(t.name) || pattern.test(t.description ?? ''));
      }

      // Run tests (parallel or sequential)
      const results = options.parallel
        ? await this.runParallel(tests, options)
        : await this.runSequential(tests, options);

      this.events.emit('suite:complete', suite, results);

      return results;
    } finally {
      // Teardown suite
      if (suite.afterAll) {
        await suite.afterAll();
      }
    }
  }

  /**
   * Run all tests from multiple suites
   */
  async runAll(suites: TestSuite[], options: TestRunOptions = {}): Promise<TestResult[]> {
    const allResults: TestResult[] = [];

    for (const suite of suites) {
      const results = await this.runSuite(suite, options);
      allResults.push(...results);

      // Bail on first failure if option is set
      if (options.bail && results.some(r => r.status === 'failed')) {
        this.events.emit('run:bail');
        break;
      }
    }

    return allResults;
  }

  /**
   * Setup test execution context
   */
  private async setupTest(test: TestCase): Promise<TestExecutionContext> {
    const context: TestExecutionContext = {
      testId: test.id,
      workflowId: test.workflowId,
      mocks: new Map(),
      fixtures: new Map(),
      environment: {},
      startTime: Date.now(),
    };

    // Setup mocks
    if (test.setup?.mocks) {
      for (const mock of test.setup.mocks) {
        this.mockSystem.mockNode(mock.nodeType, mock.response, {
          nodeName: mock.nodeName,
          delay: mock.delay,
          errorRate: mock.errorRate,
        });
        context.mocks.set(mock.nodeType, mock);
      }
    }

    // Load fixtures
    if (test.setup?.fixtures) {
      for (const fixtureName of test.setup.fixtures) {
        const fixture = await this.fixtureManager.load(fixtureName);
        context.fixtures.set(fixtureName, fixture);
      }
    }

    // Setup environment
    if (test.setup?.environment) {
      context.environment = { ...test.setup.environment };
    }

    return context;
  }

  /**
   * Execute a single test
   */
  private async executeTest(
    test: TestCase,
    context: TestExecutionContext,
    options: TestRunOptions
  ): Promise<TestResult> {
    const startTime = Date.now();
    const timeout = options.timeout ?? test.timeout ?? 30000;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout);
    });

    // Execute test with timeout
    const result = await Promise.race([
      this.executeTestWithAssertion(test, context, options),
      timeoutPromise,
    ]);

    const duration = Date.now() - startTime;
    return { ...result, duration };
  }

  /**
   * Execute test and run assertions
   */
  private async executeTestWithAssertion(
    test: TestCase,
    context: TestExecutionContext,
    options: TestRunOptions
  ): Promise<TestResult> {
    // Simulate workflow execution
    // In a real implementation, this would integrate with n8n's execution engine
    const output = await this.executeWorkflow(test.workflowId, test.input, context);

    // Run assertions
    const assertionResults: AssertionResult[] = [];
    let allPassed = true;

    for (const assertion of test.assertions) {
      const result = await AssertionLibrary.execute(assertion, output);
      assertionResults.push(result);

      if (!result.passed) {
        allPassed = false;
      }
    }

    // Get coverage if enabled
    let coverage;
    if (options.coverage) {
      coverage = this.coverageAnalyzer.getCoverage(test.workflowId);
    }

    return {
      testId: test.id,
      status: allPassed ? 'passed' : 'failed',
      duration: 0, // Will be set by caller
      assertions: assertionResults,
      output,
      coverage,
    };
  }

  /**
   * Execute workflow (simulated)
   * In production, this would integrate with n8n's execution engine
   */
  private async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown>,
    context: TestExecutionContext
  ): Promise<Record<string, unknown>> {
    // This is a simplified simulation
    // Real implementation would execute the actual workflow

    this.events.emit('workflow:start', workflowId, input);

    // Simulate workflow execution with mocks
    const result = {
      workflowId,
      executionId: crypto.randomUUID(),
      input,
      output: input, // In real implementation, this would be actual workflow output
      status: 'success',
      timestamp: new Date().toISOString(),
    };

    this.events.emit('workflow:complete', workflowId, result);

    return result;
  }

  /**
   * Teardown test context
   */
  private async teardownTest(context: TestExecutionContext): Promise<void> {
    // Clear mocks for this test
    for (const nodeType of context.mocks.keys()) {
      this.mockSystem.clearMock(nodeType);
    }
  }

  /**
   * Setup test suite
   */
  private async setupSuite(suite: TestSuite): Promise<void> {
    if (!suite.beforeAll) return;

    // Setup mocks
    if (suite.beforeAll.mocks) {
      for (const mock of suite.beforeAll.mocks) {
        this.mockSystem.mockNode(mock.nodeType, mock.response, {
          nodeName: mock.nodeName,
          delay: mock.delay,
          errorRate: mock.errorRate,
        });
      }
    }

    // Load fixtures
    if (suite.beforeAll.fixtures) {
      for (const fixtureName of suite.beforeAll.fixtures) {
        await this.fixtureManager.load(fixtureName);
      }
    }
  }

  /**
   * Run tests sequentially
   */
  private async runSequential(
    tests: TestCase[],
    options: TestRunOptions
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const test of tests) {
      const result = await this.run(test, options);
      results.push(result);

      // Bail on first failure if option is set
      if (options.bail && result.status === 'failed') {
        break;
      }
    }

    return results;
  }

  /**
   * Run tests in parallel
   */
  private async runParallel(
    tests: TestCase[],
    options: TestRunOptions
  ): Promise<TestResult[]> {
    const maxConcurrency = options.maxConcurrency ?? 5;
    const results: TestResult[] = [];
    const queue = [...tests];

    while (queue.length > 0) {
      // Get batch of tests
      const batch = queue.splice(0, maxConcurrency);

      // Run batch in parallel
      const batchResults = await Promise.all(
        batch.map(test => this.run(test, options))
      );

      results.push(...batchResults);

      // Bail on first failure if option is set
      if (options.bail && batchResults.some(r => r.status === 'failed')) {
        break;
      }
    }

    return results;
  }

  /**
   * Get event emitter for listening to test events
   */
  getEvents(): TestRunnerEvents {
    return this.events;
  }

  /**
   * Get number of active tests
   */
  getActiveTestCount(): number {
    return this.activeTests;
  }

  /**
   * Get mock system
   */
  getMockSystem(): MockSystem {
    return this.mockSystem;
  }

  /**
   * Get fixture manager
   */
  getFixtureManager(): FixtureManager {
    return this.fixtureManager;
  }

  /**
   * Get coverage analyzer
   */
  getCoverageAnalyzer(): CoverageAnalyzer {
    return this.coverageAnalyzer;
  }
}

/**
 * Progress reporter for test execution
 */
export class ProgressReporter {
  private total = 0;
  private completed = 0;
  private passed = 0;
  private failed = 0;
  private skipped = 0;

  constructor(private runner: TestRunner) {
    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    const events = this.runner.getEvents();

    events.on('suite:start', (suite: TestSuite) => {
      this.total += suite.tests.length;
      this.logProgress();
    });

    events.on('test:complete', (test: TestCase, result: TestResult) => {
      this.completed++;

      if (result.status === 'passed') {
        this.passed++;
      } else if (result.status === 'failed') {
        this.failed++;
      } else if (result.status === 'skipped') {
        this.skipped++;
      }

      this.logProgress();
    });
  }

  /**
   * Log progress
   */
  private logProgress(): void {
    const percentage = this.total > 0 ? Math.round((this.completed / this.total) * 100) : 0;
    console.log(
      `Progress: ${this.completed}/${this.total} (${percentage}%) - ` +
      `Passed: ${this.passed}, Failed: ${this.failed}, Skipped: ${this.skipped}`
    );
  }

  /**
   * Get summary
   */
  getSummary(): {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
  } {
    return {
      total: this.total,
      completed: this.completed,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
    };
  }
}
