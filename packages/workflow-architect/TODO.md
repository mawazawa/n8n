# Workflow Architect - Atomic Task List
## Phase 2: 115 Tasks Across 10 Actions

**Created:** December 28, 2025
**Target Completion:** Phase 1 (Actions 1-3) by end of week

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Total Actions | 10 |
| Total Tasks | 115 |
| Completed | 0 |
| In Progress | 0 |
| Progress | 0% |

---

## Action 1: Supabase RAG Integration (12 tasks)

**Status:** 🔄 In Progress
**Dependencies:** None
**Priority:** P0 - Critical

### Tasks

- [ ] **1.1** Create Supabase project and enable pgvector
  - Files: `supabase/config.toml`
  - Success: pgvector extension enabled in Supabase dashboard

- [ ] **1.2** Define workflow_examples table schema with vector column
  - Files: `supabase/migrations/001_workflow_examples.sql`
  - Success: Table created with embedding column (vector(1536))

- [ ] **1.3** Create match_workflows RPC function for similarity search
  - Files: `supabase/migrations/002_match_function.sql`
  - Success: Function returns top-k similar workflows

- [ ] **1.4** Add HNSW index for fast vector search
  - Files: `supabase/migrations/003_hnsw_index.sql`
  - Success: Index created, query time <100ms for 10k docs

- [ ] **1.5** Install @supabase/supabase-js and configure client
  - Files: `package.json`, `src/supabase/client.ts`
  - Success: Client connects and authenticates successfully

- [ ] **1.6** Create SupabaseVectorStore class implementing store interface
  - Files: `src/rag/supabase-store.ts`
  - Success: Class implements add, search, delete methods

- [ ] **1.7** Migrate local store data to Supabase
  - Files: `src/scripts/migrate-to-supabase.ts`
  - Success: All 34 workflows migrated with embeddings

- [ ] **1.8** Update RAG store factory to use Supabase
  - Files: `src/rag/store.ts`, `src/rag/index.ts`
  - Success: Factory returns Supabase store when configured

- [ ] **1.9** Add environment variables for Supabase
  - Files: `.env.schema`, `src/config.ts`
  - Success: SUPABASE_URL, SUPABASE_ANON_KEY validated

- [ ] **1.10** Integration test: full RAG flow with Supabase
  - Files: `tests/integration/supabase-rag.test.ts`
  - Success: Search returns relevant results, latency <200ms

- [ ] **1.11** Add Row Level Security (RLS) for multi-tenant
  - Files: `supabase/migrations/004_rls_policies.sql`
  - Success: Users can only access their own workflows

- [ ] **1.12** Document Supabase setup in README
  - Files: `README.md`, `docs/supabase-setup.md`
  - Success: Clear instructions for self-hosted setup

**Progress: 0/12 (0%)**

---

## Action 2: Automatic Embeddings Pipeline (10 tasks)

**Status:** ⏳ Pending
**Dependencies:** Action 1
**Priority:** P0 - Critical

### Tasks

- [ ] **2.1** Create Edge Function for embedding generation
  - Files: `supabase/functions/generate-embedding/index.ts`
  - Success: Function accepts text, returns 1536-dim vector

- [ ] **2.2** Configure embedding model (text-embedding-3-small)
  - Files: `supabase/functions/generate-embedding/config.ts`
  - Success: Model selected and API key configured

- [ ] **2.3** Create database trigger for auto-embedding on insert
  - Files: `supabase/migrations/005_auto_embed_trigger.sql`
  - Success: New rows automatically get embeddings

- [ ] **2.4** Create pg_net webhook to call Edge Function
  - Files: `supabase/migrations/006_pg_net_webhook.sql`
  - Success: Trigger calls Edge Function via pg_net

- [ ] **2.5** Add retry logic for failed embeddings
  - Files: `supabase/functions/generate-embedding/retry.ts`
  - Success: Failed embeddings retry 3x with backoff

- [ ] **2.6** Create embedding status column and tracking
  - Files: `supabase/migrations/007_embedding_status.sql`
  - Success: Status: pending, processing, completed, failed

- [ ] **2.7** Build admin UI for monitoring embedding queue
  - Files: `src/ui/admin/EmbeddingStatus.tsx`
  - Success: Dashboard shows pending/completed/failed counts

- [ ] **2.8** Add batch embedding for initial import
  - Files: `supabase/functions/batch-embed/index.ts`
  - Success: Process 100 workflows in parallel

- [ ] **2.9** Implement embedding versioning for model updates
  - Files: `supabase/migrations/008_embedding_version.sql`
  - Success: Track which model version generated each embedding

- [ ] **2.10** Test: embedding accuracy and latency
  - Files: `tests/integration/auto-embed.test.ts`
  - Success: Embeddings generated <2s per workflow

**Progress: 0/10 (0%)**

---

## Action 3: Configurator Agent (10 tasks)

**Status:** ⏳ Pending
**Dependencies:** None
**Priority:** P1 - High

### Tasks

- [ ] **3.1** Define configurator agent prompt template
  - Files: `src/graph/agents/configurator.prompt.ts`
  - Success: Prompt includes node parameter context

- [ ] **3.2** Create update_node_parameters tool
  - Files: `src/tools/update-params.tool.ts`
  - Success: Tool updates parameters in workflow JSON

- [ ] **3.3** Create get_node_parameters tool
  - Files: `src/tools/get-params.tool.ts`
  - Success: Tool retrieves current parameter values

- [ ] **3.4** Create assign_credentials tool
  - Files: `src/tools/assign-credentials.tool.ts`
  - Success: Tool assigns credentials from available list

- [ ] **3.5** Implement configurator agent with tools
  - Files: `src/graph/agents/configurator.ts`
  - Success: Agent calls tools to configure nodes

- [ ] **3.6** Add credential type detection from node type
  - Files: `src/n8n/credentials.ts`
  - Success: Detect required credential types per node

- [ ] **3.7** Integrate configurator into main graph
  - Files: `src/graph/index.ts`
  - Success: Graph routes to configurator after builder

- [ ] **3.8** Add validation for parameter types
  - Files: `src/tools/validate-params.ts`
  - Success: Reject invalid parameter values

- [ ] **3.9** Test: full configuration flow
  - Files: `tests/unit/configurator.test.ts`
  - Success: Node parameters correctly set

- [ ] **3.10** Test: credential assignment
  - Files: `tests/unit/credentials.test.ts`
  - Success: Credentials assigned from VarLock

**Progress: 0/10 (0%)**

---

## Action 4: React Chat UI with useStream (15 tasks)

**Status:** ⏳ Pending
**Dependencies:** None
**Priority:** P1 - High

### Tasks

- [ ] **4.1** Create React app with Vite + TypeScript
  - Files: `ui/package.json`, `ui/vite.config.ts`, `ui/tsconfig.json`
  - Success: App builds and runs on localhost:3001

- [ ] **4.2** Install LangGraph SDK and configure useStream
  - Files: `ui/package.json`, `ui/src/hooks/useWorkflowStream.ts`
  - Success: Hook connects to backend stream

- [ ] **4.3** Create ChatMessage component
  - Files: `ui/src/components/ChatMessage.tsx`
  - Success: Renders user/assistant messages with markdown

- [ ] **4.4** Create ChatInput component with submit handling
  - Files: `ui/src/components/ChatInput.tsx`
  - Success: Text input with send button, Enter to submit

- [ ] **4.5** Create ChatPanel component with message history
  - Files: `ui/src/components/ChatPanel.tsx`
  - Success: Scrollable message list with auto-scroll

- [ ] **4.6** Add typing indicator during streaming
  - Files: `ui/src/components/TypingIndicator.tsx`
  - Success: Shows "Thinking..." during agent processing

- [ ] **4.7** Create PhaseIndicator showing current agent
  - Files: `ui/src/components/PhaseIndicator.tsx`
  - Success: Shows: Discovery → Builder → Configurator

- [ ] **4.8** Add WorkflowPreview component (JSON viewer)
  - Files: `ui/src/components/WorkflowPreview.tsx`
  - Success: Shows current workflow JSON with syntax highlighting

- [ ] **4.9** Implement conversation branching UI
  - Files: `ui/src/components/BranchSelector.tsx`
  - Success: Allow selecting previous conversation states

- [ ] **4.10** Add error handling and retry UI
  - Files: `ui/src/components/ErrorMessage.tsx`
  - Success: Shows error with retry button

- [ ] **4.11** Create session management (new/load/save)
  - Files: `ui/src/hooks/useSession.ts`, `ui/src/components/SessionControls.tsx`
  - Success: Persist and restore chat sessions

- [ ] **4.12** Add keyboard shortcuts (Cmd+Enter, Escape)
  - Files: `ui/src/hooks/useKeyboardShortcuts.ts`
  - Success: Submit with Cmd+Enter, cancel with Escape

- [ ] **4.13** Style with Tailwind CSS
  - Files: `ui/tailwind.config.js`, `ui/src/styles/globals.css`
  - Success: Modern, responsive design

- [ ] **4.14** Add dark mode support
  - Files: `ui/src/hooks/useTheme.ts`, `ui/src/components/ThemeToggle.tsx`
  - Success: Toggle between light/dark themes

- [ ] **4.15** Integration test: full chat flow
  - Files: `ui/tests/e2e/chat.spec.ts`
  - Success: User can send message and receive streamed response

**Progress: 0/15 (0%)**

---

## Action 5: Canvas Streaming Integration (10 tasks)

**Status:** ⏳ Pending
**Dependencies:** Action 4
**Priority:** P1 - High

### Tasks

- [ ] **5.1** Create WebSocket server for real-time updates
  - Files: `src/server/websocket.ts`
  - Success: WS server accepts connections on /ws

- [ ] **5.2** Define streaming protocol (node_added, connection_added, etc.)
  - Files: `src/types/streaming.ts`
  - Success: Protocol types for all workflow events

- [ ] **5.3** Emit events from builder agent as nodes are created
  - Files: `src/graph/agents/builder.ts`
  - Success: Agent emits node_added after each node

- [ ] **5.4** Create useCanvasStream hook for React
  - Files: `ui/src/hooks/useCanvasStream.ts`
  - Success: Hook receives and processes WS events

- [ ] **5.5** Animate node appearance on canvas
  - Files: `ui/src/components/AnimatedNode.tsx`
  - Success: Nodes fade in with animation

- [ ] **5.6** Animate connection drawing
  - Files: `ui/src/components/AnimatedConnection.tsx`
  - Success: Connections draw progressively

- [ ] **5.7** Add progress indicator for multi-node creation
  - Files: `ui/src/components/BuildProgress.tsx`
  - Success: Show "Creating node 3/5..."

- [ ] **5.8** Handle reconnection and state recovery
  - Files: `ui/src/hooks/useCanvasStream.ts`
  - Success: Reconnect and replay missed events

- [ ] **5.9** Create mini-canvas preview in chat
  - Files: `ui/src/components/MiniCanvas.tsx`
  - Success: Small canvas showing workflow being built

- [ ] **5.10** Test: streaming performance with 20+ nodes
  - Files: `tests/performance/streaming.test.ts`
  - Success: All nodes appear within 2s of creation

**Progress: 0/10 (0%)**

---

## Action 6: n8n Editor Integration (12 tasks)

**Status:** ⏳ Pending
**Dependencies:** Actions 4, 5
**Priority:** P2 - Medium

### Tasks

- [ ] **6.1** Create WorkflowArchitect Vue component
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/WorkflowArchitect.vue`
  - Success: Component renders chat UI

- [ ] **6.2** Add chat panel to editor sidebar
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/WorkflowArchitectPanel.vue`
  - Success: Panel appears in sidebar

- [ ] **6.3** Create Pinia store for architect state
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/architect.store.ts`
  - Success: Store manages chat messages and workflow

- [ ] **6.4** Connect to backend via SSE/WebSocket
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/architect.api.ts`
  - Success: API client handles streaming

- [ ] **6.5** Integrate with useCanvasOperations for node creation
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/useArchitectCanvas.ts`
  - Success: Created nodes appear on actual n8n canvas

- [ ] **6.6** Add feature flag for architect (aiArchitectEnabled)
  - Files: `packages/frontend/editor-ui/src/app/stores/settings.store.ts`
  - Success: Feature can be enabled/disabled

- [ ] **6.7** Add keyboard shortcut to open architect (Cmd+Shift+A)
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/useArchitectShortcuts.ts`
  - Success: Shortcut opens architect panel

- [ ] **6.8** Style to match n8n design system
  - Files: `packages/frontend/editor-ui/src/features/workflow-architect/styles.scss`
  - Success: Uses n8n CSS variables

- [ ] **6.9** Add i18n translations
  - Files: `packages/@n8n/i18n/src/locales/en.json`
  - Success: All strings translated

- [ ] **6.10** Create backend route for architect API
  - Files: `packages/cli/src/controllers/workflow-architect.controller.ts`
  - Success: REST + streaming endpoints

- [ ] **6.11** Add backend service for architect
  - Files: `packages/cli/src/services/workflow-architect.service.ts`
  - Success: Service orchestrates agent graph

- [ ] **6.12** Integration test: full flow in n8n editor
  - Files: `packages/testing/playwright/tests/e2e/workflow-architect.spec.ts`
  - Success: User can chat and workflow appears on canvas

**Progress: 0/12 (0%)**

---

## Action 7: Advanced RAG (Hybrid + Reranking) (10 tasks)

**Status:** ⏳ Pending
**Dependencies:** Action 1
**Priority:** P2 - Medium

### Tasks

- [ ] **7.1** Add full-text search column with tsvector
  - Files: `supabase/migrations/009_fulltext_search.sql`
  - Success: tsvector column on workflow_examples

- [ ] **7.2** Create GIN index for full-text search
  - Files: `supabase/migrations/010_gin_index.sql`
  - Success: Full-text queries <50ms

- [ ] **7.3** Implement hybrid search combining vector + FTS
  - Files: `src/rag/hybrid-search.ts`
  - Success: Function combines both search methods

- [ ] **7.4** Add Reciprocal Rank Fusion (RRF) for result merging
  - Files: `src/rag/rrf-fusion.ts`
  - Success: RRF combines vector and FTS rankings

- [ ] **7.5** Implement cross-encoder reranker with Cohere
  - Files: `src/rag/reranker.ts`
  - Success: Rerank top-20 to top-5

- [ ] **7.6** Add query expansion with synonyms
  - Files: `src/rag/query-expansion.ts`
  - Success: Expand "email" → "email, smtp, sendgrid"

- [ ] **7.7** Implement metadata filtering (category, techniques)
  - Files: `src/rag/metadata-filter.ts`
  - Success: Filter by category before search

- [ ] **7.8** Add search analytics tracking
  - Files: `src/rag/analytics.ts`, `supabase/migrations/011_search_analytics.sql`
  - Success: Track queries and result clicks

- [ ] **7.9** Create A/B test framework for search quality
  - Files: `src/rag/ab-test.ts`
  - Success: Compare search algorithms

- [ ] **7.10** Test: search relevance metrics (MRR, NDCG)
  - Files: `tests/quality/search-relevance.test.ts`
  - Success: MRR > 0.7, NDCG > 0.8

**Progress: 0/10 (0%)**

---

## Action 8: Multi-Model Enhancements (10 tasks)

**Status:** ⏳ Pending
**Dependencies:** None
**Priority:** P2 - Medium

### Tasks

- [ ] **8.1** Add Grok 4.2 model configuration (placeholder)
  - Files: `src/models/router.ts`, `src/models/grok.ts`
  - Success: Model config ready for when API available

- [ ] **8.2** Implement task-based model selection
  - Files: `src/models/task-router.ts`
  - Success: Different models for discovery vs builder

- [ ] **8.3** Add cost tracking per request
  - Files: `src/models/cost-tracker.ts`
  - Success: Track input/output tokens and cost

- [ ] **8.4** Implement model fallback with retry
  - Files: `src/models/fallback.ts`
  - Success: If primary fails, try fallback model

- [ ] **8.5** Add latency monitoring per model
  - Files: `src/models/latency-monitor.ts`
  - Success: Track p50, p95, p99 latencies

- [ ] **8.6** Create model selection dashboard
  - Files: `ui/src/components/ModelDashboard.tsx`
  - Success: Show cost, latency, success rates

- [ ] **8.7** Implement dynamic routing based on load
  - Files: `src/models/load-balancer.ts`
  - Success: Route to faster model under load

- [ ] **8.8** Add model-specific prompt optimization
  - Files: `src/prompts/model-specific/*.ts`
  - Success: Optimized prompts per model

- [ ] **8.9** Test: model comparison benchmarks
  - Files: `tests/benchmarks/model-comparison.test.ts`
  - Success: Compare quality and speed

- [ ] **8.10** Document model selection strategy
  - Files: `docs/model-selection.md`
  - Success: Clear docs on when each model is used

**Progress: 0/10 (0%)**

---

## Action 9: Testing Suite (12 tasks)

**Status:** ⏳ Pending
**Dependencies:** All
**Priority:** P1 - High

### Tasks

- [ ] **9.1** Unit tests for n8n client
  - Files: `tests/unit/n8n-client.test.ts`
  - Success: 100% coverage of client methods

- [ ] **9.2** Unit tests for model router
  - Files: `tests/unit/model-router.test.ts`
  - Success: All routing paths tested

- [ ] **9.3** Unit tests for RAG store
  - Files: `tests/unit/rag-store.test.ts`
  - Success: Add, search, delete tested

- [ ] **9.4** Unit tests for each agent
  - Files: `tests/unit/agents/*.test.ts`
  - Success: Each agent tested in isolation

- [ ] **9.5** Integration tests for agent graph
  - Files: `tests/integration/graph.test.ts`
  - Success: Full graph execution tested

- [ ] **9.6** Integration tests for Supabase
  - Files: `tests/integration/supabase.test.ts`
  - Success: CRUD + search operations tested

- [ ] **9.7** E2E tests for CLI
  - Files: `tests/e2e/cli.test.ts`
  - Success: Full CLI workflow tested

- [ ] **9.8** E2E tests for web UI
  - Files: `ui/tests/e2e/app.spec.ts`
  - Success: Full UI workflow tested

- [ ] **9.9** Performance tests
  - Files: `tests/performance/*.test.ts`
  - Success: Latency and throughput benchmarks

- [ ] **9.10** Create CI pipeline with GitHub Actions
  - Files: `.github/workflows/test.yml`
  - Success: Tests run on every PR

- [ ] **9.11** Add coverage reporting
  - Files: `vitest.config.ts`, `.github/workflows/test.yml`
  - Success: Coverage > 80% required

- [ ] **9.12** Create test fixtures for workflows
  - Files: `tests/fixtures/workflows/*.json`
  - Success: Reusable test data

**Progress: 0/12 (0%)**

---

## Action 10: Production Hardening (14 tasks)

**Status:** ⏳ Pending
**Dependencies:** All
**Priority:** P3 - Low

### Tasks

- [ ] **10.1** Add structured error types
  - Files: `src/errors/index.ts`
  - Success: Custom error classes with codes

- [ ] **10.2** Implement error boundary in React UI
  - Files: `ui/src/components/ErrorBoundary.tsx`
  - Success: Graceful error handling in UI

- [ ] **10.3** Add request rate limiting
  - Files: `src/server/rate-limit.ts`
  - Success: 100 req/min per user

- [ ] **10.4** Implement request timeout handling
  - Files: `src/server/timeout.ts`
  - Success: 30s timeout with graceful cancel

- [ ] **10.5** Add OpenTelemetry tracing
  - Files: `src/observability/tracing.ts`
  - Success: Traces for all agent operations

- [ ] **10.6** Add Prometheus metrics
  - Files: `src/observability/metrics.ts`
  - Success: Request count, latency, errors

- [ ] **10.7** Create health check endpoint
  - Files: `src/server/health.ts`
  - Success: /health returns status of all deps

- [ ] **10.8** Add graceful shutdown
  - Files: `src/server/shutdown.ts`
  - Success: Clean shutdown on SIGTERM

- [ ] **10.9** Implement request logging
  - Files: `src/server/logging.ts`
  - Success: Structured logs for all requests

- [ ] **10.10** Add input sanitization
  - Files: `src/security/sanitize.ts`
  - Success: Prevent injection attacks

- [ ] **10.11** Create Dockerfile and docker-compose
  - Files: `Dockerfile`, `docker-compose.yml`
  - Success: One-command deployment

- [ ] **10.12** Add Kubernetes manifests
  - Files: `k8s/*.yaml`
  - Success: K8s deployment ready

- [ ] **10.13** Create runbook for operations
  - Files: `docs/runbook.md`
  - Success: Common issues and solutions

- [ ] **10.14** Security audit checklist
  - Files: `docs/security-checklist.md`
  - Success: All security measures documented

**Progress: 0/14 (0%)**

---

## Summary

| Action | Tasks | Completed | Status |
|--------|-------|-----------|--------|
| 1. Supabase RAG | 12 | 0 | 🔄 |
| 2. Auto Embeddings | 10 | 0 | ⏳ |
| 3. Configurator Agent | 10 | 0 | ⏳ |
| 4. React Chat UI | 15 | 0 | ⏳ |
| 5. Canvas Streaming | 10 | 0 | ⏳ |
| 6. n8n Integration | 12 | 0 | ⏳ |
| 7. Advanced RAG | 10 | 0 | ⏳ |
| 8. Multi-Model | 10 | 0 | ⏳ |
| 9. Testing | 12 | 0 | ⏳ |
| 10. Production | 14 | 0 | ⏳ |
| **Total** | **115** | **0** | **0%** |

---

*Last updated: December 28, 2025*
