/**
 * Common SDK types for the Workflow Architect API
 * Provides type-safe interfaces for all SDK operations
 */

import { z } from 'zod';

/**
 * SDK Configuration
 */
export const SDKConfigSchema = z.object({
	baseUrl: z.string().url().default('http://localhost:3000'),
	apiKey: z.string().optional(),
	timeout: z.number().positive().default(30000),
	retries: z.number().min(0).max(5).default(3),
	headers: z.record(z.string()).optional(),
});

export type SDKConfig = z.infer<typeof SDKConfigSchema>;

/**
 * Request options for individual API calls
 */
export const RequestOptionsSchema = z.object({
	headers: z.record(z.string()).optional(),
	timeout: z.number().positive().optional(),
	retry: z.boolean().default(true),
	signal: z.instanceof(AbortSignal).optional(),
});

export type RequestOptions = z.infer<typeof RequestOptionsSchema>;

/**
 * Generic API response wrapper
 */
export interface Response<T> {
	data: T;
	error?: ErrorResponse;
	metadata: ResponseMetadata;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
	requestId: string;
	timestamp: Date;
	duration: number;
	cached?: boolean;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
	items: T[];
	cursor?: string;
	hasMore: boolean;
	total?: number;
	metadata: ResponseMetadata;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
	code: string;
	message: string;
	details?: Record<string, unknown>;
	statusCode: number;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
	limit: number;
	remaining: number;
	reset: Date;
	retryAfter?: number;
}
