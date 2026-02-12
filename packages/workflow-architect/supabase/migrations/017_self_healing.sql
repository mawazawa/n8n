-- Migration 017: Self-Healing Workflows
-- Creates tables for healing policies, actions, anomalies, and circuit breaker state

-- Healing Policies Table
-- Stores healing policies for workflows
CREATE TABLE IF NOT EXISTS healing_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  triggers JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  cooldown INTEGER DEFAULT 60000, -- milliseconds
  max_actions_per_hour INTEGER DEFAULT 10,
  notify_on_action BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_healing_policies_workflow_id ON healing_policies(workflow_id);

-- Create index on user_id for user queries
CREATE INDEX IF NOT EXISTS idx_healing_policies_user_id ON healing_policies(user_id);

-- Create index on enabled for filtering active policies
CREATE INDEX IF NOT EXISTS idx_healing_policies_enabled ON healing_policies(enabled) WHERE enabled = true;

-- Create GIN index on triggers for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_healing_policies_triggers ON healing_policies USING GIN (triggers);

-- Healing Actions Table
-- Stores executed healing actions
CREATE TABLE IF NOT EXISTS healing_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID REFERENCES healing_policies(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  execution_id TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('RETRY', 'RESTART', 'SCALE', 'SKIP', 'ROLLBACK', 'FALLBACK', 'CIRCUIT_BREAK', 'THROTTLE')),
  target TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  error TEXT,
  rollback_performed BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on policy_id for policy lookups
CREATE INDEX IF NOT EXISTS idx_healing_actions_policy_id ON healing_actions(policy_id);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_healing_actions_workflow_id ON healing_actions(workflow_id);

-- Create index on action_type for filtering
CREATE INDEX IF NOT EXISTS idx_healing_actions_type ON healing_actions(action_type);

-- Create index on success for success rate queries
CREATE INDEX IF NOT EXISTS idx_healing_actions_success ON healing_actions(success);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_healing_actions_created_at ON healing_actions(created_at DESC);

-- Create composite index for workflow success analysis
CREATE INDEX IF NOT EXISTS idx_healing_actions_workflow_success ON healing_actions(workflow_id, success, created_at DESC);

-- Anomaly Events Table
-- Stores detected anomalies
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  node_id TEXT,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('LATENCY', 'ERROR_RATE', 'MEMORY', 'TIMEOUT', 'RESOURCE_EXHAUSTION', 'CIRCUIT_OPEN', 'DEGRADED_PERFORMANCE')),
  severity NUMERIC(3,2) NOT NULL CHECK (severity >= 0 AND severity <= 1),
  value NUMERIC NOT NULL,
  baseline NUMERIC NOT NULL,
  deviation NUMERIC NOT NULL,
  detection_method TEXT CHECK (detection_method IN ('zscore', 'iqr', 'ml', 'threshold')),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_action_id UUID REFERENCES healing_actions(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_anomaly_events_workflow_id ON anomaly_events(workflow_id);

-- Create index on node_id for node lookups
CREATE INDEX IF NOT EXISTS idx_anomaly_events_node_id ON anomaly_events(node_id);

-- Create index on anomaly_type for filtering
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type ON anomaly_events(anomaly_type);

-- Create index on severity for severity-based queries
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity ON anomaly_events(severity DESC);

-- Create index on resolved for filtering unresolved anomalies
CREATE INDEX IF NOT EXISTS idx_anomaly_events_resolved ON anomaly_events(resolved) WHERE resolved = false;

-- Create index on detected_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_anomaly_events_detected_at ON anomaly_events(detected_at DESC);

-- Create GIN index on metadata for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_anomaly_events_metadata ON anomaly_events USING GIN (metadata);

-- Circuit Breaker State Table
-- Stores circuit breaker states for nodes
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, node_id)
);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_workflow_id ON circuit_breaker_state(workflow_id);

-- Create index on node_id for node lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_node_id ON circuit_breaker_state(node_id);

-- Create index on state for filtering
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON circuit_breaker_state(state);

-- Create composite index for open circuits
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_open ON circuit_breaker_state(workflow_id, state) WHERE state = 'OPEN';

-- Failure Patterns Table
-- Stores learned failure patterns
CREATE TABLE IF NOT EXISTS failure_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_type TEXT NOT NULL,
  frequency INTEGER DEFAULT 0,
  resolution_action JSONB NOT NULL,
  success_rate NUMERIC(3,2) DEFAULT 0 CHECK (success_rate >= 0 AND success_rate <= 1),
  avg_resolution_time INTEGER DEFAULT 0, -- milliseconds
  last_occurred TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(error_type)
);

-- Create index on error_type for pattern lookups
CREATE INDEX IF NOT EXISTS idx_failure_patterns_error_type ON failure_patterns(error_type);

-- Create index on frequency for frequent pattern queries
CREATE INDEX IF NOT EXISTS idx_failure_patterns_frequency ON failure_patterns(frequency DESC);

-- Create index on success_rate for success analysis
CREATE INDEX IF NOT EXISTS idx_failure_patterns_success_rate ON failure_patterns(success_rate DESC);

-- Create index on last_occurred for recent pattern queries
CREATE INDEX IF NOT EXISTS idx_failure_patterns_last_occurred ON failure_patterns(last_occurred DESC);

-- Health Metrics Table
-- Stores workflow health metrics over time
CREATE TABLE IF NOT EXISTS health_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  node_id TEXT,
  latency INTEGER, -- milliseconds
  error_rate NUMERIC(3,2) CHECK (error_rate >= 0 AND error_rate <= 1),
  memory_usage NUMERIC(3,2) CHECK (memory_usage >= 0 AND memory_usage <= 1),
  cpu_usage NUMERIC(3,2) CHECK (cpu_usage >= 0 AND cpu_usage <= 1),
  throughput NUMERIC,
  active_connections INTEGER,
  health_state TEXT NOT NULL CHECK (health_state IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'CRITICAL')),
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_health_metrics_workflow_id ON health_metrics(workflow_id);

-- Create index on node_id for node lookups
CREATE INDEX IF NOT EXISTS idx_health_metrics_node_id ON health_metrics(node_id);

-- Create index on health_state for state filtering
CREATE INDEX IF NOT EXISTS idx_health_metrics_state ON health_metrics(health_state);

-- Create index on timestamp for time-series queries
CREATE INDEX IF NOT EXISTS idx_health_metrics_timestamp ON health_metrics(timestamp DESC);

-- Create composite index for workflow health over time
CREATE INDEX IF NOT EXISTS idx_health_metrics_workflow_time ON health_metrics(workflow_id, timestamp DESC);

-- Rollback History Table
-- Stores workflow rollback events
CREATE TABLE IF NOT EXISTS rollback_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  execution_id TEXT,
  target_version TEXT,
  rollback_type TEXT NOT NULL CHECK (rollback_type IN ('partial', 'full')),
  affected_nodes JSONB DEFAULT '[]'::jsonb,
  success BOOLEAN NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  triggered_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_rollback_history_workflow_id ON rollback_history(workflow_id);

-- Create index on success for success rate queries
CREATE INDEX IF NOT EXISTS idx_rollback_history_success ON rollback_history(success);

-- Create index on triggered_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_rollback_history_triggered_at ON rollback_history(triggered_at DESC);

-- Notification History Table
-- Stores sent notifications
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ANOMALY_DETECTED', 'HEALING_STARTED', 'HEALING_COMPLETED', 'HEALING_FAILED')),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  channels JSONB DEFAULT '[]'::jsonb,
  success BOOLEAN NOT NULL,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for workflow lookups
CREATE INDEX IF NOT EXISTS idx_notification_history_workflow_id ON notification_history(workflow_id);

-- Create index on event_type for filtering
CREATE INDEX IF NOT EXISTS idx_notification_history_event_type ON notification_history(event_type);

-- Create index on severity for severity filtering
CREATE INDEX IF NOT EXISTS idx_notification_history_severity ON notification_history(severity);

-- Create index on sent_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at DESC);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE healing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollback_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

-- Healing Policies Policies
CREATE POLICY "Users can view their own healing policies"
  ON healing_policies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create healing policies"
  ON healing_policies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own healing policies"
  ON healing_policies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own healing policies"
  ON healing_policies FOR DELETE
  USING (auth.uid() = user_id);

-- Healing Actions Policies (read-only for users)
CREATE POLICY "Users can view healing actions for their policies"
  ON healing_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.id = healing_actions.policy_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can insert healing actions"
  ON healing_actions FOR INSERT
  WITH CHECK (true);

-- Anomaly Events Policies (read-only for users)
CREATE POLICY "Users can view anomaly events for their workflows"
  ON anomaly_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.workflow_id = anomaly_events.workflow_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can insert anomaly events"
  ON anomaly_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update anomaly events"
  ON anomaly_events FOR UPDATE
  USING (true);

-- Circuit Breaker State Policies
CREATE POLICY "Users can view circuit breaker state for their workflows"
  ON circuit_breaker_state FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.workflow_id = circuit_breaker_state.workflow_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can manage circuit breaker state"
  ON circuit_breaker_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- Failure Patterns Policies (shared across all users)
CREATE POLICY "Users can view failure patterns"
  ON failure_patterns FOR SELECT
  USING (true);

CREATE POLICY "System can manage failure patterns"
  ON failure_patterns FOR ALL
  USING (true)
  WITH CHECK (true);

-- Health Metrics Policies
CREATE POLICY "Users can view health metrics for their workflows"
  ON health_metrics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.workflow_id = health_metrics.workflow_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can insert health metrics"
  ON health_metrics FOR INSERT
  WITH CHECK (true);

-- Rollback History Policies
CREATE POLICY "Users can view rollback history for their workflows"
  ON rollback_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.workflow_id = rollback_history.workflow_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can insert rollback history"
  ON rollback_history FOR INSERT
  WITH CHECK (true);

-- Notification History Policies
CREATE POLICY "Users can view notification history for their workflows"
  ON notification_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM healing_policies
    WHERE healing_policies.workflow_id = notification_history.workflow_id
    AND healing_policies.user_id = auth.uid()
  ));

CREATE POLICY "System can insert notification history"
  ON notification_history FOR INSERT
  WITH CHECK (true);

-- Functions and Triggers

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_self_healing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_healing_policies_updated_at
  BEFORE UPDATE ON healing_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_self_healing_updated_at();

CREATE TRIGGER update_circuit_breaker_state_updated_at
  BEFORE UPDATE ON circuit_breaker_state
  FOR EACH ROW
  EXECUTE FUNCTION update_self_healing_updated_at();

CREATE TRIGGER update_failure_patterns_updated_at
  BEFORE UPDATE ON failure_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_self_healing_updated_at();

-- Function to calculate healing success rate
CREATE OR REPLACE FUNCTION calculate_healing_success_rate(p_workflow_id TEXT, p_hours INTEGER DEFAULT 24)
RETURNS NUMERIC AS $$
DECLARE
  success_rate NUMERIC;
BEGIN
  SELECT
    COALESCE(
      COUNT(*) FILTER (WHERE success = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0),
      0
    )
  INTO success_rate
  FROM healing_actions
  WHERE workflow_id = p_workflow_id
  AND created_at > NOW() - (p_hours || ' hours')::INTERVAL;

  RETURN success_rate;
END;
$$ LANGUAGE plpgsql;

-- Function to get anomaly statistics
CREATE OR REPLACE FUNCTION get_anomaly_statistics(p_workflow_id TEXT, p_hours INTEGER DEFAULT 24)
RETURNS TABLE(
  anomaly_type TEXT,
  count BIGINT,
  avg_severity NUMERIC,
  resolution_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.anomaly_type,
    COUNT(*) as count,
    AVG(ae.severity) as avg_severity,
    COUNT(*) FILTER (WHERE ae.resolved = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) as resolution_rate
  FROM anomaly_events ae
  WHERE ae.workflow_id = p_workflow_id
  AND ae.created_at > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY ae.anomaly_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old metrics (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_health_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM health_metrics
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old healing actions (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_healing_actions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM healing_actions
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE healing_policies IS 'Healing policies for workflows with triggers and actions';
COMMENT ON TABLE healing_actions IS 'Executed healing actions with results';
COMMENT ON TABLE anomaly_events IS 'Detected anomalies in workflow execution';
COMMENT ON TABLE circuit_breaker_state IS 'Circuit breaker states for workflow nodes';
COMMENT ON TABLE failure_patterns IS 'Learned failure patterns with resolutions';
COMMENT ON TABLE health_metrics IS 'Time-series health metrics for workflows';
COMMENT ON TABLE rollback_history IS 'Workflow rollback events';
COMMENT ON TABLE notification_history IS 'Sent healing notifications';

COMMENT ON FUNCTION calculate_healing_success_rate(TEXT, INTEGER) IS 'Calculate healing success rate for a workflow over specified hours';
COMMENT ON FUNCTION get_anomaly_statistics(TEXT, INTEGER) IS 'Get anomaly statistics for a workflow over specified hours';
COMMENT ON FUNCTION cleanup_old_health_metrics() IS 'Cleans up health metrics older than 30 days';
COMMENT ON FUNCTION cleanup_old_healing_actions() IS 'Cleans up healing actions older than 90 days';
