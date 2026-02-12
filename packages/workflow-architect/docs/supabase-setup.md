# Supabase Setup Guide for Workflow Architect

This guide walks you through setting up Supabase as the vector database for the Workflow Architect RAG system.

## Prerequisites

- A Supabase account (free tier works for development)
- Node.js 20+ and pnpm installed
- OpenAI API key for embeddings

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned (~2 minutes)
3. Note your project URL and keys from Settings > API

### 2. Enable pgvector Extension

In the Supabase SQL Editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Run Migrations

The migrations are located in `supabase/migrations/`. Run them in order:

```sql
-- 001_workflow_examples.sql: Creates tables
-- 002_match_function.sql: Creates similarity search functions
-- 003_hnsw_index.sql: Creates HNSW indexes for fast search
-- 004_rls_policies.sql: Enables Row Level Security
```

You can run them via the Supabase SQL Editor or using the Supabase CLI:

```bash
npx supabase db push
```

### 4. Configure Environment Variables

Add these to your `.env` file:

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# For embeddings
OPENAI_API_KEY=sk-...

# Set store type
VECTOR_STORE_TYPE=supabase
```

### 5. Migrate Existing Workflows

If you have existing workflow examples, migrate them:

```bash
pnpm run migrate-supabase
```

## Architecture

### Tables

#### `workflow_examples`
Stores complete workflow definitions with embeddings.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Workflow name |
| description | TEXT | Human description |
| category | ENUM | Workflow category |
| techniques | TEXT[] | Techniques used |
| workflow_json | JSONB | Full n8n workflow |
| embedding | vector(1536) | Semantic embedding |
| embedding_status | ENUM | pending/processing/completed/failed |
| node_count | INTEGER | Auto-calculated |
| node_types | TEXT[] | Auto-extracted |

#### `workflow_node_chunks`
Stores individual node embeddings for fine-grained search.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workflow_id | UUID | Parent workflow |
| node_id | TEXT | n8n node ID |
| node_name | TEXT | Node name |
| node_type | TEXT | n8n node type |
| semantic_content | TEXT | Context for embedding |
| embedding | vector(1536) | Node embedding |
| connected_to | TEXT[] | Outgoing connections |
| connected_from | TEXT[] | Incoming connections |
| is_trigger | BOOLEAN | Is trigger node |
| is_ai_node | BOOLEAN | Is AI/LangChain node |

### Search Functions

#### `match_workflows(query_embedding, match_threshold, match_count, ...)`
Vector similarity search on workflow-level embeddings.

#### `match_nodes(query_embedding, match_threshold, match_count, ...)`
Vector similarity search on node-level embeddings.

#### `hybrid_search_workflows(query_text, query_embedding, ...)`
Combines vector similarity with full-text search using RRF fusion.

## Indexing Strategy

We use HNSW (Hierarchical Navigable Small World) indexes for vector search:

- **Better recall** than IVFFlat at query time
- **No training required** - builds incrementally
- **Parameters**: m=16, ef_construction=64

```sql
CREATE INDEX idx_workflow_examples_embedding_hnsw ON workflow_examples
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

## Row Level Security

RLS is enabled to support multi-tenant deployments:

- **Public workflows**: Viewable by everyone
- **Private workflows**: Only viewable by owner
- **Organization workflows**: Viewable by org members

Service role key bypasses RLS for server-side operations.

## Performance Optimization

### Query Performance

For optimal search performance:

1. Use HNSW indexes (included in migrations)
2. Set appropriate `ef_search` parameter:
   ```sql
   SET hnsw.ef_search = 40; -- Higher = better recall, slower
   ```

3. Use threshold filtering to reduce result set:
   ```typescript
   await store.searchWorkflows(query, {
     threshold: 0.7, // Only return >70% similar
     limit: 5,
   });
   ```

### Embedding Performance

- Embeddings are generated asynchronously
- Use batch embedding for initial imports
- Monitor `embedding_status` for failures

## Troubleshooting

### "relation does not exist" Error

Run migrations in order:
```bash
npx supabase db push
```

### Slow Search Queries

1. Check index exists:
   ```sql
   SELECT * FROM pg_indexes WHERE indexname LIKE '%hnsw%';
   ```

2. Increase `ef_search` for better recall:
   ```sql
   SET hnsw.ef_search = 100;
   ```

### Embedding Failures

Check the `embedding_status` column:
```sql
SELECT id, name, embedding_status
FROM workflow_examples
WHERE embedding_status = 'failed';
```

Re-embed failed workflows:
```typescript
await store.reembedWorkflow(workflowId);
```

## Monitoring

### View Statistics

```typescript
const stats = await store.getStats();
console.log(stats);
// { totalWorkflows: 34, totalNodeChunks: 156, pendingEmbeddings: 0, failedEmbeddings: 0 }
```

### Query Performance

Use Supabase Dashboard > Database > Query Performance to monitor slow queries.

## Resources

- [Supabase Vector Docs](https://supabase.com/docs/guides/ai/vector-columns)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [HNSW Index Guide](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
