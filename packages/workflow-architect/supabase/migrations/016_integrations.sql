-- Migration: Integration Hub Tables
-- Description: Tables for managing integrations, credentials, health checks, and webhooks
-- Author: Workflow Architect
-- Date: 2025-12-28

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- INTEGRATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) DEFAULT '1.0.0',
    author VARCHAR(255),
    homepage TEXT,
    documentation TEXT,
    icon TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Configuration
    connector_type VARCHAR(50) NOT NULL,
    connector_config JSONB NOT NULL,
    auth_type VARCHAR(50),
    auth_config JSONB,
    rate_limits JSONB,
    caching JSONB,
    health_check JSONB,

    -- Status
    status VARCHAR(50) DEFAULT 'disconnected',
    error_message TEXT,
    last_connected_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes
    CONSTRAINT integrations_status_check CHECK (status IN ('connected', 'disconnected', 'error', 'pending', 'configuring'))
);

-- Create indexes for integrations
CREATE INDEX idx_integrations_user_id ON integrations(user_id);
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_integrations_connector_type ON integrations(connector_type);
CREATE INDEX idx_integrations_tags ON integrations USING GIN(tags);
CREATE INDEX idx_integrations_created_at ON integrations(created_at DESC);

-- =============================================
-- INTEGRATION CREDENTIALS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS integration_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

    -- Encrypted credentials
    credentials JSONB NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: one credential set per integration
    CONSTRAINT unique_integration_credentials UNIQUE(integration_id)
);

-- Create indexes for credentials
CREATE INDEX idx_integration_credentials_integration_id ON integration_credentials(integration_id);

-- =============================================
-- INTEGRATION KEY ROTATION HISTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS integration_key_rotation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

    -- Rotation data
    old_key_hash VARCHAR(255) NOT NULL,
    rotated_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Metadata
    reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for key rotation history
CREATE INDEX idx_key_rotation_integration_id ON integration_key_rotation_history(integration_id);
CREATE INDEX idx_key_rotation_rotated_at ON integration_key_rotation_history(rotated_at DESC);

-- =============================================
-- INTEGRATION HEALTH TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS integration_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

    -- Health check data
    status VARCHAR(50) NOT NULL,
    last_checked TIMESTAMPTZ NOT NULL,
    response_time INTEGER,
    error_message TEXT,
    details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT integration_health_status_check CHECK (status IN ('healthy', 'unhealthy', 'degraded'))
);

-- Create indexes for health checks
CREATE INDEX idx_integration_health_integration_id ON integration_health(integration_id);
CREATE INDEX idx_integration_health_last_checked ON integration_health(last_checked DESC);
CREATE INDEX idx_integration_health_status ON integration_health(status);

-- =============================================
-- WEBHOOK SUBSCRIPTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

    -- Subscription details
    events TEXT[] NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    active BOOLEAN DEFAULT true,

    -- Metadata
    description TEXT,
    headers JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for webhook subscriptions
CREATE INDEX idx_webhook_subscriptions_integration_id ON webhook_subscriptions(integration_id);
CREATE INDEX idx_webhook_subscriptions_active ON webhook_subscriptions(active);
CREATE INDEX idx_webhook_subscriptions_events ON webhook_subscriptions USING GIN(events);

-- =============================================
-- WEBHOOK DELIVERIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,

    -- Delivery details
    event VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    payload JSONB,

    -- Response
    response_status INTEGER,
    response_body TEXT,
    response_time INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('success', 'error', 'pending', 'retrying'))
);

-- Create indexes for webhook deliveries
CREATE INDEX idx_webhook_deliveries_subscription_id ON webhook_deliveries(subscription_id);
CREATE INDEX idx_webhook_deliveries_timestamp ON webhook_deliveries(timestamp DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_key_rotation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Integrations policies
CREATE POLICY "Users can view their own integrations"
    ON integrations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own integrations"
    ON integrations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations"
    ON integrations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations"
    ON integrations FOR DELETE
    USING (auth.uid() = user_id);

-- Integration credentials policies
CREATE POLICY "Users can view their own integration credentials"
    ON integration_credentials FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_credentials.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create their own integration credentials"
    ON integration_credentials FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_credentials.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own integration credentials"
    ON integration_credentials FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_credentials.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own integration credentials"
    ON integration_credentials FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_credentials.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

-- Key rotation history policies
CREATE POLICY "Users can view their own key rotation history"
    ON integration_key_rotation_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_key_rotation_history.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

-- Health check policies
CREATE POLICY "Users can view their own integration health"
    ON integration_health FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = integration_health.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

-- Webhook subscription policies
CREATE POLICY "Users can view their own webhook subscriptions"
    ON webhook_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = webhook_subscriptions.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create their own webhook subscriptions"
    ON webhook_subscriptions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = webhook_subscriptions.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own webhook subscriptions"
    ON webhook_subscriptions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = webhook_subscriptions.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own webhook subscriptions"
    ON webhook_subscriptions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM integrations
            WHERE integrations.id = webhook_subscriptions.integration_id
            AND integrations.user_id = auth.uid()
        )
    );

-- Webhook delivery policies
CREATE POLICY "Users can view their own webhook deliveries"
    ON webhook_deliveries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM webhook_subscriptions
            JOIN integrations ON integrations.id = webhook_subscriptions.integration_id
            WHERE webhook_subscriptions.id = webhook_deliveries.subscription_id
            AND integrations.user_id = auth.uid()
        )
    );

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_credentials_updated_at
    BEFORE UPDATE ON integration_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup old health check records (keep last 1000 per integration)
CREATE OR REPLACE FUNCTION cleanup_old_health_checks()
RETURNS void AS $$
BEGIN
    DELETE FROM integration_health
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY integration_id ORDER BY last_checked DESC) as row_num
            FROM integration_health
        ) t
        WHERE row_num > 1000
    );
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old webhook deliveries (keep last 10000 per subscription)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_deliveries()
RETURNS void AS $$
BEGIN
    DELETE FROM webhook_deliveries
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY subscription_id ORDER BY timestamp DESC) as row_num
            FROM webhook_deliveries
        ) t
        WHERE row_num > 10000
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- VIEWS
-- =============================================

-- View for integration statistics
CREATE OR REPLACE VIEW integration_statistics AS
SELECT
    i.id,
    i.name,
    i.status,
    COUNT(DISTINCT wh.id) as webhook_count,
    COUNT(DISTINCT h.id) as health_check_count,
    MAX(h.last_checked) as last_health_check,
    AVG(CASE WHEN h.status = 'healthy' THEN 1 ELSE 0 END) * 100 as health_percentage
FROM integrations i
LEFT JOIN webhook_subscriptions wh ON wh.integration_id = i.id
LEFT JOIN integration_health h ON h.integration_id = i.id
GROUP BY i.id, i.name, i.status;

-- View for webhook delivery statistics
CREATE OR REPLACE VIEW webhook_delivery_statistics AS
SELECT
    ws.id,
    ws.url,
    COUNT(wd.id) as total_deliveries,
    COUNT(CASE WHEN wd.status = 'success' THEN 1 END) as successful_deliveries,
    COUNT(CASE WHEN wd.status = 'error' THEN 1 END) as failed_deliveries,
    AVG(wd.response_time) as avg_response_time,
    MAX(wd.timestamp) as last_delivery
FROM webhook_subscriptions ws
LEFT JOIN webhook_deliveries wd ON wd.subscription_id = ws.id
GROUP BY ws.id, ws.url;

-- =============================================
-- GRANTS
-- =============================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON integration_credentials TO authenticated;
GRANT SELECT ON integration_key_rotation_history TO authenticated;
GRANT SELECT ON integration_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions TO authenticated;
GRANT SELECT ON webhook_deliveries TO authenticated;

-- Grant access to views
GRANT SELECT ON integration_statistics TO authenticated;
GRANT SELECT ON webhook_delivery_statistics TO authenticated;

-- Grant sequence usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE integrations IS 'Stores integration configurations and metadata';
COMMENT ON TABLE integration_credentials IS 'Stores encrypted credentials for integrations';
COMMENT ON TABLE integration_key_rotation_history IS 'Tracks API key rotation history';
COMMENT ON TABLE integration_health IS 'Stores health check results for integrations';
COMMENT ON TABLE webhook_subscriptions IS 'Manages webhook subscriptions for integrations';
COMMENT ON TABLE webhook_deliveries IS 'Logs webhook delivery attempts and results';

COMMENT ON VIEW integration_statistics IS 'Provides aggregated statistics for each integration';
COMMENT ON VIEW webhook_delivery_statistics IS 'Provides delivery statistics for webhook subscriptions';
