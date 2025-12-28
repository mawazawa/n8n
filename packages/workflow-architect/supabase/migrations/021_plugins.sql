-- Plugin & Extension System Tables
-- Migration: 021_plugins
-- Description: Create tables for plugin management, marketplace, and permissions

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PLUGINS TABLE
-- ============================================================================
-- Stores installed plugin information
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    manifest JSONB NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    state TEXT NOT NULL DEFAULT 'installed' CHECK (state IN ('installed', 'active', 'disabled', 'error', 'updating', 'uninstalling')),
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for plugins
CREATE INDEX IF NOT EXISTS idx_plugins_state ON plugins(state);
CREATE INDEX IF NOT EXISTS idx_plugins_installed_at ON plugins(installed_at);
CREATE INDEX IF NOT EXISTS idx_plugins_manifest ON plugins USING gin(manifest);

-- Add comments
COMMENT ON TABLE plugins IS 'Stores installed plugin information and state';
COMMENT ON COLUMN plugins.id IS 'Unique plugin identifier';
COMMENT ON COLUMN plugins.manifest IS 'Plugin manifest with metadata, permissions, and dependencies';
COMMENT ON COLUMN plugins.config IS 'User-configurable plugin settings';
COMMENT ON COLUMN plugins.state IS 'Current plugin state';

-- ============================================================================
-- PLUGIN VERSIONS TABLE
-- ============================================================================
-- Stores available plugin versions
CREATE TABLE IF NOT EXISTS plugin_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id TEXT NOT NULL,
    version TEXT NOT NULL,
    release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changelog TEXT,
    download_url TEXT NOT NULL,
    checksum TEXT NOT NULL,
    downloads INTEGER NOT NULL DEFAULT 0,
    deprecated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plugin_id, version)
);

-- Create indexes for plugin_versions
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_release_date ON plugin_versions(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_deprecated ON plugin_versions(deprecated) WHERE NOT deprecated;

-- Add comments
COMMENT ON TABLE plugin_versions IS 'Stores available versions for each plugin';
COMMENT ON COLUMN plugin_versions.plugin_id IS 'Reference to plugin id';
COMMENT ON COLUMN plugin_versions.checksum IS 'SHA-256 checksum for security verification';

-- ============================================================================
-- PLUGIN INSTALLATIONS TABLE
-- ============================================================================
-- Tracks plugin installations and usage
CREATE TABLE IF NOT EXISTS plugin_installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id TEXT NOT NULL,
    version TEXT NOT NULL,
    installed_by TEXT,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uninstalled_at TIMESTAMPTZ,
    workspace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for plugin_installations
CREATE INDEX IF NOT EXISTS idx_plugin_installations_plugin_id ON plugin_installations(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_installed_by ON plugin_installations(installed_by);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_workspace_id ON plugin_installations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_active ON plugin_installations(plugin_id, installed_at) WHERE uninstalled_at IS NULL;

-- Add comments
COMMENT ON TABLE plugin_installations IS 'Tracks plugin installation history and usage';

-- ============================================================================
-- PLUGIN PERMISSIONS TABLE
-- ============================================================================
-- Manages plugin permissions and access control
CREATE TABLE IF NOT EXISTS plugin_permissions (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    permission TEXT NOT NULL CHECK (permission IN ('NETWORK', 'STORAGE', 'WORKFLOWS', 'CREDENTIALS', 'EXECUTIONS', 'USERS', 'ADMIN')),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    denied_at TIMESTAMPTZ,
    user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plugin_id, permission)
);

-- Create indexes for plugin_permissions
CREATE INDEX IF NOT EXISTS idx_plugin_permissions_plugin_id ON plugin_permissions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_permissions_status ON plugin_permissions(status);
CREATE INDEX IF NOT EXISTS idx_plugin_permissions_user_id ON plugin_permissions(user_id);

-- Add comments
COMMENT ON TABLE plugin_permissions IS 'Manages plugin permission requests and approvals';
COMMENT ON COLUMN plugin_permissions.permission IS 'Type of permission requested';
COMMENT ON COLUMN plugin_permissions.status IS 'Current status of permission request';

-- ============================================================================
-- MARKETPLACE PLUGINS TABLE
-- ============================================================================
-- Stores plugin listings in the marketplace
CREATE TABLE IF NOT EXISTS marketplace_plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    version TEXT NOT NULL,
    author JSONB NOT NULL,
    icon TEXT,
    screenshots TEXT[] DEFAULT ARRAY[]::TEXT[],
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    rating DECIMAL(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
    rating_count INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    featured BOOLEAN DEFAULT FALSE,
    readme TEXT,
    changelog TEXT,
    dependencies JSONB DEFAULT '[]'::jsonb,
    permissions JSONB DEFAULT '[]'::jsonb,
    support_email TEXT,
    support_url TEXT,
    issues_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for marketplace_plugins
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_name ON marketplace_plugins(name);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_tags ON marketplace_plugins USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_rating ON marketplace_plugins(rating DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_downloads ON marketplace_plugins(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_verified ON marketplace_plugins(verified) WHERE verified;
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_featured ON marketplace_plugins(featured) WHERE featured;
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_updated_at ON marketplace_plugins(updated_at DESC);

-- Add full-text search index
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_search ON marketplace_plugins USING gin(to_tsvector('english', name || ' ' || description));

-- Add comments
COMMENT ON TABLE marketplace_plugins IS 'Plugin marketplace listings';
COMMENT ON COLUMN marketplace_plugins.verified IS 'Whether plugin is verified by n8n team';
COMMENT ON COLUMN marketplace_plugins.featured IS 'Whether plugin is featured in marketplace';

-- ============================================================================
-- PLUGIN REVIEWS TABLE
-- ============================================================================
-- Stores user reviews and ratings for plugins
CREATE TABLE IF NOT EXISTS plugin_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    version TEXT NOT NULL,
    helpful INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plugin_id, user_id)
);

-- Create indexes for plugin_reviews
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin_id ON plugin_reviews(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_user_id ON plugin_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_rating ON plugin_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_created_at ON plugin_reviews(created_at DESC);

-- Add comments
COMMENT ON TABLE plugin_reviews IS 'User reviews and ratings for marketplace plugins';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to increment plugin downloads
CREATE OR REPLACE FUNCTION increment_plugin_downloads(plugin_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE marketplace_plugins
    SET downloads = downloads + 1
    WHERE id = plugin_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update plugin rating
CREATE OR REPLACE FUNCTION update_plugin_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE marketplace_plugins
    SET
        rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM plugin_reviews WHERE plugin_id = NEW.plugin_id),
        rating_count = (SELECT COUNT(*) FROM plugin_reviews WHERE plugin_id = NEW.plugin_id)
    WHERE id = NEW.plugin_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update plugin rating
DROP TRIGGER IF EXISTS trigger_update_plugin_rating ON plugin_reviews;
CREATE TRIGGER trigger_update_plugin_rating
    AFTER INSERT OR UPDATE OR DELETE ON plugin_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_plugin_rating();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_plugins_updated_at ON plugins;
CREATE TRIGGER trigger_plugins_updated_at
    BEFORE UPDATE ON plugins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_marketplace_plugins_updated_at ON marketplace_plugins;
CREATE TRIGGER trigger_marketplace_plugins_updated_at
    BEFORE UPDATE ON marketplace_plugins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_reviews ENABLE ROW LEVEL SECURITY;

-- Policies for plugins (authenticated users can read, service role can manage)
CREATE POLICY "Users can view plugins" ON plugins
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage plugins" ON plugins
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for marketplace_plugins (public read, service role write)
CREATE POLICY "Anyone can view marketplace plugins" ON marketplace_plugins
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage marketplace plugins" ON marketplace_plugins
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for plugin_reviews (users can manage their own reviews)
CREATE POLICY "Anyone can view reviews" ON plugin_reviews
    FOR SELECT USING (true);

CREATE POLICY "Users can create reviews" ON plugin_reviews
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own reviews" ON plugin_reviews
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own reviews" ON plugin_reviews
    FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================================================
-- SAMPLE DATA (for development)
-- ============================================================================

-- Insert sample marketplace plugin (commented out for production)
-- INSERT INTO marketplace_plugins (id, name, description, version, author, tags, verified, featured)
-- VALUES (
--     'sample-plugin',
--     'Sample Plugin',
--     'A sample plugin for demonstration',
--     '1.0.0',
--     '{"name": "Sample Author", "email": "author@example.com"}'::jsonb,
--     ARRAY['sample', 'demo'],
--     true,
--     true
-- ) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users
GRANT SELECT ON plugins TO authenticated;
GRANT SELECT ON plugin_versions TO authenticated;
GRANT SELECT ON plugin_installations TO authenticated;
GRANT SELECT ON plugin_permissions TO authenticated;
GRANT SELECT ON marketplace_plugins TO authenticated;
GRANT ALL ON plugin_reviews TO authenticated;

-- Grant full access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
