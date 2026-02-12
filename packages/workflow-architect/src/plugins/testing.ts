import type {
	Plugin,
	PluginTestContext,
	PluginExecutionContext,
	PluginStorage,
	PluginHttpClient,
	PluginEventEmitter,
	HookType,
	HookHandler,
} from './types';
import { PluginSandbox } from './sandbox';
import { HookManager } from './hooks';

/**
 * Mock plugin storage for testing
 */
export class MockPluginStorage implements PluginStorage {
	private data = new Map<string, unknown>();

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.data.get(key) as T | undefined;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		this.data.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
	}

	async list(prefix?: string): Promise<string[]> {
		const keys = Array.from(this.data.keys());
		if (!prefix) {
			return keys;
		}
		return keys.filter((k) => k.startsWith(prefix));
	}

	async clear(): Promise<void> {
		this.data.clear();
	}

	getData(): Map<string, unknown> {
		return this.data;
	}
}

/**
 * Mock HTTP client for testing
 */
export class MockHttpClient implements PluginHttpClient {
	private responses = new Map<string, unknown>();
	private requests: Array<{ method: string; url: string; data?: unknown }> = [];

	mockResponse(url: string, response: unknown): void {
		this.responses.set(url, response);
	}

	getRequests(): Array<{ method: string; url: string; data?: unknown }> {
		return this.requests;
	}

	clearRequests(): void {
		this.requests = [];
	}

	async get<T = unknown>(url: string): Promise<T> {
		this.requests.push({ method: 'GET', url });
		const response = this.responses.get(url);
		if (!response) {
			throw new Error(`No mock response for GET ${url}`);
		}
		return response as T;
	}

	async post<T = unknown>(url: string, data?: unknown): Promise<T> {
		this.requests.push({ method: 'POST', url, data });
		const response = this.responses.get(url);
		if (!response) {
			throw new Error(`No mock response for POST ${url}`);
		}
		return response as T;
	}

	async put<T = unknown>(url: string, data?: unknown): Promise<T> {
		this.requests.push({ method: 'PUT', url, data });
		const response = this.responses.get(url);
		if (!response) {
			throw new Error(`No mock response for PUT ${url}`);
		}
		return response as T;
	}

	async delete<T = unknown>(url: string): Promise<T> {
		this.requests.push({ method: 'DELETE', url });
		const response = this.responses.get(url);
		if (!response) {
			throw new Error(`No mock response for DELETE ${url}`);
		}
		return response as T;
	}
}

/**
 * Mock event emitter for testing
 */
export class MockEventEmitter implements PluginEventEmitter {
	private events = new Map<string, Array<(data?: unknown) => void>>();
	private emittedEvents: Array<{ event: string; data?: unknown }> = [];

	emit(event: string, data?: unknown): void {
		this.emittedEvents.push({ event, data });
		const handlers = this.events.get(event);
		if (handlers) {
			for (const handler of handlers) {
				handler(data);
			}
		}
	}

	on(event: string, handler: (data?: unknown) => void): () => void {
		let handlers = this.events.get(event);
		if (!handlers) {
			handlers = [];
			this.events.set(event, handlers);
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
		const handlers = this.events.get(event);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
		}
	}

	getEmittedEvents(): Array<{ event: string; data?: unknown }> {
		return this.emittedEvents;
	}

	clearEmittedEvents(): void {
		this.emittedEvents = [];
	}
}

/**
 * Plugin test runner
 */
export class PluginTestRunner {
	private sandbox: PluginSandbox;
	private hookManager: HookManager;

	constructor() {
		this.sandbox = new PluginSandbox();
		this.hookManager = new HookManager();
	}

	/**
	 * Create test context for a plugin
	 */
	createTestContext(plugin: Plugin): PluginTestContext {
		const mockStorage = new MockPluginStorage();
		const mockHttp = new MockHttpClient();
		const mockEvents = new MockEventEmitter();

		return {
			pluginId: plugin.manifest.id,
			mockAPI: {
				storage: mockStorage,
				http: mockHttp,
				events: mockEvents,
			},
			mockStorage,
			mockNetwork: true,
			hooks: new Map(),
		};
	}

	/**
	 * Execute plugin with test context
	 */
	async runTest<T = unknown>(
		plugin: Plugin,
		code: string,
		context?: Partial<PluginExecutionContext>,
	): Promise<{ success: boolean; data?: T; error?: string; executionTime: number }> {
		const executionContext: PluginExecutionContext = {
			pluginId: plugin.manifest.id,
			permissions: new Set(plugin.manifest.permissions),
			...context,
		};

		return this.sandbox.execute<T>(plugin, executionContext, code);
	}

	/**
	 * Assert hook was called
	 */
	assertHookCalled(hookType: HookType, pluginId: string): boolean {
		const subscriptions = this.hookManager.getSubscriptions(hookType);
		return subscriptions.some((s) => s.pluginId === pluginId);
	}

	/**
	 * Register test hook
	 */
	registerTestHook(hookType: HookType, pluginId: string, handler: HookHandler): void {
		this.hookManager.register(hookType, handler, { pluginId });
	}

	/**
	 * Trigger hook for testing
	 */
	async triggerTestHook<TContext = unknown, TResult = unknown>(
		hookType: HookType,
		context: TContext,
	): Promise<TResult[]> {
		return this.hookManager.trigger<TContext, TResult>(hookType, context);
	}

	/**
	 * Cleanup test resources
	 */
	async cleanup(): Promise<void> {
		await this.sandbox.terminateAll();
		this.hookManager.clear();
	}
}

/**
 * Test helpers
 */
export class TestHelpers {
	/**
	 * Create mock plugin
	 */
	static createMockPlugin(overrides?: Partial<Plugin>): Plugin {
		return {
			manifest: {
				id: 'test-plugin',
				name: 'Test Plugin',
				version: '1.0.0',
				description: 'Test plugin',
				author: { name: 'Test Author' },
				license: 'MIT',
				main: 'index.js',
				permissions: [],
				hooks: [],
				extensionPoints: [],
				dependencies: [],
				peerDependencies: [],
				resourceLimits: {
					maxMemoryMB: 100,
					maxCpuTimeMs: 5000,
					maxExecutionTimeMs: 30000,
					maxStorageMB: 50,
					maxNetworkRequests: 100,
				},
			},
			config: {
				enabled: true,
				settings: {},
			},
			state: 'active' as const,
			installedAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	/**
	 * Wait for condition
	 */
	static async waitFor(
		condition: () => boolean | Promise<boolean>,
		timeoutMs: number = 5000,
	): Promise<void> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			if (await condition()) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error('Timeout waiting for condition');
	}

	/**
	 * Assert eventually
	 */
	static async assertEventually(
		assertion: () => void | Promise<void>,
		timeoutMs: number = 5000,
	): Promise<void> {
		const startTime = Date.now();
		let lastError: Error | undefined;

		while (Date.now() - startTime < timeoutMs) {
			try {
				await assertion();
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		throw lastError || new Error('Assertion failed');
	}
}

/**
 * Integration test helper
 */
export class IntegrationTestHelper {
	private runner: PluginTestRunner;
	private testData = new Map<string, unknown>();

	constructor() {
		this.runner = new PluginTestRunner();
	}

	/**
	 * Setup test environment
	 */
	async setup(): Promise<void> {
		// Initialize test environment
	}

	/**
	 * Teardown test environment
	 */
	async teardown(): Promise<void> {
		await this.runner.cleanup();
		this.testData.clear();
	}

	/**
	 * Set test data
	 */
	setTestData(key: string, value: unknown): void {
		this.testData.set(key, value);
	}

	/**
	 * Get test data
	 */
	getTestData(key: string): unknown {
		return this.testData.get(key);
	}

	/**
	 * Get test runner
	 */
	getRunner(): PluginTestRunner {
		return this.runner;
	}
}
