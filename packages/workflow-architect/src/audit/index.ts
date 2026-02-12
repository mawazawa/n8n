/**
 * Audit System - Main Exports
 * Comprehensive audit logging with tamper-proof storage, compliance reports, and real-time alerts
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Core types
  AuditEvent,
  AuditEventType,
  AuditSeverity,
  Actor,
  Resource,
  ResourceType,
  AuditContext,
  ChangeRecord,
  AuditQuery,
  AuditSearchResult,

  // Database row types
  AuditEventRow,
  AuditArchiveRow,

  // Export types
  SplunkConfig,
  ElasticConfig,
  ExportOptions,
  ExportResult,

  // Retention types
  RetentionPolicy,
  RetentionResult,

  // Compliance types
  ComplianceReport,
  SOC2Report,
  GDPRReport,
  AccessReport,

  // Alert types
  AlertRule,
  AlertCondition,
  AlertAction,
  AlertEvent,

  // Dashboard types
  DashboardStats,
  TimelineData,
  ActorStats,
  ResourceStats,

  // Diff types
  Diff,
  DiffOperation,
  HumanReadableDiff,

  // Signing types
  SignedEvent,
  SignatureVerification,
  KeyPair,
} from './types.js';

// Export enums
export { AuditEventType } from './types.js';

// Export schemas
export {
  ActorSchema,
  ResourceSchema,
  ChangeRecordSchema,
  AuditContextSchema,
  AuditEventSchema,
  AuditQuerySchema,
} from './types.js';

// ============================================================================
// LOGGER EXPORTS
// ============================================================================

export { AuditLogger } from './logger.js';
export type { AuditLoggerConfig } from './logger.js';

// ============================================================================
// MIDDLEWARE EXPORTS
// ============================================================================

export {
  auditMiddleware,
  createSimpleAuditMiddleware,
  createDetailedAuditMiddleware,
  createSecurityAuditMiddleware,
} from './middleware.js';
export type { AuditMiddlewareOptions } from './middleware.js';

// ============================================================================
// SEARCH EXPORTS
// ============================================================================

export { AuditSearch } from './search.js';
export type { SearchConfig } from './search.js';

// ============================================================================
// EXPORT FUNCTIONALITY
// ============================================================================

export {
  exportToJSON,
  exportToCSV,
  exportToSplunk,
  exportToElastic,
  exportToNDJSON,
  exportToCloudWatch,
  streamToJSON,
  streamToCSV,
} from './export.js';
export type { CloudWatchEvent } from './export.js';

// ============================================================================
// RETENTION EXPORTS
// ============================================================================

export { RetentionManager, DEFAULT_RETENTION_POLICIES } from './retention.js';
export type { RetentionConfig } from './retention.js';

// ============================================================================
// COMPLIANCE EXPORTS
// ============================================================================

export { ComplianceReporter } from './compliance.js';
export type { ComplianceConfig, ReportFormat } from './compliance.js';

// ============================================================================
// ALERTS EXPORTS
// ============================================================================

export { AlertManager } from './alerts.js';
export type { AlertsConfig } from './alerts.js';

// ============================================================================
// DASHBOARD EXPORTS
// ============================================================================

export { AuditDashboard } from './dashboard.js';
export type { DashboardConfig } from './dashboard.js';

// ============================================================================
// DIFF EXPORTS
// ============================================================================

export {
  computeDiff,
  generateHumanReadableDiff,
  diffToChangeRecords,
  applyPatch,
  generateChangeSummary,
  compareAuditEvents,
} from './diff.js';

// ============================================================================
// SIGNING EXPORTS
// ============================================================================

export {
  generateKeyPair,
  hashEvent,
  signEvent,
  verifySignature,
  verifyChain,
  EventSigner,
  EventVerifier,
  KeyRotationManager,
} from './signing.js';

// ============================================================================
// API EXPORTS
// ============================================================================

export { createAuditAPI } from './api.js';
export type { AuditAPIConfig } from './api.js';

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Create a complete audit system with all components
 */
export function createAuditSystem(config: {
  supabaseUrl: string;
  supabaseKey: string;
  enableSigning?: boolean;
  enableAlerts?: boolean;
}) {
  const logger = new (await import('./logger.js')).AuditLogger({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
    enableSigning: config.enableSigning ?? false,
  });

  const search = new (await import('./search.js')).AuditSearch({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });

  const dashboard = new (await import('./dashboard.js')).AuditDashboard({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });

  const compliance = new (await import('./compliance.js')).ComplianceReporter({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });

  const retention = new (await import('./retention.js')).RetentionManager({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });

  const alerts = config.enableAlerts
    ? new (await import('./alerts.js')).AlertManager({
        supabaseUrl: config.supabaseUrl,
        supabaseKey: config.supabaseKey,
      })
    : undefined;

  return {
    logger,
    search,
    dashboard,
    compliance,
    retention,
    alerts,
  };
}
