/**
 * Query Executor
 * Executes structured queries against the data store
 */

import type { StructuredQuery, ExecutionResult, QueryFilter } from './types';
import type { RAGStore, SearchResult } from '../rag';
import { getRAGStore } from '../rag';

/**
 * Query executor configuration
 */
export interface QueryExecutorConfig {
  ragStore?: RAGStore;
  timeout?: number;
  enableCache?: boolean;
}

/**
 * Execution context for query
 */
interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  timeout: number;
  startTime: number;
}

/**
 * QueryExecutor executes structured queries and returns results
 */
export class QueryExecutor {
  private ragStore: RAGStore | null = null;
  private config: Required<QueryExecutorConfig>;

  constructor(config: QueryExecutorConfig = {}) {
    this.config = {
      ragStore: config.ragStore ?? null,
      timeout: config.timeout ?? 5000,
      enableCache: config.enableCache ?? true,
    };
  }

  /**
   * Initialize the executor
   */
  async initialize(): Promise<void> {
    if (!this.ragStore) {
      this.ragStore = await getRAGStore();
    }
  }

  /**
   * Execute a structured query
   */
  async execute(query: StructuredQuery, context?: Partial<ExecutionContext>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const execContext: ExecutionContext = {
      ...context,
      timeout: context?.timeout ?? this.config.timeout,
      startTime,
    };

    try {
      // Ensure initialized
      if (!this.ragStore) {
        await this.initialize();
      }

      // Route to appropriate executor based on query type
      const data = await this.routeQuery(query, execContext);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data,
        rowCount: Array.isArray(data) ? data.length : undefined,
        executionTime,
        cached: false,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('Query execution failed:', error);

      return {
        success: false,
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        executionTime,
      };
    }
  }

  /**
   * Route query to appropriate executor
   */
  private async routeQuery(query: StructuredQuery, context: ExecutionContext): Promise<unknown> {
    switch (query.type) {
      case 'workflow_search':
        return this.executeWorkflowSearch(query, context);

      case 'workflow_list':
        return this.executeWorkflowList(query, context);

      case 'workflow_aggregate':
        return this.executeWorkflowAggregate(query, context);

      case 'node_search':
        return this.executeNodeSearch(query, context);

      case 'execution_query':
        return this.executeExecutionQuery(query, context);

      default:
        throw new Error(`Unsupported query type: ${query.type}`);
    }
  }

  /**
   * Execute workflow search query
   */
  private async executeWorkflowSearch(
    query: StructuredQuery,
    context: ExecutionContext,
  ): Promise<SearchResult[]> {
    if (!this.ragStore) {
      throw new Error('RAG store not initialized');
    }

    // Extract search query from filters
    const searchQuery = this.extractSearchQuery(query.filters);

    // Extract category filter
    const categoryFilter = query.filters.find((f) => f.field === 'category');
    const category = categoryFilter ? String(categoryFilter.value) : undefined;

    // Execute search
    const results = await this.ragStore.search(searchQuery, {
      limit: query.pagination?.limit ?? 10,
      category,
    });

    // Apply additional filters
    const filtered = this.applyFilters(results, query.filters);

    // Apply sorting
    const sorted = this.applySorting(filtered, query.sort);

    // Apply pagination
    const paginated = this.applyPagination(sorted, query.pagination);

    return paginated;
  }

  /**
   * Execute workflow list query
   */
  private async executeWorkflowList(
    query: StructuredQuery,
    context: ExecutionContext,
  ): Promise<SearchResult[]> {
    // List all workflows (similar to search with empty query)
    return this.executeWorkflowSearch({ ...query, type: 'workflow_search' }, context);
  }

  /**
   * Execute workflow aggregate query
   */
  private async executeWorkflowAggregate(
    query: StructuredQuery,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    // First get the workflows
    const workflows = await this.executeWorkflowSearch(
      { ...query, type: 'workflow_search' },
      context,
    );

    // Apply aggregations
    const result: Record<string, unknown> = {};

    if (query.aggregations) {
      for (const agg of query.aggregations) {
        const key = `${agg.function}_${agg.field}`;
        result[key] = this.computeAggregation(workflows, agg.field, agg.function);
      }
    }

    // If no aggregations specified, return count
    if (!query.aggregations || query.aggregations.length === 0) {
      result.count = workflows.length;
    }

    result.workflows = workflows;

    return result;
  }

  /**
   * Execute node search query
   */
  private async executeNodeSearch(
    query: StructuredQuery,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    // TODO: Implement node-specific search
    // For now, search workflows and extract nodes
    const workflows = await this.executeWorkflowSearch(
      { ...query, type: 'workflow_search' },
      context,
    );

    const nodes: unknown[] = [];
    for (const workflow of workflows) {
      if (workflow.workflow?.nodes) {
        nodes.push(...workflow.workflow.nodes);
      }
    }

    return nodes;
  }

  /**
   * Execute execution query
   */
  private async executeExecutionQuery(
    query: StructuredQuery,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    // TODO: Implement execution query
    // This would query workflow execution history
    throw new Error('Execution queries not yet implemented');
  }

  /**
   * Extract search query text from filters
   */
  private extractSearchQuery(filters: QueryFilter[]): string {
    // Look for name or description filters
    const nameFilter = filters.find((f) => f.field === 'name' && f.operator === 'contains');
    if (nameFilter) {
      return String(nameFilter.value);
    }

    const descFilter = filters.find((f) => f.field === 'description' && f.operator === 'contains');
    if (descFilter) {
      return String(descFilter.value);
    }

    // Default to empty search (list all)
    return '';
  }

  /**
   * Apply filters to results
   */
  private applyFilters(results: SearchResult[], filters: QueryFilter[]): SearchResult[] {
    let filtered = results;

    for (const filter of filters) {
      filtered = filtered.filter((result) => this.matchesFilter(result, filter));
    }

    return filtered;
  }

  /**
   * Check if result matches filter
   */
  private matchesFilter(result: SearchResult, filter: QueryFilter): boolean {
    const value = this.getFieldValue(result, filter.field);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'gt':
        return value > filter.value;
      case 'gte':
        return value >= filter.value;
      case 'lt':
        return value < filter.value;
      case 'lte':
        return value <= filter.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'between':
        if (Array.isArray(filter.value) && filter.value.length === 2) {
          return value >= filter.value[0] && value <= filter.value[1];
        }
        return false;
      default:
        return true;
    }
  }

  /**
   * Get field value from result
   */
  private getFieldValue(result: SearchResult, field: string): string | number | Date {
    const fields: Record<string, string | number | Date> = {
      id: result.id,
      name: result.name,
      description: result.description || '',
      category: result.category,
      similarity: result.similarity,
    };

    return fields[field] || '';
  }

  /**
   * Apply sorting to results
   */
  private applySorting(
    results: SearchResult[],
    sort?: { field: string; direction: 'asc' | 'desc' },
  ): SearchResult[] {
    if (!sort) return results;

    return [...results].sort((a, b) => {
      const aVal = this.getFieldValue(a, sort.field);
      const bVal = this.getFieldValue(b, sort.field);

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Apply pagination to results
   */
  private applyPagination(
    results: SearchResult[],
    pagination?: { limit: number; offset: number },
  ): SearchResult[] {
    if (!pagination) return results;

    const { limit, offset } = pagination;
    return results.slice(offset, offset + limit);
  }

  /**
   * Compute aggregation
   */
  private computeAggregation(
    data: SearchResult[],
    field: string,
    func: 'count' | 'sum' | 'avg' | 'min' | 'max',
  ): number {
    if (func === 'count') {
      return data.length;
    }

    const values = data
      .map((item) => this.getFieldValue(item, field))
      .filter((v) => typeof v === 'number') as number[];

    if (values.length === 0) return 0;

    switch (func) {
      case 'sum':
        return values.reduce((sum, v) => sum + v, 0);
      case 'avg':
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return 0;
    }
  }

  /**
   * Check if query exceeds timeout
   */
  private isTimedOut(context: ExecutionContext): boolean {
    return Date.now() - context.startTime >= context.timeout;
  }
}
