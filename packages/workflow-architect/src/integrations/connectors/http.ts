import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
	Connector,
	IntegrationStatus,
	HttpConnectorConfig,
	HttpConnectorConfigSchema,
	HttpRequestOptions,
	HttpRequestOptionsSchema,
	HttpResponse,
	AuthConfig,
	AuthType,
} from '../types';

/**
 * HTTP Connector
 * Implements HTTP/HTTPS communication with automatic retry, interceptors, and authentication
 */
export class HttpConnector implements Connector {
	private config: HttpConnectorConfig;
	private authConfig?: AuthConfig;
	private client: AxiosInstance;
	private status: IntegrationStatus;
	private requestInterceptors: Array<(config: AxiosRequestConfig) => AxiosRequestConfig>;
	private responseInterceptors: Array<(response: AxiosResponse) => AxiosResponse>;

	constructor(config: HttpConnectorConfig, authConfig?: AuthConfig) {
		this.config = HttpConnectorConfigSchema.parse(config);
		this.authConfig = authConfig;
		this.status = IntegrationStatus.DISCONNECTED;
		this.requestInterceptors = [];
		this.responseInterceptors = [];
		this.client = this.createClient();
	}

	/**
	 * Create axios client with configuration
	 */
	private createClient(): AxiosInstance {
		const client = axios.create({
			baseURL: this.config.baseUrl,
			timeout: this.config.timeout,
			headers: {
				'Content-Type': 'application/json',
				...this.config.headers,
			},
		});

		// Setup authentication
		if (this.authConfig) {
			this.setupAuthentication(client);
		}

		// Add request interceptors
		client.interceptors.request.use(
			(config) => {
				let modifiedConfig = config;
				for (const interceptor of this.requestInterceptors) {
					modifiedConfig = interceptor(modifiedConfig);
				}
				return modifiedConfig;
			},
			(error) => Promise.reject(error),
		);

		// Add response interceptors
		client.interceptors.response.use(
			(response) => {
				let modifiedResponse = response;
				for (const interceptor of this.responseInterceptors) {
					modifiedResponse = interceptor(modifiedResponse);
				}
				return modifiedResponse;
			},
			(error) => Promise.reject(error),
		);

		return client;
	}

	/**
	 * Setup authentication based on auth config
	 */
	private setupAuthentication(client: AxiosInstance): void {
		if (!this.authConfig) return;

		switch (this.authConfig.type) {
			case AuthType.BEARER:
				client.defaults.headers.common['Authorization'] = `Bearer ${this.authConfig.config.token}`;
				break;

			case AuthType.API_KEY:
				if (this.authConfig.config.location === 'header') {
					const header = this.authConfig.config.header || 'X-API-Key';
					const value = this.authConfig.config.prefix
						? `${this.authConfig.config.prefix} ${this.authConfig.config.key}`
						: this.authConfig.config.key;
					client.defaults.headers.common[header] = value;
				}
				// Query and body locations handled in request interceptor
				break;

			case AuthType.BASIC:
				const credentials = Buffer.from(
					`${this.authConfig.config.username}:${this.authConfig.config.password}`,
				).toString('base64');
				client.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
				break;

			case AuthType.OAUTH2:
				// OAuth2 tokens are typically managed externally and added via interceptor
				// This is handled by the OAuth2Handler
				break;
		}
	}

	/**
	 * Connect to the HTTP endpoint
	 */
	async connect(): Promise<void> {
		try {
			// Test connection with a simple HEAD or GET request
			await this.client.request({
				method: 'HEAD',
				url: '/',
			});
			this.status = IntegrationStatus.CONNECTED;
		} catch (error) {
			this.status = IntegrationStatus.ERROR;
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Disconnect from the HTTP endpoint
	 */
	async disconnect(): Promise<void> {
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Execute an HTTP request
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput> {
		const options = params as unknown as HttpRequestOptions;
		const validatedOptions = HttpRequestOptionsSchema.parse(options);

		const response = await this.request<TOutput>(
			validatedOptions.method,
			operation,
			validatedOptions,
		);

		return response.data;
	}

	/**
	 * Make an HTTP request with retry logic
	 */
	async request<T = unknown>(
		method: HttpRequestOptions['method'],
		url: string,
		options?: Partial<HttpRequestOptions>,
	): Promise<HttpResponse<T>> {
		const maxRetries = options?.maxRetries ?? this.config.retryAttempts;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const axiosConfig: AxiosRequestConfig = {
					method,
					url,
					headers: options?.headers,
					params: options?.params,
					data: options?.body,
					timeout: options?.timeout ?? this.config.timeout,
				};

				const response = await this.client.request<T>(axiosConfig);

				return {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers as Record<string, string>,
					data: response.data,
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');

				// Don't retry on client errors (4xx)
				if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
					throw lastError;
				}

				// Wait before retrying
				if (attempt < maxRetries) {
					await this.sleep(this.config.retryDelay * Math.pow(2, attempt));
				}
			}
		}

		throw lastError || new Error('Request failed after retries');
	}

	/**
	 * Convenience methods for HTTP verbs
	 */
	async get<T = unknown>(url: string, options?: Partial<HttpRequestOptions>): Promise<HttpResponse<T>> {
		return this.request<T>('GET', url, options);
	}

	async post<T = unknown>(url: string, body: unknown, options?: Partial<HttpRequestOptions>): Promise<HttpResponse<T>> {
		return this.request<T>('POST', url, { ...options, body });
	}

	async put<T = unknown>(url: string, body: unknown, options?: Partial<HttpRequestOptions>): Promise<HttpResponse<T>> {
		return this.request<T>('PUT', url, { ...options, body });
	}

	async patch<T = unknown>(url: string, body: unknown, options?: Partial<HttpRequestOptions>): Promise<HttpResponse<T>> {
		return this.request<T>('PATCH', url, { ...options, body });
	}

	async delete<T = unknown>(url: string, options?: Partial<HttpRequestOptions>): Promise<HttpResponse<T>> {
		return this.request<T>('DELETE', url, options);
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
	 * Add request interceptor
	 */
	addRequestInterceptor(interceptor: (config: AxiosRequestConfig) => AxiosRequestConfig): void {
		this.requestInterceptors.push(interceptor);
	}

	/**
	 * Add response interceptor
	 */
	addResponseInterceptor(interceptor: (response: AxiosResponse) => AxiosResponse): void {
		this.responseInterceptors.push(interceptor);
	}

	/**
	 * Update authentication config
	 */
	updateAuth(authConfig: AuthConfig): void {
		this.authConfig = authConfig;
		this.client = this.createClient();
	}

	/**
	 * Sleep helper for retry logic
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
