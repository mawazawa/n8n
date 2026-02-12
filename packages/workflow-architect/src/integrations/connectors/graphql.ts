import axios, { AxiosInstance } from 'axios';
import {
	Connector,
	IntegrationStatus,
	GraphQLConnectorConfig,
	GraphQLConnectorConfigSchema,
	GraphQLQueryOptions,
	GraphQLQueryOptionsSchema,
	GraphQLResponse,
	AuthConfig,
	AuthType,
} from '../types';

interface GraphQLSchema {
	types: Array<{
		name: string;
		kind: string;
		fields?: Array<{
			name: string;
			type: unknown;
		}>;
	}>;
}

/**
 * GraphQL Connector
 * Implements GraphQL communication with query, mutation, and subscription support
 */
export class GraphQLConnector implements Connector {
	private config: GraphQLConnectorConfig;
	private authConfig?: AuthConfig;
	private client: AxiosInstance;
	private status: IntegrationStatus;
	private schema?: GraphQLSchema;
	private subscriptions: Map<string, WebSocket>;

	constructor(config: GraphQLConnectorConfig, authConfig?: AuthConfig) {
		this.config = GraphQLConnectorConfigSchema.parse(config);
		this.authConfig = authConfig;
		this.status = IntegrationStatus.DISCONNECTED;
		this.subscriptions = new Map();
		this.client = this.createClient();
	}

	/**
	 * Create axios client for GraphQL requests
	 */
	private createClient(): AxiosInstance {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.config.headers,
		};

		// Setup authentication
		if (this.authConfig) {
			switch (this.authConfig.type) {
				case AuthType.BEARER:
					headers['Authorization'] = `Bearer ${this.authConfig.config.token}`;
					break;

				case AuthType.API_KEY:
					if (this.authConfig.config.location === 'header') {
						const header = this.authConfig.config.header || 'X-API-Key';
						const value = this.authConfig.config.prefix
							? `${this.authConfig.config.prefix} ${this.authConfig.config.key}`
							: this.authConfig.config.key;
						headers[header] = value;
					}
					break;

				case AuthType.BASIC:
					const credentials = Buffer.from(
						`${this.authConfig.config.username}:${this.authConfig.config.password}`,
					).toString('base64');
					headers['Authorization'] = `Basic ${credentials}`;
					break;
			}
		}

		return axios.create({
			baseURL: this.config.endpoint,
			timeout: this.config.timeout,
			headers,
		});
	}

	/**
	 * Connect to GraphQL endpoint
	 */
	async connect(): Promise<void> {
		try {
			// Test connection with introspection query if enabled
			if (this.config.introspection) {
				await this.introspect();
			} else {
				// Simple ping query
				await this.query({ query: '{ __typename }' });
			}
			this.status = IntegrationStatus.CONNECTED;
		} catch (error) {
			this.status = IntegrationStatus.ERROR;
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Disconnect from GraphQL endpoint
	 */
	async disconnect(): Promise<void> {
		// Close all active subscriptions
		for (const [id, ws] of this.subscriptions) {
			ws.close();
			this.subscriptions.delete(id);
		}
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Execute a GraphQL operation
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput> {
		const options = params as unknown as GraphQLQueryOptions;
		const validatedOptions = GraphQLQueryOptionsSchema.parse(options);

		// Determine if it's a mutation based on the query string
		const isMutation = validatedOptions.query.trim().startsWith('mutation');

		const response = isMutation
			? await this.mutation<TOutput>(validatedOptions)
			: await this.query<TOutput>(validatedOptions);

		if (response.errors) {
			throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
		}

		return response.data as TOutput;
	}

	/**
	 * Execute a GraphQL query
	 */
	async query<T = unknown>(options: GraphQLQueryOptions): Promise<GraphQLResponse<T>> {
		const validatedOptions = GraphQLQueryOptionsSchema.parse(options);

		try {
			const response = await this.client.post<GraphQLResponse<T>>('', {
				query: validatedOptions.query,
				variables: validatedOptions.variables,
				operationName: validatedOptions.operationName,
			});

			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error) && error.response?.data) {
				return error.response.data as GraphQLResponse<T>;
			}
			throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Execute a GraphQL mutation
	 */
	async mutation<T = unknown>(options: GraphQLQueryOptions): Promise<GraphQLResponse<T>> {
		// Mutations are executed the same way as queries in GraphQL
		return this.query<T>(options);
	}

	/**
	 * Subscribe to GraphQL subscription
	 */
	subscribe<T = unknown>(
		options: GraphQLQueryOptions,
		onData: (data: T) => void,
		onError?: (error: Error) => void,
	): string {
		const validatedOptions = GraphQLQueryOptionsSchema.parse(options);

		// Convert http(s) endpoint to ws(s)
		const wsEndpoint = this.config.endpoint.replace(/^http/, 'ws');

		const ws = new WebSocket(wsEndpoint, 'graphql-ws');
		const subscriptionId = Math.random().toString(36).substring(7);

		ws.onopen = () => {
			// Initialize connection
			ws.send(JSON.stringify({ type: 'connection_init' }));

			// Send subscription
			ws.send(
				JSON.stringify({
					id: subscriptionId,
					type: 'start',
					payload: {
						query: validatedOptions.query,
						variables: validatedOptions.variables,
						operationName: validatedOptions.operationName,
					},
				}),
			);
		};

		ws.onmessage = (event) => {
			const message = JSON.parse(event.data.toString());

			switch (message.type) {
				case 'data':
					if (message.id === subscriptionId) {
						onData(message.payload.data as T);
					}
					break;
				case 'error':
					if (message.id === subscriptionId && onError) {
						onError(new Error(JSON.stringify(message.payload)));
					}
					break;
			}
		};

		ws.onerror = (event) => {
			if (onError) {
				onError(new Error(`WebSocket error: ${event.type}`));
			}
		};

		this.subscriptions.set(subscriptionId, ws);

		return subscriptionId;
	}

	/**
	 * Unsubscribe from a subscription
	 */
	unsubscribe(subscriptionId: string): void {
		const ws = this.subscriptions.get(subscriptionId);
		if (ws) {
			ws.send(JSON.stringify({ id: subscriptionId, type: 'stop' }));
			ws.close();
			this.subscriptions.delete(subscriptionId);
		}
	}

	/**
	 * Introspect GraphQL schema
	 */
	async introspect(): Promise<GraphQLSchema> {
		const introspectionQuery = `
			query IntrospectionQuery {
				__schema {
					types {
						name
						kind
						fields {
							name
							type {
								name
								kind
							}
						}
					}
				}
			}
		`;

		const response = await this.query<{ __schema: GraphQLSchema }>({
			query: introspectionQuery,
		});

		if (response.data) {
			this.schema = response.data.__schema;
			return this.schema;
		}

		throw new Error('Failed to introspect schema');
	}

	/**
	 * Get cached schema
	 */
	getSchema(): GraphQLSchema | undefined {
		return this.schema;
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

	/**
	 * Update authentication config
	 */
	updateAuth(authConfig: AuthConfig): void {
		this.authConfig = authConfig;
		this.client = this.createClient();
	}

	/**
	 * Batch multiple queries into a single request
	 */
	async batch<T = unknown>(queries: GraphQLQueryOptions[]): Promise<Array<GraphQLResponse<T>>> {
		const validatedQueries = queries.map((q) => GraphQLQueryOptionsSchema.parse(q));

		try {
			const response = await this.client.post<Array<GraphQLResponse<T>>>(
				'',
				validatedQueries.map((q) => ({
					query: q.query,
					variables: q.variables,
					operationName: q.operationName,
				})),
			);

			return response.data;
		} catch (error) {
			throw new Error(`Batch query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
