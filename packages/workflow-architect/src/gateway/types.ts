import { z } from 'zod';

// Gateway Types

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const PolicyTypeSchema = z.enum([
	'auth',
	'rate-limit',
	'cors',
	'cache',
	'transform',
	'circuit-breaker',
	'compression',
]);
export type PolicyType = z.infer<typeof PolicyTypeSchema>;

export const LoadBalanceStrategySchema = z.enum([
	'round-robin',
	'least-connections',
	'random',
	'weighted',
	'ip-hash',
]);
export type LoadBalanceStrategy = z.infer<typeof LoadBalanceStrategySchema>;

export const CircuitStateSchema = z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']);
export type CircuitState = z.infer<typeof CircuitStateSchema>;

export const HealthStatusSchema = z.enum(['healthy', 'unhealthy', 'degraded', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// Backend configuration
export const BackendConfigSchema = z.object({
	id: z.string(),
	url: z.string().url(),
	weight: z.number().min(0).max(100).default(1),
	maxConnections: z.number().positive().optional(),
	timeout: z.number().positive().default(30000),
	healthCheck: z
		.object({
			enabled: z.boolean().default(true),
			interval: z.number().positive().default(30000),
			timeout: z.number().positive().default(5000),
			healthyThreshold: z.number().positive().default(2),
			unhealthyThreshold: z.number().positive().default(3),
			path: z.string().optional(),
			expectedStatus: z.number().default(200),
		})
		.optional(),
});
export type BackendConfig = z.infer<typeof BackendConfigSchema>;

// Route configuration
export const RouteConfigSchema = z.object({
	id: z.string(),
	path: z.string(),
	method: HttpMethodSchema,
	backends: z.array(BackendConfigSchema).min(1),
	loadBalanceStrategy: LoadBalanceStrategySchema.default('round-robin'),
	policies: z.array(z.string()).default([]),
	metadata: z.record(z.string(), z.unknown()).optional(),
	enabled: z.boolean().default(true),
	priority: z.number().default(0),
});
export type RouteConfig = z.infer<typeof RouteConfigSchema>;

// Policy configurations
export const AuthPolicyConfigSchema = z.object({
	type: z.literal('auth'),
	strategies: z.array(z.enum(['api-key', 'jwt', 'oauth2', 'basic'])),
	apiKey: z
		.object({
			header: z.string().default('X-API-Key'),
			query: z.string().optional(),
		})
		.optional(),
	jwt: z
		.object({
			secret: z.string(),
			algorithm: z.string().default('HS256'),
			issuer: z.string().optional(),
			audience: z.string().optional(),
		})
		.optional(),
	oauth2: z
		.object({
			tokenEndpoint: z.string().url(),
			clientId: z.string(),
			clientSecret: z.string(),
		})
		.optional(),
});
export type AuthPolicyConfig = z.infer<typeof AuthPolicyConfigSchema>;

export const RateLimitPolicyConfigSchema = z.object({
	type: z.literal('rate-limit'),
	windowMs: z.number().positive().default(60000),
	maxRequests: z.number().positive().default(100),
	keyGenerator: z.enum(['ip', 'user', 'api-key', 'custom']).default('ip'),
	skipSuccessfulRequests: z.boolean().default(false),
	skipFailedRequests: z.boolean().default(false),
	burstSize: z.number().positive().optional(),
});
export type RateLimitPolicyConfig = z.infer<typeof RateLimitPolicyConfigSchema>;

export const CORSPolicyConfigSchema = z.object({
	type: z.literal('cors'),
	origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default('*'),
	methods: z.array(HttpMethodSchema).optional(),
	allowedHeaders: z.array(z.string()).optional(),
	exposedHeaders: z.array(z.string()).optional(),
	credentials: z.boolean().default(false),
	maxAge: z.number().optional(),
	preflightContinue: z.boolean().default(false),
});
export type CORSPolicyConfig = z.infer<typeof CORSPolicyConfigSchema>;

export const CachePolicyConfigSchema = z.object({
	type: z.literal('cache'),
	ttl: z.number().positive().default(300000),
	methods: z.array(HttpMethodSchema).default(['GET', 'HEAD']),
	varyHeaders: z.array(z.string()).default([]),
	invalidateOn: z.array(HttpMethodSchema).default(['POST', 'PUT', 'PATCH', 'DELETE']),
	keyGenerator: z.enum(['url', 'url-query', 'custom']).default('url-query'),
	respectCacheControl: z.boolean().default(true),
});
export type CachePolicyConfig = z.infer<typeof CachePolicyConfigSchema>;

export const TransformPolicyConfigSchema = z.object({
	type: z.literal('transform'),
	request: z
		.object({
			headers: z.record(z.string(), z.string()).optional(),
			removeHeaders: z.array(z.string()).optional(),
			body: z.record(z.string(), z.unknown()).optional(),
			jsonPath: z
				.array(
					z.object({
						path: z.string(),
						value: z.unknown(),
					}),
				)
				.optional(),
		})
		.optional(),
	response: z
		.object({
			headers: z.record(z.string(), z.string()).optional(),
			removeHeaders: z.array(z.string()).optional(),
			body: z.record(z.string(), z.unknown()).optional(),
			jsonPath: z
				.array(
					z.object({
						path: z.string(),
						value: z.unknown(),
					}),
				)
				.optional(),
		})
		.optional(),
});
export type TransformPolicyConfig = z.infer<typeof TransformPolicyConfigSchema>;

export const CircuitBreakerPolicyConfigSchema = z.object({
	type: z.literal('circuit-breaker'),
	failureThreshold: z.number().positive().default(5),
	successThreshold: z.number().positive().default(2),
	timeout: z.number().positive().default(60000),
	resetTimeout: z.number().positive().default(30000),
	fallback: z
		.object({
			statusCode: z.number().default(503),
			body: z.unknown().optional(),
			headers: z.record(z.string(), z.string()).optional(),
		})
		.optional(),
});
export type CircuitBreakerPolicyConfig = z.infer<typeof CircuitBreakerPolicyConfigSchema>;

export const CompressionPolicyConfigSchema = z.object({
	type: z.literal('compression'),
	threshold: z.number().positive().default(1024),
	level: z.number().min(-1).max(9).default(6),
	mimeTypes: z
		.array(z.string())
		.default([
			'text/html',
			'text/css',
			'text/javascript',
			'application/json',
			'application/xml',
		]),
	brotli: z.boolean().default(true),
	gzip: z.boolean().default(true),
});
export type CompressionPolicyConfig = z.infer<typeof CompressionPolicyConfigSchema>;

export const PolicyConfigSchema = z.union([
	AuthPolicyConfigSchema,
	RateLimitPolicyConfigSchema,
	CORSPolicyConfigSchema,
	CachePolicyConfigSchema,
	TransformPolicyConfigSchema,
	CircuitBreakerPolicyConfigSchema,
	CompressionPolicyConfigSchema,
]);
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

// Policy definition
export const PolicySchema = z.object({
	id: z.string(),
	name: z.string(),
	enabled: z.boolean().default(true),
	config: PolicyConfigSchema,
	conditions: z
		.object({
			paths: z.array(z.string()).optional(),
			methods: z.array(HttpMethodSchema).optional(),
			headers: z.record(z.string(), z.string()).optional(),
		})
		.optional(),
});
export type Policy = z.infer<typeof PolicySchema>;

// Gateway configuration
export const GatewayConfigSchema = z.object({
	port: z.number().positive().default(3000),
	host: z.string().default('0.0.0.0'),
	basePath: z.string().default('/'),
	trustProxy: z.boolean().default(false),
	requestTimeout: z.number().positive().default(30000),
	bodyLimit: z.string().default('10mb'),
	cors: CORSPolicyConfigSchema.optional(),
	rateLimit: RateLimitPolicyConfigSchema.optional(),
	compression: CompressionPolicyConfigSchema.optional(),
	logging: z
		.object({
			enabled: z.boolean().default(true),
			format: z.enum(['json', 'common', 'combined', 'dev']).default('json'),
			level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
		})
		.optional(),
	metrics: z
		.object({
			enabled: z.boolean().default(true),
			path: z.string().default('/metrics'),
			includeRouteLabels: z.boolean().default(true),
		})
		.optional(),
	admin: z
		.object({
			enabled: z.boolean().default(true),
			path: z.string().default('/admin'),
			auth: z
				.object({
					username: z.string(),
					password: z.string(),
				})
				.optional(),
		})
		.optional(),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

// Runtime types
export interface RouteMatch {
	route: RouteConfig;
	params: Record<string, string>;
	query: Record<string, string>;
}

export interface BackendHealth {
	backend: BackendConfig;
	status: HealthStatus;
	lastCheck: Date;
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	latency?: number;
}

export interface CircuitBreakerState {
	state: CircuitState;
	failures: number;
	successes: number;
	lastFailure?: Date;
	nextAttempt?: Date;
}

export interface RateLimitState {
	requests: number;
	resetTime: number;
	blocked: boolean;
}

export interface CacheEntry {
	statusCode: number;
	headers: Record<string, string>;
	body: unknown;
	etag?: string;
	lastModified?: Date;
	expiresAt: Date;
	vary: string[];
}

export interface RequestContext {
	requestId: string;
	startTime: number;
	route?: RouteMatch;
	backend?: BackendConfig;
	user?: {
		id: string;
		roles: string[];
		metadata?: Record<string, unknown>;
	};
	metrics: {
		requestSize: number;
		responseSize: number;
		latency: number;
		backendLatency?: number;
	};
}

export interface GatewayMetrics {
	requests: {
		total: number;
		successful: number;
		failed: number;
		byRoute: Map<string, number>;
		byMethod: Map<HttpMethod, number>;
		byStatusCode: Map<number, number>;
	};
	latency: {
		p50: number;
		p95: number;
		p99: number;
		mean: number;
	};
	backends: Map<
		string,
		{
			requests: number;
			failures: number;
			latency: number[];
			activeConnections: number;
		}
	>;
	cache: {
		hits: number;
		misses: number;
		size: number;
	};
	circuitBreakers: Map<string, CircuitBreakerState>;
}
