-- Performance Optimization Engine Schema
-- Tables for profiles, benchmarks, bottlenecks, optimizations, and alerts

-- Performance Profiles Table
CREATE TABLE IF NOT EXISTS performance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds
  node_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_resource_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  flame_graph JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance_profiles
CREATE INDEX IF NOT EXISTS idx_performance_profiles_workflow_id ON performance_profiles(workflow_id);
CREATE INDEX IF NOT EXISTS idx_performance_profiles_execution_id ON performance_profiles(execution_id);
CREATE INDEX IF NOT EXISTS idx_performance_profiles_start_time ON performance_profiles(start_time);
CREATE INDEX IF NOT EXISTS idx_performance_profiles_duration ON performance_profiles(duration);

-- Benchmarks Table
CREATE TABLE IF NOT EXISTS benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  iterations INTEGER NOT NULL,
  warmup_runs INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL,
  outliers JSONB DEFAULT '[]'::jsonb,
  comparisons JSONB DEFAULT '[]'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for benchmarks
CREATE INDEX IF NOT EXISTS idx_benchmarks_workflow_id ON benchmarks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_benchmarks_timestamp ON benchmarks(timestamp);

-- Bottlenecks Table
CREATE TABLE IF NOT EXISTS bottlenecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES performance_profiles(id) ON DELETE CASCADE,
  workflow_id VARCHAR(255) NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  node_name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('cpu', 'memory', 'io', 'network', 'external_api', 'database')),
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  impact DECIMAL(5, 2) NOT NULL CHECK (impact >= 0 AND impact <= 100),
  description TEXT NOT NULL,
  root_cause TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for bottlenecks
CREATE INDEX IF NOT EXISTS idx_bottlenecks_profile_id ON bottlenecks(profile_id);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_workflow_id ON bottlenecks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_execution_id ON bottlenecks(execution_id);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_type ON bottlenecks(type);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_severity ON bottlenecks(severity);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_impact ON bottlenecks(impact);

-- Optimizations Table
CREATE TABLE IF NOT EXISTS optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  optimization_type VARCHAR(50) NOT NULL CHECK (optimization_type IN ('caching', 'parallelization', 'batching', 'resource_allocation', 'query_optimization', 'code_optimization')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  expected_gain JSONB NOT NULL,
  affected_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  safe_to_auto_apply BOOLEAN NOT NULL DEFAULT false,
  complexity VARCHAR(50) NOT NULL CHECK (complexity IN ('low', 'medium', 'high')),
  implementation JSONB,
  applied_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for optimizations
CREATE INDEX IF NOT EXISTS idx_optimizations_workflow_id ON optimizations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_optimizations_type ON optimizations(optimization_type);
CREATE INDEX IF NOT EXISTS idx_optimizations_applied_at ON optimizations(applied_at);

-- Regressions Table
CREATE TABLE IF NOT EXISTS regressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  metric VARCHAR(100) NOT NULL,
  baseline_execution_id VARCHAR(255) NOT NULL,
  baseline_value DECIMAL(12, 2) NOT NULL,
  baseline_timestamp TIMESTAMPTZ NOT NULL,
  current_execution_id VARCHAR(255) NOT NULL,
  current_value DECIMAL(12, 2) NOT NULL,
  current_timestamp TIMESTAMPTZ NOT NULL,
  degradation DECIMAL(8, 2) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  statistically_significant BOOLEAN NOT NULL DEFAULT false,
  p_value DECIMAL(6, 5),
  root_cause TEXT,
  suspects JSONB DEFAULT '[]'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for regressions
CREATE INDEX IF NOT EXISTS idx_regressions_workflow_id ON regressions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_regressions_metric ON regressions(metric);
CREATE INDEX IF NOT EXISTS idx_regressions_severity ON regressions(severity);
CREATE INDEX IF NOT EXISTS idx_regressions_detected_at ON regressions(detected_at);
CREATE INDEX IF NOT EXISTS idx_regressions_resolved_at ON regressions(resolved_at);

-- Performance Alerts Table
CREATE TABLE IF NOT EXISTS performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  execution_id VARCHAR(255),
  type VARCHAR(50) NOT NULL CHECK (type IN ('threshold', 'anomaly', 'regression', 'failure')),
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metric VARCHAR(100),
  value DECIMAL(12, 2),
  threshold_value DECIMAL(12, 2),
  triggered_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  resolution TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance_alerts
CREATE INDEX IF NOT EXISTS idx_performance_alerts_workflow_id ON performance_alerts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_execution_id ON performance_alerts(execution_id);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_type ON performance_alerts(type);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_severity ON performance_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_triggered_at ON performance_alerts(triggered_at);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_resolved_at ON performance_alerts(resolved_at);

-- Alert Thresholds Table
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255),
  metric VARCHAR(100) NOT NULL,
  operator VARCHAR(10) NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte', 'eq', 'neq')),
  value DECIMAL(12, 2) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  duration INTEGER, -- seconds
  cooldown INTEGER, -- seconds
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for alert_thresholds
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_workflow_id ON alert_thresholds(workflow_id);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_metric ON alert_thresholds(metric);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_enabled ON alert_thresholds(enabled);

-- Performance Reports Table
CREATE TABLE IF NOT EXISTS performance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  summary JSONB NOT NULL,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  bottlenecks JSONB NOT NULL DEFAULT '[]'::jsonb,
  optimizations JSONB NOT NULL DEFAULT '[]'::jsonb,
  trends JSONB NOT NULL DEFAULT '[]'::jsonb,
  regressions JSONB NOT NULL DEFAULT '[]'::jsonb,
  visualizations JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL,
  generated_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance_reports
CREATE INDEX IF NOT EXISTS idx_performance_reports_workflow_id ON performance_reports(workflow_id);
CREATE INDEX IF NOT EXISTS idx_performance_reports_period_start ON performance_reports(period_start);
CREATE INDEX IF NOT EXISTS idx_performance_reports_period_end ON performance_reports(period_end);
CREATE INDEX IF NOT EXISTS idx_performance_reports_generated_at ON performance_reports(generated_at);

-- Update Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to alert_thresholds
DROP TRIGGER IF EXISTS update_alert_thresholds_updated_at ON alert_thresholds;
CREATE TRIGGER update_alert_thresholds_updated_at
  BEFORE UPDATE ON alert_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE performance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottlenecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reports ENABLE ROW LEVEL SECURITY;

-- Public read access for authenticated users
CREATE POLICY "Public read access for performance_profiles"
  ON performance_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for benchmarks"
  ON benchmarks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for bottlenecks"
  ON bottlenecks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for optimizations"
  ON optimizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for regressions"
  ON regressions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for performance_alerts"
  ON performance_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for alert_thresholds"
  ON alert_thresholds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for performance_reports"
  ON performance_reports FOR SELECT
  TO authenticated
  USING (true);

-- Insert/Update/Delete policies for authenticated users
CREATE POLICY "Authenticated users can manage performance_profiles"
  ON performance_profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage benchmarks"
  ON benchmarks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage bottlenecks"
  ON bottlenecks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage optimizations"
  ON optimizations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage regressions"
  ON regressions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage performance_alerts"
  ON performance_alerts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage alert_thresholds"
  ON alert_thresholds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage performance_reports"
  ON performance_reports FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comments on tables
COMMENT ON TABLE performance_profiles IS 'Workflow execution performance profiles with detailed metrics';
COMMENT ON TABLE benchmarks IS 'Performance benchmark results with statistical analysis';
COMMENT ON TABLE bottlenecks IS 'Detected performance bottlenecks and their impacts';
COMMENT ON TABLE optimizations IS 'Applied performance optimizations and their results';
COMMENT ON TABLE regressions IS 'Detected performance regressions';
COMMENT ON TABLE performance_alerts IS 'Performance alerts for threshold and anomaly detection';
COMMENT ON TABLE alert_thresholds IS 'Configured alert thresholds for performance monitoring';
COMMENT ON TABLE performance_reports IS 'Generated performance reports with comprehensive analysis';
