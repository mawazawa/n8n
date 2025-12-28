import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	UsageReport,
	UserUsage,
	TrendData,
	TrendDataPoint,
	QuotaType,
	QuotaPeriod,
	UsageData,
} from './types';
import type { UsageTracker } from './tracking';
import type { PlanManager } from './plans';

/**
 * Configuration for report generator
 */
export interface ReportGeneratorConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
	/** Usage tracker instance */
	usageTracker: UsageTracker;
	/** Plan manager instance */
	planManager: PlanManager;
}

/**
 * Export format for reports
 */
export enum ExportFormat {
	JSON = 'json',
	CSV = 'csv',
	PDF = 'pdf',
}

/**
 * Generates usage reports and analytics
 *
 * Features:
 * - Comprehensive usage reports
 * - Top user rankings
 * - Usage trends
 * - Export to CSV/JSON
 * - Cost calculations
 * - Historical comparisons
 *
 * @example
 * ```typescript
 * const reportGenerator = new ReportGenerator({
 *   supabase,
 *   usageTracker,
 *   planManager,
 * });
 *
 * // Generate a monthly usage report
 * const report = await reportGenerator.generateUsageReport('user-123', {
 *   start: new Date('2024-01-01'),
 *   end: new Date('2024-01-31'),
 * });
 *
 * // Get top users by executions
 * const topUsers = await reportGenerator.getTopUsers(QuotaType.EXECUTIONS, 10);
 *
 * // Export report to CSV
 * const csv = await reportGenerator.exportReport(report, ExportFormat.CSV);
 * ```
 */
export class ReportGenerator {
	private readonly supabase: SupabaseClient;
	private readonly usageTracker: UsageTracker;
	private readonly planManager: PlanManager;

	constructor(config: ReportGeneratorConfig) {
		this.supabase = config.supabase;
		this.usageTracker = config.usageTracker;
		this.planManager = config.planManager;
	}

	/**
	 * Generate a comprehensive usage report for a user
	 *
	 * @param userId - User identifier
	 * @param period - Report period
	 * @returns Usage report
	 */
	async generateUsageReport(
		userId: string,
		period: { start: Date; end: Date },
	): Promise<UsageReport> {
		// Get user's plan
		const plan = await this.planManager.getUserPlan(userId);

		// Get usage for all quota types
		const usageMap = new Map<QuotaType, UsageData>();

		for (const quota of plan.quotas) {
			const usage = await this.getUsageForPeriod(userId, quota.type, period);
			usageMap.set(quota.type, usage);
		}

		// Calculate costs if applicable
		const costs = plan.price > 0 ? await this.calculateCosts(userId, usageMap) : undefined;

		return {
			userId,
			period,
			plan,
			usage: usageMap,
			costs,
		};
	}

	/**
	 * Get top users by usage for a quota type
	 *
	 * @param quotaType - Type of quota
	 * @param limit - Number of users to return
	 * @param period - Time period (optional, defaults to current month)
	 * @returns Array of top users
	 */
	async getTopUsers(
		quotaType: QuotaType,
		limit = 10,
		period?: { start: Date; end: Date },
	): Promise<UserUsage[]> {
		const { start, end } = period ?? this.getCurrentMonthPeriod();

		const { data, error } = await this.supabase.rpc('get_top_users', {
			p_quota_type: quotaType,
			p_start_time: start.toISOString(),
			p_end_time: end.toISOString(),
			p_limit: limit,
		});

		if (error) {
			throw new Error(`Failed to get top users: ${error.message}`);
		}

		return (
			data?.map(
				(
					row: { user_id: string; total: number; rank: number },
					index: number,
				): UserUsage => ({
					userId: row.user_id,
					quotaType,
					usage: row.total,
					rank: index + 1,
				}),
			) ?? []
		);
	}

	/**
	 * Get usage trends for a quota type
	 *
	 * @param quotaType - Type of quota
	 * @param period - Time period
	 * @param granularity - Data point granularity
	 * @returns Trend data
	 */
	async getUsageTrends(
		quotaType: QuotaType,
		period: { start: Date; end: Date },
		granularity: 'hour' | 'day' | 'week' = 'day',
	): Promise<TrendData> {
		const { data, error } = await this.supabase.rpc('get_usage_trends', {
			p_quota_type: quotaType,
			p_start_time: period.start.toISOString(),
			p_end_time: period.end.toISOString(),
			p_granularity: granularity,
		});

		if (error) {
			throw new Error(`Failed to get usage trends: ${error.message}`);
		}

		const dataPoints: TrendDataPoint[] =
			data?.map((row: { timestamp: string; total: number; user_count: number }) => ({
				timestamp: new Date(row.timestamp),
				value: row.total,
				userCount: row.user_count,
			})) ?? [];

		// Calculate trend direction
		const { trend, changePercent } = this.calculateTrend(dataPoints);

		return {
			quotaType,
			dataPoints,
			trend,
			changePercent,
		};
	}

	/**
	 * Export a report to a specific format
	 *
	 * @param report - Usage report
	 * @param format - Export format
	 * @returns Exported data as string
	 */
	async exportReport(report: UsageReport, format: ExportFormat): Promise<string> {
		switch (format) {
			case ExportFormat.JSON:
				return this.exportToJSON(report);
			case ExportFormat.CSV:
				return this.exportToCSV(report);
			case ExportFormat.PDF:
				throw new Error('PDF export not yet implemented');
			default:
				throw new Error(`Unsupported export format: ${format}`);
		}
	}

	/**
	 * Get usage comparison between two periods
	 *
	 * @param userId - User identifier
	 * @param currentPeriod - Current period
	 * @param previousPeriod - Previous period
	 * @returns Comparison data
	 */
	async compareUsage(
		userId: string,
		currentPeriod: { start: Date; end: Date },
		previousPeriod: { start: Date; end: Date },
	): Promise<{
		current: UsageReport;
		previous: UsageReport;
		changes: Map<QuotaType, { absolute: number; percent: number }>;
	}> {
		const [current, previous] = await Promise.all([
			this.generateUsageReport(userId, currentPeriod),
			this.generateUsageReport(userId, previousPeriod),
		]);

		const changes = new Map<QuotaType, { absolute: number; percent: number }>();

		for (const [quotaType, currentUsage] of current.usage.entries()) {
			const previousUsage = previous.usage.get(quotaType);
			if (previousUsage) {
				const absolute = currentUsage.total - previousUsage.total;
				const percent =
					previousUsage.total > 0 ? (absolute / previousUsage.total) * 100 : 0;
				changes.set(quotaType, { absolute, percent });
			}
		}

		return { current, previous, changes };
	}

	/**
	 * Get usage summary across all users
	 *
	 * @param period - Time period
	 * @returns Summary data
	 */
	async getGlobalSummary(period: { start: Date; end: Date }): Promise<{
		totalUsers: number;
		usage: Map<QuotaType, number>;
		averageUsage: Map<QuotaType, number>;
	}> {
		const { data, error } = await this.supabase.rpc('get_global_usage_summary', {
			p_start_time: period.start.toISOString(),
			p_end_time: period.end.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to get global summary: ${error.message}`);
		}

		const totalUsers = data?.[0]?.total_users ?? 0;
		const usage = new Map<QuotaType, number>();
		const averageUsage = new Map<QuotaType, number>();

		for (const row of data ?? []) {
			const quotaType = row.quota_type as QuotaType;
			usage.set(quotaType, row.total_usage);
			averageUsage.set(quotaType, totalUsers > 0 ? row.total_usage / totalUsers : 0);
		}

		return { totalUsers, usage, averageUsage };
	}

	/**
	 * Get usage for a specific period
	 */
	private async getUsageForPeriod(
		userId: string,
		quotaType: QuotaType,
		period: { start: Date; end: Date },
	): Promise<UsageData> {
		const { data, error } = await this.supabase.rpc('get_usage_for_period', {
			p_user_id: userId,
			p_quota_type: quotaType,
			p_start_time: period.start.toISOString(),
			p_end_time: period.end.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to get usage for period: ${error.message}`);
		}

		const total = data?.[0]?.total ?? 0;

		return {
			userId,
			quotaType,
			period: QuotaPeriod.MONTH, // Default to month
			total,
			startTime: period.start,
			endTime: period.end,
		};
	}

	/**
	 * Calculate costs for usage
	 */
	private async calculateCosts(
		userId: string,
		usage: Map<QuotaType, UsageData>,
	): Promise<{ base: number; overages: number; total: number }> {
		const plan = await this.planManager.getUserPlan(userId);

		let base = plan.price;
		let overages = 0;

		// Calculate overage charges
		for (const [quotaType, usageData] of usage.entries()) {
			const quotaConfig = plan.quotas.find((q) => q.type === quotaType);
			if (quotaConfig) {
				const overage = Math.max(0, usageData.total - quotaConfig.limit);
				if (overage > 0) {
					// $0.01 per unit overage (example rate)
					overages += overage * 1;
				}
			}
		}

		return {
			base,
			overages,
			total: base + overages,
		};
	}

	/**
	 * Calculate trend direction and change percent
	 */
	private calculateTrend(
		dataPoints: TrendDataPoint[],
	): { trend: 'up' | 'down' | 'stable'; changePercent: number } {
		if (dataPoints.length < 2) {
			return { trend: 'stable', changePercent: 0 };
		}

		const first = dataPoints[0].value;
		const last = dataPoints[dataPoints.length - 1].value;
		const change = last - first;
		const changePercent = first > 0 ? (change / first) * 100 : 0;

		let trend: 'up' | 'down' | 'stable';
		if (Math.abs(changePercent) < 5) {
			trend = 'stable';
		} else if (changePercent > 0) {
			trend = 'up';
		} else {
			trend = 'down';
		}

		return { trend, changePercent };
	}

	/**
	 * Export report to JSON
	 */
	private exportToJSON(report: UsageReport): string {
		// Convert Map to plain object for JSON serialization
		const usageObj: Record<string, UsageData> = {};
		for (const [key, value] of report.usage.entries()) {
			usageObj[key] = value;
		}

		const exportData = {
			...report,
			usage: usageObj,
		};

		return JSON.stringify(exportData, null, 2);
	}

	/**
	 * Export report to CSV
	 */
	private exportToCSV(report: UsageReport): string {
		const rows: string[] = [];

		// Header
		rows.push('Quota Type,Used,Limit,Percentage,Period');

		// Data rows
		for (const [quotaType, usage] of report.usage.entries()) {
			const quotaConfig = report.plan.quotas.find((q) => q.type === quotaType);
			const limit = quotaConfig?.limit ?? 0;
			const percentage = limit > 0 ? ((usage.total / limit) * 100).toFixed(2) : '0';

			rows.push(`${quotaType},${usage.total},${limit},${percentage}%,${usage.period}`);
		}

		// Add costs if available
		if (report.costs) {
			rows.push('');
			rows.push('Costs');
			rows.push(`Base,${(report.costs.base / 100).toFixed(2)}`);
			rows.push(`Overages,${(report.costs.overages / 100).toFixed(2)}`);
			rows.push(`Total,${(report.costs.total / 100).toFixed(2)}`);
		}

		return rows.join('\n');
	}

	/**
	 * Get current month period
	 */
	private getCurrentMonthPeriod(): { start: Date; end: Date } {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
		return { start, end };
	}
}

/**
 * Create a report generator instance
 *
 * @param config - Report generator configuration
 * @returns ReportGenerator instance
 */
export function createReportGenerator(config: ReportGeneratorConfig): ReportGenerator {
	return new ReportGenerator(config);
}
