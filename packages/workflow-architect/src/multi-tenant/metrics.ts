import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Metrics, MetricsSchema } from './types';

/**
 * Aggregation period
 */
export enum AggregationPeriod {
	HOUR = 'HOUR',
	DAY = 'DAY',
	WEEK = 'WEEK',
	MONTH = 'MONTH',
	YEAR = 'YEAR',
}

/**
 * Trend direction
 */
export enum TrendDirection {
	UP = 'UP',
	DOWN = 'DOWN',
	STABLE = 'STABLE',
}

/**
 * Metric trend
 */
export interface MetricTrend {
	metric: string;
	current: number;
	previous: number;
	change: number;
	changePercent: number;
	direction: TrendDirection;
}

/**
 * TenantMetrics handles per-tenant metrics and analytics
 */
export class TenantMetrics {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Collect metrics for a tenant
	 */
	async collect(tenantId: string, period?: { start: Date; end: Date }): Promise<Metrics> {
		const start = period?.start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
		const end = period?.end ?? new Date();

		const metrics: Metrics = {
			tenantId,
			period: { start, end },
			executions: await this.collectExecutionMetrics(tenantId, start, end),
			workflows: await this.collectWorkflowMetrics(tenantId),
			users: await this.collectUserMetrics(tenantId),
			storage: await this.collectStorageMetrics(tenantId),
			apiCalls: await this.collectAPICallMetrics(tenantId, start, end),
			webhooks: await this.collectWebhookMetrics(tenantId, start, end),
		};

		return MetricsSchema.parse(metrics);
	}

	/**
	 * Get metrics trends
	 */
	async getTrends(
		tenantId: string,
		metric: string,
		period: AggregationPeriod,
	): Promise<MetricTrend> {
		const now = new Date();
		const { currentPeriodStart, previousPeriodStart } = this.getPeriodBounds(now, period);

		// Get current period metrics
		const current = await this.collect(tenantId, {
			start: currentPeriodStart,
			end: now,
		});

		// Get previous period metrics
		const previous = await this.collect(tenantId, {
			start: previousPeriodStart,
			end: currentPeriodStart,
		});

		// Extract specific metric value
		const currentValue = this.extractMetricValue(current, metric);
		const previousValue = this.extractMetricValue(previous, metric);

		// Calculate change
		const change = currentValue - previousValue;
		const changePercent = previousValue === 0 ? 0 : (change / previousValue) * 100;

		// Determine direction
		let direction: TrendDirection;
		if (Math.abs(changePercent) < 5) {
			direction = TrendDirection.STABLE;
		} else if (change > 0) {
			direction = TrendDirection.UP;
		} else {
			direction = TrendDirection.DOWN;
		}

		return {
			metric,
			current: currentValue,
			previous: previousValue,
			change,
			changePercent,
			direction,
		};
	}

	/**
	 * Aggregate metrics across multiple tenants
	 */
	async aggregateAcrossTenants(
		tenantIds: string[],
		period?: { start: Date; end: Date },
	): Promise<Metrics> {
		const allMetrics = await Promise.all(
			tenantIds.map((tenantId) => this.collect(tenantId, period)),
		);

		// Aggregate metrics
		const aggregated: Metrics = {
			tenantId: 'ALL',
			period: period ?? {
				start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
				end: new Date(),
			},
			executions: {
				total: allMetrics.reduce((sum, m) => sum + m.executions.total, 0),
				successful: allMetrics.reduce((sum, m) => sum + m.executions.successful, 0),
				failed: allMetrics.reduce((sum, m) => sum + m.executions.failed, 0),
				manual: allMetrics.reduce((sum, m) => sum + m.executions.manual, 0),
				webhook: allMetrics.reduce((sum, m) => sum + m.executions.webhook, 0),
			},
			workflows: {
				total: allMetrics.reduce((sum, m) => sum + m.workflows.total, 0),
				active: allMetrics.reduce((sum, m) => sum + m.workflows.active, 0),
				inactive: allMetrics.reduce((sum, m) => sum + m.workflows.inactive, 0),
			},
			users: {
				total: allMetrics.reduce((sum, m) => sum + m.users.total, 0),
				active: allMetrics.reduce((sum, m) => sum + m.users.active, 0),
				invited: allMetrics.reduce((sum, m) => sum + m.users.invited, 0),
			},
			storage: {
				total: allMetrics.reduce((sum, m) => sum + m.storage.total, 0),
				workflows: allMetrics.reduce((sum, m) => sum + m.storage.workflows, 0),
				executions: allMetrics.reduce((sum, m) => sum + m.storage.executions, 0),
				credentials: allMetrics.reduce((sum, m) => sum + m.storage.credentials, 0),
			},
			apiCalls: allMetrics.reduce((sum, m) => sum + m.apiCalls, 0),
			webhooks: allMetrics.reduce((sum, m) => sum + m.webhooks, 0),
			cost: allMetrics.reduce(
				(sum, m) => ({
					compute: sum.compute + (m.cost?.compute ?? 0),
					storage: sum.storage + (m.cost?.storage ?? 0),
					bandwidth: sum.bandwidth + (m.cost?.bandwidth ?? 0),
					total: sum.total + (m.cost?.total ?? 0),
				}),
				{ compute: 0, storage: 0, bandwidth: 0, total: 0 },
			),
		};

		return MetricsSchema.parse(aggregated);
	}

	/**
	 * Get cost allocation by tenant
	 */
	async getCostAllocation(
		tenantIds: string[],
		period?: { start: Date; end: Date },
	): Promise<Map<string, { compute: number; storage: number; bandwidth: number; total: number }>> {
		const allocation = new Map<
			string,
			{ compute: number; storage: number; bandwidth: number; total: number }
		>();

		for (const tenantId of tenantIds) {
			const metrics = await this.collect(tenantId, period);
			allocation.set(tenantId, metrics.cost ?? { compute: 0, storage: 0, bandwidth: 0, total: 0 });
		}

		return allocation;
	}

	/**
	 * Track real-time metric
	 */
	async trackMetric(
		tenantId: string,
		metric: string,
		value: number,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		await this.supabase.from('tenant_metrics').insert({
			tenant_id: tenantId,
			metric,
			value,
			metadata,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Get time-series data
	 */
	async getTimeSeries(
		tenantId: string,
		metric: string,
		period: { start: Date; end: Date },
		aggregation: AggregationPeriod,
	): Promise<Array<{ timestamp: Date; value: number }>> {
		// This would query time-series data with proper aggregation
		console.log(`Getting time series for ${metric} in tenant ${tenantId}`);
		return [];
	}

	/**
	 * Collect execution metrics
	 */
	private async collectExecutionMetrics(
		tenantId: string,
		start: Date,
		end: Date,
	): Promise<{
		total: number;
		successful: number;
		failed: number;
		manual: number;
		webhook: number;
	}> {
		const { count: total } = await this.supabase
			.from('executions')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		const { count: successful } = await this.supabase
			.from('executions')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('status', 'success')
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		const { count: failed } = await this.supabase
			.from('executions')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('status', 'failed')
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		const { count: manual } = await this.supabase
			.from('executions')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('mode', 'manual')
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		const { count: webhook } = await this.supabase
			.from('executions')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('mode', 'webhook')
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		return {
			total: total ?? 0,
			successful: successful ?? 0,
			failed: failed ?? 0,
			manual: manual ?? 0,
			webhook: webhook ?? 0,
		};
	}

	/**
	 * Collect workflow metrics
	 */
	private async collectWorkflowMetrics(
		tenantId: string,
	): Promise<{ total: number; active: number; inactive: number }> {
		const { count: total } = await this.supabase
			.from('workflows')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId);

		const { count: active } = await this.supabase
			.from('workflows')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('active', true);

		return {
			total: total ?? 0,
			active: active ?? 0,
			inactive: (total ?? 0) - (active ?? 0),
		};
	}

	/**
	 * Collect user metrics
	 */
	private async collectUserMetrics(
		tenantId: string,
	): Promise<{ total: number; active: number; invited: number }> {
		const { count: total } = await this.supabase
			.from('users')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId);

		const { count: active } = await this.supabase
			.from('users')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('status', 'active');

		const { count: invited } = await this.supabase
			.from('users')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.eq('status', 'invited');

		return {
			total: total ?? 0,
			active: active ?? 0,
			invited: invited ?? 0,
		};
	}

	/**
	 * Collect storage metrics
	 */
	private async collectStorageMetrics(
		tenantId: string,
	): Promise<{ total: number; workflows: number; executions: number; credentials: number }> {
		// This would calculate actual storage usage
		// For now, return placeholder values
		return {
			total: 0,
			workflows: 0,
			executions: 0,
			credentials: 0,
		};
	}

	/**
	 * Collect API call metrics
	 */
	private async collectAPICallMetrics(
		tenantId: string,
		start: Date,
		end: Date,
	): Promise<number> {
		const { count } = await this.supabase
			.from('api_calls')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		return count ?? 0;
	}

	/**
	 * Collect webhook metrics
	 */
	private async collectWebhookMetrics(
		tenantId: string,
		start: Date,
		end: Date,
	): Promise<number> {
		const { count } = await this.supabase
			.from('webhook_calls')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.gte('created_at', start.toISOString())
			.lte('created_at', end.toISOString());

		return count ?? 0;
	}

	/**
	 * Get period bounds for trend analysis
	 */
	private getPeriodBounds(
		now: Date,
		period: AggregationPeriod,
	): { currentPeriodStart: Date; previousPeriodStart: Date } {
		const currentPeriodStart = new Date(now);
		const previousPeriodStart = new Date(now);

		switch (period) {
			case AggregationPeriod.HOUR:
				currentPeriodStart.setHours(now.getHours() - 1);
				previousPeriodStart.setHours(now.getHours() - 2);
				break;
			case AggregationPeriod.DAY:
				currentPeriodStart.setDate(now.getDate() - 1);
				previousPeriodStart.setDate(now.getDate() - 2);
				break;
			case AggregationPeriod.WEEK:
				currentPeriodStart.setDate(now.getDate() - 7);
				previousPeriodStart.setDate(now.getDate() - 14);
				break;
			case AggregationPeriod.MONTH:
				currentPeriodStart.setMonth(now.getMonth() - 1);
				previousPeriodStart.setMonth(now.getMonth() - 2);
				break;
			case AggregationPeriod.YEAR:
				currentPeriodStart.setFullYear(now.getFullYear() - 1);
				previousPeriodStart.setFullYear(now.getFullYear() - 2);
				break;
		}

		return { currentPeriodStart, previousPeriodStart };
	}

	/**
	 * Extract metric value from metrics object
	 */
	private extractMetricValue(metrics: Metrics, metric: string): number {
		switch (metric) {
			case 'executions.total':
				return metrics.executions.total;
			case 'executions.successful':
				return metrics.executions.successful;
			case 'executions.failed':
				return metrics.executions.failed;
			case 'workflows.total':
				return metrics.workflows.total;
			case 'workflows.active':
				return metrics.workflows.active;
			case 'users.total':
				return metrics.users.total;
			case 'storage.total':
				return metrics.storage.total;
			case 'apiCalls':
				return metrics.apiCalls;
			case 'webhooks':
				return metrics.webhooks;
			default:
				return 0;
		}
	}
}
