import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuotaType, QuotaPeriod, Usage, UsageData } from './types';

/**
 * Configuration for usage tracker
 */
export interface UsageTrackerConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
	/** Batch size for bulk inserts (default: 100) */
	batchSize?: number;
	/** Flush interval in milliseconds (default: 5000) */
	flushInterval?: number;
	/** Enable auto-flush (default: true) */
	autoFlush?: boolean;
}

/**
 * Usage record for batching
 */
interface UsageRecord {
	userId: string;
	quotaType: QuotaType;
	amount: number;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

/**
 * High-performance usage tracker with batching and async processing
 *
 * Features:
 * - Async batching for reduced database load
 * - Periodic flush to database
 * - In-memory buffering
 * - Aggregation queries
 * - Time-series data support
 *
 * @example
 * ```typescript
 * const tracker = new UsageTracker({ supabase });
 *
 * // Track usage (buffered)
 * await tracker.track('user-123', QuotaType.EXECUTIONS, 1);
 *
 * // Get aggregated usage
 * const usage = await tracker.getUsage('user-123', QuotaType.EXECUTIONS, QuotaPeriod.DAY);
 * console.log(`Used ${usage.total} executions today`);
 *
 * // Manually flush buffer
 * await tracker.flush();
 * ```
 */
export class UsageTracker {
	private readonly supabase: SupabaseClient;
	private readonly batchSize: number;
	private readonly flushInterval: number;
	private readonly buffer: UsageRecord[];
	private flushTimer?: NodeJS.Timeout;

	constructor(config: UsageTrackerConfig) {
		this.supabase = config.supabase;
		this.batchSize = config.batchSize ?? 100;
		this.flushInterval = config.flushInterval ?? 5000;
		this.buffer = [];

		if (config.autoFlush !== false) {
			this.startAutoFlush();
		}
	}

	/**
	 * Track usage for a user and quota type
	 *
	 * Usage is buffered and flushed periodically for performance.
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @param amount - Amount to track (default: 1)
	 * @param metadata - Additional metadata (optional)
	 */
	async track(
		userId: string,
		quotaType: QuotaType,
		amount = 1,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		const record: UsageRecord = {
			userId,
			quotaType,
			amount,
			timestamp: new Date(),
			metadata,
		};

		this.buffer.push(record);

		// Flush if buffer is full
		if (this.buffer.length >= this.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Get aggregated usage for a user and quota type
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @param period - Aggregation period
	 * @returns Aggregated usage data
	 */
	async getUsage(userId: string, quotaType: QuotaType, period: QuotaPeriod): Promise<UsageData> {
		const { startTime, endTime } = this.getPeriodRange(period);

		// Query aggregated usage
		const { data, error } = await this.supabase.rpc('get_usage_aggregation', {
			p_user_id: userId,
			p_quota_type: quotaType,
			p_start_time: startTime.toISOString(),
			p_end_time: endTime.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to get usage: ${error.message}`);
		}

		const total = data?.[0]?.total ?? 0;

		return {
			userId,
			quotaType,
			period,
			total,
			startTime,
			endTime,
		};
	}

	/**
	 * Get usage with breakdown by sub-period
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota
	 * @param period - Aggregation period
	 * @param granularity - Breakdown granularity (hour, day)
	 * @returns Usage data with breakdown
	 */
	async getUsageBreakdown(
		userId: string,
		quotaType: QuotaType,
		period: QuotaPeriod,
		granularity: 'hour' | 'day' = 'hour',
	): Promise<UsageData> {
		const { startTime, endTime } = this.getPeriodRange(period);

		// Query usage breakdown
		const { data, error } = await this.supabase.rpc('get_usage_breakdown', {
			p_user_id: userId,
			p_quota_type: quotaType,
			p_start_time: startTime.toISOString(),
			p_end_time: endTime.toISOString(),
			p_granularity: granularity,
		});

		if (error) {
			throw new Error(`Failed to get usage breakdown: ${error.message}`);
		}

		const breakdown =
			data?.map((row: { timestamp: string; amount: number }) => ({
				timestamp: new Date(row.timestamp),
				amount: row.amount,
			})) ?? [];

		const total = breakdown.reduce((sum, b) => sum + b.amount, 0);

		return {
			userId,
			quotaType,
			period,
			total,
			startTime,
			endTime,
			breakdown,
		};
	}

	/**
	 * Get usage for multiple quota types
	 *
	 * @param userId - User identifier
	 * @param quotaTypes - Array of quota types
	 * @param period - Aggregation period
	 * @returns Map of quota type to usage data
	 */
	async getMultipleUsage(
		userId: string,
		quotaTypes: QuotaType[],
		period: QuotaPeriod,
	): Promise<Map<QuotaType, UsageData>> {
		const results = await Promise.all(
			quotaTypes.map((type) => this.getUsage(userId, type, period)),
		);

		return new Map(results.map((usage) => [usage.quotaType, usage]));
	}

	/**
	 * Get total usage across all users for a quota type
	 *
	 * @param quotaType - Type of quota
	 * @param period - Aggregation period
	 * @returns Total usage
	 */
	async getTotalUsage(quotaType: QuotaType, period: QuotaPeriod): Promise<number> {
		const { startTime, endTime } = this.getPeriodRange(period);

		const { data, error } = await this.supabase.rpc('get_total_usage', {
			p_quota_type: quotaType,
			p_start_time: startTime.toISOString(),
			p_end_time: endTime.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to get total usage: ${error.message}`);
		}

		return data?.[0]?.total ?? 0;
	}

	/**
	 * Get recent usage events
	 *
	 * @param userId - User identifier
	 * @param quotaType - Type of quota (optional)
	 * @param limit - Maximum number of events (default: 100)
	 * @returns Array of usage events
	 */
	async getRecentUsage(
		userId: string,
		quotaType?: QuotaType,
		limit = 100,
	): Promise<Usage[]> {
		let query = this.supabase
			.from('usage_logs')
			.select('*')
			.eq('user_id', userId)
			.order('timestamp', { ascending: false })
			.limit(limit);

		if (quotaType) {
			query = query.eq('quota_type', quotaType);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get recent usage: ${error.message}`);
		}

		return (
			data?.map((row) => ({
				userId: row.user_id,
				quotaType: row.quota_type,
				used: row.amount,
				timestamp: new Date(row.timestamp),
				metadata: row.metadata,
			})) ?? []
		);
	}

	/**
	 * Flush buffered usage records to database
	 *
	 * @returns Number of records flushed
	 */
	async flush(): Promise<number> {
		if (this.buffer.length === 0) {
			return 0;
		}

		// Extract records and clear buffer
		const records = this.buffer.splice(0, this.buffer.length);

		try {
			// Bulk insert
			const { error } = await this.supabase.from('usage_logs').insert(
				records.map((r) => ({
					user_id: r.userId,
					quota_type: r.quotaType,
					amount: r.amount,
					timestamp: r.timestamp.toISOString(),
					metadata: r.metadata,
				})),
			);

			if (error) {
				console.error('Failed to flush usage logs:', error);
				// Re-add failed records to buffer
				this.buffer.push(...records);
				throw new Error(`Failed to flush usage logs: ${error.message}`);
			}

			return records.length;
		} catch (error) {
			console.error('Error flushing usage logs:', error);
			throw error;
		}
	}

	/**
	 * Start automatic periodic flushing
	 */
	private startAutoFlush(): void {
		this.flushTimer = setInterval(() => {
			this.flush().catch((err) => {
				console.error('Auto-flush failed:', err);
			});
		}, this.flushInterval);
	}

	/**
	 * Stop automatic flushing and cleanup
	 */
	async destroy(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}

		// Flush remaining records
		await this.flush();
	}

	/**
	 * Get time range for a period
	 */
	private getPeriodRange(period: QuotaPeriod): { startTime: Date; endTime: Date } {
		const endTime = new Date();
		const startTime = new Date();

		switch (period) {
			case 'minute':
				startTime.setMinutes(startTime.getMinutes() - 1);
				break;
			case 'hour':
				startTime.setHours(startTime.getHours() - 1);
				break;
			case 'day':
				startTime.setDate(startTime.getDate() - 1);
				break;
			case 'month':
				startTime.setMonth(startTime.getMonth() - 1);
				break;
		}

		return { startTime, endTime };
	}

	/**
	 * Get buffer size (for testing/monitoring)
	 */
	getBufferSize(): number {
		return this.buffer.length;
	}
}

/**
 * Create a usage tracker instance
 *
 * @param supabase - Supabase client
 * @param config - Additional configuration
 * @returns UsageTracker instance
 */
export function createUsageTracker(
	supabase: SupabaseClient,
	config?: Omit<UsageTrackerConfig, 'supabase'>,
): UsageTracker {
	return new UsageTracker({ supabase, ...config });
}
