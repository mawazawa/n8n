/**
 * Offline Support
 * Queue and manage offline operations
 */

import { EventEmitter } from 'events';
import {
	type OfflineAction,
	OfflineActionSchema,
	type MobileConfig,
	type NetworkState,
} from './types';

/**
 * Offline manager
 */
export class OfflineManager extends EventEmitter {
	private config: MobileConfig;
	private queue: OfflineAction[] = [];
	private processing = false;

	constructor(config: MobileConfig) {
		super();
		this.config = config;
		this.loadQueue();
	}

	/**
	 * Enqueue offline action
	 */
	enqueue(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount' | 'status'>): string {
		const fullAction: OfflineAction = {
			...action,
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			retryCount: 0,
			status: 'PENDING',
		};

		const validated = OfflineActionSchema.parse(fullAction);

		// Check queue size
		if (this.queue.length >= this.config.offline.maxQueueSize) {
			// Remove oldest item
			this.queue.shift();
			this.emit('queueOverflow');
		}

		this.queue.push(validated);
		this.saveQueue();

		this.emit('actionEnqueued', validated);

		return validated.id;
	}

	/**
	 * Process queue
	 */
	async processQueue(): Promise<void> {
		if (this.processing) {
			return;
		}

		if (this.queue.length === 0) {
			return;
		}

		this.processing = true;
		this.emit('processingStarted');

		const actionsToProcess = [...this.queue];

		for (const action of actionsToProcess) {
			try {
				await this.processAction(action);
				this.markCompleted(action.id);
			} catch (error) {
				await this.handleFailure(action, error);
			}
		}

		this.processing = false;
		this.emit('processingCompleted');
	}

	/**
	 * Process single action
	 */
	private async processAction(action: OfflineAction): Promise<void> {
		this.emit('actionProcessing', action);

		// This would be implemented by the SDK consumer
		// For now, simulate processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		this.emit('actionProcessed', action);
	}

	/**
	 * Mark action as completed
	 */
	private markCompleted(actionId: string): void {
		const index = this.queue.findIndex((a) => a.id === actionId);
		if (index !== -1) {
			const action = this.queue[index];
			action.status = 'COMPLETED';
			this.queue.splice(index, 1);
			this.saveQueue();
			this.emit('actionCompleted', action);
		}
	}

	/**
	 * Handle action failure
	 */
	private async handleFailure(action: OfflineAction, error: unknown): Promise<void> {
		action.retryCount++;
		action.error = error instanceof Error ? error.message : String(error);

		if (action.retryCount >= this.config.offline.retryAttempts) {
			action.status = 'FAILED';
			this.emit('actionFailed', action);

			// Remove from queue
			const index = this.queue.findIndex((a) => a.id === action.id);
			if (index !== -1) {
				this.queue.splice(index, 1);
			}
		} else {
			action.status = 'PENDING';
			this.emit('actionRetrying', action);

			// Wait before retry
			await new Promise((resolve) =>
				setTimeout(resolve, this.config.offline.retryDelay * action.retryCount),
			);
		}

		this.saveQueue();
	}

	/**
	 * Get queue status
	 */
	getQueueStatus(): {
		total: number;
		pending: number;
		processing: number;
		failed: number;
	} {
		return {
			total: this.queue.length,
			pending: this.queue.filter((a) => a.status === 'PENDING').length,
			processing: this.queue.filter((a) => a.status === 'PROCESSING').length,
			failed: this.queue.filter((a) => a.status === 'FAILED').length,
		};
	}

	/**
	 * Get all actions
	 */
	getActions(): OfflineAction[] {
		return [...this.queue];
	}

	/**
	 * Get action by ID
	 */
	getAction(id: string): OfflineAction | undefined {
		return this.queue.find((a) => a.id === id);
	}

	/**
	 * Cancel action
	 */
	cancelAction(id: string): boolean {
		const index = this.queue.findIndex((a) => a.id === id);
		if (index !== -1) {
			const action = this.queue[index];
			this.queue.splice(index, 1);
			this.saveQueue();
			this.emit('actionCancelled', action);
			return true;
		}
		return false;
	}

	/**
	 * Clear queue
	 */
	clearQueue(): void {
		const count = this.queue.length;
		this.queue = [];
		this.saveQueue();
		this.emit('queueCleared', count);
	}

	/**
	 * Save queue to storage
	 */
	private saveQueue(): void {
		try {
			localStorage.setItem('offline_queue', JSON.stringify(this.queue));
		} catch (error) {
			this.emit('storageError', error);
		}
	}

	/**
	 * Load queue from storage
	 */
	private loadQueue(): void {
		try {
			const stored = localStorage.getItem('offline_queue');
			if (stored) {
				const parsed = JSON.parse(stored);
				this.queue = parsed.map((action: OfflineAction) =>
					OfflineActionSchema.parse(action),
				);
			}
		} catch (error) {
			this.emit('storageError', error);
			this.queue = [];
		}
	}

	/**
	 * Handle network state change
	 */
	onNetworkStateChange(networkState: NetworkState): void {
		if (networkState.isConnected && this.queue.length > 0) {
			void this.processQueue();
		}
	}
}
