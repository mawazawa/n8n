/**
 * Data Synchronization
 * Incremental sync with conflict resolution
 */

import { EventEmitter } from 'events';
import {
	type SyncState,
	SyncStateSchema,
	type MobileConfig,
	ConflictResolution,
} from './types';

/**
 * Sync manager
 */
export class SyncManager extends EventEmitter {
	private config: MobileConfig;
	private state: SyncState;
	private syncInterval: number;
	private syncTimer: NodeJS.Timeout | null = null;

	constructor(config: MobileConfig) {
		super();
		this.config = config;
		this.syncInterval = config.sync.interval;
		this.state = this.loadState();
	}

	/**
	 * Start automatic sync
	 */
	startSync(): void {
		if (this.syncTimer) {
			return;
		}

		this.syncTimer = setInterval(() => {
			void this.sync();
		}, this.syncInterval);

		this.emit('syncStarted');
	}

	/**
	 * Stop automatic sync
	 */
	stopSync(): void {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
			this.emit('syncStopped');
		}
	}

	/**
	 * Perform sync
	 */
	async sync(): Promise<void> {
		if (this.state.isSyncing) {
			return;
		}

		this.state.isSyncing = true;
		this.saveState();
		this.emit('syncStarted');

		try {
			// Get pending items
			const pending = this.state.pending;

			// Process in batches
			const batchSize = this.config.sync.batchSize;
			for (let i = 0; i < pending.length; i += batchSize) {
				const batch = pending.slice(i, i + batchSize);
				await this.processBatch(batch);
			}

			// Update last sync time
			this.state.lastSync = Date.now();
			this.state.isSyncing = false;
			this.saveState();

			this.emit('syncCompleted', {
				syncedCount: pending.length,
				conflictCount: this.state.conflicts.length,
			});
		} catch (error) {
			this.state.isSyncing = false;
			this.saveState();
			this.emit('syncFailed', error);
			throw error;
		}
	}

	/**
	 * Process batch of items
	 */
	private async processBatch(itemIds: string[]): Promise<void> {
		for (const itemId of itemIds) {
			try {
				await this.syncItem(itemId);
			} catch (error) {
				this.emit('itemSyncFailed', { itemId, error });
			}
		}
	}

	/**
	 * Sync single item
	 */
	private async syncItem(itemId: string): Promise<void> {
		// Get local data
		const localData = await this.getLocalData(itemId);
		if (!localData) {
			return;
		}

		// Get remote data
		const remoteData = await this.getRemoteData(itemId);

		// Detect conflicts
		if (remoteData && this.hasConflict(localData, remoteData)) {
			await this.handleConflict(itemId, localData, remoteData);
		} else {
			// No conflict, push to server
			await this.pushToServer(itemId, localData);
			this.markSynced(itemId);
		}
	}

	/**
	 * Check for conflict
	 */
	private hasConflict(localData: Record<string, unknown>, remoteData: Record<string, unknown>): boolean {
		const localTimestamp = localData.updatedAt as number;
		const remoteTimestamp = remoteData.updatedAt as number;

		// Conflict if both have been modified
		return localTimestamp !== remoteTimestamp;
	}

	/**
	 * Handle conflict
	 */
	private async handleConflict(
		itemId: string,
		localData: Record<string, unknown>,
		remoteData: Record<string, unknown>,
	): Promise<void> {
		const resolution = this.config.sync.conflictResolution;

		switch (resolution) {
			case ConflictResolution.CLIENT_WINS:
				await this.pushToServer(itemId, localData);
				this.markSynced(itemId);
				break;

			case ConflictResolution.SERVER_WINS:
				await this.updateLocal(itemId, remoteData);
				this.markSynced(itemId);
				break;

			case ConflictResolution.MANUAL:
				this.addConflict(itemId, localData, remoteData);
				this.emit('conflictDetected', { itemId, localData, remoteData });
				break;

			case ConflictResolution.MERGE:
				const merged = await this.mergeData(localData, remoteData);
				await this.pushToServer(itemId, merged);
				await this.updateLocal(itemId, merged);
				this.markSynced(itemId);
				break;
		}
	}

	/**
	 * Merge data
	 */
	private async mergeData(
		localData: Record<string, unknown>,
		remoteData: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		// Simple merge: prefer local changes, but keep remote fields that don't exist locally
		return {
			...remoteData,
			...localData,
			updatedAt: Date.now(),
		};
	}

	/**
	 * Add item to pending
	 */
	addPending(itemId: string): void {
		if (!this.state.pending.includes(itemId)) {
			this.state.pending.push(itemId);
			this.saveState();
		}
	}

	/**
	 * Mark item as synced
	 */
	private markSynced(itemId: string): void {
		// Remove from pending
		const pendingIndex = this.state.pending.indexOf(itemId);
		if (pendingIndex !== -1) {
			this.state.pending.splice(pendingIndex, 1);
		}

		// Add to synced
		if (!this.state.synced.includes(itemId)) {
			this.state.synced.push(itemId);
		}

		this.saveState();
	}

	/**
	 * Add conflict
	 */
	private addConflict(
		itemId: string,
		localData: Record<string, unknown>,
		remoteData: Record<string, unknown>,
	): void {
		// Remove existing conflict for this item
		this.state.conflicts = this.state.conflicts.filter((c) => c.id !== itemId);

		// Add new conflict
		this.state.conflicts.push({
			id: itemId,
			localData,
			remoteData,
			timestamp: Date.now(),
		});

		this.saveState();
	}

	/**
	 * Resolve conflict
	 */
	async resolveConflict(itemId: string, useLocal: boolean): Promise<void> {
		const conflict = this.state.conflicts.find((c) => c.id === itemId);
		if (!conflict) {
			throw new Error(`Conflict not found: ${itemId}`);
		}

		const data = useLocal ? conflict.localData : conflict.remoteData;

		if (useLocal) {
			await this.pushToServer(itemId, data);
		} else {
			await this.updateLocal(itemId, data);
		}

		// Remove conflict
		this.state.conflicts = this.state.conflicts.filter((c) => c.id !== itemId);
		this.markSynced(itemId);

		this.emit('conflictResolved', { itemId, useLocal });
	}

	/**
	 * Get sync state
	 */
	getState(): SyncState {
		return { ...this.state };
	}

	/**
	 * Get local data (to be implemented by consumer)
	 */
	private async getLocalData(itemId: string): Promise<Record<string, unknown> | null> {
		// This would query local storage
		return null;
	}

	/**
	 * Get remote data (to be implemented by consumer)
	 */
	private async getRemoteData(itemId: string): Promise<Record<string, unknown> | null> {
		// This would query remote API
		return null;
	}

	/**
	 * Push to server (to be implemented by consumer)
	 */
	private async pushToServer(itemId: string, data: Record<string, unknown>): Promise<void> {
		// This would send to remote API
	}

	/**
	 * Update local (to be implemented by consumer)
	 */
	private async updateLocal(itemId: string, data: Record<string, unknown>): Promise<void> {
		// This would update local storage
	}

	/**
	 * Save state to storage
	 */
	private saveState(): void {
		try {
			localStorage.setItem('sync_state', JSON.stringify(this.state));
		} catch (error) {
			this.emit('storageError', error);
		}
	}

	/**
	 * Load state from storage
	 */
	private loadState(): SyncState {
		try {
			const stored = localStorage.getItem('sync_state');
			if (stored) {
				return SyncStateSchema.parse(JSON.parse(stored));
			}
		} catch (error) {
			this.emit('storageError', error);
		}

		return {
			pending: [],
			synced: [],
			conflicts: [],
			lastSync: null,
			isSyncing: false,
		};
	}
}
