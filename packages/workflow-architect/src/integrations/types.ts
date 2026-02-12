import { z } from 'zod';

/**
 * Authentication types supported by integrations
 */
export enum AuthType {
	OAUTH2 = 'oauth2',
	API_KEY = 'apiKey',
	BASIC = 'basic',
	BEARER = 'bearer',
	CUSTOM = 'custom',
	NONE = 'none',
}

/**
 * Integration connection status
 */
export enum IntegrationStatus {
	CONNECTED = 'connected',
	DISCONNECTED = 'disconnected',
	ERROR = 'error',
	PENDING = 'pending',
	CONFIGURING = 'configuring',
}

/**
 * Connector types
 */
export enum ConnectorType {
	HTTP = 'http',
	GRAPHQL = 'graphql',
	DATABASE = 'database',
	FILE = 'file',
	QUEUE = 'queue',
	CUSTOM = 'custom',
}

/**
 * Database types supported
 */
export enum DatabaseType {
	POSTGRESQL = 'postgresql',
	MYSQL = 'mysql',
	SQLITE = 'sqlite',
	MONGODB = 'mongodb',
}

/**
 * File storage types
 */
export enum FileStorageType {
	LOCAL = 'local',
	S3 = 's3',
	GCS = 'gcs',
	AZURE_BLOB = 'azureBlob',
}

/**
 * Message queue types
 */
export enum QueueType {
	RABBITMQ = 'rabbitmq',
	SQS = 'sqs',
	REDIS = 'redis',
	KAFKA = 'kafka',
}

/**
 * Data mapping field transformation
 */
export const DataMappingSchema = z.object({
	sourceField: z.string(),
	targetField: z.string(),
	transform: z
		.object({
			type: z.enum(['jsonpath', 'template', 'function', 'direct']),
			expression: z.string().optional(),
			defaultValue: z.unknown().optional(),
			coerce: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']).optional(),
		})
		.optional(),
});

export type DataMapping = z.infer<typeof DataMappingSchema>;

/**
 * OAuth2 configuration
 */
export const OAuth2ConfigSchema = z.object({
	authUrl: z.string().url(),
	tokenUrl: z.string().url(),
	clientId: z.string(),
	clientSecret: z.string(),
	scope: z.array(z.string()).optional(),
	redirectUri: z.string().url().optional(),
	grantType: z.enum(['authorization_code', 'client_credentials', 'refresh_token']).default('authorization_code'),
});

export type OAuth2Config = z.infer<typeof OAuth2ConfigSchema>;

/**
 * API Key configuration
 */
export const ApiKeyConfigSchema = z.object({
	header: z.string().default('X-API-Key'),
	prefix: z.string().optional(),
	location: z.enum(['header', 'query', 'body']).default('header'),
});

export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;

/**
 * Basic authentication configuration
 */
export const BasicAuthConfigSchema = z.object({
	username: z.string(),
	password: z.string(),
});

export type BasicAuthConfig = z.infer<typeof BasicAuthConfigSchema>;

/**
 * Integration authentication configuration
 */
export const AuthConfigSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal(AuthType.OAUTH2), config: OAuth2ConfigSchema }),
	z.object({ type: z.literal(AuthType.API_KEY), config: ApiKeyConfigSchema }),
	z.object({ type: z.literal(AuthType.BASIC), config: BasicAuthConfigSchema }),
	z.object({ type: z.literal(AuthType.BEARER), config: z.object({ token: z.string() }) }),
	z.object({ type: z.literal(AuthType.CUSTOM), config: z.record(z.unknown()) }),
	z.object({ type: z.literal(AuthType.NONE), config: z.object({}).optional() }),
]);

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * HTTP connector configuration
 */
export const HttpConnectorConfigSchema = z.object({
	baseUrl: z.string().url(),
	timeout: z.number().positive().default(30000),
	retryAttempts: z.number().int().min(0).default(3),
	retryDelay: z.number().positive().default(1000),
	headers: z.record(z.string()).optional(),
});

export type HttpConnectorConfig = z.infer<typeof HttpConnectorConfigSchema>;

/**
 * GraphQL connector configuration
 */
export const GraphQLConnectorConfigSchema = z.object({
	endpoint: z.string().url(),
	timeout: z.number().positive().default(30000),
	headers: z.record(z.string()).optional(),
	introspection: z.boolean().default(true),
});

export type GraphQLConnectorConfig = z.infer<typeof GraphQLConnectorConfigSchema>;

/**
 * Database connector configuration
 */
export const DatabaseConnectorConfigSchema = z.object({
	type: z.nativeEnum(DatabaseType),
	host: z.string(),
	port: z.number().int().positive(),
	database: z.string(),
	username: z.string().optional(),
	password: z.string().optional(),
	ssl: z.boolean().default(false),
	poolSize: z.number().int().positive().default(10),
	connectionTimeout: z.number().positive().default(10000),
});

export type DatabaseConnectorConfig = z.infer<typeof DatabaseConnectorConfigSchema>;

/**
 * File connector configuration
 */
export const FileConnectorConfigSchema = z.object({
	type: z.nativeEnum(FileStorageType),
	basePath: z.string().optional(),
	region: z.string().optional(), // For cloud storage
	bucket: z.string().optional(), // For cloud storage
	credentials: z.record(z.unknown()).optional(),
});

export type FileConnectorConfig = z.infer<typeof FileConnectorConfigSchema>;

/**
 * Queue connector configuration
 */
export const QueueConnectorConfigSchema = z.object({
	type: z.nativeEnum(QueueType),
	url: z.string(),
	username: z.string().optional(),
	password: z.string().optional(),
	queueName: z.string().optional(),
	exchange: z.string().optional(),
	routingKey: z.string().optional(),
});

export type QueueConnectorConfig = z.infer<typeof QueueConnectorConfigSchema>;

/**
 * Generic connector configuration
 */
export const ConnectorConfigSchema = z.union([
	HttpConnectorConfigSchema,
	GraphQLConnectorConfigSchema,
	DatabaseConnectorConfigSchema,
	FileConnectorConfigSchema,
	QueueConnectorConfigSchema,
	z.record(z.unknown()), // Custom connector config
]);

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

/**
 * Integration metadata
 */
export const IntegrationMetadataSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	version: z.string().default('1.0.0'),
	author: z.string().optional(),
	homepage: z.string().url().optional(),
	documentation: z.string().url().optional(),
	icon: z.string().optional(),
	tags: z.array(z.string()).default([]),
});

export type IntegrationMetadata = z.infer<typeof IntegrationMetadataSchema>;

/**
 * Integration configuration
 */
export const IntegrationConfigSchema = z.object({
	connectorType: z.nativeEnum(ConnectorType),
	connectorConfig: ConnectorConfigSchema,
	auth: AuthConfigSchema.optional(),
	rateLimits: z
		.object({
			requestsPerSecond: z.number().positive().optional(),
			requestsPerMinute: z.number().positive().optional(),
			requestsPerHour: z.number().positive().optional(),
		})
		.optional(),
	caching: z
		.object({
			enabled: z.boolean().default(false),
			ttl: z.number().positive().default(300),
			patterns: z.array(z.string()).optional(),
		})
		.optional(),
	healthCheck: z
		.object({
			enabled: z.boolean().default(true),
			interval: z.number().positive().default(60000),
			timeout: z.number().positive().default(5000),
			endpoint: z.string().optional(),
		})
		.optional(),
});

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

/**
 * Complete integration definition
 */
export const IntegrationSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	metadata: IntegrationMetadataSchema,
	config: IntegrationConfigSchema,
	status: z.nativeEnum(IntegrationStatus).default(IntegrationStatus.DISCONNECTED),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date()),
	lastConnectedAt: z.date().optional(),
	errorMessage: z.string().optional(),
});

export type Integration = z.infer<typeof IntegrationSchema>;

/**
 * Integration filter options
 */
export const IntegrationFilterSchema = z.object({
	status: z.nativeEnum(IntegrationStatus).optional(),
	connectorType: z.nativeEnum(ConnectorType).optional(),
	authType: z.nativeEnum(AuthType).optional(),
	tags: z.array(z.string()).optional(),
	searchQuery: z.string().optional(),
});

export type IntegrationFilter = z.infer<typeof IntegrationFilterSchema>;

/**
 * Connector interface that all connectors must implement
 */
export interface Connector {
	/**
	 * Connect to the integration
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from the integration
	 */
	disconnect(): Promise<void>;

	/**
	 * Execute an operation
	 */
	execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput>;

	/**
	 * Test the connection
	 */
	test(): Promise<boolean>;

	/**
	 * Get connection status
	 */
	getStatus(): IntegrationStatus;
}

/**
 * HTTP request options
 */
export const HttpRequestOptionsSchema = z.object({
	method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
	headers: z.record(z.string()).optional(),
	params: z.record(z.unknown()).optional(),
	body: z.unknown().optional(),
	timeout: z.number().positive().optional(),
	maxRetries: z.number().int().min(0).optional(),
});

export type HttpRequestOptions = z.infer<typeof HttpRequestOptionsSchema>;

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	data: T;
}

/**
 * GraphQL query options
 */
export const GraphQLQueryOptionsSchema = z.object({
	query: z.string(),
	variables: z.record(z.unknown()).optional(),
	operationName: z.string().optional(),
});

export type GraphQLQueryOptions = z.infer<typeof GraphQLQueryOptionsSchema>;

/**
 * GraphQL response
 */
export interface GraphQLResponse<T = unknown> {
	data?: T;
	errors?: Array<{
		message: string;
		locations?: Array<{ line: number; column: number }>;
		path?: Array<string | number>;
		extensions?: Record<string, unknown>;
	}>;
}

/**
 * Database query options
 */
export const DatabaseQueryOptionsSchema = z.object({
	query: z.string(),
	params: z.array(z.unknown()).optional(),
	transaction: z.boolean().default(false),
});

export type DatabaseQueryOptions = z.infer<typeof DatabaseQueryOptionsSchema>;

/**
 * File information
 */
export interface FileInfo {
	path: string;
	name: string;
	size: number;
	type: string;
	lastModified: Date;
	isDirectory: boolean;
}

/**
 * File operation options
 */
export const FileOperationOptionsSchema = z.object({
	encoding: z.string().default('utf-8'),
	createIfNotExists: z.boolean().default(false),
	overwrite: z.boolean().default(false),
});

export type FileOperationOptions = z.infer<typeof FileOperationOptionsSchema>;

/**
 * Message queue message
 */
export interface QueueMessage<T = unknown> {
	id: string;
	topic: string;
	data: T;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

/**
 * Message queue subscription
 */
export interface QueueSubscription {
	id: string;
	topic: string;
	unsubscribe(): Promise<void>;
}

/**
 * Health check status
 */
export const HealthStatusSchema = z.object({
	integrationId: z.string().uuid(),
	status: z.enum(['healthy', 'unhealthy', 'degraded']),
	lastChecked: z.date(),
	responseTime: z.number().optional(),
	errorMessage: z.string().optional(),
	details: z.record(z.unknown()).optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Health report for multiple integrations
 */
export interface HealthReport {
	timestamp: Date;
	overall: 'healthy' | 'unhealthy' | 'degraded';
	integrations: HealthStatus[];
}

/**
 * Rate limit configuration
 */
export interface RateLimit {
	requestsPerSecond?: number;
	requestsPerMinute?: number;
	requestsPerHour?: number;
}

/**
 * Cached response
 */
export interface CachedResponse<T = unknown> {
	data: T;
	cachedAt: Date;
	expiresAt: Date;
}

/**
 * Webhook subscription
 */
export const WebhookSubscriptionSchema = z.object({
	id: z.string().uuid(),
	integrationId: z.string().uuid(),
	events: z.array(z.string()),
	url: z.string().url(),
	secret: z.string().optional(),
	active: z.boolean().default(true),
	createdAt: z.date().default(() => new Date()),
});

export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

/**
 * Integration spec for auto-discovery
 */
export const IntegrationSpecSchema = z.object({
	metadata: IntegrationMetadataSchema,
	config: IntegrationConfigSchema,
	operations: z
		.array(
			z.object({
				name: z.string(),
				method: z.string(),
				path: z.string().optional(),
				description: z.string().optional(),
				parameters: z.array(
					z.object({
						name: z.string(),
						type: z.string(),
						required: z.boolean().default(false),
						description: z.string().optional(),
					}),
				),
			}),
		)
		.optional(),
});

export type IntegrationSpec = z.infer<typeof IntegrationSpecSchema>;

/**
 * OAuth2 tokens
 */
export interface OAuth2Tokens {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: Date;
	tokenType: string;
	scope?: string[];
}

/**
 * Auth result
 */
export interface AuthResult {
	success: boolean;
	tokens?: OAuth2Tokens;
	errorMessage?: string;
}
