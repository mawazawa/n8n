import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Invoice, InvoiceSchema, type TenantPlan, TenantPlanType } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Subscription status
 */
export enum SubscriptionStatus {
	ACTIVE = 'ACTIVE',
	PAST_DUE = 'PAST_DUE',
	CANCELED = 'CANCELED',
	TRIALING = 'TRIALING',
	INCOMPLETE = 'INCOMPLETE',
}

/**
 * Billing period
 */
export enum BillingPeriod {
	MONTHLY = 'MONTHLY',
	YEARLY = 'YEARLY',
}

/**
 * Subscription
 */
export interface Subscription {
	id: string;
	tenantId: string;
	planType: TenantPlanType;
	status: SubscriptionStatus;
	billingPeriod: BillingPeriod;
	currentPeriodStart: Date;
	currentPeriodEnd: Date;
	cancelAtPeriodEnd: boolean;
	trialEnd?: Date;
	metadata?: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Usage-based billing item
 */
export interface UsageBillingItem {
	resource: string;
	quantity: number;
	unitPrice: number;
	total: number;
}

/**
 * TenantBilling handles tenant billing and subscriptions
 */
export class TenantBilling {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Create a subscription
	 */
	async createSubscription(
		tenantId: string,
		plan: TenantPlan,
		options?: {
			billingPeriod?: BillingPeriod;
			trialDays?: number;
		},
	): Promise<Subscription> {
		const now = new Date();
		const billingPeriod = options?.billingPeriod ?? BillingPeriod.MONTHLY;

		// Calculate period dates
		const currentPeriodStart = now;
		const currentPeriodEnd = this.calculatePeriodEnd(currentPeriodStart, billingPeriod);

		// Calculate trial end if applicable
		let trialEnd: Date | undefined;
		if (options?.trialDays) {
			trialEnd = new Date(now.getTime() + options.trialDays * 24 * 60 * 60 * 1000);
		}

		const subscription: Subscription = {
			id: uuidv4(),
			tenantId,
			planType: plan.type,
			status: trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
			billingPeriod,
			currentPeriodStart,
			currentPeriodEnd,
			cancelAtPeriodEnd: false,
			trialEnd,
			createdAt: now,
			updatedAt: now,
		};

		// Insert subscription
		const { error } = await this.supabase.from('tenant_subscriptions').insert({
			id: subscription.id,
			tenant_id: subscription.tenantId,
			plan_type: subscription.planType,
			status: subscription.status,
			billing_period: subscription.billingPeriod,
			current_period_start: subscription.currentPeriodStart.toISOString(),
			current_period_end: subscription.currentPeriodEnd.toISOString(),
			cancel_at_period_end: subscription.cancelAtPeriodEnd,
			trial_end: subscription.trialEnd?.toISOString(),
			created_at: subscription.createdAt.toISOString(),
			updated_at: subscription.updatedAt.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to create subscription: ${error.message}`);
		}

		return subscription;
	}

	/**
	 * Update a subscription
	 */
	async updateSubscription(
		tenantId: string,
		plan: TenantPlan,
		options?: {
			billingPeriod?: BillingPeriod;
			immediate?: boolean;
		},
	): Promise<Subscription> {
		// Get current subscription
		const currentSubscription = await this.getSubscription(tenantId);
		if (!currentSubscription) {
			throw new Error(`No subscription found for tenant ${tenantId}`);
		}

		const now = new Date();

		// Determine if upgrade or downgrade
		const isUpgrade = this.isUpgrade(currentSubscription.planType, plan.type);

		// Update subscription
		let newPeriodStart = currentSubscription.currentPeriodStart;
		let newPeriodEnd = currentSubscription.currentPeriodEnd;

		if (options?.immediate || isUpgrade) {
			// Apply immediately for upgrades or if explicitly requested
			newPeriodStart = now;
			newPeriodEnd = this.calculatePeriodEnd(
				newPeriodStart,
				options?.billingPeriod ?? currentSubscription.billingPeriod,
			);
		}

		const { error } = await this.supabase
			.from('tenant_subscriptions')
			.update({
				plan_type: plan.type,
				billing_period: options?.billingPeriod ?? currentSubscription.billingPeriod,
				current_period_start: newPeriodStart.toISOString(),
				current_period_end: newPeriodEnd.toISOString(),
				updated_at: now.toISOString(),
			})
			.eq('tenant_id', tenantId);

		if (error) {
			throw new Error(`Failed to update subscription: ${error.message}`);
		}

		return {
			...currentSubscription,
			planType: plan.type,
			billingPeriod: options?.billingPeriod ?? currentSubscription.billingPeriod,
			currentPeriodStart: newPeriodStart,
			currentPeriodEnd: newPeriodEnd,
			updatedAt: now,
		};
	}

	/**
	 * Cancel a subscription
	 */
	async cancelSubscription(
		tenantId: string,
		options?: {
			immediate?: boolean;
		},
	): Promise<void> {
		const now = new Date();

		if (options?.immediate) {
			// Cancel immediately
			await this.supabase
				.from('tenant_subscriptions')
				.update({
					status: SubscriptionStatus.CANCELED,
					updated_at: now.toISOString(),
				})
				.eq('tenant_id', tenantId);
		} else {
			// Cancel at period end
			await this.supabase
				.from('tenant_subscriptions')
				.update({
					cancel_at_period_end: true,
					updated_at: now.toISOString(),
				})
				.eq('tenant_id', tenantId);
		}
	}

	/**
	 * Get subscription
	 */
	async getSubscription(tenantId: string): Promise<Subscription | null> {
		const { data, error } = await this.supabase
			.from('tenant_subscriptions')
			.select('*')
			.eq('tenant_id', tenantId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get subscription: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return {
			id: data.id,
			tenantId: data.tenant_id,
			planType: data.plan_type,
			status: data.status,
			billingPeriod: data.billing_period,
			currentPeriodStart: new Date(data.current_period_start),
			currentPeriodEnd: new Date(data.current_period_end),
			cancelAtPeriodEnd: data.cancel_at_period_end,
			trialEnd: data.trial_end ? new Date(data.trial_end) : undefined,
			metadata: data.metadata,
			createdAt: new Date(data.created_at),
			updatedAt: new Date(data.updated_at),
		};
	}

	/**
	 * Generate invoice
	 */
	async generateInvoice(
		tenantId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<Invoice> {
		const subscription = await this.getSubscription(tenantId);
		if (!subscription) {
			throw new Error(`No subscription found for tenant ${tenantId}`);
		}

		// Get usage-based billing items
		const usageItems = await this.calculateUsageBilling(tenantId, periodStart, periodEnd);

		// Calculate base plan price
		const basePlanPrice =
			subscription.billingPeriod === BillingPeriod.MONTHLY ? 99 : 990; // Example pricing

		// Create invoice items
		const items = [
			{
				description: `${subscription.planType} Plan - ${subscription.billingPeriod}`,
				quantity: 1,
				unitPrice: basePlanPrice,
				total: basePlanPrice,
			},
			...usageItems.map((item) => ({
				description: `Usage: ${item.resource}`,
				quantity: item.quantity,
				unitPrice: item.unitPrice,
				total: item.total,
			})),
		];

		const total = items.reduce((sum, item) => sum + item.total, 0);

		const invoice: Invoice = {
			id: uuidv4(),
			tenantId,
			amount: total,
			currency: 'USD',
			status: 'OPEN',
			periodStart,
			periodEnd,
			dueDate: new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000), // Due 7 days after period end
			items,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Validate invoice
		InvoiceSchema.parse(invoice);

		// Insert invoice
		const { error } = await this.supabase.from('tenant_invoices').insert({
			id: invoice.id,
			tenant_id: invoice.tenantId,
			amount: invoice.amount,
			currency: invoice.currency,
			status: invoice.status,
			period_start: invoice.periodStart.toISOString(),
			period_end: invoice.periodEnd.toISOString(),
			due_date: invoice.dueDate.toISOString(),
			items: invoice.items,
			metadata: invoice.metadata,
			created_at: invoice.createdAt.toISOString(),
			updated_at: invoice.updatedAt.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to generate invoice: ${error.message}`);
		}

		return invoice;
	}

	/**
	 * Get invoices for a tenant
	 */
	async getInvoices(tenantId: string, options?: { limit?: number }): Promise<Invoice[]> {
		let query = this.supabase
			.from('tenant_invoices')
			.select('*')
			.eq('tenant_id', tenantId)
			.order('created_at', { ascending: false });

		if (options?.limit) {
			query = query.limit(options.limit);
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get invoices: ${error.message}`);
		}

		return (data ?? []).map((row) => ({
			id: row.id,
			tenantId: row.tenant_id,
			amount: row.amount,
			currency: row.currency,
			status: row.status,
			periodStart: new Date(row.period_start),
			periodEnd: new Date(row.period_end),
			dueDate: new Date(row.due_date),
			paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
			items: row.items,
			metadata: row.metadata,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
		}));
	}

	/**
	 * Mark invoice as paid
	 */
	async markInvoicePaid(invoiceId: string): Promise<void> {
		const now = new Date();

		const { error } = await this.supabase
			.from('tenant_invoices')
			.update({
				status: 'PAID',
				paid_at: now.toISOString(),
				updated_at: now.toISOString(),
			})
			.eq('id', invoiceId);

		if (error) {
			throw new Error(`Failed to mark invoice as paid: ${error.message}`);
		}
	}

	/**
	 * Calculate usage-based billing
	 */
	private async calculateUsageBilling(
		tenantId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<UsageBillingItem[]> {
		// Get usage data for period
		const { data, error } = await this.supabase
			.from('tenant_usage_history')
			.select('*')
			.eq('tenant_id', tenantId)
			.gte('timestamp', periodStart.toISOString())
			.lte('timestamp', periodEnd.toISOString());

		if (error) {
			throw new Error(`Failed to get usage data: ${error.message}`);
		}

		// Calculate billing for each resource
		const usageMap = new Map<string, number>();

		for (const usage of data ?? []) {
			const current = usageMap.get(usage.resource) ?? 0;
			usageMap.set(usage.resource, current + usage.count);
		}

		// Convert to billing items (example pricing)
		const items: UsageBillingItem[] = [];

		for (const [resource, quantity] of usageMap.entries()) {
			const unitPrice = this.getUsageUnitPrice(resource);
			if (unitPrice > 0 && quantity > 0) {
				items.push({
					resource,
					quantity,
					unitPrice,
					total: quantity * unitPrice,
				});
			}
		}

		return items;
	}

	/**
	 * Get unit price for usage-based resource
	 */
	private getUsageUnitPrice(resource: string): number {
		// Example pricing (per unit)
		const pricing: Record<string, number> = {
			executions: 0.01, // $0.01 per execution
			apiCalls: 0.001, // $0.001 per API call
			storage: 0.00001, // $0.00001 per MB
		};

		return pricing[resource] ?? 0;
	}

	/**
	 * Calculate period end date
	 */
	private calculatePeriodEnd(start: Date, period: BillingPeriod): Date {
		const end = new Date(start);

		if (period === BillingPeriod.MONTHLY) {
			end.setMonth(end.getMonth() + 1);
		} else {
			end.setFullYear(end.getFullYear() + 1);
		}

		return end;
	}

	/**
	 * Check if plan change is an upgrade
	 */
	private isUpgrade(currentPlan: TenantPlanType, newPlan: TenantPlanType): boolean {
		const planTiers = [
			TenantPlanType.FREE,
			TenantPlanType.STARTER,
			TenantPlanType.PROFESSIONAL,
			TenantPlanType.ENTERPRISE,
			TenantPlanType.CUSTOM,
		];

		const currentIndex = planTiers.indexOf(currentPlan);
		const newIndex = planTiers.indexOf(newPlan);

		return newIndex > currentIndex;
	}

	/**
	 * Process recurring billing
	 */
	async processRecurringBilling(): Promise<void> {
		const now = new Date();

		// Get subscriptions that need billing
		const { data: subscriptions, error } = await this.supabase
			.from('tenant_subscriptions')
			.select('*')
			.eq('status', SubscriptionStatus.ACTIVE)
			.lte('current_period_end', now.toISOString());

		if (error) {
			throw new Error(`Failed to get subscriptions for billing: ${error.message}`);
		}

		for (const subscription of subscriptions ?? []) {
			try {
				// Generate invoice
				await this.generateInvoice(
					subscription.tenant_id,
					new Date(subscription.current_period_start),
					new Date(subscription.current_period_end),
				);

				// Update subscription period
				const newPeriodStart = new Date(subscription.current_period_end);
				const newPeriodEnd = this.calculatePeriodEnd(
					newPeriodStart,
					subscription.billing_period,
				);

				await this.supabase
					.from('tenant_subscriptions')
					.update({
						current_period_start: newPeriodStart.toISOString(),
						current_period_end: newPeriodEnd.toISOString(),
						updated_at: now.toISOString(),
					})
					.eq('id', subscription.id);
			} catch (error) {
				console.error(
					`Failed to process billing for tenant ${subscription.tenant_id}:`,
					error,
				);
			}
		}
	}
}
