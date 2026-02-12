/**
 * Template operations for the TypeScript SDK
 * Browse and instantiate workflow templates
 */

import { z } from 'zod';
import type { BaseClient } from '../core.js';
import type { PaginatedResponse } from '../types.js';
import type { Workflow } from './workflows.js';

const TemplateSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	description: z.string(),
	category: z.string(),
	variables: z.array(z.object({
		name: z.string(),
		type: z.enum(['string', 'number', 'boolean']),
		required: z.boolean(),
		default: z.unknown().optional(),
	})),
	workflow: z.record(z.unknown()),
	tags: z.array(z.string()),
});

export type Template = z.infer<typeof TemplateSchema>;

const TemplateFiltersSchema = z.object({
	category: z.string().optional(),
	tags: z.array(z.string()).optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(100).default(20),
});

export type TemplateFilters = z.infer<typeof TemplateFiltersSchema>;

/**
 * Templates API operations
 * Integration: client.templates.list({ category: 'data-processing' })
 */
export class TemplatesAPI {
	constructor(private client: BaseClient) {}

	async list(filters: TemplateFilters = {}): Promise<PaginatedResponse<Template>> {
		const validated = TemplateFiltersSchema.parse(filters);
		const params = new URLSearchParams();
		if (validated.cursor) params.set('cursor', validated.cursor);
		params.set('limit', validated.limit.toString());
		if (validated.category) params.set('category', validated.category);
		if (validated.tags) params.set('tags', validated.tags.join(','));

		const response = await this.client.request<PaginatedResponse<Template>>('GET', `/templates?${params}`);
		return response.data;
	}

	async get(id: string): Promise<Template> {
		const response = await this.client.request<Template>('GET', `/templates/${id}`);
		return TemplateSchema.parse(response.data);
	}

	async instantiate(id: string, variables: Record<string, unknown>): Promise<Workflow> {
		const template = await this.get(id);
		this.validateVariables(template, variables);

		const response = await this.client.request<Workflow>('POST', `/templates/${id}/instantiate`, { headers: { 'Content-Type': 'application/json' } });
		return response.data;
	}

	private validateVariables(template: Template, variables: Record<string, unknown>): void {
		for (const variable of template.variables) {
			if (variable.required && !(variable.name in variables)) {
				throw new Error(`Required variable '${variable.name}' is missing`);
			}
		}
	}
}
