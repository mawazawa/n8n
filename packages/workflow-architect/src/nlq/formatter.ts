/**
 * Result Formatter
 * Formats query results into natural language responses
 */

import type { ExecutionResult, QueryResult, UserPreferences, VisualizationSuggestion } from './types';
import { Intent } from './types';
import type { SearchResult } from '../rag';

/**
 * Formatted result with different representations
 */
export interface FormattedResult {
  natural: string;
  structured: unknown;
  table?: string[][];
  list?: string[];
}

/**
 * Result formatter configuration
 */
export interface ResultFormatterConfig {
  maxItemsInList?: number;
  includeVisualizationSuggestions?: boolean;
  includeFollowUpQuestions?: boolean;
}

/**
 * ResultFormatter converts raw results into user-friendly formats
 */
export class ResultFormatter {
  private config: Required<ResultFormatterConfig>;

  constructor(config: ResultFormatterConfig = {}) {
    this.config = {
      maxItemsInList: config.maxItemsInList ?? 10,
      includeVisualizationSuggestions: config.includeVisualizationSuggestions ?? true,
      includeFollowUpQuestions: config.includeFollowUpQuestions ?? true,
    };
  }

  /**
   * Format execution result into query result
   */
  async format(
    result: ExecutionResult,
    intent: Intent,
    preferences?: UserPreferences,
  ): Promise<QueryResult> {
    if (!result.success) {
      return this.formatError(result);
    }

    const formatted = this.formatByIntent(result, intent);
    const visualization = this.suggestVisualization(result, intent);
    const followUpQuestions = this.generateFollowUpQuestions(result, intent);

    return {
      answer: formatted.natural,
      sources: this.extractSources(result),
      confidence: this.calculateConfidence(result),
      data: formatted.structured,
      visualization: this.config.includeVisualizationSuggestions ? visualization : undefined,
      followUpQuestions: this.config.includeFollowUpQuestions ? followUpQuestions : undefined,
    };
  }

  /**
   * Format result based on intent
   */
  private formatByIntent(result: ExecutionResult, intent: Intent): FormattedResult {
    switch (intent) {
      case Intent.SEARCH:
      case Intent.LIST:
        return this.formatSearchResult(result);

      case Intent.AGGREGATE:
      case Intent.COUNT:
        return this.formatAggregateResult(result);

      case Intent.COMPARE:
        return this.formatCompareResult(result);

      case Intent.EXPLAIN:
        return this.formatExplanation(result);

      case Intent.ANALYZE:
        return this.formatAnalysis(result);

      default:
        return this.formatGeneric(result);
    }
  }

  /**
   * Format search/list results
   */
  private formatSearchResult(result: ExecutionResult): FormattedResult {
    const data = result.data as SearchResult[] | undefined;

    if (!data || data.length === 0) {
      return {
        natural: 'I could not find any workflows matching your query.',
        structured: [],
      };
    }

    const count = data.length;
    const limited = data.slice(0, this.config.maxItemsInList);

    const natural = this.buildNaturalList(limited, count);
    const list = limited.map((item) => `${item.name} - ${item.description || 'No description'}`);
    const table = this.buildWorkflowTable(limited);

    return {
      natural,
      structured: data,
      list,
      table,
    };
  }

  /**
   * Format aggregate results
   */
  private formatAggregateResult(result: ExecutionResult): FormattedResult {
    const data = result.data as Record<string, unknown>;

    if (!data) {
      return {
        natural: 'Unable to compute the requested aggregation.',
        structured: {},
      };
    }

    // Extract count
    if ('count' in data) {
      const count = data.count as number;
      return {
        natural: `Found ${count} workflow${count !== 1 ? 's' : ''} matching your criteria.`,
        structured: data,
      };
    }

    // Format other aggregations
    const aggregations = Object.entries(data).filter(([key]) => key !== 'workflows');
    const natural = aggregations
      .map(([key, value]) => {
        const [func, field] = key.split('_');
        return `${func} of ${field}: ${value}`;
      })
      .join(', ');

    return {
      natural: `Aggregation results: ${natural}`,
      structured: data,
    };
  }

  /**
   * Format comparison results
   */
  private formatCompareResult(result: ExecutionResult): FormattedResult {
    const data = result.data as SearchResult[] | Record<string, unknown>;

    return {
      natural: `Comparison results show ${Array.isArray(data) ? data.length : 'multiple'} items.`,
      structured: data,
    };
  }

  /**
   * Format explanation
   */
  private formatExplanation(result: ExecutionResult): FormattedResult {
    const data = result.data as SearchResult[] | undefined;

    if (!data || data.length === 0) {
      return {
        natural: 'I could not find information to explain that.',
        structured: null,
      };
    }

    const item = data[0];
    const natural = `${item.name}: ${item.description || 'A workflow in the system'}. Category: ${item.category}.`;

    return {
      natural,
      structured: item,
    };
  }

  /**
   * Format analysis results
   */
  private formatAnalysis(result: ExecutionResult): FormattedResult {
    const data = result.data as Record<string, unknown>;

    return {
      natural: 'Analysis completed. See detailed results below.',
      structured: data,
    };
  }

  /**
   * Format generic result
   */
  private formatGeneric(result: ExecutionResult): FormattedResult {
    return {
      natural: 'Query executed successfully.',
      structured: result.data,
    };
  }

  /**
   * Format error result
   */
  private formatError(result: ExecutionResult): QueryResult {
    const errorData = result.data as { error?: string };
    const errorMessage = errorData?.error || 'An unknown error occurred';

    return {
      answer: `I encountered an error while processing your query: ${errorMessage}`,
      sources: [],
      confidence: 0,
    };
  }

  /**
   * Build natural language list
   */
  private buildNaturalList(items: SearchResult[], totalCount: number): string {
    if (items.length === 0) {
      return 'No items found.';
    }

    const itemList = items
      .slice(0, 3)
      .map((item, i) => `${i + 1}. ${item.name}`)
      .join(', ');

    if (totalCount > items.length) {
      return `Found ${totalCount} workflows. Here are the top results: ${itemList}, and ${totalCount - 3} more.`;
    }

    return `Found ${totalCount} workflow${totalCount !== 1 ? 's' : ''}: ${itemList}.`;
  }

  /**
   * Build workflow table
   */
  private buildWorkflowTable(items: SearchResult[]): string[][] {
    const headers = ['Name', 'Category', 'Description', 'Similarity'];
    const rows = items.map((item) => [
      item.name,
      item.category,
      item.description || '',
      (item.similarity * 100).toFixed(1) + '%',
    ]);

    return [headers, ...rows];
  }

  /**
   * Extract sources from result
   */
  private extractSources(result: ExecutionResult): Array<{
    type: 'workflow' | 'documentation' | 'example' | 'execution';
    id: string;
    name: string;
    url?: string;
    relevance: number;
  }> {
    const data = result.data as SearchResult[] | undefined;

    if (!Array.isArray(data)) {
      return [];
    }

    return data.slice(0, 5).map((item) => ({
      type: 'workflow' as const,
      id: item.id,
      name: item.name,
      relevance: item.similarity,
    }));
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(result: ExecutionResult): number {
    const data = result.data as SearchResult[] | Record<string, unknown> | undefined;

    if (!data) return 0;

    // For search results, use average similarity
    if (Array.isArray(data)) {
      if (data.length === 0) return 0.1;

      const avgSimilarity =
        data.reduce((sum, item) => sum + (item.similarity || 0), 0) / data.length;
      return avgSimilarity;
    }

    // For aggregations, use high confidence
    if ('count' in data) {
      return 0.9;
    }

    // Default confidence
    return 0.7;
  }

  /**
   * Suggest visualization
   */
  private suggestVisualization(
    result: ExecutionResult,
    intent: Intent,
  ): VisualizationSuggestion | undefined {
    const data = result.data;

    if (Array.isArray(data)) {
      // Table for lists
      return {
        type: 'table',
        config: {
          columns: ['name', 'category', 'description'],
          sortable: true,
          filterable: true,
        },
      };
    }

    if (intent === Intent.AGGREGATE || intent === Intent.COUNT) {
      // Chart for aggregations
      return {
        type: 'chart',
        config: {
          chartType: 'bar',
          xAxis: 'category',
          yAxis: 'count',
        },
      };
    }

    return undefined;
  }

  /**
   * Generate follow-up questions
   */
  private generateFollowUpQuestions(result: ExecutionResult, intent: Intent): string[] | undefined {
    const questions: string[] = [];

    if (intent === Intent.SEARCH || intent === Intent.LIST) {
      questions.push('Show me more details about the first result');
      questions.push('Filter by a specific category');
      questions.push('How many workflows are there in total?');
    }

    if (intent === Intent.AGGREGATE || intent === Intent.COUNT) {
      questions.push('Break down by category');
      questions.push('Show me the trends over time');
    }

    if (intent === Intent.EXPLAIN) {
      questions.push('Show me similar workflows');
      questions.push('How can I use this workflow?');
    }

    return questions.length > 0 ? questions.slice(0, 3) : undefined;
  }

  /**
   * Format result in specific format
   */
  formatAs(result: ExecutionResult, format: 'table' | 'list' | 'natural' | 'json'): string {
    const data = result.data;

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'table':
        return this.formatAsTable(data);

      case 'list':
        return this.formatAsList(data);

      case 'natural':
      default:
        return this.formatGeneric(result).natural;
    }
  }

  /**
   * Format as table
   */
  private formatAsTable(data: unknown): string {
    if (!Array.isArray(data)) {
      return JSON.stringify(data);
    }

    if (data.length === 0) {
      return 'No data';
    }

    // Build table
    const table = this.buildWorkflowTable(data as SearchResult[]);
    const colWidths = table[0].map((_, colIdx) =>
      Math.max(...table.map((row) => row[colIdx].length)),
    );

    return table
      .map((row) => row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | '))
      .join('\n');
  }

  /**
   * Format as list
   */
  private formatAsList(data: unknown): string {
    if (!Array.isArray(data)) {
      return JSON.stringify(data);
    }

    return data.map((item, i) => `${i + 1}. ${(item as SearchResult).name}`).join('\n');
  }
}
