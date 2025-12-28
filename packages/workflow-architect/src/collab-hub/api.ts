import { EventEmitter } from 'events';
import type { WebSocket as WSType } from 'ws';
import type { WebSocketMessage } from './types';
import { WebSocketMessageSchema } from './types';

interface CollaborationAPIOptions {
	port?: number;
	path?: string;
	maxConnections?: number;
	heartbeatInterval?: number;
	messageRateLimit?: number;
}

interface Connection {
	id: string;
	userId: string;
	ws: WSType | WebSocket;
	channels: Set<string>;
	lastHeartbeat: Date;
	messageCount: number;
	rateLimitReset: Date;
}

/**
 * Collaboration API server with WebSocket and REST endpoints
 */
export class CollaborationAPI extends EventEmitter {
	private connections: Map<string, Connection>;
	private channels: Map<string, Set<string>>; // channelId -> connectionIds
	private heartbeatInterval: NodeJS.Timeout | null;
	private options: Required<CollaborationAPIOptions>;

	constructor(options: CollaborationAPIOptions = {}) {
		super();
		this.connections = new Map();
		this.channels = new Map();
		this.heartbeatInterval = null;
		this.options = {
			port: options.port ?? 3001,
			path: options.path ?? '/collab',
			maxConnections: options.maxConnections ?? 1000,
			heartbeatInterval: options.heartbeatInterval ?? 30000,
			messageRateLimit: options.messageRateLimit ?? 100, // messages per minute
		};
	}

	/**
	 * Start the collaboration API server
	 */
	async start(): Promise<void> {
		this.startHeartbeat();
		this.emit('server_started', { port: this.options.port, path: this.options.path });
	}

	/**
	 * Stop the collaboration API server
	 */
	async stop(): Promise<void> {
		this.stopHeartbeat();

		// Close all connections
		for (const connection of this.connections.values()) {
			this.closeConnection(connection.id);
		}

		this.emit('server_stopped');
	}

	/**
	 * Handle new WebSocket connection
	 */
	handleConnection(ws: WSType | WebSocket, userId: string): string {
		if (this.connections.size >= this.options.maxConnections) {
			this.emit('error', { error: 'Maximum connections reached' });
			ws.close(1008, 'Maximum connections reached');
			throw new Error('Maximum connections reached');
		}

		const connectionId = this.generateId();
		const connection: Connection = {
			id: connectionId,
			userId,
			ws,
			channels: new Set(),
			lastHeartbeat: new Date(),
			messageCount: 0,
			rateLimitReset: new Date(Date.now() + 60000),
		};

		this.connections.set(connectionId, connection);

		// Setup WebSocket handlers
		ws.addEventListener('message', (event) => {
			this.handleMessage(connectionId, event.data as string);
		});

		ws.addEventListener('close', () => {
			this.handleDisconnection(connectionId);
		});

		ws.addEventListener('error', (error) => {
			this.emit('error', { connectionId, error });
		});

		this.emit('connection_established', { connectionId, userId });

		return connectionId;
	}

	/**
	 * Handle incoming WebSocket message
	 */
	private handleMessage(connectionId: string, data: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		// Rate limiting
		if (!this.checkRateLimit(connection)) {
			this.sendError(connectionId, 'Rate limit exceeded');
			return;
		}

		try {
			const message: WebSocketMessage = WebSocketMessageSchema.parse(JSON.parse(data));
			this.processMessage(connectionId, message);
		} catch (error) {
			this.emit('error', { connectionId, error, message: 'Invalid message format' });
			this.sendError(connectionId, 'Invalid message format');
		}
	}

	/**
	 * Process WebSocket message
	 */
	private processMessage(connectionId: string, message: WebSocketMessage): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		switch (message.action) {
			case 'join':
				this.handleJoinChannel(connectionId, message.payload.channelId as string);
				break;
			case 'leave':
				this.handleLeaveChannel(connectionId, message.payload.channelId as string);
				break;
			case 'cursor_update':
			case 'selection_update':
			case 'message':
			case 'annotation':
			case 'reaction':
			case 'poll':
			case 'presence_update':
				this.broadcastToChannels(connectionId, message);
				break;
			default:
				this.sendError(connectionId, 'Unknown action');
		}

		this.emit('message_processed', { connectionId, action: message.action });
	}

	/**
	 * Handle join channel request
	 */
	private handleJoinChannel(connectionId: string, channelId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		connection.channels.add(channelId);

		let channelConnections = this.channels.get(channelId);
		if (!channelConnections) {
			channelConnections = new Set();
			this.channels.set(channelId, channelConnections);
		}
		channelConnections.add(connectionId);

		this.emit('channel_joined', { connectionId, channelId });
		this.sendAck(connectionId, 'join', { channelId });
	}

	/**
	 * Handle leave channel request
	 */
	private handleLeaveChannel(connectionId: string, channelId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		connection.channels.delete(channelId);

		const channelConnections = this.channels.get(channelId);
		if (channelConnections) {
			channelConnections.delete(connectionId);
			if (channelConnections.size === 0) {
				this.channels.delete(channelId);
			}
		}

		this.emit('channel_left', { connectionId, channelId });
		this.sendAck(connectionId, 'leave', { channelId });
	}

	/**
	 * Broadcast message to all connections in the same channels
	 */
	private broadcastToChannels(connectionId: string, message: WebSocketMessage): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		const recipients = new Set<string>();

		// Collect all connections in the same channels
		for (const channelId of connection.channels) {
			const channelConnections = this.channels.get(channelId);
			if (channelConnections) {
				for (const recipientId of channelConnections) {
					if (recipientId !== connectionId) {
						recipients.add(recipientId);
					}
				}
			}
		}

		// Send to all recipients
		for (const recipientId of recipients) {
			this.sendMessage(recipientId, message);
		}
	}

	/**
	 * Send message to a specific connection
	 */
	private sendMessage(connectionId: string, message: WebSocketMessage): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		try {
			const data = JSON.stringify(message);
			if (connection.ws.readyState === 1) { // OPEN state
				connection.ws.send(data);
			}
		} catch (error) {
			this.emit('error', { connectionId, error, message: 'Failed to send message' });
		}
	}

	/**
	 * Send acknowledgment
	 */
	private sendAck(connectionId: string, action: string, data: Record<string, unknown>): void {
		this.sendMessage(connectionId, {
			action: action as WebSocketMessage['action'],
			payload: { ack: true, ...data },
		});
	}

	/**
	 * Send error message
	 */
	private sendError(connectionId: string, error: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection || connection.ws.readyState !== 1) {
			return;
		}

		connection.ws.send(JSON.stringify({ error }));
	}

	/**
	 * Check rate limit for connection
	 */
	private checkRateLimit(connection: Connection): boolean {
		const now = new Date();

		// Reset counter if time window passed
		if (now >= connection.rateLimitReset) {
			connection.messageCount = 0;
			connection.rateLimitReset = new Date(now.getTime() + 60000);
		}

		connection.messageCount++;
		return connection.messageCount <= this.options.messageRateLimit;
	}

	/**
	 * Handle connection disconnection
	 */
	private handleDisconnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		// Remove from all channels
		for (const channelId of connection.channels) {
			const channelConnections = this.channels.get(channelId);
			if (channelConnections) {
				channelConnections.delete(connectionId);
				if (channelConnections.size === 0) {
					this.channels.delete(channelId);
				}
			}
		}

		this.connections.delete(connectionId);
		this.emit('connection_closed', { connectionId, userId: connection.userId });
	}

	/**
	 * Close a connection
	 */
	private closeConnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		connection.ws.close(1000, 'Server shutting down');
	}

	/**
	 * Start heartbeat to check connection health
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			const now = new Date();
			const staleThreshold = 60000; // 1 minute

			for (const [connectionId, connection] of this.connections) {
				const timeSinceHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();

				if (timeSinceHeartbeat > staleThreshold) {
					this.emit('connection_stale', { connectionId });
					this.closeConnection(connectionId);
				} else {
					// Send ping
					this.sendMessage(connectionId, {
						action: 'presence_update',
						payload: { type: 'ping' },
					});
				}
			}
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
	 * Update connection heartbeat
	 */
	updateHeartbeat(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (connection) {
			connection.lastHeartbeat = new Date();
		}
	}

	/**
	 * Get active connections count
	 */
	getConnectionCount(): number {
		return this.connections.size;
	}

	/**
	 * Get channel count
	 */
	getChannelCount(): number {
		return this.channels.size;
	}

	/**
	 * Get connections in a channel
	 */
	getChannelConnections(channelId: string): string[] {
		const connections = this.channels.get(channelId);
		return connections ? Array.from(connections) : [];
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
	async destroy(): Promise<void> {
		await this.stop();
		this.removeAllListeners();
	}
}

/**
 * Create a collaboration API instance
 */
export function createCollaborationAPI(options?: CollaborationAPIOptions): CollaborationAPI {
	return new CollaborationAPI(options);
}
