/**
 * Governance & Compliance Type Definitions
 * Comprehensive types for policy management, compliance checking, and data governance
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum ComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  UNKNOWN = 'unknown',
  PENDING_REVIEW = 'pending_review',
}

export enum PolicyEnforcementMode {
  BLOCK = 'block',
  WARN = 'warn',
  AUDIT = 'audit',
  DISABLED = 'disabled',
}

export enum RuleSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum DataClassificationLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum ComplianceFramework {
  SOC2 = 'soc2',
  HIPAA = 'hipaa',
  PCI_DSS = 'pci_dss',
  GDPR = 'gdpr',
  CCPA = 'ccpa',
  ISO27001 = 'iso27001',
  NIST = 'nist',
}

// ============================================================================
// POLICY TYPES
// ============================================================================

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: RuleCondition;
  action: RuleAction;
  severity: RuleSeverity;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface RuleCondition {
  type: 'required_field' | 'forbidden_value' | 'pattern_match' | 'custom_expression' | 'composite';
  field?: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'matches' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: unknown;
  pattern?: string;
  expression?: string;
  conditions?: RuleCondition[]; // For composite conditions
  combinator?: 'and' | 'or';
}

export interface RuleAction {
  type: 'block' | 'warn' | 'require_approval' | 'notify' | 'log' | 'custom';
  message?: string;
  approvers?: string[];
  notifyTargets?: string[];
  customHandler?: string;
  metadata?: Record<string, unknown>;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  version: number;
  rules: PolicyRule[];
  enforcement: PolicyEnforcementMode;
  scope: PolicyScope;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyScope {
  workflowIds?: string[];
  workflowTags?: string[];
  organizationIds?: string[];
  userIds?: string[];
  resourceTypes?: string[];
  global?: boolean;
}

export interface PolicyVersion {
  policyId: string;
  version: number;
  policy: Policy;
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

// ============================================================================
// VIOLATION TYPES
// ============================================================================

export interface Violation {
  id: string;
  policyId: string;
  policyName: string;
  ruleId: string;
  ruleName: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  severity: RuleSeverity;
  description: string;
  evidence?: Record<string, unknown>;
  timestamp: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  metadata?: Record<string, unknown>;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: RuleSeverity;
  message?: string;
  evidence?: Record<string, unknown>;
  suggestions?: string[];
}

export interface EnforcementResult {
  allowed: boolean;
  violations: Violation[];
  warnings: string[];
  requiresApproval: boolean;
  approvalRequestId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

export interface ApprovalRequest {
  id: string;
  workflow: {
    id: string;
    name: string;
    description?: string;
  };
  action: string;
  requester: {
    userId: string;
    email: string;
    name?: string;
  };
  approvers: Approver[];
  reason?: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Approver {
  userId: string;
  email: string;
  name?: string;
  level: number; // For multi-level approvals
  status: 'pending' | 'approved' | 'rejected';
  respondedAt?: string;
  comment?: string;
}

export interface ApprovalHistory {
  requestId: string;
  action: string;
  actorId: string;
  timestamp: string;
  comment?: string;
}

// ============================================================================
// DATA CLASSIFICATION TYPES
// ============================================================================

export interface DataClassification {
  dataId: string;
  level: DataClassificationLevel;
  categories: DataCategory[];
  detectedPII: PIIType[];
  detectedPHI: boolean;
  inheritedFrom?: string;
  classifiedAt: string;
  classifiedBy?: string; // 'auto' or userId
  reviewedAt?: string;
  reviewedBy?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export type DataCategory =
  | 'financial'
  | 'health'
  | 'personal_identity'
  | 'credentials'
  | 'intellectual_property'
  | 'legal'
  | 'customer_data'
  | 'employee_data'
  | 'system_data';

export type PIIType =
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'ssn'
  | 'credit_card'
  | 'passport'
  | 'drivers_license'
  | 'ip_address'
  | 'biometric';

// ============================================================================
// ACCESS CONTROL TYPES
// ============================================================================

export interface AccessPolicy {
  resourceType: string;
  resourceId: string;
  permissions: Permission[];
  inheritFrom?: string;
}

export interface Permission {
  principalType: 'user' | 'role' | 'group';
  principalId: string;
  actions: string[];
  conditions?: AccessCondition[];
  expiresAt?: string;
}

export interface AccessCondition {
  type: 'time_based' | 'ip_based' | 'location_based' | 'attribute_based';
  config: Record<string, unknown>;
}

// ============================================================================
// DATA LINEAGE TYPES
// ============================================================================

export interface LineageNode {
  id: string;
  type: 'source' | 'transform' | 'destination';
  name: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

export interface LineageEdge {
  from: string;
  to: string;
  transformType?: string;
  transformDetails?: Record<string, unknown>;
}

export interface LineageGraph {
  dataId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  depth: number;
  generatedAt: string;
}

export interface ImpactAnalysis {
  dataId: string;
  upstreamDependencies: string[];
  downstreamDependencies: string[];
  affectedWorkflows: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

// ============================================================================
// RETENTION TYPES
// ============================================================================

export interface RetentionPolicy {
  id: string;
  name: string;
  resourceType: string;
  duration: number; // days
  action: 'delete' | 'archive' | 'anonymize';
  legalHoldExempt: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionResult {
  policyId: string;
  policyName: string;
  resourcesProcessed: number;
  resourcesDeleted: number;
  resourcesArchived: number;
  resourcesAnonymized: number;
  bytesFreed: number;
  deletionCertificates: DeletionCertificate[];
  errors: string[];
  duration: number;
}

export interface DeletionCertificate {
  id: string;
  resourceType: string;
  resourceId: string;
  deletedAt: string;
  deletedBy: string;
  retentionPolicyId: string;
  hash: string; // Cryptographic hash for verification
  witness?: string; // Optional witness signature
}

export interface LegalHold {
  id: string;
  name: string;
  description: string;
  resourceIds: string[];
  startDate: string;
  endDate?: string;
  custodian: string;
  reason: string;
  active: boolean;
}

// ============================================================================
// PRIVACY TYPES
// ============================================================================

export interface GDPRSettings {
  dataController: string;
  dataProtectionOfficer?: string;
  legalBasis: string[];
  retentionPeriods: Record<string, number>;
  dataProcessors: string[];
  transferMechanisms: string[];
}

export interface CCPASettings {
  businessName: string;
  contactInfo: string;
  categories: string[];
  sources: string[];
  purposes: string[];
  thirdParties: string[];
}

export interface DSARRequest {
  id: string;
  type: 'access' | 'deletion' | 'portability' | 'rectification' | 'restriction';
  userId: string;
  requestedAt: string;
  completedAt?: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  verificationStatus: 'unverified' | 'verified';
  metadata?: Record<string, unknown>;
}

export interface DSARResult {
  requestId: string;
  type: string;
  userId: string;
  data?: Record<string, unknown>;
  deletionCertificates?: DeletionCertificate[];
  processingDetails: string[];
  completedAt: string;
}

// ============================================================================
// COMPLIANCE REPORT TYPES
// ============================================================================

export interface ComplianceReport {
  id: string;
  type: ComplianceFramework;
  period: {
    start: string;
    end: string;
  };
  generatedAt: string;
  generatedBy: string;
  status: ComplianceStatus;
  score?: number;
  findings: ComplianceFinding[];
  evidence: Evidence[];
  recommendations: string[];
  metadata?: Record<string, unknown>;
}

export interface ComplianceFinding {
  id: string;
  controlId: string;
  controlName: string;
  status: ComplianceStatus;
  severity: RuleSeverity;
  description: string;
  evidence: string[];
  remediation?: string;
}

export interface Evidence {
  id: string;
  type: string;
  description: string;
  source: string;
  collectedAt: string;
  data?: Record<string, unknown>;
  attachmentUrl?: string;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export interface ViolationAlert {
  id: string;
  violationId: string;
  severity: RuleSeverity;
  title: string;
  message: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  escalationLevel: number;
  recipients: string[];
  channels: ('email' | 'slack' | 'webhook' | 'sms')[];
  metadata?: Record<string, unknown>;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  conditions: AlertCondition[];
  severity: RuleSeverity;
  escalationPath: EscalationStep[];
  cooldown: number; // minutes
  enabled: boolean;
}

export interface AlertCondition {
  type: 'violation_count' | 'severity_threshold' | 'pattern_match' | 'time_window';
  config: Record<string, unknown>;
}

export interface EscalationStep {
  level: number;
  delayMinutes: number;
  recipients: string[];
  channels: ('email' | 'slack' | 'webhook' | 'sms')[];
}

// ============================================================================
// TRAINING TYPES
// ============================================================================

export interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  category: string;
  duration: number; // minutes
  requiredFor: string[]; // roles or compliance frameworks
  version: number;
  content: string;
  quiz?: TrainingQuiz;
  expirationDays?: number; // How long cert is valid
}

export interface TrainingQuiz {
  questions: QuizQuestion[];
  passingScore: number; // percentage
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface TrainingAssignment {
  id: string;
  userId: string;
  courseId: string;
  assignedAt: string;
  assignedBy: string;
  dueDate?: string;
  completedAt?: string;
  score?: number;
  passed?: boolean;
  certificateId?: string;
}

export interface TrainingStatus {
  userId: string;
  requiredCourses: number;
  completedCourses: number;
  overdueCourses: number;
  certifications: Certification[];
  complianceScore: number;
}

export interface Certification {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  issuedAt: string;
  expiresAt?: string;
  score: number;
  certificateUrl?: string;
}

// ============================================================================
// HIPAA TYPES
// ============================================================================

export interface HIPAAComplianceResult {
  workflowId: string;
  status: ComplianceStatus;
  checkedAt: string;
  findings: HIPAAFinding[];
  phiDetected: boolean;
  encryptionVerified: boolean;
  accessLoggingEnabled: boolean;
  recommendations: string[];
}

export interface HIPAAFinding {
  controlId: string;
  controlName: string;
  status: ComplianceStatus;
  requirement: string;
  implementation: string;
  evidence: string[];
}

// ============================================================================
// PCI-DSS TYPES
// ============================================================================

export interface PCIComplianceResult {
  workflowId: string;
  status: ComplianceStatus;
  checkedAt: string;
  findings: PCIFinding[];
  cardholderDataDetected: boolean;
  encryptionVerified: boolean;
  accessControlVerified: boolean;
  recommendations: string[];
}

export interface PCIFinding {
  requirementId: string;
  requirementName: string;
  status: ComplianceStatus;
  description: string;
  evidence: string[];
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const PolicyRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  condition: z.object({
    type: z.enum(['required_field', 'forbidden_value', 'pattern_match', 'custom_expression', 'composite']),
    field: z.string().optional(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'matches', 'gt', 'lt', 'gte', 'lte']).optional(),
    value: z.unknown().optional(),
    pattern: z.string().optional(),
    expression: z.string().optional(),
    conditions: z.array(z.lazy(() => z.any())).optional(),
    combinator: z.enum(['and', 'or']).optional(),
  }),
  action: z.object({
    type: z.enum(['block', 'warn', 'require_approval', 'notify', 'log', 'custom']),
    message: z.string().optional(),
    approvers: z.array(z.string().uuid()).optional(),
    notifyTargets: z.array(z.string()).optional(),
    customHandler: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  severity: z.nativeEnum(RuleSeverity),
  enabled: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export const PolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  version: z.number().int().positive(),
  rules: z.array(PolicyRuleSchema),
  enforcement: z.nativeEnum(PolicyEnforcementMode),
  scope: z.object({
    workflowIds: z.array(z.string().uuid()).optional(),
    workflowTags: z.array(z.string()).optional(),
    organizationIds: z.array(z.string().uuid()).optional(),
    userIds: z.array(z.string().uuid()).optional(),
    resourceTypes: z.array(z.string()).optional(),
    global: z.boolean().optional(),
  }),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export const ViolationSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  policyName: z.string(),
  ruleId: z.string().uuid(),
  ruleName: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  resourceName: z.string().optional(),
  severity: z.nativeEnum(RuleSeverity),
  description: z.string(),
  evidence: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolvedBy: z.string().uuid().optional(),
  resolution: z.string().optional(),
  status: z.enum(['open', 'acknowledged', 'resolved', 'false_positive']),
  metadata: z.record(z.unknown()).optional(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  workflow: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
  }),
  action: z.string().min(1).max(200),
  requester: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    name: z.string().optional(),
  }),
  approvers: z.array(z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    name: z.string().optional(),
    level: z.number().int().positive(),
    status: z.enum(['pending', 'approved', 'rejected']),
    respondedAt: z.string().datetime().optional(),
    comment: z.string().optional(),
  })),
  reason: z.string().optional(),
  status: z.nativeEnum(ApprovalStatus),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const DataClassificationSchema = z.object({
  dataId: z.string(),
  level: z.nativeEnum(DataClassificationLevel),
  categories: z.array(z.enum(['financial', 'health', 'personal_identity', 'credentials', 'intellectual_property', 'legal', 'customer_data', 'employee_data', 'system_data'])),
  detectedPII: z.array(z.enum(['name', 'email', 'phone', 'address', 'ssn', 'credit_card', 'passport', 'drivers_license', 'ip_address', 'biometric'])),
  detectedPHI: z.boolean(),
  inheritedFrom: z.string().optional(),
  classifiedAt: z.string().datetime(),
  classifiedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const RetentionPolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  resourceType: z.string(),
  duration: z.number().int().positive(),
  action: z.enum(['delete', 'archive', 'anonymize']),
  legalHoldExempt: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DSARRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['access', 'deletion', 'portability', 'rectification', 'restriction']),
  userId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'rejected']),
  verificationStatus: z.enum(['unverified', 'verified']),
  metadata: z.record(z.unknown()).optional(),
});
