/**
 * Webhook Types
 * Type definitions for webhook management system
 */

export type WebhookStatus = 'active' | 'paused' | 'disabled';
export type SignatureType = 'hmac-sha256' | 'hmac-sha1' | 'jwt' | 'basic' | 'none';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  signatureType: SignatureType;
  headers?: Record<string, string>;
  events: string[];
  status: WebhookStatus;
  retryConfig: RetryConfig;
  rateLimit?: RateLimit;
  createdAt: string;
  updatedAt: string;
  lastDelivery?: WebhookDelivery;
}

export interface RetryConfig {
  maxAttempts: number;
  backoff: 'exponential' | 'fixed';
  initialDelay: number;
}

export interface RateLimit {
  requests: number;
  window: number; // seconds
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  response?: {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
  };
  error?: string;
  createdAt: string;
  deliveredAt?: string;
  nextRetry?: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  source: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  signatureType?: SignatureType;
  headers?: Record<string, string>;
  retryConfig?: Partial<RetryConfig>;
  rateLimit?: RateLimit;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  headers?: Record<string, string>;
  retryConfig?: Partial<RetryConfig>;
  rateLimit?: RateLimit;
}

export interface WebhookStats {
  webhookId: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  averageResponseTime: number;
  lastDelivery?: Date;
  consecutiveFailures: number;
}

export interface DeliveryLogOptions {
  limit?: number;
  offset?: number;
  status?: DeliveryStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface PayloadTemplate {
  template: string;
  fields?: string[];
}
