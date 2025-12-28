import type {
	BillingIntegration,
	BillingLineItem,
	Usage,
	UsageReport,
	QuotaType,
} from './types';

/**
 * Stripe configuration
 */
export interface StripeConfig {
	/** Stripe API key */
	apiKey: string;
	/** Stripe price IDs for quota types */
	priceIds?: Partial<Record<QuotaType, string>>;
	/** Default currency (default: 'usd') */
	currency?: string;
}

/**
 * Stripe usage reporter for metered billing
 *
 * Integrates with Stripe's metered billing to report usage
 * and generate invoices automatically.
 *
 * @example
 * ```typescript
 * const reporter = new StripeUsageReporter({
 *   apiKey: process.env.STRIPE_API_KEY,
 *   priceIds: {
 *     [QuotaType.EXECUTIONS]: 'price_executions_123',
 *     [QuotaType.API_CALLS]: 'price_api_calls_456',
 *   }
 * });
 *
 * // Report usage to Stripe
 * await reporter.reportUsage('user-123', [
 *   { userId: 'user-123', quotaType: QuotaType.EXECUTIONS, used: 100, timestamp: new Date() }
 * ]);
 * ```
 */
export class StripeUsageReporter implements BillingIntegration {
	private readonly apiKey: string;
	private readonly priceIds: Partial<Record<QuotaType, string>>;
	private readonly currency: string;

	constructor(config: StripeConfig) {
		this.apiKey = config.apiKey;
		this.priceIds = config.priceIds ?? {};
		this.currency = config.currency ?? 'usd';
	}

	/**
	 * Report usage to Stripe for metered billing
	 *
	 * @param userId - User identifier
	 * @param usage - Array of usage records
	 */
	async reportUsage(userId: string, usage: Usage[]): Promise<void> {
		// Get customer's subscription
		const subscriptionId = await this.getSubscriptionId(userId);
		if (!subscriptionId) {
			console.warn(`No subscription found for user ${userId}`);
			return;
		}

		// Group usage by quota type
		const usageByType = this.groupUsageByType(usage);

		// Report to Stripe
		const promises = Array.from(usageByType.entries()).map(([quotaType, total]) => {
			const priceId = this.priceIds[quotaType];
			if (!priceId) {
				console.warn(`No Stripe price ID configured for ${quotaType}`);
				return Promise.resolve();
			}

			return this.createUsageRecord(subscriptionId, priceId, total);
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Get billing period for a user
	 *
	 * @param userId - User identifier
	 * @returns Billing period start and end dates
	 */
	async getBillingPeriod(userId: string): Promise<{ start: Date; end: Date }> {
		const subscriptionId = await this.getSubscriptionId(userId);
		if (!subscriptionId) {
			throw new Error(`No subscription found for user ${userId}`);
		}

		// In a real implementation, fetch from Stripe
		// For now, return current month
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

		return { start, end };
	}

	/**
	 * Create invoice line items from usage report
	 *
	 * @param userId - User identifier
	 * @param usage - Usage report
	 * @returns Array of billing line items
	 */
	async createLineItems(userId: string, usage: UsageReport): Promise<BillingLineItem[]> {
		const lineItems: BillingLineItem[] = [];

		for (const [quotaType, usageData] of usage.usage.entries()) {
			const priceId = this.priceIds[quotaType];
			if (!priceId) {
				continue;
			}

			// Get pricing info
			const pricing = await this.getPricing(priceId);
			if (!pricing) {
				continue;
			}

			const quantity = usageData.total;
			const unitPrice = pricing.unitAmount;
			const totalPrice = quantity * unitPrice;

			lineItems.push({
				description: `${this.getQuotaDisplayName(quotaType)} - ${quantity} units`,
				quantity,
				unitPrice,
				totalPrice,
				quotaType,
			});
		}

		return lineItems;
	}

	/**
	 * Get subscription ID for a user
	 */
	private async getSubscriptionId(userId: string): Promise<string | null> {
		try {
			// In a real implementation, fetch from database or Stripe API
			// For now, return a mock subscription ID
			return `sub_${userId}`;
		} catch (error) {
			console.error('Failed to get subscription ID:', error);
			return null;
		}
	}

	/**
	 * Create a usage record in Stripe
	 */
	private async createUsageRecord(
		subscriptionId: string,
		priceId: string,
		quantity: number,
	): Promise<void> {
		try {
			// In a real implementation, use Stripe SDK
			// const stripe = new Stripe(this.apiKey);
			// await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
			//   quantity,
			//   timestamp: Math.floor(Date.now() / 1000),
			// });

			console.log(`Created usage record: ${subscriptionId}, ${priceId}, ${quantity}`);
		} catch (error) {
			console.error('Failed to create usage record:', error);
			throw error;
		}
	}

	/**
	 * Get pricing information for a price ID
	 */
	private async getPricing(
		priceId: string,
	): Promise<{ unitAmount: number; currency: string } | null> {
		try {
			// In a real implementation, fetch from Stripe API
			// For now, return mock pricing
			return {
				unitAmount: 10, // $0.10 per unit
				currency: this.currency,
			};
		} catch (error) {
			console.error('Failed to get pricing:', error);
			return null;
		}
	}

	/**
	 * Group usage by quota type
	 */
	private groupUsageByType(usage: Usage[]): Map<QuotaType, number> {
		const grouped = new Map<QuotaType, number>();

		for (const record of usage) {
			const current = grouped.get(record.quotaType) ?? 0;
			grouped.set(record.quotaType, current + record.used);
		}

		return grouped;
	}

	/**
	 * Get display name for quota type
	 */
	private getQuotaDisplayName(quotaType: QuotaType): string {
		const names: Record<QuotaType, string> = {
			[QuotaType.WORKFLOWS]: 'Workflows',
			[QuotaType.EXECUTIONS]: 'Workflow Executions',
			[QuotaType.API_CALLS]: 'API Calls',
			[QuotaType.STORAGE]: 'Storage',
			[QuotaType.BANDWIDTH]: 'Bandwidth',
			[QuotaType.NODES]: 'Custom Nodes',
		};

		return names[quotaType] ?? quotaType;
	}
}

/**
 * Mock billing integration for testing
 */
export class MockBillingIntegration implements BillingIntegration {
	private readonly usageRecords: Map<string, Usage[]>;

	constructor() {
		this.usageRecords = new Map();
	}

	async reportUsage(userId: string, usage: Usage[]): Promise<void> {
		const existing = this.usageRecords.get(userId) ?? [];
		this.usageRecords.set(userId, [...existing, ...usage]);
	}

	async getBillingPeriod(userId: string): Promise<{ start: Date; end: Date }> {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return { start, end };
	}

	async createLineItems(userId: string, usage: UsageReport): Promise<BillingLineItem[]> {
		const lineItems: BillingLineItem[] = [];

		for (const [quotaType, usageData] of usage.usage.entries()) {
			lineItems.push({
				description: `${quotaType} - ${usageData.total} units`,
				quantity: usageData.total,
				unitPrice: 10,
				totalPrice: usageData.total * 10,
				quotaType,
			});
		}

		return lineItems;
	}

	getUsageRecords(userId: string): Usage[] {
		return this.usageRecords.get(userId) ?? [];
	}

	clear(): void {
		this.usageRecords.clear();
	}
}

/**
 * Pricing tier configuration
 */
export interface PricingTier {
	/** Minimum usage (inclusive) */
	min: number;
	/** Maximum usage (exclusive), undefined for unlimited */
	max?: number;
	/** Price per unit in cents */
	pricePerUnit: number;
}

/**
 * Calculate tiered pricing
 *
 * @param usage - Total usage amount
 * @param tiers - Pricing tiers
 * @returns Total cost in cents
 *
 * @example
 * ```typescript
 * const tiers = [
 *   { min: 0, max: 1000, pricePerUnit: 10 },      // $0.10 for 0-999
 *   { min: 1000, max: 10000, pricePerUnit: 8 },   // $0.08 for 1000-9999
 *   { min: 10000, pricePerUnit: 5 },              // $0.05 for 10000+
 * ];
 *
 * const cost = calculateTieredPricing(5000, tiers);
 * console.log(cost); // 1000 * 10 + 4000 * 8 = 42000 cents = $420
 * ```
 */
export function calculateTieredPricing(usage: number, tiers: PricingTier[]): number {
	let totalCost = 0;
	let remaining = usage;

	// Sort tiers by min value
	const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);

	for (const tier of sortedTiers) {
		if (remaining <= 0) {
			break;
		}

		const tierMin = tier.min;
		const tierMax = tier.max ?? Infinity;
		const tierSize = tierMax - tierMin;

		const usageInTier = Math.min(remaining, tierSize);
		totalCost += usageInTier * tier.pricePerUnit;

		remaining -= usageInTier;
	}

	return totalCost;
}

/**
 * Calculate overage charges
 *
 * @param usage - Total usage
 * @param limit - Plan limit
 * @param overageRate - Rate per unit over limit in cents
 * @returns Overage cost in cents
 */
export function calculateOverage(usage: number, limit: number, overageRate: number): number {
	const overage = Math.max(0, usage - limit);
	return overage * overageRate;
}

/**
 * Format currency amount
 *
 * @param amountInCents - Amount in cents
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string
 */
export function formatCurrency(amountInCents: number, currency = 'USD'): string {
	const amount = amountInCents / 100;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
	}).format(amount);
}
