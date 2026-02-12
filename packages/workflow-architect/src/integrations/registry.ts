import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
	Integration,
	IntegrationSchema,
	IntegrationFilter,
	IntegrationFilterSchema,
	IntegrationStatus,
} from './types';

/**
 * Integration Registry
 * Manages the lifecycle of integrations including registration, retrieval, and search
 */
export class IntegrationRegistry {
	private supabase: SupabaseClient;
	private cache: Map<string, Integration>;
	private cacheTimeout: number;

	constructor(supabaseUrl: string, supabaseKey: string, cacheTimeout = 300000) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.cache = new Map();
		this.cacheTimeout = cacheTimeout;
	}

	/**
	 * Register a new integration
	 */
	async register(integration: Omit<Integration, 'id' | 'createdAt' | 'updatedAt'>): Promise<Integration> {
		// Validate integration data
		const validatedData = IntegrationSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(integration);

		// Insert into database
		const { data, error } = await this.supabase
			.from('integrations')
			.insert({
				user_id: validatedData.userId,
				name: validatedData.metadata.name,
				description: validatedData.metadata.description,
				version: validatedData.metadata.version,
				author: validatedData.metadata.author,
				homepage: validatedData.metadata.homepage,
				documentation: validatedData.metadata.documentation,
				icon: validatedData.metadata.icon,
				tags: validatedData.metadata.tags,
				connector_type: validatedData.config.connectorType,
				connector_config: validatedData.config.connectorConfig,
				auth_type: validatedData.config.auth?.type,
				auth_config: validatedData.config.auth?.config,
				rate_limits: validatedData.config.rateLimits,
				caching: validatedData.config.caching,
				health_check: validatedData.config.healthCheck,
				status: validatedData.status,
			})
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to register integration: ${error.message}`);
		}

		const registeredIntegration = this.mapDatabaseToIntegration(data);

		// Cache the integration
		this.cacheIntegration(registeredIntegration);

		return registeredIntegration;
	}

	/**
	 * Unregister an integration
	 */
	async unregister(id: string): Promise<void> {
		const { error } = await this.supabase
			.from('integrations')
			.delete()
			.eq('id', id);

		if (error) {
			throw new Error(`Failed to unregister integration: ${error.message}`);
		}

		// Remove from cache
		this.cache.delete(id);
	}

	/**
	 * Get an integration by ID
	 */
	async get(id: string): Promise<Integration> {
		// Check cache first
		const cached = this.cache.get(id);
		if (cached) {
			return cached;
		}

		// Fetch from database
		const { data, error } = await this.supabase
			.from('integrations')
			.select('*')
			.eq('id', id)
			.single();

		if (error) {
			throw new Error(`Failed to get integration: ${error.message}`);
		}

		if (!data) {
			throw new Error(`Integration not found: ${id}`);
		}

		const integration = this.mapDatabaseToIntegration(data);

		// Cache the integration
		this.cacheIntegration(integration);

		return integration;
	}

	/**
	 * List integrations with optional filters
	 */
	async list(filters?: IntegrationFilter): Promise<Integration[]> {
		// Validate filters
		const validatedFilters = filters ? IntegrationFilterSchema.parse(filters) : {};

		// Build query
		let query = this.supabase.from('integrations').select('*');

		if (validatedFilters.status) {
			query = query.eq('status', validatedFilters.status);
		}

		if (validatedFilters.connectorType) {
			query = query.eq('connector_type', validatedFilters.connectorType);
		}

		if (validatedFilters.authType) {
			query = query.eq('auth_type', validatedFilters.authType);
		}

		if (validatedFilters.tags && validatedFilters.tags.length > 0) {
			query = query.contains('tags', validatedFilters.tags);
		}

		if (validatedFilters.searchQuery) {
			query = query.or(
				`name.ilike.%${validatedFilters.searchQuery}%,description.ilike.%${validatedFilters.searchQuery}%`,
			);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to list integrations: ${error.message}`);
		}

		return data.map((item) => this.mapDatabaseToIntegration(item));
	}

	/**
	 * Search integrations by query string
	 */
	async search(query: string): Promise<Integration[]> {
		return this.list({ searchQuery: query });
	}

	/**
	 * Update integration status
	 */
	async updateStatus(id: string, status: IntegrationStatus, errorMessage?: string): Promise<void> {
		const updateData: Record<string, unknown> = {
			status,
			updated_at: new Date().toISOString(),
		};

		if (status === IntegrationStatus.CONNECTED) {
			updateData.last_connected_at = new Date().toISOString();
			updateData.error_message = null;
		}

		if (errorMessage) {
			updateData.error_message = errorMessage;
		}

		const { error } = await this.supabase
			.from('integrations')
			.update(updateData)
			.eq('id', id);

		if (error) {
			throw new Error(`Failed to update integration status: ${error.message}`);
		}

		// Invalidate cache
		this.cache.delete(id);
	}

	/**
	 * Update integration configuration
	 */
	async updateConfig(id: string, config: Partial<Integration['config']>): Promise<Integration> {
		const current = await this.get(id);

		const updatedConfig = {
			...current.config,
			...config,
		};

		const { error } = await this.supabase
			.from('integrations')
			.update({
				connector_type: updatedConfig.connectorType,
				connector_config: updatedConfig.connectorConfig,
				auth_type: updatedConfig.auth?.type,
				auth_config: updatedConfig.auth?.config,
				rate_limits: updatedConfig.rateLimits,
				caching: updatedConfig.caching,
				health_check: updatedConfig.healthCheck,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id);

		if (error) {
			throw new Error(`Failed to update integration config: ${error.message}`);
		}

		// Invalidate cache and fetch updated integration
		this.cache.delete(id);
		return this.get(id);
	}

	/**
	 * Get integrations by user ID
	 */
	async getByUserId(userId: string): Promise<Integration[]> {
		const { data, error } = await this.supabase
			.from('integrations')
			.select('*')
			.eq('user_id', userId);

		if (error) {
			throw new Error(`Failed to get integrations by user: ${error.message}`);
		}

		return data.map((item) => this.mapDatabaseToIntegration(item));
	}

	/**
	 * Check if integration exists
	 */
	async exists(id: string): Promise<boolean> {
		const { data, error } = await this.supabase
			.from('integrations')
			.select('id')
			.eq('id', id)
			.single();

		return !error && !!data;
	}

	/**
	 * Get integration count
	 */
	async count(filters?: IntegrationFilter): Promise<number> {
		const validatedFilters = filters ? IntegrationFilterSchema.parse(filters) : {};

		let query = this.supabase.from('integrations').select('*', { count: 'exact', head: true });

		if (validatedFilters.status) {
			query = query.eq('status', validatedFilters.status);
		}

		if (validatedFilters.connectorType) {
			query = query.eq('connector_type', validatedFilters.connectorType);
		}

		const { count, error } = await query;

		if (error) {
			throw new Error(`Failed to count integrations: ${error.message}`);
		}

		return count ?? 0;
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Map database record to Integration type
	 */
	private mapDatabaseToIntegration(data: Record<string, unknown>): Integration {
		const integration: Integration = {
			id: data.id as string,
			userId: data.user_id as string,
			metadata: {
				name: data.name as string,
				description: data.description as string | undefined,
				version: (data.version as string) || '1.0.0',
				author: data.author as string | undefined,
				homepage: data.homepage as string | undefined,
				documentation: data.documentation as string | undefined,
				icon: data.icon as string | undefined,
				tags: (data.tags as string[]) || [],
			},
			config: {
				connectorType: data.connector_type as Integration['config']['connectorType'],
				connectorConfig: data.connector_config as Integration['config']['connectorConfig'],
				auth: data.auth_type
					? {
							type: data.auth_type as Integration['config']['auth']['type'],
							config: data.auth_config as Integration['config']['auth']['config'],
						}
					: undefined,
				rateLimits: data.rate_limits as Integration['config']['rateLimits'],
				caching: data.caching as Integration['config']['caching'],
				healthCheck: data.health_check as Integration['config']['healthCheck'],
			},
			status: (data.status as IntegrationStatus) || IntegrationStatus.DISCONNECTED,
			createdAt: new Date(data.created_at as string),
			updatedAt: new Date(data.updated_at as string),
			lastConnectedAt: data.last_connected_at ? new Date(data.last_connected_at as string) : undefined,
			errorMessage: data.error_message as string | undefined,
		};

		return IntegrationSchema.parse(integration);
	}

	/**
	 * Cache an integration with timeout
	 */
	private cacheIntegration(integration: Integration): void {
		this.cache.set(integration.id, integration);

		// Auto-expire cache after timeout
		setTimeout(() => {
			this.cache.delete(integration.id);
		}, this.cacheTimeout);
	}
}
