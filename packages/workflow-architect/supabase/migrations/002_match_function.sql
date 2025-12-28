-- Migration: Create similarity search functions
-- References: https://supabase.com/docs/guides/ai/semantic-search

-- Function to match workflows by semantic similarity
CREATE OR REPLACE FUNCTION match_workflows(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_category workflow_category DEFAULT NULL,
  filter_techniques TEXT[] DEFAULT NULL,
  filter_public BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category workflow_category,
  techniques TEXT[],
  workflow_json JSONB,
  node_count INTEGER,
  node_types TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    we.id,
    we.name,
    we.description,
    we.category,
    we.techniques,
    we.workflow_json,
    we.node_count,
    we.node_types,
    1 - (we.embedding <=> query_embedding) AS similarity
  FROM workflow_examples we
  WHERE
    we.embedding IS NOT NULL
    AND we.embedding_status = 'completed'
    AND 1 - (we.embedding <=> query_embedding) > match_threshold
    AND (filter_public IS NULL OR we.is_public = filter_public)
    AND (filter_category IS NULL OR we.category = filter_category)
    AND (filter_techniques IS NULL OR we.techniques && filter_techniques)
  ORDER BY we.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to match nodes by semantic similarity (fine-grained search)
CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 10,
  filter_node_type TEXT DEFAULT NULL,
  filter_is_trigger BOOLEAN DEFAULT NULL,
  filter_is_ai BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  workflow_id UUID,
  node_id TEXT,
  node_name TEXT,
  node_type TEXT,
  semantic_content TEXT,
  connected_to TEXT[],
  connected_from TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wnc.id,
    wnc.workflow_id,
    wnc.node_id,
    wnc.node_name,
    wnc.node_type,
    wnc.semantic_content,
    wnc.connected_to,
    wnc.connected_from,
    1 - (wnc.embedding <=> query_embedding) AS similarity
  FROM workflow_node_chunks wnc
  WHERE
    wnc.embedding IS NOT NULL
    AND wnc.embedding_status = 'completed'
    AND 1 - (wnc.embedding <=> query_embedding) > match_threshold
    AND (filter_node_type IS NULL OR wnc.node_type ILIKE '%' || filter_node_type || '%')
    AND (filter_is_trigger IS NULL OR wnc.is_trigger = filter_is_trigger)
    AND (filter_is_ai IS NULL OR wnc.is_ai_node = filter_is_ai)
  ORDER BY wnc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function for hybrid search (vector + full-text)
CREATE OR REPLACE FUNCTION hybrid_search_workflows(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 5,
  semantic_weight FLOAT DEFAULT 0.7,
  keyword_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category workflow_category,
  techniques TEXT[],
  workflow_json JSONB,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      we.id,
      1 - (we.embedding <=> query_embedding) AS score
    FROM workflow_examples we
    WHERE we.embedding IS NOT NULL
      AND we.embedding_status = 'completed'
    ORDER BY we.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword_results AS (
    SELECT
      we.id,
      ts_rank(
        to_tsvector('english', we.name || ' ' || COALESCE(we.description, '') || ' ' || array_to_string(we.techniques, ' ')),
        plainto_tsquery('english', query_text)
      ) AS score
    FROM workflow_examples we
    WHERE to_tsvector('english', we.name || ' ' || COALESCE(we.description, '') || ' ' || array_to_string(we.techniques, ' '))
          @@ plainto_tsquery('english', query_text)
    ORDER BY score DESC
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      COALESCE(sr.id, kr.id) AS id,
      COALESCE(sr.score, 0) AS semantic_score,
      COALESCE(kr.score, 0) AS keyword_score,
      (COALESCE(sr.score, 0) * semantic_weight + COALESCE(kr.score, 0) * keyword_weight) AS combined_score
    FROM semantic_results sr
    FULL OUTER JOIN keyword_results kr ON sr.id = kr.id
  )
  SELECT
    we.id,
    we.name,
    we.description,
    we.category,
    we.techniques,
    we.workflow_json,
    c.semantic_score,
    c.keyword_score,
    c.combined_score
  FROM combined c
  JOIN workflow_examples we ON we.id = c.id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Comments
COMMENT ON FUNCTION match_workflows IS 'Find similar workflows using cosine similarity on embeddings';
COMMENT ON FUNCTION match_nodes IS 'Find similar node chunks for fine-grained matching';
COMMENT ON FUNCTION hybrid_search_workflows IS 'Combine semantic and keyword search with RRF-style fusion';
