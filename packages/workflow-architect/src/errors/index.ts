/**
 * Error Types for Workflow Architect
 * Structured errors with codes for better handling
 */

export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Security errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_INPUT = 'INVALID_INPUT',
  INJECTION_DETECTED = 'INJECTION_DETECTED',

  // Request errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  BAD_REQUEST = 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',

  // n8n errors
  N8N_CONNECTION = 'N8N_CONNECTION',
  N8N_AUTH = 'N8N_AUTH',
  N8N_WORKFLOW_CREATE = 'N8N_WORKFLOW_CREATE',
  N8N_WORKFLOW_UPDATE = 'N8N_WORKFLOW_UPDATE',
  N8N_CREDENTIALS = 'N8N_CREDENTIALS',

  // RAG errors
  RAG_EMBEDDING = 'RAG_EMBEDDING',
  RAG_SEARCH = 'RAG_SEARCH',
  RAG_INDEX = 'RAG_INDEX',

  // Model errors
  MODEL_API = 'MODEL_API',
  MODEL_RATE_LIMIT = 'MODEL_RATE_LIMIT',
  MODEL_CONTEXT_LIMIT = 'MODEL_CONTEXT_LIMIT',
  MODEL_TIMEOUT = 'MODEL_TIMEOUT',

  // Agent errors
  AGENT_LOOP = 'AGENT_LOOP',
  AGENT_TOOL = 'AGENT_TOOL',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',

  // WebSocket errors
  WS_CONNECTION = 'WS_CONNECTION',
  WS_MESSAGE = 'WS_MESSAGE',

  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
}

export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Base error class for Workflow Architect
 */
export class WorkflowArchitectError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly recoverable: boolean;
  readonly timestamp: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context: ErrorContext = {},
    recoverable = true,
  ) {
    super(message);
    this.name = 'WorkflowArchitectError';
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = Date.now();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowArchitectError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
    };
  }
}

/**
 * n8n connection/API error
 */
export class N8nError extends WorkflowArchitectError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, true);
    this.name = 'N8nError';
  }
}

/**
 * RAG/Vector store error
 */
export class RAGError extends WorkflowArchitectError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, true);
    this.name = 'RAGError';
  }
}

/**
 * Model/LLM error
 */
export class ModelError extends WorkflowArchitectError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    const recoverable = code !== ErrorCode.MODEL_CONTEXT_LIMIT;
    super(message, code, context, recoverable);
    this.name = 'ModelError';
  }
}

/**
 * Agent execution error
 */
export class AgentError extends WorkflowArchitectError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, true);
    this.name = 'AgentError';
  }
}

/**
 * Security-related error (unauthorized, forbidden, injection)
 */
export class SecurityError extends WorkflowArchitectError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, false);
    this.name = 'SecurityError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends WorkflowArchitectError {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, context: ErrorContext = {}) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, context, true);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Request timeout error
 */
export class TimeoutError extends WorkflowArchitectError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.REQUEST_TIMEOUT, context, true);
    this.name = 'TimeoutError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends WorkflowArchitectError {
  readonly fields?: Record<string, string[]>;

  constructor(message: string, fields?: Record<string, string[]>, context: ErrorContext = {}) {
    super(message, ErrorCode.VALIDATION_ERROR, { ...context, fields }, true);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Wrap unknown errors into WorkflowArchitectError
 */
export function wrapError(error: unknown, defaultMessage = 'An unexpected error occurred'): WorkflowArchitectError {
  if (error instanceof WorkflowArchitectError) {
    return error;
  }

  if (error instanceof Error) {
    return new WorkflowArchitectError(error.message, ErrorCode.UNKNOWN, {
      originalName: error.name,
      originalStack: error.stack,
    });
  }

  return new WorkflowArchitectError(defaultMessage, ErrorCode.UNKNOWN, {
    originalError: String(error),
  });
}

/**
 * Check if an error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof WorkflowArchitectError) {
    return error.recoverable;
  }
  return true;
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof WorkflowArchitectError) {
    switch (error.code) {
      case ErrorCode.N8N_CONNECTION:
        return 'Unable to connect to n8n. Please check that n8n is running.';
      case ErrorCode.N8N_AUTH:
        return 'n8n authentication failed. Please check your API key.';
      case ErrorCode.MODEL_RATE_LIMIT:
        return 'AI rate limit reached. Please try again in a moment.';
      case ErrorCode.MODEL_CONTEXT_LIMIT:
        return 'Request too large. Please try with a shorter message.';
      case ErrorCode.AGENT_TIMEOUT:
      case ErrorCode.REQUEST_TIMEOUT:
        return 'Request timed out. Please try again.';
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return 'Rate limit exceeded. Please slow down your requests.';
      case ErrorCode.UNAUTHORIZED:
        return 'Authentication required. Please log in.';
      case ErrorCode.FORBIDDEN:
        return 'You do not have permission to perform this action.';
      case ErrorCode.INVALID_INPUT:
      case ErrorCode.VALIDATION_ERROR:
        return 'Invalid input. Please check your data and try again.';
      case ErrorCode.INJECTION_DETECTED:
        return 'Security violation detected. Request blocked.';
      case ErrorCode.SERVICE_UNAVAILABLE:
        return 'Service temporarily unavailable. Please try again later.';
      case ErrorCode.PAYLOAD_TOO_LARGE:
        return 'Request payload too large. Please reduce the size.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Get HTTP status code from error
 */
export function getHttpStatusCode(error: unknown): number {
  if (error instanceof WorkflowArchitectError) {
    switch (error.code) {
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.INVALID_INPUT:
      case ErrorCode.BAD_REQUEST:
        return 400;
      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.N8N_AUTH:
        return 401;
      case ErrorCode.FORBIDDEN:
        return 403;
      case ErrorCode.NOT_FOUND:
        return 404;
      case ErrorCode.REQUEST_TIMEOUT:
      case ErrorCode.AGENT_TIMEOUT:
        return 408;
      case ErrorCode.PAYLOAD_TOO_LARGE:
        return 413;
      case ErrorCode.RATE_LIMIT_EXCEEDED:
      case ErrorCode.MODEL_RATE_LIMIT:
        return 429;
      case ErrorCode.INTERNAL_ERROR:
      case ErrorCode.UNKNOWN:
        return 500;
      case ErrorCode.SERVICE_UNAVAILABLE:
        return 503;
      default:
        return 500;
    }
  }

  return 500;
}
