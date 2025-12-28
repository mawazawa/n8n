import { createClient } from '@supabase/supabase-js';
import type {
	PluginListing,
	PluginDetails,
	PluginVersion,
	PluginReview,
	PluginUpdate,
} from './types';
import { PluginLoader } from './loader';
import { PluginRegistry } from './registry';

/**
 * Marketplace search filters
 */
export interface MarketplaceSearchFilters {
	query?: string;
	tags?: string[];
	verified?: boolean;
	featured?: boolean;
	minRating?: number;
	sortBy?: 'downloads' | 'rating' | 'recent' | 'name';
	limit?: number;
	offset?: number;
}

/**
 * Plugin marketplace client
 */
export class MarketplaceClient {
	private supabase: ReturnType<typeof createClient> | null = null;
	private cache = new Map<string, { data: PluginListing[]; timestamp: number }>();
	private cacheTimeout = 5 * 60 * 1000; // 5 minutes

	constructor(
		private registry: PluginRegistry,
		private loader: PluginLoader,
		supabaseUrl?: string,
		supabaseKey?: string,
	) {
		if (supabaseUrl && supabaseKey) {
			this.supabase = createClient(supabaseUrl, supabaseKey);
		}
	}

	/**
	 * Search plugins in marketplace
	 */
	async search(filters: MarketplaceSearchFilters = {}): Promise<PluginListing[]> {
		// Check cache
		const cacheKey = JSON.stringify(filters);
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
			return cached.data;
		}

		if (!this.supabase) {
			return [];
		}

		// Build query
		let query = this.supabase.from('marketplace_plugins').select('*');

		if (filters.query) {
			query = query.or(
				`name.ilike.%${filters.query}%,description.ilike.%${filters.query}%,tags.cs.{${filters.query}}`,
			);
		}

		if (filters.verified !== undefined) {
			query = query.eq('verified', filters.verified);
		}

		if (filters.featured !== undefined) {
			query = query.eq('featured', filters.featured);
		}

		if (filters.minRating !== undefined) {
			query = query.gte('rating', filters.minRating);
		}

		if (filters.tags && filters.tags.length > 0) {
			query = query.contains('tags', filters.tags);
		}

		// Sort
		const sortBy = filters.sortBy || 'downloads';
		query = query.order(sortBy, { ascending: sortBy === 'name' });

		// Pagination
		if (filters.limit) {
			query = query.limit(filters.limit);
		}
		if (filters.offset) {
			query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Marketplace search failed: ${error.message}`);
		}

		const listings = (data || []).map((row) => this.rowToListing(row));

		// Cache results
		this.cache.set(cacheKey, { data: listings, timestamp: Date.now() });

		return listings;
	}

	/**
	 * Get plugin details
	 */
	async getDetails(pluginId: string): Promise<PluginDetails> {
		if (!this.supabase) {
			throw new Error('Marketplace client not configured');
		}

		// Get plugin data
		const { data: pluginData, error: pluginError } = await this.supabase
			.from('marketplace_plugins')
			.select('*')
			.eq('id', pluginId)
			.single();

		if (pluginError) {
			throw new Error(`Failed to get plugin details: ${pluginError.message}`);
		}

		// Get versions
		const { data: versionsData, error: versionsError } = await this.supabase
			.from('plugin_versions')
			.select('*')
			.eq('plugin_id', pluginId)
			.order('release_date', { ascending: false });

		if (versionsError) {
			throw new Error(`Failed to get plugin versions: ${versionsError.message}`);
		}

		// Get reviews
		const { data: reviewsData, error: reviewsError } = await this.supabase
			.from('plugin_reviews')
			.select('*')
			.eq('plugin_id', pluginId)
			.order('created_at', { ascending: false })
			.limit(10);

		if (reviewsError) {
			throw new Error(`Failed to get plugin reviews: ${reviewsError.message}`);
		}

		const listing = this.rowToListing(pluginData);
		const versions = (versionsData || []).map((row) => this.rowToVersion(row));
		const reviews = (reviewsData || []).map((row) => this.rowToReview(row));

		return {
			...listing,
			readme: pluginData.readme || '',
			changelog: pluginData.changelog || '',
			versions,
			dependencies: pluginData.dependencies || [],
			permissions: pluginData.permissions || [],
			reviews,
			support: {
				email: pluginData.support_email,
				url: pluginData.support_url,
				issues: pluginData.issues_url,
			},
		};
	}

	/**
	 * Install plugin from marketplace
	 */
	async install(pluginId: string, version?: string): Promise<void> {
		// Get plugin details
		const details = await this.getDetails(pluginId);

		// Determine version to install
		const targetVersion = version || details.version;
		const versionInfo = details.versions.find((v) => v.version === targetVersion);

		if (!versionInfo) {
			throw new Error(`Version ${targetVersion} not found for plugin ${pluginId}`);
		}

		// Check if already installed
		const existing = await this.registry.get(pluginId);
		if (existing) {
			throw new Error(`Plugin ${pluginId} is already installed`);
		}

		// Download and install
		const startTime = Date.now();
		const plugin = await this.loader.loadFromUrl(versionInfo.downloadUrl);

		// Verify checksum
		// In production, you'd verify the downloaded file against the checksum
		// For now, we'll skip this step

		// Register plugin
		await this.registry.register(plugin);

		const installTime = Date.now() - startTime;
		console.log(`Plugin ${pluginId}@${targetVersion} installed in ${installTime}ms`);

		// Track installation
		if (this.supabase) {
			await this.supabase.from('plugin_installations').insert({
				plugin_id: pluginId,
				version: targetVersion,
				installed_at: new Date().toISOString(),
			});

			// Increment download count
			await this.supabase.rpc('increment_plugin_downloads', { plugin_id: pluginId });
		}
	}

	/**
	 * Uninstall plugin
	 */
	async uninstall(pluginId: string): Promise<void> {
		await this.registry.unregister(pluginId);
		await this.loader.unload(pluginId);

		// Track uninstallation
		if (this.supabase) {
			await this.supabase
				.from('plugin_installations')
				.update({ uninstalled_at: new Date().toISOString() })
				.eq('plugin_id', pluginId)
				.is('uninstalled_at', null);
		}
	}

	/**
	 * Submit plugin review
	 */
	async submitReview(
		pluginId: string,
		rating: number,
		comment: string,
		userId: string,
		userName: string,
	): Promise<void> {
		if (!this.supabase) {
			throw new Error('Marketplace client not configured');
		}

		// Get installed version
		const plugin = await this.registry.get(pluginId);
		const version = plugin?.manifest.version || 'unknown';

		const { error } = await this.supabase.from('plugin_reviews').insert({
			plugin_id: pluginId,
			user_id: userId,
			user_name: userName,
			rating,
			comment,
			version,
			created_at: new Date().toISOString(),
			helpful: 0,
		});

		if (error) {
			throw new Error(`Failed to submit review: ${error.message}`);
		}

		// Update plugin rating
		await this.updatePluginRating(pluginId);
	}

	/**
	 * Get featured plugins
	 */
	async getFeatured(limit: number = 10): Promise<PluginListing[]> {
		return this.search({ featured: true, limit });
	}

	/**
	 * Get popular plugins
	 */
	async getPopular(limit: number = 10): Promise<PluginListing[]> {
		return this.search({ sortBy: 'downloads', limit });
	}

	/**
	 * Get top rated plugins
	 */
	async getTopRated(limit: number = 10): Promise<PluginListing[]> {
		return this.search({ sortBy: 'rating', minRating: 4, limit });
	}

	/**
	 * Get recently updated plugins
	 */
	async getRecent(limit: number = 10): Promise<PluginListing[]> {
		return this.search({ sortBy: 'recent', limit });
	}

	/**
	 * Check for updates
	 */
	async checkForUpdates(): Promise<PluginUpdate[]> {
		const installedPlugins = await this.registry.list();
		const updates: PluginUpdate[] = [];

		for (const plugin of installedPlugins) {
			try {
				const details = await this.getDetails(plugin.manifest.id);
				const currentVersion = plugin.manifest.version;
				const latestVersion = details.version;

				if (this.isNewerVersion(latestVersion, currentVersion)) {
					const versionInfo = details.versions.find((v) => v.version === latestVersion);

					updates.push({
						pluginId: plugin.manifest.id,
						currentVersion,
						latestVersion,
						releaseDate: versionInfo?.releaseDate || new Date(),
						changelog: versionInfo?.changelog || '',
						breaking: this.isBreakingChange(currentVersion, latestVersion),
						security: false, // Would be determined from changelog/metadata
					});
				}
			} catch (error) {
				console.error(`Failed to check updates for ${plugin.manifest.id}:`, error);
			}
		}

		return updates;
	}

	/**
	 * Convert database row to listing
	 */
	private rowToListing(row: Record<string, unknown>): PluginListing {
		return {
			id: row.id as string,
			name: row.name as string,
			description: row.description as string,
			version: row.version as string,
			author: row.author as PluginListing['author'],
			icon: row.icon as string | undefined,
			screenshots: (row.screenshots as string[]) || [],
			tags: (row.tags as string[]) || [],
			rating: (row.rating as number) || 0,
			ratingCount: (row.rating_count as number) || 0,
			downloads: (row.downloads as number) || 0,
			verified: (row.verified as boolean) || false,
			featured: (row.featured as boolean) || false,
			createdAt: new Date(row.created_at as string),
			updatedAt: new Date(row.updated_at as string),
		};
	}

	/**
	 * Convert database row to version
	 */
	private rowToVersion(row: Record<string, unknown>): PluginVersion {
		return {
			pluginId: row.plugin_id as string,
			version: row.version as string,
			releaseDate: new Date(row.release_date as string),
			changelog: row.changelog as string,
			downloadUrl: row.download_url as string,
			checksum: row.checksum as string,
			downloads: (row.downloads as number) || 0,
			deprecated: (row.deprecated as boolean) || false,
		};
	}

	/**
	 * Convert database row to review
	 */
	private rowToReview(row: Record<string, unknown>): PluginReview {
		return {
			id: row.id as string,
			pluginId: row.plugin_id as string,
			userId: row.user_id as string,
			userName: row.user_name as string,
			rating: row.rating as number,
			comment: row.comment as string,
			version: row.version as string,
			createdAt: new Date(row.created_at as string),
			helpful: (row.helpful as number) || 0,
		};
	}

	/**
	 * Update plugin average rating
	 */
	private async updatePluginRating(pluginId: string): Promise<void> {
		if (!this.supabase) {
			return;
		}

		const { data, error } = await this.supabase
			.from('plugin_reviews')
			.select('rating')
			.eq('plugin_id', pluginId);

		if (error || !data) {
			return;
		}

		const ratings = data.map((r) => r.rating as number);
		const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

		await this.supabase
			.from('marketplace_plugins')
			.update({ rating: avgRating, rating_count: ratings.length })
			.eq('id', pluginId);
	}

	/**
	 * Check if version is newer
	 */
	private isNewerVersion(version1: string, version2: string): boolean {
		const v1Parts = version1.split('.').map(Number);
		const v2Parts = version2.split('.').map(Number);

		for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
			const v1 = v1Parts[i] || 0;
			const v2 = v2Parts[i] || 0;

			if (v1 > v2) return true;
			if (v1 < v2) return false;
		}

		return false;
	}

	/**
	 * Check if version change is breaking
	 */
	private isBreakingChange(currentVersion: string, newVersion: string): boolean {
		const current = currentVersion.split('.').map(Number);
		const next = newVersion.split('.').map(Number);

		// Major version change is breaking
		return next[0] > current[0];
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}
}
