import { randomBytes } from 'node:crypto';
import type { LogEntry, LogLevel, LogContext, TraceContext } from './types';
import { LogLevelSchema, LogEntrySchema } from './types';

// ============================================================================
// Log Level Utilities
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

// ============================================================================
// Logger
// ============================================================================

export interface LoggerOptions {
	serviceName: string;
	minLevel?: LogLevel;
	enableTraceCorrelation?: boolean;
	contextInjector?: () => LogContext;
}

export class Logger {
	private serviceName: string;
	private minLevel: LogLevel;
	private enableTraceCorrelation: boolean;
	private contextInjector?: () => LogContext;
	private handlers: Array<(entry: LogEntry) => void | Promise<void>> = [];

	constructor(options: LoggerOptions) {
		this.serviceName = options.serviceName;
		this.minLevel = options.minLevel ?? 'info';
		this.enableTraceCorrelation = options.enableTraceCorrelation ?? true;
		this.contextInjector = options.contextInjector;
	}

	/**
	 * Add a log handler
	 */
	addHandler(handler: (entry: LogEntry) => void | Promise<void>): void {
		this.handlers.push(handler);
	}

	/**
	 * Set minimum log level
	 */
	setMinLevel(level: LogLevel): void {
		LogLevelSchema.parse(level);
		this.minLevel = level;
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, context: LogContext = {}): void {
		this.log('debug', message, context);
	}

	/**
	 * Log an info message
	 */
	info(message: string, context: LogContext = {}): void {
		this.log('info', message, context);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, context: LogContext = {}): void {
		this.log('warn', message, context);
	}

	/**
	 * Log an error message
	 */
	error(message: string, context: LogContext = {}, error?: Error): void {
		const errorContext = error ? {
			...context,
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
		} : context;

		this.log('error', message, errorContext);
	}

	/**
	 * Log a fatal message
	 */
	fatal(message: string, context: LogContext = {}, error?: Error): void {
		const errorContext = error ? {
			...context,
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
		} : context;

		this.log('fatal', message, errorContext);
	}

	/**
	 * Create a child logger with additional context
	 */
	child(context: LogContext): Logger {
		const childLogger = new Logger({
			serviceName: this.serviceName,
			minLevel: this.minLevel,
			enableTraceCorrelation: this.enableTraceCorrelation,
			contextInjector: () => ({
				...(this.contextInjector?.() ?? {}),
				...context,
			}),
		});

		// Copy handlers
		this.handlers.forEach(h => childLogger.addHandler(h));

		return childLogger;
	}

	/**
	 * Core logging method
	 */
	private log(level: LogLevel, message: string, context: LogContext): void {
		// Check if we should log this level
		if (!shouldLog(level, this.minLevel)) {
			return;
		}

		// Build log entry
		const entry: LogEntry = {
			id: this.generateLogId(),
			timestamp: Date.now(),
			level,
			message,
			context: {
				...(this.contextInjector?.() ?? {}),
				...context,
			},
			serviceName: this.serviceName,
		};

		// Add trace correlation if enabled
		if (this.enableTraceCorrelation) {
			const traceContext = this.getTraceContext();
			if (traceContext) {
				entry.traceId = traceContext.traceId;
				entry.spanId = traceContext.spanId;
			}
		}

		// Validate entry
		try {
			LogEntrySchema.parse(entry);
		} catch (err) {
			console.error('Invalid log entry:', err);
			return;
		}

		// Send to handlers
		for (const handler of this.handlers) {
			try {
				void handler(entry);
			} catch (err) {
				console.error('Log handler error:', err);
			}
		}
	}

	/**
	 * Get current trace context (if available)
	 */
	private getTraceContext(): TraceContext | null {
		// Try to get from global context (would be set by tracer)
		try {
			// This would integrate with the Tracer's ContextManager
			const { ContextManager } = require('./tracer');
			const ctx = ContextManager.getActiveContext();
			if (ctx) {
				return {
					traceId: ctx.traceId,
					spanId: ctx.spanId,
					traceFlags: 1,
				};
			}
		} catch {
			// Tracer not available
		}
		return null;
	}

	/**
	 * Generate unique log ID
	 */
	private generateLogId(): string {
		return randomBytes(8).toString('hex');
	}
}

// ============================================================================
// Console Handler
// ============================================================================

export class ConsoleHandler {
	private colorize: boolean;

	constructor(colorize = true) {
		this.colorize = colorize && typeof process !== 'undefined' && process.stdout?.isTTY;
	}

	handle(entry: LogEntry): void {
		const timestamp = new Date(entry.timestamp).toISOString();
		const level = this.formatLevel(entry.level);
		const message = entry.message;
		const context = this.formatContext(entry);

		console.log(`${timestamp} ${level} ${message}${context}`);
	}

	private formatLevel(level: LogLevel): string {
		if (!this.colorize) {
			return `[${level.toUpperCase()}]`;
		}

		const colors: Record<LogLevel, string> = {
			debug: '\x1b[36m', // cyan
			info: '\x1b[32m',  // green
			warn: '\x1b[33m',  // yellow
			error: '\x1b[31m', // red
			fatal: '\x1b[35m', // magenta
		};

		const color = colors[level];
		const reset = '\x1b[0m';
		return `${color}[${level.toUpperCase()}]${reset}`;
	}

	private formatContext(entry: LogEntry): string {
		const parts: string[] = [];

		// Add trace ID
		if (entry.traceId) {
			parts.push(`traceId=${entry.traceId}`);
		}

		// Add span ID
		if (entry.spanId) {
			parts.push(`spanId=${entry.spanId}`);
		}

		// Add context fields
		const contextEntries = Object.entries(entry.context)
			.filter(([key]) => key !== 'error')
			.map(([key, value]) => `${key}=${JSON.stringify(value)}`);

		parts.push(...contextEntries);

		// Add error
		if (entry.error) {
			parts.push(`error=${entry.error.name}: ${entry.error.message}`);
		}

		return parts.length > 0 ? ` | ${parts.join(' ')}` : '';
	}
}

// ============================================================================
// JSON Handler
// ============================================================================

export class JSONHandler {
	handle(entry: LogEntry): void {
		console.log(JSON.stringify(entry));
	}
}

// ============================================================================
// Buffer Handler
// ============================================================================

export class BufferHandler {
	private buffer: LogEntry[] = [];
	private maxSize: number;

	constructor(maxSize = 1000) {
		this.maxSize = maxSize;
	}

	handle(entry: LogEntry): void {
		this.buffer.push(entry);

		// Limit buffer size
		if (this.buffer.length > this.maxSize) {
			this.buffer.shift();
		}
	}

	getBuffer(): LogEntry[] {
		return [...this.buffer];
	}

	clear(): void {
		this.buffer = [];
	}

	size(): number {
		return this.buffer.length;
	}
}

// ============================================================================
// Batch Handler
// ============================================================================

export class BatchHandler {
	private buffer: LogEntry[] = [];
	private batchSize: number;
	private flushInterval: number;
	private flushFn: (entries: LogEntry[]) => Promise<void>;
	private timer: NodeJS.Timeout | null = null;

	constructor(
		flushFn: (entries: LogEntry[]) => Promise<void>,
		batchSize = 100,
		flushInterval = 5000,
	) {
		this.flushFn = flushFn;
		this.batchSize = batchSize;
		this.flushInterval = flushInterval;
	}

	handle(entry: LogEntry): void {
		this.buffer.push(entry);

		// Flush if batch size reached
		if (this.buffer.length >= this.batchSize) {
			void this.flush();
			return;
		}

		// Schedule flush
		if (!this.timer) {
			this.timer = setTimeout(() => {
				void this.flush();
			}, this.flushInterval);
		}
	}

	async flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if (this.buffer.length === 0) return;

		const entries = [...this.buffer];
		this.buffer = [];

		try {
			await this.flushFn(entries);
		} catch (err) {
			console.error('Failed to flush logs:', err);
			// Put entries back
			this.buffer.unshift(...entries);
		}
	}

	async shutdown(): Promise<void> {
		await this.flush();
	}
}

// ============================================================================
// Global Logger Instance
// ============================================================================

let globalLogger: Logger | null = null;

export function initLogger(options: LoggerOptions): Logger {
	globalLogger = new Logger(options);

	// Add default console handler
	globalLogger.addHandler(new ConsoleHandler().handle.bind(new ConsoleHandler()));

	return globalLogger;
}

export function getLogger(): Logger {
	if (!globalLogger) {
		// Create default logger
		globalLogger = new Logger({
			serviceName: 'default',
			minLevel: 'info',
		});
		globalLogger.addHandler(new ConsoleHandler().handle.bind(new ConsoleHandler()));
	}
	return globalLogger;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function debug(message: string, context?: LogContext): void {
	getLogger().debug(message, context);
}

export function info(message: string, context?: LogContext): void {
	getLogger().info(message, context);
}

export function warn(message: string, context?: LogContext): void {
	getLogger().warn(message, context);
}

export function error(message: string, context?: LogContext, err?: Error): void {
	getLogger().error(message, context, err);
}

export function fatal(message: string, context?: LogContext, err?: Error): void {
	getLogger().fatal(message, context, err);
}
