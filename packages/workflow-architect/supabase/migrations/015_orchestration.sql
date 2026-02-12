-- Multi-Agent Orchestration Schema
-- Tables for teams, agents, tasks, and messages

-- Agent Teams Table
CREATE TABLE IF NOT EXISTS agent_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  topology VARCHAR(50) NOT NULL CHECK (topology IN ('hierarchical', 'flat', 'mesh', 'star')),
  leader_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index on team name
CREATE INDEX IF NOT EXISTS idx_agent_teams_name ON agent_teams(name);

-- Team Agents Table (Many-to-Many relationship)
CREATE TABLE IF NOT EXISTS team_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('coordinator', 'specialist', 'supervisor', 'worker')),
  status VARCHAR(50) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline', 'error')),
  workload DECIMAL(3, 2) NOT NULL DEFAULT 0.00 CHECK (workload >= 0 AND workload <= 1),
  max_concurrent_tasks INTEGER NOT NULL DEFAULT 3,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(team_id, agent_id)
);

-- Create indexes for team_agents
CREATE INDEX IF NOT EXISTS idx_team_agents_team_id ON team_agents(team_id);
CREATE INDEX IF NOT EXISTS idx_team_agents_agent_id ON team_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_team_agents_status ON team_agents(status);
CREATE INDEX IF NOT EXISTS idx_team_agents_role ON team_agents(role);

-- Task Assignments Table
CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  task_type VARCHAR(100) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  task_description TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  dependencies JSONB DEFAULT '[]'::jsonb,
  required_capabilities JSONB DEFAULT '[]'::jsonb,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  estimated_duration INTEGER, -- milliseconds
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error JSONB,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for task_assignments
CREATE INDEX IF NOT EXISTS idx_task_assignments_team_id ON task_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_agent_id ON task_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_status ON task_assignments(status);
CREATE INDEX IF NOT EXISTS idx_task_assignments_priority ON task_assignments(priority);
CREATE INDEX IF NOT EXISTS idx_task_assignments_assigned_at ON task_assignments(assigned_at);

-- Agent Messages Table
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES agent_teams(id) ON DELETE CASCADE,
  from_agent_id UUID NOT NULL,
  to_agent_id UUID NOT NULL,
  message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('request', 'response', 'notification', 'handoff', 'heartbeat')),
  topic VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for agent_messages
CREATE INDEX IF NOT EXISTS idx_agent_messages_team_id ON agent_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_from_agent_id ON agent_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to_agent_id ON agent_messages(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_topic ON agent_messages(topic);
CREATE INDEX IF NOT EXISTS idx_agent_messages_timestamp ON agent_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_messages_correlation_id ON agent_messages(correlation_id);

-- Execution Logs Table
CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  task_id UUID,
  agent_id UUID,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for execution_logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_team_id ON execution_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_task_id ON execution_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_id ON execution_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_timestamp ON execution_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_execution_logs_event_type ON execution_logs(event_type);

-- Team Metrics Table
CREATE TABLE IF NOT EXISTS team_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  tasks_total INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  average_duration INTEGER, -- milliseconds
  success_rate DECIMAL(5, 4),
  agents_total INTEGER NOT NULL DEFAULT 0,
  average_utilization DECIMAL(5, 4),
  throughput DECIMAL(10, 2), -- tasks per hour
  latency_p50 INTEGER,
  latency_p95 INTEGER,
  latency_p99 INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for team_metrics
CREATE INDEX IF NOT EXISTS idx_team_metrics_team_id ON team_metrics(team_id);
CREATE INDEX IF NOT EXISTS idx_team_metrics_period_start ON team_metrics(period_start);
CREATE INDEX IF NOT EXISTS idx_team_metrics_period_end ON team_metrics(period_end);

-- Handoffs Table
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  from_agent_id UUID NOT NULL,
  to_agent_id UUID NOT NULL,
  task_id UUID NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'acknowledged', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for agent_handoffs
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_team_id ON agent_handoffs(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_from_agent_id ON agent_handoffs(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_to_agent_id ON agent_handoffs(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_task_id ON agent_handoffs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_status ON agent_handoffs(status);

-- Consensus Proposals Table
CREATE TABLE IF NOT EXISTS consensus_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  proposed_by UUID NOT NULL,
  voting_strategy VARCHAR(50) NOT NULL CHECK (voting_strategy IN ('majority', 'unanimous', 'weighted', 'super_majority')),
  votes JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision VARCHAR(50) CHECK (decision IN ('approved', 'rejected', 'deferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for consensus_proposals
CREATE INDEX IF NOT EXISTS idx_consensus_proposals_team_id ON consensus_proposals(team_id);
CREATE INDEX IF NOT EXISTS idx_consensus_proposals_proposed_by ON consensus_proposals(proposed_by);
CREATE INDEX IF NOT EXISTS idx_consensus_proposals_created_at ON consensus_proposals(created_at);
CREATE INDEX IF NOT EXISTS idx_consensus_proposals_decision ON consensus_proposals(decision);

-- Update Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to tables
DROP TRIGGER IF EXISTS update_agent_teams_updated_at ON agent_teams;
CREATE TRIGGER update_agent_teams_updated_at
  BEFORE UPDATE ON agent_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_agents_updated_at ON team_agents;
CREATE TRIGGER update_team_agents_updated_at
  BEFORE UPDATE ON team_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE agent_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_proposals ENABLE ROW LEVEL SECURITY;

-- Public read access for authenticated users
CREATE POLICY "Public read access for agent_teams"
  ON agent_teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for team_agents"
  ON team_agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for task_assignments"
  ON task_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for agent_messages"
  ON agent_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for execution_logs"
  ON execution_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for team_metrics"
  ON team_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for agent_handoffs"
  ON agent_handoffs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read access for consensus_proposals"
  ON consensus_proposals FOR SELECT
  TO authenticated
  USING (true);

-- Insert/Update/Delete policies for authenticated users
CREATE POLICY "Authenticated users can manage agent_teams"
  ON agent_teams FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage team_agents"
  ON team_agents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage task_assignments"
  ON task_assignments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage agent_messages"
  ON agent_messages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage execution_logs"
  ON execution_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage team_metrics"
  ON team_metrics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage agent_handoffs"
  ON agent_handoffs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage consensus_proposals"
  ON consensus_proposals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comment on tables
COMMENT ON TABLE agent_teams IS 'Multi-agent teams with configurable topologies';
COMMENT ON TABLE team_agents IS 'Agents belonging to teams';
COMMENT ON TABLE task_assignments IS 'Task assignments to agents';
COMMENT ON TABLE agent_messages IS 'Inter-agent communication messages';
COMMENT ON TABLE execution_logs IS 'Execution event logs';
COMMENT ON TABLE team_metrics IS 'Team performance metrics';
COMMENT ON TABLE agent_handoffs IS 'Agent-to-agent task handoffs';
COMMENT ON TABLE consensus_proposals IS 'Multi-agent voting and consensus';
