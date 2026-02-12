import { EventEmitter } from 'events';
import type { MobileNotification } from './types';
import { MobileNotificationSchema } from './types';

interface MobileCollabOptions {
	notificationBatchSize?: number;
	notificationDelay?: number;
	offlineSyncInterval?: number;
}

interface OfflineComment {
	id: string;
	userId: string;
	content: string;
	contextType: string;
	contextId: string;
	timestamp: Date;
	synced: boolean;
}

interface UIOptimizationData {
	layout: 'mobile' | 'tablet';
	touchEnabled: boolean;
	reducedAnimations: boolean;
	compactMode: boolean;
}

/**
 * Mobile collaboration support with push notifications and offline sync
 */
export class MobileCollab extends EventEmitter {
	private notifications: MobileNotification[];
	private offlineComments: Map<string, OfflineComment>;
	private pendingSync: Set<string>;
	private isOnline: boolean;
	private syncInterval: NodeJS.Timeout | null;
	private options: Required<MobileCollabOptions>;
	private uiConfig: UIOptimizationData;

	constructor(options: MobileCollabOptions = {}) {
		super();
		this.notifications = [];
		this.offlineComments = new Map();
		this.pendingSync = new Set();
		this.isOnline = true;
		this.syncInterval = null;
		this.options = {
			notificationBatchSize: options.notificationBatchSize ?? 10,
			notificationDelay: options.notificationDelay ?? 1000,
			offlineSyncInterval: options.offlineSyncInterval ?? 30000, // 30 seconds
		};
		this.uiConfig = {
			layout: this.detectLayout(),
			touchEnabled: true,
			reducedAnimations: this.detectReducedMotion(),
			compactMode: false,
		};

		this.setupConnectivityMonitoring();
		this.startOfflineSync();
	}

	/**
	 * Send push notification
	 */
	async sendNotification(
		userId: string,
		type: MobileNotification['type'],
		title: string,
		body: string,
		data?: Record<string, unknown>
	): Promise<void> {
		const notification: MobileNotification = MobileNotificationSchema.parse({
			userId,
			type,
			title,
			body,
			data,
			timestamp: new Date(),
		});

		this.notifications.push(notification);

		// Send via Push API if available
		if ('Notification' in window && Notification.permission === 'granted') {
			await this.sendPushNotification(notification);
		}

		this.emit('notification_sent', { notification });

		// Batch notifications if too many
		if (this.notifications.length >= this.options.notificationBatchSize) {
			this.flushNotifications();
		}
	}

	/**
	 * Send push notification via browser API
	 */
	private async sendPushNotification(notification: MobileNotification): Promise<void> {
		try {
			const browserNotification = new Notification(notification.title, {
				body: notification.body,
				icon: '/icon.png',
				badge: '/badge.png',
				tag: notification.type,
				data: notification.data,
				timestamp: notification.timestamp.getTime(),
			});

			browserNotification.onclick = () => {
				this.emit('notification_clicked', { notification });
			};
		} catch (error) {
			this.emit('error', { error, message: 'Failed to send push notification' });
		}
	}

	/**
	 * Request notification permission
	 */
	async requestNotificationPermission(): Promise<boolean> {
		if (!('Notification' in window)) {
			return false;
		}

		if (Notification.permission === 'granted') {
			return true;
		}

		if (Notification.permission === 'denied') {
			return false;
		}

		const permission = await Notification.requestPermission();
		return permission === 'granted';
	}

	/**
	 * Add offline comment
	 */
	addOfflineComment(
		userId: string,
		content: string,
		contextType: string,
		contextId: string
	): OfflineComment {
		const comment: OfflineComment = {
			id: this.generateId(),
			userId,
			content,
			contextType,
			contextId,
			timestamp: new Date(),
			synced: false,
		};

		this.offlineComments.set(comment.id, comment);
		this.pendingSync.add(comment.id);

		this.emit('offline_comment_added', { comment });

		return comment;
	}

	/**
	 * Sync offline comments when online
	 */
	private async syncOfflineComments(): Promise<void> {
		if (!this.isOnline || this.pendingSync.size === 0) {
			return;
		}

		const commentsToSync = Array.from(this.pendingSync)
			.map((id) => this.offlineComments.get(id))
			.filter((c): c is OfflineComment => c !== undefined);

		for (const comment of commentsToSync) {
			try {
				await this.syncComment(comment);
				comment.synced = true;
				this.offlineComments.set(comment.id, comment);
				this.pendingSync.delete(comment.id);
				this.emit('comment_synced', { commentId: comment.id });
			} catch (error) {
				this.emit('error', { error, commentId: comment.id, message: 'Failed to sync comment' });
			}
		}

		if (this.pendingSync.size === 0) {
			this.emit('sync_complete');
		}
	}

	/**
	 * Sync a single comment
	 */
	private async syncComment(comment: OfflineComment): Promise<void> {
		// This would call the actual API endpoint
		// For now, we just emit an event
		this.emit('sync_request', { comment });
	}

	/**
	 * Get mobile-optimized UI data
	 */
	getUIOptimization(): UIOptimizationData {
		return { ...this.uiConfig };
	}

	/**
	 * Update UI optimization settings
	 */
	updateUIOptimization(updates: Partial<UIOptimizationData>): void {
		this.uiConfig = { ...this.uiConfig, ...updates };
		this.emit('ui_config_updated', { config: this.uiConfig });
	}

	/**
	 * Detect layout based on screen size
	 */
	private detectLayout(): 'mobile' | 'tablet' {
		if (typeof window === 'undefined') {
			return 'mobile';
		}

		const width = window.innerWidth;
		return width >= 768 ? 'tablet' : 'mobile';
	}

	/**
	 * Detect reduced motion preference
	 */
	private detectReducedMotion(): boolean {
		if (typeof window === 'undefined') {
			return false;
		}

		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		return mediaQuery.matches;
	}

	/**
	 * Setup connectivity monitoring
	 */
	private setupConnectivityMonitoring(): void {
		if (typeof window === 'undefined') {
			return;
		}

		window.addEventListener('online', () => {
			this.isOnline = true;
			this.emit('online');
			this.syncOfflineComments();
		});

		window.addEventListener('offline', () => {
			this.isOnline = false;
			this.emit('offline');
		});

		// Initial state
		this.isOnline = navigator.onLine;
	}

	/**
	 * Start offline sync interval
	 */
	private startOfflineSync(): void {
		this.syncInterval = setInterval(() => {
			this.syncOfflineComments();
		}, this.options.offlineSyncInterval);
	}

	/**
	 * Stop offline sync interval
	 */
	private stopOfflineSync(): void {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	/**
	 * Flush pending notifications
	 */
	private flushNotifications(): void {
		const batch = this.notifications.splice(0, this.options.notificationBatchSize);
		this.emit('notifications_batched', { notifications: batch });
	}

	/**
	 * Get pending notifications
	 */
	getPendingNotifications(): MobileNotification[] {
		return [...this.notifications];
	}

	/**
	 * Get offline comments
	 */
	getOfflineComments(): OfflineComment[] {
		return Array.from(this.offlineComments.values());
	}

	/**
	 * Get unsynced comment count
	 */
	getUnsyncedCount(): number {
		return this.pendingSync.size;
	}

	/**
	 * Check if online
	 */
	checkOnlineStatus(): boolean {
		return this.isOnline;
	}

	/**
	 * Clear offline comments
	 */
	clearOfflineComments(): void {
		this.offlineComments.clear();
		this.pendingSync.clear();
		this.emit('offline_comments_cleared');
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stopOfflineSync();
		this.notifications = [];
		this.offlineComments.clear();
		this.pendingSync.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a mobile collaboration instance
 */
export function createMobileCollab(options?: MobileCollabOptions): MobileCollab {
	return new MobileCollab(options);
}
