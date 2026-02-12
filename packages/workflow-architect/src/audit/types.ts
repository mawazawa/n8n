/**
 * Audit Logging Type Definitions
 * Comprehensive audit trail for all system actions with tamper-proof storage
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum AuditEventType {
  // Workflow operations
  WORKFLOW_CREATE = 'workflow.create',
  WORKFLOW_UPDATE = 'workflow.update',
  WORKFLOW_DELETE = 'workflow.delete',
  WORKFLOW_EXECUTE = 'workflow.execute',
  WORKFLOW_PUBLISH = 'workflow.publish',
  WORKFLOW_UNPUBLISH = 'workflow.unpublish',

  // Authentication events
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_LOGIN_FAILED = 'user.login_failed',
  USER_PASSWORD_CHANGE = 'user.password_change',
  USER_PASSWORD_RESET = 'user.password_reset',

  // User management
  USER_CREATE = 'user.create',
  USER_UPDATE = 'user.update',
  USER_DELETE = 'user.delete',
  USER_DISABLE = 'user.disable',
  USER_ENABLE = 'user.enable',

  // Permission changes
  PERMISSION_GRANT = 'permission.grant',
  PERMISSION_REVOKE = 'permission.revoke',
  ROLE_ASSIGN = 'role.assign',
  ROLE_REMOVE = 'role.remove',

  // Data access
  DATA_READ = 'data.read',
  DATA_EXPORT = 'data.export',
  DATA_IMPORT = 'data.import',

  // API operations
  API_REQUEST = 'api.request',
  API_ERROR = 'api.error',

  // Security events
  SECURITY_SCAN = 'security.scan',
  SECURITY_ALERT = 'security.alert',
  SECURITY_VIOLATION = 'security.violation',

  // Configuration changes
  CONFIG_UPDATE = 'config.update',
  SETTINGS_CHANGE = 'settings.change',

  // Integration events
  INTEGRATION_INSTALL = 'integration.install',
  INTEGRATION_UNINSTALL = 'integration.uninstall',
  INTEGRATION_AUTH = 'integration.auth',

  // Execution events
  EXECUTION_START = 'execution.start',
  EXECUTION_SUCCESS = 'execution.success',
  EXECUTION_FAILURE = 'execution.failure',
  EXECUTION_CANCEL = 'execution.cancel',

  // System events
  SYSTEM_START = 'system.start',
  SYSTEM_STOP = 'system.stop',
  SYSTEM_ERROR = 'system.error',
  BACKUP_CREATE = 'backup.create',
  BACKUP_RESTORE = 'backup.restore',
}

export type ResourceType =
  | 'workflow'
  | 'user'
  | 'execution'
  | 'credential'
  | 'role'
  | 'permission'
  | 'setting'
  | 'integration'
  | 'template'
  | 'api_key'
  | 'webhook'
  | 'schedule'
  | 'notification'
  | 'system';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Actor {
  userId: string;
  email?: string;
  name?: string;
  ip: string;
  userAgent?: string;
  sessionId?: string;
  impersonatedBy?: string; // For admin impersonation tracking
}

export interface Resource {
  type: ResourceType;
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  requestId?: string;
  workflowId?: string;
  executionId?: string;
  organizationId?: string;
  environment?: string;
  version?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ChangeRecord {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actor: Actor;
  resource: Resource;
  action: string;
  description: string;
  changes?: ChangeRecord[];
  context?: AuditContext;
  success: boolean;
  error?: string;
  duration?: number; // milliseconds
  signature?: string; // Cryptographic signature for tamper detection
  previousEventHash?: string; // Hash of previous event for chain verification
}

export interface AuditQuery {
  eventTypes?: AuditEventType[];
  actorId?: string;
  resourceType?: ResourceType;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  severity?: AuditSeverity[];
  searchText?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'severity' | 'eventType';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditSearchResult {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
  cursor?: string;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface AuditEventRow {
  id: string;
  timestamp: string;
  event_type: AuditEventType;
  severity: AuditSeverity;
  actor_user_id: string;
  actor_email: string | null;
  actor_name: string | null;
  actor_ip: string;
  actor_user_agent: string | null;
  actor_session_id: string | null;
  actor_impersonated_by: string | null;
  resource_type: ResourceType;
  resource_id: string;
  resource_name: string | null;
  resource_metadata: Record<string, unknown> | null;
  action: string;
  description: string;
  changes: ChangeRecord[] | null;
  context: AuditContext | null;
  success: boolean;
  error: string | null;
  duration: number | null;
  signature: string | null;
  previous_event_hash: string | null;
  created_at: string;
  partition_date: string; // For partitioning by month
}

export interface AuditArchiveRow {
  id: string;
  timestamp: string;
  event_type: AuditEventType;
  severity: AuditSeverity;
  actor_user_id: string;
  resource_type: ResourceType;
  resource_id: string;
  action: string;
  description: string;
  context: AuditContext | null;
  success: boolean;
  archived_at: string;
  original_data: Record<string, unknown>; // Compressed original event
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const ActorSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  ip: z.string().ip(),
  userAgent: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  impersonatedBy: z.string().uuid().optional(),
});

export const ResourceSchema = z.object({
  type: z.enum([
    'workflow',
    'user',
    'execution',
    'credential',
    'role',
    'permission',
    'setting',
    'integration',
    'template',
    'api_key',
    'webhook',
    'schedule',
    'notification',
    'system',
  ]),
  id: z.string(),
  name: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ChangeRecordSchema = z.object({
  field: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

export const AuditContextSchema = z.object({
  requestId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  environment: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).catchall(z.unknown());

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  eventType: z.nativeEnum(AuditEventType),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  actor: ActorSchema,
  resource: ResourceSchema,
  action: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  changes: z.array(ChangeRecordSchema).optional(),
  context: AuditContextSchema.optional(),
  success: z.boolean(),
  error: z.string().optional(),
  duration: z.number().min(0).optional(),
  signature: z.string().optional(),
  previousEventHash: z.string().optional(),
});

export const AuditQuerySchema = z.object({
  eventTypes: z.array(z.nativeEnum(AuditEventType)).optional(),
  actorId: z.string().uuid().optional(),
  resourceType: z.enum([
    'workflow',
    'user',
    'execution',
    'credential',
    'role',
    'permission',
    'setting',
    'integration',
    'template',
    'api_key',
    'webhook',
    'schedule',
    'notification',
    'system',
  ]).optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  severity: z.array(z.enum(['info', 'warning', 'error', 'critical'])).optional(),
  searchText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['timestamp', 'severity', 'eventType']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface SplunkConfig {
  host: string;
  port: number;
  token: string;
  index?: string;
  sourcetype?: string;
  ssl?: boolean;
}

export interface ElasticConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  index: string;
  ssl?: boolean;
  apiKey?: string;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'splunk' | 'elastic';
  includeSignatures?: boolean;
  includeChanges?: boolean;
  batchSize?: number;
}

export interface ExportResult {
  success: boolean;
  eventsExported: number;
  format: string;
  destination?: string;
  error?: string;
  duration: number;
}

// ============================================================================
// RETENTION TYPES
// ============================================================================

export interface RetentionPolicy {
  name: string;
  description: string;
  duration: number; // days to keep in hot storage
  archiveAfter: number; // days before archiving to cold storage
  deleteAfter?: number; // days before permanent deletion (undefined = never delete)
  eventTypes?: AuditEventType[]; // Apply to specific event types only
  severities?: AuditSeverity[]; // Apply to specific severities only
}

export interface RetentionResult {
  policyName: string;
  eventsArchived: number;
  eventsDeleted: number;
  bytesArchived: number;
  bytesDeleted: number;
  duration: number;
  errors: string[];
}

// ============================================================================
// COMPLIANCE TYPES
// ============================================================================

export interface ComplianceReport {
  reportType: string;
  generatedAt: string;
  period: { start: string; end: string };
  totalEvents: number;
  summary: Record<string, unknown>;
  details: unknown[];
  metadata?: Record<string, unknown>;
}

export interface SOC2Report extends ComplianceReport {
  reportType: 'SOC2';
  summary: {
    totalLogins: number;
    failedLogins: number;
    permissionChanges: number;
    dataAccess: number;
    configChanges: number;
    securityAlerts: number;
  };
  details: Array<{
    category: string;
    count: number;
    events: AuditEvent[];
  }>;
}

export interface GDPRReport extends ComplianceReport {
  reportType: 'GDPR';
  userId: string;
  summary: {
    dataAccessed: number;
    dataExported: number;
    dataModified: number;
    dataDeleted: number;
  };
  details: AuditEvent[];
}

export interface AccessReport extends ComplianceReport {
  reportType: 'ACCESS';
  resourceId: string;
  resourceType: ResourceType;
  summary: {
    totalAccess: number;
    uniqueUsers: number;
    modifications: number;
    exports: number;
  };
  details: Array<{
    actor: Actor;
    accessCount: number;
    lastAccess: string;
    actions: string[];
  }>;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface AlertCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches_regex';
  value: unknown;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: AlertCondition[];
  threshold?: number; // Number of matching events to trigger alert
  timeWindow?: number; // Minutes to evaluate threshold
  actions: AlertAction[];
  cooldown?: number; // Minutes before triggering again
  lastTriggered?: string;
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, unknown>;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  triggeredAt: string;
  matchingEvents: AuditEvent[];
  severity: AuditSeverity;
  message: string;
  actionResults: Array<{
    type: string;
    success: boolean;
    error?: string;
  }>;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface DashboardStats {
  period: { start: string; end: string };
  totalEvents: number;
  eventsBySeverity: Record<AuditSeverity, number>;
  eventsByType: Record<AuditEventType, number>;
  topActors: Array<{ userId: string; email?: string; count: number }>;
  topResources: Array<{ type: ResourceType; id: string; name?: string; count: number }>;
  failureRate: number;
  averageDuration: number;
  securityEvents: number;
  authenticationEvents: number;
}

export interface TimelineData {
  interval: 'hour' | 'day' | 'week' | 'month';
  dataPoints: Array<{
    timestamp: string;
    count: number;
    severity: Record<AuditSeverity, number>;
  }>;
}

export interface ActorStats {
  userId: string;
  email?: string;
  name?: string;
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  lastActivity: string;
  suspiciousActivityScore: number;
}

export interface ResourceStats {
  type: ResourceType;
  id: string;
  name?: string;
  totalAccess: number;
  uniqueActors: number;
  lastAccessed: string;
  modifications: number;
  eventsByType: Record<AuditEventType, number>;
}

// ============================================================================
// DIFF TYPES
// ============================================================================

export interface DiffOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

export interface Diff {
  operations: DiffOperation[];
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

export interface HumanReadableDiff {
  field: string;
  action: 'added' | 'removed' | 'changed';
  oldValue?: string;
  newValue?: string;
  masked?: boolean; // True if value was masked for security
}

// ============================================================================
// SIGNING TYPES
// ============================================================================

export interface SignedEvent extends AuditEvent {
  signature: string;
  previousEventHash: string;
  publicKeyId: string;
}

export interface SignatureVerification {
  valid: boolean;
  event: AuditEvent;
  error?: string;
  chainIntegrity?: boolean; // True if chain verification succeeded
}

export interface KeyPair {
  id: string;
  publicKey: string;
  privateKey: string;
  algorithm: 'RSA-SHA256' | 'ECDSA-SHA256';
  createdAt: string;
  expiresAt?: string;
  rotatedAt?: string;
}
