/**
 * Inter-Agent Communication
 * Message bus for agent-to-agent messaging with pub/sub patterns
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  type AgentMessage,
  type Subscription,
  MessageType,
} from './types.js';

/**
 * Message handler function
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Message Bus Class
 */
export class MessageBus extends EventEmitter {
  private messages: Map<string, AgentMessage>;
  private subscriptions: Map<string, Map<string, MessageHandler>>;
  private retentionPeriod: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(retentionPeriod = 60000) { // Default 1 minute
    super();
    this.messages = new Map();
    this.subscriptions = new Map();
    this.retentionPeriod = retentionPeriod;
    this.cleanupInterval = null;

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Publish message to topic
   */
  async publish(topic: string, message: Omit<AgentMessage, 'id' | 'timestamp' | 'topic'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      id: uuid(),
      topic,
      timestamp: Date.now(),
    };

    // Store message
    this.messages.set(fullMessage.id, fullMessage);

    console.log(`[MessageBus] Published message to topic ${topic}: ${fullMessage.type}`);

    // Deliver to subscribers
    await this.deliver(fullMessage);

    // Emit event
    this.emit('message', fullMessage);
  }

  /**
   * Subscribe to topic
   */
  subscribe(topic: string, handler: MessageHandler): Subscription {
    const subscriptionId = uuid();

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }

    this.subscriptions.get(topic)!.set(subscriptionId, handler);

    console.log(`[MessageBus] Subscribed to topic ${topic} (${subscriptionId})`);

    return {
      id: subscriptionId,
      topic,
      unsubscribe: () => this.unsubscribe(topic, subscriptionId),
    };
  }

  /**
   * Unsubscribe from topic
   */
  private unsubscribe(topic: string, subscriptionId: string): void {
    const topicSubscriptions = this.subscriptions.get(topic);
    if (topicSubscriptions) {
      topicSubscriptions.delete(subscriptionId);

      if (topicSubscriptions.size === 0) {
        this.subscriptions.delete(topic);
      }
    }

    console.log(`[MessageBus] Unsubscribed from topic ${topic} (${subscriptionId})`);
  }

  /**
   * Send request and wait for response
   */
  async request(
    topic: string,
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'topic' | 'correlationId'>,
    timeout = 5000
  ): Promise<AgentMessage> {
    const correlationId = uuid();

    return new Promise((resolve, reject) => {
      // Set up response handler
      const responseTimeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      const subscription = this.subscribe(`${topic}.response`, (response) => {
        if (response.correlationId === correlationId) {
          clearTimeout(responseTimeout);
          subscription.unsubscribe();
          resolve(response);
        }
      });

      // Send request
      this.publish(topic, {
        ...message,
        correlationId,
      }).catch(error => {
        clearTimeout(responseTimeout);
        subscription.unsubscribe();
        reject(error);
      });
    });
  }

  /**
   * Send response to request
   */
  async respond(
    requestMessage: AgentMessage,
    response: Omit<AgentMessage, 'id' | 'timestamp' | 'topic' | 'correlationId'>
  ): Promise<void> {
    const responseTopic = `${requestMessage.topic}.response`;

    await this.publish(responseTopic, {
      ...response,
      correlationId: requestMessage.correlationId,
    });
  }

  /**
   * Broadcast message to all agents
   */
  async broadcast(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'topic' | 'toAgentId'>
  ): Promise<void> {
    await this.publish('broadcast', {
      ...message,
      toAgentId: 'broadcast',
    });
  }

  /**
   * Get messages by topic
   */
  getMessagesByTopic(topic: string): AgentMessage[] {
    return Array.from(this.messages.values())
      .filter(m => m.topic === topic)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get messages by agent
   */
  getMessagesByAgent(agentId: string): AgentMessage[] {
    return Array.from(this.messages.values())
      .filter(m => m.fromAgentId === agentId || m.toAgentId === agentId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get message by ID
   */
  getMessage(messageId: string): AgentMessage | undefined {
    return this.messages.get(messageId);
  }

  /**
   * Clear old messages
   */
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, message] of this.messages) {
      // Check retention period or expiry
      const shouldDelete = message.expiresAt
        ? now > message.expiresAt
        : now - message.timestamp > this.retentionPeriod;

      if (shouldDelete) {
        this.messages.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[MessageBus] Cleaned up ${deletedCount} messages`);
    }
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.retentionPeriod / 2); // Cleanup at half retention period
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Deliver message to subscribers
   */
  private async deliver(message: AgentMessage): Promise<void> {
    const handlers: MessageHandler[] = [];

    // Get exact topic subscribers
    const exactSubscribers = this.subscriptions.get(message.topic);
    if (exactSubscribers) {
      handlers.push(...exactSubscribers.values());
    }

    // Get wildcard subscribers (topic.*)
    const topicParts = message.topic.split('.');
    for (let i = 0; i < topicParts.length; i++) {
      const pattern = [...topicParts.slice(0, i), '*'].join('.');
      const wildcardSubscribers = this.subscriptions.get(pattern);
      if (wildcardSubscribers) {
        handlers.push(...wildcardSubscribers.values());
      }
    }

    // Deliver to all handlers
    await Promise.all(
      handlers.map(handler =>
        Promise.resolve(handler(message)).catch(error =>
          console.error(`[MessageBus] Handler error for topic ${message.topic}:`, error)
        )
      )
    );
  }

  /**
   * Get subscription count for topic
   */
  getSubscriberCount(topic: string): number {
    return this.subscriptions.get(topic)?.size || 0;
  }

  /**
   * Get all topics
   */
  getTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages.clear();
    console.log('[MessageBus] Cleared all messages');
  }

  /**
   * Destroy message bus
   */
  destroy(): void {
    this.stopCleanup();
    this.messages.clear();
    this.subscriptions.clear();
    this.removeAllListeners();
    console.log('[MessageBus] Destroyed');
  }
}

/**
 * Create a message bus instance
 */
export function createMessageBus(retentionPeriod?: number): MessageBus {
  return new MessageBus(retentionPeriod);
}
