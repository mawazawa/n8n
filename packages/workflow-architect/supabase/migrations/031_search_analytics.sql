-- Migration: Search Analytics Tracking
-- Tracks search queries, clicks, and performance metrics for continuous improvement
-- Enables analysis of search quality, user behavior, and A/B test results

-- Create table for search query logs
CREATE TABLE IF NOT EXISTS search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Query metadata
  query_text TEXT NOT NULL,
  query_hash TEXT GENERATED ALWAYS AS (md5(query_text)) STORED,
  search_type TEXT NOT NULL DEFAULT 'hybrid', -- hybrid, vector, fulltext
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,

  -- Filter parameters
  category workflow_category,
  techniques TEXT[],
  min_score REAL,

  -- Search configuration
  semantic_weight REAL DEFAULT 0.7,
  keyword_weight REAL DEFAULT 0.3,
  use_reranking BOOLEAN DEFAULT false,
  reranker_model TEXT,

  -- Results metadata
  result_count INTEGER NOT NULL,
  total_candidates INTEGER, -- Before filtering
  results_returned INTEGER, -- After limit
  top_result_id UUID REFERENCES workflow_examples(id) ON DELETE SET NULL,

  -- Performance metrics
  latency_ms INTEGER NOT NULL,
  embedding_latency_ms INTEGER,
  search_latency_ms INTEGER,
  rerank_latency_ms INTEGER,

  -- A/B testing
  experiment_id TEXT,
  variant_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- IP and user agent for analysis
  ip_address INET,
  user_agent TEXT
);

-- Create table for click-through tracking
CREATE TABLE IF NOT EXISTS search_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to search query
  query_id UUID NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflow_examples(id) ON DELETE CASCADE,

  -- Click metadata
  result_position INTEGER NOT NULL, -- Position in search results (0-based)
  result_score REAL, -- Relevance score at click time

  -- Engagement metrics
  time_to_click_ms INTEGER, -- Time from search to click
  viewed_workflow BOOLEAN DEFAULT true,
  copied_workflow BOOLEAN DEFAULT false,
  modified_workflow BOOLEAN DEFAULT false,

  -- Session context
  session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for search performance aggregations (hourly rollups)
CREATE TABLE IF NOT EXISTS search_analytics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time bucket
  hour_bucket TIMESTAMPTZ NOT NULL,

  -- Search metrics
  total_searches INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL,
  p95_latency_ms REAL,
  p99_latency_ms REAL,

  -- Result quality metrics
  avg_result_count REAL,
  zero_result_searches INTEGER DEFAULT 0,
  avg_click_position REAL, -- Lower is better

  -- Click-through metrics
  total_clicks INTEGER DEFAULT 0,
  click_through_rate REAL, -- clicks / searches
  avg_time_to_click_ms REAL,

  -- Top queries
  top_queries JSONB, -- [{query: string, count: number}]

  -- Search types
  hybrid_searches INTEGER DEFAULT 0,
  vector_searches INTEGER DEFAULT 0,
  fulltext_searches INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(hour_bucket)
);

-- Indexes for efficient querying
CREATE INDEX idx_search_queries_created_at ON search_queries(created_at DESC);
CREATE INDEX idx_search_queries_user_id ON search_queries(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_search_queries_session_id ON search_queries(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_search_queries_query_hash ON search_queries(query_hash);
CREATE INDEX idx_search_queries_experiment ON search_queries(experiment_id, variant_id)
  WHERE experiment_id IS NOT NULL;

CREATE INDEX idx_search_clicks_query_id ON search_clicks(query_id);
CREATE INDEX idx_search_clicks_workflow_id ON search_clicks(workflow_id);
CREATE INDEX idx_search_clicks_created_at ON search_clicks(created_at DESC);
CREATE INDEX idx_search_clicks_user_id ON search_clicks(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_search_analytics_hourly_bucket ON search_analytics_hourly(hour_bucket DESC);

-- Function to log search query
CREATE OR REPLACE FUNCTION log_search_query(
  p_query_text TEXT,
  p_search_type TEXT,
  p_user_id UUID,
  p_session_id TEXT,
  p_result_count INTEGER,
  p_latency_ms INTEGER,
  p_category workflow_category DEFAULT NULL,
  p_experiment_id TEXT DEFAULT NULL,
  p_variant_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_query_id UUID;
BEGIN
  INSERT INTO search_queries (
    query_text,
    search_type,
    user_id,
    session_id,
    category,
    result_count,
    results_returned,
    latency_ms,
    experiment_id,
    variant_id
  ) VALUES (
    p_query_text,
    p_search_type,
    p_user_id,
    p_session_id,
    p_category,
    p_result_count,
    p_result_count,
    p_latency_ms,
    p_experiment_id,
    p_variant_id
  )
  RETURNING id INTO v_query_id;

  RETURN v_query_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log click-through
CREATE OR REPLACE FUNCTION log_search_click(
  p_query_id UUID,
  p_workflow_id UUID,
  p_result_position INTEGER,
  p_result_score REAL DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_click_id UUID;
BEGIN
  INSERT INTO search_clicks (
    query_id,
    workflow_id,
    result_position,
    result_score,
    session_id,
    user_id
  ) VALUES (
    p_query_id,
    p_workflow_id,
    p_result_position,
    p_result_score,
    p_session_id,
    p_user_id
  )
  RETURNING id INTO v_click_id;

  RETURN v_click_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate Mean Reciprocal Rank (MRR)
-- Measures how well the search ranks relevant results
CREATE OR REPLACE FUNCTION calculate_mrr(
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
) RETURNS REAL AS $$
DECLARE
  v_mrr REAL;
BEGIN
  SELECT AVG(1.0 / (c.result_position + 1))
  INTO v_mrr
  FROM search_clicks c
  JOIN search_queries q ON c.query_id = q.id
  WHERE q.created_at BETWEEN start_time AND end_time;

  RETURN COALESCE(v_mrr, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get search analytics summary
CREATE OR REPLACE FUNCTION get_search_analytics(
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
) RETURNS TABLE (
  total_searches BIGINT,
  unique_users BIGINT,
  avg_latency_ms NUMERIC,
  total_clicks BIGINT,
  click_through_rate NUMERIC,
  mrr NUMERIC,
  zero_result_rate NUMERIC,
  top_queries JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH search_stats AS (
    SELECT
      COUNT(*) AS searches,
      COUNT(DISTINCT user_id) AS users,
      AVG(latency_ms) AS avg_lat,
      COUNT(*) FILTER (WHERE result_count = 0) AS zero_results
    FROM search_queries
    WHERE created_at BETWEEN start_time AND end_time
  ),
  click_stats AS (
    SELECT COUNT(*) AS clicks
    FROM search_clicks c
    JOIN search_queries q ON c.query_id = q.id
    WHERE q.created_at BETWEEN start_time AND end_time
  ),
  top_q AS (
    SELECT jsonb_agg(
      jsonb_build_object('query', query_text, 'count', cnt)
      ORDER BY cnt DESC
    ) AS queries
    FROM (
      SELECT query_text, COUNT(*) AS cnt
      FROM search_queries
      WHERE created_at BETWEEN start_time AND end_time
      GROUP BY query_text
      ORDER BY cnt DESC
      LIMIT 10
    ) sub
  )
  SELECT
    ss.searches,
    ss.users,
    ROUND(ss.avg_lat::NUMERIC, 2),
    cs.clicks,
    ROUND((cs.clicks::NUMERIC / NULLIF(ss.searches, 0))::NUMERIC, 4),
    ROUND(calculate_mrr(start_time, end_time)::NUMERIC, 4),
    ROUND((ss.zero_results::NUMERIC / NULLIF(ss.searches, 0))::NUMERIC, 4),
    tq.queries
  FROM search_stats ss
  CROSS JOIN click_stats cs
  CROSS JOIN top_q tq;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate hourly analytics (run via cron)
CREATE OR REPLACE FUNCTION aggregate_hourly_analytics(
  p_hour_bucket TIMESTAMPTZ
) RETURNS VOID AS $$
DECLARE
  v_end_time TIMESTAMPTZ;
BEGIN
  v_end_time := p_hour_bucket + INTERVAL '1 hour';

  INSERT INTO search_analytics_hourly (
    hour_bucket,
    total_searches,
    unique_users,
    avg_latency_ms,
    avg_result_count,
    zero_result_searches,
    total_clicks,
    click_through_rate,
    hybrid_searches,
    vector_searches,
    fulltext_searches
  )
  SELECT
    p_hour_bucket,
    COUNT(*),
    COUNT(DISTINCT user_id),
    AVG(latency_ms),
    AVG(result_count),
    COUNT(*) FILTER (WHERE result_count = 0),
    (SELECT COUNT(*) FROM search_clicks c WHERE c.query_id IN (
      SELECT id FROM search_queries WHERE created_at >= p_hour_bucket AND created_at < v_end_time
    )),
    (SELECT COUNT(*) FROM search_clicks c WHERE c.query_id IN (
      SELECT id FROM search_queries WHERE created_at >= p_hour_bucket AND created_at < v_end_time
    ))::REAL / NULLIF(COUNT(*), 0),
    COUNT(*) FILTER (WHERE search_type = 'hybrid'),
    COUNT(*) FILTER (WHERE search_type = 'vector'),
    COUNT(*) FILTER (WHERE search_type = 'fulltext')
  FROM search_queries
  WHERE created_at >= p_hour_bucket AND created_at < v_end_time
  ON CONFLICT (hour_bucket) DO UPDATE SET
    total_searches = EXCLUDED.total_searches,
    unique_users = EXCLUDED.unique_users,
    avg_latency_ms = EXCLUDED.avg_latency_ms;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT ON search_queries TO authenticated, anon;
GRANT SELECT, INSERT ON search_clicks TO authenticated, anon;
GRANT SELECT ON search_analytics_hourly TO authenticated, anon;
GRANT EXECUTE ON FUNCTION log_search_query TO authenticated, anon;
GRANT EXECUTE ON FUNCTION log_search_click TO authenticated, anon;
GRANT EXECUTE ON FUNCTION calculate_mrr TO authenticated;
GRANT EXECUTE ON FUNCTION get_search_analytics TO authenticated;

-- Comments
COMMENT ON TABLE search_queries IS 'Logs all search queries with performance metrics';
COMMENT ON TABLE search_clicks IS 'Tracks click-through events for search result analysis';
COMMENT ON TABLE search_analytics_hourly IS 'Hourly aggregated search analytics for dashboards';
COMMENT ON FUNCTION calculate_mrr IS 'Calculate Mean Reciprocal Rank for search quality';
COMMENT ON FUNCTION get_search_analytics IS 'Get comprehensive search analytics for a time period';
