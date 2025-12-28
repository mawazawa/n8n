-- Scheduled Tasks & Cron System Migration
-- Creates tables and functions for job scheduling and execution

-- ============================================================================
-- SCHEDULED JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workflow_id TEXT NOT NULL,

  -- Schedule configuration (JSONB for flexibility)
  schedule JSONB NOT NULL,

  -- Job metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  retry_config JSONB,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Execution tracking
  next_run BIGINT, -- Unix timestamp in milliseconds
  last_run JSONB, -- Stores last JobRun data

  -- Distributed locking
  locked_by TEXT,
  locked_at BIGINT,
  lock_expires_at BIGINT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_schedule CHECK (
    schedule ? 'type' AND
    schedule->>'type' IN ('cron', 'interval', 'once', 'calendar')
  )
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_workflow_id ON scheduled_jobs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_priority ON scheduled_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_locked_by ON scheduled_jobs(locked_by) WHERE locked_by IS NOT NULL;

-- Composite index for polling queries
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_poll ON scheduled_jobs(enabled, next_run, status)
  WHERE enabled = true AND status = 'pending';

-- ============================================================================
-- JOB RUNS TABLE (with partitioning for scalability)
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

  -- Execution details
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at BIGINT NOT NULL, -- Unix timestamp in milliseconds
  finished_at BIGINT,
  duration INTEGER, -- milliseconds
  attempt INTEGER NOT NULL DEFAULT 1,

  -- Results
  result JSONB,
  error TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (started_at);

-- Create partitions for current and next month (manual partitioning for simplicity)
-- In production, use pg_partman or similar for automatic partition management

CREATE TABLE IF NOT EXISTS job_runs_default PARTITION OF job_runs DEFAULT;

-- Create indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_attempt ON job_runs(attempt);

-- Composite index for statistics queries
CREATE INDEX IF NOT EXISTS idx_job_runs_stats ON job_runs(job_id, status, started_at);

-- ============================================================================
-- JOB LOCKING FUNCTIONS
-- ============================================================================

/**
 * Acquire a lock on a job for execution
 * Returns true if lock was acquired, false otherwise
 */
CREATE OR REPLACE FUNCTION acquire_job_lock(
  p_job_id UUID,
  p_instance_id TEXT,
  p_lock_duration_ms INTEGER DEFAULT 60000
)
RETURNS BOOLEAN AS $$
DECLARE
  v_now BIGINT := EXTRACT(EPOCH FROM NOW()) * 1000;
  v_rows_affected INTEGER;
BEGIN
  UPDATE scheduled_jobs
  SET
    locked_by = p_instance_id,
    locked_at = v_now,
    lock_expires_at = v_now + p_lock_duration_ms,
    status = 'running',
    updated_at = NOW()
  WHERE
    id = p_job_id
    AND enabled = true
    AND (
      locked_by IS NULL
      OR lock_expires_at < v_now
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

/**
 * Release a job lock after execution
 */
CREATE OR REPLACE FUNCTION release_job_lock(
  p_job_id UUID,
  p_instance_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  UPDATE scheduled_jobs
  SET
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    status = 'pending',
    updated_at = NOW()
  WHERE
    id = p_job_id
    AND locked_by = p_instance_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

/**
 * Clean up expired locks (for crashed instances)
 */
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  v_now BIGINT := EXTRACT(EPOCH FROM NOW()) * 1000;
  v_rows_affected INTEGER;
BEGIN
  UPDATE scheduled_jobs
  SET
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    status = 'pending',
    updated_at = NOW()
  WHERE
    locked_by IS NOT NULL
    AND lock_expires_at < v_now;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$ LANGUAGE plpgsql;

/**
 * Get jobs ready for execution
 * Returns jobs that are enabled, not locked, and have next_run <= now
 */
CREATE OR REPLACE FUNCTION get_ready_jobs(
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF scheduled_jobs AS $$
DECLARE
  v_now BIGINT := EXTRACT(EPOCH FROM NOW()) * 1000;
BEGIN
  RETURN QUERY
  SELECT *
  FROM scheduled_jobs
  WHERE
    enabled = true
    AND status = 'pending'
    AND next_run IS NOT NULL
    AND next_run <= v_now
    AND (locked_by IS NULL OR lock_expires_at < v_now)
  ORDER BY priority DESC, next_run ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTOMATIC UPDATE TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_scheduled_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_jobs_updated_at();

-- ============================================================================
-- STATISTICS AND MONITORING FUNCTIONS
-- ============================================================================

/**
 * Get job statistics
 */
CREATE OR REPLACE FUNCTION get_job_statistics(
  p_job_id UUID
)
RETURNS TABLE (
  total_runs BIGINT,
  successful_runs BIGINT,
  failed_runs BIGINT,
  average_duration NUMERIC,
  last_success BIGINT,
  last_failure BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_runs,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as successful_runs,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_runs,
    AVG(duration) as average_duration,
    MAX(started_at) FILTER (WHERE status = 'completed') as last_success,
    MAX(started_at) FILTER (WHERE status = 'failed') as last_failure,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as success_rate
  FROM job_runs
  WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Get scheduler health metrics
 */
CREATE OR REPLACE FUNCTION get_scheduler_metrics()
RETURNS TABLE (
  total_jobs BIGINT,
  enabled_jobs BIGINT,
  active_jobs BIGINT,
  pending_jobs BIGINT,
  failed_jobs BIGINT,
  total_runs_today BIGINT,
  failed_runs_today BIGINT,
  average_execution_time NUMERIC
) AS $$
DECLARE
  v_today_start BIGINT := EXTRACT(EPOCH FROM DATE_TRUNC('day', NOW())) * 1000;
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_jobs,
    COUNT(*) FILTER (WHERE enabled = true)::BIGINT as enabled_jobs,
    COUNT(*) FILTER (WHERE status = 'running')::BIGINT as active_jobs,
    COUNT(*) FILTER (WHERE status = 'pending' AND enabled = true)::BIGINT as pending_jobs,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_jobs,
    (SELECT COUNT(*)::BIGINT FROM job_runs WHERE started_at >= v_today_start) as total_runs_today,
    (SELECT COUNT(*)::BIGINT FROM job_runs WHERE started_at >= v_today_start AND status = 'failed') as failed_runs_today,
    (SELECT AVG(duration) FROM job_runs WHERE finished_at >= v_today_start) as average_execution_time
  FROM scheduled_jobs;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

/**
 * Clean up old job runs (retention policy)
 * Default: keep runs for 30 days
 */
CREATE OR REPLACE FUNCTION cleanup_old_job_runs(
  p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  v_cutoff_time BIGINT := EXTRACT(EPOCH FROM (NOW() - (p_retention_days || ' days')::INTERVAL)) * 1000;
  v_rows_deleted INTEGER;
BEGIN
  DELETE FROM job_runs
  WHERE started_at < v_cutoff_time;

  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RETURN v_rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth setup)
-- For now, allow all authenticated users to manage jobs
CREATE POLICY "Allow all operations for authenticated users" ON scheduled_jobs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON job_runs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for service role (full access)
CREATE POLICY "Allow all operations for service role" ON scheduled_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for service role" ON job_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE scheduled_jobs IS 'Stores scheduled job definitions and execution metadata';
COMMENT ON TABLE job_runs IS 'Stores individual job execution records (partitioned by time)';
COMMENT ON FUNCTION acquire_job_lock IS 'Acquires distributed lock for job execution';
COMMENT ON FUNCTION release_job_lock IS 'Releases distributed lock after job execution';
COMMENT ON FUNCTION cleanup_expired_locks IS 'Cleans up locks from crashed instances';
COMMENT ON FUNCTION get_ready_jobs IS 'Returns jobs ready for execution';
COMMENT ON FUNCTION get_job_statistics IS 'Returns execution statistics for a job';
COMMENT ON FUNCTION get_scheduler_metrics IS 'Returns overall scheduler health metrics';
COMMENT ON FUNCTION cleanup_old_job_runs IS 'Removes old job run records based on retention policy';
