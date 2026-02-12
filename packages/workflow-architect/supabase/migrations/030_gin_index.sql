-- Migration: Create GIN indexes for full-text search performance
-- GIN (Generalized Inverted Index) is optimized for full-text search
-- References: https://www.postgresql.org/docs/current/textsearch-indexes.html

-- Create GIN index on workflow_examples.search_vector
-- This index dramatically speeds up full-text queries using @@ operator
CREATE INDEX IF NOT EXISTS idx_workflow_examples_search_vector
  ON workflow_examples
  USING GIN(search_vector);

-- Create GIN index on workflow_node_chunks.search_vector
CREATE INDEX IF NOT EXISTS idx_workflow_node_chunks_search_vector
  ON workflow_node_chunks
  USING GIN(search_vector);

-- Create composite index for filtered full-text search
-- Supports queries that combine FTS with category filtering
CREATE INDEX IF NOT EXISTS idx_workflow_examples_category_search
  ON workflow_examples(category, search_vector)
  WHERE is_public = true;

-- Create partial index for public workflows with embeddings
-- Optimizes the common case of searching public, embedded workflows
CREATE INDEX IF NOT EXISTS idx_workflow_examples_public_embedded
  ON workflow_examples(embedding_status, search_vector)
  WHERE is_public = true AND embedding_status = 'completed';

-- Create RPC function for full-text search with ranking
-- Uses ts_rank for relevance scoring
CREATE OR REPLACE FUNCTION fulltext_search_workflows(
  query_text TEXT,
  match_count INTEGER DEFAULT 10,
  p_category workflow_category DEFAULT NULL,
  public_only BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category workflow_category,
  techniques TEXT[],
  workflow_json JSONB,
  fts_rank REAL,
  headline TEXT
) AS $$
DECLARE
  query_tsquery tsquery;
BEGIN
  -- Convert query text to tsquery with prefix matching
  -- Use plainto_tsquery for user-friendly query parsing
  query_tsquery := plainto_tsquery('english', query_text);

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.description,
    w.category,
    w.techniques,
    w.workflow_json,
    ts_rank(w.search_vector, query_tsquery) AS fts_rank,
    ts_headline(
      'english',
      COALESCE(w.description, w.name),
      query_tsquery,
      'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>'
    ) AS headline
  FROM workflow_examples w
  WHERE
    w.search_vector @@ query_tsquery
    AND (p_category IS NULL OR w.category = p_category)
    AND (NOT public_only OR w.is_public = true)
  ORDER BY fts_rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create hybrid search function combining vector similarity + full-text
-- Uses both semantic and keyword matching with weighted scoring
CREATE OR REPLACE FUNCTION hybrid_search_workflows(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 10,
  semantic_weight REAL DEFAULT 0.7,
  keyword_weight REAL DEFAULT 0.3,
  p_category workflow_category DEFAULT NULL,
  min_combined_score REAL DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category workflow_category,
  techniques TEXT[],
  workflow_json JSONB,
  semantic_score REAL,
  keyword_score REAL,
  combined_score REAL
) AS $$
DECLARE
  query_tsquery tsquery;
BEGIN
  -- Parse query for full-text search
  query_tsquery := plainto_tsquery('english', query_text);

  RETURN QUERY
  WITH semantic_results AS (
    -- Vector similarity search (cosine similarity)
    SELECT
      w.id,
      w.name,
      w.description,
      w.category,
      w.techniques,
      w.workflow_json,
      1 - (w.embedding <=> query_embedding) AS similarity
    FROM workflow_examples w
    WHERE
      w.embedding IS NOT NULL
      AND (p_category IS NULL OR w.category = p_category)
      AND w.is_public = true
      AND w.embedding_status = 'completed'
    ORDER BY w.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    -- Full-text search with ranking
    SELECT
      w.id,
      w.name,
      w.description,
      w.category,
      w.techniques,
      w.workflow_json,
      ts_rank(w.search_vector, query_tsquery) AS rank
    FROM workflow_examples w
    WHERE
      w.search_vector @@ query_tsquery
      AND (p_category IS NULL OR w.category = p_category)
      AND w.is_public = true
    ORDER BY rank DESC
    LIMIT match_count * 2
  ),
  combined AS (
    -- Combine and normalize scores
    SELECT
      COALESCE(sr.id, kr.id) AS id,
      COALESCE(sr.name, kr.name) AS name,
      COALESCE(sr.description, kr.description) AS description,
      COALESCE(sr.category, kr.category) AS category,
      COALESCE(sr.techniques, kr.techniques) AS techniques,
      COALESCE(sr.workflow_json, kr.workflow_json) AS workflow_json,
      COALESCE(sr.similarity, 0.0) AS semantic_score,
      COALESCE(kr.rank, 0.0) AS keyword_score,
      (semantic_weight * COALESCE(sr.similarity, 0.0) +
       keyword_weight * COALESCE(kr.rank, 0.0)) AS combined_score
    FROM semantic_results sr
    FULL OUTER JOIN keyword_results kr ON sr.id = kr.id
  )
  SELECT
    c.id,
    c.name,
    c.description,
    c.category,
    c.techniques,
    c.workflow_json,
    c.semantic_score::REAL,
    c.keyword_score::REAL,
    c.combined_score::REAL
  FROM combined c
  WHERE c.combined_score >= min_combined_score
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function for query autocompletion using FTS
CREATE OR REPLACE FUNCTION autocomplete_workflows(
  prefix TEXT,
  max_suggestions INTEGER DEFAULT 5
)
RETURNS TABLE (
  suggestion TEXT,
  category workflow_category,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.name AS suggestion,
    w.category,
    COUNT(*) AS count
  FROM workflow_examples w
  WHERE
    w.name ILIKE prefix || '%'
    AND w.is_public = true
  GROUP BY w.name, w.category
  ORDER BY count DESC, w.name
  LIMIT max_suggestions;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fulltext_search_workflows TO authenticated, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_workflows TO authenticated, anon;
GRANT EXECUTE ON FUNCTION autocomplete_workflows TO authenticated, anon;

-- Comments
COMMENT ON INDEX idx_workflow_examples_search_vector IS 'GIN index for fast full-text search on workflows';
COMMENT ON INDEX idx_workflow_node_chunks_search_vector IS 'GIN index for node-level full-text search';
COMMENT ON FUNCTION fulltext_search_workflows IS 'Full-text search with ts_rank scoring and highlighting';
COMMENT ON FUNCTION hybrid_search_workflows IS 'Hybrid search combining vector similarity and full-text ranking';
COMMENT ON FUNCTION autocomplete_workflows IS 'Query autocompletion based on workflow names';
