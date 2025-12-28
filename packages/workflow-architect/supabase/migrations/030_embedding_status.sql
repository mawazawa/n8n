-- Migration: Enhanced embedding status tracking
-- Adds comprehensive status tracking, retry counters, and metadata
-- Ensures workflow_examples table has all necessary columns for embedding pipeline

-- Create enum type for embedding status (if not exists)
DO $$ BEGIN
  CREATE TYPE embedding_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ensure workflow_examples table exists and add/update columns
ALTER TABLE public.workflow_examples
  -- Add embedding status column (if not exists)
  ADD COLUMN IF NOT EXISTS embedding_status embedding_status_enum DEFAULT 'pending',

  -- Add embedding model tracking
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,

  -- Add retry tracking
  ADD COLUMN IF NOT EXISTS embedding_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_last_retry_at TIMESTAMPTZ,

  -- Add error tracking
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding_error_code TEXT,

  -- Add timing metadata
  ADD COLUMN IF NOT EXISTS embedding_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_duration_ms INTEGER,

  -- Add versioning
  ADD COLUMN IF NOT EXISTS embedding_version TEXT;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_workflow_examples_embedding_status
  ON public.workflow_examples(embedding_status);

-- Create index for retry queries
CREATE INDEX IF NOT EXISTS idx_workflow_examples_embedding_retry
  ON public.workflow_examples(embedding_retry_count, embedding_status)
  WHERE embedding_status = 'failed';

-- Create index for pending processing
CREATE INDEX IF NOT EXISTS idx_workflow_examples_pending_embeddings
  ON public.workflow_examples(created_at)
  WHERE embedding_status = 'pending';

-- Function to update embedding status with metadata
CREATE OR REPLACE FUNCTION update_embedding_status(
  p_workflow_id UUID,
  p_status embedding_status_enum,
  p_error TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_version TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  started_at TIMESTAMPTZ;
BEGIN
  -- Get started_at time if transitioning to processing
  IF p_status = 'processing' THEN
    started_at := NOW();
  END IF;

  UPDATE public.workflow_examples
  SET
    embedding_status = p_status,
    embedding_error = p_error,
    embedding_error_code = p_error_code,
    embedding_model = COALESCE(p_model, embedding_model),
    embedding_version = COALESCE(p_version, embedding_version),
    embedding_started_at = COALESCE(started_at, embedding_started_at),
    embedding_completed_at = CASE
      WHEN p_status IN ('completed', 'failed') THEN NOW()
      ELSE embedding_completed_at
    END,
    embedding_duration_ms = CASE
      WHEN p_status IN ('completed', 'failed') AND embedding_started_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (NOW() - embedding_started_at)) * 1000
      ELSE embedding_duration_ms
    END,
    embedding_last_retry_at = CASE
      WHEN p_status = 'processing' AND embedding_retry_count > 0 THEN NOW()
      ELSE embedding_last_retry_at
    END,
    updated_at = NOW()
  WHERE id = p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment retry counter
CREATE OR REPLACE FUNCTION increment_embedding_retry(
  p_workflow_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.workflow_examples
  SET
    embedding_retry_count = embedding_retry_count + 1,
    embedding_last_retry_at = NOW(),
    updated_at = NOW()
  WHERE id = p_workflow_id
  RETURNING embedding_retry_count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset embedding status for retry
CREATE OR REPLACE FUNCTION reset_embedding_for_retry(
  p_workflow_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.workflow_examples
  SET
    embedding_status = 'pending',
    embedding_error = NULL,
    embedding_error_code = NULL,
    embedding_started_at = NULL,
    embedding_completed_at = NULL,
    embedding_duration_ms = NULL,
    updated_at = NOW()
  WHERE id = p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get embedding queue statistics
CREATE OR REPLACE FUNCTION get_embedding_queue_stats()
RETURNS TABLE (
  status embedding_status_enum,
  count BIGINT,
  avg_retry_count NUMERIC,
  oldest_pending TIMESTAMPTZ,
  newest_pending TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.embedding_status as status,
    COUNT(*) as count,
    ROUND(AVG(e.embedding_retry_count), 2) as avg_retry_count,
    MIN(e.created_at) FILTER (WHERE e.embedding_status = 'pending') as oldest_pending,
    MAX(e.created_at) FILTER (WHERE e.embedding_status = 'pending') as newest_pending
  FROM public.workflow_examples e
  GROUP BY e.embedding_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get workflows with failed embeddings
CREATE OR REPLACE FUNCTION get_failed_embeddings(
  p_limit INTEGER DEFAULT 50,
  p_max_retries INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  retry_count INTEGER,
  error TEXT,
  error_code TEXT,
  last_retry_at TIMESTAMPTZ,
  can_retry BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.embedding_retry_count,
    e.embedding_error,
    e.embedding_error_code,
    e.embedding_last_retry_at,
    (e.embedding_retry_count < p_max_retries) as can_retry
  FROM public.workflow_examples e
  WHERE e.embedding_status = 'failed'
  ORDER BY e.embedding_last_retry_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get embedding performance metrics
CREATE OR REPLACE FUNCTION get_embedding_performance_metrics(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_processed BIGINT,
  total_completed BIGINT,
  total_failed BIGINT,
  success_rate NUMERIC,
  avg_duration_ms NUMERIC,
  median_duration_ms NUMERIC,
  p95_duration_ms NUMERIC,
  avg_retries NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE embedding_status IN ('completed', 'failed')) as total_processed,
    COUNT(*) FILTER (WHERE embedding_status = 'completed') as total_completed,
    COUNT(*) FILTER (WHERE embedding_status = 'failed') as total_failed,
    CASE
      WHEN COUNT(*) FILTER (WHERE embedding_status IN ('completed', 'failed')) > 0 THEN
        ROUND(
          (COUNT(*) FILTER (WHERE embedding_status = 'completed')::NUMERIC /
           COUNT(*) FILTER (WHERE embedding_status IN ('completed', 'failed'))) * 100,
          2
        )
      ELSE 0
    END as success_rate,
    ROUND(AVG(embedding_duration_ms), 2) as avg_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY embedding_duration_ms) as median_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY embedding_duration_ms) as p95_duration_ms,
    ROUND(AVG(embedding_retry_count), 2) as avg_retries
  FROM public.workflow_examples
  WHERE embedding_completed_at > NOW() - (p_hours || ' hours')::INTERVAL
    AND embedding_status IN ('completed', 'failed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old embedding errors (reset for retry after cooldown)
CREATE OR REPLACE FUNCTION cleanup_stale_embedding_failures(
  p_cooldown_hours INTEGER DEFAULT 24,
  p_max_retries INTEGER DEFAULT 3
)
RETURNS TABLE (
  workflow_id UUID,
  retry_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH stale_failures AS (
    SELECT id, embedding_retry_count
    FROM public.workflow_examples
    WHERE embedding_status = 'failed'
      AND embedding_retry_count < p_max_retries
      AND (
        embedding_last_retry_at IS NULL OR
        embedding_last_retry_at < NOW() - (p_cooldown_hours || ' hours')::INTERVAL
      )
  )
  UPDATE public.workflow_examples w
  SET
    embedding_status = 'pending',
    embedding_error = NULL,
    embedding_error_code = NULL,
    updated_at = NOW()
  FROM stale_failures s
  WHERE w.id = s.id
  RETURNING w.id, s.embedding_retry_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View for monitoring embedding queue
CREATE OR REPLACE VIEW embedding_queue_monitor AS
SELECT
  id,
  name,
  embedding_status,
  embedding_model,
  embedding_retry_count,
  embedding_error,
  embedding_started_at,
  embedding_completed_at,
  embedding_duration_ms,
  CASE
    WHEN embedding_status = 'processing' AND embedding_started_at < NOW() - INTERVAL '5 minutes' THEN true
    ELSE false
  END as is_stuck,
  created_at,
  updated_at
FROM public.workflow_examples
WHERE embedding_status IN ('pending', 'processing', 'failed')
ORDER BY
  CASE embedding_status
    WHEN 'processing' THEN 1
    WHEN 'pending' THEN 2
    WHEN 'failed' THEN 3
  END,
  created_at ASC;

-- Grant permissions
GRANT SELECT ON embedding_queue_monitor TO authenticated;
GRANT EXECUTE ON FUNCTION get_embedding_queue_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_failed_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION get_embedding_performance_metrics TO authenticated;

-- Service role functions
GRANT EXECUTE ON FUNCTION update_embedding_status TO service_role;
GRANT EXECUTE ON FUNCTION increment_embedding_retry TO service_role;
GRANT EXECUTE ON FUNCTION reset_embedding_for_retry TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_stale_embedding_failures TO service_role;

-- Comments
COMMENT ON COLUMN workflow_examples.embedding_status IS 'Current status of embedding generation: pending, processing, completed, failed';
COMMENT ON COLUMN workflow_examples.embedding_retry_count IS 'Number of retry attempts for failed embeddings';
COMMENT ON COLUMN workflow_examples.embedding_error IS 'Error message from last failed embedding attempt';
COMMENT ON COLUMN workflow_examples.embedding_duration_ms IS 'Time taken to generate embedding in milliseconds';
COMMENT ON FUNCTION update_embedding_status IS 'Update embedding status with metadata tracking';
COMMENT ON FUNCTION get_embedding_queue_stats IS 'Get statistics about embedding queue';
COMMENT ON FUNCTION get_failed_embeddings IS 'Get list of workflows with failed embeddings';
COMMENT ON FUNCTION get_embedding_performance_metrics IS 'Get performance metrics for embedding generation';
COMMENT ON VIEW embedding_queue_monitor IS 'Real-time view of embedding queue status';
