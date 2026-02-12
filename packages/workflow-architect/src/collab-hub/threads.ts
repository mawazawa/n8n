import { EventEmitter } from 'events';
import type { Thread, Message } from './types';
import { ThreadSchema, MessageSchema } from './types';

interface ThreadManagerOptions {
	maxThreads?: number;
	maxMessagesPerThread?: number;
}

/**
 * Discussion thread manager with notifications
 */
export class ThreadManager extends EventEmitter {
	private threads: Map<string, Thread>;
	private options: Required<ThreadManagerOptions>;

	constructor(options: ThreadManagerOptions = {}) {
		super();
		this.threads = new Map();
		this.options = {
			maxThreads: options.maxThreads ?? 1000,
			maxMessagesPerThread: options.maxMessagesPerThread ?? 500,
		};
	}

	/**
	 * Create a new thread
	 */
	async create(
		contextType: Thread['contextType'],
		contextId: string,
		initialMessage: Omit<Message, 'id' | 'timestamp'>,
		title?: string
	): Promise<Thread> {
		if (this.threads.size >= this.options.maxThreads) {
			throw new Error('Maximum threads limit reached');
		}

		const message: Message = MessageSchema.parse({
			...initialMessage,
			id: this.generateId(),
			timestamp: new Date(),
		});

		const thread: Thread = ThreadSchema.parse({
			id: this.generateId(),
			title,
			contextType,
			contextId,
			messages: [message],
			participants: [message.userId],
			resolved: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		this.threads.set(thread.id, thread);
		this.emit('thread_created', { thread });

		return thread;
	}

	/**
	 * Reply to a thread
	 */
	async reply(threadId: string, message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
		const thread = this.threads.get(threadId);
		if (!thread) {
			throw new Error('Thread not found');
		}

		if (thread.resolved) {
			throw new Error('Cannot reply to resolved thread');
		}

		if (thread.messages.length >= this.options.maxMessagesPerThread) {
			throw new Error('Thread message limit reached');
		}

		const fullMessage: Message = MessageSchema.parse({
			...message,
			id: this.generateId(),
			timestamp: new Date(),
		});

		thread.messages.push(fullMessage);
		thread.updatedAt = new Date();

		// Add participant if not already in thread
		if (!thread.participants.includes(message.userId)) {
			thread.participants.push(message.userId);
		}

		this.threads.set(threadId, thread);
		this.emit('thread_reply', { threadId, message: fullMessage });

		// Notify participants
		this.notifyParticipants(thread, fullMessage);

		return fullMessage;
	}

	/**
	 * Resolve a thread
	 */
	async resolve(threadId: string): Promise<void> {
		const thread = this.threads.get(threadId);
		if (!thread) {
			throw new Error('Thread not found');
		}

		thread.resolved = true;
		thread.updatedAt = new Date();

		this.threads.set(threadId, thread);
		this.emit('thread_resolved', { threadId });
	}

	/**
	 * Unresolve a thread
	 */
	async unresolve(threadId: string): Promise<void> {
		const thread = this.threads.get(threadId);
		if (!thread) {
			throw new Error('Thread not found');
		}

		thread.resolved = false;
		thread.updatedAt = new Date();

		this.threads.set(threadId, thread);
		this.emit('thread_unresolved', { threadId });
	}

	/**
	 * Update thread title
	 */
	async updateTitle(threadId: string, title: string): Promise<void> {
		const thread = this.threads.get(threadId);
		if (!thread) {
			throw new Error('Thread not found');
		}

		thread.title = title;
		thread.updatedAt = new Date();

		this.threads.set(threadId, thread);
		this.emit('thread_updated', { threadId, title });
	}

	/**
	 * Delete a thread
	 */
	async delete(threadId: string): Promise<void> {
		const thread = this.threads.get(threadId);
		if (!thread) {
			throw new Error('Thread not found');
		}

		this.threads.delete(threadId);
		this.emit('thread_deleted', { threadId });
	}

	/**
	 * Get thread by ID
	 */
	getThread(threadId: string): Thread | undefined {
		return this.threads.get(threadId);
	}

	/**
	 * Get all threads
	 */
	getAllThreads(): Thread[] {
		return Array.from(this.threads.values()).sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
		);
	}

	/**
	 * Get threads by context
	 */
	getThreadsByContext(contextType: string, contextId: string): Thread[] {
		return Array.from(this.threads.values())
			.filter((t) => t.contextType === contextType && t.contextId === contextId)
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	}

	/**
	 * Get threads for a user
	 */
	getUserThreads(userId: string): Thread[] {
		return Array.from(this.threads.values())
			.filter((t) => t.participants.includes(userId))
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	}

	/**
	 * Get unresolved threads
	 */
	getUnresolvedThreads(): Thread[] {
		return Array.from(this.threads.values())
			.filter((t) => !t.resolved)
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	}

	/**
	 * Search threads
	 */
	searchThreads(query: string): Thread[] {
		const lowercaseQuery = query.toLowerCase();
		return Array.from(this.threads.values())
			.filter((t) => {
				// Search in title
				if (t.title?.toLowerCase().includes(lowercaseQuery)) {
					return true;
				}
				// Search in messages
				return t.messages.some((m) => m.content.toLowerCase().includes(lowercaseQuery));
			})
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	}

	/**
	 * Notify participants of new reply
	 */
	private notifyParticipants(thread: Thread, message: Message): void {
		const recipientIds = thread.participants.filter((id) => id !== message.userId);

		if (recipientIds.length > 0) {
			this.emit('participants_notified', {
				threadId: thread.id,
				messageId: message.id,
				recipientIds,
			});
		}
	}

	/**
	 * Get thread statistics
	 */
	getStatistics(): {
		totalThreads: number;
		resolvedThreads: number;
		unresolvedThreads: number;
		totalMessages: number;
	} {
		const threads = Array.from(this.threads.values());
		const resolved = threads.filter((t) => t.resolved).length;
		const totalMessages = threads.reduce((sum, t) => sum + t.messages.length, 0);

		return {
			totalThreads: threads.length,
			resolvedThreads: resolved,
			unresolvedThreads: threads.length - resolved,
			totalMessages,
		};
	}

	/**
	 * Clear all threads
	 */
	clear(): void {
		this.threads.clear();
		this.emit('threads_cleared');
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
		this.threads.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a thread manager instance
 */
export function createThreadManager(options?: ThreadManagerOptions): ThreadManager {
	return new ThreadManager(options);
}
