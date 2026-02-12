/**
 * n8n Integration Module
 *
 * This module exports all components, stores, and utilities needed
 * to integrate the Workflow Architect into the n8n editor.
 *
 * @packageDocumentation
 */

// Vue Components
export { default as WorkflowArchitect } from './WorkflowArchitect.vue';
export { default as WorkflowArchitectPanel } from './WorkflowArchitectPanel.vue';

// Pinia Store
export {
  useWorkflowArchitectStore,
  ConnectionStatus,
  ProcessingPhase,
  type ChatMessage,
  type ArchitectState,
} from './architect.store';

// API Client
export {
  WorkflowArchitectApi,
  createArchitectApi,
  getArchitectApi,
  resetArchitectApi,
  StreamEventType,
  ArchitectApiError,
  type StreamEvent,
  type ChatRequest,
  type ChatResponse,
  type ArchitectApiConfig,
} from './architect.api';

// Composables
export {
  useArchitectCanvas,
  type UseArchitectCanvas,
  type N8nNode,
  type N8nConnection,
  type N8nWorkflow,
  type CanvasOperations,
  type ApplyWorkflowOptions,
  type TransformedWorkflow,
} from './useArchitectCanvas';

export {
  useArchitectShortcuts,
  useArchitectShortcutsManual,
  formatShortcutKey,
  ShortcutAction,
  type KeyboardShortcut,
} from './useArchitectShortcuts';

// Feature Flags
export {
  WorkflowArchitectFeatureFlag,
  isAiArchitectEnabled,
  getFeatureFlagsFromEnv,
  isValidFeatureFlags,
  requiresArchitectFeature,
  getBackendFeatureConfig,
  validateBackendFeatureConfig,
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_ENV_VARS,
  type WorkflowArchitectFeatureFlags,
  type BackendFeatureConfig,
} from './feature-flags';

// Translations
export {
  translations,
  getTranslationKey,
  type TranslationKey,
  type WorkflowArchitectTranslations,
} from './translations';

// Backend Services
export {
  WorkflowArchitectService,
  getWorkflowArchitectService,
  resetWorkflowArchitectService,
} from './workflow-architect.service';

// Backend Controller
export {
  WorkflowArchitectController,
  workflowArchitectController,
  registerWorkflowArchitectRoutes,
  architectRoutes,
} from './workflow-architect.controller';

/**
 * Version of the integration module
 */
export const INTEGRATION_VERSION = '0.1.0';

/**
 * Default configuration for the integration
 */
export const DEFAULT_INTEGRATION_CONFIG = {
  enabled: false,
  streamEnabled: true,
  autoApply: false,
  timeout: 60000,
  maxTokens: 4096,
} as const;
