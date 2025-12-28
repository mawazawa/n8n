-- Migration: Auto-embedding trigger using pg_net
-- Automatically generates embeddings when workflows are inserted or updated
-- References: https://supabase.com/docs/guides/database/extensions/pg_net

-- Create function to trigger embedding generation
CREATE OR REPLACE FUNCTION trigger_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get configuration from environment (set via Supabase dashboard)
  edge_function_url := current_setting('app.edge_function_url', true);
  service_role_key := current_setting('app.service_role_key', true);

  -- Skip if no URL configured (development mode)
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RETURN NEW;
  END IF;

  -- Only trigger for pending status
  IF NEW.embedding_status = 'pending' THEN
    -- Use pg_net to call Edge Function asynchronously
    PERFORM net.http_post(
      url := edge_function_url || '/functions/v1/generate-embedding',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', jsonb_build_object(
          'id', NEW.id,
          'name', NEW.name,
          'description', NEW.description,
          'techniques', NEW.techniques,
          'workflow_json', NEW.workflow_json,
          'embedding_status', NEW.embedding_status
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for INSERT
CREATE TRIGGER workflow_examples_insert_trigger
  AFTER INSERT ON workflow_examples
  FOR EACH ROW
  EXECUTE FUNCTION trigger_embedding_generation();

-- Create trigger for UPDATE (only when workflow_json changes)
CREATE OR REPLACE FUNCTION check_workflow_changed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger re-embedding if workflow content changed
  IF OLD.workflow_json IS DISTINCT FROM NEW.workflow_json THEN
    NEW.embedding_status := 'pending';
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_examples_update_check
  BEFORE UPDATE ON workflow_examples
  FOR EACH ROW
  EXECUTE FUNCTION check_workflow_changed();

CREATE TRIGGER workflow_examples_update_trigger
  AFTER UPDATE ON workflow_examples
  FOR EACH ROW
  WHEN (NEW.embedding_status = 'pending')
  EXECUTE FUNCTION trigger_embedding_generation();

-- Comments
COMMENT ON FUNCTION trigger_embedding_generation IS 'Triggers Edge Function to generate embeddings via pg_net';
COMMENT ON FUNCTION check_workflow_changed IS 'Resets embedding status when workflow content changes';
