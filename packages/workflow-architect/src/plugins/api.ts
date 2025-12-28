import type {
	PluginPermission,
	PluginStorage,
	PluginHttpClient,
	PluginEventEmitter,
	PluginExecutionContext,
} from './types';
import { PermissionManager } from './permissions';

/**
 * Plugin API - Safe API surface exposed to plugins
 */
export class PluginAPI {
	private permissionManager: PermissionManager;
	private storage: PluginStorage;
	private httpClient: PluginHttpClient;
	private events: PluginEventEmitter;

	constructor(
		private context: PluginExecutionContext,
		dependencies: {
			permissionManager: PermissionManager;
			storage: PluginStorage;
			httpClient: PluginHttpClient;
			events: PluginEventEmitter;
		},
	) {
		this.permissionManager = dependencies.permissionManager;
		this.storage = dependencies.storage;
		this.httpClient = dependencies.httpClient;
		this.events = dependencies.events;
	}

	/**
	 * Get plugin context information
	 */
	getContext(): {
		pluginId: string;
		userId?: string;
		workflowId?: string;
		executionId?: string;
	} {
		return {
			pluginId: this.context.pluginId,
			userId: this.context.userId,
			workflowId: this.context.workflowId,
			executionId: this.context.executionId,
		};
	}

	/**
	 * Storage API - requires STORAGE permission
	 */
	get storageAPI(): {
		get: <T>(key: string) => Promise<T | undefined>;
		set: <T>(key: string, value: T) => Promise<void>;
		delete: (key: string) => Promise<void>;
		list: (prefix?: string) => Promise<string[]>;
		clear: () => Promise<void>;
	} {
		const checkPermission = () => {
			if (!this.hasPermission(PluginPermission.STORAGE)) {
				throw new Error('Plugin does not have STORAGE permission');
			}
		};

		return {
			get: async <T>(key: string) => {
				checkPermission();
				return this.storage.get<T>(`${this.context.pluginId}:${key}`);
			},
			set: async <T>(key: string, value: T) => {
				checkPermission();
				return this.storage.set(`${this.context.pluginId}:${key}`, value);
			},
			delete: async (key: string) => {
				checkPermission();
				return this.storage.delete(`${this.context.pluginId}:${key}`);
			},
			list: async (prefix?: string) => {
				checkPermission();
				const fullPrefix = `${this.context.pluginId}:${prefix || ''}`;
				const keys = await this.storage.list(fullPrefix);
				return keys.map((k) => k.replace(`${this.context.pluginId}:`, ''));
			},
			clear: async () => {
				checkPermission();
				const keys = await this.storage.list(`${this.context.pluginId}:`);
				await Promise.all(keys.map((key) => this.storage.delete(key)));
			},
		};
	}

	/**
	 * HTTP API - requires NETWORK permission
	 */
	get httpAPI(): {
		get: <T>(url: string, options?: RequestInit) => Promise<T>;
		post: <T>(url: string, data?: unknown, options?: RequestInit) => Promise<T>;
		put: <T>(url: string, data?: unknown, options?: RequestInit) => Promise<T>;
		delete: <T>(url: string, options?: RequestInit) => Promise<T>;
	} {
		const checkPermission = () => {
			if (!this.hasPermission(PluginPermission.NETWORK)) {
				throw new Error('Plugin does not have NETWORK permission');
			}
		};

		return {
			get: async <T>(url: string, options?: RequestInit) => {
				checkPermission();
				return this.httpClient.get<T>(url, options);
			},
			post: async <T>(url: string, data?: unknown, options?: RequestInit) => {
				checkPermission();
				return this.httpClient.post<T>(url, data, options);
			},
			put: async <T>(url: string, data?: unknown, options?: RequestInit) => {
				checkPermission();
				return this.httpClient.put<T>(url, data, options);
			},
			delete: async <T>(url: string, options?: RequestInit) => {
				checkPermission();
				return this.httpClient.delete<T>(url, options);
			},
		};
	}

	/**
	 * Event API - no permission required
	 */
	get eventAPI(): {
		emit: (event: string, data?: unknown) => void;
		on: (event: string, handler: (data?: unknown) => void) => () => void;
		once: (event: string, handler: (data?: unknown) => void) => () => void;
		off: (event: string, handler: (data?: unknown) => void) => void;
	} {
		const namespaced = (event: string) => `plugin:${this.context.pluginId}:${event}`;

		return {
			emit: (event: string, data?: unknown) => {
				this.events.emit(namespaced(event), data);
			},
			on: (event: string, handler: (data?: unknown) => void) => {
				this.events.on(namespaced(event), handler);
				return () => this.events.off(namespaced(event), handler);
			},
			once: (event: string, handler: (data?: unknown) => void) => {
				this.events.once(namespaced(event), handler);
				return () => this.events.off(namespaced(event), handler);
			},
			off: (event: string, handler: (data?: unknown) => void) => {
				this.events.off(namespaced(event), handler);
			},
		};
	}

	/**
	 * Workflow API - requires WORKFLOWS permission
	 */
	get workflowAPI(): {
		get: (workflowId: string) => Promise<unknown>;
		list: () => Promise<unknown[]>;
		execute: (workflowId: string, data?: unknown) => Promise<unknown>;
	} {
		const checkPermission = () => {
			if (!this.hasPermission(PluginPermission.WORKFLOWS)) {
				throw new Error('Plugin does not have WORKFLOWS permission');
			}
		};

		return {
			get: async (workflowId: string) => {
				checkPermission();
				// Implementation would integrate with n8n workflow system
				throw new Error('Not implemented');
			},
			list: async () => {
				checkPermission();
				throw new Error('Not implemented');
			},
			execute: async (workflowId: string, data?: unknown) => {
				checkPermission();
				throw new Error('Not implemented');
			},
		};
	}

	/**
	 * Execution API - requires EXECUTIONS permission
	 */
	get executionAPI(): {
		get: (executionId: string) => Promise<unknown>;
		list: (workflowId?: string) => Promise<unknown[]>;
		retry: (executionId: string) => Promise<unknown>;
	} {
		const checkPermission = () => {
			if (!this.hasPermission(PluginPermission.EXECUTIONS)) {
				throw new Error('Plugin does not have EXECUTIONS permission');
			}
		};

		return {
			get: async (executionId: string) => {
				checkPermission();
				throw new Error('Not implemented');
			},
			list: async (workflowId?: string) => {
				checkPermission();
				throw new Error('Not implemented');
			},
			retry: async (executionId: string) => {
				checkPermission();
				throw new Error('Not implemented');
			},
		};
	}

	/**
	 * Logging API - no permission required
	 */
	get logger(): {
		debug: (...args: unknown[]) => void;
		info: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	} {
		const prefix = `[Plugin:${this.context.pluginId}]`;

		return {
			debug: (...args: unknown[]) => console.debug(prefix, ...args),
			info: (...args: unknown[]) => console.info(prefix, ...args),
			warn: (...args: unknown[]) => console.warn(prefix, ...args),
			error: (...args: unknown[]) => console.error(prefix, ...args),
		};
	}

	/**
	 * Check if plugin has permission
	 */
	hasPermission(permission: PluginPermission): boolean {
		return this.context.permissions.has(permission);
	}

	/**
	 * Request permission at runtime
	 */
	async requestPermission(permission: PluginPermission): Promise<boolean> {
		const granted = await this.permissionManager.requestPermission(
			this.context.pluginId,
			permission,
		);

		if (granted) {
			this.context.permissions.add(permission);
		}

		return granted;
	}

	/**
	 * Get all granted permissions
	 */
	getPermissions(): PluginPermission[] {
		return Array.from(this.context.permissions);
	}
}

/**
 * In-memory plugin storage implementation
 */
export class InMemoryPluginStorage implements PluginStorage {
	private storage = new Map<string, unknown>();

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.storage.get(key) as T | undefined;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		this.storage.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.storage.delete(key);
	}

	async list(prefix?: string): Promise<string[]> {
		const keys = Array.from(this.storage.keys());
		if (!prefix) {
			return keys;
		}
		return keys.filter((k) => k.startsWith(prefix));
	}

	async clear(): Promise<void> {
		this.storage.clear();
	}
}

/**
 * Proxied HTTP client with safety checks
 */
export class ProxiedHttpClient implements PluginHttpClient {
	private requestCount = 0;
	private maxRequests: number;

	constructor(maxRequests: number = 100) {
		this.maxRequests = maxRequests;
	}

	async get<T = unknown>(url: string, options?: RequestInit): Promise<T> {
		this.checkLimit();
		const response = await fetch(url, { ...options, method: 'GET' });
		return this.handleResponse<T>(response);
	}

	async post<T = unknown>(url: string, data?: unknown, options?: RequestInit): Promise<T> {
		this.checkLimit();
		const response = await fetch(url, {
			...options,
			method: 'POST',
			body: data ? JSON.stringify(data) : undefined,
			headers: {
				'Content-Type': 'application/json',
				...options?.headers,
			},
		});
		return this.handleResponse<T>(response);
	}

	async put<T = unknown>(url: string, data?: unknown, options?: RequestInit): Promise<T> {
		this.checkLimit();
		const response = await fetch(url, {
			...options,
			method: 'PUT',
			body: data ? JSON.stringify(data) : undefined,
			headers: {
				'Content-Type': 'application/json',
				...options?.headers,
			},
		});
		return this.handleResponse<T>(response);
	}

	async delete<T = unknown>(url: string, options?: RequestInit): Promise<T> {
		this.checkLimit();
		const response = await fetch(url, { ...options, method: 'DELETE' });
		return this.handleResponse<T>(response);
	}

	private checkLimit(): void {
		this.requestCount++;
		if (this.requestCount > this.maxRequests) {
			throw new Error(`HTTP request limit exceeded: ${this.maxRequests}`);
		}
	}

	private async handleResponse<T>(response: Response): Promise<T> {
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		return response.json() as Promise<T>;
	}

	resetCounter(): void {
		this.requestCount = 0;
	}
}

/**
 * Simple event emitter for plugins
 */
export class SimpleEventEmitter implements PluginEventEmitter {
	private listeners = new Map<string, Array<(data?: unknown) => void>>();

	emit(event: string, data?: unknown): void {
		const handlers = this.listeners.get(event);
		if (handlers) {
			for (const handler of handlers) {
				try {
					handler(data);
				} catch (error) {
					console.error(`Event handler error for ${event}:`, error);
				}
			}
		}
	}

	on(event: string, handler: (data?: unknown) => void): () => void {
		let handlers = this.listeners.get(event);
		if (!handlers) {
			handlers = [];
			this.listeners.set(event, handlers);
		}
		handlers.push(handler);

		return () => this.off(event, handler);
	}

	once(event: string, handler: (data?: unknown) => void): () => void {
		const wrappedHandler = (data?: unknown) => {
			handler(data);
			this.off(event, wrappedHandler);
		};
		return this.on(event, wrappedHandler);
	}

	off(event: string, handler: (data?: unknown) => void): void {
		const handlers = this.listeners.get(event);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
			if (handlers.length === 0) {
				this.listeners.delete(event);
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}
