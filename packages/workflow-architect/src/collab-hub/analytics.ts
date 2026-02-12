import { EventEmitter } from 'events';
import type { CollaborationMetrics } from './types';
import { CollaborationMetricsSchema } from './types';

interface CollabAnalyticsOptions {
	flushInterval?: number;
	maxMetrics?: number;
}

interface ParticipationData {
	userId: string;
	sessionDuration: number;
	messagesSent: number;
	annotationsCreated: number;
	cursorMoves: number;
	actionsPerformed: number;
	lastActiveAt: Date;
}

/**
 * Collaboration analytics tracker for engagement and usage metrics
 */
export class CollabAnalytics extends EventEmitter {
	private metrics: Map<string, CollaborationMetrics>;
	private currentSession: CollaborationMetrics | null;
	private participationData: Map<string, ParticipationData>;
	private sessionStartTime: Date | null;
	private options: Required<CollabAnalyticsOptions>;
	private flushTimer: NodeJS.Timeout | null;

	constructor(options: CollabAnalyticsOptions = {}) {
		super();
		this.metrics = new Map();
		this.currentSession = null;
		this.participationData = new Map();
		this.sessionStartTime = null;
		this.flushTimer = null;
		this.options = {
			flushInterval: options.flushInterval ?? 60000, // 1 minute
			maxMetrics: options.maxMetrics ?? 1000,
		};
	}

	/**
	 * Start tracking a collaboration session
	 */
	startSession(sessionId: string): void {
		if (this.currentSession) {
			this.endSession();
		}

		this.currentSession = CollaborationMetricsSchema.parse({
			sessionId,
			duration: 0,
			participantCount: 0,
			messageCount: 0,
			annotationCount: 0,
			cursorMoves: 0,
			voiceMinutes: 0,
			videoMinutes: 0,
			timestamp: new Date(),
		});

		this.sessionStartTime = new Date();
		this.participationData.clear();

		this.emit('session_started', { sessionId });
		this.startFlushTimer();
	}

	/**
	 * End the current session
	 */
	endSession(): CollaborationMetrics | null {
		if (!this.currentSession || !this.sessionStartTime) {
			return null;
		}

		const duration = Date.now() - this.sessionStartTime.getTime();
		this.currentSession.duration = duration;

		// Store metrics
		this.metrics.set(this.currentSession.sessionId, this.currentSession);

		// Remove old metrics if limit reached
		if (this.metrics.size > this.options.maxMetrics) {
			const oldestId = this.metrics.keys().next().value;
			if (oldestId) {
				this.metrics.delete(oldestId);
			}
		}

		const finalMetrics = { ...this.currentSession };
		this.emit('session_ended', { metrics: finalMetrics });

		this.currentSession = null;
		this.sessionStartTime = null;
		this.stopFlushTimer();

		return finalMetrics;
	}

	/**
	 * Track participant joining
	 */
	trackParticipantJoined(userId: string): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.participantCount++;

		this.participationData.set(userId, {
			userId,
			sessionDuration: 0,
			messagesSent: 0,
			annotationsCreated: 0,
			cursorMoves: 0,
			actionsPerformed: 0,
			lastActiveAt: new Date(),
		});

		this.emit('participant_tracked', { userId });
	}

	/**
	 * Track participant leaving
	 */
	trackParticipantLeft(userId: string): void {
		const data = this.participationData.get(userId);
		if (data) {
			data.sessionDuration = Date.now() - data.lastActiveAt.getTime();
		}
	}

	/**
	 * Track message sent
	 */
	trackMessage(userId: string): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.messageCount++;
		this.updateParticipantData(userId, (data) => {
			data.messagesSent++;
			data.actionsPerformed++;
		});
	}

	/**
	 * Track annotation created
	 */
	trackAnnotation(userId: string): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.annotationCount++;
		this.updateParticipantData(userId, (data) => {
			data.annotationsCreated++;
			data.actionsPerformed++;
		});
	}

	/**
	 * Track cursor movement
	 */
	trackCursorMove(userId: string): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.cursorMoves++;
		this.updateParticipantData(userId, (data) => {
			data.cursorMoves++;
		});
	}

	/**
	 * Track voice usage
	 */
	trackVoiceMinutes(minutes: number): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.voiceMinutes = (this.currentSession.voiceMinutes ?? 0) + minutes;
	}

	/**
	 * Track video usage
	 */
	trackVideoMinutes(minutes: number): void {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.videoMinutes = (this.currentSession.videoMinutes ?? 0) + minutes;
	}

	/**
	 * Update participant data
	 */
	private updateParticipantData(
		userId: string,
		updater: (data: ParticipationData) => void
	): void {
		const data = this.participationData.get(userId);
		if (data) {
			updater(data);
			data.lastActiveAt = new Date();
			this.participationData.set(userId, data);
		}
	}

	/**
	 * Get current session metrics
	 */
	getCurrentMetrics(): CollaborationMetrics | null {
		return this.currentSession;
	}

	/**
	 * Get session metrics by ID
	 */
	getSessionMetrics(sessionId: string): CollaborationMetrics | undefined {
		return this.metrics.get(sessionId);
	}

	/**
	 * Get all session metrics
	 */
	getAllMetrics(): CollaborationMetrics[] {
		return Array.from(this.metrics.values()).sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);
	}

	/**
	 * Get participation data for current session
	 */
	getParticipationData(): ParticipationData[] {
		return Array.from(this.participationData.values());
	}

	/**
	 * Get user participation data
	 */
	getUserParticipation(userId: string): ParticipationData | undefined {
		return this.participationData.get(userId);
	}

	/**
	 * Calculate engagement score (0-100)
	 */
	getEngagementScore(): number {
		if (!this.currentSession) {
			return 0;
		}

		const participants = this.participationData.size;
		if (participants === 0) {
			return 0;
		}

		const avgMessages = this.currentSession.messageCount / participants;
		const avgAnnotations = this.currentSession.annotationCount / participants;
		const avgCursorMoves = this.currentSession.cursorMoves / participants;

		// Weighted score
		const messageScore = Math.min(avgMessages * 10, 40); // Max 40 points
		const annotationScore = Math.min(avgAnnotations * 20, 30); // Max 30 points
		const activityScore = Math.min(avgCursorMoves / 100, 30); // Max 30 points

		return Math.round(messageScore + annotationScore + activityScore);
	}

	/**
	 * Get usage report
	 */
	getUsageReport(): {
		totalSessions: number;
		totalDuration: number;
		totalParticipants: number;
		totalMessages: number;
		totalAnnotations: number;
		averageSessionDuration: number;
		averageParticipantsPerSession: number;
	} {
		const metrics = Array.from(this.metrics.values());

		const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
		const totalParticipants = metrics.reduce((sum, m) => sum + m.participantCount, 0);
		const totalMessages = metrics.reduce((sum, m) => sum + m.messageCount, 0);
		const totalAnnotations = metrics.reduce((sum, m) => sum + m.annotationCount, 0);

		return {
			totalSessions: metrics.length,
			totalDuration,
			totalParticipants,
			totalMessages,
			totalAnnotations,
			averageSessionDuration: metrics.length > 0 ? totalDuration / metrics.length : 0,
			averageParticipantsPerSession: metrics.length > 0 ? totalParticipants / metrics.length : 0,
		};
	}

	/**
	 * Start flush timer to periodically save metrics
	 */
	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			if (this.currentSession) {
				this.emit('metrics_flush', { metrics: this.currentSession });
			}
		}, this.options.flushInterval);
	}

	/**
	 * Stop flush timer
	 */
	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}

	/**
	 * Export metrics as JSON
	 */
	exportMetrics(): string {
		const allMetrics = Array.from(this.metrics.values());
		return JSON.stringify(allMetrics, null, 2);
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics.clear();
		this.participationData.clear();
		this.emit('metrics_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.currentSession) {
			this.endSession();
		}
		this.stopFlushTimer();
		this.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a collaboration analytics instance
 */
export function createCollabAnalytics(options?: CollabAnalyticsOptions): CollabAnalytics {
	return new CollabAnalytics(options);
}
