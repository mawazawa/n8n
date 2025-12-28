import { z } from 'zod';

/**
 * Self-Healing Workflows Types
 *
 * Core types and enums for automatic workflow healing and recovery
 */

// ============================================================================
// Enums
// ============================================================================

export enum AnomalyType {
  LATENCY = 'LATENCY',
  ERROR_RATE = 'ERROR_RATE',
  MEMORY = 'MEMORY',
  TIMEOUT = 'TIMEOUT',
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  DEGRADED_PERFORMANCE = 'DEGRADED_PERFORMANCE',
}

export enum HealthState {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  CRITICAL = 'CRITICAL',
}

export enum HealingActionType {
  RETRY = 'RETRY',
  RESTART = 'RESTART',
  SCALE = 'SCALE',
  SKIP = 'SKIP',
  ROLLBACK = 'ROLLBACK',
  FALLBACK = 'FALLBACK',
  CIRCUIT_BREAK = 'CIRCUIT_BREAK',
  THROTTLE = 'THROTTLE',
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  WEBHOOK = 'WEBHOOK',
  SMS = 'SMS',
}

export enum NotificationSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const AnomalyTypeSchema = z.nativeEnum(AnomalyType);
export const HealthStateSchema = z.nativeEnum(HealthState);
export const HealingActionTypeSchema = z.nativeEnum(HealingActionType);
export const CircuitStateSchema = z.nativeEnum(CircuitState);
export const NotificationChannelSchema = z.nativeEnum(NotificationChannel);
export const NotificationSeveritySchema = z.nativeEnum(NotificationSeverity);

export const HealingActionSchema = z.object({
  type: HealingActionTypeSchema,
  target: z.string(),
  params: z.record(z.unknown()),
  priority: z.number().min(0).max(10).default(5),
  maxRetries: z.number().min(0).optional(),
  timeout: z.number().min(0).optional(),
});

export const HealingPolicySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  workflowId: z.string(),
  enabled: z.boolean().default(true),
  triggers: z.array(
    z.object({
      anomalyType: AnomalyTypeSchema,
      threshold: z.number(),
      window: z.number().positive(), // Time window in milliseconds
      condition: z.string().optional(),
    })
  ),
  actions: z.array(HealingActionSchema),
  cooldown: z.number().min(0).default(60000), // Minimum 60s between healing actions
  maxActionsPerHour: z.number().min(1).default(10),
  notifyOnAction: z.boolean().default(true),
});

export const HealingResultSchema = z.object({
  success: z.boolean(),
  action: HealingActionSchema,
  duration: z.number(),
  startedAt: z.number(),
  completedAt: z.number(),
  error: z.string().optional(),
  rollbackPerformed: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const AnomalySchema = z.object({
  id: z.string().uuid().optional(),
  type: AnomalyTypeSchema,
  workflowId: z.string(),
  nodeId: z.string().optional(),
  severity: z.number().min(0).max(1), // 0 = minor, 1 = critical
  detectedAt: z.number(),
  value: z.number(),
  baseline: z.number(),
  deviation: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export const RootCauseSchema = z.object({
  anomalyId: z.string(),
  probableCauses: z.array(
    z.object({
      description: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(z.string()),
      suggestedActions: z.array(HealingActionTypeSchema),
    })
  ),
  affectedComponents: z.array(z.string()),
  errorPropagationPath: z.array(z.string()).optional(),
  timestamp: z.number(),
});

export const HealthMetricSchema = z.object({
  workflowId: z.string(),
  nodeId: z.string().optional(),
  timestamp: z.number(),
  metrics: z.object({
    latency: z.number().optional(),
    errorRate: z.number().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
    throughput: z.number().optional(),
    activeConnections: z.number().optional(),
  }),
  state: HealthStateSchema,
  anomalies: z.array(AnomalySchema).optional(),
});

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().min(1).default(5),
  successThreshold: z.number().min(1).default(2),
  timeout: z.number().min(0).default(60000), // Time in OPEN state before HALF_OPEN
  volumeThreshold: z.number().min(1).default(10), // Minimum requests before circuit can trip
  errorThresholdPercentage: z.number().min(0).max(100).default(50),
  halfOpenMaxCalls: z.number().min(1).default(3),
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10).default(3),
  initialDelay: z.number().min(0).default(1000),
  maxDelay: z.number().min(0).default(60000),
  backoffMultiplier: z.number().min(1).default(2),
  jitter: z.boolean().default(true),
  retryableErrors: z.array(z.string()).optional(),
  timeout: z.number().min(0).optional(),
});

export const FallbackConfigSchema = z.object({
  nodeId: z.string(),
  fallbackPath: z.string(), // Node ID or path to fallback
  cascadingFallbacks: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
  condition: z.string().optional(),
  timeout: z.number().min(0).default(30000),
});

export const RollbackPolicySchema = z.object({
  workflowId: z.string(),
  enabled: z.boolean().default(true),
  triggers: z.array(
    z.object({
      errorRate: z.number().min(0).max(1).optional(),
      consecutiveFailures: z.number().min(1).optional(),
      customCondition: z.string().optional(),
    })
  ),
  targetVersion: z.string().optional(), // If not provided, rolls back to previous version
  partialRollback: z.boolean().default(false),
  affectedNodes: z.array(z.string()).optional(),
  autoRevert: z.boolean().default(false), // Auto-revert if rollback fails
  notifyOnRollback: z.boolean().default(true),
});

export const NotificationConfigSchema = z.object({
  channels: z.array(NotificationChannelSchema),
  severityFilter: z.array(NotificationSeveritySchema).optional(),
  rateLimit: z
    .object({
      maxPerMinute: z.number().min(1).default(10),
      maxPerHour: z.number().min(1).default(100),
    })
    .optional(),
  emailConfig: z
    .object({
      recipients: z.array(z.string().email()),
      subject: z.string().optional(),
    })
    .optional(),
  slackConfig: z
    .object({
      webhookUrl: z.string().url(),
      channel: z.string().optional(),
      mentionUsers: z.array(z.string()).optional(),
    })
    .optional(),
  webhookConfig: z
    .object({
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
});

// ============================================================================
// TypeScript Interfaces (inferred from Zod schemas)
// ============================================================================

export type HealingAction = z.infer<typeof HealingActionSchema>;
export type HealingPolicy = z.infer<typeof HealingPolicySchema>;
export type HealingResult = z.infer<typeof HealingResultSchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
export type RootCause = z.infer<typeof RootCauseSchema>;
export type HealthMetric = z.infer<typeof HealthMetricSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type FallbackConfig = z.infer<typeof FallbackConfigSchema>;
export type RollbackPolicy = z.infer<typeof RollbackPolicySchema>;
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// ============================================================================
// Additional Types
// ============================================================================

export interface HealthEvent {
  type: 'ANOMALY_DETECTED' | 'HEALING_STARTED' | 'HEALING_COMPLETED' | 'HEALING_FAILED' | 'STATE_CHANGED';
  workflowId: string;
  timestamp: number;
  data: unknown;
}

export interface HealingContext {
  workflowId: string;
  executionId?: string;
  anomaly: Anomaly;
  rootCause?: RootCause;
  policy: HealingPolicy;
  previousAttempts: HealingResult[];
}

export interface StatisticalMetrics {
  mean: number;
  median: number;
  stdDev: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface DetectionResult {
  isAnomaly: boolean;
  anomaly?: Anomaly;
  confidence: number;
  method: 'zscore' | 'iqr' | 'ml' | 'threshold';
  explanation: string;
}

export interface CircuitBreakerState {
  nodeId: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;
  totalRequests: number;
  totalFailures: number;
}

export interface FailurePattern {
  id: string;
  errorType: string;
  frequency: number;
  resolution: HealingAction;
  successRate: number;
  avgResolutionTime: number;
  lastOccurred: number;
  metadata: Record<string, unknown>;
}
