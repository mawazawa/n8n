# Workflow Architect - Phase 2 Roadmap
## 10 Highest Leverage Actions with Atomic Tasks

**Created:** December 28, 2025
**Status:** 🚀 READY FOR EXECUTION

---

## Overview

| # | Action | Priority | Complexity | Dependencies |
|---|--------|----------|------------|--------------|
| 1 | Supabase RAG Integration | P0 | Medium | None |
| 2 | Automatic Embeddings Pipeline | P0 | Medium | Action 1 |
| 3 | Configurator Agent | P1 | Low | None |
| 4 | React Chat UI with useStream | P1 | Medium | None |
| 5 | Canvas Streaming Integration | P1 | High | Action 4 |
| 6 | n8n Editor Integration | P2 | High | Actions 4, 5 |
| 7 | Advanced RAG (Hybrid + Reranking) | P2 | Medium | Action 1 |
| 8 | Multi-Model Enhancements | P2 | Low | None |
| 9 | Testing Suite | P1 | Medium | All |
| 10 | Production Hardening | P3 | Medium | All |

---

## Action 1: Supabase RAG Integration

**Goal:** Replace local vector store with Supabase pgvector for scalable, production-ready RAG.

**References:**
- [Supabase Vector Docs](https://supabase.com/docs/guides/ai)
- [pgvector Extension](https://supabase.com/docs/guides/database/extensions/pgvector)
- [LangChain Supabase Integration](https://js.langchain.com/docs/integrations/vectorstores/supabase/)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 1.1 | Create Supabase project and enable pgvector | `supabase/config.toml` | pgvector extension enabled in Supabase dashboard |
| 1.2 | Define workflow_examples table schema with vector column | `supabase/migrations/001_workflow_examples.sql` | Table created with embedding column (vector(1536)) |
| 1.3 | Create match_workflows RPC function for similarity search | `supabase/migrations/002_match_function.sql` | Function returns top-k similar workflows |
| 1.4 | Add HNSW index for fast vector search | `supabase/migrations/003_hnsw_index.sql` | Index created, query time <100ms for 10k docs |
| 1.5 | Install @supabase/supabase-js and configure client | `package.json`, `src/supabase/client.ts` | Client connects and authenticates successfully |
| 1.6 | Create SupabaseVectorStore class implementing store interface | `src/rag/supabase-store.ts` | Class implements add, search, delete methods |
| 1.7 | Migrate local store data to Supabase | `src/scripts/migrate-to-supabase.ts` | All 34 workflows migrated with embeddings |
| 1.8 | Update RAG store factory to use Supabase | `src/rag/store.ts`, `src/rag/index.ts` | Factory returns Supabase store when configured |
| 1.9 | Add environment variables for Supabase | `.env.schema`, `src/config.ts` | SUPABASE_URL, SUPABASE_ANON_KEY validated |
| 1.10 | Integration test: full RAG flow with Supabase | `tests/integration/supabase-rag.test.ts` | Search returns relevant results, latency <200ms |
| 1.11 | Add Row Level Security (RLS) for multi-tenant | `supabase/migrations/004_rls_policies.sql` | Users can only access their own workflows |
| 1.12 | Document Supabase setup in README | `README.md`, `docs/supabase-setup.md` | Clear instructions for self-hosted setup |

**Success Metric:** RAG queries return results in <200ms with 90%+ relevance

---

## Action 2: Automatic Embeddings Pipeline

**Goal:** Generate embeddings automatically when workflows are indexed, using Supabase Edge Functions.

**References:**
- [Supabase Automatic Embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [Generate Embeddings](https://supabase.com/docs/guides/ai/quickstarts/generate-text-embeddings)
- [Running AI Models](https://supabase.com/docs/guides/functions/ai-models)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 2.1 | Create Edge Function for embedding generation | `supabase/functions/generate-embedding/index.ts` | Function accepts text, returns 1536-dim vector |
| 2.2 | Configure embedding model (text-embedding-3-small) | `supabase/functions/generate-embedding/config.ts` | Model selected and API key configured |
| 2.3 | Create database trigger for auto-embedding on insert | `supabase/migrations/005_auto_embed_trigger.sql` | New rows automatically get embeddings |
| 2.4 | Create pg_net webhook to call Edge Function | `supabase/migrations/006_pg_net_webhook.sql` | Trigger calls Edge Function via pg_net |
| 2.5 | Add retry logic for failed embeddings | `supabase/functions/generate-embedding/retry.ts` | Failed embeddings retry 3x with backoff |
| 2.6 | Create embedding status column and tracking | `supabase/migrations/007_embedding_status.sql` | Status: pending, processing, completed, failed |
| 2.7 | Build admin UI for monitoring embedding queue | `src/ui/admin/EmbeddingStatus.tsx` | Dashboard shows pending/completed/failed counts |
| 2.8 | Add batch embedding for initial import | `supabase/functions/batch-embed/index.ts` | Process 100 workflows in parallel |
| 2.9 | Implement embedding versioning for model updates | `supabase/migrations/008_embedding_version.sql` | Track which model version generated each embedding |
| 2.10 | Test: embedding accuracy and latency | `tests/integration/auto-embed.test.ts` | Embeddings generated <2s per workflow |

**Success Metric:** 100% of workflows have embeddings within 5s of insertion

---

## Action 3: Configurator Agent

**Goal:** Complete the configurator agent for setting node parameters and credentials.

**References:**
- [n8n AI Workflow Builder Configurator](packages/@n8n/ai-workflow-builder.ee/src/subgraphs/configurator.subgraph.ts)
- [Parameter Updater Chain](packages/@n8n/ai-workflow-builder.ee/src/chains/parameter-updater.ts)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 3.1 | Define configurator agent prompt template | `src/graph/agents/configurator.prompt.ts` | Prompt includes node parameter context |
| 3.2 | Create update_node_parameters tool | `src/tools/update-params.tool.ts` | Tool updates parameters in workflow JSON |
| 3.3 | Create get_node_parameters tool | `src/tools/get-params.tool.ts` | Tool retrieves current parameter values |
| 3.4 | Create assign_credentials tool | `src/tools/assign-credentials.tool.ts` | Tool assigns credentials from available list |
| 3.5 | Implement configurator agent with tools | `src/graph/agents/configurator.ts` | Agent calls tools to configure nodes |
| 3.6 | Add credential type detection from node type | `src/n8n/credentials.ts` | Detect required credential types per node |
| 3.7 | Integrate configurator into main graph | `src/graph/index.ts` | Graph routes to configurator after builder |
| 3.8 | Add validation for parameter types | `src/tools/validate-params.ts` | Reject invalid parameter values |
| 3.9 | Test: full configuration flow | `tests/unit/configurator.test.ts` | Node parameters correctly set |
| 3.10 | Test: credential assignment | `tests/unit/credentials.test.ts` | Credentials assigned from VarLock |

**Success Metric:** Workflows have all required parameters and credentials set

---

## Action 4: React Chat UI with useStream

**Goal:** Build a modern React chat interface using LangGraph's useStream hook.

**References:**
- [useStream React Hook](https://docs.langchain.com/langsmith/use-stream-react)
- [LangGraph React Integration](https://langchain-ai.github.io/langgraphjs/cloud/how-tos/use_stream_react/)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 4.1 | Create React app with Vite + TypeScript | `ui/package.json`, `ui/vite.config.ts`, `ui/tsconfig.json` | App builds and runs on localhost:3001 |
| 4.2 | Install LangGraph SDK and configure useStream | `ui/package.json`, `ui/src/hooks/useWorkflowStream.ts` | Hook connects to backend stream |
| 4.3 | Create ChatMessage component | `ui/src/components/ChatMessage.tsx` | Renders user/assistant messages with markdown |
| 4.4 | Create ChatInput component with submit handling | `ui/src/components/ChatInput.tsx` | Text input with send button, Enter to submit |
| 4.5 | Create ChatPanel component with message history | `ui/src/components/ChatPanel.tsx` | Scrollable message list with auto-scroll |
| 4.6 | Add typing indicator during streaming | `ui/src/components/TypingIndicator.tsx` | Shows "Thinking..." during agent processing |
| 4.7 | Create PhaseIndicator showing current agent | `ui/src/components/PhaseIndicator.tsx` | Shows: Discovery → Builder → Configurator |
| 4.8 | Add WorkflowPreview component (JSON viewer) | `ui/src/components/WorkflowPreview.tsx` | Shows current workflow JSON with syntax highlighting |
| 4.9 | Implement conversation branching UI | `ui/src/components/BranchSelector.tsx` | Allow selecting previous conversation states |
| 4.10 | Add error handling and retry UI | `ui/src/components/ErrorMessage.tsx` | Shows error with retry button |
| 4.11 | Create session management (new/load/save) | `ui/src/hooks/useSession.ts`, `ui/src/components/SessionControls.tsx` | Persist and restore chat sessions |
| 4.12 | Add keyboard shortcuts (Cmd+Enter, Escape) | `ui/src/hooks/useKeyboardShortcuts.ts` | Submit with Cmd+Enter, cancel with Escape |
| 4.13 | Style with Tailwind CSS | `ui/tailwind.config.js`, `ui/src/styles/globals.css` | Modern, responsive design |
| 4.14 | Add dark mode support | `ui/src/hooks/useTheme.ts`, `ui/src/components/ThemeToggle.tsx` | Toggle between light/dark themes |
| 4.15 | Integration test: full chat flow | `ui/tests/e2e/chat.spec.ts` | User can send message and receive streamed response |

**Success Metric:** Users can chat and see real-time streaming responses

---

## Action 5: Canvas Streaming Integration

**Goal:** Stream node creation to n8n canvas in real-time as the agent builds.

**References:**
- [n8n useCanvasOperations](packages/frontend/editor-ui/src/app/composables/useCanvasOperations.ts)
- [builder.store.ts applyWorkflowUpdate](packages/frontend/editor-ui/src/features/ai/assistant/builder.store.ts)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 5.1 | Create WebSocket server for real-time updates | `src/server/websocket.ts` | WS server accepts connections on /ws |
| 5.2 | Define streaming protocol (node_added, connection_added, etc.) | `src/types/streaming.ts` | Protocol types for all workflow events |
| 5.3 | Emit events from builder agent as nodes are created | `src/graph/agents/builder.ts` | Agent emits node_added after each node |
| 5.4 | Create useCanvasStream hook for React | `ui/src/hooks/useCanvasStream.ts` | Hook receives and processes WS events |
| 5.5 | Animate node appearance on canvas | `ui/src/components/AnimatedNode.tsx` | Nodes fade in with animation |
| 5.6 | Animate connection drawing | `ui/src/components/AnimatedConnection.tsx` | Connections draw progressively |
| 5.7 | Add progress indicator for multi-node creation | `ui/src/components/BuildProgress.tsx` | Show "Creating node 3/5..." |
| 5.8 | Handle reconnection and state recovery | `ui/src/hooks/useCanvasStream.ts` | Reconnect and replay missed events |
| 5.9 | Create mini-canvas preview in chat | `ui/src/components/MiniCanvas.tsx` | Small canvas showing workflow being built |
| 5.10 | Test: streaming performance with 20+ nodes | `tests/performance/streaming.test.ts` | All nodes appear within 2s of creation |

**Success Metric:** Nodes appear on canvas within 100ms of agent creating them

---

## Action 6: n8n Editor Integration

**Goal:** Embed the workflow architect chat directly in n8n's editor UI.

**References:**
- [n8n Frontend Structure](packages/frontend/editor-ui/src/)
- [AI Assistant Components](packages/frontend/editor-ui/src/features/ai/assistant/)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 6.1 | Create WorkflowArchitect Vue component | `packages/frontend/editor-ui/src/features/workflow-architect/WorkflowArchitect.vue` | Component renders chat UI |
| 6.2 | Add chat panel to editor sidebar | `packages/frontend/editor-ui/src/features/workflow-architect/WorkflowArchitectPanel.vue` | Panel appears in sidebar |
| 6.3 | Create Pinia store for architect state | `packages/frontend/editor-ui/src/features/workflow-architect/architect.store.ts` | Store manages chat messages and workflow |
| 6.4 | Connect to backend via SSE/WebSocket | `packages/frontend/editor-ui/src/features/workflow-architect/architect.api.ts` | API client handles streaming |
| 6.5 | Integrate with useCanvasOperations for node creation | `packages/frontend/editor-ui/src/features/workflow-architect/useArchitectCanvas.ts` | Created nodes appear on actual n8n canvas |
| 6.6 | Add feature flag for architect (aiArchitectEnabled) | `packages/frontend/editor-ui/src/app/stores/settings.store.ts` | Feature can be enabled/disabled |
| 6.7 | Add keyboard shortcut to open architect (Cmd+Shift+A) | `packages/frontend/editor-ui/src/features/workflow-architect/useArchitectShortcuts.ts` | Shortcut opens architect panel |
| 6.8 | Style to match n8n design system | `packages/frontend/editor-ui/src/features/workflow-architect/styles.scss` | Uses n8n CSS variables |
| 6.9 | Add i18n translations | `packages/@n8n/i18n/src/locales/en.json` | All strings translated |
| 6.10 | Create backend route for architect API | `packages/cli/src/controllers/workflow-architect.controller.ts` | REST + streaming endpoints |
| 6.11 | Add backend service for architect | `packages/cli/src/services/workflow-architect.service.ts` | Service orchestrates agent graph |
| 6.12 | Integration test: full flow in n8n editor | `packages/testing/playwright/tests/e2e/workflow-architect.spec.ts` | User can chat and workflow appears on canvas |

**Success Metric:** Users can use architect from within n8n editor, nodes appear on canvas

---

## Action 7: Advanced RAG (Hybrid Search + Reranking)

**Goal:** Improve RAG quality with hybrid semantic+keyword search and reranking.

**References:**
- [Supabase Semantic Search](https://supabase.com/docs/guides/ai/semantic-search)
- [Hybrid Search Best Practices](https://sparkco.ai/blog/mastering-supabase-vector-storage-a-2025-deep-dive)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 7.1 | Add full-text search column with tsvector | `supabase/migrations/009_fulltext_search.sql` | tsvector column on workflow_examples |
| 7.2 | Create GIN index for full-text search | `supabase/migrations/010_gin_index.sql` | Full-text queries <50ms |
| 7.3 | Implement hybrid search combining vector + FTS | `src/rag/hybrid-search.ts` | Function combines both search methods |
| 7.4 | Add Reciprocal Rank Fusion (RRF) for result merging | `src/rag/rrf-fusion.ts` | RRF combines vector and FTS rankings |
| 7.5 | Implement cross-encoder reranker with Cohere | `src/rag/reranker.ts` | Rerank top-20 to top-5 |
| 7.6 | Add query expansion with synonyms | `src/rag/query-expansion.ts` | Expand "email" → "email, smtp, sendgrid" |
| 7.7 | Implement metadata filtering (category, techniques) | `src/rag/metadata-filter.ts` | Filter by category before search |
| 7.8 | Add search analytics tracking | `src/rag/analytics.ts`, `supabase/migrations/011_search_analytics.sql` | Track queries and result clicks |
| 7.9 | Create A/B test framework for search quality | `src/rag/ab-test.ts` | Compare search algorithms |
| 7.10 | Test: search relevance metrics (MRR, NDCG) | `tests/quality/search-relevance.test.ts` | MRR > 0.7, NDCG > 0.8 |

**Success Metric:** Search MRR (Mean Reciprocal Rank) > 0.7

---

## Action 8: Multi-Model Enhancements

**Goal:** Optimize model routing and add support for new models (Grok 4.2).

**References:**
- [Model Capabilities Research](docs/2025-12-26_RESEARCH_Meta-Workflow-AI-MCP-Frontier-Models.md)

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 8.1 | Add Grok 4.2 model configuration (placeholder) | `src/models/router.ts`, `src/models/grok.ts` | Model config ready for when API available |
| 8.2 | Implement task-based model selection | `src/models/task-router.ts` | Different models for discovery vs builder |
| 8.3 | Add cost tracking per request | `src/models/cost-tracker.ts` | Track input/output tokens and cost |
| 8.4 | Implement model fallback with retry | `src/models/fallback.ts` | If primary fails, try fallback model |
| 8.5 | Add latency monitoring per model | `src/models/latency-monitor.ts` | Track p50, p95, p99 latencies |
| 8.6 | Create model selection dashboard | `ui/src/components/ModelDashboard.tsx` | Show cost, latency, success rates |
| 8.7 | Implement dynamic routing based on load | `src/models/load-balancer.ts` | Route to faster model under load |
| 8.8 | Add model-specific prompt optimization | `src/prompts/model-specific/*.ts` | Optimized prompts per model |
| 8.9 | Test: model comparison benchmarks | `tests/benchmarks/model-comparison.test.ts` | Compare quality and speed |
| 8.10 | Document model selection strategy | `docs/model-selection.md` | Clear docs on when each model is used |

**Success Metric:** Optimal model selected for each task, <5% fallback rate

---

## Action 9: Testing Suite

**Goal:** Comprehensive tests for reliability and confidence in deployments.

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 9.1 | Unit tests for n8n client | `tests/unit/n8n-client.test.ts` | 100% coverage of client methods |
| 9.2 | Unit tests for model router | `tests/unit/model-router.test.ts` | All routing paths tested |
| 9.3 | Unit tests for RAG store | `tests/unit/rag-store.test.ts` | Add, search, delete tested |
| 9.4 | Unit tests for each agent | `tests/unit/agents/*.test.ts` | Each agent tested in isolation |
| 9.5 | Integration tests for agent graph | `tests/integration/graph.test.ts` | Full graph execution tested |
| 9.6 | Integration tests for Supabase | `tests/integration/supabase.test.ts` | CRUD + search operations tested |
| 9.7 | E2E tests for CLI | `tests/e2e/cli.test.ts` | Full CLI workflow tested |
| 9.8 | E2E tests for web UI | `ui/tests/e2e/app.spec.ts` | Full UI workflow tested |
| 9.9 | Performance tests | `tests/performance/*.test.ts` | Latency and throughput benchmarks |
| 9.10 | Create CI pipeline with GitHub Actions | `.github/workflows/test.yml` | Tests run on every PR |
| 9.11 | Add coverage reporting | `vitest.config.ts`, `.github/workflows/test.yml` | Coverage > 80% required |
| 9.12 | Create test fixtures for workflows | `tests/fixtures/workflows/*.json` | Reusable test data |

**Success Metric:** >80% code coverage, all tests pass on CI

---

## Action 10: Production Hardening

**Goal:** Make the system production-ready with proper error handling, observability, and security.

### Subtasks

| # | Task | Files (max 5) | Success Criteria |
|---|------|---------------|------------------|
| 10.1 | Add structured error types | `src/errors/index.ts` | Custom error classes with codes |
| 10.2 | Implement error boundary in React UI | `ui/src/components/ErrorBoundary.tsx` | Graceful error handling in UI |
| 10.3 | Add request rate limiting | `src/server/rate-limit.ts` | 100 req/min per user |
| 10.4 | Implement request timeout handling | `src/server/timeout.ts` | 30s timeout with graceful cancel |
| 10.5 | Add OpenTelemetry tracing | `src/observability/tracing.ts` | Traces for all agent operations |
| 10.6 | Add Prometheus metrics | `src/observability/metrics.ts` | Request count, latency, errors |
| 10.7 | Create health check endpoint | `src/server/health.ts` | /health returns status of all deps |
| 10.8 | Add graceful shutdown | `src/server/shutdown.ts` | Clean shutdown on SIGTERM |
| 10.9 | Implement request logging | `src/server/logging.ts` | Structured logs for all requests |
| 10.10 | Add input sanitization | `src/security/sanitize.ts` | Prevent injection attacks |
| 10.11 | Create Dockerfile and docker-compose | `Dockerfile`, `docker-compose.yml` | One-command deployment |
| 10.12 | Add Kubernetes manifests | `k8s/*.yaml` | K8s deployment ready |
| 10.13 | Create runbook for operations | `docs/runbook.md` | Common issues and solutions |
| 10.14 | Security audit checklist | `docs/security-checklist.md` | All security measures documented |

**Success Metric:** 99.9% uptime, <1% error rate, full observability

---

## Progress Tracking

### Overall Status

| Phase | Actions | Status | Progress |
|-------|---------|--------|----------|
| Foundation | 1-3 | 🔄 In Progress | 0/32 |
| Frontend | 4-6 | ⏳ Pending | 0/37 |
| Quality | 7-9 | ⏳ Pending | 0/32 |
| Production | 10 | ⏳ Pending | 0/14 |
| **Total** | **10** | **🔄** | **0/115** |

### Key Milestones

| Milestone | Target | Depends On |
|-----------|--------|------------|
| RAG on Supabase | Action 1 complete | - |
| Chat UI working | Action 4 complete | - |
| Full n8n integration | Action 6 complete | Actions 4, 5 |
| Production deploy | Action 10 complete | All |

---

## Getting Started

```bash
# 1. Set up Supabase
supabase link --project-ref your-project-ref
supabase db push

# 2. Configure environment
cp .env.schema .env
# Add SUPABASE_URL, SUPABASE_ANON_KEY

# 3. Run migrations
pnpm supabase:migrate

# 4. Index workflows
pnpm index-workflows

# 5. Start development
pnpm dev
```

---

## Sources

- [Supabase AI & Vectors](https://supabase.com/docs/guides/ai)
- [Supabase Automatic Embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [LangGraph useStream Hook](https://docs.langchain.com/langsmith/use-stream-react)
- [Supabase Vercel Integration](https://vercel.com/marketplace/supabase)
- [n8n Workflow Create API](https://docs.n8n.io/workflows/create/)

---

*Last updated: December 28, 2025*
