# n8n TODO - Atomic Subtasks with Success Criteria

> Each subtask is scoped to ≤5 files with clear, measurable success criteria.
> Updated via AI agents after web research and implementation.

---

## UPGRADE 1: Jest → Vitest Migration

### 1.1 Infrastructure Setup
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 1.1.1 | Create shared Vitest config base | `packages/@n8n/vitest-config/src/base.ts` | Config exports `defineConfig` with common settings | ⬜ |
| 1.1.2 | Add Vitest workspace configuration | `vitest.workspace.ts` (root) | `pnpm test` runs Vitest for all packages | ⬜ |
| 1.1.3 | Update root package.json test scripts | `package.json` | `test`, `test:backend`, `test:frontend` use Vitest | ⬜ |
| 1.1.4 | Install Vitest codemod tooling | `package.json` | `npx codemod jest/vitest` available | ⬜ |
| 1.1.5 | Configure Turborepo for Vitest caching | `turbo.json` | Test task outputs include Vitest cache dirs | ⬜ |

### 1.2 Migrate @n8n/* Backend Packages (13 packages)
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 1.2.1 | Migrate @n8n/config | `packages/@n8n/config/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass with `vitest run` | ⬜ |
| 1.2.2 | Migrate @n8n/di | `packages/@n8n/di/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass, mocks converted | ⬜ |
| 1.2.3 | Migrate @n8n/decorators | `packages/@n8n/decorators/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass with `vitest run` | ⬜ |
| 1.2.4 | Migrate @n8n/permissions | `packages/@n8n/permissions/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass with `vitest run` | ⬜ |
| 1.2.5 | Migrate @n8n/constants | `packages/@n8n/constants/{jest.config.js,vitest.config.ts}` | Package builds without Jest deps | ⬜ |
| 1.2.6 | Migrate @n8n/errors | `packages/@n8n/errors/{jest.config.js,vitest.config.ts}` | Package builds without Jest deps | ⬜ |
| 1.2.7 | Migrate @n8n/api-types | `packages/@n8n/api-types/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass with `vitest run` | ⬜ |
| 1.2.8 | Migrate @n8n/db | `packages/@n8n/db/{jest.config.js,vitest.config.ts,*.test.ts}` | DB tests pass with proper cleanup | ⬜ |
| 1.2.9 | Migrate @n8n/backend-common | `packages/@n8n/backend-common/{jest.config.js,vitest.config.ts,*.test.ts}` | All tests pass with `vitest run` | ⬜ |
| 1.2.10 | Migrate @n8n/client-oauth2 | `packages/@n8n/client-oauth2/{jest.config.js,vitest.config.ts,*.test.ts}` | OAuth tests pass with mocks | ⬜ |
| 1.2.11 | Migrate @n8n/task-runner | `packages/@n8n/task-runner/{jest.config.js,vitest.config.ts,*.test.ts}` | Runner tests pass with `vitest run` | ⬜ |
| 1.2.12 | Migrate @n8n/nodes-langchain | `packages/@n8n/nodes-langchain/{jest.config.js,vitest.config.ts,*.test.ts}` | AI node tests pass | ⬜ |
| 1.2.13 | Migrate @n8n/json-schema-to-zod | `packages/@n8n/json-schema-to-zod/{jest.config.js,vitest.config.ts,*.test.ts}` | Schema conversion tests pass | ⬜ |

### 1.3 Migrate Core Packages (4 packages)
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 1.3.1 | Migrate n8n-workflow | `packages/workflow/{jest.config.js,vitest.config.ts,*.test.ts}` | All 50+ tests pass | ⬜ |
| 1.3.2 | Migrate n8n-core | `packages/core/{jest.config.js,vitest.config.ts,*.test.ts}` | All core tests pass | ⬜ |
| 1.3.3 | Migrate n8n-nodes-base | `packages/nodes-base/{jest.config.js,vitest.config.ts,*.test.ts}` | All node tests pass | ⬜ |
| 1.3.4 | Migrate n8n (cli) | `packages/cli/{jest.config.js,vitest.config.ts,*.test.ts}` | CLI + API tests pass | ⬜ |

### 1.4 Cleanup & Verification
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 1.4.1 | Remove Jest dependencies from root | `package.json`, `pnpm-lock.yaml` | No jest* packages in root | ⬜ |
| 1.4.2 | Remove Jest dependencies from packages | `packages/*/package.json` | No jest* in any package.json | ⬜ |
| 1.4.3 | Update CI workflows | `.github/workflows/*.yml` | CI uses Vitest commands | ⬜ |
| 1.4.4 | Update VS Code settings | `.vscode/settings.json`, `.vscode/extensions.json` | Vitest extension recommended | ⬜ |
| 1.4.5 | Run full test suite | All test files | `pnpm test` passes 100% | ⬜ |

---

## UPGRADE 2: Zod-Based Node Definitions

### 2.1 Core Schema Infrastructure
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 2.1.1 | Create node parameter Zod schemas | `packages/workflow/src/schemas/parameters.ts` | Base schemas for string, number, options, etc. | ⬜ |
| 2.1.2 | Create node property Zod schemas | `packages/workflow/src/schemas/properties.ts` | INodeProperties derivable from Zod | ⬜ |
| 2.1.3 | Create node type Zod schema | `packages/workflow/src/schemas/nodeType.ts` | Full INodeType schema with inference | ⬜ |
| 2.1.4 | Create credentials Zod schema | `packages/workflow/src/schemas/credentials.ts` | ICredentialType derivable from Zod | ⬜ |
| 2.1.5 | Export schemas from workflow package | `packages/workflow/src/schemas/index.ts`, `packages/workflow/src/index.ts` | `import { schemas } from 'n8n-workflow'` works | ⬜ |

### 2.2 Type Inference Utilities
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 2.2.1 | Create Zod-to-INodeProperties converter | `packages/workflow/src/schemas/converters/toNodeProperties.ts` | `zodToNodeProperties(schema)` returns valid props | ⬜ |
| 2.2.2 | Create Zod-to-JSONSchema converter | `packages/workflow/src/schemas/converters/toJsonSchema.ts` | `zodToJsonSchema(schema)` for UI consumption | ⬜ |
| 2.2.3 | Create runtime validator factory | `packages/workflow/src/schemas/validate.ts` | `validateNodeInput(schema, data)` with errors | ⬜ |
| 2.2.4 | Create type inference helpers | `packages/workflow/src/schemas/infer.ts` | `NodeInput<typeof schema>` type works | ⬜ |
| 2.2.5 | Add tests for all converters | `packages/workflow/src/schemas/__tests__/*.test.ts` | 100% coverage on converter logic | ⬜ |

### 2.3 Pilot Node Conversions (10 nodes)
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 2.3.1 | Convert Set node to Zod | `packages/nodes-base/nodes/Set/Set.node.ts`, `Set.schema.ts` | Set node works identically | ⬜ |
| 2.3.2 | Convert If node to Zod | `packages/nodes-base/nodes/If/If.node.ts`, `If.schema.ts` | If node works identically | ⬜ |
| 2.3.3 | Convert Switch node to Zod | `packages/nodes-base/nodes/Switch/Switch.node.ts`, `Switch.schema.ts` | Switch node works identically | ⬜ |
| 2.3.4 | Convert Merge node to Zod | `packages/nodes-base/nodes/Merge/Merge.node.ts`, `Merge.schema.ts` | Merge node works identically | ⬜ |
| 2.3.5 | Convert Filter node to Zod | `packages/nodes-base/nodes/Filter/Filter.node.ts`, `Filter.schema.ts` | Filter node works identically | ⬜ |
| 2.3.6 | Convert Code node to Zod | `packages/nodes-base/nodes/Code/Code.node.ts`, `Code.schema.ts` | Code node works identically | ⬜ |
| 2.3.7 | Convert HTTP Request node to Zod | `packages/nodes-base/nodes/HttpRequest/HttpRequest.node.ts`, `HttpRequest.schema.ts` | HTTP node works identically | ⬜ |
| 2.3.8 | Convert Webhook node to Zod | `packages/nodes-base/nodes/Webhook/Webhook.node.ts`, `Webhook.schema.ts` | Webhook works identically | ⬜ |
| 2.3.9 | Convert Schedule node to Zod | `packages/nodes-base/nodes/Schedule/ScheduleTrigger.node.ts`, `Schedule.schema.ts` | Schedule works identically | ⬜ |
| 2.3.10 | Convert Slack node to Zod | `packages/nodes-base/nodes/Slack/Slack.node.ts`, `Slack.schema.ts` | Slack node works identically | ⬜ |

### 2.4 Documentation & Tooling
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 2.4.1 | Create Zod node authoring guide | `docs/nodes/zod-authoring.md` | Step-by-step guide complete | ⬜ |
| 2.4.2 | Create node generator CLI | `packages/node-dev/src/commands/generate.ts` | `n8n-node-dev generate --zod` works | ⬜ |
| 2.4.3 | Update CONTRIBUTING.md | `CONTRIBUTING.md` | Zod patterns documented | ⬜ |
| 2.4.4 | Create migration script for existing nodes | `scripts/migrate-node-to-zod.ts` | Script handles common patterns | ⬜ |
| 2.4.5 | Add ESLint rule for Zod preference | `packages/@n8n/eslint-config/src/rules/prefer-zod.ts` | Warns on manual INodeProperties | ⬜ |

---

## UPGRADE 3: Module Federation for Editor UI

### 3.1 Host Application Setup
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 3.1.1 | Install vite-plugin-federation | `packages/frontend/editor-ui/package.json` | Plugin installed and typed | ⬜ |
| 3.1.2 | Configure host federation | `packages/frontend/editor-ui/vite.config.ts` | Host declares remotes | ⬜ |
| 3.1.3 | Create remote loader utility | `packages/frontend/editor-ui/src/utils/loadRemote.ts` | `loadRemoteModule()` with fallback | ⬜ |
| 3.1.4 | Add federation type declarations | `packages/frontend/editor-ui/src/types/federation.d.ts` | Remote modules typed | ⬜ |
| 3.1.5 | Configure shared dependencies | `packages/frontend/editor-ui/vite.config.ts` | Vue, Pinia shared correctly | ⬜ |

### 3.2 Extract Node Panels as Remotes
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 3.2.1 | Create nodes-ui remote package | `packages/frontend/@n8n/nodes-ui/package.json`, `vite.config.ts` | Package structure created | ⬜ |
| 3.2.2 | Move NodeSettings panel | `packages/frontend/@n8n/nodes-ui/src/NodeSettings.vue` | Panel renders in remote | ⬜ |
| 3.2.3 | Move NodeCredentials panel | `packages/frontend/@n8n/nodes-ui/src/NodeCredentials.vue` | Panel renders in remote | ⬜ |
| 3.2.4 | Move ParameterInput components | `packages/frontend/@n8n/nodes-ui/src/ParameterInput/` | All input types work | ⬜ |
| 3.2.5 | Configure remote entry point | `packages/frontend/@n8n/nodes-ui/src/index.ts` | `remoteEntry.js` generated | ⬜ |

### 3.3 Lazy Loading Implementation
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 3.3.1 | Create async component wrappers | `packages/frontend/editor-ui/src/components/async/` | `AsyncNodeSettings.vue` loads remote | ⬜ |
| 3.3.2 | Add loading states | `packages/frontend/editor-ui/src/components/async/LoadingPanel.vue` | Skeleton shown during load | ⬜ |
| 3.3.3 | Add error boundaries | `packages/frontend/editor-ui/src/components/async/ErrorBoundary.vue` | Errors caught and displayed | ⬜ |
| 3.3.4 | Implement prefetching on hover | `packages/frontend/editor-ui/src/composables/usePrefetch.ts` | Node panels prefetch on hover | ⬜ |
| 3.3.5 | Add retry logic for failed loads | `packages/frontend/editor-ui/src/utils/loadRemote.ts` | 3 retries with backoff | ⬜ |

### 3.4 Build & Deploy Configuration
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 3.4.1 | Configure remote build output | `packages/frontend/@n8n/nodes-ui/vite.config.ts` | `dist/remoteEntry.js` generated | ⬜ |
| 3.4.2 | Update Turborepo build order | `turbo.json` | Remotes built before host | ⬜ |
| 3.4.3 | Configure remote URL resolution | `packages/frontend/editor-ui/src/config/federation.ts` | Dev/prod URLs resolved | ⬜ |
| 3.4.4 | Add fallback bundling mode | `packages/frontend/editor-ui/vite.config.ts` | Works without federation in dev | ⬜ |
| 3.4.5 | Update Docker build | `docker/images/n8n/Dockerfile` | Remotes included in image | ⬜ |

### 3.5 Performance Validation
| ID | Task | Files | Success Criteria | Status |
|----|------|-------|------------------|--------|
| 3.5.1 | Add bundle size monitoring | `.github/workflows/bundle-size.yml` | PR blocks if size increases >10% | ⬜ |
| 3.5.2 | Create performance benchmark | `packages/testing/playwright/src/benchmarks/` | TTI measured and tracked | ⬜ |
| 3.5.3 | Implement source map upload | `.github/workflows/ci-master.yml` | Sentry has production maps | ⬜ |
| 3.5.4 | Add Core Web Vitals tracking | `packages/frontend/editor-ui/src/utils/vitals.ts` | LCP, FID, CLS tracked | ⬜ |
| 3.5.5 | Document performance gains | `docs/performance/module-federation.md` | Before/after metrics recorded | ⬜ |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| ❌ | Blocked |
| ⏸️ | Paused |

---

## How to Use This TODO

1. **AI Agents**: Pick tasks by ID, complete them, update status
2. **Success Criteria**: Each task has measurable completion criteria
3. **File Scope**: No task touches more than 5 files
4. **Dependencies**: Tasks within a section should be done in order
5. **Changelog**: After completing a task, add entry to CHANGELOG.md

---

*Last Updated: 2025-12-27T00:00:00Z*
*Managed by: Claude Code, Gemini, Human Reviewers*
