import { EventEmitter } from 'events';
import type { Participant, UserStatus } from './types';
import { ParticipantSchema } from './types';

interface PresenceOptions {
	idleTimeout?: number; // milliseconds
	heartbeatInterval?: number; // milliseconds
	maxParticipants?: number;
}

interface ActivityEvent {
	userId: string;
	type: 'cursor' | 'selection' | 'edit' | 'message';
	timestamp: Date;
}

/**
 * Enhanced presence manager for real-time user status tracking
 * Extends existing presence functionality with activity indicators and idle detection
 */
export class PresenceManager extends EventEmitter {
	private participants: Map<string, Participant>;
	private activityLog: Map<string, ActivityEvent[]>;
	private idleTimers: Map<string, NodeJS.Timeout>;
	private heartbeatInterval: NodeJS.Timeout | null;
	private options: Required<PresenceOptions>;

	constructor(options: PresenceOptions = {}) {
		super();
		this.participants = new Map();
		this.activityLog = new Map();
		this.idleTimers = new Map();
		this.heartbeatInterval = null;
		this.options = {
			idleTimeout: options.idleTimeout ?? 300000, // 5 minutes default
			heartbeatInterval: options.heartbeatInterval ?? 30000, // 30 seconds default
			maxParticipants: options.maxParticipants ?? 100,
		};
	}

	/**
	 * Add a participant to the presence system
	 */
	async addParticipant(participant: Omit<Participant, 'joinedAt' | 'lastActiveAt'>): Promise<void> {
		if (this.participants.size >= this.options.maxParticipants) {
			throw new Error('Maximum participant limit reached');
		}

		const fullParticipant: Participant = ParticipantSchema.parse({
			...participant,
			joinedAt: new Date(),
			lastActiveAt: new Date(),
		});

		this.participants.set(fullParticipant.id, fullParticipant);
		this.activityLog.set(fullParticipant.id, []);
		this.startIdleDetection(fullParticipant.id);

		this.emit('participant_joined', fullParticipant);

		// Start heartbeat if this is the first participant
		if (this.participants.size === 1) {
			this.startHeartbeat();
		}
	}

	/**
	 * Remove a participant from the presence system
	 */
	removeParticipant(userId: string): void {
		const participant = this.participants.get(userId);
		if (!participant) {
			return;
		}

		this.participants.delete(userId);
		this.activityLog.delete(userId);
		this.stopIdleDetection(userId);

		this.emit('participant_left', participant);

		// Stop heartbeat if no participants remain
		if (this.participants.size === 0) {
			this.stopHeartbeat();
		}
	}

	/**
	 * Update user status
	 */
	updateStatus(userId: string, status: UserStatus, customStatus?: string): void {
		const participant = this.participants.get(userId);
		if (!participant) {
			throw new Error('Participant not found');
		}

		participant.status = status;
		if (customStatus !== undefined) {
			participant.customStatus = customStatus;
		}
		participant.lastActiveAt = new Date();

		this.emit('status_updated', { userId, status, customStatus });
	}

	/**
	 * Record user activity
	 */
	recordActivity(userId: string, type: ActivityEvent['type']): void {
		const participant = this.participants.get(userId);
		if (!participant) {
			return;
		}

		const activity: ActivityEvent = {
			userId,
			type,
			timestamp: new Date(),
		};

		// Update participant last active time
		participant.lastActiveAt = activity.timestamp;

		// Add to activity log (keep last 100 activities per user)
		const activities = this.activityLog.get(userId) ?? [];
		activities.push(activity);
		if (activities.length > 100) {
			activities.shift();
		}
		this.activityLog.set(userId, activities);

		// Reset idle timer
		this.resetIdleTimer(userId);

		// Update status to online if they were away
		if (participant.status === 'away') {
			this.updateStatus(userId, 'online');
		}

		this.emit('activity_recorded', activity);
	}

	/**
	 * Get all active participants
	 */
	getParticipants(): Participant[] {
		return Array.from(this.participants.values());
	}

	/**
	 * Get a specific participant
	 */
	getParticipant(userId: string): Participant | undefined {
		return this.participants.get(userId);
	}

	/**
	 * Get recent activity for a user
	 */
	getRecentActivity(userId: string, limit = 10): ActivityEvent[] {
		const activities = this.activityLog.get(userId) ?? [];
		return activities.slice(-limit);
	}

	/**
	 * Check if a user is active (not idle)
	 */
	isActive(userId: string): boolean {
		const participant = this.participants.get(userId);
		if (!participant) {
			return false;
		}

		const timeSinceActive = Date.now() - participant.lastActiveAt.getTime();
		return timeSinceActive < this.options.idleTimeout;
	}

	/**
	 * Get participation count
	 */
	getParticipantCount(): number {
		return this.participants.size;
	}

	/**
	 * Get online participant count
	 */
	getOnlineCount(): number {
		return Array.from(this.participants.values()).filter(
			(p) => p.status === 'online' || p.status === 'busy'
		).length;
	}

	/**
	 * Start idle detection for a user
	 */
	private startIdleDetection(userId: string): void {
		const timer = setTimeout(() => {
			this.handleUserIdle(userId);
		}, this.options.idleTimeout);

		this.idleTimers.set(userId, timer);
	}

	/**
	 * Stop idle detection for a user
	 */
	private stopIdleDetection(userId: string): void {
		const timer = this.idleTimers.get(userId);
		if (timer) {
			clearTimeout(timer);
			this.idleTimers.delete(userId);
		}
	}

	/**
	 * Reset idle timer for a user
	 */
	private resetIdleTimer(userId: string): void {
		this.stopIdleDetection(userId);
		this.startIdleDetection(userId);
	}

	/**
	 * Handle user becoming idle
	 */
	private handleUserIdle(userId: string): void {
		const participant = this.participants.get(userId);
		if (!participant) {
			return;
		}

		// Only set to away if they're currently online
		if (participant.status === 'online') {
			this.updateStatus(userId, 'away');
			this.emit('user_idle', { userId });
		}
	}

	/**
	 * Start heartbeat to check for stale participants
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			this.checkStaleParticipants();
		}, this.options.heartbeatInterval);
	}

	/**
	 * Stop heartbeat
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	/**
	 * Check for stale participants (no activity for extended period)
	 */
	private checkStaleParticipants(): void {
		const staleThreshold = this.options.idleTimeout * 2; // 2x idle timeout
		const now = Date.now();

		for (const [userId, participant] of this.participants) {
			const timeSinceActive = now - participant.lastActiveAt.getTime();
			if (timeSinceActive > staleThreshold && participant.status !== 'offline') {
				this.updateStatus(userId, 'offline');
				this.emit('participant_stale', { userId });
			}
		}
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Clear all idle timers
		for (const timer of this.idleTimers.values()) {
			clearTimeout(timer);
		}
		this.idleTimers.clear();

		// Stop heartbeat
		this.stopHeartbeat();

		// Clear data
		this.participants.clear();
		this.activityLog.clear();

		// Remove all listeners
		this.removeAllListeners();
	}
}

/**
 * Create a presence manager instance
 */
export function createPresenceManager(options?: PresenceOptions): PresenceManager {
	return new PresenceManager(options);
}
