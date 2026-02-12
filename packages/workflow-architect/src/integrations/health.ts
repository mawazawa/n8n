import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IntegrationRegistry } from './registry';
import { HealthStatus, HealthStatusSchema, HealthReport, Integration, IntegrationStatus } from './types';
import { HttpConnector } from './connectors/http';
import { GraphQLConnector } from './connectors/graphql';
import { DatabaseConnector } from './connectors/database';
import { FileConnector } from './connectors/file';
import { QueueConnector } from './connectors/queue';

/**
 * Health Checker
 * Monitors integration health and performs periodic checks
 */
export class HealthChecker {
	private registry: IntegrationRegistry;
	private supabase: SupabaseClient;
	private intervals: Map<string, NodeJS.Timeout>;
	private onFailure?: (integrationId: string, error: string) => void;

	constructor(
		registry: IntegrationRegistry,
		supabaseUrl: string,
		supabaseKey: string,
		onFailure?: (integrationId: string, error: string) => void,
	) {
		this.registry = registry;
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.intervals = new Map();
		this.onFailure = onFailure;
	}

	/**
	 * Check health of a specific integration
	 */
	async check(integrationId: string): Promise<HealthStatus> {
		const startTime = Date.now();

		try {
			// Get integration
			const integration = await this.registry.get(integrationId);

			// Create connector and test
			const connector = this.createConnector(integration);
			const isHealthy = await connector.test();

			const responseTime = Date.now() - startTime;

			const status: HealthStatus = {
				integrationId,
				status: isHealthy ? 'healthy' : 'unhealthy',
				lastChecked: new Date(),
				responseTime,
				details: {
					connectorType: integration.config.connectorType,
					status: connector.getStatus(),
				},
			};

			// Store health status
			await this.storeHealthStatus(status);

			// Update integration status if needed
			if (!isHealthy && integration.status === IntegrationStatus.CONNECTED) {
				await this.registry.updateStatus(integrationId, IntegrationStatus.ERROR, 'Health check failed');
				if (this.onFailure) {
					this.onFailure(integrationId, 'Health check failed');
				}
			} else if (isHealthy && integration.status === IntegrationStatus.ERROR) {
				await this.registry.updateStatus(integrationId, IntegrationStatus.CONNECTED);
			}

			return HealthStatusSchema.parse(status);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const status: HealthStatus = {
				integrationId,
				status: 'unhealthy',
				lastChecked: new Date(),
				errorMessage,
			};

			await this.storeHealthStatus(status);

			// Update integration status
			await this.registry.updateStatus(integrationId, IntegrationStatus.ERROR, errorMessage);

			if (this.onFailure) {
				this.onFailure(integrationId, errorMessage);
			}

			return HealthStatusSchema.parse(status);
		}
	}

	/**
	 * Check health of all integrations
	 */
	async checkAll(): Promise<HealthReport> {
		const integrations = await this.registry.list();
		const healthStatuses: HealthStatus[] = [];

		// Check all integrations in parallel
		const promises = integrations.map((integration) => this.check(integration.id));
		const results = await Promise.allSettled(promises);

		for (const result of results) {
			if (result.status === 'fulfilled') {
				healthStatuses.push(result.value);
			}
		}

		// Determine overall health
		const unhealthyCount = healthStatuses.filter((s) => s.status === 'unhealthy').length;
		const degradedCount = healthStatuses.filter((s) => s.status === 'degraded').length;

		let overall: 'healthy' | 'unhealthy' | 'degraded';
		if (unhealthyCount === healthStatuses.length) {
			overall = 'unhealthy';
		} else if (unhealthyCount > 0 || degradedCount > 0) {
			overall = 'degraded';
		} else {
			overall = 'healthy';
		}

		return {
			timestamp: new Date(),
			overall,
			integrations: healthStatuses,
		};
	}

	/**
	 * Start periodic health checks for an integration
	 */
	startMonitoring(integrationId: string, interval?: number): void {
		// Stop existing monitoring if any
		this.stopMonitoring(integrationId);

		// Get check interval (default 60 seconds)
		const checkInterval = interval || 60000;

		// Create interval
		const intervalId = setInterval(async () => {
			await this.check(integrationId);
		}, checkInterval);

		this.intervals.set(integrationId, intervalId);
	}

	/**
	 * Stop periodic health checks for an integration
	 */
	stopMonitoring(integrationId: string): void {
		const intervalId = this.intervals.get(integrationId);
		if (intervalId) {
			clearInterval(intervalId);
			this.intervals.delete(integrationId);
		}
	}

	/**
	 * Start monitoring all integrations
	 */
	async startMonitoringAll(): Promise<void> {
		const integrations = await this.registry.list();

		for (const integration of integrations) {
			const interval = integration.config.healthCheck?.interval || 60000;
			if (integration.config.healthCheck?.enabled !== false) {
				this.startMonitoring(integration.id, interval);
			}
		}
	}

	/**
	 * Stop monitoring all integrations
	 */
	stopMonitoringAll(): void {
		for (const [integrationId] of this.intervals) {
			this.stopMonitoring(integrationId);
		}
	}

	/**
	 * Get health history for an integration
	 */
	async getHistory(integrationId: string, limit = 100): Promise<HealthStatus[]> {
		const { data, error } = await this.supabase
			.from('integration_health')
			.select('*')
			.eq('integration_id', integrationId)
			.order('last_checked', { ascending: false })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to get health history: ${error.message}`);
		}

		return data.map((row) => ({
			integrationId: row.integration_id,
			status: row.status,
			lastChecked: new Date(row.last_checked),
			responseTime: row.response_time,
			errorMessage: row.error_message,
			details: row.details,
		}));
	}

	/**
	 * Get latest health status from database
	 */
	async getLatestStatus(integrationId: string): Promise<HealthStatus | null> {
		const { data, error } = await this.supabase
			.from('integration_health')
			.select('*')
			.eq('integration_id', integrationId)
			.order('last_checked', { ascending: false })
			.limit(1)
			.single();

		if (error || !data) {
			return null;
		}

		return {
			integrationId: data.integration_id,
			status: data.status,
			lastChecked: new Date(data.last_checked),
			responseTime: data.response_time,
			errorMessage: data.error_message,
			details: data.details,
		};
	}

	/**
	 * Get health statistics
	 */
	async getStatistics(integrationId: string, hours = 24): Promise<{
		uptime: number;
		averageResponseTime: number;
		checkCount: number;
		failureCount: number;
	}> {
		const since = new Date(Date.now() - hours * 60 * 60 * 1000);

		const { data, error } = await this.supabase
			.from('integration_health')
			.select('*')
			.eq('integration_id', integrationId)
			.gte('last_checked', since.toISOString());

		if (error) {
			throw new Error(`Failed to get statistics: ${error.message}`);
		}

		const checkCount = data.length;
		const failureCount = data.filter((row) => row.status === 'unhealthy').length;
		const uptime = checkCount > 0 ? ((checkCount - failureCount) / checkCount) * 100 : 0;

		const responseTimes = data
			.filter((row) => row.response_time)
			.map((row) => row.response_time);
		const averageResponseTime = responseTimes.length > 0
			? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
			: 0;

		return {
			uptime,
			averageResponseTime,
			checkCount,
			failureCount,
		};
	}

	/**
	 * Store health status in database
	 */
	private async storeHealthStatus(status: HealthStatus): Promise<void> {
		const { error } = await this.supabase
			.from('integration_health')
			.insert({
				integration_id: status.integrationId,
				status: status.status,
				last_checked: status.lastChecked.toISOString(),
				response_time: status.responseTime,
				error_message: status.errorMessage,
				details: status.details,
			});

		if (error) {
			console.error('Failed to store health status:', error);
		}
	}

	/**
	 * Create connector from integration
	 */
	private createConnector(integration: Integration): HttpConnector | GraphQLConnector | DatabaseConnector | FileConnector | QueueConnector {
		switch (integration.config.connectorType) {
			case 'http':
				return new HttpConnector(
					integration.config.connectorConfig as Parameters<typeof HttpConnector.prototype.constructor>[0],
					integration.config.auth,
				);

			case 'graphql':
				return new GraphQLConnector(
					integration.config.connectorConfig as Parameters<typeof GraphQLConnector.prototype.constructor>[0],
					integration.config.auth,
				);

			case 'database':
				return new DatabaseConnector(
					integration.config.connectorConfig as Parameters<typeof DatabaseConnector.prototype.constructor>[0],
				);

			case 'file':
				return new FileConnector(
					integration.config.connectorConfig as Parameters<typeof FileConnector.prototype.constructor>[0],
				);

			case 'queue':
				return new QueueConnector(
					integration.config.connectorConfig as Parameters<typeof QueueConnector.prototype.constructor>[0],
				);

			default:
				throw new Error(`Unsupported connector type: ${integration.config.connectorType}`);
		}
	}
}
