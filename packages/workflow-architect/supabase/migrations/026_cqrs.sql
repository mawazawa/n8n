-- CQRS & Event Sourcing Infrastructure
-- This migration creates tables for Event Store, Snapshots, Projections, Sagas, and Subscriptions

-- =====================================================
-- Events Table (Append-Only Event Store)
-- =====================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure append-only by preventing updates
  CONSTRAINT events_version_check CHECK (version > 0),

  -- Ensure unique version per aggregate
  CONSTRAINT events_aggregate_version_unique UNIQUE (aggregate_id, version)
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON events(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_aggregate_type ON events(aggregate_type);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events((metadata->>'correlationId'));
CREATE INDEX IF NOT EXISTS idx_events_causation_id ON events((metadata->>'causationId'));
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events((metadata->>'userId'));

-- Composite index for efficient aggregate loading
CREATE INDEX IF NOT EXISTS idx_events_aggregate_version ON events(aggregate_id, version);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp_type ON events(timestamp, type);

-- Comment
COMMENT ON TABLE events IS 'Append-only event store for event sourcing';

-- =====================================================
-- Function to get aggregate version
-- =====================================================

CREATE OR REPLACE FUNCTION get_aggregate_version(p_aggregate_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0)
  INTO v_version
  FROM events
  WHERE aggregate_id = p_aggregate_id;

  RETURN v_version;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Snapshots Table
-- =====================================================

CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  state JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT snapshots_version_check CHECK (version > 0)
);

-- Indexes for snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_id ON snapshots(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_version ON snapshots(aggregate_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp);

-- Comment
COMMENT ON TABLE snapshots IS 'Aggregate snapshots for performance optimization';

-- =====================================================
-- Projections Table
-- =====================================================

CREATE TABLE IF NOT EXISTS projections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  position BIGINT NOT NULL DEFAULT 0,
  last_event_timestamp TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'stopped',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT projections_state_check CHECK (
    state IN ('running', 'stopped', 'rebuilding', 'error')
  )
);

-- Indexes for projections
CREATE INDEX IF NOT EXISTS idx_projections_state ON projections(state);
CREATE INDEX IF NOT EXISTS idx_projections_event_types ON projections USING GIN(event_types);

-- Comment
COMMENT ON TABLE projections IS 'Event projections for read models';

-- =====================================================
-- Sagas Table
-- =====================================================

CREATE TABLE IF NOT EXISTS sagas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  completed_steps TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  compensations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  timeout TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sagas_state_check CHECK (
    state IN ('started', 'running', 'compensating', 'completed', 'failed', 'timeout')
  )
);

-- Indexes for sagas
CREATE INDEX IF NOT EXISTS idx_sagas_type ON sagas(type);
CREATE INDEX IF NOT EXISTS idx_sagas_state ON sagas(state);
CREATE INDEX IF NOT EXISTS idx_sagas_started_at ON sagas(started_at);
CREATE INDEX IF NOT EXISTS idx_sagas_timeout ON sagas(timeout) WHERE timeout IS NOT NULL;

-- Comment
COMMENT ON TABLE sagas IS 'Long-running process coordination with compensating transactions';

-- =====================================================
-- Subscriptions Table
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  position BIGINT NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  consumer_group TEXT,
  last_event_id UUID,
  last_event_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_type_check CHECK (
    type IN ('catch_up', 'persistent', 'volatile', 'competing')
  ),
  CONSTRAINT subscriptions_state_check CHECK (
    state IN ('active', 'paused', 'stopped', 'catching_up', 'error')
  )
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_name ON subscriptions(name);
CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON subscriptions(type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_state ON subscriptions(state);
CREATE INDEX IF NOT EXISTS idx_subscriptions_consumer_group ON subscriptions(consumer_group) WHERE consumer_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_event_types ON subscriptions USING GIN(event_types);

-- Comment
COMMENT ON TABLE subscriptions IS 'Event subscriptions with support for different consumption patterns';

-- =====================================================
-- Workflow Summary Projection (Read Model Example)
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_summary (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workflow_summary_status_check CHECK (
    status IN ('draft', 'active', 'archived')
  )
);

-- Indexes for workflow summary
CREATE INDEX IF NOT EXISTS idx_workflow_summary_status ON workflow_summary(status);
CREATE INDEX IF NOT EXISTS idx_workflow_summary_tags ON workflow_summary USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_workflow_summary_name ON workflow_summary(name);
CREATE INDEX IF NOT EXISTS idx_workflow_summary_created_at ON workflow_summary(created_at);

-- Comment
COMMENT ON TABLE workflow_summary IS 'Read model for workflow summaries (projection)';

-- =====================================================
-- Functions for CQRS Operations
-- =====================================================

-- Function to get events for a projection
CREATE OR REPLACE FUNCTION get_projection_events(
  p_projection_id TEXT,
  p_batch_size INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  aggregate_id TEXT,
  aggregate_type TEXT,
  data JSONB,
  metadata JSONB,
  version INTEGER,
  timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_position BIGINT;
  v_event_types TEXT[];
BEGIN
  -- Get projection details
  SELECT position, event_types
  INTO v_position, v_event_types
  FROM projections
  WHERE projections.id = p_projection_id;

  -- Return events after current position
  RETURN QUERY
  SELECT
    e.id,
    e.type,
    e.aggregate_id,
    e.aggregate_type,
    e.data,
    e.metadata,
    e.version,
    e.timestamp
  FROM events e
  WHERE e.type = ANY(v_event_types)
    AND EXTRACT(EPOCH FROM e.timestamp) * 1000 > v_position
  ORDER BY e.timestamp ASC
  LIMIT p_batch_size;
END;
$$ LANGUAGE plpgsql;

-- Function to get event stream statistics
CREATE OR REPLACE FUNCTION get_event_statistics()
RETURNS TABLE (
  total_events BIGINT,
  total_aggregates BIGINT,
  event_types_count BIGINT,
  oldest_event TIMESTAMPTZ,
  newest_event TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_events,
    COUNT(DISTINCT aggregate_id)::BIGINT as total_aggregates,
    COUNT(DISTINCT type)::BIGINT as event_types_count,
    MIN(timestamp) as oldest_event,
    MAX(timestamp) as newest_event
  FROM events;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old completed sagas
CREATE OR REPLACE FUNCTION cleanup_completed_sagas(p_older_than_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM sagas
  WHERE state = 'completed'
    AND completed_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_summary ENABLE ROW LEVEL SECURITY;

-- Events policies
CREATE POLICY "Events are viewable by everyone" ON events
  FOR SELECT USING (true);

CREATE POLICY "Events can be inserted by authenticated users" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Note: No UPDATE or DELETE policies - events are append-only

-- Snapshots policies
CREATE POLICY "Snapshots are viewable by everyone" ON snapshots
  FOR SELECT USING (true);

CREATE POLICY "Snapshots can be managed by authenticated users" ON snapshots
  FOR ALL USING (auth.role() = 'authenticated');

-- Projections policies
CREATE POLICY "Projections are viewable by everyone" ON projections
  FOR SELECT USING (true);

CREATE POLICY "Projections can be managed by authenticated users" ON projections
  FOR ALL USING (auth.role() = 'authenticated');

-- Sagas policies
CREATE POLICY "Sagas are viewable by everyone" ON sagas
  FOR SELECT USING (true);

CREATE POLICY "Sagas can be managed by authenticated users" ON sagas
  FOR ALL USING (auth.role() = 'authenticated');

-- Subscriptions policies
CREATE POLICY "Subscriptions are viewable by everyone" ON subscriptions
  FOR SELECT USING (true);

CREATE POLICY "Subscriptions can be managed by authenticated users" ON subscriptions
  FOR ALL USING (auth.role() = 'authenticated');

-- Workflow summary policies
CREATE POLICY "Workflow summaries are viewable by everyone" ON workflow_summary
  FOR SELECT USING (true);

CREATE POLICY "Workflow summaries can be managed by authenticated users" ON workflow_summary
  FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- Triggers
-- =====================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_projections_updated_at
  BEFORE UPDATE ON projections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sagas_updated_at
  BEFORE UPDATE ON sagas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_summary_updated_at
  BEFORE UPDATE ON workflow_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Views
-- =====================================================

-- View for event stream statistics by type
CREATE OR REPLACE VIEW event_type_statistics AS
SELECT
  type,
  COUNT(*) as event_count,
  COUNT(DISTINCT aggregate_id) as aggregate_count,
  MIN(timestamp) as first_event,
  MAX(timestamp) as last_event
FROM events
GROUP BY type
ORDER BY event_count DESC;

-- View for active subscriptions
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT *
FROM subscriptions
WHERE state IN ('active', 'catching_up')
ORDER BY created_at DESC;

-- View for running sagas
CREATE OR REPLACE VIEW running_sagas AS
SELECT *
FROM sagas
WHERE state IN ('started', 'running', 'compensating')
ORDER BY started_at ASC;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON FUNCTION get_aggregate_version IS 'Get the current version number for an aggregate';
COMMENT ON FUNCTION get_projection_events IS 'Get events for a projection to process';
COMMENT ON FUNCTION get_event_statistics IS 'Get overall event store statistics';
COMMENT ON FUNCTION cleanup_completed_sagas IS 'Cleanup old completed sagas';
COMMENT ON VIEW event_type_statistics IS 'Statistics grouped by event type';
COMMENT ON VIEW active_subscriptions IS 'Currently active subscriptions';
COMMENT ON VIEW running_sagas IS 'Currently running sagas';
