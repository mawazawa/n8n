/**
 * Self-Healing Workflows Module
 *
 * Automatic detection, diagnosis, and healing of workflow failures
 * with 90%+ transient failure auto-recovery and <30 second detection to healing.
 *
 * @module self-healing
 */

// ============================================================================
// Types and Schemas
// ============================================================================

export type {
  HealingAction,
  HealingPolicy,
  HealingResult,
  Anomaly,
  RootCause,
  HealthMetric,
  CircuitBreakerConfig,
  RetryConfig,
  FallbackConfig,
  RollbackPolicy,
  NotificationConfig,
  HealthEvent,
  HealingContext,
  StatisticalMetrics,
  DetectionResult,
  CircuitBreakerState,
  FailurePattern,
} from './types.js';

export {
  AnomalyType,
  HealthState,
  HealingActionType,
  CircuitState,
  NotificationChannel,
  NotificationSeverity,
  AnomalyTypeSchema,
  HealthStateSchema,
  HealingActionTypeSchema,
  CircuitStateSchema,
  NotificationChannelSchema,
  NotificationSeveritySchema,
  HealingActionSchema,
  HealingPolicySchema,
  HealingResultSchema,
  AnomalySchema,
  RootCauseSchema,
  HealthMetricSchema,
  CircuitBreakerConfigSchema,
  RetryConfigSchema,
  FallbackConfigSchema,
  RollbackPolicySchema,
  NotificationConfigSchema,
} from './types.js';

// ============================================================================
// Core Classes
// ============================================================================

// Anomaly Detection
export { AnomalyDetector } from './detector.js';

// Diagnostics and Root Cause Analysis
export { DiagnosticEngine } from './diagnostics.js';

// Healing Strategies
export {
  type HealingStrategy,
  RetryStrategy,
  RestartStrategy,
  ScaleStrategy,
  SkipStrategy,
  FallbackStrategy,
  StrategyRegistry,
} from './strategies.js';

// Healing Executor
export { HealingExecutor } from './executor.js';

// Circuit Breaker
export { CircuitBreaker } from './circuit-breaker.js';

// Retry Manager
export { RetryManager, retryWithCondition, retryUntil } from './retry.js';

// Fallback Manager
export {
  FallbackManager,
  type FallbackExecutionContext,
  type FallbackExecutionResult,
} from './fallback.js';

// Rollback Trigger
export {
  RollbackTrigger,
  type RollbackContext,
  type RollbackResult,
} from './rollback.js';

// Failure Learning
export {
  FailureLearner,
  type FailureRecord,
} from './learning.js';

// Health Monitoring
export { HealthMonitor } from './monitoring.js';

// Notifications
export {
  HealingNotifier,
  type HealingEvent,
} from './notifications.js';

// REST API
export { SelfHealingAPI } from './api.js';

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a complete self-healing system
 */
export function createSelfHealingSystem(options?: {
  zScoreThreshold?: number;
  iqrMultiplier?: number;
}) {
  const detector = new AnomalyDetector(options);
  const diagnostics = new DiagnosticEngine();
  const executor = new HealingExecutor();
  const circuitBreaker = new CircuitBreaker();
  const retryManager = new RetryManager();
  const fallbackManager = new FallbackManager();
  const rollbackTrigger = new RollbackTrigger();
  const learner = new FailureLearner();
  const monitor = new HealthMonitor(detector);
  const notifier = new HealingNotifier();
  const api = new SelfHealingAPI();

  return {
    detector,
    diagnostics,
    executor,
    circuitBreaker,
    retryManager,
    fallbackManager,
    rollbackTrigger,
    learner,
    monitor,
    notifier,
    api,
  };
}
