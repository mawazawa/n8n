/**
 * Natural Language Query Types
 * Core types for NLQ system including queries, results, intents, and entities
 */

import { z } from 'zod';
import type { WorkflowDefinition } from '../types/workflow';

/**
 * Query intent types
 */
export enum Intent {
  SEARCH = 'search',
  AGGREGATE = 'aggregate',
  COMPARE = 'compare',
  EXPLAIN = 'explain',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  COUNT = 'count',
  ANALYZE = 'analyze',
}

/**
 * Entity types that can be extracted from queries
 */
export enum EntityType {
  WORKFLOW = 'workflow',
  NODE = 'node',
  DATE = 'date',
  NUMBER = 'number',
  USER = 'user',
  STATUS = 'status',
  CATEGORY = 'category',
  TAG = 'tag',
  METRIC = 'metric',
}

/**
 * Entity extracted from query
 */
export interface Entity {
  type: EntityType;
  value: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number;
  normalized?: string | number | Date;
}

/**
 * Natural language query input
 */
export interface NLQuery {
  text: string;
  context?: QueryContext;
  userId?: string;
  sessionId?: string;
  timestamp?: Date;
}

/**
 * Query context for reference resolution
 */
export interface QueryContext {
  previousQueries?: string[];
  currentWorkflow?: WorkflowDefinition;
  userPreferences?: UserPreferences;
  referencedEntities?: Map<string, Entity>;
}

/**
 * User preferences for query handling
 */
export interface UserPreferences {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  resultFormat?: 'table' | 'list' | 'natural' | 'json';
  maxResults?: number;
  categories?: string[];
}

/**
 * Parsed query with extracted information
 */
export interface ParsedQuery {
  originalText: string;
  normalizedText: string;
  tokens: string[];
  intent: Intent;
  intentConfidence: number;
  entities: Entity[];
  filters: QueryFilter[];
  timeRange?: TimeRange;
}

/**
 * Filter extracted from query
 */
export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between';
  value: string | number | Date | (string | number | Date)[];
}

/**
 * Time range for temporal queries
 */
export interface TimeRange {
  start?: Date;
  end?: Date;
  relative?: {
    value: number;
    unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  };
}

/**
 * Structured query ready for execution
 */
export interface StructuredQuery {
  type: 'workflow_search' | 'workflow_list' | 'workflow_aggregate' | 'node_search' | 'execution_query';
  operation: string;
  filters: QueryFilter[];
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  pagination?: {
    limit: number;
    offset: number;
  };
  aggregations?: {
    field: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max';
  }[];
}

/**
 * Query execution result
 */
export interface ExecutionResult {
  success: boolean;
  data: unknown;
  rowCount?: number;
  executionTime: number;
  cached?: boolean;
}

/**
 * Query result returned to user
 */
export interface QueryResult {
  answer: string;
  sources: ResultSource[];
  confidence: number;
  data?: unknown;
  visualization?: VisualizationSuggestion;
  followUpQuestions?: string[];
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
}

/**
 * Source of information in result
 */
export interface ResultSource {
  type: 'workflow' | 'documentation' | 'example' | 'execution';
  id: string;
  name: string;
  url?: string;
  relevance: number;
}

/**
 * Visualization suggestion for result
 */
export interface VisualizationSuggestion {
  type: 'table' | 'chart' | 'list' | 'timeline' | 'graph';
  config?: Record<string, unknown>;
}

/**
 * Conversation context tracking
 */
export interface ConversationContext {
  userId: string;
  sessionId: string;
  history: ConversationTurn[];
  preferences: UserPreferences;
  entityMemory: Map<string, Entity>;
  lastUpdated: Date;
}

/**
 * Single conversation turn
 */
export interface ConversationTurn {
  query: NLQuery;
  parsedQuery: ParsedQuery;
  result: QueryResult;
  timestamp: Date;
  feedback?: Feedback;
}

/**
 * User feedback on query result
 */
export interface Feedback {
  queryId: string;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  helpful: boolean;
  comment?: string;
  timestamp: Date;
}

/**
 * Query suggestion
 */
export interface Suggestion {
  text: string;
  type: 'completion' | 'correction' | 'similar' | 'popular';
  confidence: number;
  metadata?: {
    category?: string;
    usageCount?: number;
  };
}

/**
 * Cached query result
 */
export interface CachedResult {
  queryHash: string;
  result: QueryResult;
  timestamp: Date;
  ttl: number;
  hitCount: number;
}

/**
 * Query analytics data
 */
export interface QueryAnalytics {
  queryId: string;
  userId: string;
  queryText: string;
  intent: Intent;
  success: boolean;
  executionTime: number;
  resultCount: number;
  confidence: number;
  cached: boolean;
  timestamp: Date;
  feedback?: Feedback;
}

/**
 * Ambiguity in query requiring clarification
 */
export interface QueryAmbiguity {
  type: 'entity' | 'intent' | 'reference' | 'scope';
  description: string;
  options: string[];
  confidence: number;
}

// Zod validation schemas

export const NLQuerySchema = z.object({
  text: z.string().min(1).max(1000),
  context: z
    .object({
      previousQueries: z.array(z.string()).optional(),
      currentWorkflow: z.unknown().optional(),
      userPreferences: z
        .object({
          language: z.string().optional(),
          timezone: z.string().optional(),
          dateFormat: z.string().optional(),
          resultFormat: z.enum(['table', 'list', 'natural', 'json']).optional(),
          maxResults: z.number().int().positive().optional(),
          categories: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.date().optional(),
});

export const FeedbackSchema = z.object({
  queryId: z.string().uuid(),
  userId: z.string(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
  timestamp: z.date(),
});

export const SuggestionRequestSchema = z.object({
  partial: z.string().min(1).max(500),
  userId: z.string().optional(),
  limit: z.number().int().positive().max(10).default(5),
});

export const HistoryRequestSchema = z.object({
  userId: z.string(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export type NLQueryInput = z.infer<typeof NLQuerySchema>;
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
export type SuggestionRequest = z.infer<typeof SuggestionRequestSchema>;
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;
