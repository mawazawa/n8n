import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuotaManager } from './manager';
import type { Alert, AlertThreshold, AlertAction, QuotaType } from './types';

/**
 * Notification channel configuration
 */
export interface NotificationChannel {
	/** Send notification via email */
	email?: {
		to: string[];
		from?: string;
	};
	/** Send notification via Slack */
	slack?: {
		webhookUrl: string;
		channel?: string;
	};
	/** Send notification via webhook */
	webhook?: {
		url: string;
		headers?: Record<string, string>;
	};
}

/**
 * Configuration for alert manager
 */
export interface AlertManagerConfig {
	/** Supabase client for database operations */
	supabase: SupabaseClient;
	/** Quota manager instance */
	quotaManager: QuotaManager;
	/** Default alert thresholds */
	defaultThresholds?: AlertThreshold[];
	/** Notification channels */
	notificationChannels?: NotificationChannel;
	/** Check interval in milliseconds (default: 300000 = 5 minutes) */
	checkInterval?: number;
}

/**
 * Default alert thresholds
 */
const DEFAULT_THRESHOLDS: AlertThreshold[] = [
	{ percentage: 50, action: AlertAction.NOTIFY },
	{ percentage: 80, action: AlertAction.WARN },
	{ percentage: 90, action: AlertAction.WARN },
	{ percentage: 100, action: AlertAction.BLOCK },
];

/**
 * Alert manager for monitoring quota usage and sending notifications
 *
 * Features:
 * - Configurable usage thresholds
 * - Multiple notification channels (email, Slack, webhook)
 * - Automatic threshold monitoring
 * - Alert deduplication
 * - Action-based responses
 *
 * @example
 * ```typescript
 * const alertManager = new AlertManager({
 *   supabase,
 *   quotaManager,
 *   notificationChannels: {
 *     email: { to: ['admin@example.com'] },
 *     slack: { webhookUrl: process.env.SLACK_WEBHOOK }
 *   }
 * });
 *
 * // Start monitoring
 * alertManager.start();
 *
 * // Check thresholds for a specific user
 * const alerts = await alertManager.checkThresholds('user-123');
 * ```
 */
export class AlertManager {
	private readonly supabase: SupabaseClient;
	private readonly quotaManager: QuotaManager;
	private readonly defaultThresholds: AlertThreshold[];
	private readonly notificationChannels?: NotificationChannel;
	private readonly checkInterval: number;
	private readonly triggeredAlerts: Map<string, Set<number>>;
	private monitorTimer?: NodeJS.Timeout;

	constructor(config: AlertManagerConfig) {
		this.supabase = config.supabase;
		this.quotaManager = config.quotaManager;
		this.defaultThresholds = config.defaultThresholds ?? DEFAULT_THRESHOLDS;
		this.notificationChannels = config.notificationChannels;
		this.checkInterval = config.checkInterval ?? 300000; // 5 minutes
		this.triggeredAlerts = new Map();
	}

	/**
	 * Check thresholds for a specific user
	 *
	 * @param userId - User identifier
	 * @returns Array of alerts that were triggered
	 */
	async checkThresholds(userId: string): Promise<Alert[]> {
		const quotas = await this.quotaManager.getQuotas(userId);
		const alerts: Alert[] = [];

		for (const quota of quotas) {
			const usagePercent = (quota.used / quota.limit) * 100;

			// Get thresholds for this quota type
			const thresholds = await this.getThresholds(userId, quota.type);

			for (const threshold of thresholds) {
				if (usagePercent >= threshold.percentage) {
					// Check if already triggered
					const key = `${userId}:${quota.type}`;
					const triggered = this.triggeredAlerts.get(key) ?? new Set();

					if (!triggered.has(threshold.percentage)) {
						// Create alert
						const alert: Alert = {
							userId,
							quotaType: quota.type,
							usagePercent,
							threshold,
							severity: this.getSeverity(threshold.action),
							message: this.getAlertMessage(quota.type, usagePercent, threshold),
							timestamp: new Date(),
						};

						alerts.push(alert);

						// Mark as triggered
						triggered.add(threshold.percentage);
						this.triggeredAlerts.set(key, triggered);

						// Send notification
						await this.sendNotification(alert);

						// Store alert in database
						await this.storeAlert(alert);
					}
				}
			}
		}

		return alerts;
	}

	/**
	 * Check thresholds for all users
	 *
	 * @returns Total number of alerts triggered
	 */
	async checkAllUsers(): Promise<number> {
		const { data: users, error } = await this.supabase
			.from('user_subscriptions')
			.select('user_id');

		if (error) {
			console.error('Failed to fetch users for alert checking:', error);
			return 0;
		}

		let totalAlerts = 0;

		for (const user of users ?? []) {
			try {
				const alerts = await this.checkThresholds(user.user_id);
				totalAlerts += alerts.length;
			} catch (error) {
				console.error(`Failed to check thresholds for user ${user.user_id}:`, error);
			}
		}

		return totalAlerts;
	}

	/**
	 * Start automatic threshold monitoring
	 */
	start(): void {
		if (this.monitorTimer) {
			return;
		}

		this.monitorTimer = setInterval(() => {
			this.checkAllUsers().catch((err) => {
				console.error('Error checking all users:', err);
			});
		}, this.checkInterval);

		console.log('Alert monitoring started');
	}

	/**
	 * Stop automatic threshold monitoring
	 */
	stop(): void {
		if (this.monitorTimer) {
			clearInterval(this.monitorTimer);
			this.monitorTimer = undefined;
			console.log('Alert monitoring stopped');
		}
	}

	/**
	 * Reset triggered alerts for a user
	 *
	 * @param userId - User identifier
	 * @param quotaType - Quota type (optional, resets all if not provided)
	 */
	resetTriggered(userId: string, quotaType?: QuotaType): void {
		if (quotaType) {
			const key = `${userId}:${quotaType}`;
			this.triggeredAlerts.delete(key);
		} else {
			// Reset all quota types for user
			for (const key of this.triggeredAlerts.keys()) {
				if (key.startsWith(`${userId}:`)) {
					this.triggeredAlerts.delete(key);
				}
			}
		}
	}

	/**
	 * Get thresholds for a user and quota type
	 */
	private async getThresholds(userId: string, quotaType: QuotaType): Promise<AlertThreshold[]> {
		// Check for custom thresholds
		const { data, error } = await this.supabase
			.from('alert_thresholds')
			.select('*')
			.eq('user_id', userId)
			.eq('quota_type', quotaType);

		if (error || !data || data.length === 0) {
			return this.defaultThresholds;
		}

		return data.map((row) => ({
			percentage: row.percentage,
			action: row.action as AlertAction,
		}));
	}

	/**
	 * Get severity level for an alert action
	 */
	private getSeverity(action: AlertAction): 'info' | 'warning' | 'critical' {
		switch (action) {
			case AlertAction.NOTIFY:
				return 'info';
			case AlertAction.WARN:
			case AlertAction.THROTTLE:
				return 'warning';
			case AlertAction.BLOCK:
				return 'critical';
		}
	}

	/**
	 * Generate alert message
	 */
	private getAlertMessage(
		quotaType: QuotaType,
		usagePercent: number,
		threshold: AlertThreshold,
	): string {
		const percent = usagePercent.toFixed(1);

		switch (threshold.action) {
			case AlertAction.NOTIFY:
				return `You've used ${percent}% of your ${quotaType} quota.`;
			case AlertAction.WARN:
				return `Warning: You've used ${percent}% of your ${quotaType} quota. Consider upgrading your plan.`;
			case AlertAction.THROTTLE:
				return `You've used ${percent}% of your ${quotaType} quota. Your requests may be throttled.`;
			case AlertAction.BLOCK:
				return `You've reached 100% of your ${quotaType} quota. Please upgrade to continue.`;
		}
	}

	/**
	 * Send notification through configured channels
	 */
	private async sendNotification(alert: Alert): Promise<void> {
		const promises: Promise<void>[] = [];

		if (this.notificationChannels?.email) {
			promises.push(this.sendEmailNotification(alert));
		}

		if (this.notificationChannels?.slack) {
			promises.push(this.sendSlackNotification(alert));
		}

		if (this.notificationChannels?.webhook) {
			promises.push(this.sendWebhookNotification(alert));
		}

		await Promise.allSettled(promises);
	}

	/**
	 * Send email notification
	 */
	private async sendEmailNotification(alert: Alert): Promise<void> {
		if (!this.notificationChannels?.email) {
			return;
		}

		try {
			// In a real implementation, integrate with an email service
			// For now, we'll just log it
			console.log('Email notification:', {
				to: this.notificationChannels.email.to,
				subject: `Quota Alert: ${alert.quotaType}`,
				body: alert.message,
			});
		} catch (error) {
			console.error('Failed to send email notification:', error);
		}
	}

	/**
	 * Send Slack notification
	 */
	private async sendSlackNotification(alert: Alert): Promise<void> {
		if (!this.notificationChannels?.slack) {
			return;
		}

		try {
			const color = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good';

			const payload = {
				channel: this.notificationChannels.slack.channel,
				attachments: [
					{
						color,
						title: `Quota Alert: ${alert.quotaType}`,
						text: alert.message,
						fields: [
							{
								title: 'User',
								value: alert.userId,
								short: true,
							},
							{
								title: 'Usage',
								value: `${alert.usagePercent.toFixed(1)}%`,
								short: true,
							},
						],
						ts: Math.floor(alert.timestamp.getTime() / 1000),
					},
				],
			};

			await fetch(this.notificationChannels.slack.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
		} catch (error) {
			console.error('Failed to send Slack notification:', error);
		}
	}

	/**
	 * Send webhook notification
	 */
	private async sendWebhookNotification(alert: Alert): Promise<void> {
		if (!this.notificationChannels?.webhook) {
			return;
		}

		try {
			await fetch(this.notificationChannels.webhook.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...this.notificationChannels.webhook.headers,
				},
				body: JSON.stringify(alert),
			});
		} catch (error) {
			console.error('Failed to send webhook notification:', error);
		}
	}

	/**
	 * Store alert in database
	 */
	private async storeAlert(alert: Alert): Promise<void> {
		const { error } = await this.supabase.from('quota_alerts').insert({
			user_id: alert.userId,
			quota_type: alert.quotaType,
			usage_percent: alert.usagePercent,
			threshold_percentage: alert.threshold.percentage,
			threshold_action: alert.threshold.action,
			severity: alert.severity,
			message: alert.message,
			timestamp: alert.timestamp.toISOString(),
		});

		if (error) {
			console.error('Failed to store alert:', error);
		}
	}
}

/**
 * Create an alert manager instance
 *
 * @param config - Alert manager configuration
 * @returns AlertManager instance
 */
export function createAlertManager(config: AlertManagerConfig): AlertManager {
	return new AlertManager(config);
}
