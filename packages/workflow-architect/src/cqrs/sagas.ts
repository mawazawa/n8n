import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Event, Saga, SagaState } from './types';
import type { CommandBus } from './commands';

/**
 * Saga step definition
 */
export interface SagaStep {
	/** Step name */
	name: string;
	/** Execute the step */
	execute: (data: Record<string, unknown>) => Promise<void>;
	/** Compensate for the step (rollback) */
	compensate: (data: Record<string, unknown>) => Promise<void>;
	/** Timeout for this step in milliseconds */
	timeout?: number;
}

/**
 * Base class for sagas
 * Sagas coordinate long-running processes across aggregates
 */
export abstract class SagaBase {
	protected id: string;
	protected sagaType: string;
	protected data: Record<string, unknown>;
	protected currentStep: number;
	protected completedSteps: string[];
	protected compensations: string[];
	protected state: SagaState;
	protected startedAt: Date;
	protected completedAt?: Date;
	protected timeout?: Date;

	constructor(id?: string) {
		this.id = id || uuidv4();
		this.sagaType = this.constructor.name;
		this.data = {};
		this.currentStep = 0;
		this.completedSteps = [];
		this.compensations = [];
		this.state = 'started';
		this.startedAt = new Date();
	}

	/**
	 * Get saga steps
	 */
	protected abstract getSteps(): SagaStep[];

	/**
	 * Get saga ID
	 */
	getId(): string {
		return this.id;
	}

	/**
	 * Get saga type
	 */
	getType(): string {
		return this.sagaType;
	}

	/**
	 * Get saga state
	 */
	getState(): SagaState {
		return this.state;
	}

	/**
	 * Get saga data
	 */
	getData(): Record<string, unknown> {
		return { ...this.data };
	}

	/**
	 * Set saga data
	 */
	setData(data: Record<string, unknown>): void {
		this.data = { ...this.data, ...data };
	}

	/**
	 * Execute the saga
	 */
	async execute(): Promise<void> {
		const steps = this.getSteps();

		this.state = 'running';

		try {
			for (let i = this.currentStep; i < steps.length; i++) {
				const step = steps[i];
				this.currentStep = i;

				// Check timeout
				if (this.timeout && new Date() > this.timeout) {
					this.state = 'timeout';
					await this.compensate();
					throw new Error(`Saga ${this.id} timed out at step ${step.name}`);
				}

				// Execute step with timeout
				try {
					if (step.timeout) {
						await this.executeWithTimeout(
							() => step.execute(this.data),
							step.timeout,
						);
					} else {
						await step.execute(this.data);
					}

					this.completedSteps.push(step.name);
				} catch (error) {
					// Step failed, start compensation
					this.state = 'compensating';
					await this.compensate();
					this.state = 'failed';
					throw error;
				}
			}

			// All steps completed successfully
			this.state = 'completed';
			this.completedAt = new Date();
		} catch (error) {
			if (this.state !== 'timeout') {
				this.state = 'failed';
			}
			throw error;
		}
	}

	/**
	 * Compensate (rollback) completed steps
	 */
	private async compensate(): Promise<void> {
		const steps = this.getSteps();

		// Compensate in reverse order
		for (let i = this.completedSteps.length - 1; i >= 0; i--) {
			const stepName = this.completedSteps[i];
			const step = steps.find((s) => s.name === stepName);

			if (!step) {
				continue;
			}

			try {
				await step.compensate(this.data);
				this.compensations.push(stepName);
			} catch (error) {
				// Log compensation failure but continue
				console.error(`Failed to compensate step ${stepName}:`, error);
			}
		}
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout(
		fn: () => Promise<void>,
		timeout: number,
	): Promise<void> {
		return Promise.race([
			fn(),
			new Promise<void>((_, reject) =>
				setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout),
			),
		]);
	}

	/**
	 * Set saga timeout
	 */
	setTimeout(timeoutMs: number): void {
		this.timeout = new Date(Date.now() + timeoutMs);
	}

	/**
	 * Serialize saga state
	 */
	toJSON(): Saga {
		return {
			id: this.id,
			type: this.sagaType,
			state: this.state,
			data: this.data,
			currentStep: this.currentStep,
			completedSteps: this.completedSteps,
			compensations: this.compensations,
			startedAt: this.startedAt,
			completedAt: this.completedAt,
			timeout: this.timeout,
		};
	}

	/**
	 * Restore saga from JSON
	 */
	fromJSON(saga: Saga): void {
		this.id = saga.id;
		this.sagaType = saga.type;
		this.state = saga.state;
		this.data = saga.data;
		this.currentStep = saga.currentStep;
		this.completedSteps = saga.completedSteps;
		this.compensations = saga.compensations;
		this.startedAt = saga.startedAt;
		this.completedAt = saga.completedAt;
		this.timeout = saga.timeout;
	}
}

/**
 * Saga manager for managing saga lifecycle
 */
export class SagaManager {
	private supabase: SupabaseClient;
	private commandBus: CommandBus;
	private sagas: Map<string, SagaBase> = new Map();
	private eventHandlers: Map<string, Set<(event: Event) => Promise<void>>> = new Map();

	constructor(supabaseUrl: string, supabaseKey: string, commandBus: CommandBus) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.commandBus = commandBus;
	}

	/**
	 * Start a new saga
	 */
	async start(saga: SagaBase, timeoutMs?: number): Promise<void> {
		// Set timeout if provided
		if (timeoutMs) {
			saga.setTimeout(timeoutMs);
		}

		// Save saga to database
		await this.saveSaga(saga);

		// Store in memory
		this.sagas.set(saga.getId(), saga);

		try {
			// Execute saga
			await saga.execute();

			// Update saga state
			await this.saveSaga(saga);
		} catch (error) {
			// Save failed state
			await this.saveSaga(saga);
			throw error;
		}
	}

	/**
	 * Resume a saga from a checkpoint
	 */
	async resume(sagaId: string): Promise<void> {
		// Load saga from database
		const sagaData = await this.loadSaga(sagaId);
		if (!sagaData) {
			throw new Error(`Saga ${sagaId} not found`);
		}

		// Get saga instance
		const saga = this.sagas.get(sagaId);
		if (!saga) {
			throw new Error(`Saga ${sagaId} not registered in memory`);
		}

		// Restore state
		saga.fromJSON(sagaData);

		try {
			// Continue execution
			await saga.execute();

			// Update saga state
			await this.saveSaga(saga);
		} catch (error) {
			// Save failed state
			await this.saveSaga(saga);
			throw error;
		}
	}

	/**
	 * Handle an event that might trigger sagas
	 */
	async handleEvent(event: Event): Promise<void> {
		const handlers = this.eventHandlers.get(event.type);
		if (!handlers) {
			return;
		}

		// Execute all handlers for this event type
		await Promise.all(Array.from(handlers).map((handler) => handler(event)));
	}

	/**
	 * Register a saga to start on specific event
	 */
	onEvent(
		eventType: string,
		handler: (event: Event) => Promise<void>,
	): void {
		if (!this.eventHandlers.has(eventType)) {
			this.eventHandlers.set(eventType, new Set());
		}

		this.eventHandlers.get(eventType)!.add(handler);
	}

	/**
	 * Save saga state to database
	 */
	private async saveSaga(saga: SagaBase): Promise<void> {
		const sagaData = saga.toJSON();

		const { error } = await this.supabase.from('sagas').upsert({
			id: sagaData.id,
			type: sagaData.type,
			state: sagaData.state,
			data: sagaData.data,
			current_step: sagaData.currentStep,
			completed_steps: sagaData.completedSteps,
			compensations: sagaData.compensations,
			started_at: sagaData.startedAt.toISOString(),
			completed_at: sagaData.completedAt?.toISOString(),
			timeout: sagaData.timeout?.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to save saga: ${error.message}`);
		}
	}

	/**
	 * Load saga state from database
	 */
	private async loadSaga(sagaId: string): Promise<Saga | null> {
		const { data, error } = await this.supabase
			.from('sagas')
			.select('*')
			.eq('id', sagaId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to load saga: ${error.message}`);
		}

		return this.mapToSaga(data);
	}

	/**
	 * Get saga by ID
	 */
	async getSaga(sagaId: string): Promise<Saga | null> {
		return this.loadSaga(sagaId);
	}

	/**
	 * Get all sagas
	 */
	async getAllSagas(): Promise<Saga[]> {
		const { data, error } = await this.supabase
			.from('sagas')
			.select('*')
			.order('started_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get sagas: ${error.message}`);
		}

		return (data || []).map(this.mapToSaga);
	}

	/**
	 * Get sagas by state
	 */
	async getSagasByState(state: SagaState): Promise<Saga[]> {
		const { data, error } = await this.supabase
			.from('sagas')
			.select('*')
			.eq('state', state)
			.order('started_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to get sagas by state: ${error.message}`);
		}

		return (data || []).map(this.mapToSaga);
	}

	/**
	 * Cleanup completed sagas older than a certain age
	 */
	async cleanupCompletedSagas(olderThanMs: number): Promise<number> {
		const cutoffDate = new Date(Date.now() - olderThanMs);

		const { data, error } = await this.supabase
			.from('sagas')
			.delete()
			.eq('state', 'completed')
			.lt('completed_at', cutoffDate.toISOString())
			.select('id');

		if (error) {
			throw new Error(`Failed to cleanup completed sagas: ${error.message}`);
		}

		return data?.length || 0;
	}

	/**
	 * Map database row to Saga
	 */
	private mapToSaga(row: Record<string, unknown>): Saga {
		return {
			id: row.id as string,
			type: row.type as string,
			state: row.state as SagaState,
			data: row.data as Record<string, unknown>,
			currentStep: row.current_step as number,
			completedSteps: row.completed_steps as string[],
			compensations: row.compensations as string[],
			startedAt: new Date(row.started_at as string),
			completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
			timeout: row.timeout ? new Date(row.timeout as string) : undefined,
		};
	}

	/**
	 * Get command bus
	 */
	getCommandBus(): CommandBus {
		return this.commandBus;
	}
}

/**
 * Example: Workflow deployment saga
 */
export class WorkflowDeploymentSaga extends SagaBase {
	protected getSteps(): SagaStep[] {
		return [
			{
				name: 'validate-workflow',
				execute: async (data) => {
					// Validate workflow structure
					console.log('Validating workflow', data.workflowId);
					// In a real implementation, this would call a validation service
				},
				compensate: async () => {
					// No compensation needed for validation
				},
			},
			{
				name: 'allocate-resources',
				execute: async (data) => {
					// Allocate compute resources
					console.log('Allocating resources for', data.workflowId);
					data.resourceId = uuidv4();
				},
				compensate: async (data) => {
					// Release allocated resources
					console.log('Releasing resources', data.resourceId);
				},
				timeout: 30000, // 30 second timeout
			},
			{
				name: 'deploy-workflow',
				execute: async (data) => {
					// Deploy workflow
					console.log('Deploying workflow', data.workflowId);
					data.deploymentId = uuidv4();
				},
				compensate: async (data) => {
					// Undeploy workflow
					console.log('Undeploying workflow', data.deploymentId);
				},
				timeout: 60000, // 60 second timeout
			},
			{
				name: 'start-monitoring',
				execute: async (data) => {
					// Start monitoring
					console.log('Starting monitoring for', data.deploymentId);
					data.monitoringId = uuidv4();
				},
				compensate: async (data) => {
					// Stop monitoring
					console.log('Stopping monitoring', data.monitoringId);
				},
			},
			{
				name: 'notify-completion',
				execute: async (data) => {
					// Send notification
					console.log('Deployment completed for', data.workflowId);
				},
				compensate: async () => {
					// No compensation needed for notification
				},
			},
		];
	}
}
