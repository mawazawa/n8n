import type { ErrorContext, ErrorPattern, ErrorCategory } from './types.js';
import { matchPattern, getPatternsByCategory } from './patterns.js';

/**
 * Analyzes errors to determine root cause, category, and recoverability
 */
export class ErrorAnalyzer {
  /**
   * Analyze an error and return matched patterns
   */
  analyzeError(context: ErrorContext): ErrorAnalysisResult {
    const patterns = matchPattern(context.errorMessage, context.nodeType);
    const category = this.categorizeError(context, patterns);
    const rootCause = this.getRootCause(context, patterns);
    const isTransient = this.isTransient(context, patterns);
    const severity = this.determineSeverity(context, patterns);

    return {
      context,
      patterns,
      category,
      rootCause,
      isTransient,
      severity,
      metadata: this.extractMetadata(context),
    };
  }

  /**
   * Determine the root cause of an error
   */
  getRootCause(context: ErrorContext, patterns?: ErrorPattern[]): string {
    // Use pattern description if available
    if (!patterns) {
      patterns = matchPattern(context.errorMessage, context.nodeType);
    }

    if (patterns.length > 0) {
      return patterns[0].description;
    }

    // Analyze error message for common indicators
    const message = context.errorMessage.toLowerCase();

    // Check for specific error types
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'Request exceeded time limit';
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return 'Authentication credentials are invalid or missing';
    }

    if (message.includes('forbidden') || message.includes('403')) {
      return 'Insufficient permissions to access resource';
    }

    if (message.includes('not found') || message.includes('404')) {
      return 'Requested resource does not exist';
    }

    if (message.includes('rate limit') || message.includes('429')) {
      return 'API rate limit has been exceeded';
    }

    if (message.includes('connection') && message.includes('refused')) {
      return 'Unable to establish connection to service';
    }

    if (message.includes('network') || message.includes('dns')) {
      return 'Network connectivity issue';
    }

    // Generic root cause
    return 'Error occurred during execution';
  }

  /**
   * Check if an error is likely transient (retryable)
   */
  isTransient(context: ErrorContext, patterns?: ErrorPattern[]): boolean {
    // Use pattern category if available
    if (!patterns) {
      patterns = matchPattern(context.errorMessage, context.nodeType);
    }

    // Check if any matching pattern is transient
    if (patterns.some((p) => p.category === 'transient')) {
      return true;
    }

    // Check if any matching pattern is external service issue
    if (patterns.some((p) => p.category === 'external')) {
      return true;
    }

    // Analyze error message for transient indicators
    const message = context.errorMessage.toLowerCase();

    const transientIndicators = [
      'timeout',
      'timed out',
      '429',
      'rate limit',
      '503',
      'service unavailable',
      '502',
      'bad gateway',
      '504',
      'gateway timeout',
      'connection reset',
      'econnreset',
      'socket hang up',
      'temporarily unavailable',
      'try again',
    ];

    return transientIndicators.some((indicator) => message.includes(indicator));
  }

  /**
   * Categorize error based on patterns and content
   */
  private categorizeError(
    context: ErrorContext,
    patterns: ErrorPattern[],
  ): ErrorCategory {
    // Use first matching pattern's category
    if (patterns.length > 0) {
      return patterns[0].category;
    }

    // Fallback categorization based on error message
    const message = context.errorMessage.toLowerCase();

    // Transient errors
    if (
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('rate limit') ||
      message.includes('429')
    ) {
      return 'transient';
    }

    // Configuration errors
    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('credentials') ||
      message.includes('invalid parameter') ||
      message.includes('validation')
    ) {
      return 'configuration';
    }

    // External service errors
    if (
      message.includes('connection refused') ||
      message.includes('econnrefused') ||
      message.includes('dns') ||
      message.includes('enotfound') ||
      message.includes('service unavailable')
    ) {
      return 'external';
    }

    // Logic errors
    if (
      message.includes('null') ||
      message.includes('undefined') ||
      message.includes('cannot read property') ||
      message.includes('out of memory')
    ) {
      return 'logic';
    }

    return 'unknown';
  }

  /**
   * Determine error severity
   */
  private determineSeverity(
    context: ErrorContext,
    patterns: ErrorPattern[],
  ): 'info' | 'warning' | 'error' | 'critical' {
    const category = patterns.length > 0 ? patterns[0].category : 'unknown';

    // Transient errors are typically warnings (can retry)
    if (category === 'transient') {
      return 'warning';
    }

    // Configuration errors are errors (need fixing)
    if (category === 'configuration') {
      return 'error';
    }

    // External service issues are warnings (out of our control)
    if (category === 'external') {
      return 'warning';
    }

    // Logic errors are critical (code issues)
    if (category === 'logic') {
      return 'critical';
    }

    // Check for critical keywords
    const message = context.errorMessage.toLowerCase();
    if (
      message.includes('fatal') ||
      message.includes('critical') ||
      message.includes('out of memory')
    ) {
      return 'critical';
    }

    return 'error';
  }

  /**
   * Extract useful metadata from error context
   */
  private extractMetadata(context: ErrorContext): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      nodeName: context.nodeName,
      nodeType: context.nodeType,
      timestamp: context.timestamp,
    };

    // Extract HTTP status code
    const statusMatch = context.errorMessage.match(/\b(\d{3})\b/);
    if (statusMatch) {
      metadata.httpStatus = parseInt(statusMatch[1], 10);
    }

    // Check for retry count
    if (context.previousErrors && context.previousErrors.length > 0) {
      metadata.retryCount = context.previousErrors.length;
      metadata.firstErrorTimestamp = context.previousErrors[0].timestamp;

      // Calculate time since first error
      const timeSinceFirst = context.timestamp - context.previousErrors[0].timestamp;
      metadata.timeSinceFirstError = timeSinceFirst;
    }

    return metadata;
  }

  /**
   * Find similar errors in history
   */
  getSimilarErrors(
    context: ErrorContext,
    history: ErrorContext[],
    threshold = 0.7,
  ): ErrorContext[] {
    const similar: Array<{ context: ErrorContext; similarity: number }> = [];

    for (const historicError of history) {
      // Skip if same execution
      if (historicError.executionId === context.executionId) {
        continue;
      }

      const similarity = this.calculateSimilarity(context, historicError);

      if (similarity >= threshold) {
        similar.push({ context: historicError, similarity });
      }
    }

    // Sort by similarity (highest first)
    similar.sort((a, b) => b.similarity - a.similarity);

    return similar.map((s) => s.context);
  }

  /**
   * Calculate similarity between two error contexts
   */
  private calculateSimilarity(
    error1: ErrorContext,
    error2: ErrorContext,
  ): number {
    let score = 0;
    let maxScore = 0;

    // Same node type (high weight)
    maxScore += 30;
    if (error1.nodeType === error2.nodeType) {
      score += 30;
    }

    // Same workflow (medium weight)
    maxScore += 20;
    if (error1.workflowId === error2.workflowId) {
      score += 20;
    }

    // Same node name (low weight, might be different instances)
    maxScore += 10;
    if (error1.nodeName === error2.nodeName) {
      score += 10;
    }

    // Error message similarity (high weight)
    maxScore += 40;
    const messageSimilarity = this.calculateStringSimilarity(
      error1.errorMessage,
      error2.errorMessage,
    );
    score += messageSimilarity * 40;

    return score / maxScore;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Quick check for identical strings
    if (s1 === s2) return 1;

    // Use simple word-based comparison for performance
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    const words1Array = Array.from(words1);
    const intersection = new Set(words1Array.filter((w) => words2.has(w)));
    const union = new Set([...words1Array, ...Array.from(words2)]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  /**
   * Get error patterns by category
   */
  getPatternsByCategory(category: ErrorCategory): ErrorPattern[] {
    return getPatternsByCategory(category);
  }

  /**
   * Check if error has occurred before
   */
  hasOccurredBefore(context: ErrorContext, history: ErrorContext[]): boolean {
    return this.getSimilarErrors(context, history, 0.9).length > 0;
  }

  /**
   * Get error frequency for a specific pattern
   */
  getErrorFrequency(
    context: ErrorContext,
    history: ErrorContext[],
    timeWindowMs = 3600000, // 1 hour default
  ): number {
    const cutoffTime = context.timestamp - timeWindowMs;
    const similarErrors = this.getSimilarErrors(context, history, 0.8);

    return similarErrors.filter((e) => e.timestamp >= cutoffTime).length;
  }
}

/**
 * Result of error analysis
 */
export interface ErrorAnalysisResult {
  context: ErrorContext;
  patterns: ErrorPattern[];
  category: ErrorCategory;
  rootCause: string;
  isTransient: boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, unknown>;
}
