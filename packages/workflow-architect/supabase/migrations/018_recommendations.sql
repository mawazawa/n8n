-- Migration: Create recommendation system tables
-- Implements user preferences, interactions, workflow features, feedback, and A/B experiments

-- Create enums for recommendations
CREATE TYPE recommendation_type AS ENUM (
  'similar',
  'complementary',
  'trending',
  'personalized'
);

CREATE TYPE feedback_type AS ENUM (
  'click',
  'save',
  'use',
  'dismiss',
  'rate',
  'view',
  'time_spent'
);

CREATE TYPE complexity_level AS ENUM (
  'beginner',
  'intermediate',
  'advanced',
  'expert'
);

CREATE TYPE experiment_status AS ENUM (
  'draft',
  'active',
  'paused',
  'completed'
);

-- User preferences table
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Preference data
  categories TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  complexity complexity_level DEFAULT 'intermediate',
  explicit_preferences JSONB DEFAULT '{}',
  implicit_preferences JSONB DEFAULT '{}',

  -- Segmentation
  segmentations TEXT[] DEFAULT '{}',
  cohort TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- User interactions table
CREATE TABLE user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workflow_id UUID NOT NULL,

  -- Interaction details
  type feedback_type NOT NULL,
  value DECIMAL(10, 4),
  duration_ms INTEGER,

  -- Context
  context JSONB DEFAULT '{}',
  session_id TEXT,
  device_type TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for performance
  INDEX idx_user_interactions_user_id (user_id),
  INDEX idx_user_interactions_workflow_id (workflow_id),
  INDEX idx_user_interactions_type (type),
  INDEX idx_user_interactions_created_at (created_at DESC)
);

-- Workflow features table (for content-based filtering)
CREATE TABLE workflow_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL UNIQUE,

  -- Feature data
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  complexity complexity_level DEFAULT 'intermediate',
  node_types TEXT[] DEFAULT '{}',
  node_count INTEGER DEFAULT 0,
  connection_count INTEGER DEFAULT 0,

  -- Text features (TF-IDF vectors stored as JSONB)
  text_features JSONB DEFAULT '{}',

  -- Embedding for similarity search (optional)
  embedding vector(1536),

  -- Metrics
  popularity INTEGER DEFAULT 0,
  rating DECIMAL(3, 2) DEFAULT 0,

  -- Timestamps
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_workflow_features_category (category),
  INDEX idx_workflow_features_complexity (complexity),
  INDEX idx_workflow_features_popularity (popularity DESC)
);

-- Recommendation feedback table
CREATE TABLE recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recommendation_id TEXT NOT NULL,
  workflow_id UUID NOT NULL,

  -- Feedback details
  type feedback_type NOT NULL,
  value DECIMAL(10, 4),

  -- Context
  context JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_recommendation_feedback_user_id (user_id),
  INDEX idx_recommendation_feedback_workflow_id (workflow_id),
  INDEX idx_recommendation_feedback_type (type),
  INDEX idx_recommendation_feedback_created_at (created_at DESC)
);

-- A/B experiments table
CREATE TABLE ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Experiment metadata
  name TEXT NOT NULL,
  description TEXT,
  status experiment_status DEFAULT 'draft',

  -- Configuration
  target_metric TEXT NOT NULL,
  sample_size INTEGER NOT NULL,

  -- Timestamps
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_ab_experiments_status (status),
  INDEX idx_ab_experiments_start_date (start_date)
);

-- A/B experiment variants table
CREATE TABLE ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES ab_experiments(id) ON DELETE CASCADE NOT NULL,

  -- Variant details
  name TEXT NOT NULL,
  description TEXT,
  config JSONB DEFAULT '{}',
  weight DECIMAL(5, 4) NOT NULL DEFAULT 0.5,

  -- Metrics
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT weight_range CHECK (weight >= 0 AND weight <= 1),

  -- Indexes
  INDEX idx_ab_variants_experiment_id (experiment_id)
);

-- A/B experiment assignments table
CREATE TABLE ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  experiment_id UUID REFERENCES ab_experiments(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES ab_variants(id) ON DELETE CASCADE NOT NULL,

  -- Timestamps
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, experiment_id),

  -- Indexes
  INDEX idx_ab_assignments_user_id (user_id),
  INDEX idx_ab_assignments_experiment_id (experiment_id)
);

-- A/B experiment metrics table
CREATE TABLE ab_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES ab_experiments(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES ab_variants(id) ON DELETE CASCADE NOT NULL,

  -- Metric data
  metric TEXT NOT NULL,
  value DECIMAL(10, 4) NOT NULL,
  count INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_ab_metrics_experiment_id (experiment_id),
  INDEX idx_ab_metrics_variant_id (variant_id),
  INDEX idx_ab_metrics_metric (metric)
);

-- Trending workflows cache table
CREATE TABLE trending_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,

  -- Trending metrics
  trending_score DECIMAL(10, 4) NOT NULL,
  velocity DECIMAL(10, 4) NOT NULL,
  recent_views INTEGER DEFAULT 0,
  recent_uses INTEGER DEFAULT 0,
  growth_rate DECIMAL(10, 4) DEFAULT 1.0,

  -- Category for trending by category
  category TEXT,

  -- Time window
  window_hours INTEGER DEFAULT 24,

  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),

  -- Indexes
  INDEX idx_trending_workflows_category (category),
  INDEX idx_trending_workflows_trending_score (trending_score DESC),
  INDEX idx_trending_workflows_expires_at (expires_at)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_features_updated_at
  BEFORE UPDATE ON workflow_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ab_experiments_updated_at
  BEFORE UPDATE ON ab_experiments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) Policies

-- Enable RLS on all tables
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_workflows ENABLE ROW LEVEL SECURITY;

-- User preferences policies
CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User interactions policies
CREATE POLICY "Users can view their own interactions"
  ON user_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions"
  ON user_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Workflow features policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view workflow features"
  ON workflow_features FOR SELECT
  USING (auth.role() = 'authenticated');

-- Recommendation feedback policies
CREATE POLICY "Users can view their own feedback"
  ON recommendation_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback"
  ON recommendation_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- A/B experiments policies (admin only for modifications)
CREATE POLICY "Authenticated users can view experiments"
  ON ab_experiments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage experiments"
  ON ab_experiments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- A/B variants policies
CREATE POLICY "Authenticated users can view variants"
  ON ab_variants FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage variants"
  ON ab_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- A/B assignments policies
CREATE POLICY "Users can view their own assignments"
  ON ab_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert assignments"
  ON ab_assignments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- A/B metrics policies
CREATE POLICY "Authenticated users can view metrics"
  ON ab_metrics FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert metrics"
  ON ab_metrics FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Trending workflows policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view trending workflows"
  ON trending_workflows FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create helper functions

-- Function to get user similarity (for collaborative filtering)
CREATE OR REPLACE FUNCTION get_similar_users(
  target_user_id UUID,
  similarity_threshold DECIMAL DEFAULT 0.1,
  max_users INTEGER DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  similarity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH user_workflows AS (
    SELECT DISTINCT workflow_id
    FROM user_interactions
    WHERE user_id = target_user_id
      AND type IN ('use', 'save', 'click')
  ),
  other_user_workflows AS (
    SELECT
      ui.user_id,
      COUNT(DISTINCT CASE WHEN uw.workflow_id IS NOT NULL THEN ui.workflow_id END) as common_count,
      COUNT(DISTINCT ui.workflow_id) as total_count
    FROM user_interactions ui
    LEFT JOIN user_workflows uw ON ui.workflow_id = uw.workflow_id
    WHERE ui.user_id != target_user_id
      AND ui.type IN ('use', 'save', 'click')
    GROUP BY ui.user_id
  )
  SELECT
    ouw.user_id,
    (ouw.common_count::DECIMAL / GREATEST(ouw.total_count, 1))::DECIMAL as similarity
  FROM other_user_workflows ouw
  WHERE (ouw.common_count::DECIMAL / GREATEST(ouw.total_count, 1)) >= similarity_threshold
  ORDER BY similarity DESC
  LIMIT max_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate trending score
CREATE OR REPLACE FUNCTION calculate_trending_score(
  views INTEGER,
  uses INTEGER,
  hours_old DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  score DECIMAL;
  gravity DECIMAL := 1.8;
BEGIN
  score := (views + uses * 2)::DECIMAL / POWER((hours_old + 2), gravity);
  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to clean expired trending cache
CREATE OR REPLACE FUNCTION clean_expired_trending_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM trending_workflows
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for vector similarity search (if using pgvector)
CREATE INDEX IF NOT EXISTS workflow_features_embedding_idx
  ON workflow_features
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Comments for documentation
COMMENT ON TABLE user_preferences IS 'Stores user preferences for personalized recommendations';
COMMENT ON TABLE user_interactions IS 'Tracks all user interactions with workflows for recommendation learning';
COMMENT ON TABLE workflow_features IS 'Stores extracted features from workflows for content-based filtering';
COMMENT ON TABLE recommendation_feedback IS 'Captures feedback on recommendations for model improvement';
COMMENT ON TABLE ab_experiments IS 'Manages A/B experiments for recommendation strategies';
COMMENT ON TABLE ab_variants IS 'Defines variants for A/B experiments';
COMMENT ON TABLE ab_assignments IS 'Tracks user assignments to experiment variants';
COMMENT ON TABLE ab_metrics IS 'Stores metrics for A/B experiment analysis';
COMMENT ON TABLE trending_workflows IS 'Caches trending workflow calculations for performance';
