-- Simulation tables for workflow testing and load testing
-- Phase 5 Action 2: Workflow Simulation Environment

-- Simulations table
CREATE TABLE IF NOT EXISTS simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL,
    config JSONB NOT NULL,
    result JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    CONSTRAINT fk_simulation_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL,
    execution_id TEXT NOT NULL,
    recording JSONB NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT fk_recording_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    scenario JSONB NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT fk_scenario_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Load test results table
CREATE TABLE IF NOT EXISTS load_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL,
    config JSONB NOT NULL,
    result JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    CONSTRAINT fk_load_test_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_simulations_workflow_id ON simulations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_by ON simulations(created_by);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON simulations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recordings_workflow_id ON recordings(workflow_id);
CREATE INDEX IF NOT EXISTS idx_recordings_execution_id ON recordings(execution_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_by ON recordings(created_by);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scenarios_created_by ON scenarios(created_by);
CREATE INDEX IF NOT EXISTS idx_scenarios_is_public ON scenarios(is_public);
CREATE INDEX IF NOT EXISTS idx_scenarios_tags ON scenarios USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_load_test_workflow_id ON load_test_results(workflow_id);
CREATE INDEX IF NOT EXISTS idx_load_test_status ON load_test_results(status);
CREATE INDEX IF NOT EXISTS idx_load_test_created_by ON load_test_results(created_by);
CREATE INDEX IF NOT EXISTS idx_load_test_created_at ON load_test_results(created_at DESC);

-- Row Level Security (RLS) policies

-- Simulations policies
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own simulations"
    ON simulations FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can create simulations"
    ON simulations FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own simulations"
    ON simulations FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own simulations"
    ON simulations FOR DELETE
    USING (auth.uid() = created_by);

-- Recordings policies
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recordings"
    ON recordings FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can create recordings"
    ON recordings FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own recordings"
    ON recordings FOR DELETE
    USING (auth.uid() = created_by);

-- Scenarios policies
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scenarios"
    ON scenarios FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can view public scenarios"
    ON scenarios FOR SELECT
    USING (is_public = TRUE);

CREATE POLICY "Users can create scenarios"
    ON scenarios FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own scenarios"
    ON scenarios FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own scenarios"
    ON scenarios FOR DELETE
    USING (auth.uid() = created_by);

-- Load test results policies
ALTER TABLE load_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own load test results"
    ON load_test_results FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can create load test results"
    ON load_test_results FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own load test results"
    ON load_test_results FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own load test results"
    ON load_test_results FOR DELETE
    USING (auth.uid() = created_by);

-- Functions

-- Update updated_at timestamp for scenarios
CREATE OR REPLACE FUNCTION update_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scenarios_updated_at
    BEFORE UPDATE ON scenarios
    FOR EACH ROW
    EXECUTE FUNCTION update_scenarios_updated_at();

-- Calculate recording size
CREATE OR REPLACE FUNCTION calculate_recording_size()
RETURNS TRIGGER AS $$
BEGIN
    NEW.size_bytes = length(NEW.recording::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recordings_size
    BEFORE INSERT OR UPDATE ON recordings
    FOR EACH ROW
    EXECUTE FUNCTION calculate_recording_size();

-- Analytics views

-- Simulation statistics view
CREATE OR REPLACE VIEW simulation_stats AS
SELECT
    workflow_id,
    COUNT(*) as total_simulations,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') as avg_duration_seconds,
    MAX(created_at) as last_run_at
FROM simulations
GROUP BY workflow_id;

-- Load test statistics view
CREATE OR REPLACE VIEW load_test_stats AS
SELECT
    workflow_id,
    COUNT(*) as total_tests,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') as avg_duration_seconds,
    MAX(created_at) as last_test_at
FROM load_test_results
GROUP BY workflow_id;

-- Recording storage view
CREATE OR REPLACE VIEW recording_storage AS
SELECT
    workflow_id,
    COUNT(*) as total_recordings,
    SUM(size_bytes) as total_size_bytes,
    AVG(size_bytes) as avg_size_bytes,
    MAX(size_bytes) as max_size_bytes
FROM recordings
GROUP BY workflow_id;

-- Comments
COMMENT ON TABLE simulations IS 'Stores workflow simulation runs and results';
COMMENT ON TABLE recordings IS 'Stores recorded workflow executions for playback';
COMMENT ON TABLE scenarios IS 'Stores test scenarios for workflow testing';
COMMENT ON TABLE load_test_results IS 'Stores load test results for workflow performance testing';

COMMENT ON COLUMN simulations.config IS 'Simulation configuration (speed, iterations, chaos settings)';
COMMENT ON COLUMN simulations.result IS 'Simulation result with metrics and errors';
COMMENT ON COLUMN recordings.recording IS 'Complete recording data with events and external calls';
COMMENT ON COLUMN recordings.size_bytes IS 'Size of recording in bytes';
COMMENT ON COLUMN scenarios.scenario IS 'Scenario definition with steps and assertions';
COMMENT ON COLUMN scenarios.is_public IS 'Whether scenario is publicly accessible';
COMMENT ON COLUMN load_test_results.config IS 'Load test configuration (concurrency, ramp pattern, thresholds)';
COMMENT ON COLUMN load_test_results.result IS 'Load test result with metrics and time series data';
