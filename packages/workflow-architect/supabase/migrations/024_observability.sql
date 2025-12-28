-- ============================================================================
-- Observability Schema
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================================================
-- Traces Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS traces (
    trace_id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    root_span_id TEXT,
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    duration BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes
    CONSTRAINT traces_valid_times CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX idx_traces_service_name ON traces(service_name);
CREATE INDEX idx_traces_start_time ON traces(start_time DESC);
CREATE INDEX idx_traces_duration ON traces(duration DESC) WHERE duration IS NOT NULL;

-- ============================================================================
-- Spans Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS spans (
    span_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
    parent_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('internal', 'server', 'client', 'producer', 'consumer')),
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    duration BIGINT,
    status TEXT NOT NULL CHECK (status IN ('unset', 'ok', 'error')),
    attributes JSONB DEFAULT '{}'::jsonb,
    events JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT spans_valid_times CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX idx_spans_trace_id ON spans(trace_id);
CREATE INDEX idx_spans_parent_id ON spans(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_spans_name ON spans(name);
CREATE INDEX idx_spans_status ON spans(status);
CREATE INDEX idx_spans_start_time ON spans(start_time DESC);
CREATE INDEX idx_spans_duration ON spans(duration DESC) WHERE duration IS NOT NULL;
CREATE INDEX idx_spans_attributes ON spans USING gin(attributes);

-- ============================================================================
-- Metrics Table (Time-Series Optimized)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('counter', 'gauge', 'histogram', 'summary')),
    value DOUBLE PRECISION NOT NULL,
    labels JSONB DEFAULT '{}'::jsonb,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by time for better performance
CREATE INDEX idx_metrics_name ON metrics(name);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX idx_metrics_labels ON metrics USING gin(labels);
CREATE INDEX idx_metrics_name_timestamp ON metrics(name, timestamp DESC);

-- ============================================================================
-- Logs Table (Partitioned)
-- ============================================================================

CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    message TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    trace_id TEXT,
    span_id TEXT,
    service_name TEXT NOT NULL,
    error_name TEXT,
    error_message TEXT,
    error_stack TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_service_name ON logs(service_name);
CREATE INDEX idx_logs_trace_id ON logs(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_logs_span_id ON logs(span_id) WHERE span_id IS NOT NULL;
CREATE INDEX idx_logs_message_trgm ON logs USING gin(message gin_trgm_ops);
CREATE INDEX idx_logs_context ON logs USING gin(context);

-- ============================================================================
-- SLOs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS slos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sli_type TEXT NOT NULL CHECK (sli_type IN ('availability', 'latency', 'error_rate', 'throughput')),
    sli_query TEXT NOT NULL,
    sli_threshold DOUBLE PRECISION,
    sli_aggregation TEXT CHECK (sli_aggregation IN ('avg', 'p50', 'p95', 'p99')),
    target DOUBLE PRECISION NOT NULL CHECK (target >= 0 AND target <= 100),
    window TEXT NOT NULL CHECK (window IN ('1h', '6h', '24h', '7d', '30d')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slos_name ON slos(name);
CREATE INDEX idx_slos_sli_type ON slos(sli_type);

-- ============================================================================
-- Alert Rules Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    conditions JSONB NOT NULL,
    combinator TEXT NOT NULL CHECK (combinator IN ('and', 'or')),
    enabled BOOLEAN DEFAULT true,
    notifications JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_name ON alert_rules(name);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX idx_alert_rules_severity ON alert_rules(severity);

-- ============================================================================
-- Alerts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('firing', 'resolved')),
    fired_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    labels JSONB DEFAULT '{}'::jsonb,
    annotations JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT alerts_resolved_after_fired CHECK (resolved_at IS NULL OR resolved_at >= fired_at)
);

CREATE INDEX idx_alerts_rule_id ON alerts(rule_id);
CREATE INDEX idx_alerts_state ON alerts(state);
CREATE INDEX idx_alerts_fired_at ON alerts(fired_at DESC);
CREATE INDEX idx_alerts_severity ON alerts(severity);

-- ============================================================================
-- Anomalies Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomalies (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('spike', 'drop', 'trend', 'seasonal')),
    metric TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    actual_value DOUBLE PRECISION NOT NULL,
    expected_value DOUBLE PRECISION NOT NULL,
    deviation DOUBLE PRECISION NOT NULL,
    severity DOUBLE PRECISION NOT NULL CHECK (severity >= 0 AND severity <= 1),
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_metric ON anomalies(metric);
CREATE INDEX idx_anomalies_timestamp ON anomalies(timestamp DESC);
CREATE INDEX idx_anomalies_type ON anomalies(type);
CREATE INDEX idx_anomalies_severity ON anomalies(severity DESC);

-- ============================================================================
-- Dashboards Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    widgets JSONB NOT NULL,
    refresh TEXT,
    time_range JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dashboards_name ON dashboards(name);
CREATE INDEX idx_dashboards_tags ON dashboards USING gin(tags);

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE slos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for authenticated users)
-- In production, you would want more granular policies

CREATE POLICY traces_select_policy ON traces FOR SELECT USING (true);
CREATE POLICY traces_insert_policy ON traces FOR INSERT WITH CHECK (true);
CREATE POLICY traces_update_policy ON traces FOR UPDATE USING (true);
CREATE POLICY traces_delete_policy ON traces FOR DELETE USING (true);

CREATE POLICY spans_select_policy ON spans FOR SELECT USING (true);
CREATE POLICY spans_insert_policy ON spans FOR INSERT WITH CHECK (true);
CREATE POLICY spans_update_policy ON spans FOR UPDATE USING (true);
CREATE POLICY spans_delete_policy ON spans FOR DELETE USING (true);

CREATE POLICY metrics_select_policy ON metrics FOR SELECT USING (true);
CREATE POLICY metrics_insert_policy ON metrics FOR INSERT WITH CHECK (true);
CREATE POLICY metrics_update_policy ON metrics FOR UPDATE USING (true);
CREATE POLICY metrics_delete_policy ON metrics FOR DELETE USING (true);

CREATE POLICY logs_select_policy ON logs FOR SELECT USING (true);
CREATE POLICY logs_insert_policy ON logs FOR INSERT WITH CHECK (true);
CREATE POLICY logs_update_policy ON logs FOR UPDATE USING (true);
CREATE POLICY logs_delete_policy ON logs FOR DELETE USING (true);

CREATE POLICY slos_select_policy ON slos FOR SELECT USING (true);
CREATE POLICY slos_insert_policy ON slos FOR INSERT WITH CHECK (true);
CREATE POLICY slos_update_policy ON slos FOR UPDATE USING (true);
CREATE POLICY slos_delete_policy ON slos FOR DELETE USING (true);

CREATE POLICY alert_rules_select_policy ON alert_rules FOR SELECT USING (true);
CREATE POLICY alert_rules_insert_policy ON alert_rules FOR INSERT WITH CHECK (true);
CREATE POLICY alert_rules_update_policy ON alert_rules FOR UPDATE USING (true);
CREATE POLICY alert_rules_delete_policy ON alert_rules FOR DELETE USING (true);

CREATE POLICY alerts_select_policy ON alerts FOR SELECT USING (true);
CREATE POLICY alerts_insert_policy ON alerts FOR INSERT WITH CHECK (true);
CREATE POLICY alerts_update_policy ON alerts FOR UPDATE USING (true);
CREATE POLICY alerts_delete_policy ON alerts FOR DELETE USING (true);

CREATE POLICY anomalies_select_policy ON anomalies FOR SELECT USING (true);
CREATE POLICY anomalies_insert_policy ON anomalies FOR INSERT WITH CHECK (true);
CREATE POLICY anomalies_update_policy ON anomalies FOR UPDATE USING (true);
CREATE POLICY anomalies_delete_policy ON anomalies FOR DELETE USING (true);

CREATE POLICY dashboards_select_policy ON dashboards FOR SELECT USING (true);
CREATE POLICY dashboards_insert_policy ON dashboards FOR INSERT WITH CHECK (true);
CREATE POLICY dashboards_update_policy ON dashboards FOR UPDATE USING (true);
CREATE POLICY dashboards_delete_policy ON dashboards FOR DELETE USING (true);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_slos_updated_at
    BEFORE UPDATE ON slos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboards_updated_at
    BEFORE UPDATE ON dashboards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Views
-- ============================================================================

-- View for trace overview
CREATE OR REPLACE VIEW trace_overview AS
SELECT
    t.trace_id,
    t.service_name,
    t.start_time,
    t.end_time,
    t.duration,
    COUNT(s.span_id) as span_count,
    SUM(CASE WHEN s.status = 'error' THEN 1 ELSE 0 END) as error_count
FROM traces t
LEFT JOIN spans s ON t.trace_id = s.trace_id
GROUP BY t.trace_id, t.service_name, t.start_time, t.end_time, t.duration;

-- View for error logs
CREATE OR REPLACE VIEW error_logs AS
SELECT
    id,
    timestamp,
    level,
    message,
    trace_id,
    span_id,
    service_name,
    error_name,
    error_message,
    created_at
FROM logs
WHERE level IN ('error', 'fatal');

-- View for active alerts
CREATE OR REPLACE VIEW active_alerts AS
SELECT
    a.id,
    a.rule_id,
    a.rule_name,
    a.severity,
    a.message,
    a.fired_at,
    a.labels,
    ar.notifications
FROM alerts a
JOIN alert_rules ar ON a.rule_id = ar.id
WHERE a.state = 'firing';

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE traces IS 'Distributed traces for request tracking';
COMMENT ON TABLE spans IS 'Individual spans within traces';
COMMENT ON TABLE metrics IS 'Time-series metrics data';
COMMENT ON TABLE logs IS 'Structured application logs';
COMMENT ON TABLE slos IS 'Service Level Objectives definitions';
COMMENT ON TABLE alert_rules IS 'Alert rule configurations';
COMMENT ON TABLE alerts IS 'Active and historical alerts';
COMMENT ON TABLE anomalies IS 'Detected anomalies in metrics';
COMMENT ON TABLE dashboards IS 'Dashboard configurations';
