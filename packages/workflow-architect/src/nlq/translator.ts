/**
 * Query Translator
 * Translates parsed natural language queries into structured queries
 */

import type { ParsedQuery, StructuredQuery, QueryFilter, Entity, TimeRange } from './types';
import { Intent, EntityType } from './types';

/**
 * Query translator configuration
 */
export interface QueryTranslatorConfig {
  defaultLimit?: number;
  maxLimit?: number;
  enableComplexConditions?: boolean;
}

/**
 * QueryTranslator converts natural language to structured queries
 */
export class QueryTranslator {
  private config: Required<QueryTranslatorConfig>;

  constructor(config: QueryTranslatorConfig = {}) {
    this.config = {
      defaultLimit: config.defaultLimit ?? 10,
      maxLimit: config.maxLimit ?? 100,
      enableComplexConditions: config.enableComplexConditions ?? true,
    };
  }

  /**
   * Translate parsed query to structured query
   */
  async translate(parsed: ParsedQuery): Promise<StructuredQuery> {
    // Determine query type based on intent
    const queryType = this.getQueryType(parsed.intent);

    // Build filters from entities and existing filters
    const filters = this.buildFilters(parsed);

    // Determine sorting
    const sort = this.determineSorting(parsed);

    // Determine pagination
    const pagination = this.determinePagination(parsed);

    // Build aggregations if needed
    const aggregations = this.buildAggregations(parsed);

    return {
      type: queryType,
      operation: this.getOperation(parsed.intent),
      filters,
      sort,
      pagination,
      aggregations: aggregations.length > 0 ? aggregations : undefined,
    };
  }

  /**
   * Get query type from intent
   */
  private getQueryType(
    intent: Intent,
  ): 'workflow_search' | 'workflow_list' | 'workflow_aggregate' | 'node_search' | 'execution_query' {
    switch (intent) {
      case Intent.SEARCH:
        return 'workflow_search';
      case Intent.LIST:
        return 'workflow_list';
      case Intent.AGGREGATE:
      case Intent.COUNT:
      case Intent.ANALYZE:
        return 'workflow_aggregate';
      case Intent.COMPARE:
        return 'workflow_aggregate';
      default:
        return 'workflow_search';
    }
  }

  /**
   * Get operation name from intent
   */
  private getOperation(intent: Intent): string {
    const operations: Record<Intent, string> = {
      [Intent.SEARCH]: 'search',
      [Intent.LIST]: 'list',
      [Intent.AGGREGATE]: 'aggregate',
      [Intent.COUNT]: 'count',
      [Intent.COMPARE]: 'compare',
      [Intent.EXPLAIN]: 'explain',
      [Intent.CREATE]: 'create',
      [Intent.UPDATE]: 'update',
      [Intent.DELETE]: 'delete',
      [Intent.ANALYZE]: 'analyze',
    };

    return operations[intent] || 'search';
  }

  /**
   * Build filters from parsed query
   */
  private buildFilters(parsed: ParsedQuery): QueryFilter[] {
    const filters: QueryFilter[] = [...parsed.filters];

    // Add filters from entities
    for (const entity of parsed.entities) {
      const filter = this.entityToFilter(entity);
      if (filter) {
        filters.push(filter);
      }
    }

    // Add time range filters
    if (parsed.timeRange) {
      const timeFilters = this.timeRangeToFilters(parsed.timeRange);
      filters.push(...timeFilters);
    }

    return this.deduplicateFilters(filters);
  }

  /**
   * Convert entity to filter
   */
  private entityToFilter(entity: Entity): QueryFilter | null {
    switch (entity.type) {
      case EntityType.STATUS:
        return {
          field: 'status',
          operator: 'eq',
          value: entity.normalized || entity.value,
        };

      case EntityType.CATEGORY:
        return {
          field: 'category',
          operator: 'eq',
          value: entity.normalized || entity.value,
        };

      case EntityType.WORKFLOW:
        if (entity.normalized) {
          return {
            field: 'id',
            operator: 'eq',
            value: entity.normalized,
          };
        }
        return {
          field: 'name',
          operator: 'contains',
          value: entity.value,
        };

      case EntityType.TAG:
        return {
          field: 'tags',
          operator: 'contains',
          value: entity.normalized || entity.value,
        };

      case EntityType.USER:
        return {
          field: 'createdBy',
          operator: 'eq',
          value: entity.normalized || entity.value,
        };

      default:
        return null;
    }
  }

  /**
   * Convert time range to filters
   */
  private timeRangeToFilters(timeRange: TimeRange): QueryFilter[] {
    const filters: QueryFilter[] = [];

    if (timeRange.start) {
      filters.push({
        field: 'createdAt',
        operator: 'gte',
        value: timeRange.start,
      });
    }

    if (timeRange.end) {
      filters.push({
        field: 'createdAt',
        operator: 'lte',
        value: timeRange.end,
      });
    }

    if (timeRange.relative) {
      const { value, unit } = timeRange.relative;
      const now = new Date();
      const start = new Date(now);

      switch (unit) {
        case 'minute':
          start.setMinutes(start.getMinutes() - value);
          break;
        case 'hour':
          start.setHours(start.getHours() - value);
          break;
        case 'day':
          start.setDate(start.getDate() - value);
          break;
        case 'week':
          start.setDate(start.getDate() - value * 7);
          break;
        case 'month':
          start.setMonth(start.getMonth() - value);
          break;
        case 'year':
          start.setFullYear(start.getFullYear() - value);
          break;
      }

      filters.push({
        field: 'createdAt',
        operator: 'gte',
        value: start,
      });
    }

    return filters;
  }

  /**
   * Deduplicate filters
   */
  private deduplicateFilters(filters: QueryFilter[]): QueryFilter[] {
    const seen = new Set<string>();
    const deduped: QueryFilter[] = [];

    for (const filter of filters) {
      const key = `${filter.field}:${filter.operator}:${JSON.stringify(filter.value)}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(filter);
      }
    }

    return deduped;
  }

  /**
   * Determine sorting from query
   */
  private determineSorting(
    parsed: ParsedQuery,
  ): { field: string; direction: 'asc' | 'desc' } | undefined {
    const { normalizedText, intent } = parsed;

    // Check for explicit sorting keywords
    if (normalizedText.includes('oldest') || normalizedText.includes('earliest')) {
      return { field: 'createdAt', direction: 'asc' };
    }

    if (
      normalizedText.includes('newest') ||
      normalizedText.includes('latest') ||
      normalizedText.includes('recent')
    ) {
      return { field: 'createdAt', direction: 'desc' };
    }

    if (normalizedText.includes('most popular') || normalizedText.includes('most used')) {
      return { field: 'usageCount', direction: 'desc' };
    }

    if (normalizedText.includes('alphabetical') || normalizedText.includes('by name')) {
      return { field: 'name', direction: 'asc' };
    }

    // Default sorting based on intent
    if (intent === Intent.LIST || intent === Intent.SEARCH) {
      return { field: 'updatedAt', direction: 'desc' };
    }

    return undefined;
  }

  /**
   * Determine pagination from query
   */
  private determinePagination(parsed: ParsedQuery): { limit: number; offset: number } {
    let limit = this.config.defaultLimit;
    let offset = 0;

    // Look for limit in entities
    const numberEntities = parsed.entities.filter((e) => e.type === EntityType.NUMBER);

    // Check for "first N" or "top N" patterns
    const firstMatch = parsed.normalizedText.match(/\b(?:first|top)\s+(\d+)\b/);
    if (firstMatch) {
      limit = Math.min(parseInt(firstMatch[1], 10), this.config.maxLimit);
    } else if (numberEntities.length > 0) {
      // Use first number entity as limit
      const num = numberEntities[0].normalized as number;
      if (num > 0 && num <= this.config.maxLimit) {
        limit = num;
      }
    }

    // Check for "skip N" or "offset N" patterns
    const skipMatch = parsed.normalizedText.match(/\b(?:skip|offset)\s+(\d+)\b/);
    if (skipMatch) {
      offset = parseInt(skipMatch[1], 10);
    }

    return { limit, offset };
  }

  /**
   * Build aggregations from query
   */
  private buildAggregations(
    parsed: ParsedQuery,
  ): Array<{ field: string; function: 'count' | 'sum' | 'avg' | 'min' | 'max' }> {
    const aggregations: Array<{ field: string; function: 'count' | 'sum' | 'avg' | 'min' | 'max' }> = [];
    const { normalizedText, intent } = parsed;

    // Count aggregations
    if (intent === Intent.COUNT || intent === Intent.AGGREGATE) {
      if (normalizedText.includes('count') || normalizedText.includes('how many')) {
        aggregations.push({ field: 'id', function: 'count' });
      }

      if (normalizedText.includes('total')) {
        aggregations.push({ field: 'id', function: 'count' });
      }

      if (normalizedText.includes('average') || normalizedText.includes('avg')) {
        // Determine what to average
        if (normalizedText.includes('execution time') || normalizedText.includes('duration')) {
          aggregations.push({ field: 'executionTime', function: 'avg' });
        }
      }

      if (normalizedText.includes('sum')) {
        aggregations.push({ field: 'id', function: 'sum' });
      }

      if (normalizedText.includes('min') || normalizedText.includes('minimum')) {
        aggregations.push({ field: 'id', function: 'min' });
      }

      if (normalizedText.includes('max') || normalizedText.includes('maximum')) {
        aggregations.push({ field: 'id', function: 'max' });
      }
    }

    return aggregations;
  }

  /**
   * Generate SQL-like filter expression
   */
  generateFilterExpression(filters: QueryFilter[]): string {
    if (filters.length === 0) return '1=1';

    const expressions = filters.map((filter) => {
      const { field, operator, value } = filter;

      switch (operator) {
        case 'eq':
          return `${field} = ${this.formatValue(value)}`;
        case 'ne':
          return `${field} != ${this.formatValue(value)}`;
        case 'gt':
          return `${field} > ${this.formatValue(value)}`;
        case 'gte':
          return `${field} >= ${this.formatValue(value)}`;
        case 'lt':
          return `${field} < ${this.formatValue(value)}`;
        case 'lte':
          return `${field} <= ${this.formatValue(value)}`;
        case 'contains':
          return `${field} LIKE '%${value}%'`;
        case 'in':
          const values = Array.isArray(value) ? value : [value];
          return `${field} IN (${values.map(this.formatValue).join(', ')})`;
        case 'between':
          if (Array.isArray(value) && value.length === 2) {
            return `${field} BETWEEN ${this.formatValue(value[0])} AND ${this.formatValue(value[1])}`;
          }
          return '1=1';
        default:
          return '1=1';
      }
    });

    return expressions.join(' AND ');
  }

  /**
   * Format value for SQL expression
   */
  private formatValue(value: string | number | Date | (string | number | Date)[]): string {
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return String(value);
  }

  /**
   * Parse temporal expression
   */
  parseTemporalExpression(text: string): TimeRange | undefined {
    const lowerText = text.toLowerCase();

    // Today
    if (lowerText.includes('today')) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    // Yesterday
    if (lowerText.includes('yesterday')) {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    // Last N days/weeks/months
    const relativeMatch = lowerText.match(/\blast\s+(\d+)\s+(day|week|month|year)s?\b/);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2] as 'day' | 'week' | 'month' | 'year';
      return { relative: { value, unit } };
    }

    return undefined;
  }
}
