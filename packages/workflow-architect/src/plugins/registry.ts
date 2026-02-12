import { createClient } from '@supabase/supabase-js';
import semver from 'semver';
import type {
	Plugin,
	PluginFilters,
	PluginManifest,
	PluginState,
	ExtensionPoint,
	PluginPermission,
	PluginConfig,
} from './types';

/**
 * Plugin registry for managing installed plugins
 */
export class PluginRegistry {
	private plugins = new Map<string, Plugin>();
	private supabase: ReturnType<typeof createClient> | null = null;
	private cacheTimeout = 5 * 60 * 1000; // 5 minutes
	private lastCacheUpdate = 0;

	constructor(supabaseUrl?: string, supabaseKey?: string) {
		if (supabaseUrl && supabaseKey) {
			this.supabase = createClient(supabaseUrl, supabaseKey);
		}
	}

	/**
	 * Initialize registry by loading plugins from database
	 */
	async initialize(): Promise<void> {
		if (!this.supabase) {
			return;
		}

		const { data, error } = await this.supabase
			.from('plugins')
			.select('*')
			.eq('state', 'active');

		if (error) {
			throw new Error(`Failed to load plugins: ${error.message}`);
		}

		if (data) {
			for (const row of data) {
				const plugin: Plugin = {
					manifest: row.manifest as PluginManifest,
					config: row.config as PluginConfig,
					state: row.state as PluginState,
					installedAt: new Date(row.installed_at),
					updatedAt: new Date(row.updated_at),
					activatedAt: row.activated_at ? new Date(row.activated_at) : undefined,
					error: row.error,
				};
				this.plugins.set(plugin.manifest.id, plugin);
			}
		}

		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Register a new plugin
	 */
	async register(plugin: Plugin): Promise<void> {
		const pluginId = plugin.manifest.id;

		// Check for conflicts
		const existing = this.plugins.get(pluginId);
		if (existing && existing.state !== PluginState.DISABLED) {
			throw new Error(
				`Plugin ${pluginId} is already registered with version ${existing.manifest.version}`,
			);
		}

		// Validate version format
		if (!semver.valid(plugin.manifest.version)) {
			throw new Error(`Invalid version format: ${plugin.manifest.version}`);
		}

		// Check version compatibility
		if (existing) {
			const existingVersion = existing.manifest.version;
			const newVersion = plugin.manifest.version;

			if (semver.lt(newVersion, existingVersion)) {
				throw new Error(
					`Cannot downgrade plugin ${pluginId} from ${existingVersion} to ${newVersion}`,
				);
			}
		}

		// Save to database
		if (this.supabase) {
			const { error } = await this.supabase.from('plugins').upsert({
				id: pluginId,
				manifest: plugin.manifest,
				config: plugin.config,
				state: plugin.state,
				installed_at: plugin.installedAt.toISOString(),
				updated_at: plugin.updatedAt.toISOString(),
				activated_at: plugin.activatedAt?.toISOString(),
				error: plugin.error,
			});

			if (error) {
				throw new Error(`Failed to register plugin: ${error.message}`);
			}
		}

		// Update in-memory cache
		this.plugins.set(pluginId, plugin);
		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Unregister a plugin
	 */
	async unregister(pluginId: string): Promise<void> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin ${pluginId} is not registered`);
		}

		// Remove from database
		if (this.supabase) {
			const { error } = await this.supabase.from('plugins').delete().eq('id', pluginId);

			if (error) {
				throw new Error(`Failed to unregister plugin: ${error.message}`);
			}
		}

		// Remove from cache
		this.plugins.delete(pluginId);
		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Get a specific plugin by ID
	 */
	async get(pluginId: string): Promise<Plugin | undefined> {
		// Refresh cache if needed
		await this.refreshCacheIfNeeded();

		return this.plugins.get(pluginId);
	}

	/**
	 * List plugins with optional filters
	 */
	async list(filters?: PluginFilters): Promise<Plugin[]> {
		// Refresh cache if needed
		await this.refreshCacheIfNeeded();

		let plugins = Array.from(this.plugins.values());

		if (!filters) {
			return plugins;
		}

		// Filter by state
		if (filters.state) {
			const states = Array.isArray(filters.state) ? filters.state : [filters.state];
			plugins = plugins.filter((p) => states.includes(p.state));
		}

		// Filter by extension point
		if (filters.extensionPoint) {
			const points = Array.isArray(filters.extensionPoint)
				? filters.extensionPoint
				: [filters.extensionPoint];
			plugins = plugins.filter((p) =>
				p.manifest.extensionPoints.some((ep) => points.includes(ep as ExtensionPoint)),
			);
		}

		// Filter by permission
		if (filters.permission) {
			const permissions = Array.isArray(filters.permission)
				? filters.permission
				: [filters.permission];
			plugins = plugins.filter((p) =>
				p.manifest.permissions.some((perm) => permissions.includes(perm as PluginPermission)),
			);
		}

		// Filter by search term
		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			plugins = plugins.filter(
				(p) =>
					p.manifest.name.toLowerCase().includes(searchLower) ||
					p.manifest.description.toLowerCase().includes(searchLower) ||
					p.manifest.keywords.some((k) => k.toLowerCase().includes(searchLower)),
			);
		}

		// Filter by author
		if (filters.author) {
			plugins = plugins.filter((p) => p.manifest.author.name === filters.author);
		}

		return plugins;
	}

	/**
	 * Update plugin state
	 */
	async updateState(pluginId: string, state: PluginState, error?: string): Promise<void> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin ${pluginId} is not registered`);
		}

		plugin.state = state;
		plugin.updatedAt = new Date();
		plugin.error = error;

		if (state === PluginState.ACTIVE) {
			plugin.activatedAt = new Date();
		}

		// Update database
		if (this.supabase) {
			const { error: dbError } = await this.supabase
				.from('plugins')
				.update({
					state,
					updated_at: plugin.updatedAt.toISOString(),
					activated_at: plugin.activatedAt?.toISOString(),
					error: plugin.error,
				})
				.eq('id', pluginId);

			if (dbError) {
				throw new Error(`Failed to update plugin state: ${dbError.message}`);
			}
		}

		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Update plugin configuration
	 */
	async updateConfig(pluginId: string, config: Partial<PluginConfig>): Promise<void> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin ${pluginId} is not registered`);
		}

		plugin.config = { ...plugin.config, ...config };
		plugin.updatedAt = new Date();

		// Update database
		if (this.supabase) {
			const { error } = await this.supabase
				.from('plugins')
				.update({
					config: plugin.config,
					updated_at: plugin.updatedAt.toISOString(),
				})
				.eq('id', pluginId);

			if (error) {
				throw new Error(`Failed to update plugin config: ${error.message}`);
			}
		}

		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Check if plugin exists
	 */
	has(pluginId: string): boolean {
		return this.plugins.has(pluginId);
	}

	/**
	 * Get plugin count
	 */
	size(): number {
		return this.plugins.size;
	}

	/**
	 * Get all plugin IDs
	 */
	keys(): string[] {
		return Array.from(this.plugins.keys());
	}

	/**
	 * Clear all plugins from registry
	 */
	async clear(): Promise<void> {
		if (this.supabase) {
			const { error } = await this.supabase.from('plugins').delete().neq('id', '');

			if (error) {
				throw new Error(`Failed to clear plugins: ${error.message}`);
			}
		}

		this.plugins.clear();
		this.lastCacheUpdate = Date.now();
	}

	/**
	 * Get plugins by extension point
	 */
	async getByExtensionPoint(extensionPoint: ExtensionPoint): Promise<Plugin[]> {
		return this.list({ extensionPoint });
	}

	/**
	 * Get active plugins
	 */
	async getActive(): Promise<Plugin[]> {
		return this.list({ state: PluginState.ACTIVE });
	}

	/**
	 * Check version compatibility
	 */
	isVersionCompatible(plugin: Plugin, minVersion?: string, maxVersion?: string): boolean {
		const version = plugin.manifest.version;

		if (minVersion && semver.lt(version, minVersion)) {
			return false;
		}

		if (maxVersion && semver.gt(version, maxVersion)) {
			return false;
		}

		return true;
	}

	/**
	 * Find plugins with dependency conflicts
	 */
	async findConflicts(pluginId: string): Promise<string[]> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			return [];
		}

		const conflicts: string[] = [];
		const allPlugins = Array.from(this.plugins.values());

		for (const other of allPlugins) {
			if (other.manifest.id === pluginId) {
				continue;
			}

			// Check if other plugin depends on this one
			for (const dep of other.manifest.dependencies) {
				if (dep.name === pluginId) {
					const satisfied = semver.satisfies(plugin.manifest.version, dep.version);
					if (!satisfied) {
						conflicts.push(
							`${other.manifest.id} requires ${pluginId}@${dep.version}, but ${plugin.manifest.version} is installed`,
						);
					}
				}
			}
		}

		return conflicts;
	}

	/**
	 * Refresh cache from database if needed
	 */
	private async refreshCacheIfNeeded(): Promise<void> {
		if (!this.supabase) {
			return;
		}

		const now = Date.now();
		if (now - this.lastCacheUpdate < this.cacheTimeout) {
			return;
		}

		await this.initialize();
	}
}
