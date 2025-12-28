-- Migration: Create workflow_examples table with vector support
-- References: https://supabase.com/docs/guides/ai/vector-columns

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_net for webhook calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create enum for workflow categories
CREATE TYPE workflow_category AS ENUM (
  'ai-agent',
  'rag-pipeline',
  'data-pipeline',
  'integration',
  'automation',
  'monitoring',
  'approval-flow',
  'error-handling',
  'batch-processing'
);

-- Create enum for embedding status
CREATE TYPE embedding_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- Main workflow examples table
CREATE TABLE workflow_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Workflow metadata
  name TEXT NOT NULL,
  description TEXT,
  category workflow_category NOT NULL DEFAULT 'automation',
  techniques TEXT[] DEFAULT '{}',

  -- Full workflow JSON
  workflow_json JSONB NOT NULL,

  -- Embedding for semantic search (1536 dimensions for OpenAI text-embedding-3-small)
  embedding vector(1536),
  embedding_status embedding_status DEFAULT 'pending',
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedding_version INTEGER DEFAULT 1,

  -- Multi-tenancy support
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  is_public BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Searchable metadata
  node_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(workflow_json->'nodes')) STORED,
  node_types TEXT[] GENERATED ALWAYS AS (
    ARRAY(SELECT DISTINCT jsonb_array_elements_text(
      jsonb_path_query_array(workflow_json, '$.nodes[*].type')
    ))
  ) STORED
);

-- Create node-level chunks table for fine-grained semantic search
-- This implements node-level chunking with context preservation
CREATE TABLE workflow_node_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflow_examples(id) ON DELETE CASCADE,

  -- Node identification
  node_id TEXT NOT NULL,
  node_name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_index INTEGER NOT NULL,

  -- Semantic content for embedding
  -- Includes: node description, parameters, connected nodes context
  semantic_content TEXT NOT NULL,

  -- Node-level embedding
  embedding vector(1536),
  embedding_status embedding_status DEFAULT 'pending',

  -- Context preservation: connected nodes
  connected_to TEXT[] DEFAULT '{}',
  connected_from TEXT[] DEFAULT '{}',

  -- Chunk metadata
  is_trigger BOOLEAN DEFAULT false,
  is_ai_node BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for vector similarity search on workflow level
CREATE INDEX idx_workflow_examples_embedding ON workflow_examples
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for vector similarity search on node level
CREATE INDEX idx_workflow_node_chunks_embedding ON workflow_node_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for category filtering
CREATE INDEX idx_workflow_examples_category ON workflow_examples(category);

-- Index for techniques filtering (GIN for array)
CREATE INDEX idx_workflow_examples_techniques ON workflow_examples USING GIN(techniques);

-- Index for node types filtering
CREATE INDEX idx_workflow_examples_node_types ON workflow_examples USING GIN(node_types);

-- Index for public workflows
CREATE INDEX idx_workflow_examples_public ON workflow_examples(is_public) WHERE is_public = true;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_examples_updated_at
  BEFORE UPDATE ON workflow_examples
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Comments
COMMENT ON TABLE workflow_examples IS 'Stores n8n workflow templates with embeddings for RAG';
COMMENT ON TABLE workflow_node_chunks IS 'Node-level chunks for fine-grained semantic search';
COMMENT ON COLUMN workflow_examples.embedding IS '1536-dim vector from text-embedding-3-small';
COMMENT ON COLUMN workflow_node_chunks.semantic_content IS 'Enriched text with node context for embedding';
