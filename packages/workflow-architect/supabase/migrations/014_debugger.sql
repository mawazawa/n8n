-- Migration 014: Advanced Debugging Tools
-- Creates tables for debug sessions, breakpoints, execution snapshots, and profiling data

-- Debug Sessions Table
-- Stores active and historical debug sessions
CREATE TABLE IF NOT EXISTS debug_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  execution_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR')),
  current_node_id TEXT,
  breakpoints JSONB DEFAULT '[]'::jsonb,
  stack JSONB DEFAULT '[]'::jsonb,
  watches JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on workflow_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_debug_sessions_workflow_id ON debug_sessions(workflow_id);

-- Create index on user_id for user queries
CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_id ON debug_sessions(user_id);

-- Create index on status for filtering active sessions
CREATE INDEX IF NOT EXISTS idx_debug_sessions_status ON debug_sessions(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_debug_sessions_created_at ON debug_sessions(created_at DESC);

-- Breakpoints Table (for detailed breakpoint tracking)
CREATE TABLE IF NOT EXISTS breakpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES debug_sessions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NODE_ENTRY', 'NODE_EXIT', 'CONDITION', 'ERROR')),
  condition TEXT,
  enabled BOOLEAN DEFAULT true,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on session_id for session lookups
CREATE INDEX IF NOT EXISTS idx_breakpoints_session_id ON breakpoints(session_id);

-- Create index on node_id for node lookups
CREATE INDEX IF NOT EXISTS idx_breakpoints_node_id ON breakpoints(node_id);

-- Create composite index for enabled breakpoints by session
CREATE INDEX IF NOT EXISTS idx_breakpoints_session_enabled ON breakpoints(session_id, enabled) WHERE enabled = true;

-- Execution Snapshots Table
-- Stores execution state snapshots for replay and debugging
CREATE TABLE IF NOT EXISTS execution_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('execution', 'replay', 'export', 'checkpoint')),
  execution_id TEXT NOT NULL,
  session_id UUID REFERENCES debug_sessions(id) ON DELETE CASCADE,
  start_node_id TEXT,
  snapshot_data JSONB DEFAULT '{}'::jsonb,
  modifications JSONB DEFAULT '{}'::jsonb,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on execution_id for execution lookups
CREATE INDEX IF NOT EXISTS idx_execution_snapshots_execution_id ON execution_snapshots(execution_id);

-- Create index on session_id for session lookups
CREATE INDEX IF NOT EXISTS idx_execution_snapshots_session_id ON execution_snapshots(session_id);

-- Create index on snapshot_type for filtering
CREATE INDEX IF NOT EXISTS idx_execution_snapshots_type ON execution_snapshots(snapshot_type);

-- Create composite index for replay sessions
CREATE INDEX IF NOT EXISTS idx_execution_snapshots_replay ON execution_snapshots(execution_id, snapshot_type) WHERE snapshot_type = 'replay';

-- Profiling Data Table
-- Stores performance profiling results
CREATE TABLE IF NOT EXISTS profiling_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES debug_sessions(id) ON DELETE CASCADE,
  execution_id TEXT,
  total_duration INTEGER NOT NULL, -- in milliseconds
  total_memory BIGINT NOT NULL, -- in bytes
  metrics JSONB DEFAULT '[]'::jsonb,
  flame_graph JSONB,
  hotspots JSONB DEFAULT '[]'::jsonb,
  memory_snapshots JSONB DEFAULT '[]'::jsonb,
  network_requests JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on session_id for session lookups
CREATE INDEX IF NOT EXISTS idx_profiling_data_session_id ON profiling_data(session_id);

-- Create index on execution_id for execution lookups
CREATE INDEX IF NOT EXISTS idx_profiling_data_execution_id ON profiling_data(execution_id);

-- Create index on total_duration for performance queries
CREATE INDEX IF NOT EXISTS idx_profiling_data_duration ON profiling_data(total_duration);

-- Create GIN index on metrics for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_profiling_data_metrics ON profiling_data USING GIN (metrics);

-- Watch Expressions Table (for detailed watch tracking)
CREATE TABLE IF NOT EXISTS watch_expressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES debug_sessions(id) ON DELETE CASCADE,
  expression TEXT NOT NULL,
  value JSONB,
  error TEXT,
  node_id TEXT,
  auto_refresh BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on session_id for session lookups
CREATE INDEX IF NOT EXISTS idx_watch_expressions_session_id ON watch_expressions(session_id);

-- Create index on node_id for node-scoped watches
CREATE INDEX IF NOT EXISTS idx_watch_expressions_node_id ON watch_expressions(node_id);

-- Network Requests Table (for HTTP request tracking)
CREATE TABLE IF NOT EXISTS debug_network_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES debug_sessions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER,
  duration INTEGER, -- in milliseconds
  size BIGINT, -- in bytes
  request_headers JSONB,
  request_body JSONB,
  response_headers JSONB,
  response_body JSONB,
  error TEXT,
  timing JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on session_id for session lookups
CREATE INDEX IF NOT EXISTS idx_debug_network_session_id ON debug_network_requests(session_id);

-- Create index on node_id for node lookups
CREATE INDEX IF NOT EXISTS idx_debug_network_node_id ON debug_network_requests(node_id);

-- Create index on method for filtering
CREATE INDEX IF NOT EXISTS idx_debug_network_method ON debug_network_requests(method);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_debug_network_status ON debug_network_requests(status);

-- Create index on duration for performance queries
CREATE INDEX IF NOT EXISTS idx_debug_network_duration ON debug_network_requests(duration);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE debug_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiling_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_expressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_network_requests ENABLE ROW LEVEL SECURITY;

-- Debug Sessions Policies
CREATE POLICY "Users can view their own debug sessions"
  ON debug_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create debug sessions"
  ON debug_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own debug sessions"
  ON debug_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own debug sessions"
  ON debug_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Breakpoints Policies
CREATE POLICY "Users can view breakpoints for their sessions"
  ON breakpoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = breakpoints.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create breakpoints for their sessions"
  ON breakpoints FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can update breakpoints for their sessions"
  ON breakpoints FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = breakpoints.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete breakpoints for their sessions"
  ON breakpoints FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = breakpoints.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

-- Execution Snapshots Policies
CREATE POLICY "Users can view snapshots for their sessions"
  ON execution_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = execution_snapshots.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create snapshots for their sessions"
  ON execution_snapshots FOR INSERT
  WITH CHECK (
    session_id IS NULL OR
    EXISTS (
      SELECT 1 FROM debug_sessions
      WHERE debug_sessions.id = session_id
      AND debug_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update snapshots for their sessions"
  ON execution_snapshots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = execution_snapshots.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete snapshots for their sessions"
  ON execution_snapshots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = execution_snapshots.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

-- Profiling Data Policies
CREATE POLICY "Users can view profiling data for their sessions"
  ON profiling_data FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = profiling_data.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create profiling data for their sessions"
  ON profiling_data FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete profiling data for their sessions"
  ON profiling_data FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = profiling_data.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

-- Watch Expressions Policies
CREATE POLICY "Users can view watch expressions for their sessions"
  ON watch_expressions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = watch_expressions.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create watch expressions for their sessions"
  ON watch_expressions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can update watch expressions for their sessions"
  ON watch_expressions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = watch_expressions.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete watch expressions for their sessions"
  ON watch_expressions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = watch_expressions.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

-- Network Requests Policies
CREATE POLICY "Users can view network requests for their sessions"
  ON debug_network_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = debug_network_requests.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create network requests for their sessions"
  ON debug_network_requests FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = session_id
    AND debug_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete network requests for their sessions"
  ON debug_network_requests FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM debug_sessions
    WHERE debug_sessions.id = debug_network_requests.session_id
    AND debug_sessions.user_id = auth.uid()
  ));

-- Functions and Triggers

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_debugger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for debug_sessions
CREATE TRIGGER update_debug_sessions_updated_at
  BEFORE UPDATE ON debug_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_debugger_updated_at();

-- Trigger for breakpoints
CREATE TRIGGER update_breakpoints_updated_at
  BEFORE UPDATE ON breakpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_debugger_updated_at();

-- Trigger for execution_snapshots
CREATE TRIGGER update_execution_snapshots_updated_at
  BEFORE UPDATE ON execution_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_debugger_updated_at();

-- Trigger for watch_expressions
CREATE TRIGGER update_watch_expressions_updated_at
  BEFORE UPDATE ON watch_expressions
  FOR EACH ROW
  EXECUTE FUNCTION update_debugger_updated_at();

-- Function to clean up old debug sessions (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_debug_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM debug_sessions
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND status IN ('STOPPED', 'COMPLETED', 'ERROR');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE debug_sessions IS 'Stores debug session state including breakpoints and execution stack';
COMMENT ON TABLE breakpoints IS 'Detailed breakpoint tracking with hit counts and conditions';
COMMENT ON TABLE execution_snapshots IS 'Execution state snapshots for replay and time-travel debugging';
COMMENT ON TABLE profiling_data IS 'Performance profiling results with metrics and flame graphs';
COMMENT ON TABLE watch_expressions IS 'Variable watch expressions for real-time monitoring';
COMMENT ON TABLE debug_network_requests IS 'HTTP request tracking during workflow execution';

COMMENT ON FUNCTION cleanup_old_debug_sessions() IS 'Cleans up debug sessions older than 30 days that are not active';
