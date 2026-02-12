# Testing Suite for Workflow Architect

This directory contains a comprehensive testing suite for the workflow-architect package.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── n8n-client.test.ts         # Tests for n8n REST API client
│   ├── model-router.test.ts       # Tests for AI model router
│   ├── rag-store.test.ts          # Tests for RAG workflow store
│   ├── configurator.test.ts       # Tests for node configuration tools
│   └── agents/                    # Tests for individual agents
│       ├── discovery.test.ts      # Discovery agent tests
│       ├── builder.test.ts        # Builder agent tests
│       └── configurator.test.ts   # (Agent tests - if needed)
├── integration/             # Integration tests
│   ├── graph.test.ts              # Agent graph integration tests
│   ├── supabase.test.ts           # Supabase integration tests
│   └── auto-embed.test.ts         # Auto-embedding tests
├── e2e/                     # End-to-end tests
│   └── cli.test.ts                # CLI end-to-end tests
├── performance/             # Performance and load tests
│   ├── latency.test.ts            # Latency benchmarks
│   └── throughput.test.ts         # Throughput benchmarks
├── fixtures/                # Test data and fixtures
│   └── workflows/
│       ├── simple.json            # Simple workflow fixture
│       ├── complex.json           # Complex workflow fixture
│       └── ai-workflow.json       # AI/RAG workflow fixture
└── setup.ts                 # Global test setup

ui/tests/
└── e2e/                     # UI end-to-end tests
    └── app.spec.ts                # Playwright UI tests
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Unit Tests Only
```bash
pnpm test:unit
```

### Integration Tests
```bash
pnpm test:integration
```

### E2E Tests
```bash
pnpm test:e2e
```

### Performance Tests
```bash
pnpm test:perf
```

### Coverage Report
```bash
pnpm test:coverage
```

### Watch Mode
```bash
pnpm test:watch
```

### UI Mode (Interactive)
```bash
pnpm test:ui
```

## Coverage Requirements

The test suite enforces the following coverage thresholds:

- **Statements**: 80%
- **Branches**: 70%
- **Functions**: 80%
- **Lines**: 80%

Coverage reports are generated in:
- `coverage/` - HTML, JSON, and LCOV reports
- `test-results/` - Test execution results

## Test Categories

### Unit Tests (tests/unit/)

Tests individual components in isolation with mocked dependencies:

- **N8nClient**: REST API operations, workflow CRUD, error handling
- **ModelRouter**: Model selection, token estimation, cost calculation
- **RAGStore**: Workflow indexing, semantic search, categorization
- **Agents**: Discovery, builder, and configurator agent logic

### Integration Tests (tests/integration/)

Tests multiple components working together:

- **Agent Graph**: End-to-end workflow generation flow
- **Supabase**: Database operations and vector search
- **Auto-embedding**: Automatic workflow indexing

### E2E Tests (tests/e2e/)

Tests the complete system from user perspective:

- **CLI**: Command-line interface operations
- **Web UI**: Playwright browser tests (in ui/tests/e2e/)

### Performance Tests (tests/performance/)

Benchmarks and load tests:

- **Latency**: Response time measurements
- **Throughput**: Request handling capacity

## Fixtures

Test fixtures provide reusable test data:

- **simple.json**: Basic webhook → Slack workflow
- **complex.json**: Multi-node data processing pipeline
- **ai-workflow.json**: Complete RAG pipeline with AI agents

## CI/CD Integration

Tests run automatically in GitHub Actions on:

- Every push to main/develop branches
- Every pull request

See `.github/workflows/test.yml` for the complete CI configuration.

### CI Jobs

1. **Lint**: Code style and type checking
2. **Unit Tests**: Fast, isolated component tests
3. **Integration Tests**: Database and service integration
4. **E2E Tests**: Browser and CLI tests (PR only)
5. **Performance Tests**: Benchmarks (PR only)
6. **Build**: TypeScript compilation
7. **Coverage Check**: Enforce coverage thresholds

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8nClient } from '../../src/n8n/client';

describe('N8nClient', () => {
  let client: N8nClient;

  beforeEach(() => {
    client = new N8nClient({
      baseUrl: 'http://localhost:5678',
      apiKey: 'test-key',
    });
  });

  it('should create a workflow', async () => {
    // Test implementation
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect } from 'vitest';

describe('Agent Graph Integration', () => {
  it('should complete workflow generation flow', async () => {
    // Test multiple agents working together
  });
});
```

### E2E Test Example (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('should generate workflow from prompt', async ({ page }) => {
  await page.goto('http://localhost:3000');
  // Test user interactions
});
```

## Mocking

### External Services

External services are mocked in tests:

```typescript
vi.mock('../../src/rag/store', () => ({
  getRAGStore: vi.fn().mockResolvedValue({
    search: vi.fn().mockReturnValue([]),
  }),
}));
```

### API Calls

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `beforeEach`/`afterEach` for setup/teardown
3. **Mocking**: Mock external dependencies
4. **Assertions**: Use descriptive expect messages
5. **Coverage**: Aim for >80% coverage
6. **Performance**: Keep unit tests fast (<100ms)
7. **Naming**: Use descriptive test names

## Debugging Tests

### Run single test file
```bash
pnpm test tests/unit/n8n-client.test.ts
```

### Run tests matching pattern
```bash
pnpm test -t "should create workflow"
```

### Debug with VSCode
Add this launch configuration:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test", "--run"],
  "console": "integratedTerminal"
}
```

## Environment Variables

Tests use these environment variables (set in `tests/setup.ts`):

- `NODE_ENV=test`
- `N8N_BASE_URL=http://localhost:5678`
- `N8N_API_KEY=test-api-key`
- `ANTHROPIC_API_KEY=test-anthropic-key`
- `OPENAI_API_KEY=test-openai-key`
- `SKIP_E2E_TESTS=true` (for CI)

## Troubleshooting

### Tests timeout
Increase timeout in `vitest.config.ts`:
```typescript
testTimeout: 30000, // 30 seconds
```

### Coverage too low
Check which files need more tests:
```bash
pnpm test:coverage
open coverage/index.html
```

### E2E tests failing
Ensure services are running:
```bash
# Start n8n
docker-compose up -d

# Run UI
cd ui && pnpm dev
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
