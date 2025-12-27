/**
 * n8n REST API Client
 * Handles workflow CRUD operations against n8n instance
 */

import type { WorkflowDefinition, ExecutionResult, Credential } from '../types/workflow.js';

export interface N8nClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class N8nClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: N8nClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Workflow Operations
  // ============================================

  async createWorkflow(workflow: Omit<WorkflowDefinition, 'id'>): Promise<WorkflowDefinition> {
    return this.request<WorkflowDefinition>('POST', '/workflows', workflow);
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition> {
    return this.request<WorkflowDefinition>('GET', `/workflows/${id}`);
  }

  async updateWorkflow(id: string, workflow: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    return this.request<WorkflowDefinition>('PUT', `/workflows/${id}`, workflow);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request<void>('DELETE', `/workflows/${id}`);
  }

  async listWorkflows(options?: {
    active?: boolean;
    tags?: string[];
    limit?: number;
    cursor?: string;
  }): Promise<{ data: WorkflowDefinition[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (options?.active !== undefined) params.set('active', String(options.active));
    if (options?.tags) params.set('tags', options.tags.join(','));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ data: WorkflowDefinition[]; nextCursor?: string }>('GET', `/workflows${query}`);
  }

  async activateWorkflow(id: string): Promise<WorkflowDefinition> {
    return this.request<WorkflowDefinition>('POST', `/workflows/${id}/activate`);
  }

  async deactivateWorkflow(id: string): Promise<WorkflowDefinition> {
    return this.request<WorkflowDefinition>('POST', `/workflows/${id}/deactivate`);
  }

  // ============================================
  // Execution Operations
  // ============================================

  async executeWorkflow(id: string, data?: Record<string, unknown>): Promise<ExecutionResult> {
    return this.request<ExecutionResult>('POST', `/workflows/${id}/run`, data ? { data } : undefined);
  }

  async getExecution(id: string): Promise<ExecutionResult> {
    return this.request<ExecutionResult>('GET', `/executions/${id}`);
  }

  async listExecutions(workflowId?: string, options?: {
    status?: 'success' | 'error' | 'waiting';
    limit?: number;
  }): Promise<{ data: ExecutionResult[] }> {
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ data: ExecutionResult[] }>('GET', `/executions${query}`);
  }

  // ============================================
  // Credential Operations
  // ============================================

  async listCredentials(type?: string): Promise<{ data: Credential[] }> {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return this.request<{ data: Credential[] }>('GET', `/credentials${query}`);
  }

  async getCredential(id: string): Promise<Credential> {
    return this.request<Credential>('GET', `/credentials/${id}`);
  }

  // ============================================
  // Node Type Operations (for discovery)
  // ============================================

  async getNodeTypes(): Promise<{ data: Array<{ name: string; displayName: string; description: string }> }> {
    // Note: This endpoint may not exist in public API
    // Fallback to local node registry if needed
    try {
      return await this.request<{ data: Array<{ name: string; displayName: string; description: string }> }>('GET', '/node-types');
    } catch {
      // Return empty if not available
      return { data: [] };
    }
  }

  // ============================================
  // Health Check
  // ============================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<unknown>('GET', '/workflows?limit=1');
      return true;
    } catch {
      return false;
    }
  }
}

// Factory function with environment variables
export function createN8nClient(): N8nClient {
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!baseUrl) {
    throw new Error('N8N_BASE_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('N8N_API_KEY environment variable is required');
  }

  return new N8nClient({ baseUrl, apiKey });
}
