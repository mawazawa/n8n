import { EventEmitter } from 'events';
import type { Poll, PollOption } from './types';
import { PollSchema, PollOptionSchema } from './types';

interface PollManagerOptions {
	maxPolls?: number;
	maxOptions?: number;
	defaultPollDuration?: number; // milliseconds
}

/**
 * Quick poll manager with real-time results and anonymous voting
 */
export class PollManager extends EventEmitter {
	private polls: Map<string, Poll>;
	private options: Required<PollManagerOptions>;
	private autoCloseTimers: Map<string, NodeJS.Timeout>;

	constructor(options: PollManagerOptions = {}) {
		super();
		this.polls = new Map();
		this.autoCloseTimers = new Map();
		this.options = {
			maxPolls: options.maxPolls ?? 1000,
			maxOptions: options.maxOptions ?? 10,
			defaultPollDuration: options.defaultPollDuration ?? 0, // 0 = no auto-close
		};
	}

	/**
	 * Create a new poll
	 */
	async create(
		question: string,
		options: string[],
		createdBy: string,
		settings?: {
			anonymous?: boolean;
			allowMultiple?: boolean;
			duration?: number;
		}
	): Promise<Poll> {
		if (this.polls.size >= this.options.maxPolls) {
			throw new Error('Maximum polls limit reached');
		}

		if (options.length < 2) {
			throw new Error('Poll must have at least 2 options');
		}

		if (options.length > this.options.maxOptions) {
			throw new Error(`Poll cannot have more than ${this.options.maxOptions} options`);
		}

		const pollOptions: PollOption[] = options.map((text) =>
			PollOptionSchema.parse({
				id: this.generateId(),
				text,
				votes: [],
			})
		);

		const poll: Poll = PollSchema.parse({
			id: this.generateId(),
			question,
			options: pollOptions,
			createdBy,
			createdAt: new Date(),
			anonymous: settings?.anonymous ?? false,
			allowMultiple: settings?.allowMultiple ?? false,
		});

		this.polls.set(poll.id, poll);
		this.emit('poll_created', { poll });

		// Set auto-close timer if duration specified
		const duration = settings?.duration ?? this.options.defaultPollDuration;
		if (duration > 0) {
			this.setAutoClose(poll.id, duration);
		}

		return poll;
	}

	/**
	 * Vote on a poll
	 */
	async vote(pollId: string, userId: string, optionIds: string[]): Promise<void> {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		if (poll.closedAt) {
			throw new Error('Poll is closed');
		}

		if (!poll.allowMultiple && optionIds.length > 1) {
			throw new Error('This poll does not allow multiple votes');
		}

		// Remove existing votes if not allowing multiple
		if (!poll.allowMultiple) {
			this.removeUserVotes(poll, userId);
		}

		// Add votes
		for (const optionId of optionIds) {
			const option = poll.options.find((o) => o.id === optionId);
			if (!option) {
				throw new Error(`Option ${optionId} not found`);
			}

			// Check if user already voted for this option
			if (!option.votes.includes(userId)) {
				option.votes.push(userId);
			}
		}

		this.polls.set(pollId, poll);
		this.emit('poll_voted', { pollId, userId, optionIds });
		this.emit('poll_results_updated', { pollId, results: this.getResults(pollId) });
	}

	/**
	 * Remove user's votes from poll
	 */
	private removeUserVotes(poll: Poll, userId: string): void {
		for (const option of poll.options) {
			const index = option.votes.indexOf(userId);
			if (index > -1) {
				option.votes.splice(index, 1);
			}
		}
	}

	/**
	 * Remove vote from a poll
	 */
	async removeVote(pollId: string, userId: string, optionId?: string): Promise<void> {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		if (optionId) {
			// Remove specific vote
			const option = poll.options.find((o) => o.id === optionId);
			if (option) {
				const index = option.votes.indexOf(userId);
				if (index > -1) {
					option.votes.splice(index, 1);
				}
			}
		} else {
			// Remove all votes from user
			this.removeUserVotes(poll, userId);
		}

		this.polls.set(pollId, poll);
		this.emit('vote_removed', { pollId, userId, optionId });
		this.emit('poll_results_updated', { pollId, results: this.getResults(pollId) });
	}

	/**
	 * Close a poll
	 */
	async close(pollId: string): Promise<void> {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		if (poll.closedAt) {
			throw new Error('Poll is already closed');
		}

		poll.closedAt = new Date();
		this.polls.set(pollId, poll);

		// Clear auto-close timer
		this.clearAutoClose(pollId);

		this.emit('poll_closed', { pollId, results: this.getResults(pollId) });
	}

	/**
	 * Reopen a poll
	 */
	async reopen(pollId: string): Promise<void> {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		poll.closedAt = undefined;
		this.polls.set(pollId, poll);
		this.emit('poll_reopened', { pollId });
	}

	/**
	 * Get poll results
	 */
	getResults(pollId: string): {
		totalVotes: number;
		options: Array<{
			id: string;
			text: string;
			votes: number;
			percentage: number;
			voters?: string[];
		}>;
	} {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);

		return {
			totalVotes,
			options: poll.options.map((opt) => ({
				id: opt.id,
				text: opt.text,
				votes: opt.votes.length,
				percentage: totalVotes > 0 ? (opt.votes.length / totalVotes) * 100 : 0,
				voters: poll.anonymous ? undefined : opt.votes,
			})),
		};
	}

	/**
	 * Get poll by ID
	 */
	getPoll(pollId: string): Poll | undefined {
		return this.polls.get(pollId);
	}

	/**
	 * Get all polls
	 */
	getAllPolls(): Poll[] {
		return Array.from(this.polls.values()).sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime()
		);
	}

	/**
	 * Get active polls
	 */
	getActivePolls(): Poll[] {
		return Array.from(this.polls.values())
			.filter((p) => !p.closedAt)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	/**
	 * Get closed polls
	 */
	getClosedPolls(): Poll[] {
		return Array.from(this.polls.values())
			.filter((p) => p.closedAt !== undefined)
			.sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));
	}

	/**
	 * Delete a poll
	 */
	async delete(pollId: string): Promise<void> {
		const poll = this.polls.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		this.polls.delete(pollId);
		this.clearAutoClose(pollId);
		this.emit('poll_deleted', { pollId });
	}

	/**
	 * Set auto-close timer for poll
	 */
	private setAutoClose(pollId: string, duration: number): void {
		const timer = setTimeout(async () => {
			await this.close(pollId);
			this.emit('poll_auto_closed', { pollId });
		}, duration);

		this.autoCloseTimers.set(pollId, timer);
	}

	/**
	 * Clear auto-close timer
	 */
	private clearAutoClose(pollId: string): void {
		const timer = this.autoCloseTimers.get(pollId);
		if (timer) {
			clearTimeout(timer);
			this.autoCloseTimers.delete(pollId);
		}
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Clear all polls
	 */
	clear(): void {
		// Clear all timers
		for (const timer of this.autoCloseTimers.values()) {
			clearTimeout(timer);
		}
		this.autoCloseTimers.clear();

		this.polls.clear();
		this.emit('polls_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a poll manager instance
 */
export function createPollManager(options?: PollManagerOptions): PollManager {
	return new PollManager(options);
}
