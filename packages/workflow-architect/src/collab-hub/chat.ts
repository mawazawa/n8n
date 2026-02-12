import { EventEmitter } from 'events';
import type { Message } from './types';
import { MessageSchema } from './types';

interface ChatManagerOptions {
	maxMessages?: number;
	maxAttachmentSize?: number; // bytes
	historyLimit?: number;
}

/**
 * Contextual chat manager with message history and file attachments
 */
export class ChatManager extends EventEmitter {
	private messages: Map<string, Message>;
	private contextMessages: Map<string, string[]>; // contextId -> messageIds
	private options: Required<ChatManagerOptions>;

	constructor(options: ChatManagerOptions = {}) {
		super();
		this.messages = new Map();
		this.contextMessages = new Map();
		this.options = {
			maxMessages: options.maxMessages ?? 10000,
			maxAttachmentSize: options.maxAttachmentSize ?? 10 * 1024 * 1024, // 10MB
			historyLimit: options.historyLimit ?? 1000,
		};
	}

	/**
	 * Send a message
	 */
	async sendMessage(message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
		if (this.messages.size >= this.options.maxMessages) {
			// Remove oldest message
			const oldestId = this.messages.keys().next().value;
			if (oldestId) {
				this.messages.delete(oldestId);
			}
		}

		// Validate attachment sizes
		for (const attachment of message.attachments ?? []) {
			if (attachment.size > this.options.maxAttachmentSize) {
				throw new Error(`Attachment ${attachment.name} exceeds size limit`);
			}
		}

		const fullMessage: Message = MessageSchema.parse({
			...message,
			id: this.generateId(),
			timestamp: new Date(),
		});

		this.messages.set(fullMessage.id, fullMessage);

		// Track by context
		if (fullMessage.contextId) {
			const contextMsgs = this.contextMessages.get(fullMessage.contextId) ?? [];
			contextMsgs.push(fullMessage.id);
			this.contextMessages.set(fullMessage.contextId, contextMsgs);
		}

		this.emit('message_sent', { message: fullMessage });

		// Emit mentions
		if (fullMessage.mentions.length > 0) {
			this.emit('users_mentioned', {
				messageId: fullMessage.id,
				mentions: fullMessage.mentions,
			});
		}

		return fullMessage;
	}

	/**
	 * Edit a message
	 */
	async editMessage(messageId: string, content: string): Promise<Message> {
		const message = this.messages.get(messageId);
		if (!message) {
			throw new Error('Message not found');
		}

		message.content = content;
		this.messages.set(messageId, message);
		this.emit('message_edited', { message });

		return message;
	}

	/**
	 * Delete a message
	 */
	async deleteMessage(messageId: string): Promise<void> {
		const message = this.messages.get(messageId);
		if (!message) {
			throw new Error('Message not found');
		}

		this.messages.delete(messageId);

		// Remove from context tracking
		if (message.contextId) {
			const contextMsgs = this.contextMessages.get(message.contextId) ?? [];
			const index = contextMsgs.indexOf(messageId);
			if (index > -1) {
				contextMsgs.splice(index, 1);
				this.contextMessages.set(message.contextId, contextMsgs);
			}
		}

		this.emit('message_deleted', { messageId });
	}

	/**
	 * Add reaction to a message
	 */
	async addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
		const message = this.messages.get(messageId);
		if (!message) {
			throw new Error('Message not found');
		}

		// Check if user already reacted with this emoji
		const existingReaction = message.reactions.find(
			(r) => r.emoji === emoji && r.userId === userId
		);

		if (existingReaction) {
			return; // Already reacted
		}

		message.reactions.push({ emoji, userId });
		this.messages.set(messageId, message);
		this.emit('reaction_added', { messageId, userId, emoji });
	}

	/**
	 * Remove reaction from a message
	 */
	async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
		const message = this.messages.get(messageId);
		if (!message) {
			throw new Error('Message not found');
		}

		const index = message.reactions.findIndex(
			(r) => r.emoji === emoji && r.userId === userId
		);

		if (index > -1) {
			message.reactions.splice(index, 1);
			this.messages.set(messageId, message);
			this.emit('reaction_removed', { messageId, userId, emoji });
		}
	}

	/**
	 * Get all messages
	 */
	getAllMessages(limit?: number): Message[] {
		const messages = Array.from(this.messages.values()).sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);

		return limit ? messages.slice(0, limit) : messages;
	}

	/**
	 * Get messages by context
	 */
	getMessagesByContext(contextType: string, contextId: string, limit?: number): Message[] {
		const messageIds = this.contextMessages.get(contextId) ?? [];
		const messages = messageIds
			.map((id) => this.messages.get(id))
			.filter((m): m is Message => m !== undefined && m.contextType === contextType)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		return limit ? messages.slice(0, limit) : messages;
	}

	/**
	 * Get messages by user
	 */
	getMessagesByUser(userId: string, limit?: number): Message[] {
		const messages = Array.from(this.messages.values())
			.filter((m) => m.userId === userId)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		return limit ? messages.slice(0, limit) : messages;
	}

	/**
	 * Get message by ID
	 */
	getMessage(messageId: string): Message | undefined {
		return this.messages.get(messageId);
	}

	/**
	 * Search messages
	 */
	searchMessages(query: string, limit?: number): Message[] {
		const lowercaseQuery = query.toLowerCase();
		const messages = Array.from(this.messages.values())
			.filter((m) => m.content.toLowerCase().includes(lowercaseQuery))
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		return limit ? messages.slice(0, limit) : messages;
	}

	/**
	 * Clear all messages
	 */
	clear(): void {
		this.messages.clear();
		this.contextMessages.clear();
		this.emit('messages_cleared');
	}

	/**
	 * Clear messages by context
	 */
	clearContext(contextId: string): void {
		const messageIds = this.contextMessages.get(contextId) ?? [];
		for (const id of messageIds) {
			this.messages.delete(id);
		}
		this.contextMessages.delete(contextId);
		this.emit('context_cleared', { contextId });
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
		this.messages.clear();
		this.contextMessages.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a chat manager instance
 */
export function createChatManager(options?: ChatManagerOptions): ChatManager {
	return new ChatManager(options);
}
