/**
 * Command-Line Interface for Workflow Testing
 * Provides CLI commands for running tests, managing snapshots, and viewing coverage
 */

import fs from 'fs/promises';
import path from 'path';
import { TestRunner, ProgressReporter } from './runner.js';
import { TestSuite, TestCase, TestRunOptions, TestConfig } from './types.js';
import { MockSystem } from './mocks.js';
import { FixtureManager } from './fixtures.js';
import { CoverageAnalyzer } from './coverage.js';
import { SnapshotTester } from './snapshots.js';
import { ExecutionReplay } from './replay.js';
import {
  ConsoleReporter,
  JsonReporter,
  JUnitReporter,
  HtmlReporter,
  MultiReporter,
  Reporter,
} from './reporters.js';

/**
 * Main CLI class for workflow testing
 */
export class TestCLI {
  private config: TestConfig;
  private runner: TestRunner;
  private mockSystem: MockSystem;
  private fixtureManager: FixtureManager;
  private coverageAnalyzer: CoverageAnalyzer;
  private snapshotTester: SnapshotTester;
  private executionReplay: ExecutionReplay;

  constructor(config?: Partial<TestConfig>) {
    this.config = {
      testDir: './tests',
      fixtureDir: './fixtures',
      snapshotDir: './__snapshots__',
      coverageThreshold: 80,
      timeout: 30000,
      retries: 0,
      parallel: false,
      maxConcurrency: 5,
      reporters: ['console'],
      setupFiles: [],
      ...config,
    };

    this.mockSystem = new MockSystem();
    this.fixtureManager = new FixtureManager(this.config.fixtureDir);
    this.coverageAnalyzer = new CoverageAnalyzer();
    this.snapshotTester = new SnapshotTester(this.config.snapshotDir);
    this.executionReplay = new ExecutionReplay();

    this.runner = new TestRunner(
      this.mockSystem,
      this.fixtureManager,
      this.coverageAnalyzer
    );
  }

  /**
   * Run tests command
   */
  async run(options: {
    grep?: string;
    bail?: boolean;
    parallel?: boolean;
    coverage?: boolean;
    updateSnapshots?: boolean;
  } = {}): Promise<void> {
    console.log('Starting workflow tests...\n');

    // Update snapshot mode if requested
    if (options.updateSnapshots) {
      this.snapshotTester.enableUpdateMode();
    }

    // Load test suites
    const suites = await this.loadTestSuites();

    if (suites.length === 0) {
      console.log('No test suites found.');
      return;
    }

    // Create reporters
    const reporters = this.createReporters();
    const multiReporter = new MultiReporter(reporters);

    // Setup progress reporter
    const progressReporter = new ProgressReporter(this.runner);

    // Run options
    const runOptions: TestRunOptions = {
      grep: options.grep,
      bail: options.bail ?? false,
      parallel: options.parallel ?? this.config.parallel,
      maxConcurrency: this.config.maxConcurrency,
      timeout: this.config.timeout,
      retries: this.config.retries,
      coverage: options.coverage ?? false,
    };

    // Setup event listeners
    const events = this.runner.getEvents();

    events.on('test:start', (test: TestCase) => {
      multiReporter.onTestStart?.(test.id);
    });

    events.on('test:complete', (test: TestCase, result: any) => {
      multiReporter.onTestComplete?.(result);
    });

    // Run tests
    const results = await this.runner.runAll(suites, runOptions);

    // Generate reports
    console.log(await multiReporter.generateReport(results));

    // Show coverage if enabled
    if (options.coverage) {
      await this.showCoverage();
    }

    // Exit with error code if tests failed
    const failed = results.filter(r => r.status === 'failed').length;
    if (failed > 0) {
      process.exit(1);
    }
  }

  /**
   * Watch mode - run tests on file changes
   */
  async watch(): Promise<void> {
    console.log('Starting watch mode...\n');

    // Initial run
    await this.run({ coverage: false });

    // In a real implementation, would watch for file changes
    // and re-run tests automatically
    console.log('\nWatching for file changes...');
  }

  /**
   * Show coverage report
   */
  async coverage(): Promise<void> {
    await this.showCoverage();
  }

  /**
   * Snapshot management commands
   */
  async snapshot(action: 'list' | 'update' | 'delete', name?: string): Promise<void> {
    switch (action) {
      case 'list':
        await this.listSnapshots();
        break;
      case 'update':
        if (name) {
          console.log(`Updating snapshot: ${name}`);
          await this.run({ updateSnapshots: true, grep: name });
        } else {
          console.log('Updating all snapshots...');
          await this.run({ updateSnapshots: true });
        }
        break;
      case 'delete':
        if (name) {
          await this.snapshotTester.deleteSnapshot(name);
          console.log(`Deleted snapshot: ${name}`);
        } else {
          console.log('Delete all snapshots requires confirmation.');
        }
        break;
      default:
        console.log('Unknown snapshot action. Use: list, update, or delete');
    }
  }

  /**
   * Initialize test configuration
   */
  async init(): Promise<void> {
    console.log('Initializing workflow testing...');

    // Create directories
    await fs.mkdir(this.config.testDir!, { recursive: true });
    await fs.mkdir(this.config.fixtureDir!, { recursive: true });
    await fs.mkdir(this.config.snapshotDir!, { recursive: true });

    // Create sample config file
    const configPath = path.join(process.cwd(), 'workflow-test.config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );

    // Create sample test file
    const sampleTest = this.generateSampleTest();
    const testPath = path.join(this.config.testDir!, 'sample.test.json');
    await fs.writeFile(testPath, JSON.stringify(sampleTest, null, 2), 'utf-8');

    console.log('\nInitialization complete!');
    console.log(`\nConfiguration: ${configPath}`);
    console.log(`Sample test: ${testPath}`);
    console.log('\nNext steps:');
    console.log('  1. Edit the sample test file');
    console.log('  2. Run tests with: workflow-test run');
  }

  /**
   * Load test suites from directory
   */
  private async loadTestSuites(): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];

    try {
      const files = await fs.readdir(this.config.testDir!);

      for (const file of files) {
        if (file.endsWith('.test.json')) {
          const filePath = path.join(this.config.testDir!, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const suite = JSON.parse(content) as TestSuite;
          suites.push(suite);
        }
      }
    } catch (error) {
      console.error('Error loading test suites:', error);
    }

    return suites;
  }

  /**
   * Create reporters based on configuration
   */
  private createReporters(): Reporter[] {
    const reporters: Reporter[] = [];

    for (const reporterName of this.config.reporters ?? ['console']) {
      switch (reporterName) {
        case 'console':
          reporters.push(new ConsoleReporter(true));
          break;
        case 'json':
          reporters.push(new JsonReporter('./test-results.json'));
          break;
        case 'junit':
          reporters.push(new JUnitReporter('./test-results.xml'));
          break;
        case 'html':
          reporters.push(new HtmlReporter('./test-results.html'));
          break;
        default:
          console.warn(`Unknown reporter: ${reporterName}`);
      }
    }

    return reporters;
  }

  /**
   * Show coverage report
   */
  private async showCoverage(): Promise<void> {
    const report = this.coverageAnalyzer.getReport();

    console.log('\n' + '='.repeat(60));
    console.log('Coverage Report');
    console.log('='.repeat(60));
    console.log(`Overall: ${report.overall.executedNodes}/${report.overall.totalNodes} nodes (${report.overall.percentage.toFixed(1)}%)`);

    if (this.config.coverageThreshold && report.overall.percentage < this.config.coverageThreshold) {
      console.log(`\n⚠ Coverage is below threshold of ${this.config.coverageThreshold}%`);
    }

    console.log('\nBy Workflow:');
    for (const [workflowId, coverage] of Object.entries(report.byWorkflow)) {
      const status = coverage.percentage >= (this.config.coverageThreshold ?? 0) ? '✓' : '✗';
      console.log(`  ${status} ${workflowId}: ${coverage.percentage.toFixed(1)}%`);

      if (coverage.uncoveredNodes.length > 0) {
        console.log(`    Uncovered: ${coverage.uncoveredNodes.join(', ')}`);
      }
    }

    // Generate HTML report
    const htmlReport = this.coverageAnalyzer.generateHtmlReport();
    const reportPath = path.join(process.cwd(), 'coverage-report.html');
    await fs.writeFile(reportPath, htmlReport, 'utf-8');
    console.log(`\nHTML report saved to: ${reportPath}`);
  }

  /**
   * List snapshots
   */
  private async listSnapshots(): Promise<void> {
    const snapshots = await this.snapshotTester.listSnapshots();

    console.log('\nSnapshots:');
    if (snapshots.length === 0) {
      console.log('  No snapshots found.');
      return;
    }

    for (const name of snapshots) {
      const metadata = await this.snapshotTester.getMetadata(name);
      if (metadata) {
        console.log(`  ${name} (v${metadata.version}, updated ${metadata.updatedAt})`);
      } else {
        console.log(`  ${name}`);
      }
    }
  }

  /**
   * Generate sample test
   */
  private generateSampleTest(): TestSuite {
    return {
      id: 'sample-suite',
      name: 'Sample Test Suite',
      tests: [
        {
          id: 'test-1',
          name: 'Sample workflow test',
          description: 'Tests a simple workflow execution',
          workflowId: 'sample-workflow',
          input: {
            message: 'Hello, World!',
          },
          assertions: [
            {
              id: 'assert-1',
              type: 'equals',
              target: '$.output.message',
              expected: 'Hello, World!',
              message: 'Output message should match input',
            },
          ],
          timeout: 5000,
        },
      ],
    };
  }

  /**
   * Parse CLI arguments and execute command
   */
  static async main(args: string[]): Promise<void> {
    const [command, ...restArgs] = args;

    const cli = new TestCLI();

    switch (command) {
      case 'run':
        await cli.run({
          grep: restArgs.includes('--grep') ? restArgs[restArgs.indexOf('--grep') + 1] : undefined,
          bail: restArgs.includes('--bail'),
          parallel: restArgs.includes('--parallel'),
          coverage: restArgs.includes('--coverage'),
          updateSnapshots: restArgs.includes('--update-snapshots') || restArgs.includes('-u'),
        });
        break;

      case 'watch':
        await cli.watch();
        break;

      case 'coverage':
        await cli.coverage();
        break;

      case 'snapshot':
        const action = restArgs[0] as 'list' | 'update' | 'delete';
        const name = restArgs[1];
        await cli.snapshot(action, name);
        break;

      case 'init':
        await cli.init();
        break;

      default:
        console.log('Workflow Test CLI\n');
        console.log('Commands:');
        console.log('  run [options]       Run tests');
        console.log('    --grep <pattern>    Filter tests by pattern');
        console.log('    --bail              Stop on first failure');
        console.log('    --parallel          Run tests in parallel');
        console.log('    --coverage          Show coverage report');
        console.log('    --update-snapshots  Update snapshots');
        console.log('  watch               Watch mode');
        console.log('  coverage            Show coverage report');
        console.log('  snapshot <action>   Manage snapshots (list, update, delete)');
        console.log('  init                Initialize test configuration');
    }
  }
}

/**
 * Configuration file loader
 */
export class ConfigLoader {
  /**
   * Load configuration from file
   */
  static async loadConfig(configPath?: string): Promise<TestConfig> {
    const paths = [
      configPath,
      'workflow-test.config.json',
      'workflow-test.config.js',
      '.workflow-testrc.json',
    ].filter(Boolean) as string[];

    for (const path of paths) {
      try {
        const content = await fs.readFile(path, 'utf-8');
        return JSON.parse(content) as TestConfig;
      } catch {
        // Try next path
      }
    }

    // Return default config
    return {
      testDir: './tests',
      fixtureDir: './fixtures',
      snapshotDir: './__snapshots__',
      coverageThreshold: 80,
      timeout: 30000,
      retries: 0,
      parallel: false,
      maxConcurrency: 5,
      reporters: ['console'],
      setupFiles: [],
    };
  }

  /**
   * Save configuration to file
   */
  static async saveConfig(config: TestConfig, configPath = 'workflow-test.config.json'): Promise<void> {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

/**
 * Test discovery utilities
 */
export class TestDiscovery {
  /**
   * Discover test files in directory
   */
  static async discoverTests(dir: string, pattern = '**/*.test.{json,ts,js}'): Promise<string[]> {
    const tests: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.match(/\.test\.(json|ts|js)$/)) {
          tests.push(fullPath);
        }
      }
    }

    try {
      await walk(dir);
    } catch (error) {
      console.error('Error discovering tests:', error);
    }

    return tests;
  }

  /**
   * Load test from file
   */
  static async loadTest(filePath: string): Promise<TestSuite | TestCase> {
    const content = await fs.readFile(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    }

    // For .ts/.js files, would need to import and execute
    throw new Error('TypeScript/JavaScript test files not yet supported');
  }
}
