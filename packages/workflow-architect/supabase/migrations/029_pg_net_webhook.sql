-- Migration: pg_net webhook configuration for embedding automation
-- Enables pg_net extension and configures webhook settings
-- References: https://supabase.com/docs/guides/database/extensions/pg_net

-- Enable pg_net extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to service role
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO service_role;

-- Create a configuration table for webhook settings
CREATE TABLE IF NOT EXISTS public.embedding_webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_function_url TEXT NOT NULL,
  service_role_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  timeout_ms INTEGER DEFAULT 30000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE public.embedding_webhook_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can manage webhook config"
  ON public.embedding_webhook_config
  FOR ALL
  USING (auth.role() = 'service_role');

-- Insert default configuration (update via Supabase dashboard)
INSERT INTO public.embedding_webhook_config (edge_function_url, service_role_key)
VALUES (
  COALESCE(current_setting('app.edge_function_url', true), 'https://your-project.supabase.co'),
  COALESCE(current_setting('app.service_role_key', true), 'your-service-role-key')
) ON CONFLICT (id) DO NOTHING;

-- Create a table to track webhook requests for debugging
CREATE TABLE IF NOT EXISTS public.embedding_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_examples(id) ON DELETE CASCADE,
  request_payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index for querying logs
  INDEX idx_embedding_webhook_log_workflow (workflow_id),
  INDEX idx_embedding_webhook_log_created (created_at DESC)
);

-- Add RLS policies for webhook log
ALTER TABLE public.embedding_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage webhook logs"
  ON public.embedding_webhook_log
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view webhook logs"
  ON public.embedding_webhook_log
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Function to clean up old webhook logs (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.embedding_webhook_log
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to clean up logs daily (requires pg_cron)
-- Uncomment if pg_cron is available
-- SELECT cron.schedule(
--   'cleanup-webhook-logs',
--   '0 2 * * *', -- 2 AM daily
--   $$SELECT cleanup_webhook_logs()$$
-- );

-- Enhanced trigger function with webhook logging
CREATE OR REPLACE FUNCTION trigger_embedding_generation_v2()
RETURNS TRIGGER AS $$
DECLARE
  webhook_config RECORD;
  request_id UUID;
  response_id INTEGER;
BEGIN
  -- Get webhook configuration
  SELECT edge_function_url, service_role_key, enabled, timeout_ms
  INTO webhook_config
  FROM public.embedding_webhook_config
  ORDER BY created_at DESC
  LIMIT 1;

  -- Skip if webhook is not configured or disabled
  IF webhook_config IS NULL OR NOT webhook_config.enabled THEN
    RETURN NEW;
  END IF;

  -- Only trigger for pending status
  IF NEW.embedding_status = 'pending' THEN
    BEGIN
      -- Make async HTTP request using pg_net
      SELECT net.http_post(
        url := webhook_config.edge_function_url || '/functions/v1/generate-embedding',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || webhook_config.service_role_key
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
        ),
        timeout_milliseconds := webhook_config.timeout_ms
      ) INTO response_id;

      -- Log the webhook request
      INSERT INTO public.embedding_webhook_log (
        workflow_id,
        request_payload,
        response_status
      ) VALUES (
        NEW.id,
        jsonb_build_object(
          'type', TG_OP,
          'workflow_id', NEW.id,
          'timestamp', NOW()
        ),
        response_id
      );

    EXCEPTION WHEN OTHERS THEN
      -- Log errors
      INSERT INTO public.embedding_webhook_log (
        workflow_id,
        request_payload,
        error_message
      ) VALUES (
        NEW.id,
        jsonb_build_object(
          'type', TG_OP,
          'workflow_id', NEW.id,
          'timestamp', NOW()
        ),
        SQLERRM
      );

      -- Don't fail the transaction, just log the error
      RAISE WARNING 'Failed to trigger embedding webhook for workflow %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the old trigger with the new version
DROP TRIGGER IF EXISTS workflow_examples_insert_trigger ON workflow_examples;
DROP TRIGGER IF EXISTS workflow_examples_update_trigger ON workflow_examples;

CREATE TRIGGER workflow_examples_insert_trigger
  AFTER INSERT ON workflow_examples
  FOR EACH ROW
  EXECUTE FUNCTION trigger_embedding_generation_v2();

CREATE TRIGGER workflow_examples_update_trigger
  AFTER UPDATE ON workflow_examples
  FOR EACH ROW
  WHEN (NEW.embedding_status = 'pending')
  EXECUTE FUNCTION trigger_embedding_generation_v2();

-- Function to manually retry failed embeddings
CREATE OR REPLACE FUNCTION retry_failed_embeddings(
  batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  workflow_id UUID,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH failed_workflows AS (
    SELECT id
    FROM public.workflow_examples
    WHERE embedding_status = 'failed'
    ORDER BY updated_at DESC
    LIMIT batch_size
  )
  UPDATE public.workflow_examples w
  SET embedding_status = 'pending',
      updated_at = NOW()
  FROM failed_workflows f
  WHERE w.id = f.id
  RETURNING w.id, w.embedding_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get webhook statistics
CREATE OR REPLACE FUNCTION get_webhook_stats()
RETURNS TABLE (
  total_requests BIGINT,
  failed_requests BIGINT,
  success_rate NUMERIC,
  avg_response_time_ms NUMERIC,
  last_24h_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    COUNT(*) FILTER (WHERE error_message IS NOT NULL)::BIGINT as failed_requests,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE error_message IS NULL)::NUMERIC / COUNT(*)) * 100, 2)
      ELSE 0
    END as success_rate,
    0::NUMERIC as avg_response_time_ms, -- Placeholder for future implementation
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT as last_24h_requests
  FROM public.embedding_webhook_log;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE public.embedding_webhook_config IS 'Configuration for embedding generation webhooks';
COMMENT ON TABLE public.embedding_webhook_log IS 'Log of webhook requests for debugging and monitoring';
COMMENT ON FUNCTION trigger_embedding_generation_v2 IS 'Enhanced trigger with logging and error handling';
COMMENT ON FUNCTION retry_failed_embeddings IS 'Manually retry failed embedding generations';
COMMENT ON FUNCTION get_webhook_stats IS 'Get statistics about webhook performance';
COMMENT ON FUNCTION cleanup_webhook_logs IS 'Clean up old webhook logs (7+ days)';
