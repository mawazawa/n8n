import type { RetentionPolicy, DataType } from './types';
import { RetentionPolicySchema } from './types';

// ============================================================================
// Retention Manager
// ============================================================================

export class RetentionManager {
	private policies = new Map<DataType, RetentionPolicy>();
	private cleanupInterval = 3600000; // 1 hour
	private intervalTimer: NodeJS.Timeout | null = null;
	private dataProviders = new Map<DataType, () => Array<{ id: string; timestamp: number }>>();
	private deletionHandlers = new Map<DataType, (ids: string[]) => Promise<void>>();

	/**
	 * Set retention policy for a data type
	 */
	async setPolicy(policy: RetentionPolicy): Promise<void> {
		RetentionPolicySchema.parse(policy);
		this.policies.set(policy.dataType, policy);
	}

	/**
	 * Get retention policy for a data type
	 */
	getPolicy(dataType: DataType): RetentionPolicy | undefined {
		return this.policies.get(dataType);
	}

	/**
	 * List all retention policies
	 */
	listPolicies(): RetentionPolicy[] {
		return Array.from(this.policies.values());
	}

	/**
	 * Register data provider for a data type
	 */
	registerDataProvider(
		dataType: DataType,
		provider: () => Array<{ id: string; timestamp: number }>,
	): void {
		this.dataProviders.set(dataType, provider);
	}

	/**
	 * Register deletion handler for a data type
	 */
	registerDeletionHandler(
		dataType: DataType,
		handler: (ids: string[]) => Promise<void>,
	): void {
		this.deletionHandlers.set(dataType, handler);
	}

	/**
	 * Start automatic cleanup
	 */
	start(): void {
		if (this.intervalTimer) {
			throw new Error('Retention manager already started');
		}

		this.intervalTimer = setInterval(() => {
			void this.cleanup();
		}, this.cleanupInterval);
	}

	/**
	 * Stop automatic cleanup
	 */
	stop(): void {
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}
	}

	/**
	 * Run cleanup for all data types
	 */
	async cleanup(): Promise<CleanupResult> {
		const result: CleanupResult = {
			traces: { deleted: 0, movedToCold: 0 },
			metrics: { deleted: 0, movedToCold: 0 },
			logs: { deleted: 0, movedToCold: 0 },
		};

		for (const [dataType, policy] of this.policies.entries()) {
			const typeResult = await this.cleanupDataType(dataType, policy);
			result[dataType] = typeResult;
		}

		return result;
	}

	/**
	 * Cleanup a specific data type
	 */
	private async cleanupDataType(
		dataType: DataType,
		policy: RetentionPolicy,
	): Promise<{ deleted: number; movedToCold: number }> {
		const provider = this.dataProviders.get(dataType);
		const handler = this.deletionHandlers.get(dataType);

		if (!provider || !handler) {
			console.warn(`No provider or handler for ${dataType}`);
			return { deleted: 0, movedToCold: 0 };
		}

		const now = Date.now();
		const data = provider();

		// Parse durations
		const hotDuration = this.parseDuration(policy.hotStorageDuration);
		const coldDuration = policy.coldStorageDuration
			? this.parseDuration(policy.coldStorageDuration)
			: null;
		const deletionDuration = this.parseDuration(policy.deletionDuration);

		// Determine cutoff times
		const hotCutoff = now - hotDuration;
		const coldCutoff = coldDuration ? now - coldDuration : null;
		const deletionCutoff = now - deletionDuration;

		// Find items to delete
		const toDelete = data
			.filter(item => item.timestamp < deletionCutoff)
			.map(item => item.id);

		// Find items to move to cold storage
		const toMoveToCold = coldCutoff
			? data
				.filter(item => item.timestamp < hotCutoff && item.timestamp >= coldCutoff)
				.map(item => item.id)
			: [];

		// Execute deletions
		if (toDelete.length > 0) {
			await handler(toDelete);
		}

		// Note: Moving to cold storage would require additional handler
		// For now, we just track the count

		return {
			deleted: toDelete.length,
			movedToCold: toMoveToCold.length,
		};
	}

	/**
	 * Parse duration string to milliseconds
	 */
	private parseDuration(duration: string): number {
		const regex = /^(\d+)([smhd])$/;
		const match = regex.exec(duration);

		if (!match) {
			throw new Error(`Invalid duration format: ${duration}`);
		}

		const value = parseInt(match[1], 10);
		const unit = match[2];

		switch (unit) {
			case 's': return value * 1000;
			case 'm': return value * 60 * 1000;
			case 'h': return value * 60 * 60 * 1000;
			case 'd': return value * 24 * 60 * 60 * 1000;
			default: throw new Error(`Unknown time unit: ${unit}`);
		}
	}

	/**
	 * Get retention statistics
	 */
	async getStatistics(): Promise<RetentionStatistics> {
		const stats: RetentionStatistics = {
			traces: { total: 0, hot: 0, cold: 0, toDelete: 0 },
			metrics: { total: 0, hot: 0, cold: 0, toDelete: 0 },
			logs: { total: 0, hot: 0, cold: 0, toDelete: 0 },
		};

		const now = Date.now();

		for (const [dataType, policy] of this.policies.entries()) {
			const provider = this.dataProviders.get(dataType);
			if (!provider) continue;

			const data = provider();

			const hotDuration = this.parseDuration(policy.hotStorageDuration);
			const coldDuration = policy.coldStorageDuration
				? this.parseDuration(policy.coldStorageDuration)
				: null;
			const deletionDuration = this.parseDuration(policy.deletionDuration);

			const hotCutoff = now - hotDuration;
			const coldCutoff = coldDuration ? now - coldDuration : null;
			const deletionCutoff = now - deletionDuration;

			stats[dataType].total = data.length;
			stats[dataType].hot = data.filter(item => item.timestamp >= hotCutoff).length;

			if (coldCutoff) {
				stats[dataType].cold = data.filter(
					item => item.timestamp < hotCutoff && item.timestamp >= coldCutoff,
				).length;
			}

			stats[dataType].toDelete = data.filter(
				item => item.timestamp < deletionCutoff,
			).length;
		}

		return stats;
	}

	/**
	 * Force cleanup of specific data type
	 */
	async cleanupDataTypeNow(dataType: DataType): Promise<{ deleted: number; movedToCold: number }> {
		const policy = this.policies.get(dataType);
		if (!policy) {
			throw new Error(`No policy defined for ${dataType}`);
		}

		return this.cleanupDataType(dataType, policy);
	}

	/**
	 * Check if running
	 */
	isRunning(): boolean {
		return this.intervalTimer !== null;
	}

	/**
	 * Set cleanup interval
	 */
	setCleanupInterval(intervalMs: number): void {
		this.cleanupInterval = intervalMs;

		// Restart if running
		if (this.intervalTimer) {
			this.stop();
			this.start();
		}
	}
}

// ============================================================================
// Default Retention Policies
// ============================================================================

export class DefaultRetentionPolicies {
	/**
	 * Default policy for traces
	 */
	static traces(): RetentionPolicy {
		return {
			dataType: 'traces',
			hotStorageDuration: '7d',
			coldStorageDuration: '30d',
			deletionDuration: '90d',
		};
	}

	/**
	 * Default policy for metrics
	 */
	static metrics(): RetentionPolicy {
		return {
			dataType: 'metrics',
			hotStorageDuration: '24h',
			coldStorageDuration: '7d',
			deletionDuration: '30d',
		};
	}

	/**
	 * Default policy for logs
	 */
	static logs(): RetentionPolicy {
		return {
			dataType: 'logs',
			hotStorageDuration: '7d',
			coldStorageDuration: '30d',
			deletionDuration: '90d',
		};
	}

	/**
	 * GDPR-compliant policy (shorter retention)
	 */
	static gdprCompliant(): RetentionPolicy[] {
		return [
			{
				dataType: 'traces',
				hotStorageDuration: '7d',
				deletionDuration: '30d',
			},
			{
				dataType: 'metrics',
				hotStorageDuration: '7d',
				deletionDuration: '30d',
			},
			{
				dataType: 'logs',
				hotStorageDuration: '7d',
				deletionDuration: '30d',
			},
		];
	}

	/**
	 * Long-term retention policy
	 */
	static longTerm(): RetentionPolicy[] {
		return [
			{
				dataType: 'traces',
				hotStorageDuration: '30d',
				coldStorageDuration: '90d',
				deletionDuration: '365d',
			},
			{
				dataType: 'metrics',
				hotStorageDuration: '30d',
				coldStorageDuration: '90d',
				deletionDuration: '365d',
			},
			{
				dataType: 'logs',
				hotStorageDuration: '30d',
				coldStorageDuration: '90d',
				deletionDuration: '365d',
			},
		];
	}
}

// ============================================================================
// Types
// ============================================================================

export interface CleanupResult {
	traces: { deleted: number; movedToCold: number };
	metrics: { deleted: number; movedToCold: number };
	logs: { deleted: number; movedToCold: number };
}

export interface RetentionStatistics {
	traces: { total: number; hot: number; cold: number; toDelete: number };
	metrics: { total: number; hot: number; cold: number; toDelete: number };
	logs: { total: number; hot: number; cold: number; toDelete: number };
}
