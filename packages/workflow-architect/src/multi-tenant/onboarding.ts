import { type CreateTenantConfig, type Tenant, TenantPlanType } from './types';
import { TenantManager } from './tenant';
import { TenantQuotaManager } from './quotas';
import { TenantBilling, BillingPeriod } from './billing';

/**
 * Onboarding step
 */
export interface OnboardingStep {
	id: string;
	title: string;
	description: string;
	completed: boolean;
	required: boolean;
	order: number;
}

/**
 * Onboarding progress
 */
export interface OnboardingProgress {
	tenantId: string;
	steps: OnboardingStep[];
	currentStep: string;
	completedSteps: number;
	totalSteps: number;
	percentComplete: number;
}

/**
 * Default data seed
 */
export interface DefaultData {
	workflows?: Array<Record<string, unknown>>;
	users?: Array<{
		email: string;
		role: string;
		name?: string;
	}>;
	settings?: Record<string, unknown>;
}

/**
 * OnboardingManager handles tenant provisioning
 */
export class OnboardingManager {
	private tenantManager: TenantManager;
	private quotaManager: TenantQuotaManager;
	private billingManager: TenantBilling;

	constructor(
		tenantManager: TenantManager,
		quotaManager: TenantQuotaManager,
		billingManager: TenantBilling,
	) {
		this.tenantManager = tenantManager;
		this.quotaManager = quotaManager;
		this.billingManager = billingManager;
	}

	/**
	 * Provision a new tenant
	 */
	async provision(config: CreateTenantConfig): Promise<Tenant> {
		// Step 1: Create tenant
		const tenant = await this.tenantManager.create(config);

		// Step 2: Set up quotas
		await this.setupQuotas(tenant);

		// Step 3: Create subscription
		await this.setupSubscription(tenant);

		// Step 4: Seed default data
		await this.seedDefaultData(tenant);

		// Step 5: Initialize onboarding progress
		await this.initializeOnboarding(tenant.id);

		// Step 6: Send welcome notifications
		await this.sendWelcomeNotifications(tenant);

		return tenant;
	}

	/**
	 * Get onboarding progress
	 */
	async getProgress(tenantId: string): Promise<OnboardingProgress> {
		const steps = this.getOnboardingSteps();

		// Get completed steps from database
		const completedStepIds = await this.getCompletedSteps(tenantId);

		// Mark steps as completed
		const updatedSteps = steps.map((step) => ({
			...step,
			completed: completedStepIds.includes(step.id),
		}));

		// Find current step (first uncompleted required step)
		const currentStep =
			updatedSteps.find((step) => !step.completed && step.required)?.id ?? '';

		const completedSteps = updatedSteps.filter((step) => step.completed).length;
		const totalSteps = updatedSteps.length;

		return {
			tenantId,
			steps: updatedSteps,
			currentStep,
			completedSteps,
			totalSteps,
			percentComplete: (completedSteps / totalSteps) * 100,
		};
	}

	/**
	 * Complete an onboarding step
	 */
	async completeStep(tenantId: string, stepId: string): Promise<void> {
		// Validate step exists
		const steps = this.getOnboardingSteps();
		const step = steps.find((s) => s.id === stepId);

		if (!step) {
			throw new Error(`Invalid onboarding step: ${stepId}`);
		}

		// Mark step as completed (using Supabase client from tenant manager)
		// This would need access to the Supabase client
		console.log(`Marking step ${stepId} as completed for tenant ${tenantId}`);
	}

	/**
	 * Skip an optional onboarding step
	 */
	async skipStep(tenantId: string, stepId: string): Promise<void> {
		const steps = this.getOnboardingSteps();
		const step = steps.find((s) => s.id === stepId);

		if (!step) {
			throw new Error(`Invalid onboarding step: ${stepId}`);
		}

		if (step.required) {
			throw new Error(`Cannot skip required step: ${stepId}`);
		}

		await this.completeStep(tenantId, stepId);
	}

	/**
	 * Get onboarding steps
	 */
	private getOnboardingSteps(): OnboardingStep[] {
		return [
			{
				id: 'create-account',
				title: 'Create Account',
				description: 'Set up your tenant account',
				completed: false,
				required: true,
				order: 1,
			},
			{
				id: 'configure-branding',
				title: 'Configure Branding',
				description: 'Customize your brand colors, logo, and domain',
				completed: false,
				required: false,
				order: 2,
			},
			{
				id: 'invite-users',
				title: 'Invite Team Members',
				description: 'Add your team members to collaborate',
				completed: false,
				required: false,
				order: 3,
			},
			{
				id: 'create-first-workflow',
				title: 'Create Your First Workflow',
				description: 'Build your first automation workflow',
				completed: false,
				required: true,
				order: 4,
			},
			{
				id: 'configure-sso',
				title: 'Set Up SSO',
				description: 'Configure single sign-on for your organization',
				completed: false,
				required: false,
				order: 5,
			},
			{
				id: 'setup-webhooks',
				title: 'Configure Webhooks',
				description: 'Set up webhook integrations',
				completed: false,
				required: false,
				order: 6,
			},
			{
				id: 'billing-setup',
				title: 'Complete Billing Setup',
				description: 'Add payment method and finalize subscription',
				completed: false,
				required: true,
				order: 7,
			},
		];
	}

	/**
	 * Get completed steps from database
	 */
	private async getCompletedSteps(tenantId: string): Promise<string[]> {
		// This would query the database for completed onboarding steps
		// For now, return empty array
		console.log(`Getting completed steps for tenant ${tenantId}`);
		return [];
	}

	/**
	 * Initialize onboarding progress
	 */
	private async initializeOnboarding(tenantId: string): Promise<void> {
		// Mark 'create-account' as completed since tenant is created
		await this.completeStep(tenantId, 'create-account');
	}

	/**
	 * Set up quotas for tenant
	 */
	private async setupQuotas(tenant: Tenant): Promise<void> {
		await this.quotaManager.setQuotas(tenant.id, tenant.plan.quotas);
	}

	/**
	 * Set up subscription for tenant
	 */
	private async setupSubscription(tenant: Tenant): Promise<void> {
		const trialDays = tenant.plan.type === TenantPlanType.FREE ? undefined : 14;

		await this.billingManager.createSubscription(tenant.id, tenant.plan, {
			billingPeriod: BillingPeriod.MONTHLY,
			trialDays,
		});
	}

	/**
	 * Seed default data
	 */
	private async seedDefaultData(tenant: Tenant): Promise<void> {
		const defaultData = this.getDefaultData(tenant.plan.type);

		// Seed workflows
		if (defaultData.workflows && defaultData.workflows.length > 0) {
			console.log(`Seeding ${defaultData.workflows.length} default workflows for tenant ${tenant.id}`);
			// This would insert default workflows
		}

		// Seed users
		if (defaultData.users && defaultData.users.length > 0) {
			console.log(`Seeding ${defaultData.users.length} default users for tenant ${tenant.id}`);
			// This would create default users
		}

		// Apply settings
		if (defaultData.settings) {
			console.log(`Applying default settings for tenant ${tenant.id}`);
			// This would update tenant settings
		}
	}

	/**
	 * Get default data based on plan type
	 */
	private getDefaultData(planType: TenantPlanType): DefaultData {
		const baseData: DefaultData = {
			workflows: [
				{
					name: 'Welcome Workflow',
					description: 'A sample workflow to get you started',
					active: false,
				},
			],
		};

		switch (planType) {
			case TenantPlanType.FREE:
				return baseData;

			case TenantPlanType.STARTER:
				return {
					...baseData,
					workflows: [
						...(baseData.workflows ?? []),
						{
							name: 'Email Notification Workflow',
							description: 'Automated email notifications',
							active: false,
						},
					],
				};

			case TenantPlanType.PROFESSIONAL:
				return {
					...baseData,
					workflows: [
						...(baseData.workflows ?? []),
						{
							name: 'Email Notification Workflow',
							description: 'Automated email notifications',
							active: false,
						},
						{
							name: 'Data Sync Workflow',
							description: 'Sync data between systems',
							active: false,
						},
					],
				};

			case TenantPlanType.ENTERPRISE:
			case TenantPlanType.CUSTOM:
				return {
					...baseData,
					workflows: [
						...(baseData.workflows ?? []),
						{
							name: 'Email Notification Workflow',
							description: 'Automated email notifications',
							active: false,
						},
						{
							name: 'Data Sync Workflow',
							description: 'Sync data between systems',
							active: false,
						},
						{
							name: 'Advanced Analytics Workflow',
							description: 'Process and analyze data',
							active: false,
						},
					],
				};

			default:
				return baseData;
		}
	}

	/**
	 * Send welcome notifications
	 */
	private async sendWelcomeNotifications(tenant: Tenant): Promise<void> {
		console.log(`Sending welcome notifications for tenant ${tenant.id}`);

		// This would integrate with an email service to send:
		// 1. Welcome email to admin
		// 2. Setup guide email
		// 3. Resource links

		// Example notification
		const notification = {
			tenantId: tenant.id,
			type: 'WELCOME',
			subject: `Welcome to ${tenant.name}!`,
			message: `Your tenant has been successfully provisioned. Let's get started!`,
		};

		console.log('Welcome notification:', notification);
	}

	/**
	 * Generate onboarding checklist
	 */
	async generateChecklist(tenantId: string): Promise<{
		title: string;
		items: Array<{
			text: string;
			completed: boolean;
			action?: string;
		}>;
	}> {
		const progress = await this.getProgress(tenantId);

		return {
			title: 'Get Started Checklist',
			items: progress.steps.map((step) => ({
				text: step.title,
				completed: step.completed,
				action: step.completed ? undefined : `/onboarding/${step.id}`,
			})),
		};
	}

	/**
	 * Check if onboarding is complete
	 */
	async isOnboardingComplete(tenantId: string): Promise<boolean> {
		const progress = await this.getProgress(tenantId);
		const requiredSteps = progress.steps.filter((step) => step.required);
		return requiredSteps.every((step) => step.completed);
	}

	/**
	 * Reset onboarding progress
	 */
	async resetOnboarding(tenantId: string): Promise<void> {
		console.log(`Resetting onboarding for tenant ${tenantId}`);
		// This would clear all completed steps except 'create-account'
	}
}
