/**
 * HIPAA Compliance Checker
 * Verify workflows comply with HIPAA requirements for PHI protection
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  HIPAAComplianceResult,
  HIPAAFinding,
  ComplianceStatus,
} from './types';
import { DataClassifier } from './data-classification';

export class HIPAAChecker {
  private readonly dataClassifier: DataClassifier;

  // HIPAA control requirements
  private readonly controls = [
    {
      id: 'HIPAA-164.308(a)(1)',
      name: 'Security Management Process',
      requirement: 'Implement policies and procedures to prevent, detect, contain, and correct security violations',
    },
    {
      id: 'HIPAA-164.308(a)(3)',
      name: 'Workforce Security',
      requirement: 'Implement procedures to ensure authorized access to ePHI',
    },
    {
      id: 'HIPAA-164.308(a)(4)',
      name: 'Information Access Management',
      requirement: 'Implement policies to authorize access to ePHI',
    },
    {
      id: 'HIPAA-164.308(a)(5)',
      name: 'Security Awareness and Training',
      requirement: 'Implement security awareness and training program',
    },
    {
      id: 'HIPAA-164.310(a)(1)',
      name: 'Facility Access Controls',
      requirement: 'Implement policies to limit physical access to ePHI',
    },
    {
      id: 'HIPAA-164.310(d)(1)',
      name: 'Device and Media Controls',
      requirement: 'Implement policies for disposal of ePHI',
    },
    {
      id: 'HIPAA-164.312(a)(1)',
      name: 'Access Control',
      requirement: 'Implement technical policies to allow only authorized access to ePHI',
    },
    {
      id: 'HIPAA-164.312(b)',
      name: 'Audit Controls',
      requirement: 'Implement hardware, software, and procedures to record and examine activity',
    },
    {
      id: 'HIPAA-164.312(c)(1)',
      name: 'Integrity',
      requirement: 'Implement policies to ensure ePHI is not improperly altered or destroyed',
    },
    {
      id: 'HIPAA-164.312(d)',
      name: 'Person or Entity Authentication',
      requirement: 'Implement procedures to verify identity of persons or entities',
    },
    {
      id: 'HIPAA-164.312(e)(1)',
      name: 'Transmission Security',
      requirement: 'Implement technical security measures to guard against unauthorized access to ePHI',
    },
  ];

  constructor(private readonly supabase: SupabaseClient) {
    this.dataClassifier = new DataClassifier(supabase);
  }

  /**
   * Check workflow for HIPAA compliance
   */
  async checkCompliance(workflow: Record<string, unknown>): Promise<HIPAAComplianceResult> {
    const workflowId = workflow.id as string;
    const findings: HIPAAFinding[] = [];

    // Detect PHI
    const classification = await this.dataClassifier.classify(workflowId, workflow);
    const phiDetected = classification.detectedPHI;

    if (phiDetected) {
      // Check each control
      for (const control of this.controls) {
        const finding = await this.checkControl(control, workflow);
        findings.push(finding);
      }
    }

    // Verify encryption
    const encryptionVerified = this.verifyEncryption(workflow);

    // Verify access logging
    const accessLoggingEnabled = this.verifyAccessLogging(workflow);

    // Determine overall status
    const status = this.determineStatus(findings, phiDetected, encryptionVerified, accessLoggingEnabled);

    // Generate recommendations
    const recommendations = this.generateRecommendations(findings, encryptionVerified, accessLoggingEnabled);

    return {
      workflowId,
      status,
      checkedAt: new Date().toISOString(),
      findings,
      phiDetected,
      encryptionVerified,
      accessLoggingEnabled,
      recommendations,
    };
  }

  /**
   * Check a specific HIPAA control
   */
  private async checkControl(
    control: { id: string; name: string; requirement: string },
    workflow: Record<string, unknown>,
  ): Promise<HIPAAFinding> {
    let status: ComplianceStatus = ComplianceStatus.COMPLIANT;
    const evidence: string[] = [];
    let implementation = '';

    switch (control.id) {
      case 'HIPAA-164.312(a)(1)': // Access Control
        if (!this.hasAccessControl(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No access control mechanisms detected');
        } else {
          implementation = 'Access control configured';
          evidence.push('Access control present');
        }
        break;

      case 'HIPAA-164.312(b)': // Audit Controls
        if (!this.hasAuditLogging(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No audit logging configured');
        } else {
          implementation = 'Audit logging enabled';
          evidence.push('Audit logging configured');
        }
        break;

      case 'HIPAA-164.312(e)(1)': // Transmission Security
        if (!this.hasEncryption(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('Data transmission not encrypted');
        } else {
          implementation = 'TLS encryption enabled';
          evidence.push('Encryption configured');
        }
        break;

      case 'HIPAA-164.312(d)': // Authentication
        if (!this.hasAuthentication(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No authentication configured');
        } else {
          implementation = 'Authentication required';
          evidence.push('Authentication configured');
        }
        break;

      default:
        status = ComplianceStatus.UNKNOWN;
        evidence.push('Manual review required');
    }

    return {
      controlId: control.id,
      controlName: control.name,
      status,
      requirement: control.requirement,
      implementation,
      evidence,
    };
  }

  /**
   * Check if workflow has access control
   */
  private hasAccessControl(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.requireAuth === true || settings?.accessControl === true;
  }

  /**
   * Check if workflow has audit logging
   */
  private hasAuditLogging(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.auditLog === true || settings?.logging?.enabled === true;
  }

  /**
   * Check if workflow has encryption
   */
  private hasEncryption(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.encryption === true || settings?.tls === true;
  }

  /**
   * Check if workflow has authentication
   */
  private hasAuthentication(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.authentication === true || settings?.requireAuth === true;
  }

  /**
   * Verify encryption is enabled
   */
  private verifyEncryption(workflow: Record<string, unknown>): boolean {
    return this.hasEncryption(workflow);
  }

  /**
   * Verify access logging is enabled
   */
  private verifyAccessLogging(workflow: Record<string, unknown>): boolean {
    return this.hasAuditLogging(workflow);
  }

  /**
   * Determine overall compliance status
   */
  private determineStatus(
    findings: HIPAAFinding[],
    phiDetected: boolean,
    encryptionVerified: boolean,
    accessLoggingEnabled: boolean,
  ): ComplianceStatus {
    if (!phiDetected) {
      return ComplianceStatus.COMPLIANT;
    }

    const nonCompliant = findings.filter((f) => f.status === ComplianceStatus.NON_COMPLIANT);

    if (nonCompliant.length > 0 || !encryptionVerified || !accessLoggingEnabled) {
      return ComplianceStatus.NON_COMPLIANT;
    }

    const unknown = findings.filter((f) => f.status === ComplianceStatus.UNKNOWN);
    if (unknown.length > 0) {
      return ComplianceStatus.PENDING_REVIEW;
    }

    return ComplianceStatus.COMPLIANT;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    findings: HIPAAFinding[],
    encryptionVerified: boolean,
    accessLoggingEnabled: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (!encryptionVerified) {
      recommendations.push('Enable TLS encryption for all data transmission');
    }

    if (!accessLoggingEnabled) {
      recommendations.push('Enable comprehensive audit logging for all PHI access');
    }

    const nonCompliant = findings.filter((f) => f.status === ComplianceStatus.NON_COMPLIANT);
    for (const finding of nonCompliant) {
      recommendations.push(`Address ${finding.controlName}: ${finding.requirement}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Conduct regular HIPAA compliance audits');
      recommendations.push('Maintain documentation of security measures');
    }

    return recommendations;
  }
}
