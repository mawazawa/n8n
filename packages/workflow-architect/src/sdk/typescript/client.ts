/**
 * TypeScript SDK client for Workflow Architect
 * Main entry point with typed methods for all endpoints
 */

import { BaseClient } from '../core.js';
import { SDKConfigSchema, type SDKConfig } from '../types.js';
import { WorkflowsAPI } from './workflows.js';
import { ExecutionsAPI } from './executions.js';
import { TemplatesAPI } from './templates.js';

/**
 * Main Workflow Architect client
 * Integration: const client = new WorkflowArchitectClient({ baseUrl, apiKey });
 */
export class WorkflowArchitectClient extends BaseClient {
	public readonly workflows: WorkflowsAPI;
	public readonly executions: ExecutionsAPI;
	public readonly templates: TemplatesAPI;

	constructor(config: SDKConfig) {
		const validated = SDKConfigSchema.parse(config);
		super(validated);

		this.workflows = new WorkflowsAPI(this);
		this.executions = new ExecutionsAPI(this);
		this.templates = new TemplatesAPI(this);
	}

	/**
	 * Health check endpoint
	 */
	async health(): Promise<{ status: string; version: string }> {
		const response = await this.request<{ status: string; version: string }>('GET', '/health');
		return response.data;
	}

	/**
	 * Get API version information
	 */
	async version(): Promise<{ version: string; apiVersion: string }> {
		const response = await this.request<{ version: string; apiVersion: string }>('GET', '/version');
		return response.data;
	}
}
