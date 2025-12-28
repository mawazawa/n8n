/**
 * Workflow operations for the TypeScript SDK
 * CRUD operations and execution for workflows
 */

import { z } from 'zod';
import type { BaseClient } from '../core.js';
import type { PaginatedResponse } from '../types.js';

const WorkflowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	description: z.string().optional(),
	nodes: z.array(z.record(z.unknown())),
	connections: z.record(z.unknown()),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

const WorkflowFiltersSchema = z.object({
	name: z.string().optional(),
	tags: z.array(z.string()).optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(100).default(20),
});

export type WorkflowFilters = z.infer<typeof WorkflowFiltersSchema>;

/**
 * Workflows API operations
 * Integration: client.workflows.list()
 */
export class WorkflowsAPI {
	constructor(private client: BaseClient) {}

	async list(filters: WorkflowFilters = {}): Promise<PaginatedResponse<Workflow>> {
		const validated = WorkflowFiltersSchema.parse(filters);
		const params = new URLSearchParams();
		if (validated.cursor) params.set('cursor', validated.cursor);
		params.set('limit', validated.limit.toString());
		if (validated.name) params.set('name', validated.name);
		if (validated.tags) params.set('tags', validated.tags.join(','));

		const response = await this.client.request<PaginatedResponse<Workflow>>('GET', `/workflows?${params}`);
		return response.data;
	}

	async get(id: string): Promise<Workflow> {
		const response = await this.client.request<Workflow>('GET', `/workflows/${id}`);
		return WorkflowSchema.parse(response.data);
	}

	async create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
		const response = await this.client.request<Workflow>('POST', '/workflows', { headers: { 'Content-Type': 'application/json' } });
		return WorkflowSchema.parse(response.data);
	}

	async update(id: string, updates: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workflow> {
		const response = await this.client.request<Workflow>('PATCH', `/workflows/${id}`, { headers: { 'Content-Type': 'application/json' } });
		return WorkflowSchema.parse(response.data);
	}

	async delete(id: string): Promise<void> {
		await this.client.request('DELETE', `/workflows/${id}`);
	}

	async execute(id: string, input: Record<string, unknown>): Promise<{ executionId: string }> {
		const response = await this.client.request<{ executionId: string }>('POST', `/workflows/${id}/execute`, { headers: { 'Content-Type': 'application/json' } });
		return response.data;
	}
}
