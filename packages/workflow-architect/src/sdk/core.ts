/**
 * Core SDK functionality
 * Base client with request handling, retries, and interceptors
 */

import type { SDKConfig, RequestOptions, Response, ErrorResponse, RateLimitInfo } from './types.js';
import { RetryHandler } from './retry/index.js';
import { RateLimitHandler } from './rate-limit/index.js';

export type RequestInterceptor = (url: string, options: RequestInit) => Promise<RequestInit> | RequestInit;
export type ResponseInterceptor<T> = (response: globalThis.Response) => Promise<T> | T;

/**
 * Base HTTP client with retry logic and interceptors
 * Integration: const client = new BaseClient(config);
 */
export class BaseClient {
	private requestInterceptors: RequestInterceptor[] = [];
	private responseInterceptors: ResponseInterceptor<unknown>[] = [];
	private retryHandler: RetryHandler;
	private rateLimitHandler: RateLimitHandler;

	constructor(protected config: SDKConfig) {
		this.retryHandler = new RetryHandler(config.retries);
		this.rateLimitHandler = new RateLimitHandler();
	}

	async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<Response<T>> {
		const url = `${this.config.baseUrl}${path}`;
		const startTime = Date.now();
		await this.rateLimitHandler.checkLimit();

		let init: RequestInit = {
			method,
			headers: this.buildHeaders(options),
			signal: options.signal,
		};

		for (const interceptor of this.requestInterceptors) {
			init = await interceptor(url, init);
		}

		const response = await this.retryHandler.execute(async () => {
			const res = await fetch(url, init);
			this.rateLimitHandler.updateFromHeaders(res.headers);
			if (!res.ok) throw await this.createError(res);
			return res;
		});

		const data = await response.json() as T;
		return {
			data,
			metadata: {
				requestId: response.headers.get('x-request-id') ?? crypto.randomUUID(),
				timestamp: new Date(),
				duration: Date.now() - startTime,
			},
		};
	}

	addRequestInterceptor(interceptor: RequestInterceptor): void {
		this.requestInterceptors.push(interceptor);
	}

	getRateLimitInfo(): RateLimitInfo | null {
		return this.rateLimitHandler.getInfo();
	}

	private buildHeaders(options: RequestOptions): HeadersInit {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.config.headers,
			...options.headers,
		};
		if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
		return headers;
	}

	private async createError(response: globalThis.Response): Promise<ErrorResponse> {
		const body = await response.json().catch(() => ({}));
		return {
			code: body.code ?? 'UNKNOWN_ERROR',
			message: body.message ?? response.statusText,
			details: body.details,
			statusCode: response.status,
		};
	}
}
