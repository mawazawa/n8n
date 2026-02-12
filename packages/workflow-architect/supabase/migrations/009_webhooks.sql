-- Migration: Create webhooks tables
-- Implements webhook management with deliveries, monitoring, and rate limiting

-- Create enums for webhooks
CREATE TYPE webhook_status AS ENUM ('active', 'paused', 'disabled');
CREATE TYPE signature_type AS ENUM ('hmac-sha256', 'hmac-sha1', 'jwt', 'basic', 'none');
CREATE TYPE delivery_status AS ENUM ('pending', 'delivered', 'failed', 'retrying');
CREATE TYPE backoff_strategy AS ENUM ('exponential', 'fixed');

-- Webhooks table
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Webhook configuration
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  signature_type signature_type NOT NULL DEFAULT 'hmac-sha256',
  headers JSONB DEFAULT '{}',
  events TEXT[] NOT NULL,

  -- Status and retry configuration
  status webhook_status DEFAULT 'active',
  max_retry_attempts INTEGER NOT NULL DEFAULT 3,
  backoff_strategy backoff_strategy NOT NULL DEFAULT 'exponential',
  initial_delay INTEGER NOT NULL DEFAULT 1000, -- milliseconds

  -- Rate limiting
  rate_limit_requests INTEGER,
  rate_limit_window INTEGER, -- seconds

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_url CHECK (url ~ '^https?://'),
  CONSTRAINT valid_events CHECK (array_length(events, 1) > 0),
  CONSTRAINT valid_retry_attempts CHECK (max_retry_attempts >= 0 AND max_retry_attempts <= 10),
  CONSTRAINT valid_initial_delay CHECK (initial_delay >= 100 AND initial_delay <= 60000),
  CONSTRAINT valid_rate_limit CHECK (
    (rate_limit_requests IS NULL AND rate_limit_window IS NULL) OR
    (rate_limit_requests > 0 AND rate_limit_window > 0)
  )
);

-- Webhook deliveries table with partitioning for performance
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE NOT NULL,

  -- Delivery information
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status delivery_status DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,

  -- Response information
  response_status_code INTEGER,
  response_body TEXT,
  response_headers JSONB,
  response_time INTEGER, -- milliseconds

  -- Error tracking
  error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  next_retry TIMESTAMPTZ
) PARTITION BY RANGE (created_at);

-- Create partitions for webhook_deliveries (last 3 months + current month + next month)
CREATE TABLE webhook_deliveries_2025_12 PARTITION OF webhook_deliveries
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE webhook_deliveries_2026_01 PARTITION OF webhook_deliveries
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE webhook_deliveries_2026_02 PARTITION OF webhook_deliveries
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE webhook_deliveries_default PARTITION OF webhook_deliveries DEFAULT;

-- Rate limiting tracking table
CREATE TABLE webhook_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_webhook_window UNIQUE (webhook_id, window_start)
);

-- Webhook event subscriptions (for decoupling events from webhooks)
CREATE TABLE webhook_event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_webhook_event UNIQUE (webhook_id, event_type)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Webhooks
CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_status ON webhooks(status) WHERE status = 'active';
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);

-- Webhook deliveries
CREATE INDEX idx_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_deliveries_next_retry ON webhook_deliveries(next_retry)
  WHERE status = 'retrying' AND next_retry IS NOT NULL;
CREATE INDEX idx_deliveries_webhook_status ON webhook_deliveries(webhook_id, status);

-- Rate limits
CREATE INDEX idx_rate_limits_webhook_id ON webhook_rate_limits(webhook_id);
CREATE INDEX idx_rate_limits_window ON webhook_rate_limits(window_start DESC);
CREATE INDEX idx_rate_limits_cleanup ON webhook_rate_limits(created_at)
  WHERE created_at < NOW() - INTERVAL '1 day';

-- Event subscriptions
CREATE INDEX idx_event_subscriptions_webhook ON webhook_event_subscriptions(webhook_id);
CREATE INDEX idx_event_subscriptions_event ON webhook_event_subscriptions(event_type);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update webhook status based on consecutive failures
CREATE OR REPLACE FUNCTION check_webhook_health()
RETURNS TRIGGER AS $$
DECLARE
  consecutive_failures INTEGER;
  webhook_status webhook_status;
BEGIN
  -- Only check when a delivery fails
  IF NEW.status = 'failed' THEN
    -- Count consecutive failures
    SELECT COUNT(*)
    INTO consecutive_failures
    FROM (
      SELECT status
      FROM webhook_deliveries
      WHERE webhook_id = NEW.webhook_id
        AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 10
    ) recent
    WHERE status = 'failed';

    -- Pause webhook if 5+ consecutive failures
    IF consecutive_failures >= 5 THEN
      UPDATE webhooks
      SET status = 'paused'
      WHERE id = NEW.webhook_id
        AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deliveries_check_health
  AFTER INSERT OR UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION check_webhook_health();

-- Cleanup old deliveries (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_deliveries()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_deliveries
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup old rate limit records (keep last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_rate_limits
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to get webhook statistics
CREATE OR REPLACE FUNCTION get_webhook_stats(webhook_uuid UUID, time_window INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS TABLE (
  total_deliveries BIGINT,
  successful_deliveries BIGINT,
  failed_deliveries BIGINT,
  success_rate DECIMAL,
  avg_response_time DECIMAL,
  consecutive_failures BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'delivered') as successful,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      AVG(response_time) FILTER (WHERE response_time IS NOT NULL) as avg_time
    FROM webhook_deliveries
    WHERE webhook_id = webhook_uuid
      AND created_at >= NOW() - time_window
  ),
  recent_failures AS (
    SELECT COUNT(*) as failures
    FROM (
      SELECT status
      FROM webhook_deliveries
      WHERE webhook_id = webhook_uuid
      ORDER BY created_at DESC
      LIMIT 10
    ) recent
    WHERE status = 'failed'
  )
  SELECT
    stats.total,
    stats.successful,
    stats.failed,
    CASE
      WHEN stats.total = 0 THEN 0
      ELSE ROUND((stats.successful::DECIMAL / stats.total * 100), 2)
    END as success_rate,
    ROUND(stats.avg_time::DECIMAL, 2) as avg_response_time,
    recent_failures.failures
  FROM stats, recent_failures;
END;
$$ LANGUAGE plpgsql;

-- Function to get deliveries ready for retry
CREATE OR REPLACE FUNCTION get_retryable_deliveries(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  delivery_id UUID,
  webhook_id UUID,
  webhook_url TEXT,
  webhook_secret TEXT,
  signature_type signature_type,
  headers JSONB,
  event TEXT,
  payload JSONB,
  attempts INTEGER,
  max_attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.webhook_id,
    w.url,
    w.secret,
    w.signature_type,
    w.headers,
    d.event,
    d.payload,
    d.attempts,
    w.max_retry_attempts
  FROM webhook_deliveries d
  JOIN webhooks w ON d.webhook_id = w.id
  WHERE d.status = 'retrying'
    AND d.next_retry <= NOW()
    AND w.status = 'active'
  ORDER BY d.next_retry ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to record rate limit request
CREATE OR REPLACE FUNCTION record_rate_limit_request(webhook_uuid UUID, window_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  window_start TIMESTAMPTZ;
  current_count INTEGER;
  limit_requests INTEGER;
BEGIN
  -- Get webhook rate limit
  SELECT rate_limit_requests INTO limit_requests
  FROM webhooks
  WHERE id = webhook_uuid;

  -- No rate limit configured
  IF limit_requests IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Calculate window start
  window_start := date_trunc('second', NOW()) - (EXTRACT(EPOCH FROM NOW())::INTEGER % window_seconds) * INTERVAL '1 second';

  -- Upsert rate limit record
  INSERT INTO webhook_rate_limits (webhook_id, window_start, request_count)
  VALUES (webhook_uuid, window_start, 1)
  ON CONFLICT (webhook_id, window_start)
  DO UPDATE SET request_count = webhook_rate_limits.request_count + 1
  RETURNING request_count INTO current_count;

  -- Check if limit exceeded
  RETURN current_count <= limit_requests;
END;
$$ LANGUAGE plpgsql;

-- Sync event subscriptions when webhook events change
CREATE OR REPLACE FUNCTION sync_event_subscriptions()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete old subscriptions
  DELETE FROM webhook_event_subscriptions
  WHERE webhook_id = NEW.id;

  -- Insert new subscriptions
  INSERT INTO webhook_event_subscriptions (webhook_id, event_type)
  SELECT NEW.id, unnest(NEW.events);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhooks_sync_events
  AFTER INSERT OR UPDATE OF events ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION sync_event_subscriptions();

-- ============================================================================
-- SCHEDULED JOBS (CRON)
-- ============================================================================

-- Note: These require pg_cron extension. Install with: CREATE EXTENSION pg_cron;
-- Uncomment if pg_cron is available:

-- Clean up old deliveries daily at 2 AM
-- SELECT cron.schedule('cleanup-webhook-deliveries', '0 2 * * *', 'SELECT cleanup_old_deliveries()');

-- Clean up old rate limits every hour
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_old_rate_limits()');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE webhooks IS 'Webhook configurations with retry and rate limiting';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts with response tracking (partitioned by month)';
COMMENT ON TABLE webhook_rate_limits IS 'Rate limiting tracking with sliding window';
COMMENT ON TABLE webhook_event_subscriptions IS 'Webhook event type subscriptions for efficient filtering';
COMMENT ON FUNCTION get_webhook_stats IS 'Calculate webhook delivery statistics for monitoring';
COMMENT ON FUNCTION get_retryable_deliveries IS 'Get deliveries ready for retry based on backoff schedule';
COMMENT ON FUNCTION record_rate_limit_request IS 'Check and record rate limit request, returns true if allowed';
