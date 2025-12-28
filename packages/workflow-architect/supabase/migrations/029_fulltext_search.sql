-- Migration: Add full-text search support to workflow_examples
-- Implements PostgreSQL Full-Text Search (FTS) with tsvector
-- References: https://www.postgresql.org/docs/current/textsearch.html

-- Add tsvector column for full-text search
ALTER TABLE workflow_examples
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to generate search vector from workflow metadata
-- Combines name (weight A), description (weight B), techniques (weight C)
-- Weight hierarchy: A > B > C for relevance ranking
CREATE OR REPLACE FUNCTION generate_search_vector(
  p_name TEXT,
  p_description TEXT,
  p_techniques TEXT[]
) RETURNS tsvector AS $$
DECLARE
  v_search_vector tsvector;
  v_techniques_text TEXT;
BEGIN
  -- Convert techniques array to text
  v_techniques_text := array_to_string(p_techniques, ' ');

  -- Generate weighted tsvector
  -- setweight() assigns importance to different fields
  v_search_vector :=
    setweight(to_tsvector('english', COALESCE(p_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(p_description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(v_techniques_text, '')), 'C');

  RETURN v_search_vector;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate search_vector for existing rows
UPDATE workflow_examples
SET search_vector = generate_search_vector(name, description, techniques)
WHERE search_vector IS NULL;

-- Create trigger to automatically update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION workflow_examples_search_vector_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := generate_search_vector(NEW.name, NEW.description, NEW.techniques);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_workflow_examples_search_vector
  BEFORE INSERT OR UPDATE OF name, description, techniques
  ON workflow_examples
  FOR EACH ROW
  EXECUTE FUNCTION workflow_examples_search_vector_trigger();

-- Add tsvector column to node chunks for node-level full-text search
ALTER TABLE workflow_node_chunks
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function for node chunk search vector
CREATE OR REPLACE FUNCTION generate_node_search_vector(
  p_node_name TEXT,
  p_node_type TEXT,
  p_semantic_content TEXT
) RETURNS tsvector AS $$
BEGIN
  RETURN
    setweight(to_tsvector('english', COALESCE(p_node_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(p_node_type, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(p_semantic_content, '')), 'C');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate node chunk search vectors
UPDATE workflow_node_chunks
SET search_vector = generate_node_search_vector(node_name, node_type, semantic_content)
WHERE search_vector IS NULL;

-- Create trigger for node chunks
CREATE OR REPLACE FUNCTION workflow_node_chunks_search_vector_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := generate_node_search_vector(NEW.node_name, NEW.node_type, NEW.semantic_content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_workflow_node_chunks_search_vector
  BEFORE INSERT OR UPDATE OF node_name, node_type, semantic_content
  ON workflow_node_chunks
  FOR EACH ROW
  EXECUTE FUNCTION workflow_node_chunks_search_vector_trigger();

-- Comments
COMMENT ON COLUMN workflow_examples.search_vector IS 'Full-text search vector with weighted fields (A=name, B=description, C=techniques)';
COMMENT ON COLUMN workflow_node_chunks.search_vector IS 'Full-text search vector for node-level search';
COMMENT ON FUNCTION generate_search_vector IS 'Generates weighted tsvector for workflow full-text search';
COMMENT ON FUNCTION generate_node_search_vector IS 'Generates weighted tsvector for node-level full-text search';
