import { EventEmitter } from 'events';

interface MentionData {
	id: string;
	userId: string;
	mentionedBy: string;
	context: string;
	contextType: 'message' | 'annotation' | 'thread';
	contextId: string;
	timestamp: Date;
	read: boolean;
}

interface UserSuggestion {
	userId: string;
	name: string;
	avatar?: string;
	relevanceScore: number;
}

interface MentionManagerOptions {
	maxMentions?: number;
	notificationDelay?: number;
}

/**
 * @mentions manager with autocomplete and notification integration
 */
export class MentionManager extends EventEmitter {
	private mentions: Map<string, MentionData>;
	private userMentions: Map<string, string[]>; // userId -> mentionIds
	private users: Map<string, { name: string; avatar?: string }>;
	private options: Required<MentionManagerOptions>;

	constructor(options: MentionManagerOptions = {}) {
		super();
		this.mentions = new Map();
		this.userMentions = new Map();
		this.users = new Map();
		this.options = {
			maxMentions: options.maxMentions ?? 10000,
			notificationDelay: options.notificationDelay ?? 0,
		};
	}

	/**
	 * Create a mention
	 */
	mention(
		userId: string,
		mentionedBy: string,
		context: string,
		contextType: MentionData['contextType'],
		contextId: string
	): MentionData {
		const mention: MentionData = {
			id: this.generateId(),
			userId,
			mentionedBy,
			context,
			contextType,
			contextId,
			timestamp: new Date(),
			read: false,
		};

		// Remove oldest mention if limit reached
		if (this.mentions.size >= this.options.maxMentions) {
			const oldestId = this.mentions.keys().next().value;
			if (oldestId) {
				const oldest = this.mentions.get(oldestId);
				if (oldest) {
					this.removeMentionFromUserIndex(oldest);
				}
				this.mentions.delete(oldestId);
			}
		}

		this.mentions.set(mention.id, mention);

		// Index by user
		const userMentionIds = this.userMentions.get(userId) ?? [];
		userMentionIds.push(mention.id);
		this.userMentions.set(userId, userMentionIds);

		// Emit mention event with delay if configured
		if (this.options.notificationDelay > 0) {
			setTimeout(() => {
				this.emit('mention_created', { mention });
			}, this.options.notificationDelay);
		} else {
			this.emit('mention_created', { mention });
		}

		return mention;
	}

	/**
	 * Mark mention as read
	 */
	markAsRead(mentionId: string): void {
		const mention = this.mentions.get(mentionId);
		if (!mention) {
			throw new Error('Mention not found');
		}

		mention.read = true;
		this.mentions.set(mentionId, mention);
		this.emit('mention_read', { mentionId });
	}

	/**
	 * Mark all mentions for a user as read
	 */
	markAllAsRead(userId: string): void {
		const userMentionIds = this.userMentions.get(userId) ?? [];

		for (const mentionId of userMentionIds) {
			const mention = this.mentions.get(mentionId);
			if (mention && !mention.read) {
				mention.read = true;
				this.mentions.set(mentionId, mention);
			}
		}

		this.emit('mentions_read', { userId, count: userMentionIds.length });
	}

	/**
	 * Get mentions for a user
	 */
	getUserMentions(userId: string, unreadOnly = false): MentionData[] {
		const userMentionIds = this.userMentions.get(userId) ?? [];
		const mentions = userMentionIds
			.map((id) => this.mentions.get(id))
			.filter((m): m is MentionData => m !== undefined);

		if (unreadOnly) {
			return mentions.filter((m) => !m.read);
		}

		return mentions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	/**
	 * Get unread mention count for a user
	 */
	getUnreadCount(userId: string): number {
		return this.getUserMentions(userId, true).length;
	}

	/**
	 * Get mention by ID
	 */
	getMention(mentionId: string): MentionData | undefined {
		return this.mentions.get(mentionId);
	}

	/**
	 * Delete a mention
	 */
	deleteMention(mentionId: string): void {
		const mention = this.mentions.get(mentionId);
		if (!mention) {
			return;
		}

		this.removeMentionFromUserIndex(mention);
		this.mentions.delete(mentionId);
		this.emit('mention_deleted', { mentionId });
	}

	/**
	 * Register a user for autocomplete
	 */
	registerUser(userId: string, name: string, avatar?: string): void {
		this.users.set(userId, { name, avatar });
		this.emit('user_registered', { userId, name, avatar });
	}

	/**
	 * Unregister a user
	 */
	unregisterUser(userId: string): void {
		this.users.delete(userId);
		this.emit('user_unregistered', { userId });
	}

	/**
	 * Autocomplete users based on query
	 */
	autocompleteUsers(query: string, limit = 10, context?: string): UserSuggestion[] {
		const lowercaseQuery = query.toLowerCase();
		const suggestions: UserSuggestion[] = [];

		for (const [userId, user] of this.users) {
			const name = user.name.toLowerCase();
			if (name.includes(lowercaseQuery)) {
				// Calculate relevance score
				let score = 0;
				if (name.startsWith(lowercaseQuery)) {
					score += 10; // Prefix match is highly relevant
				}
				if (name === lowercaseQuery) {
					score += 20; // Exact match is most relevant
				}
				score += this.calculateContextRelevance(userId, context);

				suggestions.push({
					userId,
					name: user.name,
					avatar: user.avatar,
					relevanceScore: score,
				});
			}
		}

		return suggestions
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, limit);
	}

	/**
	 * Calculate context-based relevance for a user
	 */
	private calculateContextRelevance(userId: string, context?: string): number {
		if (!context) {
			return 0;
		}

		// Check recent mentions in context
		const recentMentions = Array.from(this.mentions.values()).filter(
			(m) => m.userId === userId && m.context.includes(context)
		);

		return Math.min(recentMentions.length, 5); // Cap at 5 points
	}

	/**
	 * Remove mention from user index
	 */
	private removeMentionFromUserIndex(mention: MentionData): void {
		const userMentionIds = this.userMentions.get(mention.userId);
		if (userMentionIds) {
			const index = userMentionIds.indexOf(mention.id);
			if (index > -1) {
				userMentionIds.splice(index, 1);
			}
			this.userMentions.set(mention.userId, userMentionIds);
		}
	}

	/**
	 * Get mention history for a context
	 */
	getContextMentions(contextType: string, contextId: string): MentionData[] {
		return Array.from(this.mentions.values())
			.filter((m) => m.contextType === contextType && m.contextId === contextId)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	/**
	 * Clear all mentions
	 */
	clear(): void {
		this.mentions.clear();
		this.userMentions.clear();
		this.emit('mentions_cleared');
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
		this.mentions.clear();
		this.userMentions.clear();
		this.users.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a mention manager instance
 */
export function createMentionManager(options?: MentionManagerOptions): MentionManager {
	return new MentionManager(options);
}
