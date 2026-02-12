/**
 * Notification System Type Definitions
 * Defines all types for the notification system including channels, templates, and preferences
 */

export type NotificationChannel = 'email' | 'slack' | 'discord' | 'sms' | 'push' | 'webhook';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  template: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
  status: NotificationStatus;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  error?: string;
  createdAt: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  bodyHtml?: string;
  variables: string[];
}

export interface UserPreferences {
  userId: string;
  channels: Record<NotificationChannel, boolean>;
  quietHours?: { start: string; end: string };
  digest?: { enabled: boolean; frequency: 'daily' | 'weekly' };
  timezone: string;
}

export interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, unknown>;
}

// Database row types (matching Supabase schema)
export interface NotificationRow {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  template: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
  status: NotificationStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplateRow {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  body_html: string | null;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow {
  id: string;
  user_id: string;
  channels: Record<NotificationChannel, boolean>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest_enabled: boolean;
  digest_frequency: 'daily' | 'weekly' | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelConfigRow {
  id: string;
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationDigestRow {
  id: string;
  user_id: string;
  notification_ids: string[];
  sent_at: string | null;
  created_at: string;
}

export interface NotificationTrackingRow {
  id: string;
  notification_id: string;
  event_type: 'open' | 'click' | 'bounce' | 'complaint';
  metadata: Record<string, unknown>;
  created_at: string;
}

// Channel-specific configuration types
export interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'smtp';
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  from: string;
  fromName?: string;
}

export interface SlackConfig {
  token: string;
  defaultChannel?: string;
  webhookUrl?: string;
}

export interface DiscordConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
}

export interface SmsConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  from: string;
}

export interface PushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  subject: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  secret?: string;
}

// Notification payload types for different channels
export interface EmailPayload {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

export interface SlackPayload {
  channel: string;
  text: string;
  blocks?: unknown[];
  threadTs?: string;
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
}

export interface DiscordPayload {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string; icon_url?: string };
    timestamp?: string;
  }>;
  username?: string;
  avatarUrl?: string;
}

export interface SmsPayload {
  to: string;
  body: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
  tag?: string;
  requireInteraction?: boolean;
}

export interface WebhookPayload {
  notification: Notification;
  timestamp: string;
  signature?: string;
}

// Channel interface that all channel implementations must follow
export interface INotificationChannel {
  send(payload: unknown): Promise<{ success: boolean; messageId?: string; error?: string }>;
  validateConfig(config: unknown): boolean;
  getChannelType(): NotificationChannel;
}

// Digest types
export interface DigestEntry {
  notification: Notification;
  addedAt: string;
}

export interface DigestPayload {
  userId: string;
  notifications: Notification[];
  period: { start: string; end: string };
  frequency: 'daily' | 'weekly';
}

// Tracking types
export interface TrackingPixelData {
  notificationId: string;
  userId: string;
  timestamp: string;
}

export interface ClickTrackingData extends TrackingPixelData {
  url: string;
  linkIndex: number;
}

// Template rendering context
export interface TemplateContext {
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Scheduling types
export interface ScheduleOptions {
  sendAt: Date;
  timezone?: string;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

// Batch sending types
export interface BatchNotification {
  userId: string;
  template: string;
  data: Record<string, unknown>;
}

export interface BatchSendResult {
  successful: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}
