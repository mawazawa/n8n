export type ErrorCategory = 'transient' | 'configuration' | 'external' | 'logic' | 'unknown';
export type RecoverySeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorPattern {
  id: string;
  pattern: string; // regex pattern to match error messages
  category: ErrorCategory;
  nodeTypes?: string[]; // specific node types this applies to
  description: string;
  solutions: string[];
}

export interface RecoverySuggestion {
  id: string;
  type: 'retry' | 'credential' | 'parameter' | 'alternative' | 'manual';
  severity: RecoverySeverity;
  title: string;
  description: string;
  action?: {
    type: string;
    params: Record<string, unknown>;
  };
  confidence: number; // 0-1
}

export interface ErrorContext {
  executionId: string;
  workflowId: string;
  nodeName: string;
  nodeType: string;
  errorMessage: string;
  errorStack?: string;
  inputData?: Record<string, unknown>;
  timestamp: number;
  previousErrors?: ErrorContext[];
}

export interface RecoveryResult {
  success: boolean;
  suggestion: RecoverySuggestion;
  appliedAt: number;
  newExecutionId?: string;
  error?: string;
}
