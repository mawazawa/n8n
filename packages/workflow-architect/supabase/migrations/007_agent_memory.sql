-- Migration: Agent Memory System
-- Creates tables and functions for episodic, semantic, and procedural memory

-- Enable required extensions (should already be enabled from previous migrations)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memory type enum
CREATE TYPE memory_type AS ENUM ('episodic', 'semantic', 'procedural');

-- Memory sessions table
CREATE TABLE memory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  summary TEXT,
  episode_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Main memory entries table
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Memory type and content
  type memory_type NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',

  -- Importance and access tracking
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Type-specific fields for episodic memory
  session_id UUID REFERENCES memory_sessions(id) ON DELETE CASCADE,
  conversation_turn INTEGER,
  user_message TEXT,
  agent_response TEXT,
  workflow_context JSONB,

  -- Type-specific fields for semantic memory
  category TEXT,
  facts TEXT[],
  relations JSONB,

  -- Type-specific fields for procedural memory
  skill TEXT,
  steps TEXT[],
  trigger_patterns TEXT[],
  success_rate REAL DEFAULT 0.0,
  usage_count INTEGER DEFAULT 0,

  -- Multi-tenancy
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for fast retrieval

-- Vector similarity search index
CREATE INDEX idx_memory_entries_embedding ON memory_entries
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Type-based filtering
CREATE INDEX idx_memory_entries_type ON memory_entries(type);

-- Session-based queries
CREATE INDEX idx_memory_entries_session ON memory_entries(session_id)
  WHERE session_id IS NOT NULL;

-- Importance-based filtering
CREATE INDEX idx_memory_entries_importance ON memory_entries(importance DESC);

-- Expiration handling
CREATE INDEX idx_memory_entries_expires ON memory_entries(expires_at)
  WHERE expires_at IS NOT NULL;

-- Category filtering for semantic memory
CREATE INDEX idx_memory_entries_category ON memory_entries(category)
  WHERE type = 'semantic';

-- Skill filtering for procedural memory
CREATE INDEX idx_memory_entries_skill ON memory_entries(skill)
  WHERE type = 'procedural';

-- User-based queries
CREATE INDEX idx_memory_entries_user ON memory_entries(user_id);

-- Session indexes
CREATE INDEX idx_memory_sessions_user ON memory_sessions(user_id);
CREATE INDEX idx_memory_sessions_active ON memory_sessions(started_at DESC)
  WHERE ended_at IS NULL;

-- Updated at trigger for sessions
CREATE TRIGGER memory_sessions_updated_at
  BEFORE UPDATE ON memory_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RPC function for vector similarity search
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  match_threshold REAL DEFAULT 0.5,
  match_count INTEGER DEFAULT 10,
  memory_type memory_type DEFAULT NULL,
  min_importance REAL DEFAULT 0.0,
  max_age_ms BIGINT DEFAULT NULL,
  session_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  type memory_type,
  content TEXT,
  embedding vector(1536),
  metadata JSONB,
  importance REAL,
  access_count INTEGER,
  last_accessed TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  session_id UUID,
  conversation_turn INTEGER,
  user_message TEXT,
  agent_response TEXT,
  workflow_context JSONB,
  category TEXT,
  facts TEXT[],
  relations JSONB,
  skill TEXT,
  steps TEXT[],
  trigger_patterns TEXT[],
  success_rate REAL,
  usage_count INTEGER,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
DECLARE
  min_created_at TIMESTAMPTZ;
BEGIN
  -- Calculate minimum creation timestamp if max_age is specified
  IF max_age_ms IS NOT NULL THEN
    min_created_at := NOW() - (max_age_ms || ' milliseconds')::INTERVAL;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.type,
    m.content,
    m.embedding,
    m.metadata,
    m.importance,
    m.access_count,
    m.last_accessed,
    m.created_at,
    m.expires_at,
    m.session_id,
    m.conversation_turn,
    m.user_message,
    m.agent_response,
    m.workflow_context,
    m.category,
    m.facts,
    m.relations,
    m.skill,
    m.steps,
    m.trigger_patterns,
    m.success_rate,
    m.usage_count,
    (1 - (m.embedding <=> query_embedding)) as similarity
  FROM memory_entries m
  WHERE
    (m.embedding IS NOT NULL)
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
    AND (memory_type IS NULL OR m.type = memory_type)
    AND (m.importance >= min_importance)
    AND (min_created_at IS NULL OR m.created_at >= min_created_at)
    AND (session_id IS NULL OR m.session_id = session_id)
    AND (m.expires_at IS NULL OR m.expires_at > NOW())
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RPC function to get memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats()
RETURNS TABLE (
  total_entries BIGINT,
  episodic_count BIGINT,
  semantic_count BIGINT,
  procedural_count BIGINT,
  avg_importance REAL,
  avg_access_count REAL,
  oldest_entry TIMESTAMPTZ,
  newest_entry TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_entries,
    COUNT(*) FILTER (WHERE type = 'episodic')::BIGINT as episodic_count,
    COUNT(*) FILTER (WHERE type = 'semantic')::BIGINT as semantic_count,
    COUNT(*) FILTER (WHERE type = 'procedural')::BIGINT as procedural_count,
    AVG(importance)::REAL as avg_importance,
    AVG(access_count)::REAL as avg_access_count,
    MIN(created_at) as oldest_entry,
    MAX(created_at) as newest_entry
  FROM memory_entries
  WHERE expires_at IS NULL OR expires_at > NOW();
END;
$$;

-- Function to clean up expired memories
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM memory_entries
  WHERE expires_at IS NOT NULL AND expires_at <= NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to update session episode count
CREATE OR REPLACE FUNCTION update_session_episode_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND NEW.type = 'episodic' THEN
    UPDATE memory_sessions
    SET episode_count = episode_count + 1
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to update session episode count
CREATE TRIGGER memory_entry_session_count
  AFTER INSERT ON memory_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_episode_count();

-- Function to find similar memories (for consolidation)
CREATE OR REPLACE FUNCTION find_similar_memories(
  memory_id UUID,
  similarity_threshold REAL DEFAULT 0.85,
  same_type_only BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  id UUID,
  type memory_type,
  content TEXT,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_embedding vector(1536);
  source_type memory_type;
BEGIN
  -- Get source memory embedding and type
  SELECT embedding, type INTO source_embedding, source_type
  FROM memory_entries
  WHERE id = memory_id;

  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.type,
    m.content,
    (1 - (m.embedding <=> source_embedding))::REAL as similarity
  FROM memory_entries m
  WHERE
    m.id != memory_id
    AND m.embedding IS NOT NULL
    AND (NOT same_type_only OR m.type = source_type)
    AND (1 - (m.embedding <=> source_embedding)) > similarity_threshold
  ORDER BY m.embedding <=> source_embedding
  LIMIT 10;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE memory_entries IS 'Agent memory storage with vector embeddings for semantic search';
COMMENT ON TABLE memory_sessions IS 'Conversation sessions for grouping episodic memories';
COMMENT ON COLUMN memory_entries.importance IS 'Memory importance score (0-1), used for prioritization and cleanup';
COMMENT ON COLUMN memory_entries.embedding IS '1536-dim vector from OpenAI text-embedding-3-small';
COMMENT ON FUNCTION search_memories IS 'Hybrid search combining vector similarity, importance, and filters';
COMMENT ON FUNCTION find_similar_memories IS 'Find similar memories for consolidation and deduplication';
