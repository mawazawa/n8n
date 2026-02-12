import { EventEmitter } from 'events';
import type { IntegrationType, IntegrationConfig } from './types';
import { IntegrationConfigSchema } from './types';

interface IntegrationManagerOptions {
	maxIntegrations?: number;
}

interface WebhookPayload {
	event: string;
	timestamp: Date;
	data: Record<string, unknown>;
}

/**
 * External integrations manager for Slack, Teams, and webhooks
 */
export class IntegrationManager extends EventEmitter {
	private integrations: Map<string, IntegrationConfig>;
	private options: Required<IntegrationManagerOptions>;

	constructor(options: IntegrationManagerOptions = {}) {
		super();
		this.integrations = new Map();
		this.options = {
			maxIntegrations: options.maxIntegrations ?? 50,
		};
	}

	/**
	 * Add an integration
	 */
	addIntegration(id: string, config: IntegrationConfig): void {
		if (this.integrations.size >= this.options.maxIntegrations) {
			throw new Error('Maximum integrations limit reached');
		}

		const validated = IntegrationConfigSchema.parse(config);
		this.integrations.set(id, validated);
		this.emit('integration_added', { id, config: validated });
	}

	/**
	 * Remove an integration
	 */
	removeIntegration(id: string): void {
		const config = this.integrations.get(id);
		if (!config) {
			throw new Error('Integration not found');
		}

		this.integrations.delete(id);
		this.emit('integration_removed', { id });
	}

	/**
	 * Update an integration
	 */
	updateIntegration(id: string, updates: Partial<IntegrationConfig>): void {
		const config = this.integrations.get(id);
		if (!config) {
			throw new Error('Integration not found');
		}

		const updated = IntegrationConfigSchema.parse({ ...config, ...updates });
		this.integrations.set(id, updated);
		this.emit('integration_updated', { id, config: updated });
	}

	/**
	 * Enable an integration
	 */
	enable(id: string): void {
		this.updateIntegration(id, { enabled: true });
	}

	/**
	 * Disable an integration
	 */
	disable(id: string): void {
		this.updateIntegration(id, { enabled: false });
	}

	/**
	 * Send notification through all enabled integrations
	 */
	async notify(event: string, data: Record<string, unknown>): Promise<void> {
		const payload: WebhookPayload = {
			event,
			timestamp: new Date(),
			data,
		};

		const promises: Promise<void>[] = [];

		for (const [id, config] of this.integrations) {
			if (!config.enabled || !config.events.includes(event)) {
				continue;
			}

			switch (config.type) {
				case 'slack':
					promises.push(this.sendSlackNotification(id, config, payload));
					break;
				case 'teams':
					promises.push(this.sendTeamsNotification(id, config, payload));
					break;
				case 'webhook':
					promises.push(this.sendWebhook(id, config, payload));
					break;
			}
		}

		await Promise.allSettled(promises);
	}

	/**
	 * Send Slack notification
	 */
	private async sendSlackNotification(
		id: string,
		config: IntegrationConfig,
		payload: WebhookPayload
	): Promise<void> {
		if (!config.webhookUrl) {
			this.emit('error', { id, error: 'Slack webhook URL not configured' });
			return;
		}

		try {
			const message = this.formatSlackMessage(payload);
			const response = await fetch(config.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error(`Slack API error: ${response.statusText}`);
			}

			this.emit('notification_sent', { id, type: 'slack', event: payload.event });
		} catch (error) {
			this.emit('error', { id, error, type: 'slack' });
		}
	}

	/**
	 * Send Microsoft Teams notification
	 */
	private async sendTeamsNotification(
		id: string,
		config: IntegrationConfig,
		payload: WebhookPayload
	): Promise<void> {
		if (!config.teamsWebhookUrl) {
			this.emit('error', { id, error: 'Teams webhook URL not configured' });
			return;
		}

		try {
			const message = this.formatTeamsMessage(payload);
			const response = await fetch(config.teamsWebhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error(`Teams API error: ${response.statusText}`);
			}

			this.emit('notification_sent', { id, type: 'teams', event: payload.event });
		} catch (error) {
			this.emit('error', { id, error, type: 'teams' });
		}
	}

	/**
	 * Send webhook notification
	 */
	private async sendWebhook(
		id: string,
		config: IntegrationConfig,
		payload: WebhookPayload
	): Promise<void> {
		if (!config.webhookUrl) {
			this.emit('error', { id, error: 'Webhook URL not configured' });
			return;
		}

		try {
			const response = await fetch(config.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`Webhook error: ${response.statusText}`);
			}

			this.emit('notification_sent', { id, type: 'webhook', event: payload.event });
		} catch (error) {
			this.emit('error', { id, error, type: 'webhook' });
		}
	}

	/**
	 * Format message for Slack
	 */
	private formatSlackMessage(payload: WebhookPayload): Record<string, unknown> {
		return {
			text: `*${this.formatEventName(payload.event)}*`,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `*${this.formatEventName(payload.event)}*`,
					},
				},
				{
					type: 'section',
					fields: Object.entries(payload.data).map(([key, value]) => ({
						type: 'mrkdwn',
						text: `*${key}:*\n${String(value)}`,
					})),
				},
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: `_${payload.timestamp.toISOString()}_`,
						},
					],
				},
			],
		};
	}

	/**
	 * Format message for Microsoft Teams
	 */
	private formatTeamsMessage(payload: WebhookPayload): Record<string, unknown> {
		return {
			'@type': 'MessageCard',
			'@context': 'https://schema.org/extensions',
			summary: this.formatEventName(payload.event),
			themeColor: '0078D4',
			title: this.formatEventName(payload.event),
			sections: [
				{
					facts: Object.entries(payload.data).map(([key, value]) => ({
						name: key,
						value: String(value),
					})),
				},
			],
			text: `Event occurred at ${payload.timestamp.toISOString()}`,
		};
	}

	/**
	 * Format event name for display
	 */
	private formatEventName(event: string): string {
		return event
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	/**
	 * Get integration by ID
	 */
	getIntegration(id: string): IntegrationConfig | undefined {
		return this.integrations.get(id);
	}

	/**
	 * Get all integrations
	 */
	getAllIntegrations(): Map<string, IntegrationConfig> {
		return new Map(this.integrations);
	}

	/**
	 * Get integrations by type
	 */
	getIntegrationsByType(type: IntegrationType): Array<{ id: string; config: IntegrationConfig }> {
		const result: Array<{ id: string; config: IntegrationConfig }> = [];
		for (const [id, config] of this.integrations) {
			if (config.type === type) {
				result.push({ id, config });
			}
		}
		return result;
	}

	/**
	 * Test an integration
	 */
	async test(id: string): Promise<boolean> {
		const config = this.integrations.get(id);
		if (!config) {
			throw new Error('Integration not found');
		}

		try {
			await this.notify('test', { message: 'Test notification from Workflow Architect' });
			return true;
		} catch (error) {
			this.emit('error', { id, error, message: 'Integration test failed' });
			return false;
		}
	}

	/**
	 * Clear all integrations
	 */
	clear(): void {
		this.integrations.clear();
		this.emit('integrations_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.clear();
		this.removeAllListeners();
	}
}

/**
 * Create an integration manager instance
 */
export function createIntegrationManager(options?: IntegrationManagerOptions): IntegrationManager {
	return new IntegrationManager(options);
}
