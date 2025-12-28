-- Migration: Quota Management System
-- Description: Tables and functions for quota tracking, rate limiting, and usage analytics
-- Version: 012

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Enum Types
-- ============================================================================

CREATE TYPE quota_type AS ENUM (
  'workflows',
  'executions',
  'api_calls',
  'storage',
  'bandwidth',
  'nodes'
);

CREATE TYPE quota_period AS ENUM (
  'minute',
  'hour',
  'day',
  'month'
);

CREATE TYPE alert_action AS ENUM (
  'notify',
  'warn',
  'throttle',
  'block'
);

CREATE TYPE alert_severity AS ENUM (
  'info',
  'warning',
  'critical'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'cancelled',
  'past_due',
  'trialing'
);

-- ============================================================================
-- Plans Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0, -- Price in cents
  quotas JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster plan lookups
CREATE INDEX IF NOT EXISTS idx_plans_is_custom ON plans(is_custom);

-- ============================================================================
-- User Subscriptions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 month',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);

-- ============================================================================
-- User Quotas Table (Aggregated Usage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  quota_type quota_type NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quota_type)
);

-- Indexes for fast quota checks
CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quotas_quota_type ON user_quotas(quota_type);
CREATE INDEX IF NOT EXISTS idx_user_quotas_reset_at ON user_quotas(reset_at);

-- ============================================================================
-- Usage Logs Table (Time-Series Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  quota_type quota_type NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for time-series queries and aggregations
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id_timestamp ON usage_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_quota_type_timestamp ON usage_logs(quota_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp DESC);

-- Composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_usage_logs_composite ON usage_logs(user_id, quota_type, timestamp DESC);

-- ============================================================================
-- Quota Overrides Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS quota_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  quota_type quota_type NOT NULL,
  limit INTEGER NOT NULL,
  expires_at TIMESTAMPTZ,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quota_type)
);

-- Indexes for override lookups
CREATE INDEX IF NOT EXISTS idx_quota_overrides_user_id ON quota_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_quota_overrides_expires_at ON quota_overrides(expires_at);

-- ============================================================================
-- Alert Thresholds Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  quota_type quota_type NOT NULL,
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  action alert_action NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quota_type, percentage)
);

-- Indexes for threshold lookups
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_user_id ON alert_thresholds(user_id);

-- ============================================================================
-- Quota Alerts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS quota_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  quota_type quota_type NOT NULL,
  usage_percent DECIMAL(5,2) NOT NULL,
  threshold_percentage INTEGER NOT NULL,
  threshold_action alert_action NOT NULL,
  severity alert_severity NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_quota_alerts_user_id ON quota_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_timestamp ON quota_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_severity ON quota_alerts(severity);

-- ============================================================================
-- Database Functions
-- ============================================================================

-- Function: Get current usage aggregated by quota type
CREATE OR REPLACE FUNCTION get_current_usage(p_user_id TEXT)
RETURNS TABLE (
  quota_type quota_type,
  total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ul.quota_type,
    SUM(ul.amount)::BIGINT AS total
  FROM usage_logs ul
  JOIN user_subscriptions us ON us.user_id = ul.user_id
  WHERE ul.user_id = p_user_id
    AND ul.timestamp >= us.current_period_start
    AND ul.timestamp < us.current_period_end
  GROUP BY ul.quota_type;
END;
$$ LANGUAGE plpgsql;

-- Function: Get usage aggregation for a specific period
CREATE OR REPLACE FUNCTION get_usage_aggregation(
  p_user_id TEXT,
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT SUM(amount)::BIGINT AS total
  FROM usage_logs
  WHERE user_id = p_user_id
    AND quota_type = p_quota_type
    AND timestamp >= p_start_time
    AND timestamp < p_end_time;
END;
$$ LANGUAGE plpgsql;

-- Function: Get usage breakdown by time granularity
CREATE OR REPLACE FUNCTION get_usage_breakdown(
  p_user_id TEXT,
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_granularity TEXT
)
RETURNS TABLE (
  timestamp TIMESTAMPTZ,
  amount BIGINT
) AS $$
DECLARE
  v_truncate TEXT;
BEGIN
  -- Set truncation based on granularity
  v_truncate := CASE p_granularity
    WHEN 'hour' THEN 'hour'
    WHEN 'day' THEN 'day'
    ELSE 'hour'
  END;

  RETURN QUERY EXECUTE format('
    SELECT
      date_trunc(%L, ul.timestamp) AS timestamp,
      SUM(ul.amount)::BIGINT AS amount
    FROM usage_logs ul
    WHERE ul.user_id = %L
      AND ul.quota_type = %L
      AND ul.timestamp >= %L
      AND ul.timestamp < %L
    GROUP BY date_trunc(%L, ul.timestamp)
    ORDER BY timestamp
  ', v_truncate, p_user_id, p_quota_type, p_start_time, p_end_time, v_truncate);
END;
$$ LANGUAGE plpgsql;

-- Function: Get total usage across all users
CREATE OR REPLACE FUNCTION get_total_usage(
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT SUM(amount)::BIGINT AS total
  FROM usage_logs
  WHERE quota_type = p_quota_type
    AND timestamp >= p_start_time
    AND timestamp < p_end_time;
END;
$$ LANGUAGE plpgsql;

-- Function: Get top users by usage
CREATE OR REPLACE FUNCTION get_top_users(
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_limit INTEGER
)
RETURNS TABLE (
  user_id TEXT,
  total BIGINT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ul.user_id,
    SUM(ul.amount)::BIGINT AS total,
    ROW_NUMBER() OVER (ORDER BY SUM(ul.amount) DESC) AS rank
  FROM usage_logs ul
  WHERE ul.quota_type = p_quota_type
    AND ul.timestamp >= p_start_time
    AND ul.timestamp < p_end_time
  GROUP BY ul.user_id
  ORDER BY total DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get usage trends
CREATE OR REPLACE FUNCTION get_usage_trends(
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_granularity TEXT
)
RETURNS TABLE (
  timestamp TIMESTAMPTZ,
  total BIGINT,
  user_count BIGINT
) AS $$
DECLARE
  v_truncate TEXT;
BEGIN
  v_truncate := CASE p_granularity
    WHEN 'hour' THEN 'hour'
    WHEN 'day' THEN 'day'
    WHEN 'week' THEN 'week'
    ELSE 'day'
  END;

  RETURN QUERY EXECUTE format('
    SELECT
      date_trunc(%L, ul.timestamp) AS timestamp,
      SUM(ul.amount)::BIGINT AS total,
      COUNT(DISTINCT ul.user_id)::BIGINT AS user_count
    FROM usage_logs ul
    WHERE ul.quota_type = %L
      AND ul.timestamp >= %L
      AND ul.timestamp < %L
    GROUP BY date_trunc(%L, ul.timestamp)
    ORDER BY timestamp
  ', v_truncate, p_quota_type, p_start_time, p_end_time, v_truncate);
END;
$$ LANGUAGE plpgsql;

-- Function: Get global usage summary
CREATE OR REPLACE FUNCTION get_global_usage_summary(
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  quota_type quota_type,
  total_usage BIGINT,
  total_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ul.quota_type,
    SUM(ul.amount)::BIGINT AS total_usage,
    COUNT(DISTINCT ul.user_id)::BIGINT AS total_users
  FROM usage_logs ul
  WHERE ul.timestamp >= p_start_time
    AND ul.timestamp < p_end_time
  GROUP BY ul.quota_type;
END;
$$ LANGUAGE plpgsql;

-- Function: Get usage for period
CREATE OR REPLACE FUNCTION get_usage_for_period(
  p_user_id TEXT,
  p_quota_type quota_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT SUM(amount)::BIGINT AS total
  FROM usage_logs
  WHERE user_id = p_user_id
    AND quota_type = p_quota_type
    AND timestamp >= p_start_time
    AND timestamp < p_end_time;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_quotas_updated_at
  BEFORE UPDATE ON user_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quota_overrides_updated_at
  BEFORE UPDATE ON quota_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_alerts ENABLE ROW LEVEL SECURITY;

-- Plans: Public read access
CREATE POLICY "Plans are viewable by everyone"
  ON plans FOR SELECT
  USING (true);

-- Plans: Only admins can modify
CREATE POLICY "Plans are modifiable by admins only"
  ON plans FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- User Subscriptions: Users can view their own
CREATE POLICY "Users can view their own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid()::text = user_id OR auth.jwt() ->> 'role' = 'admin');

-- User Subscriptions: Only admins can modify
CREATE POLICY "Subscriptions are modifiable by admins only"
  ON user_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- User Quotas: Users can view their own
CREATE POLICY "Users can view their own quotas"
  ON user_quotas FOR SELECT
  USING (auth.uid()::text = user_id OR auth.jwt() ->> 'role' = 'admin');

-- User Quotas: System can update
CREATE POLICY "System can update quotas"
  ON user_quotas FOR ALL
  USING (true);

-- Usage Logs: Users can view their own
CREATE POLICY "Users can view their own usage logs"
  ON usage_logs FOR SELECT
  USING (auth.uid()::text = user_id OR auth.jwt() ->> 'role' = 'admin');

-- Usage Logs: System can insert
CREATE POLICY "System can insert usage logs"
  ON usage_logs FOR INSERT
  WITH CHECK (true);

-- Quota Overrides: Only admins can access
CREATE POLICY "Quota overrides are accessible by admins only"
  ON quota_overrides FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Alert Thresholds: Users can manage their own
CREATE POLICY "Users can manage their own alert thresholds"
  ON alert_thresholds FOR ALL
  USING (auth.uid()::text = user_id OR auth.jwt() ->> 'role' = 'admin');

-- Quota Alerts: Users can view their own
CREATE POLICY "Users can view their own alerts"
  ON quota_alerts FOR SELECT
  USING (auth.uid()::text = user_id OR auth.jwt() ->> 'role' = 'admin');

-- Quota Alerts: System can insert
CREATE POLICY "System can insert alerts"
  ON quota_alerts FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Insert default plans
INSERT INTO plans (id, name, description, price, quotas, features, is_custom)
VALUES
  ('free', 'Free', 'Perfect for getting started with workflow automation', 0,
   '[
     {"type": "workflows", "limit": 5, "period": "month", "overridable": true},
     {"type": "executions", "limit": 100, "period": "month", "overridable": true},
     {"type": "api_calls", "limit": 1000, "period": "day", "overridable": true},
     {"type": "storage", "limit": 104857600, "period": "month", "overridable": true},
     {"type": "bandwidth", "limit": 1073741824, "period": "month", "overridable": true},
     {"type": "nodes", "limit": 0, "period": "month", "overridable": false}
   ]'::jsonb,
   '["basic_workflows", "email_support", "community_access", "5_workflows", "100_executions"]'::jsonb,
   false
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE plans IS 'Subscription plans with associated quotas and features';
COMMENT ON TABLE user_subscriptions IS 'User subscription records linking users to plans';
COMMENT ON TABLE user_quotas IS 'Aggregated quota usage per user';
COMMENT ON TABLE usage_logs IS 'Time-series usage logs for analytics and billing';
COMMENT ON TABLE quota_overrides IS 'Per-user quota overrides for special cases';
COMMENT ON TABLE alert_thresholds IS 'Custom alert thresholds for quota monitoring';
COMMENT ON TABLE quota_alerts IS 'Alert history for quota threshold violations';
