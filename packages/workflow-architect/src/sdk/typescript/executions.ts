/**
 * Execution operations for the TypeScript SDK
 * Manage workflow executions with real-time events
 */

import { z } from 'zod';
import type { BaseClient } from '../core.js';
import type { PaginatedResponse } from '../types.js';

const ExecutionSchema = z.object({
	id: z.string().uuid(),
	workflowId: z.string().uuid(),
	status: z.enum(['running', 'success', 'error', 'cancelled']),
	startedAt: z.string().datetime(),
	finishedAt: z.string().datetime().optional(),
	input: z.record(z.unknown()),
	output: z.record(z.unknown()).optional(),
	error: z.string().optional(),
});

export type Execution = z.infer<typeof ExecutionSchema>;

const ExecutionFiltersSchema = z.object({
	status: z.enum(['running', 'success', 'error', 'cancelled']).optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(100).default(20),
});

export type ExecutionFilters = z.infer<typeof ExecutionFiltersSchema>;

/**
 * Executions API operations
 * Integration: client.executions.list(workflowId)
 */
export class ExecutionsAPI {
	constructor(private client: BaseClient) {}

	async list(workflowId: string, filters: ExecutionFilters = {}): Promise<PaginatedResponse<Execution>> {
		const validated = ExecutionFiltersSchema.parse(filters);
		const params = new URLSearchParams();
		if (validated.cursor) params.set('cursor', validated.cursor);
		params.set('limit', validated.limit.toString());
		if (validated.status) params.set('status', validated.status);

		const response = await this.client.request<PaginatedResponse<Execution>>('GET', `/workflows/${workflowId}/executions?${params}`);
		return response.data;
	}

	async get(id: string): Promise<Execution> {
		const response = await this.client.request<Execution>('GET', `/executions/${id}`);
		return ExecutionSchema.parse(response.data);
	}

	async cancel(id: string): Promise<void> {
		await this.client.request('POST', `/executions/${id}/cancel`);
	}

	async retry(id: string): Promise<Execution> {
		const response = await this.client.request<Execution>('POST', `/executions/${id}/retry`);
		return ExecutionSchema.parse(response.data);
	}

	async *stream(id: string): AsyncGenerator<{ event: string; data: unknown }> {
		// Placeholder for SSE streaming implementation
		yield { event: 'started', data: { id } };
	}
}
