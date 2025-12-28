-- Multi-Tenant Architecture Migration
-- Phase 5 Action 3: Multi-Tenant Architecture

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TENANTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    isolation VARCHAR(50) NOT NULL DEFAULT 'SHARED',
    plan JSONB NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    branding JSONB,
    organization_id UUID,
    parent_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    suspended_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_organization_id ON tenants(organization_id);
CREATE INDEX idx_tenants_parent_tenant_id ON tenants(parent_tenant_id);

-- ============================================================================
-- TENANT DOMAINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(255) NOT NULL,
    ssl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ssl_certificate TEXT,
    ssl_private_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);
CREATE INDEX idx_tenant_domains_domain ON tenant_domains(domain);
CREATE INDEX idx_tenant_domains_verified ON tenant_domains(verified);

-- ============================================================================
-- TENANT BRANDING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_branding (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    primary_color VARCHAR(7) NOT NULL,
    secondary_color VARCHAR(7) NOT NULL,
    accent_color VARCHAR(7) NOT NULL,
    logo_url TEXT,
    favicon_url TEXT,
    custom_domain VARCHAR(255),
    company_name VARCHAR(255) NOT NULL,
    custom_css TEXT,
    email_templates JSONB,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TENANT QUOTAS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_quotas (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    max_workflows INTEGER NOT NULL,
    max_executions INTEGER NOT NULL,
    max_users INTEGER NOT NULL,
    max_storage BIGINT NOT NULL,
    max_api_calls INTEGER NOT NULL,
    max_webhooks INTEGER NOT NULL,
    max_concurrent_executions INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TENANT USAGE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_usage (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, resource)
);

CREATE INDEX idx_tenant_usage_tenant_id ON tenant_usage(tenant_id);
CREATE INDEX idx_tenant_usage_resource ON tenant_usage(resource);

-- ============================================================================
-- TENANT SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    billing_period VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    trial_end TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_status ON tenant_subscriptions(status);

-- ============================================================================
-- TENANT INVOICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(50) NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    items JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_invoices_tenant_id ON tenant_invoices(tenant_id);
CREATE INDEX idx_tenant_invoices_status ON tenant_invoices(status);
CREATE INDEX idx_tenant_invoices_due_date ON tenant_invoices(due_date);

-- ============================================================================
-- TENANT SSO CONFIGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_sso_configs (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TENANT BACKUPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    location TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenant_backups_tenant_id ON tenant_backups(tenant_id);
CREATE INDEX idx_tenant_backups_status ON tenant_backups(status);
CREATE INDEX idx_tenant_backups_created_at ON tenant_backups(created_at);

-- ============================================================================
-- MIGRATION JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    to_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    resource_ids TEXT[] DEFAULT '{}',
    status VARCHAR(50) NOT NULL,
    progress NUMERIC(5, 2) NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_migration_jobs_from_tenant ON migration_jobs(from_tenant_id);
CREATE INDEX idx_migration_jobs_to_tenant ON migration_jobs(to_tenant_id);
CREATE INDEX idx_migration_jobs_status ON migration_jobs(status);

-- ============================================================================
-- TENANT METRICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_metrics_tenant_id ON tenant_metrics(tenant_id);
CREATE INDEX idx_tenant_metrics_metric ON tenant_metrics(metric);
CREATE INDEX idx_tenant_metrics_timestamp ON tenant_metrics(timestamp);

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- ============================================================================
-- QUOTA OVERAGE EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS quota_overage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL,
    current_usage BIGINT NOT NULL,
    quota_limit BIGINT NOT NULL,
    overage_amount BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quota_overage_tenant_id ON quota_overage_events(tenant_id);
CREATE INDEX idx_quota_overage_resource ON quota_overage_events(resource);
CREATE INDEX idx_quota_overage_timestamp ON quota_overage_events(timestamp);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Set tenant context for RLS
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID, user_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', tenant_id::TEXT, FALSE);
    IF user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user_id', user_id::TEXT, FALSE);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Increment quota usage
CREATE OR REPLACE FUNCTION increment_quota_usage(
    p_tenant_id UUID,
    p_resource VARCHAR(50),
    p_amount BIGINT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO tenant_usage (tenant_id, resource, count, updated_at)
    VALUES (p_tenant_id, p_resource, p_amount, NOW())
    ON CONFLICT (tenant_id, resource)
    DO UPDATE SET
        count = tenant_usage.count + p_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update tenant updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_overage_events ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON tenants
    USING (
        id = COALESCE(current_setting('app.current_tenant_id', TRUE)::UUID, id)
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_domains_isolation ON tenant_domains
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_branding_isolation ON tenant_branding
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_quotas_isolation ON tenant_quotas
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_usage_isolation ON tenant_usage
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_subscriptions_isolation ON tenant_subscriptions
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_invoices_isolation ON tenant_invoices
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_sso_configs_isolation ON tenant_sso_configs
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_backups_isolation ON tenant_backups
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY migration_jobs_isolation ON migration_jobs
    USING (
        from_tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR to_tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY tenant_metrics_isolation ON tenant_metrics
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY audit_logs_isolation ON audit_logs
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

CREATE POLICY quota_overage_events_isolation ON quota_overage_events
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.is_super_admin', TRUE)::BOOLEAN = TRUE
    );

-- ============================================================================
-- SAMPLE DATA (Optional - for development)
-- ============================================================================

-- Insert a default tenant for development
-- INSERT INTO tenants (id, name, slug, status, isolation, plan, settings)
-- VALUES (
--     uuid_generate_v4(),
--     'Default Tenant',
--     'default',
--     'ACTIVE',
--     'SHARED',
--     '{"type": "FREE", "name": "Free Plan", "quotas": {"maxWorkflows": 5, "maxExecutions": 1000, "maxUsers": 2, "maxStorage": 104857600, "maxApiCalls": 10000, "maxWebhooks": 5, "maxConcurrentExecutions": 1}, "features": ["workflows", "executions", "webhooks"]}'::JSONB,
--     '{"timezone": "UTC", "locale": "en", "dateFormat": "YYYY-MM-DD", "timeFormat": "HH:mm:ss", "allowSignup": false, "requireEmailVerification": true, "sessionTimeout": 3600, "mfa": {"enabled": false, "required": false}, "webhookRetryPolicy": {"maxRetries": 3, "retryDelay": 1000}}'::JSONB
-- );
