/**
 * Real-Time Collaboration Hub
 * Phase 5 Action 10
 *
 * Comprehensive collaboration system with real-time presence, voice/video,
 * annotations, chat, and more.
 */

import { EventEmitter } from 'events';

// Export all types
export * from './types';

// Export all managers and classes
export { PresenceManager, createPresenceManager } from './presence';
export { CursorTracker, createCursorTracker } from './cursors';
export { VoiceChannel, createVoiceChannel } from './voice';
export { VideoRoom, createVideoRoom } from './video';
export { ScreenShare, createScreenShare } from './screen-share';
export { Whiteboard, createWhiteboard } from './whiteboard';
export { AnnotationManager, createAnnotationManager } from './annotations';
export { ChatManager, createChatManager } from './chat';
export { ReactionManager, createReactionManager } from './reactions';
export { MentionManager, createMentionManager } from './mentions';
export { ThreadManager, createThreadManager } from './threads';
export { PollManager, createPollManager } from './polls';
export { RecordingManager, createRecordingManager } from './recordings';
export { PlaybackEngine, createPlaybackEngine } from './playback';
export { PermissionManager, createPermissionManager } from './permissions';
export { CollabAnalytics, createCollabAnalytics } from './analytics';
export { IntegrationManager, createIntegrationManager } from './integrations';
export { MobileCollab, createMobileCollab } from './mobile';
export { CollaborationAPI, createCollaborationAPI } from './api';

// Import individual managers
import { PresenceManager } from './presence';
import { CursorTracker } from './cursors';
import { AnnotationManager } from './annotations';
import { ChatManager } from './chat';
import { ReactionManager } from './reactions';
import { MentionManager } from './mentions';
import { ThreadManager } from './threads';
import { PollManager } from './polls';
import { RecordingManager } from './recordings';
import { PermissionManager } from './permissions';
import { CollabAnalytics } from './analytics';
import { IntegrationManager } from './integrations';
import { MobileCollab } from './mobile';
import { CollaborationAPI } from './api';

interface CollaborationHubOptions {
	workspaceId: string;
	userId: string;
	enableVoice?: boolean;
	enableVideo?: boolean;
	enableRecording?: boolean;
	enableAnalytics?: boolean;
	enableMobile?: boolean;
}

/**
 * Main Collaboration Hub class that orchestrates all collaboration features
 */
export class CollaborationHub extends EventEmitter {
	public readonly workspaceId: string;
	public readonly userId: string;

	// Core managers
	public readonly presence: PresenceManager;
	public readonly cursors: CursorTracker;
	public readonly annotations: AnnotationManager;
	public readonly chat: ChatManager;
	public readonly reactions: ReactionManager;
	public readonly mentions: MentionManager;
	public readonly threads: ThreadManager;
	public readonly polls: PollManager;
	public readonly permissions: PermissionManager;

	// Optional managers
	public readonly recording?: RecordingManager;
	public readonly analytics?: CollabAnalytics;
	public readonly integrations: IntegrationManager;
	public readonly mobile?: MobileCollab;
	public readonly api: CollaborationAPI;

	private isInitialized: boolean;

	constructor(options: CollaborationHubOptions) {
		super();

		this.workspaceId = options.workspaceId;
		this.userId = options.userId;
		this.isInitialized = false;

		// Initialize core managers
		this.presence = new PresenceManager();
		this.cursors = new CursorTracker();
		this.annotations = new AnnotationManager();
		this.chat = new ChatManager();
		this.reactions = new ReactionManager();
		this.mentions = new MentionManager();
		this.threads = new ThreadManager();
		this.polls = new PollManager();
		this.permissions = new PermissionManager();
		this.integrations = new IntegrationManager();
		this.api = new CollaborationAPI();

		// Initialize optional managers
		if (options.enableRecording) {
			this.recording = new RecordingManager();
		}

		if (options.enableAnalytics) {
			this.analytics = new CollabAnalytics();
		}

		if (options.enableMobile) {
			this.mobile = new MobileCollab();
		}

		this.setupEventForwarding();
	}

	/**
	 * Initialize the collaboration hub
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Add current user to presence
		await this.presence.addParticipant({
			id: this.userId,
			name: 'Current User',
			status: 'online',
		});

		// Start API server
		await this.api.start();

		// Start analytics session if enabled
		if (this.analytics) {
			this.analytics.startSession(`session-${Date.now()}`);
		}

		this.isInitialized = true;
		this.emit('initialized', { workspaceId: this.workspaceId, userId: this.userId });
	}

	/**
	 * Setup event forwarding from managers to hub
	 */
	private setupEventForwarding(): void {
		// Forward presence events
		this.presence.on('participant_joined', (data) => {
			this.emit('presence:participant_joined', data);
			if (this.analytics) {
				this.analytics.trackParticipantJoined(data.id);
			}
		});

		this.presence.on('participant_left', (data) => {
			this.emit('presence:participant_left', data);
			if (this.analytics) {
				this.analytics.trackParticipantLeft(data.id);
			}
		});

		// Forward cursor events
		this.cursors.on('cursor_updated', (data) => {
			this.emit('cursor:updated', data);
			if (this.analytics) {
				this.analytics.trackCursorMove(data.userId);
			}
		});

		// Forward chat events
		this.chat.on('message_sent', (data) => {
			this.emit('chat:message_sent', data);
			if (this.analytics) {
				this.analytics.trackMessage(data.message.userId);
			}
			// Send notifications for mentions
			if (data.message.mentions.length > 0) {
				this.integrations.notify('mention', {
					messageId: data.message.id,
					mentions: data.message.mentions,
				});
			}
		});

		// Forward annotation events
		this.annotations.on('annotation_added', (data) => {
			this.emit('annotation:added', data);
			if (this.analytics) {
				this.analytics.trackAnnotation(data.annotation.userId);
			}
		});

		// Forward reaction events
		this.reactions.on('reaction_added', (data) => {
			this.emit('reaction:added', data);
		});

		// Forward thread events
		this.threads.on('thread_created', (data) => {
			this.emit('thread:created', data);
			this.integrations.notify('thread_created', {
				threadId: data.thread.id,
				title: data.thread.title,
			});
		});

		// Forward poll events
		this.polls.on('poll_created', (data) => {
			this.emit('poll:created', data);
			this.integrations.notify('poll_created', {
				pollId: data.poll.id,
				question: data.poll.question,
			});
		});
	}

	/**
	 * Get collaboration statistics
	 */
	getStatistics(): {
		participants: number;
		messages: number;
		annotations: number;
		threads: number;
		polls: number;
		connections: number;
	} {
		return {
			participants: this.presence.getParticipantCount(),
			messages: this.chat.getAllMessages().length,
			annotations: this.annotations.getAll().length,
			threads: this.threads.getAllThreads().length,
			polls: this.polls.getAllPolls().length,
			connections: this.api.getConnectionCount(),
		};
	}

	/**
	 * Check if hub is initialized
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Cleanup and destroy all managers
	 */
	async destroy(): Promise<void> {
		// Destroy all managers
		this.presence.destroy();
		this.cursors.destroy();
		this.annotations.destroy();
		this.chat.destroy();
		this.reactions.destroy();
		this.mentions.destroy();
		this.threads.destroy();
		this.polls.destroy();
		this.permissions.destroy();
		this.integrations.destroy();

		if (this.recording) {
			this.recording.destroy();
		}

		if (this.analytics) {
			this.analytics.destroy();
		}

		if (this.mobile) {
			this.mobile.destroy();
		}

		await this.api.destroy();

		this.isInitialized = false;
		this.removeAllListeners();

		this.emit('destroyed');
	}
}

/**
 * Create a collaboration hub instance
 */
export function createCollaborationHub(options: CollaborationHubOptions): CollaborationHub {
	return new CollaborationHub(options);
}

/**
 * Default export
 */
export default CollaborationHub;
