-- Migration: Add HNSW indexes for faster vector search
-- HNSW provides better query performance than IVFFlat for similarity search
-- References: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes

-- Drop existing IVFFlat indexes (created in 001)
DROP INDEX IF EXISTS idx_workflow_examples_embedding;
DROP INDEX IF EXISTS idx_workflow_node_chunks_embedding;

-- Create HNSW index on workflow_examples
-- Parameters:
--   m: Max connections per layer (higher = better recall, more memory)
--   ef_construction: Size of dynamic candidate list (higher = better index quality)
CREATE INDEX idx_workflow_examples_embedding_hnsw ON workflow_examples
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Create HNSW index on workflow_node_chunks
-- Using same parameters for consistency
CREATE INDEX idx_workflow_node_chunks_embedding_hnsw ON workflow_node_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Set the probes/ef_search parameter for queries (affects recall/speed tradeoff)
-- This sets the default for the session; can be adjusted per-query
-- Higher values = better recall but slower queries
ALTER SYSTEM SET hnsw.ef_search = 40;

-- Comments
COMMENT ON INDEX idx_workflow_examples_embedding_hnsw IS 'HNSW index for fast cosine similarity search on workflow embeddings';
COMMENT ON INDEX idx_workflow_node_chunks_embedding_hnsw IS 'HNSW index for fast cosine similarity search on node chunk embeddings';
