/**
 * Configuration for embedding generation
 * Centralizes all embedding-related settings for consistency
 */

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxRetries: number;
  retryDelayMs: number;
  maxTokens: number;
  batchSize: number;
  rateLimitDelay: number;
}

/**
 * OpenAI text-embedding-3-small configuration
 * Model: text-embedding-3-small
 * - Cost: $0.00002 per 1K tokens
 * - Max tokens: 8191
 * - Dimensions: 1536 (default)
 * - Performance: Fast and cost-effective
 */
export const EMBEDDING_CONFIG: EmbeddingConfig = {
  // Model configuration
  model: 'text-embedding-3-small',
  dimensions: 1536,

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000, // Initial delay, will use exponential backoff

  // Token and batch limits
  maxTokens: 8191,
  batchSize: 100, // Max inputs per API call

  // Rate limiting (to avoid OpenAI rate limits)
  rateLimitDelay: 100, // ms between API calls
};

/**
 * Environment variable keys
 */
export const ENV_KEYS = {
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  SUPABASE_URL: 'SUPABASE_URL',
  SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
} as const;

/**
 * Embedding status values
 */
export const EMBEDDING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  MISSING_API_KEY: 'OPENAI_API_KEY is not configured',
  MISSING_SUPABASE_CONFIG: 'Supabase configuration is missing',
  API_ERROR: 'OpenAI API request failed',
  WORKFLOW_NOT_FOUND: 'Workflow not found',
  UPDATE_FAILED: 'Failed to update workflow',
  MAX_RETRIES_EXCEEDED: 'Maximum retry attempts exceeded',
} as const;

/**
 * OpenAI API configuration
 */
export const OPENAI_CONFIG = {
  endpoint: 'https://api.openai.com/v1/embeddings',
  headers: {
    'Content-Type': 'application/json',
  },
} as const;

/**
 * Validates environment variables
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Deno.env.get(ENV_KEYS.OPENAI_API_KEY)) {
    errors.push(ERROR_MESSAGES.MISSING_API_KEY);
  }

  if (!Deno.env.get(ENV_KEYS.SUPABASE_URL) || !Deno.env.get(ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY)) {
    errors.push(ERROR_MESSAGES.MISSING_SUPABASE_CONFIG);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get embedding model version for tracking
 */
export function getEmbeddingVersion(): string {
  return `${EMBEDDING_CONFIG.model}_v1`;
}
