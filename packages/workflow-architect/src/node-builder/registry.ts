/**
 * Custom Node Builder - Node Registry
 * Supabase-backed registry for custom nodes
 */

import type { NodeDefinition, RegisteredNode } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Node registry class
 */
export class NodeRegistry {
	private supabase: SupabaseClient;
	private userId: string | null = null;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Set current user ID
	 */
	setUserId(userId: string): void {
		this.userId = userId;
	}

	/**
	 * Register a new node
	 */
	async register(
		nodeDefinition: NodeDefinition,
		version: string = '1.0.0',
		published: boolean = false,
	): Promise<RegisteredNode> {
		if (!this.userId) {
			throw new Error('User ID must be set before registering nodes');
		}

		// Insert into database
		const { data, error } = await this.supabase
			.from('custom_nodes')
			.insert({
				user_id: this.userId,
				name: nodeDefinition.name,
				display_name: nodeDefinition.displayName,
				description: nodeDefinition.description,
				category: nodeDefinition.category,
				version: version,
				node_definition: nodeDefinition,
				published: published,
			})
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to register node: ${error.message}`);
		}

		return this.mapToRegisteredNode(data);
	}

	/**
	 * Unregister a node
	 */
	async unregister(nodeId: string): Promise<void> {
		if (!this.userId) {
			throw new Error('User ID must be set before unregistering nodes');
		}

		const { error } = await this.supabase
			.from('custom_nodes')
			.delete()
			.eq('id', nodeId)
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(`Failed to unregister node: ${error.message}`);
		}
	}

	/**
	 * List all nodes for current user
	 */
	async list(): Promise<RegisteredNode[]> {
		if (!this.userId) {
			throw new Error('User ID must be set before listing nodes');
		}

		const { data, error } = await this.supabase
			.from('custom_nodes')
			.select('*')
			.eq('user_id', this.userId)
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to list nodes: ${error.message}`);
		}

		return (data || []).map(this.mapToRegisteredNode);
	}

	/**
	 * Get a specific node by ID
	 */
	async get(nodeId: string): Promise<RegisteredNode | null> {
		const { data, error } = await this.supabase
			.from('custom_nodes')
			.select('*')
			.eq('id', nodeId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				// Not found
				return null;
			}
			throw new Error(`Failed to get node: ${error.message}`);
		}

		return this.mapToRegisteredNode(data);
	}

	/**
	 * Update node definition
	 */
	async update(nodeId: string, nodeDefinition: NodeDefinition): Promise<RegisteredNode> {
		if (!this.userId) {
			throw new Error('User ID must be set before updating nodes');
		}

		const { data, error } = await this.supabase
			.from('custom_nodes')
			.update({
				name: nodeDefinition.name,
				display_name: nodeDefinition.displayName,
				description: nodeDefinition.description,
				category: nodeDefinition.category,
				node_definition: nodeDefinition,
				updated_at: new Date().toISOString(),
			})
			.eq('id', nodeId)
			.eq('user_id', this.userId)
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to update node: ${error.message}`);
		}

		return this.mapToRegisteredNode(data);
	}

	/**
	 * Publish node (make it publicly available)
	 */
	async publish(nodeId: string): Promise<void> {
		if (!this.userId) {
			throw new Error('User ID must be set before publishing nodes');
		}

		const { error } = await this.supabase
			.from('custom_nodes')
			.update({
				published: true,
				published_at: new Date().toISOString(),
			})
			.eq('id', nodeId)
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(`Failed to publish node: ${error.message}`);
		}
	}

	/**
	 * Unpublish node
	 */
	async unpublish(nodeId: string): Promise<void> {
		if (!this.userId) {
			throw new Error('User ID must be set before unpublishing nodes');
		}

		const { error } = await this.supabase
			.from('custom_nodes')
			.update({
				published: false,
				published_at: null,
			})
			.eq('id', nodeId)
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(`Failed to unpublish node: ${error.message}`);
		}
	}

	/**
	 * Search public nodes
	 */
	async search(query: string, category?: string): Promise<RegisteredNode[]> {
		let supabaseQuery = this.supabase
			.from('custom_nodes')
			.select('*')
			.eq('published', true);

		if (category) {
			supabaseQuery = supabaseQuery.eq('category', category);
		}

		if (query) {
			supabaseQuery = supabaseQuery.or(
				`name.ilike.%${query}%,display_name.ilike.%${query}%,description.ilike.%${query}%`,
			);
		}

		const { data, error } = await supabaseQuery.order('downloads', { ascending: false });

		if (error) {
			throw new Error(`Failed to search nodes: ${error.message}`);
		}

		return (data || []).map(this.mapToRegisteredNode);
	}

	/**
	 * Increment download count
	 */
	async incrementDownloads(nodeId: string): Promise<void> {
		const { error } = await this.supabase.rpc('increment_node_downloads', {
			node_id: nodeId,
		});

		if (error) {
			throw new Error(`Failed to increment downloads: ${error.message}`);
		}
	}

	/**
	 * Get node versions
	 */
	async getVersions(nodeId: string): Promise<Array<{ version: string; createdAt: Date }>> {
		const { data, error } = await this.supabase
			.from('node_versions')
			.select('version, created_at')
			.eq('node_id', nodeId)
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get versions: ${error.message}`);
		}

		return (data || []).map((v) => ({
			version: v.version,
			createdAt: new Date(v.created_at),
		}));
	}

	/**
	 * Create new version
	 */
	async createVersion(
		nodeId: string,
		version: string,
		nodeDefinition: NodeDefinition,
	): Promise<void> {
		const { error } = await this.supabase.from('node_versions').insert({
			node_id: nodeId,
			version: version,
			node_definition: nodeDefinition,
		});

		if (error) {
			throw new Error(`Failed to create version: ${error.message}`);
		}
	}

	/**
	 * Map database record to RegisteredNode
	 */
	private mapToRegisteredNode(data: Record<string, unknown>): RegisteredNode {
		return {
			id: data.id as string,
			nodeDefinition: data.node_definition as NodeDefinition,
			version: data.version as string,
			author: data.user_id as string,
			createdAt: new Date(data.created_at as string),
			updatedAt: new Date(data.updated_at as string),
			downloads: (data.downloads as number) || 0,
			published: (data.published as boolean) || false,
		};
	}
}

/**
 * Create registry instance
 */
export function createRegistry(supabaseUrl: string, supabaseKey: string): NodeRegistry {
	return new NodeRegistry(supabaseUrl, supabaseKey);
}
