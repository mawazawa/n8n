/**
 * Error Types for Workflow Architect
 * Structured errors with codes for better handling
 */

export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',

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
        return 'Request timed out. Please try again.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
