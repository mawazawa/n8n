-- Custom Node Registry
-- Tables for storing and managing custom n8n nodes

-- Custom nodes table
CREATE TABLE IF NOT EXISTS custom_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    node_definition JSONB NOT NULL,
    published BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    downloads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Node versions table (for version history)
CREATE TABLE IF NOT EXISTS node_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES custom_nodes(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    node_definition JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(node_id, version)
);

-- Node downloads table (track who downloaded what)
CREATE TABLE IF NOT EXISTS node_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES custom_nodes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    downloaded_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_nodes_user_id ON custom_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_nodes_published ON custom_nodes(published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_custom_nodes_category ON custom_nodes(category);
CREATE INDEX IF NOT EXISTS idx_custom_nodes_name ON custom_nodes(name);
CREATE INDEX IF NOT EXISTS idx_custom_nodes_downloads ON custom_nodes(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_node_versions_node_id ON node_versions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_downloads_node_id ON node_downloads(node_id);
CREATE INDEX IF NOT EXISTS idx_node_downloads_user_id ON node_downloads(user_id);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_custom_nodes_search ON custom_nodes
USING gin(to_tsvector('english', name || ' ' || display_name || ' ' || description));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_custom_nodes_updated_at ON custom_nodes;
CREATE TRIGGER trigger_custom_nodes_updated_at
    BEFORE UPDATE ON custom_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_nodes_updated_at();

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_node_downloads(node_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE custom_nodes
    SET downloads = downloads + 1
    WHERE id = node_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE custom_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_downloads ENABLE ROW LEVEL SECURITY;

-- custom_nodes policies

-- Users can view their own nodes
CREATE POLICY "Users can view own nodes"
    ON custom_nodes
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view published nodes
CREATE POLICY "Anyone can view published nodes"
    ON custom_nodes
    FOR SELECT
    USING (published = true);

-- Users can insert their own nodes
CREATE POLICY "Users can insert own nodes"
    ON custom_nodes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own nodes
CREATE POLICY "Users can update own nodes"
    ON custom_nodes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own nodes
CREATE POLICY "Users can delete own nodes"
    ON custom_nodes
    FOR DELETE
    USING (auth.uid() = user_id);

-- node_versions policies

-- Users can view versions of their own nodes
CREATE POLICY "Users can view own node versions"
    ON node_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM custom_nodes
            WHERE custom_nodes.id = node_versions.node_id
            AND custom_nodes.user_id = auth.uid()
        )
    );

-- Users can view versions of published nodes
CREATE POLICY "Anyone can view published node versions"
    ON node_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM custom_nodes
            WHERE custom_nodes.id = node_versions.node_id
            AND custom_nodes.published = true
        )
    );

-- Users can insert versions for their own nodes
CREATE POLICY "Users can insert own node versions"
    ON node_versions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM custom_nodes
            WHERE custom_nodes.id = node_versions.node_id
            AND custom_nodes.user_id = auth.uid()
        )
    );

-- node_downloads policies

-- Users can view their own downloads
CREATE POLICY "Users can view own downloads"
    ON node_downloads
    FOR SELECT
    USING (auth.uid() = user_id);

-- Node owners can view who downloaded their nodes
CREATE POLICY "Node owners can view downloads"
    ON node_downloads
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM custom_nodes
            WHERE custom_nodes.id = node_downloads.node_id
            AND custom_nodes.user_id = auth.uid()
        )
    );

-- Anyone can insert download records (for public nodes)
CREATE POLICY "Anyone can record downloads"
    ON node_downloads
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM custom_nodes
            WHERE custom_nodes.id = node_downloads.node_id
            AND custom_nodes.published = true
        )
    );

-- Grant permissions
GRANT ALL ON custom_nodes TO authenticated;
GRANT ALL ON node_versions TO authenticated;
GRANT ALL ON node_downloads TO authenticated;

-- Comments for documentation
COMMENT ON TABLE custom_nodes IS 'Stores custom n8n node definitions created by users';
COMMENT ON TABLE node_versions IS 'Version history for custom nodes';
COMMENT ON TABLE node_downloads IS 'Tracks downloads of custom nodes';

COMMENT ON COLUMN custom_nodes.node_definition IS 'Complete node definition in JSON format';
COMMENT ON COLUMN custom_nodes.published IS 'Whether the node is publicly available';
COMMENT ON COLUMN custom_nodes.downloads IS 'Total number of times this node has been downloaded';

-- Create view for public node catalog
CREATE OR REPLACE VIEW public_node_catalog AS
SELECT
    cn.id,
    cn.name,
    cn.display_name,
    cn.description,
    cn.category,
    cn.version,
    cn.downloads,
    cn.published_at,
    cn.created_at,
    cn.updated_at,
    COUNT(DISTINCT nv.id) as version_count,
    (cn.node_definition->>'icon') as icon,
    (cn.node_definition->>'documentationUrl') as documentation_url
FROM custom_nodes cn
LEFT JOIN node_versions nv ON cn.id = nv.node_id
WHERE cn.published = true
GROUP BY cn.id
ORDER BY cn.downloads DESC, cn.created_at DESC;

-- Grant access to the view
GRANT SELECT ON public_node_catalog TO authenticated;
GRANT SELECT ON public_node_catalog TO anon;

COMMENT ON VIEW public_node_catalog IS 'Public catalog of published custom nodes with metadata';
