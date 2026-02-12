import { z } from 'zod';
import type { Query, QueryHandler, Result } from './types';
import { QuerySchema } from './types';

/**
 * Query validation error
 */
export class QueryValidationError extends Error {
	constructor(
		public readonly queryType: string,
		public readonly validationErrors: z.ZodError,
	) {
		super(`Query validation failed for ${queryType}: ${validationErrors.message}`);
		this.name = 'QueryValidationError';
	}
}

/**
 * Query not registered error
 */
export class QueryNotRegisteredError extends Error {
	constructor(public readonly queryType: string) {
		super(`No handler registered for query type: ${queryType}`);
		this.name = 'QueryNotRegisteredError';
	}
}

/**
 * Query handler metadata
 */
interface QueryHandlerMetadata {
	handler: QueryHandler;
	schema?: z.ZodSchema;
	cacheable: boolean;
	cacheTTL?: number;
}

/**
 * Cache entry
 */
interface CacheEntry<T = unknown> {
	data: T;
	timestamp: number;
	ttl: number;
}

/**
 * Query cache interface
 */
export interface QueryCache {
	get<T>(key: string): Promise<T | undefined>;
	set<T>(key: string, value: T, ttl: number): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

/**
 * In-memory query cache implementation
 */
export class InMemoryQueryCache implements QueryCache {
	private cache: Map<string, CacheEntry> = new Map();

	async get<T>(key: string): Promise<T | undefined> {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// Check if expired
		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.data as T;
	}

	async set<T>(key: string, value: T, ttl: number): Promise<void> {
		this.cache.set(key, {
			data: value,
			timestamp: Date.now(),
			ttl,
		});
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	async clear(): Promise<void> {
		this.cache.clear();
	}

	/**
	 * Clean up expired entries
	 */
	cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}
	}
}

/**
 * Query bus options
 */
export interface QueryBusOptions {
	/** Enable query validation */
	validateQueries?: boolean;
	/** Query cache implementation */
	cache?: QueryCache;
	/** Default cache TTL in milliseconds */
	defaultCacheTTL?: number;
	/** Query timeout in milliseconds */
	timeout?: number;
}

/**
 * Query bus for executing queries against read models
 * Supports validation, caching, and routing
 */
export class QueryBus {
	private handlers: Map<string, QueryHandlerMetadata> = new Map();
	private cache: QueryCache;
	private options: Required<QueryBusOptions>;

	constructor(options: QueryBusOptions = {}) {
		this.options = {
			validateQueries: options.validateQueries ?? true,
			cache: options.cache ?? new InMemoryQueryCache(),
			defaultCacheTTL: options.defaultCacheTTL ?? 60000, // 1 minute
			timeout: options.timeout ?? 30000,
		};
		this.cache = this.options.cache;
	}

	/**
	 * Register a query handler
	 */
	register<TQuery extends Query = Query, TResult = unknown>(
		queryType: string,
		handler: QueryHandler<TQuery, TResult>,
		options: {
			schema?: z.ZodSchema;
			cacheable?: boolean;
			cacheTTL?: number;
		} = {},
	): void {
		if (this.handlers.has(queryType)) {
			throw new Error(`Handler already registered for query type: ${queryType}`);
		}

		this.handlers.set(queryType, {
			handler: handler as QueryHandler,
			schema: options.schema,
			cacheable: options.cacheable ?? false,
			cacheTTL: options.cacheTTL ?? this.options.defaultCacheTTL,
		});
	}

	/**
	 * Unregister a query handler
	 */
	unregister(queryType: string): void {
		this.handlers.delete(queryType);
	}

	/**
	 * Check if a handler is registered
	 */
	isRegistered(queryType: string): boolean {
		return this.handlers.has(queryType);
	}

	/**
	 * Execute a query
	 */
	async execute<TResult = unknown>(query: Query): Promise<Result<TResult>> {
		// Validate query structure
		if (this.options.validateQueries) {
			try {
				QuerySchema.parse(query);
			} catch (error) {
				return {
					success: false,
					error: new QueryValidationError(query.type, error as z.ZodError),
				};
			}
		}

		// Get handler metadata
		const metadata = this.handlers.get(query.type);
		if (!metadata) {
			return {
				success: false,
				error: new QueryNotRegisteredError(query.type),
			};
		}

		// Validate query filters with schema if provided
		if (metadata.schema) {
			try {
				metadata.schema.parse(query.filters);
			} catch (error) {
				return {
					success: false,
					error: new QueryValidationError(query.type, error as z.ZodError),
				};
			}
		}

		// Check cache if enabled
		const cacheEnabled = metadata.cacheable && query.metadata?.cache !== false;
		if (cacheEnabled) {
			const cacheKey = this.generateCacheKey(query);
			const cachedResult = await this.cache.get<TResult>(cacheKey);

			if (cachedResult !== undefined) {
				return {
					success: true,
					data: cachedResult,
					metadata: {
						fromCache: true,
					},
				};
			}
		}

		// Execute query with timeout
		try {
			const data = await this.executeWithTimeout(
				() => metadata.handler(query),
				this.options.timeout,
			);

			// Cache result if enabled
			if (cacheEnabled && metadata.cacheTTL) {
				const cacheKey = this.generateCacheKey(query);
				await this.cache.set(cacheKey, data, metadata.cacheTTL);
			}

			return {
				success: true,
				data: data as TResult,
			};
		} catch (error) {
			return {
				success: false,
				error: error as Error,
			};
		}
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout<T>(
		fn: () => Promise<T>,
		timeout: number,
	): Promise<T> {
		return Promise.race([
			fn(),
			new Promise<T>((_, reject) =>
				setTimeout(() => reject(new Error(`Query execution timeout after ${timeout}ms`)), timeout),
			),
		]);
	}

	/**
	 * Generate cache key for a query
	 */
	private generateCacheKey(query: Query): string {
		return `${query.type}:${JSON.stringify(query.filters)}:${JSON.stringify(query.pagination || {})}`;
	}

	/**
	 * Invalidate cache for a query type
	 */
	async invalidateCache(queryType?: string): Promise<void> {
		if (!queryType) {
			await this.cache.clear();
			return;
		}

		// Note: This is a simplified implementation
		// A real implementation would need to track cache keys by query type
		await this.cache.clear();
	}

	/**
	 * Get all registered query types
	 */
	getRegisteredQueries(): string[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Clear all handlers
	 */
	clear(): void {
		this.handlers.clear();
	}

	/**
	 * Get cache instance
	 */
	getCache(): QueryCache {
		return this.cache;
	}
}

/**
 * Query decorator for TypeScript classes
 */
export function QueryDecorator(
	queryType: string,
	options: {
		schema?: z.ZodSchema;
		cacheable?: boolean;
		cacheTTL?: number;
	} = {},
) {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;

		descriptor.value = async function (this: { queryBus?: QueryBus }, query: Query) {
			if (!this.queryBus) {
				throw new Error('QueryBus not available');
			}

			// Register handler if not already registered
			if (!this.queryBus.isRegistered(queryType)) {
				this.queryBus.register(queryType, originalMethod.bind(this), options);
			}

			return this.queryBus.execute(query);
		};

		return descriptor;
	};
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNext: boolean;
	hasPrevious: boolean;
}

/**
 * Helper to create paginated results
 */
export function createPaginatedResult<T>(
	items: T[],
	total: number,
	page: number,
	pageSize: number,
): PaginatedResult<T> {
	const totalPages = Math.ceil(total / pageSize);

	return {
		items,
		total,
		page,
		pageSize,
		totalPages,
		hasNext: page < totalPages,
		hasPrevious: page > 1,
	};
}

/**
 * Cursor-based pagination result
 */
export interface CursorPaginatedResult<T> {
	items: T[];
	nextCursor?: string;
	previousCursor?: string;
	hasNext: boolean;
	hasPrevious: boolean;
}

/**
 * Helper to create cursor-based paginated results
 */
export function createCursorPaginatedResult<T>(
	items: T[],
	nextCursor?: string,
	previousCursor?: string,
): CursorPaginatedResult<T> {
	return {
		items,
		nextCursor,
		previousCursor,
		hasNext: nextCursor !== undefined,
		hasPrevious: previousCursor !== undefined,
	};
}
