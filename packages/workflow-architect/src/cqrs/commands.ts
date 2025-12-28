import { z } from 'zod';
import type { Command, CommandHandler, Result } from './types';
import { CommandSchema } from './types';

/**
 * Command validation error
 */
export class CommandValidationError extends Error {
	constructor(
		public readonly commandType: string,
		public readonly validationErrors: z.ZodError,
	) {
		super(`Command validation failed for ${commandType}: ${validationErrors.message}`);
		this.name = 'CommandValidationError';
	}
}

/**
 * Command not registered error
 */
export class CommandNotRegisteredError extends Error {
	constructor(public readonly commandType: string) {
		super(`No handler registered for command type: ${commandType}`);
		this.name = 'CommandNotRegisteredError';
	}
}

/**
 * Command handler decorator metadata
 */
interface CommandHandlerMetadata {
	handler: CommandHandler;
	schema?: z.ZodSchema;
	middleware: CommandMiddleware[];
}

/**
 * Command middleware function
 */
export type CommandMiddleware = (
	command: Command,
	next: () => Promise<Result>,
) => Promise<Result>;

/**
 * Command bus options
 */
export interface CommandBusOptions {
	/** Enable command validation */
	validateCommands?: boolean;
	/** Global middleware */
	middleware?: CommandMiddleware[];
	/** Command timeout in milliseconds */
	timeout?: number;
}

/**
 * Command bus for dispatching commands to handlers
 * Supports validation, middleware, and async execution
 */
export class CommandBus {
	private handlers: Map<string, CommandHandlerMetadata> = new Map();
	private globalMiddleware: CommandMiddleware[] = [];
	private options: Required<CommandBusOptions>;

	constructor(options: CommandBusOptions = {}) {
		this.options = {
			validateCommands: options.validateCommands ?? true,
			middleware: options.middleware ?? [],
			timeout: options.timeout ?? 30000,
		};
		this.globalMiddleware = this.options.middleware;
	}

	/**
	 * Register a command handler
	 */
	register<TCommand extends Command = Command, TResult = unknown>(
		commandType: string,
		handler: CommandHandler<TCommand, TResult>,
		schema?: z.ZodSchema,
		middleware: CommandMiddleware[] = [],
	): void {
		if (this.handlers.has(commandType)) {
			throw new Error(`Handler already registered for command type: ${commandType}`);
		}

		this.handlers.set(commandType, {
			handler: handler as CommandHandler,
			schema,
			middleware,
		});
	}

	/**
	 * Unregister a command handler
	 */
	unregister(commandType: string): void {
		this.handlers.delete(commandType);
	}

	/**
	 * Check if a handler is registered
	 */
	isRegistered(commandType: string): boolean {
		return this.handlers.has(commandType);
	}

	/**
	 * Dispatch a command
	 */
	async dispatch<TResult = unknown>(command: Command): Promise<Result<TResult>> {
		// Validate command structure
		if (this.options.validateCommands) {
			try {
				CommandSchema.parse(command);
			} catch (error) {
				return {
					success: false,
					error: new CommandValidationError(command.type, error as z.ZodError),
				};
			}
		}

		// Get handler metadata
		const metadata = this.handlers.get(command.type);
		if (!metadata) {
			return {
				success: false,
				error: new CommandNotRegisteredError(command.type),
			};
		}

		// Validate command data with schema if provided
		if (metadata.schema) {
			try {
				metadata.schema.parse(command.data);
			} catch (error) {
				return {
					success: false,
					error: new CommandValidationError(command.type, error as z.ZodError),
				};
			}
		}

		// Build middleware chain
		const middlewareChain = [...this.globalMiddleware, ...metadata.middleware];

		// Execute with timeout
		try {
			const result = await this.executeWithTimeout(
				() => this.executeWithMiddleware(command, metadata.handler, middlewareChain),
				this.options.timeout,
			);
			return result;
		} catch (error) {
			return {
				success: false,
				error: error as Error,
			};
		}
	}

	/**
	 * Execute command with middleware chain
	 */
	private async executeWithMiddleware(
		command: Command,
		handler: CommandHandler,
		middleware: CommandMiddleware[],
	): Promise<Result> {
		let index = 0;

		const next = async (): Promise<Result> => {
			if (index < middleware.length) {
				const currentMiddleware = middleware[index];
				index++;
				return currentMiddleware(command, next);
			}

			// Execute the actual handler
			try {
				const data = await handler(command);
				return {
					success: true,
					data,
				};
			} catch (error) {
				return {
					success: false,
					error: error as Error,
				};
			}
		};

		return next();
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
				setTimeout(() => reject(new Error(`Command execution timeout after ${timeout}ms`)), timeout),
			),
		]);
	}

	/**
	 * Add global middleware
	 */
	use(middleware: CommandMiddleware): void {
		this.globalMiddleware.push(middleware);
	}

	/**
	 * Get all registered command types
	 */
	getRegisteredCommands(): string[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Clear all handlers
	 */
	clear(): void {
		this.handlers.clear();
	}
}

/**
 * Built-in middleware
 */

/**
 * Logging middleware
 */
export const loggingMiddleware =
	(logger: { info: (message: string, meta?: Record<string, unknown>) => void }): CommandMiddleware =>
	async (command, next) => {
		const startTime = Date.now();
		logger.info('Command dispatched', {
			type: command.type,
			aggregateId: command.aggregateId,
			metadata: command.metadata,
		});

		const result = await next();

		const duration = Date.now() - startTime;
		logger.info('Command completed', {
			type: command.type,
			aggregateId: command.aggregateId,
			success: result.success,
			duration,
		});

		return result;
	};

/**
 * Retry middleware
 */
export const retryMiddleware =
	(maxRetries: number = 3, retryDelay: number = 1000): CommandMiddleware =>
	async (command, next) => {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			const result = await next();

			if (result.success) {
				return result;
			}

			lastError = result.error;

			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
			}
		}

		return {
			success: false,
			error: lastError,
			metadata: {
				retries: maxRetries,
			},
		};
	};

/**
 * Idempotency middleware
 */
export const idempotencyMiddleware =
	(cache: Map<string, Result>): CommandMiddleware =>
	async (command, next) => {
		const commandId = command.metadata?.commandId;

		if (!commandId) {
			// No command ID, execute normally
			return next();
		}

		// Check cache
		const cachedResult = cache.get(commandId);
		if (cachedResult) {
			return {
				...cachedResult,
				metadata: {
					...cachedResult.metadata,
					fromCache: true,
				},
			};
		}

		// Execute and cache
		const result = await next();
		cache.set(commandId, result);

		return result;
	};

/**
 * Authorization middleware
 */
export const authorizationMiddleware =
	(
		authorizer: (
			userId: string | undefined,
			commandType: string,
			aggregateId: string,
		) => Promise<boolean>,
	): CommandMiddleware =>
	async (command, next) => {
		const userId = command.metadata?.userId;

		const isAuthorized = await authorizer(userId, command.type, command.aggregateId);

		if (!isAuthorized) {
			return {
				success: false,
				error: new Error(`User ${userId} not authorized to execute ${command.type}`),
			};
		}

		return next();
	};

/**
 * Metrics middleware
 */
export interface CommandMetrics {
	commandType: string;
	success: boolean;
	duration: number;
	timestamp: Date;
}

export const metricsMiddleware =
	(onMetrics: (metrics: CommandMetrics) => void): CommandMiddleware =>
	async (command, next) => {
		const startTime = Date.now();

		const result = await next();

		const metrics: CommandMetrics = {
			commandType: command.type,
			success: result.success,
			duration: Date.now() - startTime,
			timestamp: new Date(),
		};

		onMetrics(metrics);

		return result;
	};

/**
 * Command decorator for TypeScript classes
 */
export function CommandDecorator(commandType: string, schema?: z.ZodSchema) {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;

		descriptor.value = async function (this: { commandBus?: CommandBus }, command: Command) {
			if (!this.commandBus) {
				throw new Error('CommandBus not available');
			}

			// Register handler if not already registered
			if (!this.commandBus.isRegistered(commandType)) {
				this.commandBus.register(commandType, originalMethod.bind(this), schema);
			}

			return this.commandBus.dispatch(command);
		};

		return descriptor;
	};
}
