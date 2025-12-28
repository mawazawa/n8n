import type {
  RecoverySuggestion,
  ErrorContext,
  ErrorPattern,
  RecoverySeverity,
} from './types.js';
import { ErrorAnalyzer, type ErrorAnalysisResult } from './analyzer.js';

/**
 * Generates ranked recovery suggestions based on error analysis
 */
export class RecoverySuggestionGenerator {
  private analyzer: ErrorAnalyzer;

  constructor() {
    this.analyzer = new ErrorAnalyzer();
  }

  /**
   * Generate recovery suggestions for an error
   * Returns suggestions ranked by confidence (highest first)
   */
  generateSuggestions(
    context: ErrorContext,
    patterns?: ErrorPattern[],
  ): RecoverySuggestion[] {
    const analysis = this.analyzer.analyzeError(context);
    const effectivePatterns = patterns || analysis.patterns;

    const suggestions: RecoverySuggestion[] = [];

    // Generate suggestions based on error category
    switch (analysis.category) {
      case 'transient':
        suggestions.push(...this.generateTransientSuggestions(context, analysis));
        break;

      case 'configuration':
        suggestions.push(...this.generateConfigurationSuggestions(context, analysis));
        break;

      case 'external':
        suggestions.push(...this.generateExternalSuggestions(context, analysis));
        break;

      case 'logic':
        suggestions.push(...this.generateLogicSuggestions(context, analysis));
        break;

      default:
        suggestions.push(...this.generateGenericSuggestions(context, analysis));
    }

    // Add pattern-specific suggestions
    if (effectivePatterns.length > 0) {
      suggestions.push(
        ...this.generatePatternSuggestions(context, effectivePatterns[0], analysis),
      );
    }

    // Deduplicate and rank suggestions
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
    return this.rankSuggestions(uniqueSuggestions, context);
  }

  /**
   * Generate suggestions for transient errors
   */
  private generateTransientSuggestions(
    context: ErrorContext,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const retryCount = (analysis.metadata.retryCount as number) || 0;

    // Rate limit specific
    if (context.errorMessage.toLowerCase().includes('rate limit')) {
      const backoffMs = this.calculateBackoff(retryCount);

      suggestions.push({
        id: `retry-rate-limit-${context.executionId}`,
        type: 'retry',
        severity: 'warning',
        title: 'Retry with exponential backoff',
        description: `Wait ${Math.round(backoffMs / 1000)}s and retry. The service rate limit will reset.`,
        action: {
          type: 'retry_with_delay',
          params: {
            delayMs: backoffMs,
            maxRetries: 5,
            exponential: true,
          },
        },
        confidence: 0.9,
      });

      suggestions.push({
        id: `reduce-frequency-${context.executionId}`,
        type: 'parameter',
        severity: 'info',
        title: 'Reduce request frequency',
        description: 'Add delays between requests or process items in smaller batches.',
        action: {
          type: 'add_delay',
          params: {
            delayMs: 1000,
            position: 'before',
          },
        },
        confidence: 0.7,
      });
    }

    // Timeout specific
    if (
      context.errorMessage.toLowerCase().includes('timeout') ||
      context.errorMessage.toLowerCase().includes('timed out')
    ) {
      suggestions.push({
        id: `retry-timeout-${context.executionId}`,
        type: 'retry',
        severity: 'warning',
        title: 'Retry the request',
        description: 'The timeout may be temporary. Retrying could succeed.',
        action: {
          type: 'retry',
          params: {
            maxRetries: 3,
            delayMs: 2000,
          },
        },
        confidence: 0.85,
      });

      suggestions.push({
        id: `increase-timeout-${context.executionId}`,
        type: 'parameter',
        severity: 'info',
        title: 'Increase timeout duration',
        description: 'The operation may need more time to complete.',
        action: {
          type: 'update_parameter',
          params: {
            parameter: 'timeout',
            operation: 'multiply',
            value: 2,
          },
        },
        confidence: 0.75,
      });
    }

    // Generic transient error
    if (suggestions.length === 0) {
      suggestions.push({
        id: `retry-transient-${context.executionId}`,
        type: 'retry',
        severity: 'warning',
        title: 'Retry the operation',
        description: 'This appears to be a temporary issue. Retrying may succeed.',
        action: {
          type: 'retry',
          params: {
            maxRetries: 3,
            delayMs: 1000,
          },
        },
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  /**
   * Generate suggestions for configuration errors
   */
  private generateConfigurationSuggestions(
    context: ErrorContext,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const message = context.errorMessage.toLowerCase();

    // Authentication errors
    if (message.includes('401') || message.includes('unauthorized')) {
      suggestions.push({
        id: `verify-credentials-${context.executionId}`,
        type: 'credential',
        severity: 'error',
        title: 'Verify credentials',
        description: 'Authentication failed. Check that credentials are correct and not expired.',
        action: {
          type: 'check_credentials',
          params: {
            nodeType: context.nodeType,
          },
        },
        confidence: 0.9,
      });

      suggestions.push({
        id: `rotate-credentials-${context.executionId}`,
        type: 'credential',
        severity: 'error',
        title: 'Regenerate API credentials',
        description: 'Generate a new API key or access token from the service provider.',
        confidence: 0.75,
      });
    }

    // Permission errors
    if (message.includes('403') || message.includes('forbidden')) {
      suggestions.push({
        id: `check-permissions-${context.executionId}`,
        type: 'credential',
        severity: 'error',
        title: 'Check credential permissions',
        description: 'The credentials lack required permissions. Update scopes or contact administrator.',
        confidence: 0.85,
      });

      suggestions.push({
        id: `alternative-account-${context.executionId}`,
        type: 'credential',
        severity: 'info',
        title: 'Use alternative credentials',
        description: 'Try credentials from an account with higher permissions.',
        action: {
          type: 'swap_credentials',
          params: {
            nodeType: context.nodeType,
          },
        },
        confidence: 0.6,
      });
    }

    // Validation errors
    if (message.includes('400') || message.includes('validation')) {
      suggestions.push({
        id: `review-parameters-${context.executionId}`,
        type: 'parameter',
        severity: 'error',
        title: 'Review request parameters',
        description: 'Check that all parameters match API requirements and required fields are present.',
        confidence: 0.8,
      });

      suggestions.push({
        id: `check-docs-${context.executionId}`,
        type: 'manual',
        severity: 'info',
        title: 'Consult API documentation',
        description: 'Review the API documentation for parameter requirements and formats.',
        confidence: 0.6,
      });
    }

    // Not found errors
    if (message.includes('404') || message.includes('not found')) {
      suggestions.push({
        id: `verify-resource-${context.executionId}`,
        type: 'parameter',
        severity: 'error',
        title: 'Verify resource exists',
        description: 'Check that the resource ID or path is correct and the resource exists.',
        confidence: 0.85,
      });
    }

    return suggestions;
  }

  /**
   * Generate suggestions for external service errors
   */
  private generateExternalSuggestions(
    context: ErrorContext,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    suggestions.push({
      id: `retry-external-${context.executionId}`,
      type: 'retry',
      severity: 'warning',
      title: 'Retry after service recovers',
      description: 'The external service is experiencing issues. Retry after a delay.',
      action: {
        type: 'retry_with_delay',
        params: {
          delayMs: 5000,
          maxRetries: 3,
          exponential: true,
        },
      },
      confidence: 0.75,
    });

    suggestions.push({
      id: `check-status-${context.executionId}`,
      type: 'manual',
      severity: 'info',
      title: 'Check service status',
      description: 'Visit the service status page to see if there are known issues.',
      confidence: 0.7,
    });

    suggestions.push({
      id: `alternative-service-${context.executionId}`,
      type: 'alternative',
      severity: 'info',
      title: 'Use alternative service',
      description: 'Consider using an alternative service or node if available.',
      confidence: 0.5,
    });

    return suggestions;
  }

  /**
   * Generate suggestions for logic errors
   */
  private generateLogicSuggestions(
    context: ErrorContext,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const message = context.errorMessage.toLowerCase();

    if (message.includes('out of memory') || message.includes('memory')) {
      suggestions.push({
        id: `batch-processing-${context.executionId}`,
        type: 'parameter',
        severity: 'critical',
        title: 'Process data in smaller batches',
        description: 'Reduce the amount of data processed at once to avoid memory issues.',
        action: {
          type: 'enable_batching',
          params: {
            batchSize: 100,
          },
        },
        confidence: 0.85,
      });

      suggestions.push({
        id: `increase-memory-${context.executionId}`,
        type: 'manual',
        severity: 'info',
        title: 'Increase memory allocation',
        description: 'Consider increasing the available memory for the workflow execution.',
        confidence: 0.6,
      });
    }

    suggestions.push({
      id: `review-workflow-${context.executionId}`,
      type: 'manual',
      severity: 'error',
      title: 'Review workflow logic',
      description: 'This appears to be a logic error. Review the workflow configuration and node parameters.',
      confidence: 0.7,
    });

    return suggestions;
  }

  /**
   * Generate generic suggestions for unknown errors
   */
  private generateGenericSuggestions(
    context: ErrorContext,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    suggestions.push({
      id: `retry-generic-${context.executionId}`,
      type: 'retry',
      severity: 'warning',
      title: 'Retry the operation',
      description: 'Retrying may resolve the issue.',
      action: {
        type: 'retry',
        params: {
          maxRetries: 2,
          delayMs: 1000,
        },
      },
      confidence: 0.5,
    });

    suggestions.push({
      id: `review-error-${context.executionId}`,
      type: 'manual',
      severity: 'error',
      title: 'Review error details',
      description: 'Review the full error message and stack trace for more information.',
      confidence: 0.6,
    });

    return suggestions;
  }

  /**
   * Generate suggestions based on error pattern
   */
  private generatePatternSuggestions(
    context: ErrorContext,
    pattern: ErrorPattern,
    analysis: ErrorAnalysisResult,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    // Create suggestions from pattern solutions
    pattern.solutions.forEach((solution, index) => {
      const suggestionType = this.inferSuggestionType(solution);
      const severity = this.mapCategoryToSeverity(pattern.category);

      suggestions.push({
        id: `pattern-${pattern.id}-${index}`,
        type: suggestionType,
        severity,
        title: solution,
        description: `Recommended solution for: ${pattern.description}`,
        confidence: 0.8 - index * 0.1, // First solution has highest confidence
      });
    });

    return suggestions;
  }

  /**
   * Infer suggestion type from solution text
   */
  private inferSuggestionType(
    solution: string,
  ): RecoverySuggestion['type'] {
    const lower = solution.toLowerCase();

    if (lower.includes('retry') || lower.includes('wait')) {
      return 'retry';
    }

    if (
      lower.includes('credential') ||
      lower.includes('api key') ||
      lower.includes('token') ||
      lower.includes('permission')
    ) {
      return 'credential';
    }

    if (
      lower.includes('parameter') ||
      lower.includes('setting') ||
      lower.includes('configuration') ||
      lower.includes('timeout') ||
      lower.includes('batch')
    ) {
      return 'parameter';
    }

    if (lower.includes('alternative') || lower.includes('switch')) {
      return 'alternative';
    }

    return 'manual';
  }

  /**
   * Map error category to suggestion severity
   */
  private mapCategoryToSeverity(category: string): RecoverySeverity {
    switch (category) {
      case 'transient':
        return 'warning';
      case 'configuration':
        return 'error';
      case 'external':
        return 'warning';
      case 'logic':
        return 'critical';
      default:
        return 'error';
    }
  }

  /**
   * Deduplicate suggestions by ID and similarity
   */
  private deduplicateSuggestions(
    suggestions: RecoverySuggestion[],
  ): RecoverySuggestion[] {
    const seen = new Map<string, RecoverySuggestion>();

    for (const suggestion of suggestions) {
      const existing = seen.get(suggestion.id);

      if (!existing) {
        seen.set(suggestion.id, suggestion);
      } else {
        // Keep the one with higher confidence
        if (suggestion.confidence > existing.confidence) {
          seen.set(suggestion.id, suggestion);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Rank suggestions by confidence and relevance
   */
  private rankSuggestions(
    suggestions: RecoverySuggestion[],
    context: ErrorContext,
  ): RecoverySuggestion[] {
    return suggestions.sort((a, b) => {
      // Primary sort by confidence (descending)
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }

      // Secondary sort by severity (critical > error > warning > info)
      const severityOrder = { critical: 4, error: 3, warning: 2, info: 1 };
      const aSeverity = severityOrder[a.severity];
      const bSeverity = severityOrder[b.severity];

      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity;
      }

      // Tertiary sort by type preference (retry > credential > parameter > alternative > manual)
      const typeOrder = { retry: 5, credential: 4, parameter: 3, alternative: 2, manual: 1 };
      const aType = typeOrder[a.type];
      const bType = typeOrder[b.type];

      return bType - aType;
    });
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(retryCount: number, baseMs = 1000, maxMs = 60000): number {
    const delay = baseMs * Math.pow(2, retryCount);
    return Math.min(delay, maxMs);
  }

  /**
   * Filter suggestions by minimum confidence
   */
  filterByConfidence(
    suggestions: RecoverySuggestion[],
    minConfidence: number,
  ): RecoverySuggestion[] {
    return suggestions.filter((s) => s.confidence >= minConfidence);
  }

  /**
   * Get top N suggestions
   */
  getTopSuggestions(suggestions: RecoverySuggestion[], limit: number): RecoverySuggestion[] {
    return suggestions.slice(0, limit);
  }
}
