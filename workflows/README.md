# Mother of All Flows - Workflow Templates

Production-ready n8n 2.0 workflow templates implementing the highest leverage automation patterns.

## Workflow Library Overview

| Category | Count | Description |
|----------|-------|-------------|
| **Core Templates (Phase 1)** | 8 | Original high-leverage workflow patterns |
| **Core Templates (Phase 2)** | 10 | Advanced enterprise patterns |
| **Community Verified** | 16 | Curated from top community repositories |
| **Total** | 34 | Ready-to-import workflows |

### Core Templates - Phase 1 (Actions 1-10)

| # | Workflow | Pattern |
|---|----------|---------|
| 01 | AI Agent Orchestrator | Autonomous agent with tools |
| 02 | RAG Pipeline | Document ingestion + knowledge Q&A |
| 03 | Webhook Hub | Event routing orchestration |
| 04 | Self-Healing Error Handler | AI error analysis + recovery |
| 05 | Multi-Model Fallback | GPT-4o → Claude → Gemini chain |
| 06 | Batch Processor | Parallel processing with recovery |
| 07 | Data Extractor | Structured extraction from text |
| 08 | Sub-Workflow Tool | Reusable tool template for agents |

### Core Templates - Phase 2 (Actions 11-20) ✅ COMPLETE

| # | Workflow | Pattern |
|---|----------|---------|
| 09 | Scheduled Automation | Timezone-aware cron with business hours |
| 10 | Data Sync Pipeline | Bidirectional sync with conflict resolution |
| 11 | Approval Workflow | Human-in-the-loop with escalation |
| 12 | API Gateway | REST routing, rate limiting, caching |
| 13 | AI Classification | Auto-categorization with confidence routing |
| 14 | Document Processor | OCR + AI field extraction |
| 15 | Notification Hub | Multi-channel notifications with tracking |
| 16 | Workflow Tester | Integration testing with CI/CD support |
| 17 | Analytics Pipeline | Real-time metrics with anomaly detection |
| 18 | Audit Trail | Security logging with PII masking |

See also: [Community Workflows](./community/README.md)

## Quick Start

### 1. Import Workflows

```bash
# Start n8n
pnpm start

# Navigate to n8n UI (default: http://localhost:5678)
# Go to Workflows → Import from File
# Select the .workflow.json files from this directory
```

### 2. Configure Credentials

Each workflow requires credentials to be configured:

| Workflow | Required Credentials |
|----------|---------------------|
| AI Agent Orchestrator | OpenAI API |
| RAG Pipeline | OpenAI API |
| Webhook Hub | None (optional: Slack for notifications) |
| Self-Healing Error Handler | OpenAI API, Slack (optional) |

### 3. Activate Workflows

After configuring credentials, activate each workflow by toggling the switch in the top-right corner.

---

## Workflow Templates

### 01 - AI Agent Orchestrator
**File:** `01-ai-agent-orchestrator.workflow.json`

Autonomous AI agent with ReAct architecture and multi-tool orchestration.

**Features:**
- Chat interface with streaming responses
- Conversation memory (buffer window)
- Tool: Vector store search (RAG)
- Tool: Code execution
- Tool: HTTP requests
- Tool: Thinking/reasoning

**Usage:**
1. Import and configure OpenAI credentials
2. Activate the workflow
3. Access chat at: `http://localhost:5678/webhook/mother-of-all-flows-chat`

---

### 02 - RAG Pipeline
**File:** `02-rag-pipeline.workflow.json`

Complete Retrieval Augmented Generation system with document ingestion and query.

**Features:**
- Document ingestion webhook
- Recursive text splitting
- OpenAI embeddings
- In-memory vector store (replace with Pinecone/Qdrant for production)
- Question answering with source retrieval

**Endpoints:**
- **Ingest:** `POST /webhook/rag-ingest`
  ```json
  {
    "text": "Your document content here...",
    "metadata": { "source": "document.pdf" }
  }
  ```
- **Query:** Chat interface at `/webhook/rag-query`

---

### 03 - Webhook Hub
**File:** `03-webhook-hub.workflow.json`

Central event routing hub for multi-source webhooks.

**Features:**
- Single entry point for all events
- Route by source (Stripe, GitHub, Slack, etc.)
- Extensible processing per source
- Fallback for unknown sources

**Endpoint:** `POST /webhook/event-hub`
```json
{
  "source": "stripe",
  "type": "payment.succeeded",
  "data": { ... }
}
```

---

### 04 - Self-Healing Error Handler
**File:** `04-self-healing-error-handler.workflow.json`

AI-powered error analysis and automatic recovery system.

**Features:**
- Catches all workflow errors
- AI analysis of root cause
- Severity classification
- Automatic fix suggestions
- Team notifications for critical issues

**Setup:**
1. Import as a separate workflow
2. Link other workflows to use this as error handler
3. Configure Slack webhook for notifications (optional)

---

## Production Recommendations

### Replace In-Memory Vector Store

For production RAG, replace `vectorStoreInMemory` with:

```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStorePinecone",
  "credentials": {
    "pineconeApi": { "id": "YOUR_CREDENTIAL_ID" }
  }
}
```

Or use PostgreSQL with pgvector:
```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStorePostgres"
}
```

### Add Fallback Models

For reliability, add fallback chains:

```
GPT-4o (primary) → Claude 3.5 (fallback) → Gemini Pro (last resort)
```

### Enable Task Runners

n8n 2.0 runs Code nodes in isolated environments by default. Ensure task runners are properly configured:

```bash
# Environment variable (default in 2.0)
N8N_RUNNERS_ENABLED=true
```

### Persistent Memory

Replace `memoryBufferWindow` with persistent options:

- **PostgreSQL:** `memoryPostgresChat`
- **Redis:** `memoryRedisChat`
- **MongoDB:** `memoryMongoDbChat`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOTHER OF ALL FLOWS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  Chat UI    │────▶│  AI Agent   │────▶│  Response   │       │
│  └─────────────┘     └──────┬──────┘     └─────────────┘       │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ RAG Search  │     │ Sub-Flows   │     │ HTTP APIs   │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │Vector Store │     │  Database   │     │External SVC │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                         ┌─────────────┐       │
│  │ Webhook Hub │◀──── External Events ───│Error Handler│       │
│  └─────────────┘                         └─────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [MOTHER_OF_ALL_FLOWS.md](../MOTHER_OF_ALL_FLOWS.md) - Strategy guide
- [CLAUDE.md](../CLAUDE.md) - Claude AI assistant guide
- [GEMINI.md](../GEMINI.md) - Gemini AI assistant guide
- [AGENTS.md](../AGENTS.md) - General agent guidelines

---

## Support

- [n8n Documentation](https://docs.n8n.io)
- [Community Forum](https://community.n8n.io)
- [n8n 2.0 Migration Guide](https://docs.n8n.io/2-0-breaking-changes/)
