/**
 * Audit Middleware
 * Express middleware for automatic audit logging of HTTP requests
 */

import type { Request, Response, NextFunction } from 'express';
import { AuditLogger } from './logger.js';
import type { Actor, AuditEventType, AuditSeverity } from './types.js';

export interface AuditMiddlewareOptions {
  logger: AuditLogger;
  captureEventTypes?: AuditEventType[];
  skipPatterns?: RegExp[];
  extractUser?: (req: Request) => Actor | null;
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
  sensitiveFields?: string[];
  logSuccessOnly?: boolean;
  customEventType?: (req: Request) => AuditEventType | null;
}

interface AuditMetadata {
  startTime: number;
  requestId: string;
}

// Default paths to skip (health checks, static assets, etc.)
const DEFAULT_SKIP_PATTERNS = [
  /^\/health$/,
  /^\/ping$/,
  /^\/metrics$/,
  /^\/favicon\.ico$/,
  /^\/static\//,
  /^\/assets\//,
];

// Map HTTP methods to event types
function getEventTypeFromRequest(req: Request): AuditEventType | null {
  const method = req.method.toLowerCase();
  const path = req.path;

  // API requests
  if (path.startsWith('/api/')) {
    if (method === 'get') {
      return 'api.request' as AuditEventType;
    }
    if (method === 'post' || method === 'put' || method === 'patch') {
      return 'api.request' as AuditEventType;
    }
    if (method === 'delete') {
      return 'api.request' as AuditEventType;
    }
  }

  // Workflow operations
  if (path.includes('/workflows')) {
    if (method === 'post') return 'workflow.create' as AuditEventType;
    if (method === 'put' || method === 'patch') return 'workflow.update' as AuditEventType;
    if (method === 'delete') return 'workflow.delete' as AuditEventType;
  }

  // Authentication
  if (path.includes('/login')) return 'user.login' as AuditEventType;
  if (path.includes('/logout')) return 'user.logout' as AuditEventType;

  // Default to API request
  return 'api.request' as AuditEventType;
}

// Determine severity based on response status
function getSeverityFromStatus(statusCode: number): AuditSeverity {
  if (statusCode >= 500) return 'critical';
  if (statusCode >= 400) return 'error';
  if (statusCode >= 300) return 'warning';
  return 'info';
}

// Extract user from request (default implementation)
function defaultExtractUser(req: Request): Actor | null {
  // Try to get user from various common locations
  const user = (req as Request & { user?: { id?: string; email?: string; name?: string } }).user;

  if (user?.id) {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.get('user-agent'),
      sessionId: (req as Request & { sessionID?: string }).sessionID,
    };
  }

  // Try JWT token
  const authHeader = req.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      // Simple JWT decode (not verifying, just extracting)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.sub || payload.userId) {
        return {
          userId: payload.sub ?? payload.userId,
          email: payload.email,
          name: payload.name,
          ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
          userAgent: req.get('user-agent'),
        };
      }
    } catch {
      // Invalid JWT, continue
    }
  }

  // Anonymous user
  return {
    userId: 'anonymous',
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent'),
  };
}

// Mask sensitive fields in objects
function maskSensitiveFields(obj: unknown, sensitiveFields: string[]): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item, sensitiveFields));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.includes(key.toLowerCase())) {
      masked[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveFields(value, sensitiveFields);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Create audit middleware for Express
 */
export function auditMiddleware(options: AuditMiddlewareOptions) {
  const {
    logger,
    skipPatterns = [],
    extractUser = defaultExtractUser,
    captureRequestBody = false,
    captureResponseBody = false,
    sensitiveFields = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization'],
    logSuccessOnly = false,
    customEventType,
  } = options;

  const allSkipPatterns = [...DEFAULT_SKIP_PATTERNS, ...skipPatterns];

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if path should be skipped
    const shouldSkip = allSkipPatterns.some((pattern) => pattern.test(req.path));
    if (shouldSkip) {
      next();
      return;
    }

    // Store metadata on request
    const metadata: AuditMetadata = {
      startTime: Date.now(),
      requestId: req.get('x-request-id') ?? `req_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };

    // Store original end function
    const originalEnd = res.end;
    let responseBody: unknown;

    // Override res.end to capture response
    res.end = function (chunk?: unknown, ...args: unknown[]): Response {
      if (captureResponseBody && chunk) {
        try {
          responseBody = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
        } catch {
          responseBody = chunk;
        }
      }

      // Restore original end and call it
      res.end = originalEnd;
      res.end(chunk as never, ...args as never[]);

      // Log the audit event asynchronously
      void (async () => {
        try {
          const actor = extractUser(req);
          if (!actor) {
            return; // Skip if no actor could be extracted
          }

          const duration = Date.now() - metadata.startTime;
          const statusCode = res.statusCode;
          const success = statusCode >= 200 && statusCode < 400;

          // Skip if logSuccessOnly and request failed
          if (logSuccessOnly && !success) {
            return;
          }

          const eventType = customEventType?.(req) ?? getEventTypeFromRequest(req);
          if (!eventType) {
            return;
          }

          const severity = getSeverityFromStatus(statusCode);

          // Prepare request data
          const requestData: Record<string, unknown> = {
            method: req.method,
            path: req.path,
            query: req.query,
            headers: maskSensitiveFields(req.headers, sensitiveFields),
          };

          if (captureRequestBody && req.body) {
            requestData.body = maskSensitiveFields(req.body, sensitiveFields);
          }

          // Prepare context
          const context = {
            requestId: metadata.requestId,
            request: requestData,
            response: {
              statusCode,
              headers: res.getHeaders(),
              body: captureResponseBody && responseBody
                ? maskSensitiveFields(responseBody, sensitiveFields)
                : undefined,
            },
          };

          await logger.log({
            eventType,
            severity,
            actor,
            resource: {
              type: 'api_key',
              id: `${req.method} ${req.path}`,
              name: req.path,
              metadata: {
                method: req.method,
                path: req.path,
              },
            },
            action: req.method.toLowerCase(),
            description: `${req.method} ${req.path} - ${statusCode}`,
            success,
            error: success ? undefined : `HTTP ${statusCode}`,
            duration,
            context,
          });
        } catch (error) {
          console.error('Failed to log audit event:', error);
        }
      })();

      return res;
    };

    next();
  };
}

/**
 * Create a simple audit middleware with minimal configuration
 */
export function createSimpleAuditMiddleware(logger: AuditLogger) {
  return auditMiddleware({
    logger,
    captureRequestBody: false,
    captureResponseBody: false,
    logSuccessOnly: false,
  });
}

/**
 * Create a detailed audit middleware that captures full request/response data
 */
export function createDetailedAuditMiddleware(logger: AuditLogger) {
  return auditMiddleware({
    logger,
    captureRequestBody: true,
    captureResponseBody: true,
    logSuccessOnly: false,
  });
}

/**
 * Create an audit middleware for security-critical endpoints
 */
export function createSecurityAuditMiddleware(logger: AuditLogger) {
  return auditMiddleware({
    logger,
    captureRequestBody: true,
    captureResponseBody: false, // Don't capture response to avoid leaking sensitive data
    logSuccessOnly: false,
    skipPatterns: [], // Don't skip anything
    customEventType: (req) => {
      // All requests to security middleware are security events
      if (req.path.includes('/login')) return 'user.login' as AuditEventType;
      if (req.path.includes('/logout')) return 'user.logout' as AuditEventType;
      if (req.path.includes('/password')) return 'user.password_change' as AuditEventType;
      if (req.path.includes('/permissions')) return 'permission.grant' as AuditEventType;
      return 'security.alert' as AuditEventType;
    },
  });
}
