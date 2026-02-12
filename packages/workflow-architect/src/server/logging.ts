/**
 * Request Logging Middleware
 * Structured logging for HTTP requests and application events
 */

import type { Request, Response, NextFunction } from 'express';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: Record<string, unknown>;
}

interface RequestLogEntry extends LogEntry {
  request: {
    method: string;
    url: string;
    path: string;
    query: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    ip: string;
    userAgent?: string;
  };
  response?: {
    statusCode: number;
    contentLength?: number;
    duration: number;
  };
}

/**
 * Logger class
 */
class Logger {
  private readonly serviceName: string;
  private readonly minLevel: LogLevel;
  private readonly enableColors: boolean;

  constructor(
    serviceName: string = 'workflow-architect',
    minLevel: LogLevel = LogLevel.INFO,
    enableColors: boolean = process.env.NODE_ENV !== 'production',
  ) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
    this.enableColors = enableColors;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const message = entry.message;
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

    // Color codes for console output
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      reset: '\x1b[0m',
    };

    if (this.enableColors && process.stdout.isTTY) {
      const color = colors[entry.level] || colors.reset;
      return `${color}[${timestamp}] [${level}] [${this.serviceName}]${colors.reset} ${message}${context}`;
    }

    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${context}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      context,
    };

    const formattedMessage = this.formatMessage(entry);

    // Output to appropriate stream
    if (level === LogLevel.ERROR) {
      console.error(formattedMessage);
    } else if (level === LogLevel.WARN) {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // TODO: Send to external logging service (e.g., DataDog, CloudWatch)
    // this.sendToExternalService(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };

    this.log(LogLevel.ERROR, message, errorContext);
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

/**
 * Get or create global logger
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Set custom logger
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Create a logger with custom configuration
 */
export function createLogger(
  serviceName?: string,
  minLevel?: LogLevel,
  enableColors?: boolean,
): Logger {
  return new Logger(serviceName, minLevel, enableColors);
}

/**
 * Sanitize sensitive data from logs
 */
function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

  sensitiveHeaders.forEach((header) => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Sanitize query parameters
 */
function sanitizeQuery(query: any): Record<string, unknown> {
  const sanitized = { ...query };
  const sensitiveParams = ['apiKey', 'api_key', 'token', 'password', 'secret'];

  sensitiveParams.forEach((param) => {
    if (sanitized[param]) {
      sanitized[param] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Express middleware for request logging
 */
export function loggingMiddleware(config?: {
  logger?: Logger;
  skipPaths?: string[];
  logBody?: boolean;
}) {
  const logger = config?.logger || getLogger();
  const skipPaths = config?.skipPaths || ['/health', '/metrics', '/liveness', '/readiness'];
  const logBody = config?.logBody || false;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip logging for specified paths
    if (skipPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();

    // Extract request information
    const requestInfo = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: sanitizeQuery(req.query),
      headers: sanitizeHeaders(req.headers as Record<string, string | string[]>),
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    };

    // Log request
    logger.info(`${req.method} ${req.path}`, {
      request: requestInfo,
      ...(logBody && req.body && { body: req.body }),
    });

    // Capture response
    const originalSend = res.send;
    res.send = function (data: any): Response {
      res.send = originalSend;
      return res.send(data);
    };

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const responseInfo = {
        statusCode: res.statusCode,
        contentLength: parseInt(res.getHeader('content-length')?.toString() || '0', 10),
        duration,
      };

      const level =
        res.statusCode >= 500
          ? LogLevel.ERROR
          : res.statusCode >= 400
          ? LogLevel.WARN
          : LogLevel.INFO;

      const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

      logger.log(level, message, {
        request: {
          method: req.method,
          path: req.path,
          ip: requestInfo.ip,
        },
        response: responseInfo,
      });
    });

    // Log errors
    res.on('error', (error: Error) => {
      logger.error(`Request error: ${req.method} ${req.path}`, error, {
        request: requestInfo,
      });
    });

    next();
  };
}

/**
 * Log request details (for debugging)
 */
export function logRequestDetails(req: Request, message?: string): void {
  const logger = getLogger();
  logger.debug(message || 'Request details', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: sanitizeHeaders(req.headers as Record<string, string | string[]>),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
}

/**
 * Log error with stack trace
 */
export function logError(error: Error, context?: Record<string, unknown>): void {
  const logger = getLogger();
  logger.error(error.message, error, context);
}

/**
 * Audit log for security-sensitive operations
 */
export function auditLog(action: string, userId: string, details?: Record<string, unknown>): void {
  const logger = getLogger();
  logger.info(`AUDIT: ${action}`, {
    audit: true,
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export { Logger };
export default loggingMiddleware;
