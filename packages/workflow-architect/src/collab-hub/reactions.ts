import { EventEmitter } from 'events';

interface ReactionData {
	targetId: string;
	targetType: 'message' | 'node' | 'annotation' | 'workflow';
	emoji: string;
	userId: string;
	timestamp: Date;
}

interface ReactionAggregate {
	emoji: string;
	count: number;
	userIds: string[];
}

interface ReactionManagerOptions {
	maxReactionsPerTarget?: number;
	animationDuration?: number;
	customEmojis?: Map<string, string>; // name -> url
}

/**
 * Emoji reaction manager with aggregation and animation support
 */
export class ReactionManager extends EventEmitter {
	private reactions: Map<string, ReactionData[]>; // targetId -> reactions
	private options: Required<Omit<ReactionManagerOptions, 'customEmojis'>> & { customEmojis: Map<string, string> };

	constructor(options: ReactionManagerOptions = {}) {
		super();
		this.reactions = new Map();
		this.options = {
			maxReactionsPerTarget: options.maxReactionsPerTarget ?? 100,
			animationDuration: options.animationDuration ?? 1000,
			customEmojis: options.customEmojis ?? new Map(),
		};
	}

	/**
	 * Add a reaction
	 */
	async react(targetId: string, targetType: ReactionData['targetType'], userId: string, emoji: string): Promise<void> {
		const targetReactions = this.reactions.get(targetId) ?? [];

		// Check if user already reacted with this emoji
		const existingReaction = targetReactions.find(
			(r) => r.userId === userId && r.emoji === emoji
		);

		if (existingReaction) {
			return; // Already reacted
		}

		// Check limit
		if (targetReactions.length >= this.options.maxReactionsPerTarget) {
			// Remove oldest reaction
			targetReactions.shift();
		}

		const reaction: ReactionData = {
			targetId,
			targetType,
			emoji,
			userId,
			timestamp: new Date(),
		};

		targetReactions.push(reaction);
		this.reactions.set(targetId, targetReactions);

		this.emit('reaction_added', { reaction });
		this.emit('reaction_animation', {
			targetId,
			emoji,
			duration: this.options.animationDuration,
		});
	}

	/**
	 * Remove a reaction
	 */
	async unreact(targetId: string, userId: string, emoji: string): Promise<void> {
		const targetReactions = this.reactions.get(targetId) ?? [];
		const index = targetReactions.findIndex(
			(r) => r.userId === userId && r.emoji === emoji
		);

		if (index > -1) {
			const [removed] = targetReactions.splice(index, 1);
			this.reactions.set(targetId, targetReactions);
			this.emit('reaction_removed', { reaction: removed });
		}
	}

	/**
	 * Get reactions for a target
	 */
	getReactions(targetId: string): ReactionData[] {
		return [...(this.reactions.get(targetId) ?? [])];
	}

	/**
	 * Get aggregated reactions for a target
	 */
	getAggregatedReactions(targetId: string): ReactionAggregate[] {
		const targetReactions = this.reactions.get(targetId) ?? [];
		const aggregated = new Map<string, ReactionAggregate>();

		for (const reaction of targetReactions) {
			const existing = aggregated.get(reaction.emoji);
			if (existing) {
				existing.count++;
				existing.userIds.push(reaction.userId);
			} else {
				aggregated.set(reaction.emoji, {
					emoji: reaction.emoji,
					count: 1,
					userIds: [reaction.userId],
				});
			}
		}

		return Array.from(aggregated.values()).sort((a, b) => b.count - a.count);
	}

	/**
	 * Get user's reactions
	 */
	getUserReactions(userId: string): ReactionData[] {
		const userReactions: ReactionData[] = [];

		for (const targetReactions of this.reactions.values()) {
			userReactions.push(...targetReactions.filter((r) => r.userId === userId));
		}

		return userReactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	/**
	 * Check if user reacted with emoji on target
	 */
	hasUserReacted(targetId: string, userId: string, emoji: string): boolean {
		const targetReactions = this.reactions.get(targetId) ?? [];
		return targetReactions.some((r) => r.userId === userId && r.emoji === emoji);
	}

	/**
	 * Get most popular reactions across all targets
	 */
	getMostPopularReactions(limit = 10): ReactionAggregate[] {
		const allReactions = new Map<string, ReactionAggregate>();

		for (const targetReactions of this.reactions.values()) {
			for (const reaction of targetReactions) {
				const existing = allReactions.get(reaction.emoji);
				if (existing) {
					existing.count++;
					if (!existing.userIds.includes(reaction.userId)) {
						existing.userIds.push(reaction.userId);
					}
				} else {
					allReactions.set(reaction.emoji, {
						emoji: reaction.emoji,
						count: 1,
						userIds: [reaction.userId],
					});
				}
			}
		}

		return Array.from(allReactions.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, limit);
	}

	/**
	 * Add custom emoji
	 */
	addCustomEmoji(name: string, url: string): void {
		this.options.customEmojis.set(name, url);
		this.emit('custom_emoji_added', { name, url });
	}

	/**
	 * Remove custom emoji
	 */
	removeCustomEmoji(name: string): void {
		this.options.customEmojis.delete(name);
		this.emit('custom_emoji_removed', { name });
	}

	/**
	 * Get custom emoji URL
	 */
	getCustomEmoji(name: string): string | undefined {
		return this.options.customEmojis.get(name);
	}

	/**
	 * Get all custom emojis
	 */
	getAllCustomEmojis(): Map<string, string> {
		return new Map(this.options.customEmojis);
	}

	/**
	 * Clear reactions for a target
	 */
	clearTarget(targetId: string): void {
		this.reactions.delete(targetId);
		this.emit('target_cleared', { targetId });
	}

	/**
	 * Clear all reactions
	 */
	clear(): void {
		this.reactions.clear();
		this.emit('reactions_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.reactions.clear();
		this.options.customEmojis.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a reaction manager instance
 */
export function createReactionManager(options?: ReactionManagerOptions): ReactionManager {
	return new ReactionManager(options);
}
