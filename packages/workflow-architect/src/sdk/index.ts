/**
 * Workflow Architect SDK
 * Main entry point for all SDK functionality
 *
 * Integration example:
 * ```typescript
 * import { createClient } from '@n8n/workflow-architect/sdk';
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 * });
 *
 * const workflows = await client.workflows.list();
 * ```
 */

// Core types and client
export type { SDKConfig, RequestOptions, Response, PaginatedResponse, ErrorResponse, RateLimitInfo } from './types.js';
export { SDKConfigSchema, RequestOptionsSchema } from './types.js';
export { BaseClient } from './core.js';

// TypeScript client
export { WorkflowArchitectClient } from './typescript/client.js';
export { WorkflowsAPI } from './typescript/workflows.js';
export { ExecutionsAPI } from './typescript/executions.js';
export { TemplatesAPI } from './typescript/templates.js';
export type { Workflow, WorkflowFilters } from './typescript/workflows.js';
export type { Execution, ExecutionFilters } from './typescript/executions.js';
export type { Template, TemplateFilters } from './typescript/templates.js';

// Auth
export { AuthManager } from './auth/index.js';
export type { AuthConfig } from './auth/index.js';
export { APIKeyAuthSchema, OAuth2AuthSchema, JWTAuthSchema, AuthConfigSchema } from './auth/index.js';

// Retry and rate limiting
export { RetryHandler } from './retry/index.js';
export { RateLimitHandler } from './rate-limit/index.js';

// REST API
export { OpenAPIGenerator } from './rest/openapi.js';
export type { OpenAPISpec } from './rest/openapi.js';
export { RESTDocsGenerator } from './rest/docs.js';

// GraphQL
export { buildGraphQLSchema } from './graphql/schema.js';
export { resolvers } from './graphql/resolvers.js';
export type { Context, DataLoader } from './graphql/resolvers.js';

// Webhooks
export { WebhookHandler, WEBHOOK_RETRY_GUIDANCE } from './webhooks/handler.js';
export type { WebhookEvent } from './webhooks/handler.js';

// CLI
export { WorkflowArchitectCLI } from './cli/client.js';

// Code generators
export { generatePythonClient } from './python/template.js';
export { generatePythonAsyncClient } from './python/async-template.js';
export { generateGoClient } from './go/template.js';
export { generateGoOptions } from './go/options-template.js';

// Helper function
import { WorkflowArchitectClient } from './typescript/client.js';
import type { SDKConfig } from './types.js';

/**
 * Create a new Workflow Architect client
 * Integration: const client = createClient({ baseUrl, apiKey });
 */
export function createClient(config: SDKConfig): WorkflowArchitectClient {
	return new WorkflowArchitectClient(config);
}

// Version info
export const SDK_VERSION = '1.0.0';
export const API_VERSION = '1.0.0';
