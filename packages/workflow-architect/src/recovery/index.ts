/**
 * Intelligent Error Recovery System
 *
 * Provides pattern matching, analysis, suggestions, and auto-fix capabilities
 * for workflow execution errors.
 */

// Types
export type {
  ErrorCategory,
  RecoverySeverity,
  ErrorPattern,
  RecoverySuggestion,
  ErrorContext,
  RecoveryResult,
} from './types.js';

// Pattern matching
export {
  getPatterns,
  matchPattern,
  addPattern,
  removePattern,
  getPatternById,
  clearCustomPatterns,
  getPatternsByCategory,
  getPatternsByNodeType,
} from './patterns.js';

// Error analysis
export { ErrorAnalyzer } from './analyzer.js';
export type { ErrorAnalysisResult } from './analyzer.js';

// Recovery suggestions
export { RecoverySuggestionGenerator } from './suggestions.js';

// Auto-fix
export { AutoRecovery } from './auto-fix.js';
export type { WorkflowDefinition, WorkflowNode, RetryOptions } from './auto-fix.js';
