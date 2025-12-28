import { randomBytes } from 'node:crypto';
import type {
	AlertRule,
	Alert,
	AlertCondition,
	AlertSeverity,
	Metric,
	MetricLabels,
} from './types';
import { AlertRuleSchema, AlertSchema, AlertConditionSchema } from './types';

// ============================================================================
// Alert Rule Engine
// ============================================================================

export class AlertRuleEngine {
	private rules = new Map<string, AlertRule>();
	private activeAlerts = new Map<string, Alert>();
	private evaluationInterval = 60000; // 1 minute
	private intervalTimer: NodeJS.Timeout | null = null;
	private metricsProvider?: () => Metric[];
	private notificationHandlers: Array<(alert: Alert) => Promise<void>> = [];

	/**
	 * Set metrics provider function
	 */
	setMetricsProvider(provider: () => Metric[]): void {
		this.metricsProvider = provider;
	}

	/**
	 * Add notification handler
	 */
	addNotificationHandler(handler: (alert: Alert) => Promise<void>): void {
		this.notificationHandlers.push(handler);
	}

	/**
	 * Set evaluation interval
	 */
	setEvaluationInterval(intervalMs: number): void {
		this.evaluationInterval = intervalMs;

		// Restart interval if running
		if (this.intervalTimer) {
			this.stop();
			this.start();
		}
	}

	/**
	 * Define an alert rule
	 */
	async define(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
		const fullRule: AlertRule = {
			id: randomBytes(8).toString('hex'),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			...rule,
		};

		AlertRuleSchema.parse(fullRule);
		this.rules.set(fullRule.id, fullRule);

		return fullRule;
	}

	/**
	 * Update an alert rule
	 */
	async update(id: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
		const rule = this.rules.get(id);
		if (!rule) return null;

		const updated = {
			...rule,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: Date.now(),
		};

		AlertRuleSchema.parse(updated);
		this.rules.set(id, updated);

		return updated;
	}

	/**
	 * Delete an alert rule
	 */
	async delete(id: string): Promise<boolean> {
		return this.rules.delete(id);
	}

	/**
	 * Get all rules
	 */
	listRules(): AlertRule[] {
		return Array.from(this.rules.values());
	}

	/**
	 * Get rule by ID
	 */
	getRule(id: string): AlertRule | undefined {
		return this.rules.get(id);
	}

	/**
	 * Evaluate all rules
	 */
	async evaluate(): Promise<Alert[]> {
		if (!this.metricsProvider) {
			throw new Error('Metrics provider not set');
		}

		const metrics = this.metricsProvider();
		const alerts: Alert[] = [];

		for (const rule of this.rules.values()) {
			if (!rule.enabled) continue;

			const ruleAlerts = await this.evaluateRule(rule, metrics);
			alerts.push(...ruleAlerts);
		}

		return alerts;
	}

	/**
	 * Evaluate a single rule
	 */
	private async evaluateRule(rule: AlertRule, metrics: Metric[]): Promise<Alert[]> {
		const alerts: Alert[] = [];

		// Evaluate conditions
		const conditionResults = rule.conditions.map(condition =>
			this.evaluateCondition(condition, metrics),
		);

		// Apply combinator
		const isFiring = rule.combinator === 'and'
			? conditionResults.every(r => r)
			: conditionResults.some(r => r);

		const alertKey = `${rule.id}`;
		const existingAlert = this.activeAlerts.get(alertKey);

		if (isFiring) {
			// Create or update alert
			if (!existingAlert) {
				const alert: Alert = {
					id: randomBytes(8).toString('hex'),
					ruleId: rule.id,
					ruleName: rule.name,
					severity: rule.severity,
					message: this.buildAlertMessage(rule),
					state: 'firing',
					firedAt: Date.now(),
					labels: {},
					annotations: {},
				};

				AlertSchema.parse(alert);
				this.activeAlerts.set(alertKey, alert);
				alerts.push(alert);

				// Send notifications
				await this.sendNotifications(alert, rule);
			} else {
				alerts.push(existingAlert);
			}
		} else if (existingAlert && existingAlert.state === 'firing') {
			// Resolve alert
			const resolvedAlert: Alert = {
				...existingAlert,
				state: 'resolved',
				resolvedAt: Date.now(),
			};

			this.activeAlerts.delete(alertKey);
			alerts.push(resolvedAlert);

			// Send resolution notification
			await this.sendNotifications(resolvedAlert, rule);
		}

		return alerts;
	}

	/**
	 * Evaluate a single condition
	 */
	private evaluateCondition(condition: AlertCondition, metrics: Metric[]): boolean {
		const metric = metrics.find(m => m.name === condition.metric);
		if (!metric) return false;

		// Get latest value
		const latestDataPoint = metric.dataPoints[metric.dataPoints.length - 1];
		if (!latestDataPoint) return false;

		const value = latestDataPoint.value;

		// Evaluate operator
		switch (condition.operator) {
			case 'gt': return value > condition.threshold;
			case 'gte': return value >= condition.threshold;
			case 'lt': return value < condition.threshold;
			case 'lte': return value <= condition.threshold;
			case 'eq': return value === condition.threshold;
			case 'ne': return value !== condition.threshold;
			default: return false;
		}
	}

	/**
	 * Build alert message
	 */
	private buildAlertMessage(rule: AlertRule): string {
		const conditions = rule.conditions
			.map(c => `${c.metric} ${c.operator} ${c.threshold}`)
			.join(` ${rule.combinator} `);

		return `${rule.name}: ${conditions}`;
	}

	/**
	 * Send notifications
	 */
	private async sendNotifications(alert: Alert, rule: AlertRule): Promise<void> {
		// Internal handlers
		for (const handler of this.notificationHandlers) {
			try {
				await handler(alert);
			} catch (err) {
				console.error('Notification handler error:', err);
			}
		}

		// Rule-specific notifications
		for (const notification of rule.notifications) {
			try {
				await this.sendNotification(alert, notification);
			} catch (err) {
				console.error('Notification error:', err);
			}
		}
	}

	/**
	 * Send a single notification
	 */
	private async sendNotification(
		alert: Alert,
		notification: { type: string; config: Record<string, unknown> },
	): Promise<void> {
		switch (notification.type) {
			case 'email':
				await this.sendEmailNotification(alert, notification.config);
				break;
			case 'slack':
				await this.sendSlackNotification(alert, notification.config);
				break;
			case 'webhook':
				await this.sendWebhookNotification(alert, notification.config);
				break;
			case 'pagerduty':
				await this.sendPagerDutyNotification(alert, notification.config);
				break;
			default:
				console.warn(`Unknown notification type: ${notification.type}`);
		}
	}

	/**
	 * Send email notification
	 */
	private async sendEmailNotification(
		alert: Alert,
		config: Record<string, unknown>,
	): Promise<void> {
		// Email implementation would go here
		console.log('Email notification:', { alert, config });
	}

	/**
	 * Send Slack notification
	 */
	private async sendSlackNotification(
		alert: Alert,
		config: Record<string, unknown>,
	): Promise<void> {
		const webhookUrl = config.webhookUrl as string;
		if (!webhookUrl) {
			throw new Error('Slack webhookUrl not configured');
		}

		const color = alert.severity === 'critical' ? 'danger'
			: alert.severity === 'warning' ? 'warning'
			: 'good';

		const message = {
			attachments: [
				{
					color,
					title: alert.state === 'firing' ? '🔥 Alert Firing' : '✅ Alert Resolved',
					text: alert.message,
					fields: [
						{ title: 'Severity', value: alert.severity, short: true },
						{ title: 'State', value: alert.state, short: true },
						{ title: 'Rule', value: alert.ruleName, short: false },
					],
					ts: Math.floor(alert.firedAt / 1000),
				},
			],
		};

		await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(message),
		});
	}

	/**
	 * Send webhook notification
	 */
	private async sendWebhookNotification(
		alert: Alert,
		config: Record<string, unknown>,
	): Promise<void> {
		const url = config.url as string;
		if (!url) {
			throw new Error('Webhook url not configured');
		}

		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(alert),
		});
	}

	/**
	 * Send PagerDuty notification
	 */
	private async sendPagerDutyNotification(
		alert: Alert,
		config: Record<string, unknown>,
	): Promise<void> {
		const integrationKey = config.integrationKey as string;
		if (!integrationKey) {
			throw new Error('PagerDuty integrationKey not configured');
		}

		const event = {
			routing_key: integrationKey,
			event_action: alert.state === 'firing' ? 'trigger' : 'resolve',
			dedup_key: alert.id,
			payload: {
				summary: alert.message,
				severity: alert.severity,
				source: 'workflow-architect',
				timestamp: new Date(alert.firedAt).toISOString(),
				custom_details: {
					rule_id: alert.ruleId,
					rule_name: alert.ruleName,
					labels: alert.labels,
				},
			},
		};

		await fetch('https://events.pagerduty.com/v2/enqueue', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(event),
		});
	}

	/**
	 * Get active alerts
	 */
	getActiveAlerts(): Alert[] {
		return Array.from(this.activeAlerts.values());
	}

	/**
	 * Get alert by ID
	 */
	getAlert(id: string): Alert | undefined {
		return Array.from(this.activeAlerts.values()).find(a => a.id === id);
	}

	/**
	 * Start continuous evaluation
	 */
	start(): void {
		if (this.intervalTimer) {
			throw new Error('Alert engine already started');
		}

		this.intervalTimer = setInterval(() => {
			void this.evaluate();
		}, this.evaluationInterval);
	}

	/**
	 * Stop continuous evaluation
	 */
	stop(): void {
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}
	}

	/**
	 * Check if engine is running
	 */
	isRunning(): boolean {
		return this.intervalTimer !== null;
	}
}

// ============================================================================
// Alert Builder
// ============================================================================

export class AlertRuleBuilder {
	private name: string;
	private description?: string;
	private severity: AlertSeverity = 'warning';
	private conditions: AlertCondition[] = [];
	private combinator: 'and' | 'or' = 'and';
	private enabled = true;
	private notifications: Array<{ type: string; config: Record<string, unknown> }> = [];

	constructor(name: string) {
		this.name = name;
	}

	setDescription(description: string): this {
		this.description = description;
		return this;
	}

	setSeverity(severity: AlertSeverity): this {
		this.severity = severity;
		return this;
	}

	addCondition(condition: AlertCondition): this {
		AlertConditionSchema.parse(condition);
		this.conditions.push(condition);
		return this;
	}

	setCombinator(combinator: 'and' | 'or'): this {
		this.combinator = combinator;
		return this;
	}

	setEnabled(enabled: boolean): this {
		this.enabled = enabled;
		return this;
	}

	addEmailNotification(to: string[], subject?: string): this {
		this.notifications.push({
			type: 'email',
			config: { to, subject },
		});
		return this;
	}

	addSlackNotification(webhookUrl: string, channel?: string): this {
		this.notifications.push({
			type: 'slack',
			config: { webhookUrl, channel },
		});
		return this;
	}

	addWebhookNotification(url: string, headers?: Record<string, string>): this {
		this.notifications.push({
			type: 'webhook',
			config: { url, headers },
		});
		return this;
	}

	addPagerDutyNotification(integrationKey: string): this {
		this.notifications.push({
			type: 'pagerduty',
			config: { integrationKey },
		});
		return this;
	}

	build(): Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> {
		if (this.conditions.length === 0) {
			throw new Error('Alert rule must have at least one condition');
		}

		return {
			name: this.name,
			description: this.description,
			severity: this.severity,
			conditions: this.conditions,
			combinator: this.combinator,
			enabled: this.enabled,
			notifications: this.notifications,
		};
	}
}
