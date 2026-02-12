-- Migration: Embedding versioning for model updates
-- Tracks embedding versions to support model upgrades and A/B testing
-- Enables seamless migration when updating embedding models

-- Create table to track embedding model versions
CREATE TABLE IF NOT EXISTS public.embedding_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  is_active BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  cost_per_1k_tokens NUMERIC(10, 6),
  max_tokens INTEGER,
  performance_score NUMERIC(5, 2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,

  -- Unique constraint on model name and version
  UNIQUE (model_name, model_version)
);

-- Create index for active model queries
CREATE INDEX idx_embedding_models_active ON public.embedding_models(is_active)
  WHERE is_active = true;

-- Insert current model version
INSERT INTO public.embedding_models (
  model_name,
  model_version,
  dimensions,
  provider,
  is_active,
  cost_per_1k_tokens,
  max_tokens,
  performance_score,
  notes
) VALUES (
  'text-embedding-3-small',
  'v1',
  1536,
  'openai',
  true,
  0.00002,
  8191,
  95.0,
  'Fast and cost-effective embedding model. Default for all new workflows.'
) ON CONFLICT (model_name, model_version) DO UPDATE
  SET is_active = EXCLUDED.is_active;

-- Table to track embedding version history
CREATE TABLE IF NOT EXISTS public.embedding_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_examples(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.embedding_models(id),
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  embedding_vector vector(1536), -- Store old embedding for comparison
  created_at TIMESTAMPTZ DEFAULT NOW(),
  quality_score NUMERIC(5, 2),
  migration_notes TEXT,

  -- Index for workflow lookups
  INDEX idx_embedding_version_history_workflow (workflow_id),
  INDEX idx_embedding_version_history_model (model_id),
  INDEX idx_embedding_version_history_created (created_at DESC)
);

-- Add RLS policies
ALTER TABLE public.embedding_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_version_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view embedding models"
  ON public.embedding_models
  FOR SELECT
  USING (true);

CREATE POLICY "Only service role can manage embedding models"
  ON public.embedding_models
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view version history"
  ON public.embedding_version_history
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Only service role can manage version history"
  ON public.embedding_version_history
  FOR INSERT
  USING (auth.role() = 'service_role');

-- Function to get active embedding model
CREATE OR REPLACE FUNCTION get_active_embedding_model()
RETURNS TABLE (
  id UUID,
  model_name TEXT,
  model_version TEXT,
  dimensions INTEGER,
  provider TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.model_name,
    e.model_version,
    e.dimensions,
    e.provider
  FROM public.embedding_models e
  WHERE e.is_active = true
    AND e.is_deprecated = false
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive old embedding before update
CREATE OR REPLACE FUNCTION archive_embedding_version(
  p_workflow_id UUID,
  p_model_id UUID,
  p_quality_score NUMERIC DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_workflow RECORD;
  v_model RECORD;
  v_history_id UUID;
BEGIN
  -- Get current workflow embedding
  SELECT embedding, embedding_model, embedding_version
  INTO v_workflow
  FROM public.workflow_examples
  WHERE id = p_workflow_id;

  -- Get model info
  SELECT model_name, model_version
  INTO v_model
  FROM public.embedding_models
  WHERE id = p_model_id;

  -- Archive the current embedding
  INSERT INTO public.embedding_version_history (
    workflow_id,
    model_id,
    model_name,
    model_version,
    embedding_vector,
    quality_score
  ) VALUES (
    p_workflow_id,
    p_model_id,
    COALESCE(v_workflow.embedding_model, v_model.model_name),
    COALESCE(v_workflow.embedding_version, v_model.model_version),
    v_workflow.embedding,
    p_quality_score
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to migrate workflows to new embedding version
CREATE OR REPLACE FUNCTION migrate_to_new_embedding_version(
  p_new_model_id UUID,
  p_batch_size INTEGER DEFAULT 10,
  p_status_filter TEXT DEFAULT 'completed'
)
RETURNS TABLE (
  workflow_id UUID,
  old_version TEXT,
  new_version TEXT,
  status TEXT
) AS $$
DECLARE
  v_model RECORD;
BEGIN
  -- Get new model info
  SELECT model_name, model_version
  INTO v_model
  FROM public.embedding_models
  WHERE id = p_new_model_id;

  IF v_model IS NULL THEN
    RAISE EXCEPTION 'Model not found: %', p_new_model_id;
  END IF;

  -- Archive old embeddings and mark for re-embedding
  RETURN QUERY
  WITH workflows_to_migrate AS (
    SELECT
      w.id,
      w.embedding_model,
      w.embedding_version
    FROM public.workflow_examples w
    WHERE w.embedding_status = p_status_filter::embedding_status_enum
      AND (
        w.embedding_version IS NULL OR
        w.embedding_version != v_model.model_version
      )
    LIMIT p_batch_size
  ),
  archived AS (
    SELECT
      w.id,
      archive_embedding_version(w.id, p_new_model_id) as history_id
    FROM workflows_to_migrate w
  )
  UPDATE public.workflow_examples we
  SET
    embedding_status = 'pending',
    embedding = NULL,
    embedding_version = v_model.model_version,
    updated_at = NOW()
  FROM workflows_to_migrate wtm
  WHERE we.id = wtm.id
  RETURNING
    we.id,
    wtm.embedding_version,
    v_model.model_version,
    'migrated'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to compare embedding quality across versions
CREATE OR REPLACE FUNCTION compare_embedding_versions(
  p_workflow_id UUID
)
RETURNS TABLE (
  version TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ,
  quality_score NUMERIC,
  is_current BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  -- Get current version
  SELECT
    w.embedding_version as version,
    w.embedding_model as model_name,
    w.embedding_completed_at as created_at,
    NULL::NUMERIC as quality_score,
    true as is_current
  FROM public.workflow_examples w
  WHERE w.id = p_workflow_id
    AND w.embedding_status = 'completed'

  UNION ALL

  -- Get historical versions
  SELECT
    h.model_version as version,
    h.model_name as model_name,
    h.created_at as created_at,
    h.quality_score as quality_score,
    false as is_current
  FROM public.embedding_version_history h
  WHERE h.workflow_id = p_workflow_id
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rollback to previous embedding version
CREATE OR REPLACE FUNCTION rollback_embedding_version(
  p_workflow_id UUID,
  p_history_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_history RECORD;
BEGIN
  -- Get historical embedding
  SELECT
    embedding_vector,
    model_name,
    model_version
  INTO v_history
  FROM public.embedding_version_history
  WHERE id = p_history_id
    AND workflow_id = p_workflow_id;

  IF v_history IS NULL THEN
    RAISE EXCEPTION 'Version history not found';
  END IF;

  -- Archive current embedding first
  PERFORM archive_embedding_version(p_workflow_id, (
    SELECT id FROM public.embedding_models
    WHERE model_name = v_history.model_name
      AND model_version = v_history.model_version
    LIMIT 1
  ));

  -- Restore historical embedding
  UPDATE public.workflow_examples
  SET
    embedding = v_history.embedding_vector,
    embedding_model = v_history.model_name,
    embedding_version = v_history.model_version,
    embedding_status = 'completed',
    updated_at = NOW()
  WHERE id = p_workflow_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get embedding version statistics
CREATE OR REPLACE FUNCTION get_embedding_version_stats()
RETURNS TABLE (
  model_version TEXT,
  workflow_count BIGINT,
  avg_quality_score NUMERIC,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(w.embedding_version, 'unknown') as model_version,
    COUNT(*) as workflow_count,
    AVG(
      SELECT quality_score
      FROM public.embedding_version_history h
      WHERE h.workflow_id = w.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) as avg_quality_score,
    MAX(w.embedding_completed_at) as last_updated
  FROM public.workflow_examples w
  WHERE w.embedding_status = 'completed'
  GROUP BY w.embedding_version
  ORDER BY workflow_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule model deprecation
CREATE OR REPLACE FUNCTION deprecate_embedding_model(
  p_model_id UUID,
  p_replacement_model_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mark old model as deprecated
  UPDATE public.embedding_models
  SET
    is_deprecated = true,
    is_active = false,
    deprecated_at = NOW(),
    notes = COALESCE(notes, '') || ' Deprecated in favor of model: ' || p_replacement_model_id
  WHERE id = p_model_id;

  -- Activate replacement model
  UPDATE public.embedding_models
  SET is_active = true
  WHERE id = p_replacement_model_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View for embedding version overview
CREATE OR REPLACE VIEW embedding_version_overview AS
SELECT
  m.model_name,
  m.model_version,
  m.is_active,
  m.is_deprecated,
  COUNT(w.id) as workflow_count,
  COUNT(w.id) FILTER (WHERE w.embedding_status = 'completed') as completed_count,
  COUNT(w.id) FILTER (WHERE w.embedding_status = 'pending') as pending_count,
  COUNT(w.id) FILTER (WHERE w.embedding_status = 'failed') as failed_count,
  m.cost_per_1k_tokens,
  m.created_at
FROM public.embedding_models m
LEFT JOIN public.workflow_examples w ON w.embedding_version = m.model_version
GROUP BY m.id, m.model_name, m.model_version, m.is_active, m.is_deprecated, m.cost_per_1k_tokens, m.created_at
ORDER BY m.created_at DESC;

-- Grant permissions
GRANT SELECT ON embedding_version_overview TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_embedding_model TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION archive_embedding_version TO service_role;
GRANT EXECUTE ON FUNCTION migrate_to_new_embedding_version TO service_role;
GRANT EXECUTE ON FUNCTION compare_embedding_versions TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_embedding_version TO service_role;
GRANT EXECUTE ON FUNCTION get_embedding_version_stats TO authenticated;
GRANT EXECUTE ON FUNCTION deprecate_embedding_model TO service_role;

-- Comments
COMMENT ON TABLE embedding_models IS 'Registry of embedding models with versioning support';
COMMENT ON TABLE embedding_version_history IS 'Historical embedding versions for rollback and comparison';
COMMENT ON FUNCTION get_active_embedding_model IS 'Get currently active embedding model';
COMMENT ON FUNCTION archive_embedding_version IS 'Archive embedding before migrating to new version';
COMMENT ON FUNCTION migrate_to_new_embedding_version IS 'Migrate workflows to new embedding model version';
COMMENT ON FUNCTION compare_embedding_versions IS 'Compare embedding quality across versions';
COMMENT ON FUNCTION rollback_embedding_version IS 'Rollback to previous embedding version';
COMMENT ON FUNCTION get_embedding_version_stats IS 'Get statistics about embedding versions';
COMMENT ON FUNCTION deprecate_embedding_model IS 'Mark model as deprecated and activate replacement';
COMMENT ON VIEW embedding_version_overview IS 'Overview of embedding versions and their usage';
