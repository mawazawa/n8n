import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'json' | 'common' | 'combined' | 'dev';

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	requestId: string;
	method: string;
	path: string;
	statusCode?: number;
	duration?: number;
	ip?: string;
	userAgent?: string;
	userId?: string;
	error?: string;
	[key: string]: unknown;
}

/**
 * Request logger with multiple format support
 * Supports JSON, Common Log Format, Combined Log Format, and Dev format
 */
export class RequestLogger {
	private level: LogLevel;
	private format: LogFormat;
	private accessLogs: LogEntry[] = [];
	private errorLogs: LogEntry[] = [];
	private maxLogs = 10000;

	constructor(level: LogLevel = 'info', format: LogFormat = 'json') {
		this.level = level;
		this.format = format;
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return (req: Request, res: Response, next: NextFunction): void => {
			// Generate request ID
			const requestId = uuidv4();
			(req as Request & { requestId?: string }).requestId = requestId;

			// Start timer
			const startTime = Date.now();

			// Capture response
			const originalSend = res.send.bind(res);
			res.send = ((body: unknown): Response => {
				const duration = Date.now() - startTime;

				// Log request
				this.logRequest(req, res, requestId, duration);

				return originalSend(body);
			}) as Response['send'];

			next();
		};
	}

	/**
	 * Log request
	 */
	private logRequest(
		req: Request,
		res: Response,
		requestId: string,
		duration: number,
	): void {
		const user = (req as Request & { user?: { id: string } }).user;
		const statusCode = res.statusCode;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: statusCode >= 400 ? 'error' : 'info',
			requestId,
			method: req.method,
			path: req.path,
			statusCode,
			duration,
			ip: this.getClientIp(req),
			userAgent: req.headers['user-agent'],
			userId: user?.id,
		};

		// Format and output log
		this.output(entry);

		// Store log
		if (statusCode >= 400) {
			this.errorLogs.push(entry);
			this.trimLogs(this.errorLogs);
		} else {
			this.accessLogs.push(entry);
			this.trimLogs(this.accessLogs);
		}
	}

	/**
	 * Log error
	 */
	logError(
		error: Error,
		req?: Request,
		additionalData?: Record<string, unknown>,
	): void {
		const requestId = (req as Request & { requestId?: string })?.requestId ?? uuidv4();

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'error',
			requestId,
			method: req?.method ?? 'UNKNOWN',
			path: req?.path ?? 'UNKNOWN',
			error: error.message,
			stack: error.stack,
			...additionalData,
		};

		this.output(entry);
		this.errorLogs.push(entry);
		this.trimLogs(this.errorLogs);
	}

	/**
	 * Log info message
	 */
	info(message: string, data?: Record<string, unknown>): void {
		if (this.shouldLog('info')) {
			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: 'info',
				requestId: uuidv4(),
				method: '',
				path: '',
				message,
				...data,
			};
			this.output(entry);
		}
	}

	/**
	 * Log warning message
	 */
	warn(message: string, data?: Record<string, unknown>): void {
		if (this.shouldLog('warn')) {
			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: 'warn',
				requestId: uuidv4(),
				method: '',
				path: '',
				message,
				...data,
			};
			this.output(entry);
		}
	}

	/**
	 * Log debug message
	 */
	debug(message: string, data?: Record<string, unknown>): void {
		if (this.shouldLog('debug')) {
			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: 'debug',
				requestId: uuidv4(),
				method: '',
				path: '',
				message,
				...data,
			};
			this.output(entry);
		}
	}

	/**
	 * Output log entry
	 */
	private output(entry: LogEntry): void {
		const formatted = this.formatLog(entry);
		console.log(formatted);
	}

	/**
	 * Format log entry
	 */
	private formatLog(entry: LogEntry): string {
		switch (this.format) {
			case 'json':
				return JSON.stringify(entry);

			case 'common':
				// Common Log Format: host ident authuser date request status bytes
				return `${entry.ip ?? '-'} - ${entry.userId ?? '-'} [${entry.timestamp}] "${entry.method} ${entry.path}" ${entry.statusCode ?? '-'} -`;

			case 'combined':
				// Combined Log Format: common + referer + user-agent
				return `${entry.ip ?? '-'} - ${entry.userId ?? '-'} [${entry.timestamp}] "${entry.method} ${entry.path}" ${entry.statusCode ?? '-'} - "-" "${entry.userAgent ?? '-'}"`;

			case 'dev':
				// Dev format: colored and concise
				const statusColor = this.getStatusColor(entry.statusCode ?? 0);
				const durationStr = entry.duration ? `${entry.duration}ms` : '';
				return `${entry.method} ${entry.path} ${statusColor}${entry.statusCode ?? '-'}\x1b[0m ${durationStr}`;

			default:
				return JSON.stringify(entry);
		}
	}

	/**
	 * Get status code color for dev format
	 */
	private getStatusColor(statusCode: number): string {
		if (statusCode >= 500) return '\x1b[31m'; // Red
		if (statusCode >= 400) return '\x1b[33m'; // Yellow
		if (statusCode >= 300) return '\x1b[36m'; // Cyan
		if (statusCode >= 200) return '\x1b[32m'; // Green
		return '\x1b[0m'; // Reset
	}

	/**
	 * Get client IP address
	 */
	private getClientIp(req: Request): string {
		const forwarded = req.headers['x-forwarded-for'] as string | undefined;
		if (forwarded) {
			return forwarded.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';
		}
		return req.socket.remoteAddress ?? 'unknown';
	}

	/**
	 * Check if log level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		const currentIndex = levels.indexOf(this.level);
		const messageIndex = levels.indexOf(level);
		return messageIndex >= currentIndex;
	}

	/**
	 * Trim logs to max size
	 */
	private trimLogs(logs: LogEntry[]): void {
		if (logs.length > this.maxLogs) {
			logs.splice(0, logs.length - this.maxLogs);
		}
	}

	/**
	 * Get access logs
	 */
	getAccessLogs(limit?: number): LogEntry[] {
		if (limit) {
			return this.accessLogs.slice(-limit);
		}
		return [...this.accessLogs];
	}

	/**
	 * Get error logs
	 */
	getErrorLogs(limit?: number): LogEntry[] {
		if (limit) {
			return this.errorLogs.slice(-limit);
		}
		return [...this.errorLogs];
	}

	/**
	 * Get logs by request ID
	 */
	getLogsByRequestId(requestId: string): LogEntry[] {
		return [...this.accessLogs, ...this.errorLogs].filter(
			(log) => log.requestId === requestId,
		);
	}

	/**
	 * Clear logs
	 */
	clearLogs(): void {
		this.accessLogs = [];
		this.errorLogs = [];
	}

	/**
	 * Set log level
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Set log format
	 */
	setFormat(format: LogFormat): void {
		this.format = format;
	}

	/**
	 * Set max logs
	 */
	setMaxLogs(max: number): void {
		this.maxLogs = max;
	}
}
