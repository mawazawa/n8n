-- API Gateway Tables
-- Manages routes, backends, policies, and rate limits for the API gateway

-- =====================================================
-- BACKENDS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_backends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 100),
    max_connections INTEGER,
    timeout INTEGER NOT NULL DEFAULT 30000,

    -- Health check configuration
    health_check_enabled BOOLEAN NOT NULL DEFAULT true,
    health_check_interval INTEGER DEFAULT 30000,
    health_check_timeout INTEGER DEFAULT 5000,
    health_check_healthy_threshold INTEGER DEFAULT 2,
    health_check_unhealthy_threshold INTEGER DEFAULT 3,
    health_check_path TEXT,
    health_check_expected_status INTEGER DEFAULT 200,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Constraints
    UNIQUE(name)
);

-- Index for lookups
CREATE INDEX idx_gateway_backends_name ON gateway_backends(name);
CREATE INDEX idx_gateway_backends_created_at ON gateway_backends(created_at DESC);

-- =====================================================
-- ROUTES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')),

    -- Load balancing
    load_balance_strategy TEXT NOT NULL DEFAULT 'round-robin'
        CHECK (load_balance_strategy IN ('round-robin', 'least-connections', 'random', 'weighted', 'ip-hash')),

    -- Route configuration
    backends UUID[] NOT NULL DEFAULT '{}',
    policies UUID[] DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Constraints
    UNIQUE(path, method)
);

-- Indexes for lookups
CREATE INDEX idx_gateway_routes_path ON gateway_routes(path);
CREATE INDEX idx_gateway_routes_method ON gateway_routes(method);
CREATE INDEX idx_gateway_routes_enabled ON gateway_routes(enabled);
CREATE INDEX idx_gateway_routes_priority ON gateway_routes(priority DESC);
CREATE INDEX idx_gateway_routes_created_at ON gateway_routes(created_at DESC);

-- =====================================================
-- POLICIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('auth', 'rate-limit', 'cors', 'cache', 'transform', 'circuit-breaker', 'compression')),

    -- Policy configuration (JSON)
    config JSONB NOT NULL DEFAULT '{}',

    -- Conditions
    condition_paths TEXT[],
    condition_methods TEXT[],
    condition_headers JSONB,

    -- Status
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Constraints
    UNIQUE(name)
);

-- Indexes for lookups
CREATE INDEX idx_gateway_policies_name ON gateway_policies(name);
CREATE INDEX idx_gateway_policies_type ON gateway_policies(type);
CREATE INDEX idx_gateway_policies_enabled ON gateway_policies(enabled);
CREATE INDEX idx_gateway_policies_created_at ON gateway_policies(created_at DESC);

-- =====================================================
-- RATE LIMITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES gateway_routes(id) ON DELETE CASCADE,

    -- Rate limit configuration
    window_ms INTEGER NOT NULL DEFAULT 60000,
    max_requests INTEGER NOT NULL DEFAULT 100,
    key_generator TEXT NOT NULL DEFAULT 'ip' CHECK (key_generator IN ('ip', 'user', 'api-key', 'custom')),

    -- Advanced options
    skip_successful_requests BOOLEAN DEFAULT false,
    skip_failed_requests BOOLEAN DEFAULT false,
    burst_size INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(route_id)
);

-- Index for lookups
CREATE INDEX idx_gateway_rate_limits_route_id ON gateway_rate_limits(route_id);

-- =====================================================
-- GATEWAY METRICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Time bucket (for aggregation)
    time_bucket TIMESTAMPTZ NOT NULL,

    -- Route/backend identifiers
    route_id UUID REFERENCES gateway_routes(id) ON DELETE CASCADE,
    backend_id UUID REFERENCES gateway_backends(id) ON DELETE CASCADE,

    -- Request metrics
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,

    -- Latency metrics (in milliseconds)
    latency_p50 NUMERIC,
    latency_p95 NUMERIC,
    latency_p99 NUMERIC,
    latency_mean NUMERIC,

    -- Cache metrics
    cache_hits INTEGER DEFAULT 0,
    cache_misses INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(time_bucket, route_id, backend_id)
);

-- Indexes for time-series queries
CREATE INDEX idx_gateway_metrics_time_bucket ON gateway_metrics(time_bucket DESC);
CREATE INDEX idx_gateway_metrics_route_id ON gateway_metrics(route_id, time_bucket DESC);
CREATE INDEX idx_gateway_metrics_backend_id ON gateway_metrics(backend_id, time_bucket DESC);

-- =====================================================
-- GATEWAY LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request information
    request_id TEXT NOT NULL,
    route_id UUID REFERENCES gateway_routes(id) ON DELETE SET NULL,
    backend_id UUID REFERENCES gateway_backends(id) ON DELETE SET NULL,

    -- HTTP details
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,

    -- Timing
    duration_ms INTEGER,
    backend_latency_ms INTEGER,

    -- Client information
    ip_address INET,
    user_agent TEXT,
    user_id UUID REFERENCES auth.users(id),

    -- Error information
    error_message TEXT,
    error_stack TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes inline for performance
    -- (separate indexes created below)
    CONSTRAINT gateway_logs_request_id_key UNIQUE(request_id)
);

-- Indexes for log queries
CREATE INDEX idx_gateway_logs_created_at ON gateway_logs(created_at DESC);
CREATE INDEX idx_gateway_logs_route_id ON gateway_logs(route_id, created_at DESC);
CREATE INDEX idx_gateway_logs_status_code ON gateway_logs(status_code);
CREATE INDEX idx_gateway_logs_user_id ON gateway_logs(user_id, created_at DESC);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Backends: Admin only
ALTER TABLE gateway_backends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_backends_admin_all"
    ON gateway_backends
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Routes: Admin only
ALTER TABLE gateway_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_routes_admin_all"
    ON gateway_routes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Policies: Admin only
ALTER TABLE gateway_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_policies_admin_all"
    ON gateway_policies
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Rate Limits: Admin only
ALTER TABLE gateway_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_rate_limits_admin_all"
    ON gateway_rate_limits
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Metrics: Admin read-only
ALTER TABLE gateway_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_metrics_admin_read"
    ON gateway_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Logs: Admin read, users can see their own
ALTER TABLE gateway_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_logs_admin_read"
    ON gateway_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "gateway_logs_user_own"
    ON gateway_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gateway_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER gateway_backends_updated_at
    BEFORE UPDATE ON gateway_backends
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER gateway_routes_updated_at
    BEFORE UPDATE ON gateway_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER gateway_policies_updated_at
    BEFORE UPDATE ON gateway_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER gateway_rate_limits_updated_at
    BEFORE UPDATE ON gateway_rate_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_updated_at();

-- =====================================================
-- SAMPLE DATA (Optional)
-- =====================================================

-- Insert a sample backend
INSERT INTO gateway_backends (name, url, weight, health_check_path)
VALUES ('primary-backend', 'http://localhost:5678', 1, '/health')
ON CONFLICT (name) DO NOTHING;

-- Insert a sample CORS policy
INSERT INTO gateway_policies (name, type, config, enabled)
VALUES (
    'default-cors',
    'cors',
    '{"origin": true, "credentials": false, "preflightContinue": false}',
    true
)
ON CONFLICT (name) DO NOTHING;

-- Insert a sample rate limit policy
INSERT INTO gateway_policies (name, type, config, enabled)
VALUES (
    'default-rate-limit',
    'rate-limit',
    '{"windowMs": 60000, "maxRequests": 100, "keyGenerator": "ip"}',
    true
)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE gateway_backends IS 'Backend services for the API gateway';
COMMENT ON TABLE gateway_routes IS 'Route configurations for the API gateway';
COMMENT ON TABLE gateway_policies IS 'Policy definitions for gateway features';
COMMENT ON TABLE gateway_rate_limits IS 'Rate limiting configurations per route';
COMMENT ON TABLE gateway_metrics IS 'Time-series metrics for gateway performance';
COMMENT ON TABLE gateway_logs IS 'Request logs for the API gateway';
