# The Mother of All Flows: Top 10 Highest Leverage Actions

This document outlines the 10 highest leverage actions to build enterprise-grade, AI-powered workflow automation with n8n 2.0.

---

## 1. Build an Autonomous AI Agent with Tool Orchestration

**Leverage**: Highest - One agent can replace dozens of manual workflows

**Implementation**:
```
ChatTrigger → AI Agent (ReAct v3.1) → Tools → Response
```

**Key Components**:
- Use the **AI Agent node** with ReAct architecture for autonomous decision-making
- Equip with tools: `ToolWorkflow`, `ToolHttpRequest`, `ToolCode`, `ToolVectorStore`
- Add **MemoryBufferWindow** or **MemoryPostgresChat** for conversation persistence
- Enable streaming responses for real-time feedback

**Files to Study**:
- `packages/@n8n/nodes-langchain/nodes/agents/Agent/`
- `packages/@n8n/nodes-langchain/nodes/tools/`

**Why It's High Leverage**: A single agent can dynamically choose from dozens of tools, adapting to any user request without hardcoded branching logic.

---

## 2. Implement RAG (Retrieval Augmented Generation) Pipeline

**Leverage**: Very High - Ground AI responses in your actual data

**Architecture**:
```
┌─────────────────────────────────────────────────────────┐
│  INGESTION PIPELINE                                      │
│  Documents → TextSplitter → Embeddings → VectorStore    │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│  QUERY PIPELINE                                          │
│  User Query → RetrieverMultiQuery → ChainRetrievalQA    │
└─────────────────────────────────────────────────────────┘
```

**Key Components**:
- **Vector Stores**: Pinecone, Qdrant, PostgreSQL (pgvector), or Supabase
- **Text Splitters**: RecursiveCharacterTextSplitter for documents
- **Retrievers**: Use `RetrieverMultiQuery` for better recall
- **Chain**: `ChainRetrievalQA` for knowledge-grounded responses

**Why It's High Leverage**: Eliminates hallucinations by grounding responses in your actual knowledge base.

---

## 3. Create Reusable Sub-Workflows as AI Tools

**Leverage**: Very High - Compound automation with modularity

**Pattern**:
```
Main Workflow (AI Agent)
    └→ ToolWorkflow: "Search CRM"
    └→ ToolWorkflow: "Create Invoice"
    └→ ToolWorkflow: "Send Notification"
    └→ ToolWorkflow: "Analyze Data"
```

**Implementation**:
1. Build specialized sub-workflows for each capability
2. Add `ExecuteWorkflowTrigger` to each sub-workflow
3. Use `ToolWorkflow` node to expose them to AI agents
4. Document tool descriptions clearly for agent understanding

**Why It's High Leverage**: Build once, reuse everywhere. Complex operations become single-tool calls.

---

## 4. Multi-Model AI with Fallback Chains

**Leverage**: High - Reliability + Cost optimization

**Architecture**:
```
User Input → ChainLLM (GPT-4o)
                 ↓ (on failure)
             ChainLLM (Claude 3.5)
                 ↓ (on failure)
             ChainLLM (Gemini Pro)
                 ↓
             OutputParserAutofixing → Response
```

**Key Components**:
- Configure primary model (e.g., GPT-4o for quality)
- Add fallback models with `continueOnFail: true`
- Use `OutputParserAutofixing` to repair malformed responses
- Implement exponential backoff for rate limits

**Why It's High Leverage**: Never fail due to a single provider outage. Optimize cost by routing simple tasks to cheaper models.

---

## 5. Event-Driven Webhook Orchestration Hub

**Leverage**: High - Central nervous system for all integrations

**Pattern**:
```
┌──────────────────────────────────────────────────────────┐
│                    WEBHOOK HUB                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Stripe  │  │  GitHub  │  │  Slack   │  │ Shopify  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       └─────────────┴─────────────┴─────────────┘       │
│                           ↓                              │
│                    Switch (Route)                        │
│                           ↓                              │
│          ┌────────────────┼────────────────┐            │
│          ↓                ↓                ↓            │
│    ProcessPayment   HandlePR      NotifyTeam           │
└──────────────────────────────────────────────────────────┘
```

**Implementation**:
1. Create a master webhook endpoint
2. Use `Switch` node to route by event type/source
3. Call specialized sub-workflows for each event type
4. Implement idempotency with `$workflow.staticData`

**Why It's High Leverage**: Single entry point for all external events. Easy to monitor, debug, and extend.

---

## 6. Structured Data Extraction Pipeline

**Leverage**: High - Turn unstructured data into actionable insights

**Architecture**:
```
Input (Email/PDF/Web) → InformationExtractor → OutputParserStructured
                                                        ↓
                                                 Validate Schema
                                                        ↓
                                            Database/API/Workflow
```

**Key Components**:
- **InformationExtractor** node with JSON schema
- **OutputParserStructured** for validation
- Define clear Zod/JSON schemas for expected output
- Handle parsing failures with retry logic

**Example Schema**:
```json
{
  "customer_name": "string",
  "order_items": [{"product": "string", "quantity": "number"}],
  "total_amount": "number",
  "shipping_address": "object"
}
```

**Why It's High Leverage**: Automate data entry from any source - emails, PDFs, images, web pages.

---

## 7. Conversational Memory with Context Management

**Leverage**: High - Enable true multi-turn AI interactions

**Architecture**:
```
ChatTrigger
     ↓
MemoryManager (Search previous context)
     ↓
AI Agent + MemoryBufferWindow
     ↓
MemoryManager (Store new context)
     ↓
Response
```

**Memory Options by Use Case**:
| Use Case | Memory Type | Why |
|----------|-------------|-----|
| Quick demos | MemoryBufferWindow | Simple, in-memory |
| Production chat | MemoryPostgresChat | Persistent, queryable |
| Semantic search | MemoryChatRetriever | Find relevant past context |
| High-performance | MemoryRedisChat | Fast, distributed |

**Why It's High Leverage**: Transform stateless AI into contextual assistants that remember users and conversations.

---

## 8. MCP Server: Expose Workflows to External AI

**Leverage**: High - Let Claude/GPT call your workflows directly

**Architecture**:
```
External AI (Claude Desktop, GPT)
            ↓
      MCP Protocol
            ↓
    McpTrigger (n8n)
            ↓
    Your Workflow Logic
            ↓
      Response to AI
```

**Implementation**:
1. Add `McpTrigger` to workflow
2. Configure tool name and description
3. Define input schema
4. Enable SSE transport for streaming
5. Connect from Claude Desktop or other MCP clients

**Why It's High Leverage**: Your n8n workflows become tools for ANY AI system. Build once, use from Claude, GPT, or custom agents.

---

## 9. Parallel Batch Processing with Error Recovery

**Leverage**: High - Process thousands of items efficiently

**Pattern**:
```
Input (1000 items)
       ↓
 SplitInBatches (100/batch)
       ↓
 ┌─────┴─────┐
 ↓     ↓     ↓   (Parallel execution)
Batch1 Batch2 Batch3...
 ↓     ↓     ↓
 └─────┬─────┘
       ↓
 Merge Results
       ↓
 Error Handler (retry failed items)
```

**Implementation**:
- Use `SplitInBatches` node with configurable batch size
- Enable `continueOnFail` for resilience
- Track failed items in `$workflow.staticData`
- Implement retry workflow for failures
- Add delay between batches for rate limits

**Code Pattern**:
```javascript
// In Code node - parallel processing
const results = await Promise.allSettled(
  items.map(item => processItem(item))
);

const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');
```

**Why It's High Leverage**: Handle enterprise-scale data volumes with proper error handling and recovery.

---

## 10. Self-Healing Workflow with AI Error Analysis

**Leverage**: Transformative - Workflows that fix themselves

**Architecture**:
```
Main Workflow
      ↓
   On Error
      ↓
ErrorTrigger
      ↓
AI Agent (Analyze Error)
      ↓
┌─────┴─────────────┐
↓                   ↓
Auto-Fix         Alert Human
(retry/adjust)   (Slack/Email)
```

**Implementation**:
1. Add `ErrorTrigger` to catch workflow failures
2. Send error context to AI Agent for analysis
3. Use `ToolWorkflow` to retry with adjusted parameters
4. If AI can't fix, escalate to human via Slack/Email
5. Log all errors and resolutions for learning

**AI Prompt Pattern**:
```
Analyze this workflow error and suggest a fix:
- Error: {{$json.error.message}}
- Node: {{$json.error.node}}
- Input: {{$json.error.input}}

Respond with:
1. Root cause analysis
2. Suggested fix (if automatable)
3. Whether human intervention is needed
```

**Why It's High Leverage**: Reduce on-call burden. Workflows become increasingly reliable over time.

---

## Implementation Priority Matrix

| Action | Impact | Effort | Priority |
|--------|--------|--------|----------|
| 1. AI Agent with Tools | Very High | Medium | P0 |
| 2. RAG Pipeline | Very High | High | P0 |
| 3. Sub-Workflow Tools | High | Low | P1 |
| 4. Multi-Model Fallback | High | Low | P1 |
| 5. Webhook Hub | High | Medium | P1 |
| 6. Data Extraction | High | Medium | P2 |
| 7. Conversational Memory | High | Medium | P2 |
| 8. MCP Server | Medium | Low | P2 |
| 9. Batch Processing | High | Medium | P2 |
| 10. Self-Healing | Transformative | High | P3 |

---

## Quick Start: Minimum Viable "Mother Flow"

Combine actions 1, 2, and 3 for immediate high impact:

```
ChatTrigger (User Interface)
        ↓
MemoryBufferWindow (Context)
        ↓
AI Agent (Brain)
    ├→ ToolVectorStore (Knowledge - RAG)
    ├→ ToolWorkflow: "Search Database"
    ├→ ToolWorkflow: "Create Record"
    ├→ ToolWorkflow: "Send Email"
    └→ ToolCode: "Custom Logic"
        ↓
RespondToChat (Output)
```

This single workflow can:
- Answer questions from your knowledge base
- Execute complex multi-step operations
- Remember conversation context
- Adapt to any user request dynamically

---

## Next Steps

1. **Set up development environment**: `pnpm install && pnpm dev`
2. **Start with Action 1**: Build a basic AI Agent
3. **Add RAG (Action 2)**: Connect to your knowledge base
4. **Modularize (Action 3)**: Extract capabilities as sub-workflows
5. **Scale (Actions 4-10)**: Add reliability, monitoring, and advanced features

---

*Built for n8n 2.1.4 | See [CLAUDE.md](./CLAUDE.md) and [GEMINI.md](./GEMINI.md) for AI assistant guidelines*
