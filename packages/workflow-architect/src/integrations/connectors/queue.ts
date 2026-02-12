import amqp, { Connection as AmqpConnection, Channel } from 'amqplib';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import Redis from 'ioredis';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import {
	Connector,
	IntegrationStatus,
	QueueConnectorConfig,
	QueueConnectorConfigSchema,
	QueueType,
	QueueMessage,
	QueueSubscription,
} from '../types';

interface MessageQueue {
	publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void>;
	subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription>;
	unsubscribe(subscriptionId: string): Promise<void>;
	close(): Promise<void>;
}

/**
 * RabbitMQ Queue
 */
class RabbitMQQueue implements MessageQueue {
	private config: QueueConnectorConfig;
	private connection?: AmqpConnection;
	private channel?: Channel;
	private subscriptions: Map<string, { consumerTag: string }>;

	constructor(config: QueueConnectorConfig) {
		this.config = config;
		this.subscriptions = new Map();
	}

	async connect(): Promise<void> {
		this.connection = await amqp.connect(this.config.url);
		this.channel = await this.connection.createChannel();

		// Assert exchange if specified
		if (this.config.exchange) {
			await this.channel.assertExchange(this.config.exchange, 'topic', { durable: true });
		}
	}

	async publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void> {
		if (!this.channel) throw new Error('Not connected');

		const queueMessage: QueueMessage<T> = {
			id: Math.random().toString(36).substring(7),
			topic,
			data: message,
			timestamp: new Date(),
			metadata,
		};

		const content = Buffer.from(JSON.stringify(queueMessage));

		if (this.config.exchange) {
			await this.channel.publish(
				this.config.exchange,
				this.config.routingKey || topic,
				content,
				{ persistent: true },
			);
		} else {
			await this.channel.assertQueue(topic, { durable: true });
			await this.channel.sendToQueue(topic, content, { persistent: true });
		}
	}

	async subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription> {
		if (!this.channel) throw new Error('Not connected');

		const queue = await this.channel.assertQueue(topic, { durable: true });

		if (this.config.exchange) {
			await this.channel.bindQueue(queue.queue, this.config.exchange, this.config.routingKey || topic);
		}

		const consumerTag = await this.channel.consume(
			queue.queue,
			async (msg) => {
				if (!msg) return;

				try {
					const queueMessage: QueueMessage<T> = JSON.parse(msg.content.toString());
					await handler(queueMessage);
					this.channel?.ack(msg);
				} catch (error) {
					this.channel?.nack(msg, false, true);
				}
			},
			{ noAck: false },
		);

		const subscriptionId = Math.random().toString(36).substring(7);
		this.subscriptions.set(subscriptionId, { consumerTag: consumerTag.consumerTag });

		return {
			id: subscriptionId,
			topic,
			unsubscribe: async () => {
				await this.unsubscribe(subscriptionId);
			},
		};
	}

	async unsubscribe(subscriptionId: string): Promise<void> {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription && this.channel) {
			await this.channel.cancel(subscription.consumerTag);
			this.subscriptions.delete(subscriptionId);
		}
	}

	async close(): Promise<void> {
		if (this.channel) await this.channel.close();
		if (this.connection) await this.connection.close();
	}
}

/**
 * AWS SQS Queue
 */
class SQSQueue implements MessageQueue {
	private config: QueueConnectorConfig;
	private client: SQSClient;
	private subscriptions: Map<string, { polling: boolean; interval?: NodeJS.Timeout }>;

	constructor(config: QueueConnectorConfig) {
		this.config = config;
		this.client = new SQSClient({ region: config.region || 'us-east-1' });
		this.subscriptions = new Map();
	}

	async connect(): Promise<void> {
		// SQS doesn't require explicit connection
	}

	async publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void> {
		const queueMessage: QueueMessage<T> = {
			id: Math.random().toString(36).substring(7),
			topic,
			data: message,
			timestamp: new Date(),
			metadata,
		};

		const command = new SendMessageCommand({
			QueueUrl: topic,
			MessageBody: JSON.stringify(queueMessage),
		});

		await this.client.send(command);
	}

	async subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription> {
		const subscriptionId = Math.random().toString(36).substring(7);
		const subscription = { polling: true, interval: undefined as NodeJS.Timeout | undefined };

		this.subscriptions.set(subscriptionId, subscription);

		// Poll for messages
		const poll = async () => {
			if (!subscription.polling) return;

			try {
				const command = new ReceiveMessageCommand({
					QueueUrl: topic,
					MaxNumberOfMessages: 10,
					WaitTimeSeconds: 20,
				});

				const response = await this.client.send(command);

				if (response.Messages) {
					for (const msg of response.Messages) {
						if (!msg.Body) continue;

						try {
							const queueMessage: QueueMessage<T> = JSON.parse(msg.Body);
							await handler(queueMessage);

							// Delete message after successful processing
							if (msg.ReceiptHandle) {
								await this.client.send(
									new DeleteMessageCommand({
										QueueUrl: topic,
										ReceiptHandle: msg.ReceiptHandle,
									}),
								);
							}
						} catch (error) {
							// Message will be retried after visibility timeout
							console.error('Error processing message:', error);
						}
					}
				}
			} catch (error) {
				console.error('Error polling SQS:', error);
			}

			// Continue polling
			if (subscription.polling) {
				subscription.interval = setTimeout(poll, 1000);
			}
		};

		poll();

		return {
			id: subscriptionId,
			topic,
			unsubscribe: async () => {
				await this.unsubscribe(subscriptionId);
			},
		};
	}

	async unsubscribe(subscriptionId: string): Promise<void> {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription) {
			subscription.polling = false;
			if (subscription.interval) {
				clearTimeout(subscription.interval);
			}
			this.subscriptions.delete(subscriptionId);
		}
	}

	async close(): Promise<void> {
		for (const [id] of this.subscriptions) {
			await this.unsubscribe(id);
		}
	}
}

/**
 * Redis Queue
 */
class RedisQueue implements MessageQueue {
	private config: QueueConnectorConfig;
	private client: Redis;
	private subscriber: Redis;
	private subscriptions: Map<string, { topic: string }>;

	constructor(config: QueueConnectorConfig) {
		this.config = config;
		this.client = new Redis(config.url);
		this.subscriber = new Redis(config.url);
		this.subscriptions = new Map();
	}

	async connect(): Promise<void> {
		await this.client.ping();
	}

	async publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void> {
		const queueMessage: QueueMessage<T> = {
			id: Math.random().toString(36).substring(7),
			topic,
			data: message,
			timestamp: new Date(),
			metadata,
		};

		await this.client.publish(topic, JSON.stringify(queueMessage));
	}

	async subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription> {
		const subscriptionId = Math.random().toString(36).substring(7);

		await this.subscriber.subscribe(topic);

		const messageHandler = async (channel: string, message: string) => {
			if (channel === topic) {
				try {
					const queueMessage: QueueMessage<T> = JSON.parse(message);
					await handler(queueMessage);
				} catch (error) {
					console.error('Error processing message:', error);
				}
			}
		};

		this.subscriber.on('message', messageHandler);
		this.subscriptions.set(subscriptionId, { topic });

		return {
			id: subscriptionId,
			topic,
			unsubscribe: async () => {
				await this.unsubscribe(subscriptionId);
			},
		};
	}

	async unsubscribe(subscriptionId: string): Promise<void> {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription) {
			await this.subscriber.unsubscribe(subscription.topic);
			this.subscriptions.delete(subscriptionId);
		}
	}

	async close(): Promise<void> {
		await this.client.quit();
		await this.subscriber.quit();
	}
}

/**
 * Kafka Queue
 */
class KafkaQueue implements MessageQueue {
	private config: QueueConnectorConfig;
	private kafka: Kafka;
	private producer?: Producer;
	private consumers: Map<string, Consumer>;
	private subscriptions: Map<string, { topic: string; consumerId: string }>;

	constructor(config: QueueConnectorConfig) {
		this.config = config;
		this.kafka = new Kafka({
			clientId: 'integration-hub',
			brokers: [config.url],
		});
		this.consumers = new Map();
		this.subscriptions = new Map();
	}

	async connect(): Promise<void> {
		this.producer = this.kafka.producer();
		await this.producer.connect();
	}

	async publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void> {
		if (!this.producer) throw new Error('Not connected');

		const queueMessage: QueueMessage<T> = {
			id: Math.random().toString(36).substring(7),
			topic,
			data: message,
			timestamp: new Date(),
			metadata,
		};

		await this.producer.send({
			topic,
			messages: [{ value: JSON.stringify(queueMessage) }],
		});
	}

	async subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription> {
		const subscriptionId = Math.random().toString(36).substring(7);
		const consumerId = `consumer-${subscriptionId}`;

		const consumer = this.kafka.consumer({ groupId: consumerId });
		await consumer.connect();
		await consumer.subscribe({ topic, fromBeginning: false });

		await consumer.run({
			eachMessage: async ({ message }: EachMessagePayload) => {
				if (!message.value) return;

				try {
					const queueMessage: QueueMessage<T> = JSON.parse(message.value.toString());
					await handler(queueMessage);
				} catch (error) {
					console.error('Error processing message:', error);
				}
			},
		});

		this.consumers.set(consumerId, consumer);
		this.subscriptions.set(subscriptionId, { topic, consumerId });

		return {
			id: subscriptionId,
			topic,
			unsubscribe: async () => {
				await this.unsubscribe(subscriptionId);
			},
		};
	}

	async unsubscribe(subscriptionId: string): Promise<void> {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription) {
			const consumer = this.consumers.get(subscription.consumerId);
			if (consumer) {
				await consumer.disconnect();
				this.consumers.delete(subscription.consumerId);
			}
			this.subscriptions.delete(subscriptionId);
		}
	}

	async close(): Promise<void> {
		if (this.producer) await this.producer.disconnect();
		for (const [, consumer] of this.consumers) {
			await consumer.disconnect();
		}
	}
}

/**
 * Queue Connector
 * Supports RabbitMQ, SQS, Redis, and Kafka
 */
export class QueueConnector implements Connector {
	private config: QueueConnectorConfig;
	private queue?: MessageQueue;
	private status: IntegrationStatus;

	constructor(config: QueueConnectorConfig) {
		this.config = QueueConnectorConfigSchema.parse(config);
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Connect to the message queue
	 */
	async connect(): Promise<void> {
		try {
			switch (this.config.type) {
				case QueueType.RABBITMQ:
					this.queue = new RabbitMQQueue(this.config);
					await (this.queue as RabbitMQQueue).connect();
					break;

				case QueueType.SQS:
					this.queue = new SQSQueue(this.config);
					await (this.queue as SQSQueue).connect();
					break;

				case QueueType.REDIS:
					this.queue = new RedisQueue(this.config);
					await (this.queue as RedisQueue).connect();
					break;

				case QueueType.KAFKA:
					this.queue = new KafkaQueue(this.config);
					await (this.queue as KafkaQueue).connect();
					break;

				default:
					throw new Error(`Unsupported queue type: ${this.config.type}`);
			}

			this.status = IntegrationStatus.CONNECTED;
		} catch (error) {
			this.status = IntegrationStatus.ERROR;
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Disconnect from the message queue
	 */
	async disconnect(): Promise<void> {
		if (this.queue) {
			await this.queue.close();
			this.queue = undefined;
		}
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Execute a queue operation
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput> {
		if (!this.queue) {
			throw new Error('Not connected to message queue');
		}

		const { method, topic, message, handler, subscriptionId } = params as {
			method: 'publish' | 'subscribe' | 'unsubscribe';
			topic: string;
			message?: unknown;
			handler?: (msg: QueueMessage) => Promise<void>;
			subscriptionId?: string;
		};

		switch (method) {
			case 'publish':
				await this.queue.publish(topic, message);
				return undefined as TOutput;
			case 'subscribe':
				if (!handler) throw new Error('Handler required for subscribe operation');
				return (await this.queue.subscribe(topic, handler)) as TOutput;
			case 'unsubscribe':
				if (!subscriptionId) throw new Error('Subscription ID required for unsubscribe operation');
				await this.queue.unsubscribe(subscriptionId);
				return undefined as TOutput;
			default:
				throw new Error(`Unsupported operation: ${method}`);
		}
	}

	/**
	 * Publish a message
	 */
	async publish<T = unknown>(topic: string, message: T, metadata?: Record<string, unknown>): Promise<void> {
		if (!this.queue) {
			throw new Error('Not connected to message queue');
		}
		await this.queue.publish(topic, message, metadata);
	}

	/**
	 * Subscribe to a topic
	 */
	async subscribe<T = unknown>(
		topic: string,
		handler: (message: QueueMessage<T>) => Promise<void>,
	): Promise<QueueSubscription> {
		if (!this.queue) {
			throw new Error('Not connected to message queue');
		}
		return this.queue.subscribe(topic, handler);
	}

	/**
	 * Unsubscribe from a topic
	 */
	async unsubscribe(subscriptionId: string): Promise<void> {
		if (!this.queue) {
			throw new Error('Not connected to message queue');
		}
		await this.queue.unsubscribe(subscriptionId);
	}

	/**
	 * Test the connection
	 */
	async test(): Promise<boolean> {
		try {
			await this.connect();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get connection status
	 */
	getStatus(): IntegrationStatus {
		return this.status;
	}
}
