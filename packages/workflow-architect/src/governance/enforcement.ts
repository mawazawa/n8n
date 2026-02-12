/**
 * Policy Enforcement
 * Enforce governance policies with blocking, warnings, and audit trails
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  EnforcementResult,
  Violation,
  PolicyEnforcementMode,
  RuleSeverity,
} from './types';
import { PolicyManager } from './policies';
import { RuleEngine } from './rules';
import { ApprovalManager } from './approval';

export interface EnforcementContext {
  action: string;
  resource: Record<string, unknown>;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  userId: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

export class PolicyEnforcer {
  private readonly ruleEngine: RuleEngine;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly policyManager: PolicyManager,
    private readonly approvalManager: ApprovalManager,
  ) {
    this.ruleEngine = new RuleEngine();
  }

  /**
   * Enforce policies for an action on a resource
   */
  async enforce(context: EnforcementContext): Promise<EnforcementResult> {
    // Get applicable policies
    const policies = await this.policyManager.getPoliciesForResource(
      context.resourceType,
      context.resourceId,
      context.organizationId,
    );

    const violations: Violation[] = [];
    const warnings: string[] = [];
    let requiresApproval = false;
    let approvalRequestId: string | undefined;

    // Evaluate each policy
    for (const policy of policies) {
      if (!policy.enabled) {
        continue;
      }

      // Evaluate rules
      const results = await this.ruleEngine.evaluate(context.resource, policy.rules);

      // Process failed rules
      for (const result of results) {
        if (result.passed) {
          continue;
        }

        // Create violation
        const violation: Violation = {
          id: uuidv4(),
          policyId: policy.id,
          policyName: policy.name,
          ruleId: result.ruleId,
          ruleName: result.ruleName,
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          resourceName: context.resourceName,
          severity: result.severity,
          description: result.message || 'Rule validation failed',
          evidence: result.evidence,
          timestamp: new Date().toISOString(),
          status: 'open',
        };

        violations.push(violation);

        // Store violation in database
        await this.storeViolation(violation);

        // Determine action based on enforcement mode and rule action
        const rule = policy.rules.find((r) => r.id === result.ruleId);
        if (rule) {
          if (rule.action.type === 'require_approval') {
            requiresApproval = true;
          } else if (rule.action.type === 'warn') {
            warnings.push(result.message || `Warning: ${result.ruleName}`);
          }
        }

        // Audit the enforcement decision
        await this.auditEnforcement(context, violation, policy.enforcement);
      }
    }

    // Determine if action should be blocked
    const allowed = this.shouldAllow(violations, policies);

    // Create approval request if needed
    if (requiresApproval && !allowed) {
      approvalRequestId = await this.createApprovalRequest(context, violations);
    }

    return {
      allowed,
      violations,
      warnings,
      requiresApproval,
      approvalRequestId,
      metadata: {
        policiesEvaluated: policies.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Check compliance without blocking
   */
  async check(
    resourceType: string,
    resourceId: string,
    resource: Record<string, unknown>,
    organizationId?: string,
  ): Promise<EnforcementResult> {
    const context: EnforcementContext = {
      action: 'check',
      resource,
      resourceType,
      resourceId,
      userId: 'system',
      organizationId,
    };

    return this.enforce(context);
  }

  /**
   * Determine if action should be allowed
   */
  private shouldAllow(violations: Violation[], policies: Array<{ enforcement: PolicyEnforcementMode }>): boolean {
    if (violations.length === 0) {
      return true;
    }

    // Check if any policy has blocking enforcement
    const hasBlockingPolicy = policies.some((p) => p.enforcement === PolicyEnforcementMode.BLOCK);

    if (!hasBlockingPolicy) {
      // All policies are in warn or audit mode
      return true;
    }

    // Block if there are any high or critical violations
    const hasCriticalViolation = violations.some(
      (v) => v.severity === RuleSeverity.CRITICAL || v.severity === RuleSeverity.HIGH
    );

    return !hasCriticalViolation;
  }

  /**
   * Store violation in database
   */
  private async storeViolation(violation: Violation): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violations')
      .insert({
        id: violation.id,
        policy_id: violation.policyId,
        policy_name: violation.policyName,
        rule_id: violation.ruleId,
        rule_name: violation.ruleName,
        resource_type: violation.resourceType,
        resource_id: violation.resourceId,
        resource_name: violation.resourceName,
        severity: violation.severity,
        description: violation.description,
        evidence: violation.evidence,
        timestamp: violation.timestamp,
        status: violation.status,
        metadata: violation.metadata,
      });

    if (error) {
      console.error('Failed to store violation:', error);
    }
  }

  /**
   * Audit enforcement decision
   */
  private async auditEnforcement(
    context: EnforcementContext,
    violation: Violation,
    enforcement: PolicyEnforcementMode,
  ): Promise<void> {
    const auditEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event_type: 'governance.enforcement',
      severity: this.mapSeverityToAudit(violation.severity),
      actor_user_id: context.userId,
      actor_ip: '0.0.0.0', // Should be populated from request context
      resource_type: context.resourceType,
      resource_id: context.resourceId,
      resource_name: context.resourceName,
      action: context.action,
      description: `Policy enforcement: ${violation.policyName} - ${violation.ruleName}`,
      context: {
        violationId: violation.id,
        enforcement,
        organizationId: context.organizationId,
      },
      success: enforcement !== PolicyEnforcementMode.BLOCK,
    };

    const { error } = await this.supabase
      .from('audit_events')
      .insert(auditEvent);

    if (error) {
      console.error('Failed to audit enforcement:', error);
    }
  }

  /**
   * Create approval request for policy violations
   */
  private async createApprovalRequest(
    context: EnforcementContext,
    violations: Violation[],
  ): Promise<string> {
    // Get approvers from the first rule that requires approval
    const approvers: string[] = [];

    // In a real implementation, this would fetch the actual approvers
    // For now, we'll use a placeholder
    const request = await this.approvalManager.requestApproval({
      id: uuidv4(),
      workflow: {
        id: context.resourceId,
        name: context.resourceName || 'Unnamed Resource',
      },
      action: context.action,
      requester: {
        userId: context.userId,
        email: 'user@example.com', // Should be fetched from user profile
      },
      approvers: approvers.map((userId, index) => ({
        userId,
        email: 'approver@example.com', // Should be fetched from user profile
        level: index + 1,
        status: 'pending',
      })),
      reason: `Policy violations detected: ${violations.map((v) => v.ruleName).join(', ')}`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      metadata: {
        violations: violations.map((v) => v.id),
      },
    });

    return request.id;
  }

  /**
   * Map rule severity to audit severity
   */
  private mapSeverityToAudit(severity: RuleSeverity): string {
    switch (severity) {
      case RuleSeverity.CRITICAL:
        return 'critical';
      case RuleSeverity.HIGH:
        return 'error';
      case RuleSeverity.MEDIUM:
        return 'warning';
      case RuleSeverity.LOW:
      case RuleSeverity.INFO:
        return 'info';
      default:
        return 'info';
    }
  }

  /**
   * Get violations for a resource
   */
  async getViolations(
    resourceType: string,
    resourceId: string,
    status?: Violation['status'],
  ): Promise<Violation[]> {
    let query = this.supabase
      .from('governance_violations')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get violations: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      policyId: row.policy_id,
      policyName: row.policy_name,
      ruleId: row.rule_id,
      ruleName: row.rule_name,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      severity: row.severity,
      description: row.description,
      evidence: row.evidence,
      timestamp: row.timestamp,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolution: row.resolution,
      status: row.status,
      metadata: row.metadata,
    }));
  }

  /**
   * Resolve a violation
   */
  async resolveViolation(
    violationId: string,
    resolution: string,
    resolvedBy: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violations')
      .update({
        status: 'resolved',
        resolution,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', violationId);

    if (error) {
      throw new Error(`Failed to resolve violation: ${error.message}`);
    }
  }

  /**
   * Mark violation as false positive
   */
  async markFalsePositive(violationId: string, resolvedBy: string): Promise<void> {
    const { error } = await this.supabase
      .from('governance_violations')
      .update({
        status: 'false_positive',
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', violationId);

    if (error) {
      throw new Error(`Failed to mark as false positive: ${error.message}`);
    }
  }
}
