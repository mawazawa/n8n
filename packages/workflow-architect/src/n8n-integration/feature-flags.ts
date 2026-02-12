/**
 * Feature Flags for Workflow Architect
 *
 * This file defines the feature flag for enabling/disabling the AI Workflow Architect.
 * In n8n, this should be added to the feature flags service.
 */

/**
 * Feature flag enum for workflow architect
 */
export enum WorkflowArchitectFeatureFlag {
  AI_ARCHITECT_ENABLED = 'aiArchitectEnabled',
}

/**
 * Default feature flag configuration
 */
export const DEFAULT_FEATURE_FLAGS = {
  [WorkflowArchitectFeatureFlag.AI_ARCHITECT_ENABLED]: false,
};

/**
 * Feature flag configuration interface
 */
export interface WorkflowArchitectFeatureFlags {
  aiArchitectEnabled: boolean;
}

/**
 * Environment variable names for feature flags
 */
export const FEATURE_FLAG_ENV_VARS = {
  AI_ARCHITECT_ENABLED: 'N8N_AI_ARCHITECT_ENABLED',
};

/**
 * Helper to check if AI Architect is enabled
 */
export function isAiArchitectEnabled(flags?: WorkflowArchitectFeatureFlags): boolean {
  if (!flags) {
    return process.env.N8N_AI_ARCHITECT_ENABLED === 'true';
  }
  return flags.aiArchitectEnabled ?? false;
}

/**
 * Helper to get feature flags from environment
 */
export function getFeatureFlagsFromEnv(): WorkflowArchitectFeatureFlags {
  return {
    aiArchitectEnabled: process.env.N8N_AI_ARCHITECT_ENABLED === 'true',
  };
}

/**
 * Type guard to check if feature flags are valid
 */
export function isValidFeatureFlags(
  flags: unknown,
): flags is WorkflowArchitectFeatureFlags {
  if (typeof flags !== 'object' || flags === null) {
    return false;
  }
  const obj = flags as Record<string, unknown>;
  return typeof obj.aiArchitectEnabled === 'boolean';
}

/**
 * Feature flag decorator for Vue components
 * Use this to conditionally render components based on feature flags
 */
export function requiresArchitectFeature() {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: { featureFlags?: WorkflowArchitectFeatureFlags }) {
      if (!isAiArchitectEnabled(this.featureFlags)) {
        console.warn('AI Workflow Architect is not enabled');
        return;
      }
      return originalMethod.apply(this, arguments);
    };

    return descriptor;
  };
}

/**
 * Feature flag configuration for backend
 * This should be added to n8n's config service
 */
export interface BackendFeatureConfig {
  enabled: boolean;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
}

/**
 * Get backend feature configuration from environment
 */
export function getBackendFeatureConfig(): BackendFeatureConfig {
  return {
    enabled: process.env.N8N_AI_ARCHITECT_ENABLED === 'true',
    model: process.env.N8N_AI_ARCHITECT_MODEL || 'claude-opus-4-5',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.N8N_AI_ARCHITECT_BASE_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.N8N_AI_ARCHITECT_TIMEOUT || '60000', 10),
    maxTokens: parseInt(process.env.N8N_AI_ARCHITECT_MAX_TOKENS || '4096', 10),
  };
}

/**
 * Validate backend feature configuration
 */
export function validateBackendFeatureConfig(config: BackendFeatureConfig): boolean {
  if (!config.enabled) {
    return true; // No need to validate if disabled
  }

  if (!config.apiKey) {
    console.error('AI Architect is enabled but API key is missing');
    return false;
  }

  if (!config.baseUrl) {
    console.error('AI Architect is enabled but base URL is missing');
    return false;
  }

  return true;
}
