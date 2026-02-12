-- Migration: Create notification system tables
-- Implements multi-channel notifications with templates, preferences, tracking, and digests

-- Create enums for notifications
CREATE TYPE notification_channel AS ENUM (
  'email',
  'slack',
  'discord',
  'sms',
  'push',
  'webhook'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'failed',
  'read'
);

CREATE TYPE notification_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE digest_frequency AS ENUM (
  'daily',
  'weekly'
);

CREATE TYPE tracking_event AS ENUM (
  'open',
  'click',
  'bounce',
  'complaint'
);

-- ============================================================================
-- NOTIFICATION TEMPLATES
-- ============================================================================

CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  channel notification_channel NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  body_html TEXT,
  variables TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_template_name CHECK (length(name) >= 2 AND length(name) <= 100),
  CONSTRAINT valid_body CHECK (length(body) > 0),
  CONSTRAINT email_requires_subject CHECK (
    channel != 'email' OR subject IS NOT NULL
  )
);

CREATE INDEX idx_notification_templates_name ON notification_templates(name);
CREATE INDEX idx_notification_templates_channel ON notification_templates(channel);

COMMENT ON TABLE notification_templates IS 'Reusable notification templates with variable substitution';

-- ============================================================================
-- CHANNEL CONFIGURATION
-- ============================================================================

CREATE TABLE channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel notification_channel NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_config CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX idx_channel_configs_enabled ON channel_configs(enabled) WHERE enabled = true;

COMMENT ON TABLE channel_configs IS 'System-wide notification channel configurations';

-- ============================================================================
-- USER PREFERENCES
-- ============================================================================

CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Channel opt-in/opt-out
  channels JSONB NOT NULL DEFAULT '{
    "email": true,
    "slack": false,
    "discord": false,
    "sms": false,
    "push": true,
    "webhook": false
  }',

  -- Quiet hours (times in user's timezone)
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  -- Digest settings
  digest_enabled BOOLEAN DEFAULT false,
  digest_frequency digest_frequency,

  -- User timezone
  timezone TEXT DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_channels CHECK (jsonb_typeof(channels) = 'object'),
  CONSTRAINT valid_quiet_hours CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR
    (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
  ),
  CONSTRAINT valid_digest CHECK (
    (digest_enabled = false) OR
    (digest_enabled = true AND digest_frequency IS NOT NULL)
  )
);

CREATE INDEX idx_user_preferences_user_id ON user_notification_preferences(user_id);
CREATE INDEX idx_user_preferences_digest ON user_notification_preferences(digest_enabled, digest_frequency)
  WHERE digest_enabled = true;

COMMENT ON TABLE user_notification_preferences IS 'User-specific notification preferences and quiet hours';

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel notification_channel NOT NULL,
  template TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  priority notification_priority DEFAULT 'normal',
  status notification_status DEFAULT 'pending',

  -- Scheduling
  scheduled_at TIMESTAMPTZ,

  -- Delivery tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  -- Error handling
  error TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  digest_id UUID, -- If part of a digest
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_data CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT valid_metadata CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT valid_status_timestamps CHECK (
    (status = 'pending' AND sent_at IS NULL) OR
    (status != 'pending' AND sent_at IS NOT NULL)
  ),
  CONSTRAINT valid_scheduled_at CHECK (
    scheduled_at IS NULL OR scheduled_at > created_at
  )
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_channel ON notifications(channel);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_notifications_scheduled_at ON notifications(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'pending';
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_digest_id ON notifications(digest_id)
  WHERE digest_id IS NOT NULL;
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);

COMMENT ON TABLE notifications IS 'Individual notification records with delivery tracking';

-- ============================================================================
-- NOTIFICATION DIGESTS
-- ============================================================================

CREATE TABLE notification_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notification_ids UUID[] DEFAULT '{}',
  frequency digest_frequency NOT NULL,

  -- Period covered by this digest
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_period CHECK (period_end > period_start),
  CONSTRAINT valid_notification_ids CHECK (array_length(notification_ids, 1) > 0)
);

CREATE INDEX idx_digests_user_id ON notification_digests(user_id);
CREATE INDEX idx_digests_sent_at ON notification_digests(sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX idx_digests_frequency ON notification_digests(frequency);
CREATE INDEX idx_digests_pending ON notification_digests(user_id, frequency)
  WHERE sent_at IS NULL;

COMMENT ON TABLE notification_digests IS 'Batched notification digests sent daily or weekly';

-- ============================================================================
-- NOTIFICATION TRACKING
-- ============================================================================

CREATE TABLE notification_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE NOT NULL,
  event_type tracking_event NOT NULL,
  metadata JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_tracking_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_tracking_notification_id ON notification_tracking(notification_id);
CREATE INDEX idx_tracking_event_type ON notification_tracking(event_type);
CREATE INDEX idx_tracking_created_at ON notification_tracking(created_at DESC);
CREATE INDEX idx_tracking_notification_event ON notification_tracking(notification_id, event_type);

COMMENT ON TABLE notification_tracking IS 'Tracks opens, clicks, bounces, and complaints';

-- ============================================================================
-- WEBHOOK SUBSCRIPTIONS (for webhook channel)
-- ============================================================================

CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_url CHECK (url ~ '^https?://'),
  CONSTRAINT valid_events CHECK (array_length(events, 1) > 0)
);

CREATE INDEX idx_webhook_subs_user_id ON webhook_subscriptions(user_id);
CREATE INDEX idx_webhook_subs_enabled ON webhook_subscriptions(enabled) WHERE enabled = true;

COMMENT ON TABLE webhook_subscriptions IS 'User-configured webhook endpoints for notifications';

-- ============================================================================
-- PUSH SUBSCRIPTIONS (for push channel)
-- ============================================================================

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,

  CONSTRAINT valid_endpoint CHECK (endpoint ~ '^https://')
);

CREATE INDEX idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subs_endpoint ON push_subscriptions(endpoint);

COMMENT ON TABLE push_subscriptions IS 'Web push notification subscriptions';

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update notification status when tracking events occur
CREATE OR REPLACE FUNCTION update_notification_from_tracking()
RETURNS TRIGGER AS $$
BEGIN
  -- Update delivered_at on first delivery event
  IF NEW.event_type = 'open' AND (
    SELECT delivered_at FROM notifications WHERE id = NEW.notification_id
  ) IS NULL THEN
    UPDATE notifications
    SET delivered_at = NEW.created_at,
        status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END
    WHERE id = NEW.notification_id;
  END IF;

  -- Update read_at on first open event
  IF NEW.event_type = 'open' AND (
    SELECT read_at FROM notifications WHERE id = NEW.notification_id
  ) IS NULL THEN
    UPDATE notifications
    SET read_at = NEW.created_at,
        status = 'read'
    WHERE id = NEW.notification_id;
  END IF;

  -- Mark as failed on bounce or complaint
  IF NEW.event_type IN ('bounce', 'complaint') THEN
    UPDATE notifications
    SET status = 'failed',
        error = COALESCE(NEW.metadata->>'reason', 'Delivery failed')
    WHERE id = NEW.notification_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracking_update_notification
  AFTER INSERT ON notification_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_from_tracking();

-- Disable webhook subscriptions after too many failures
CREATE OR REPLACE FUNCTION check_webhook_failures()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.failure_count >= 10 AND OLD.failure_count < 10 THEN
    NEW.enabled = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_check_failures
  BEFORE UPDATE OF failure_count ON webhook_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_webhook_failures();

-- Auto-create user preferences on user creation
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Assuming auth.users table exists
CREATE TRIGGER user_create_notification_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Update updated_at triggers
CREATE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER channel_configs_updated_at
  BEFORE UPDATE ON channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER webhook_subs_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if user is in quiet hours
CREATE OR REPLACE FUNCTION is_in_quiet_hours(
  user_uuid UUID,
  check_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  prefs RECORD;
  user_time TIME;
BEGIN
  SELECT quiet_hours_start, quiet_hours_end, timezone
  INTO prefs
  FROM user_notification_preferences
  WHERE user_id = user_uuid;

  IF prefs IS NULL OR prefs.quiet_hours_start IS NULL THEN
    RETURN false;
  END IF;

  -- Convert check_time to user's timezone
  user_time = (check_time AT TIME ZONE prefs.timezone)::TIME;

  -- Handle quiet hours spanning midnight
  IF prefs.quiet_hours_start <= prefs.quiet_hours_end THEN
    RETURN user_time >= prefs.quiet_hours_start AND user_time < prefs.quiet_hours_end;
  ELSE
    RETURN user_time >= prefs.quiet_hours_start OR user_time < prefs.quiet_hours_end;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Get pending notifications for digest
CREATE OR REPLACE FUNCTION get_pending_digest_notifications(
  user_uuid UUID,
  since TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  channel notification_channel,
  template TEXT,
  data JSONB,
  priority notification_priority,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.channel,
    n.template,
    n.data,
    n.priority,
    n.created_at
  FROM notifications n
  INNER JOIN user_notification_preferences p ON n.user_id = p.user_id
  WHERE
    n.user_id = user_uuid
    AND n.status = 'pending'
    AND n.digest_id IS NULL
    AND n.scheduled_at IS NULL
    AND n.created_at >= since
    AND p.digest_enabled = true
  ORDER BY n.priority DESC, n.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Get notifications ready to send
CREATE OR REPLACE FUNCTION get_ready_notifications(
  max_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  channel notification_channel,
  template TEXT,
  data JSONB,
  priority notification_priority
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.user_id,
    n.channel,
    n.template,
    n.data,
    n.priority
  FROM notifications n
  INNER JOIN user_notification_preferences p ON n.user_id = p.user_id
  INNER JOIN channel_configs c ON n.channel = c.channel
  WHERE
    n.status = 'pending'
    AND n.digest_id IS NULL
    AND (n.scheduled_at IS NULL OR n.scheduled_at <= NOW())
    AND NOT is_in_quiet_hours(n.user_id)
    AND c.enabled = true
    AND (p.channels->>(n.channel::TEXT))::BOOLEAN = true
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at ASC
  LIMIT max_count;
END;
$$ LANGUAGE plpgsql;

-- Get notification analytics
CREATE OR REPLACE FUNCTION get_notification_analytics(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  channel_filter notification_channel DEFAULT NULL
)
RETURNS TABLE (
  channel notification_channel,
  total_sent BIGINT,
  total_delivered BIGINT,
  total_read BIGINT,
  total_failed BIGINT,
  delivery_rate DECIMAL,
  read_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.channel,
    COUNT(*) FILTER (WHERE n.status != 'pending') as total_sent,
    COUNT(*) FILTER (WHERE n.status = 'delivered' OR n.status = 'read') as total_delivered,
    COUNT(*) FILTER (WHERE n.status = 'read') as total_read,
    COUNT(*) FILTER (WHERE n.status = 'failed') as total_failed,
    CASE
      WHEN COUNT(*) FILTER (WHERE n.status != 'pending') = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE n.status = 'delivered' OR n.status = 'read')::DECIMAL /
            COUNT(*) FILTER (WHERE n.status != 'pending') * 100)
    END as delivery_rate,
    CASE
      WHEN COUNT(*) FILTER (WHERE n.status = 'delivered' OR n.status = 'read') = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE n.status = 'read')::DECIMAL /
            COUNT(*) FILTER (WHERE n.status = 'delivered' OR n.status = 'read') * 100)
    END as read_rate
  FROM notifications n
  WHERE
    n.created_at >= start_date
    AND n.created_at <= end_date
    AND (channel_filter IS NULL OR n.channel = channel_filter)
  GROUP BY n.channel;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DEFAULT CHANNEL CONFIGS
-- ============================================================================

INSERT INTO channel_configs (channel, enabled, config) VALUES
  ('email', true, '{"provider": "smtp", "from": "notifications@workflow-architect.dev"}'),
  ('slack', false, '{}'),
  ('discord', false, '{}'),
  ('sms', false, '{}'),
  ('push', true, '{}'),
  ('webhook', false, '{}')
ON CONFLICT (channel) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT TEMPLATES
-- ============================================================================

INSERT INTO notification_templates (name, channel, subject, body, variables) VALUES
  ('workflow_completed', 'email', 'Workflow Completed: {{workflow_name}}',
   'Your workflow "{{workflow_name}}" has completed successfully at {{completed_at}}.',
   ARRAY['workflow_name', 'completed_at']),

  ('workflow_failed', 'email', 'Workflow Failed: {{workflow_name}}',
   'Your workflow "{{workflow_name}}" has failed. Error: {{error_message}}',
   ARRAY['workflow_name', 'error_message']),

  ('daily_digest', 'email', 'Daily Workflow Summary',
   'You had {{workflow_count}} workflow executions today.',
   ARRAY['workflow_count', 'date']),

  ('workflow_completed', 'slack', NULL,
   '✅ Workflow *{{workflow_name}}* completed successfully',
   ARRAY['workflow_name', 'completed_at']),

  ('workflow_failed', 'slack', NULL,
   '❌ Workflow *{{workflow_name}}* failed: {{error_message}}',
   ARRAY['workflow_name', 'error_message'])
ON CONFLICT (name) DO NOTHING;
