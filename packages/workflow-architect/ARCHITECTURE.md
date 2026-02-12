# Workflow Architect - OSS Agentic Workflow Builder

## Overview

**Workflow Architect** is an open-source, multi-model agentic system that generates n8n workflows from natural language descriptions. It runs alongside n8n OSS and uses the public API for workflow management.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW ARCHITECT                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Chat UI    │───▶│  Model Router │───▶│ Agent Graph  │               │
│  │  (Web/CLI)   │    │  (Context-    │    │  (LangGraph) │               │
│  └──────────────┘    │   Aware)      │    └──────┬───────┘               │
│                      └──────────────┘           │                        │
│                                                  ▼                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        AGENT SUBGRAPHS                            │   │
│  │                                                                    │   │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐         │   │
│  │  │Supervisor│─▶│ Discovery │─▶│ Builder  │─▶│Configurator│         │   │
│  │  └─────────┘  └──────────┘  └──────────┘  └────────────┘         │   │
│  │       │                                            │               │   │
│  │       └──────────────────┬─────────────────────────┘               │   │
│  │                          ▼                                          │   │
│  │                   ┌────────────┐                                    │   │
│  │                   │ Responder  │                                    │   │
│  │                   └────────────┘                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │  RAG Store   │    │   VarLock    │    │  n8n Client  │               │
│  │  (Workflow   │    │  (Secrets)   │    │  (REST API)  │               │
│  │  Examples)   │    └──────────────┘    └──────────────┘               │
│  └──────────────┘                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                           ┌──────────────┐
                           │  n8n Server  │
                           │  (OSS/Cloud) │
                           └──────────────┘
```

## Multi-Model Strategy

### Model Router Logic

```typescript
function selectModel(context: ChatContext): ModelConfig {
  const tokenCount = estimateTokens(context);

  // Large context (>100k tokens) - use models with 1M+ context
  if (tokenCount > 100_000) {
    return {
      primary: 'gemini-3-pro',        // 1M context
      fallback: 'gpt-5.2-codex-xtrahigh'
    };
  }

  // Standard context - use Claude Opus 4.5 for best quality
  return {
    primary: 'claude-opus-4-5',
    fallback: 'gemini-3-pro'
  };

  // Future: Grok 4.2 when available
}
```

### Model Capabilities Matrix

| Model | Context | Best For | Cost |
|-------|---------|----------|------|
| Claude Opus 4.5 | 200k | Complex reasoning, tool use | $$$ |
| Gemini 3 Pro | 1M+ | Large context, vision | $$ |
| GPT-5.2 Codex | 256k | Code generation | $$$ |
| Grok 4.2 | TBD | Fast iteration (future) | TBD |

## RAG System

### Workflow Examples as Training Data

We use our 18 core templates + 16 community workflows as few-shot examples:

```typescript
interface WorkflowExample {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  nodes: INode[];
  connections: IConnections;
  techniques: string[];        // ['rag', 'error-handling', 'batch-processing']
  embedding: number[];         // Vector embedding of description + structure
}

type WorkflowCategory =
  | 'ai-agent'
  | 'data-pipeline'
  | 'integration'
  | 'automation'
  | 'monitoring'
  | 'approval-flow';
```

### Retrieval Strategy

1. **Semantic Search**: Embed user query, find similar workflow examples
2. **Category Matching**: Match detected techniques to relevant templates
3. **Node Similarity**: Find workflows using similar node types
4. **Hybrid Ranking**: Combine scores with recency/popularity weights

## Agent Architecture

### Supervisor Agent
- Routes requests to appropriate subgraph
- Tracks phase completion via coordination log
- Prevents infinite loops with deterministic routing

### Discovery Agent
- Searches n8n node registry for relevant nodes
- Retrieves best practices from documentation
- Pulls similar workflow examples from RAG store

### Builder Agent
- Creates nodes with proper connection parameters
- Establishes connections between nodes
- Validates workflow structure before proceeding

### Configurator Agent
- Sets node parameter values
- Handles credential assignment
- Validates complete workflow configuration

### Responder Agent
- Generates user-facing responses
- Explains what was built and why
- Provides next steps and suggestions

## VarLock Integration

### Schema Definition

```bash
# .env.schema (VarLock format)

# @description=n8n instance base URL
# @type=url
# @required
N8N_BASE_URL=

# @description=n8n API key for workflow management
# @type=string(minLength=32)
# @required @sensitive
N8N_API_KEY=

# @description=Claude API key
# @type=string(startsWith=sk-ant-)
# @required @sensitive
ANTHROPIC_API_KEY=

# @description=Google AI API key for Gemini
# @type=string
# @sensitive
GOOGLE_AI_API_KEY=

# @description=OpenAI API key for GPT models
# @type=string(startsWith=sk-)
# @sensitive
OPENAI_API_KEY=
```

### Credential Flow

1. User describes workflow needing credentials
2. System identifies required credential types
3. VarLock resolves secrets from environment
4. Credentials assigned to nodes automatically

## n8n API Client

### Workflow Operations

```typescript
class N8nClient {
  async createWorkflow(workflow: WorkflowDefinition): Promise<string>;
  async updateWorkflow(id: string, workflow: WorkflowDefinition): Promise<void>;
  async getWorkflow(id: string): Promise<WorkflowDefinition>;
  async deleteWorkflow(id: string): Promise<void>;
  async executeWorkflow(id: string, data?: unknown): Promise<ExecutionResult>;
  async listCredentials(type?: string): Promise<Credential[]>;
}
```

### Workflow Schema

```typescript
interface WorkflowDefinition {
  name: string;
  active: boolean;
  nodes: Array<{
    id: string;
    name: string;
    type: string;                    // e.g., "@n8n/n8n-nodes-langchain.agent"
    typeVersion: number;
    position: [number, number];
    parameters: Record<string, unknown>;
    credentials?: Record<string, { id: string; name: string }>;
  }>;
  connections: {
    [sourceNode: string]: {
      [connectionType: string]: Array<Array<{
        node: string;
        type: string;
        index: number;
      }>>;
    };
  };
  settings?: {
    executionOrder?: 'v1';
    saveDataSuccessExecution?: 'all' | 'none';
    timezone?: string;
  };
}
```

## Directory Structure

```
packages/workflow-architect/
├── src/
│   ├── agents/
│   │   ├── supervisor.agent.ts
│   │   ├── discovery.agent.ts
│   │   ├── builder.agent.ts
│   │   ├── configurator.agent.ts
│   │   └── responder.agent.ts
│   ├── graph/
│   │   ├── parent-graph.ts
│   │   ├── subgraphs/
│   │   └── state.ts
│   ├── models/
│   │   ├── router.ts
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   └── openai.ts
│   ├── rag/
│   │   ├── store.ts
│   │   ├── embeddings.ts
│   │   └── retriever.ts
│   ├── tools/
│   │   ├── node-search.tool.ts
│   │   ├── add-node.tool.ts
│   │   ├── connect-nodes.tool.ts
│   │   ├── update-params.tool.ts
│   │   └── validate.tool.ts
│   ├── n8n/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── credentials.ts
│   ├── varlock/
│   │   ├── integration.ts
│   │   └── schema.ts
│   ├── chat/
│   │   ├── server.ts
│   │   ├── session.ts
│   │   └── ui/
│   └── index.ts
├── examples/
│   └── workflows/           # Symlink to /workflows
├── .env.schema              # VarLock schema
├── package.json
└── tsconfig.json
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up package structure with TypeScript
- [ ] Implement n8n API client
- [ ] Create VarLock integration
- [ ] Build basic chat server (Express + WebSocket)

### Phase 2: RAG System (Week 2)
- [ ] Create workflow embedding pipeline
- [ ] Set up vector store (Chroma/Pinecone/local)
- [ ] Implement semantic search retriever
- [ ] Index all 34 workflow examples

### Phase 3: Agent Graph (Week 3)
- [ ] Implement LangGraph state machine
- [ ] Create supervisor routing logic
- [ ] Build discovery agent with node search
- [ ] Build builder agent with workflow tools

### Phase 4: Multi-Model & Polish (Week 4)
- [ ] Implement model router with fallbacks
- [ ] Add configurator and responder agents
- [ ] Create chat UI (React or CLI)
- [ ] Integration testing with real n8n instance

## Usage

```bash
# Start the workflow architect server
pnpm --filter=workflow-architect start

# Or use CLI mode
pnpm --filter=workflow-architect chat

# Example interaction:
> Create a workflow that monitors a Slack channel for messages containing
> "urgent", sends them to GPT-4 for categorization, and creates Jira tickets
> for high-priority items.

Building your workflow...
- Found: Slack Trigger, OpenAI Chat Model, Jira Software
- Creating: 4 nodes with 3 connections
- Assigning credentials from VarLock

✓ Workflow "Urgent Slack to Jira" created and deployed
  ID: abc123
  URL: http://localhost:5678/workflow/abc123
```

## Future Enhancements

1. **Visual Feedback**: Stream node creation to canvas in real-time
2. **Workflow Debugging**: AI-assisted error diagnosis
3. **Template Generation**: Create reusable templates from working flows
4. **Multi-Workflow Orchestration**: Parent workflows managing children
5. **Learning Loop**: Improve from user corrections
