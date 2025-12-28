import semver from 'semver';
import type { Plugin, PluginUpdate } from './types';
import { PluginRegistry } from './registry';
import { PluginLoader } from './loader';
import { MarketplaceClient } from './marketplace';

/**
 * Update strategy
 */
export enum UpdateStrategy {
	/** Update to latest version immediately */
	IMMEDIATE = 'immediate',
	/** Schedule update for later */
	SCHEDULED = 'scheduled',
	/** Manual approval required */
	MANUAL = 'manual',
	/** Auto-update minor/patch versions only */
	AUTO_MINOR = 'auto_minor',
}

/**
 * Update schedule
 */
export interface UpdateSchedule {
	pluginId: string;
	targetVersion: string;
	scheduledAt: Date;
	strategy: UpdateStrategy;
}

/**
 * Plugin updater with auto-update support
 */
export class PluginUpdater {
	private updateSchedules = new Map<string, UpdateSchedule>();
	private updateCheckInterval: NodeJS.Timeout | null = null;
	private rollbackHistory = new Map<string, Plugin[]>();

	constructor(
		private registry: PluginRegistry,
		private loader: PluginLoader,
		private marketplace: MarketplaceClient,
		private defaultStrategy: UpdateStrategy = UpdateStrategy.MANUAL,
	) {}

	/**
	 * Check for available updates
	 */
	async checkForUpdates(): Promise<PluginUpdate[]> {
		return this.marketplace.checkForUpdates();
	}

	/**
	 * Update a plugin to specific version
	 */
	async update(pluginId: string, targetVersion?: string): Promise<void> {
		// Get current plugin
		const currentPlugin = await this.registry.get(pluginId);
		if (!currentPlugin) {
			throw new Error(`Plugin ${pluginId} is not installed`);
		}

		// Save current version for rollback
		this.saveForRollback(pluginId, currentPlugin);

		// Get target version
		const version = targetVersion || (await this.getLatestVersion(pluginId));

		// Validate version
		if (!semver.valid(version)) {
			throw new Error(`Invalid version: ${version}`);
		}

		// Check if already on target version
		if (currentPlugin.manifest.version === version) {
			console.log(`Plugin ${pluginId} is already on version ${version}`);
			return;
		}

		try {
			// Unload current version
			await this.loader.unload(pluginId);

			// Install new version
			await this.marketplace.install(pluginId, version);

			console.log(`Plugin ${pluginId} updated from ${currentPlugin.manifest.version} to ${version}`);
		} catch (error) {
			// Rollback on failure
			console.error(`Failed to update plugin ${pluginId}:`, error);
			await this.rollback(pluginId);
			throw error;
		}
	}

	/**
	 * Schedule an update
	 */
	scheduleUpdate(
		pluginId: string,
		targetVersion: string,
		scheduledAt: Date,
		strategy: UpdateStrategy = this.defaultStrategy,
	): void {
		const schedule: UpdateSchedule = {
			pluginId,
			targetVersion,
			scheduledAt,
			strategy,
		};

		this.updateSchedules.set(pluginId, schedule);
	}

	/**
	 * Cancel scheduled update
	 */
	cancelScheduledUpdate(pluginId: string): boolean {
		return this.updateSchedules.delete(pluginId);
	}

	/**
	 * Get scheduled updates
	 */
	getScheduledUpdates(): UpdateSchedule[] {
		return Array.from(this.updateSchedules.values());
	}

	/**
	 * Process scheduled updates
	 */
	async processScheduledUpdates(): Promise<void> {
		const now = new Date();

		for (const [pluginId, schedule] of this.updateSchedules.entries()) {
			if (schedule.scheduledAt <= now) {
				try {
					await this.update(pluginId, schedule.targetVersion);
					this.updateSchedules.delete(pluginId);
				} catch (error) {
					console.error(`Failed to process scheduled update for ${pluginId}:`, error);
				}
			}
		}
	}

	/**
	 * Enable auto-update with strategy
	 */
	enableAutoUpdate(strategy: UpdateStrategy = UpdateStrategy.AUTO_MINOR): void {
		// Clear existing interval
		this.disableAutoUpdate();

		// Check for updates every hour
		this.updateCheckInterval = setInterval(async () => {
			await this.performAutoUpdate(strategy);
		}, 60 * 60 * 1000);

		// Run initial check
		this.performAutoUpdate(strategy);
	}

	/**
	 * Disable auto-update
	 */
	disableAutoUpdate(): void {
		if (this.updateCheckInterval) {
			clearInterval(this.updateCheckInterval);
			this.updateCheckInterval = null;
		}
	}

	/**
	 * Perform auto-update based on strategy
	 */
	private async performAutoUpdate(strategy: UpdateStrategy): Promise<void> {
		const updates = await this.checkForUpdates();

		for (const update of updates) {
			try {
				if (this.shouldAutoUpdate(update, strategy)) {
					await this.update(update.pluginId, update.latestVersion);
				}
			} catch (error) {
				console.error(`Auto-update failed for ${update.pluginId}:`, error);
			}
		}
	}

	/**
	 * Determine if update should be applied based on strategy
	 */
	private shouldAutoUpdate(update: PluginUpdate, strategy: UpdateStrategy): boolean {
		switch (strategy) {
			case UpdateStrategy.IMMEDIATE:
				return true;

			case UpdateStrategy.AUTO_MINOR:
				// Only auto-update if not a breaking change
				return !update.breaking;

			case UpdateStrategy.MANUAL:
				return false;

			case UpdateStrategy.SCHEDULED:
				// Handled by scheduled updates
				return false;

			default:
				return false;
		}
	}

	/**
	 * Rollback to previous version
	 */
	async rollback(pluginId: string, steps: number = 1): Promise<void> {
		const history = this.rollbackHistory.get(pluginId);
		if (!history || history.length === 0) {
			throw new Error(`No rollback history for plugin ${pluginId}`);
		}

		if (steps > history.length) {
			throw new Error(
				`Cannot rollback ${steps} versions, only ${history.length} versions in history`,
			);
		}

		// Get target version
		const targetPlugin = history[history.length - steps];

		try {
			// Unload current version
			await this.loader.unload(pluginId);

			// Register previous version
			await this.registry.register(targetPlugin);

			// Remove from history
			history.splice(history.length - steps, steps);

			console.log(`Rolled back plugin ${pluginId} to version ${targetPlugin.manifest.version}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to rollback plugin ${pluginId}: ${message}`);
		}
	}

	/**
	 * Get rollback history
	 */
	getRollbackHistory(pluginId: string): Plugin[] {
		return this.rollbackHistory.get(pluginId) || [];
	}

	/**
	 * Clear rollback history
	 */
	clearRollbackHistory(pluginId: string): void {
		this.rollbackHistory.delete(pluginId);
	}

	/**
	 * Save plugin for rollback
	 */
	private saveForRollback(pluginId: string, plugin: Plugin): void {
		let history = this.rollbackHistory.get(pluginId);
		if (!history) {
			history = [];
			this.rollbackHistory.set(pluginId, history);
		}

		// Keep last 5 versions
		if (history.length >= 5) {
			history.shift();
		}

		history.push(plugin);
	}

	/**
	 * Get latest version from marketplace
	 */
	private async getLatestVersion(pluginId: string): Promise<string> {
		const details = await this.marketplace.getDetails(pluginId);
		return details.version;
	}

	/**
	 * Cleanup resources
	 */
	cleanup(): void {
		this.disableAutoUpdate();
		this.updateSchedules.clear();
		this.rollbackHistory.clear();
	}
}
