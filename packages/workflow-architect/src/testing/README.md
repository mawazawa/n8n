# Workflow Testing Framework

Comprehensive testing framework for validating n8n workflows with automated test execution, coverage tracking, snapshot testing, and execution replay.

## Features

- **Automated Testing**: Execute workflow tests with input/output validation
- **90%+ Coverage Tracking**: Monitor node execution coverage across workflows
- **Sub-1s Execution**: Fast test runs for simple workflows
- **Mock System**: Intercept and mock node execution for isolated testing
- **Snapshot Testing**: Detect output changes with snapshot comparison
- **Execution Replay**: Record and replay executions for regression detection
- **Multiple Reporters**: Console, JSON, JUnit, HTML, and TAP formats
- **Parallel Execution**: Run tests concurrently for faster feedback
- **CLI Interface**: Command-line tools for test management

## Quick Start

### Installation

The testing framework is included in the workflow-architect package:

```typescript
import { TestRunner, MockSystem, expect } from '@n8n/workflow-architect/testing';
```

### Basic Test Example

```typescript
import { TestRunner, TestSuite } from '@n8n/workflow-architect/testing';

const suite: TestSuite = {
  id: 'my-workflow-tests',
  name: 'My Workflow Tests',
  tests: [
    {
      id: 'test-1',
      name: 'Should process data correctly',
      workflowId: 'my-workflow-id',
      input: {
        items: [{ name: 'Alice' }, { name: 'Bob' }]
      },
      assertions: [
        {
          id: 'assert-1',
          type: 'equals',
          target: '$.output.count',
          expected: 2,
          message: 'Should count items correctly'
        }
      ],
      timeout: 5000
    }
  ]
};

const runner = new TestRunner();
const results = await runner.runSuite(suite);
```

## Core Components

### TestRunner

Executes test cases and test suites with support for parallel execution and retries.

```typescript
const runner = new TestRunner();

// Run a single test
const result = await runner.run(testCase);

// Run a suite
const results = await runner.runSuite(suite, { parallel: true });

// Run all suites
const allResults = await runner.runAll(suites, { coverage: true });
```

### Assertions

Built-in assertion library with JSONPath support:

```typescript
import { expect } from '@n8n/workflow-architect/testing';

// Fluent API
expect(data).toEqual({ name: 'Alice' });
expect(data).toContain('success');
expect(data).toMatch(/^user-\d+$/);
expect(data).toExist();
expect(data).toBeType('string');
expect(data).toHaveLength(5);
expect(data).toBeInRange(1, 10);

// Assertion types
const assertion = {
  id: 'assert-1',
  type: 'equals',
  target: '$.data.items[0].name',
  expected: 'Alice'
};
```

### Mock System

Mock node outputs for isolated testing:

```typescript
import { MockSystem, mock, MockPresets } from '@n8n/workflow-architect/testing';

const mockSystem = new MockSystem();

// Simple mock
mockSystem.mockNode('n8n-nodes-base.httpRequest', {
  json: { success: true }
});

// Fluent builder
mock('n8n-nodes-base.httpRequest')
  .forNode('GetUser')
  .returns({ id: 1, name: 'Alice' })
  .withDelay(100)
  .withErrorRate(0.1)
  .register(mockSystem);

// Presets
const emailMock = MockPresets.email(true);
const aiMock = MockPresets.aiAgent('Hello!');
```

### Fixtures

Manage test data with fixtures and data generators:

```typescript
import { FixtureManager, DataFactory, template } from '@n8n/workflow-architect/testing';

const manager = new FixtureManager('./fixtures');

// Load fixture
const userData = await manager.load('users');

// Save fixture
await manager.save('users', [{ id: 1, name: 'Alice' }]);

// Data factories
const email = DataFactory.email();
const person = DataFactory.person();
const dbRows = DataFactory.dbRows(10);

// Templates
const userTemplate = template('object')
  .withProperties({
    id: { type: 'string', generate: () => DataFactory.uuid() },
    name: { type: 'string' }
  })
  .required(['id']);

const user = manager.generate(userTemplate.build());
```

### Coverage Analyzer

Track node execution coverage:

```typescript
import { CoverageAnalyzer } from '@n8n/workflow-architect/testing';

const analyzer = new CoverageAnalyzer();

// Start tracking
analyzer.startTracking(workflow);

// Record executions
analyzer.recordExecution(workflowId, 'Node1');
analyzer.recordExecution(workflowId, 'Node2');

// Get coverage
const coverage = analyzer.getCoverage(workflowId);
console.log(`Coverage: ${coverage.percentage}%`);

// Check threshold
analyzer.setThreshold(90);
if (!analyzer.meetsThreshold(workflowId)) {
  console.log('Coverage below threshold!');
}

// Generate report
const report = analyzer.getReport();
const html = analyzer.generateHtmlReport();
```

### Snapshot Testing

Detect output changes with snapshots:

```typescript
import { SnapshotTester, SnapshotUtils } from '@n8n/workflow-architect/testing';

const tester = new SnapshotTester('./__snapshots__');

// Match snapshot
const result = await tester.matchSnapshot('test-1', outputData);
if (!result.matched) {
  console.log('Snapshot mismatch!');
  console.log(tester.visualizeDiff(result.diff!));
}

// Update mode
tester.enableUpdateMode();
await tester.matchSnapshot('test-1', newData); // Updates snapshot

// Sanitize dynamic data
const sanitized = SnapshotUtils.sanitize(data, {
  removeIds: true,
  removeTimestamps: true
});
```

### Execution Replay

Record and replay workflow executions:

```typescript
import { ExecutionReplay, RegressionDetector } from '@n8n/workflow-architect/testing';

const replay = new ExecutionReplay();

// Record execution
const recordingId = replay.startRecording(workflowId, input);
replay.recordNodeExecution('Node1', 'httpRequest', input, output, 100);
await replay.stopRecording(finalOutput);

// Replay
const result = await replay.replay(recordingId);
if (!result.matched) {
  console.log('Execution differs from recording!');
}

// Regression detection
const detector = new RegressionDetector(replay);
const regression = await detector.detectRegressions(baselineId, currentId);
if (regression.hasRegression) {
  console.log(regression.summary);
}
```

### Reporters

Multiple output formats for test results:

```typescript
import {
  ConsoleReporter,
  JsonReporter,
  JUnitReporter,
  HtmlReporter,
  MultiReporter
} from '@n8n/workflow-architect/testing';

// Console output
const console = new ConsoleReporter(true); // verbose

// JSON for CI/CD
const json = new JsonReporter('./results.json');

// JUnit XML
const junit = new JUnitReporter('./results.xml');

// HTML report
const html = new HtmlReporter('./results.html');

// Use multiple reporters
const multi = new MultiReporter([console, json, junit]);
await multi.generateReport(results);
```

## CLI Usage

### Initialize Tests

```bash
workflow-test init
```

Creates test directories and sample configuration.

### Run Tests

```bash
# Run all tests
workflow-test run

# Run with options
workflow-test run --parallel --coverage --bail

# Filter tests
workflow-test run --grep "user workflow"

# Update snapshots
workflow-test run --update-snapshots
```

### Coverage Report

```bash
workflow-test coverage
```

Displays coverage report and generates HTML visualization.

### Snapshot Management

```bash
# List snapshots
workflow-test snapshot list

# Update specific snapshot
workflow-test snapshot update test-1

# Update all snapshots
workflow-test snapshot update

# Delete snapshot
workflow-test snapshot delete test-1
```

### Watch Mode

```bash
workflow-test watch
```

Runs tests automatically on file changes.

## Configuration

Create `workflow-test.config.json`:

```json
{
  "testDir": "./tests",
  "fixtureDir": "./fixtures",
  "snapshotDir": "./__snapshots__",
  "coverageThreshold": 90,
  "timeout": 30000,
  "retries": 2,
  "parallel": true,
  "maxConcurrency": 5,
  "reporters": ["console", "json", "html"],
  "setupFiles": []
}
```

## Test Suite Format

Test suites are defined in JSON format:

```json
{
  "id": "workflow-tests",
  "name": "Workflow Test Suite",
  "tests": [
    {
      "id": "test-1",
      "name": "Test workflow execution",
      "description": "Validates workflow processes data correctly",
      "workflowId": "my-workflow",
      "setup": {
        "mocks": [
          {
            "nodeType": "n8n-nodes-base.httpRequest",
            "response": { "success": true },
            "delay": 100
          }
        ],
        "fixtures": ["users", "products"],
        "environment": {
          "API_KEY": "test-key"
        }
      },
      "input": {
        "items": [{ "name": "Test" }]
      },
      "assertions": [
        {
          "id": "assert-1",
          "type": "equals",
          "target": "$.output.success",
          "expected": true
        }
      ],
      "timeout": 5000,
      "retries": 1,
      "tags": ["smoke", "critical"]
    }
  ]
}
```

## Performance

- **Simple workflows**: <1s execution time
- **Coverage tracking**: Minimal overhead (<5%)
- **Parallel execution**: 5x speedup with 5 concurrent tests
- **Snapshot comparison**: <100ms for typical outputs

## Best Practices

1. **Use mocks for external dependencies**: Isolate workflow logic from external APIs
2. **Set appropriate timeouts**: Avoid false failures from slow operations
3. **Track coverage**: Aim for 90%+ node coverage
4. **Use snapshots for complex outputs**: Easier than writing many assertions
5. **Tag tests**: Organize with tags for selective execution
6. **Enable parallel execution**: Faster feedback in development
7. **Use fixtures**: Reusable test data across multiple tests
8. **Record real executions**: Create baseline recordings for regression testing

## Advanced Usage

### Custom Assertions

```typescript
const customAssertion = {
  id: 'custom-1',
  type: 'custom',
  target: '$.data',
  expected: (value: unknown) => {
    return Array.isArray(value) && value.length > 0;
  },
  message: 'Data should be non-empty array'
};
```

### Branch Coverage

```typescript
const branchCoverage = analyzer.analyzeBranchCoverage(workflowId);
console.log(`Branch coverage: ${branchCoverage.percentage}%`);
console.log('Uncovered branches:', branchCoverage.uncoveredBranches);
```

### Test Discovery

```typescript
import { TestDiscovery } from '@n8n/workflow-architect/testing';

const testFiles = await TestDiscovery.discoverTests('./tests');
for (const file of testFiles) {
  const test = await TestDiscovery.loadTest(file);
  // Process test...
}
```

## Troubleshooting

### Tests timing out

Increase timeout in configuration or per-test:

```typescript
{
  timeout: 60000  // 60 seconds
}
```

### Coverage not tracked

Ensure coverage is enabled and workflows are properly registered:

```typescript
await runner.runSuite(suite, { coverage: true });
```

### Snapshots always failing

Update snapshots if changes are intentional:

```bash
workflow-test run --update-snapshots
```

### Mocks not intercepting

Verify node type matches exactly:

```typescript
// Check actual node type in workflow
mockSystem.mockNode('n8n-nodes-base.httpRequest', ...);
```

## License

Part of the workflow-architect package. See main package for license details.
