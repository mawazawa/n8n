-- Collaboration Hub Tables
-- Phase 5 Action 10: Real-Time Collaboration Hub

-- Voice/Video Channels Table
CREATE TABLE IF NOT EXISTS collab_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('voice', 'video')),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Channel Participants Table
CREATE TABLE IF NOT EXISTS collab_channel_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES collab_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    camera_enabled BOOLEAN DEFAULT false,
    mic_enabled BOOLEAN DEFAULT true,
    screen_sharing BOOLEAN DEFAULT false,
    UNIQUE(channel_id, user_id)
);

-- Messages Table
CREATE TABLE IF NOT EXISTS collab_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 10000),
    context_type VARCHAR(50) CHECK (context_type IN ('workflow', 'node', 'general')),
    context_id VARCHAR(255),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attachments JSONB DEFAULT '[]',
    mentions JSONB DEFAULT '[]',
    reactions JSONB DEFAULT '[]'
);

-- Annotations Table
CREATE TABLE IF NOT EXISTS collab_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    position JSONB NOT NULL,
    node_id VARCHAR(255),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ
);

-- Annotation Replies Table
CREATE TABLE IF NOT EXISTS collab_annotation_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotation_id UUID NOT NULL REFERENCES collab_annotations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Threads Table
CREATE TABLE IF NOT EXISTS collab_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200),
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('workflow', 'node', 'annotation')),
    context_id VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ
);

-- Thread Messages (links to collab_messages)
CREATE TABLE IF NOT EXISTS collab_thread_messages (
    thread_id UUID NOT NULL REFERENCES collab_threads(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, message_id)
);

-- Polls Table
CREATE TABLE IF NOT EXISTS collab_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question VARCHAR(500) NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    anonymous BOOLEAN DEFAULT false,
    allow_multiple BOOLEAN DEFAULT false,
    options JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- Poll Votes Table
CREATE TABLE IF NOT EXISTS collab_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES collab_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(poll_id, user_id, option_id)
);

-- Session Recordings Table
CREATE TABLE IF NOT EXISTS collab_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    started_by UUID NOT NULL REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_ms INTEGER,
    events JSONB DEFAULT '[]',
    participants JSONB DEFAULT '[]',
    audio_url TEXT,
    video_url TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Permissions/Invites Table
CREATE TABLE IF NOT EXISTS collab_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('workflow', 'workspace')),
    resource_id UUID NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'commenter')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    accepted BOOLEAN DEFAULT false,
    accepted_by UUID REFERENCES users(id),
    accepted_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_collab_channels_workspace ON collab_channels(workspace_id);
CREATE INDEX idx_collab_channels_created_by ON collab_channels(created_by);
CREATE INDEX idx_collab_channel_participants_channel ON collab_channel_participants(channel_id);
CREATE INDEX idx_collab_channel_participants_user ON collab_channel_participants(user_id);
CREATE INDEX idx_collab_messages_workspace ON collab_messages(workspace_id);
CREATE INDEX idx_collab_messages_user ON collab_messages(user_id);
CREATE INDEX idx_collab_messages_context ON collab_messages(context_type, context_id);
CREATE INDEX idx_collab_annotations_workflow ON collab_annotations(workflow_id);
CREATE INDEX idx_collab_annotations_user ON collab_annotations(user_id);
CREATE INDEX idx_collab_annotation_replies_annotation ON collab_annotation_replies(annotation_id);
CREATE INDEX idx_collab_threads_workspace ON collab_threads(workspace_id);
CREATE INDEX idx_collab_threads_context ON collab_threads(context_type, context_id);
CREATE INDEX idx_collab_thread_messages_thread ON collab_thread_messages(thread_id);
CREATE INDEX idx_collab_polls_workspace ON collab_polls(workspace_id);
CREATE INDEX idx_collab_poll_votes_poll ON collab_poll_votes(poll_id);
CREATE INDEX idx_collab_recordings_workspace ON collab_recordings(workspace_id);
CREATE INDEX idx_collab_invites_resource ON collab_invites(resource_type, resource_id);

-- Enable Row Level Security
ALTER TABLE collab_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_channel_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_annotation_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Channels
CREATE POLICY "Users can view channels in their workspaces"
    ON collab_channels FOR SELECT
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create channels in their workspaces"
    ON collab_channels FOR INSERT
    WITH CHECK (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

-- RLS Policies for Messages
CREATE POLICY "Users can view messages in their workspaces"
    ON collab_messages FOR SELECT
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create messages in their workspaces"
    ON collab_messages FOR INSERT
    WITH CHECK (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ) AND user_id = auth.uid());

CREATE POLICY "Users can update their own messages"
    ON collab_messages FOR UPDATE
    USING (user_id = auth.uid());

-- RLS Policies for Annotations
CREATE POLICY "Users can view annotations in their workflows"
    ON collab_annotations FOR SELECT
    USING (workflow_id IN (
        SELECT id FROM workflows WHERE workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can create annotations in their workflows"
    ON collab_annotations FOR INSERT
    WITH CHECK (workflow_id IN (
        SELECT id FROM workflows WHERE workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    ) AND user_id = auth.uid());

CREATE POLICY "Users can update their own annotations"
    ON collab_annotations FOR UPDATE
    USING (user_id = auth.uid());

-- RLS Policies for Polls
CREATE POLICY "Users can view polls in their workspaces"
    ON collab_polls FOR SELECT
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create polls in their workspaces"
    ON collab_polls FOR INSERT
    WITH CHECK (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ) AND created_by = auth.uid());

-- RLS Policies for Poll Votes
CREATE POLICY "Users can view votes in their workspace polls"
    ON collab_poll_votes FOR SELECT
    USING (poll_id IN (
        SELECT id FROM collab_polls WHERE workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can vote on polls in their workspaces"
    ON collab_poll_votes FOR INSERT
    WITH CHECK (poll_id IN (
        SELECT id FROM collab_polls WHERE workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    ) AND user_id = auth.uid());

-- RLS Policies for Invites
CREATE POLICY "Users can view invites they created or received"
    ON collab_invites FOR SELECT
    USING (invited_by = auth.uid() OR email = (SELECT email FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can create invites for resources they own"
    ON collab_invites FOR INSERT
    WITH CHECK (invited_by = auth.uid());

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_collab_messages_updated_at BEFORE UPDATE ON collab_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collab_annotations_updated_at BEFORE UPDATE ON collab_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collab_threads_updated_at BEFORE UPDATE ON collab_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
