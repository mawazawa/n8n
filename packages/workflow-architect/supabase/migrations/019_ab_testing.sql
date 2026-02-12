-- =====================================================
-- A/B Testing Database Schema
-- Comprehensive A/B testing system with experiments, variants, metrics, and analysis
-- =====================================================

-- Experiments table
CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED')),
    hypothesis TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    minimum_sample_size INTEGER NOT NULL DEFAULT 100,
    confidence_level NUMERIC(3, 2) NOT NULL DEFAULT 0.95 CHECK (confidence_level > 0 AND confidence_level <= 1),
    minimum_detectable_effect NUMERIC(3, 2) NOT NULL DEFAULT 0.05 CHECK (minimum_detectable_effect > 0 AND minimum_detectable_effect <= 1),
    segment_id UUID,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experiments_workflow_id ON experiments(workflow_id);
CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_segment_id ON experiments(segment_id);
CREATE INDEX idx_experiments_created_at ON experiments(created_at DESC);

-- Variants table
CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    config JSONB NOT NULL,
    traffic_allocation NUMERIC(3, 2) NOT NULL CHECK (traffic_allocation >= 0 AND traffic_allocation <= 1),
    is_control BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(experiment_id, name)
);

CREATE INDEX idx_variants_experiment_id ON variants(experiment_id);
CREATE INDEX idx_variants_enabled ON variants(enabled);

-- Assignments table (user to variant mapping)
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sticky BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB,
    UNIQUE(user_id, experiment_id)
);

CREATE INDEX idx_assignments_user_id ON assignments(user_id);
CREATE INDEX idx_assignments_experiment_id ON assignments(experiment_id);
CREATE INDEX idx_assignments_variant_id ON assignments(variant_id);
CREATE INDEX idx_assignments_assigned_at ON assignments(assigned_at DESC);

-- Experiment metrics configuration
CREATE TABLE IF NOT EXISTS experiment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('continuous', 'proportion', 'count', 'rate')),
    goal TEXT NOT NULL CHECK (goal IN ('maximize', 'minimize')),
    description TEXT,
    unit TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(experiment_id, name)
);

CREATE INDEX idx_experiment_metrics_experiment_id ON experiment_metrics(experiment_id);

-- Metric events table (actual metric data)
CREATE TABLE IF NOT EXISTS metric_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_metric_events_experiment_id ON metric_events(experiment_id);
CREATE INDEX idx_metric_events_variant_id ON metric_events(variant_id);
CREATE INDEX idx_metric_events_user_id ON metric_events(user_id);
CREATE INDEX idx_metric_events_metric_name ON metric_events(metric_name);
CREATE INDEX idx_metric_events_timestamp ON metric_events(timestamp DESC);
CREATE INDEX idx_metric_events_composite ON metric_events(experiment_id, variant_id, metric_name);

-- User segments table
CREATE TABLE IF NOT EXISTS segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    criteria JSONB NOT NULL,
    estimated_size INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segments_name ON segments(name);

-- Rollout configurations
CREATE TABLE IF NOT EXISTS rollout_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL CHECK (strategy IN ('linear', 'exponential', 'custom')),
    start_percentage NUMERIC(5, 2) NOT NULL CHECK (start_percentage >= 0 AND start_percentage <= 100),
    target_percentage NUMERIC(5, 2) NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100),
    duration BIGINT NOT NULL,
    steps JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'completed', 'rolled-back')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rollout_configs_experiment_id ON rollout_configs(experiment_id);
CREATE INDEX idx_rollout_configs_status ON rollout_configs(status);

-- Guardrail rules
CREATE TABLE IF NOT EXISTS guardrail_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    operator TEXT NOT NULL CHECK (operator IN ('lt', 'lte', 'gt', 'gte', 'eq', 'neq')),
    threshold NUMERIC NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('alert', 'pause', 'stop')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE INDEX idx_guardrail_rules_experiment_id ON guardrail_rules(experiment_id);

-- Guardrail alerts
CREATE TABLE IF NOT EXISTS guardrail_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    rule JSONB NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_value NUMERIC NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT
);

CREATE INDEX idx_guardrail_alerts_experiment_id ON guardrail_alerts(experiment_id);
CREATE INDEX idx_guardrail_alerts_triggered_at ON guardrail_alerts(triggered_at DESC);
CREATE INDEX idx_guardrail_alerts_acknowledged ON guardrail_alerts(acknowledged);

-- Auto-optimization configurations
CREATE TABLE IF NOT EXISTS auto_optimization_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    bandit_config JSONB NOT NULL,
    early_stopping_rules JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_optimization_configs_experiment_id ON auto_optimization_configs(experiment_id);
CREATE INDEX idx_auto_optimization_configs_status ON auto_optimization_configs(status);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollout_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrail_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_optimization_configs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all experiments
CREATE POLICY experiments_select ON experiments
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Allow authenticated users to create experiments
CREATE POLICY experiments_insert ON experiments
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update their own experiments
CREATE POLICY experiments_update ON experiments
    FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Allow users to delete their own experiments
CREATE POLICY experiments_delete ON experiments
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Variants policies
CREATE POLICY variants_select ON variants
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY variants_insert ON variants
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY variants_update ON variants
    FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY variants_delete ON variants
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Assignments policies
CREATE POLICY assignments_select ON assignments
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY assignments_insert ON assignments
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Metric events policies
CREATE POLICY metric_events_select ON metric_events
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY metric_events_insert ON metric_events
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Other tables follow similar patterns
CREATE POLICY experiment_metrics_all ON experiment_metrics FOR ALL USING (true);
CREATE POLICY segments_all ON segments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY rollout_configs_all ON rollout_configs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY guardrail_rules_all ON guardrail_rules FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY guardrail_alerts_all ON guardrail_alerts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY auto_optimization_configs_all ON auto_optimization_configs FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variants_updated_at
    BEFORE UPDATE ON variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_segments_updated_at
    BEFORE UPDATE ON segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rollout_configs_updated_at
    BEFORE UPDATE ON rollout_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_optimization_configs_updated_at
    BEFORE UPDATE ON auto_optimization_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE experiments IS 'A/B test experiments with variants and metrics';
COMMENT ON TABLE variants IS 'Experiment variants with traffic allocation';
COMMENT ON TABLE assignments IS 'User-to-variant assignments with consistent hashing';
COMMENT ON TABLE experiment_metrics IS 'Metrics configuration for experiments';
COMMENT ON TABLE metric_events IS 'Individual metric events from experiment executions';
COMMENT ON TABLE segments IS 'User segments for targeted experiments';
COMMENT ON TABLE rollout_configs IS 'Gradual rollout configurations';
COMMENT ON TABLE guardrail_rules IS 'Safety guardrails for experiments';
COMMENT ON TABLE guardrail_alerts IS 'Alerts triggered by guardrail violations';
COMMENT ON TABLE auto_optimization_configs IS 'Auto-optimization (multi-armed bandit) configurations';
