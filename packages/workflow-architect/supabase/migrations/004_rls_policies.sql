-- Migration: Row Level Security (RLS) policies for multi-tenant access
-- References: https://supabase.com/docs/guides/auth/row-level-security

-- Enable RLS on workflow_examples
ALTER TABLE workflow_examples ENABLE ROW LEVEL SECURITY;

-- Enable RLS on workflow_node_chunks
ALTER TABLE workflow_node_chunks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view public workflows
CREATE POLICY "Public workflows are viewable by everyone"
  ON workflow_examples
  FOR SELECT
  USING (is_public = true);

-- Policy: Users can view their own workflows
CREATE POLICY "Users can view own workflows"
  ON workflow_examples
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Organization members can view org workflows
CREATE POLICY "Org members can view org workflows"
  ON workflow_examples
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM auth.users WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert their own workflows
CREATE POLICY "Users can insert own workflows"
  ON workflow_examples
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own workflows
CREATE POLICY "Users can update own workflows"
  ON workflow_examples
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own workflows
CREATE POLICY "Users can delete own workflows"
  ON workflow_examples
  FOR DELETE
  USING (auth.uid() = user_id);

-- Node chunks inherit access from parent workflow
-- Policy: View node chunks for accessible workflows
CREATE POLICY "View node chunks for accessible workflows"
  ON workflow_node_chunks
  FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflow_examples
      WHERE is_public = true OR user_id = auth.uid()
    )
  );

-- Policy: Insert node chunks for own workflows
CREATE POLICY "Insert node chunks for own workflows"
  ON workflow_node_chunks
  FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflow_examples WHERE user_id = auth.uid()
    )
  );

-- Policy: Update node chunks for own workflows
CREATE POLICY "Update node chunks for own workflows"
  ON workflow_node_chunks
  FOR UPDATE
  USING (
    workflow_id IN (
      SELECT id FROM workflow_examples WHERE user_id = auth.uid()
    )
  );

-- Policy: Delete node chunks for own workflows
CREATE POLICY "Delete node chunks for own workflows"
  ON workflow_node_chunks
  FOR DELETE
  USING (
    workflow_id IN (
      SELECT id FROM workflow_examples WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (for server-side operations)
-- The service role key automatically bypasses RLS

-- Comments
COMMENT ON POLICY "Public workflows are viewable by everyone" ON workflow_examples
  IS 'Allow anyone to view workflows marked as public';
COMMENT ON POLICY "Users can view own workflows" ON workflow_examples
  IS 'Allow authenticated users to view their own workflows';
COMMENT ON POLICY "Users can insert own workflows" ON workflow_examples
  IS 'Allow authenticated users to create workflows with their user_id';
