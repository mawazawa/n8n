import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { HookType, HookHandler, HookSubscription } from './types';

/**
 * Hook manager for plugin lifecycle events
 */
export class HookManager extends EventEmitter {
	private hooks = new Map<HookType, Map<string, HookSubscription>>();
	private executionQueue = new Map<HookType, Promise<void>>();

	constructor() {
		super();
		this.setMaxListeners(100); // Allow many plugin subscriptions
	}

	/**
	 * Register a hook handler
	 */
	register<TContext = unknown, TResult = unknown>(
		hookType: HookType,
		handler: HookHandler<TContext, TResult>,
		options: {
			pluginId: string;
			priority?: number;
			once?: boolean;
		},
	): HookSubscription {
		const subscription: HookSubscription = {
			id: uuidv4(),
			pluginId: options.pluginId,
			hookType,
			handler: handler as HookHandler,
			priority: options.priority || 0,
			once: options.once || false,
		};

		// Get or create hook map
		let hookMap = this.hooks.get(hookType);
		if (!hookMap) {
			hookMap = new Map();
			this.hooks.set(hookType, hookMap);
		}

		// Add subscription
		hookMap.set(subscription.id, subscription);

		// Sort by priority
		this.sortHooks(hookType);

		return subscription;
	}

	/**
	 * Unregister a hook handler
	 */
	unregister(subscriptionId: string): boolean {
		for (const [hookType, hookMap] of this.hooks.entries()) {
			if (hookMap.has(subscriptionId)) {
				hookMap.delete(subscriptionId);
				if (hookMap.size === 0) {
					this.hooks.delete(hookType);
				}
				return true;
			}
		}
		return false;
	}

	/**
	 * Unregister all hooks for a plugin
	 */
	unregisterPlugin(pluginId: string): number {
		let count = 0;

		for (const [hookType, hookMap] of this.hooks.entries()) {
			const toRemove: string[] = [];

			for (const [id, subscription] of hookMap.entries()) {
				if (subscription.pluginId === pluginId) {
					toRemove.push(id);
				}
			}

			for (const id of toRemove) {
				hookMap.delete(id);
				count++;
			}

			if (hookMap.size === 0) {
				this.hooks.delete(hookType);
			}
		}

		return count;
	}

	/**
	 * Trigger a hook and execute all handlers
	 */
	async trigger<TContext = unknown, TResult = unknown>(
		hookType: HookType,
		context: TContext,
	): Promise<TResult[]> {
		const hookMap = this.hooks.get(hookType);
		if (!hookMap || hookMap.size === 0) {
			return [];
		}

		// Get all subscriptions
		const subscriptions = Array.from(hookMap.values());

		// Execute handlers in priority order
		const results: TResult[] = [];
		const toRemove: string[] = [];

		for (const subscription of subscriptions) {
			try {
				const result = await subscription.handler(context);
				results.push(result as TResult);

				// Remove if one-time handler
				if (subscription.once) {
					toRemove.push(subscription.id);
				}

				// Emit event
				this.emit('hook:executed', {
					hookType,
					subscriptionId: subscription.id,
					pluginId: subscription.pluginId,
					success: true,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit error event
				this.emit('hook:error', {
					hookType,
					subscriptionId: subscription.id,
					pluginId: subscription.pluginId,
					error: message,
				});

				// Continue execution even if one handler fails
				console.error(
					`Hook ${hookType} handler failed for plugin ${subscription.pluginId}:`,
					message,
				);
			}
		}

		// Remove one-time handlers
		for (const id of toRemove) {
			hookMap.delete(id);
		}

		return results;
	}

	/**
	 * Trigger hook with timeout
	 */
	async triggerWithTimeout<TContext = unknown, TResult = unknown>(
		hookType: HookType,
		context: TContext,
		timeoutMs: number,
	): Promise<TResult[]> {
		return Promise.race([
			this.trigger<TContext, TResult>(hookType, context),
			new Promise<TResult[]>((_, reject) =>
				setTimeout(() => reject(new Error(`Hook ${hookType} execution timeout`)), timeoutMs),
			),
		]);
	}

	/**
	 * Trigger hook sequentially (wait for each handler to complete)
	 */
	async triggerSequential<TContext = unknown, TResult = unknown>(
		hookType: HookType,
		context: TContext,
	): Promise<TResult[]> {
		// Wait for any pending execution
		const pending = this.executionQueue.get(hookType);
		if (pending) {
			await pending;
		}

		// Create new execution promise
		const execution = this.trigger<TContext, TResult>(hookType, context);
		this.executionQueue.set(hookType, execution as Promise<void>);

		try {
			const results = await execution;
			return results;
		} finally {
			this.executionQueue.delete(hookType);
		}
	}

	/**
	 * Get all subscriptions for a hook type
	 */
	getSubscriptions(hookType: HookType): HookSubscription[] {
		const hookMap = this.hooks.get(hookType);
		if (!hookMap) {
			return [];
		}
		return Array.from(hookMap.values());
	}

	/**
	 * Get all subscriptions for a plugin
	 */
	getPluginSubscriptions(pluginId: string): HookSubscription[] {
		const subscriptions: HookSubscription[] = [];

		for (const hookMap of this.hooks.values()) {
			for (const subscription of hookMap.values()) {
				if (subscription.pluginId === pluginId) {
					subscriptions.push(subscription);
				}
			}
		}

		return subscriptions;
	}

	/**
	 * Check if hook has subscribers
	 */
	hasSubscribers(hookType: HookType): boolean {
		const hookMap = this.hooks.get(hookType);
		return hookMap ? hookMap.size > 0 : false;
	}

	/**
	 * Get subscriber count for a hook
	 */
	getSubscriberCount(hookType: HookType): number {
		const hookMap = this.hooks.get(hookType);
		return hookMap ? hookMap.size : 0;
	}

	/**
	 * Clear all hooks
	 */
	clear(): void {
		this.hooks.clear();
		this.executionQueue.clear();
		this.removeAllListeners();
	}

	/**
	 * Sort hooks by priority (higher priority first)
	 */
	private sortHooks(hookType: HookType): void {
		const hookMap = this.hooks.get(hookType);
		if (!hookMap) {
			return;
		}

		const sorted = Array.from(hookMap.entries()).sort(
			([, a], [, b]) => b.priority - a.priority,
		);

		this.hooks.set(hookType, new Map(sorted));
	}

	/**
	 * Get hook statistics
	 */
	getStatistics(): {
		totalHooks: number;
		hookTypes: number;
		byType: Record<string, number>;
		byPlugin: Record<string, number>;
	} {
		let totalHooks = 0;
		const byType: Record<string, number> = {};
		const byPlugin: Record<string, number> = {};

		for (const [hookType, hookMap] of this.hooks.entries()) {
			const count = hookMap.size;
			totalHooks += count;
			byType[hookType] = count;

			for (const subscription of hookMap.values()) {
				byPlugin[subscription.pluginId] = (byPlugin[subscription.pluginId] || 0) + 1;
			}
		}

		return {
			totalHooks,
			hookTypes: this.hooks.size,
			byType,
			byPlugin,
		};
	}
}

/**
 * Hook middleware for request/response transformation
 */
export class HookMiddleware {
	constructor(private hookManager: HookManager) {}

	/**
	 * Execute before hooks and return transformed context
	 */
	async executeBefore<TContext>(hookType: HookType, context: TContext): Promise<TContext> {
		if (!this.hookManager.hasSubscribers(hookType)) {
			return context;
		}

		const results = await this.hookManager.trigger<TContext, Partial<TContext>>(
			hookType,
			context,
		);

		// Merge all transformations
		let transformed = context;
		for (const result of results) {
			if (result) {
				transformed = { ...transformed, ...result };
			}
		}

		return transformed;
	}

	/**
	 * Execute after hooks and return transformed result
	 */
	async executeAfter<TResult>(hookType: HookType, result: TResult): Promise<TResult> {
		if (!this.hookManager.hasSubscribers(hookType)) {
			return result;
		}

		const results = await this.hookManager.trigger<TResult, Partial<TResult>>(hookType, result);

		// Merge all transformations
		let transformed = result;
		for (const hookResult of results) {
			if (hookResult) {
				transformed = { ...transformed, ...hookResult };
			}
		}

		return transformed;
	}

	/**
	 * Execute error hooks
	 */
	async executeError(hookType: HookType, error: Error): Promise<Error> {
		if (!this.hookManager.hasSubscribers(hookType)) {
			return error;
		}

		const results = await this.hookManager.trigger<Error, Error>(hookType, error);

		// Return last transformed error or original
		return results.length > 0 ? results[results.length - 1] : error;
	}
}

/**
 * Hook decorator for methods
 */
export function WithHooks(beforeHook?: HookType, afterHook?: HookType, errorHook?: HookType) {
	return function (
		target: unknown,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor {
		const originalMethod = descriptor.value;

		descriptor.value = async function (this: { hookManager?: HookManager }, ...args: unknown[]) {
			const hookManager = this.hookManager;
			if (!hookManager) {
				return originalMethod.apply(this, args);
			}

			try {
				// Execute before hooks
				let context = { method: propertyKey, args };
				if (beforeHook) {
					context = await new HookMiddleware(hookManager).executeBefore(beforeHook, context);
				}

				// Execute original method
				let result = await originalMethod.apply(this, context.args);

				// Execute after hooks
				if (afterHook) {
					result = await new HookMiddleware(hookManager).executeAfter(afterHook, result);
				}

				return result;
			} catch (error) {
				// Execute error hooks
				if (errorHook && error instanceof Error) {
					const transformedError = await new HookMiddleware(hookManager).executeError(
						errorHook,
						error,
					);
					throw transformedError;
				}
				throw error;
			}
		};

		return descriptor;
	};
}
