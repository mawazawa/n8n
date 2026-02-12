/**
 * PCI-DSS Compliance Checker
 * Verify workflows comply with PCI-DSS requirements for cardholder data
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  PCIComplianceResult,
  PCIFinding,
  ComplianceStatus,
} from './types';

export class PCIChecker {
  // PCI-DSS Requirements
  private readonly requirements = [
    {
      id: '1',
      name: 'Install and maintain a firewall configuration',
      description: 'Protect cardholder data with proper network security',
    },
    {
      id: '2',
      name: 'Do not use vendor-supplied defaults',
      description: 'Change default passwords and security parameters',
    },
    {
      id: '3',
      name: 'Protect stored cardholder data',
      description: 'Encrypt storage of cardholder data',
    },
    {
      id: '4',
      name: 'Encrypt transmission of cardholder data',
      description: 'Encrypt cardholder data across open, public networks',
    },
    {
      id: '6',
      name: 'Develop and maintain secure systems',
      description: 'Protect systems against malware and vulnerabilities',
    },
    {
      id: '7',
      name: 'Restrict access to cardholder data',
      description: 'Limit access based on business need to know',
    },
    {
      id: '8',
      name: 'Identify and authenticate access',
      description: 'Assign unique ID to each person with computer access',
    },
    {
      id: '9',
      name: 'Restrict physical access',
      description: 'Restrict physical access to cardholder data',
    },
    {
      id: '10',
      name: 'Track and monitor all access',
      description: 'Track and monitor all access to network resources and cardholder data',
    },
    {
      id: '11',
      name: 'Regularly test security systems',
      description: 'Test security systems and processes regularly',
    },
    {
      id: '12',
      name: 'Maintain an information security policy',
      description: 'Maintain a policy that addresses information security',
    },
  ];

  // Cardholder data patterns
  private readonly cardPatterns = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    generic: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  };

  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Check workflow for PCI-DSS compliance
   */
  async checkCompliance(workflow: Record<string, unknown>): Promise<PCIComplianceResult> {
    const workflowId = workflow.id as string;
    const findings: PCIFinding[] = [];

    // Detect cardholder data
    const cardholderDataDetected = this.detectCardholderData(workflow);

    if (cardholderDataDetected) {
      // Check each requirement
      for (const requirement of this.requirements) {
        const finding = this.checkRequirement(requirement, workflow);
        findings.push(finding);
      }
    }

    // Verify encryption
    const encryptionVerified = this.verifyEncryption(workflow);

    // Verify access controls
    const accessControlVerified = this.verifyAccessControl(workflow);

    // Determine overall status
    const status = this.determineStatus(findings, cardholderDataDetected, encryptionVerified, accessControlVerified);

    // Generate recommendations
    const recommendations = this.generateRecommendations(findings, encryptionVerified, accessControlVerified);

    return {
      workflowId,
      status,
      checkedAt: new Date().toISOString(),
      findings,
      cardholderDataDetected,
      encryptionVerified,
      accessControlVerified,
      recommendations,
    };
  }

  /**
   * Detect cardholder data in workflow
   */
  private detectCardholderData(workflow: Record<string, unknown>): boolean {
    const workflowString = JSON.stringify(workflow).toLowerCase();

    // Check for credit card related keywords
    const keywords = ['card', 'credit', 'payment', 'pan', 'cvv', 'expiry', 'cardholder'];
    const hasKeywords = keywords.some((keyword) => workflowString.includes(keyword));

    if (!hasKeywords) {
      return false;
    }

    // Check for card number patterns
    const dataString = JSON.stringify(workflow);
    for (const pattern of Object.values(this.cardPatterns)) {
      if (pattern.test(dataString)) {
        return true;
      }
    }

    return hasKeywords; // If keywords present, assume cardholder data
  }

  /**
   * Check a specific PCI-DSS requirement
   */
  private checkRequirement(
    requirement: { id: string; name: string; description: string },
    workflow: Record<string, unknown>,
  ): PCIFinding {
    let status: ComplianceStatus = ComplianceStatus.COMPLIANT;
    const evidence: string[] = [];

    switch (requirement.id) {
      case '3': // Protect stored cardholder data
        if (!this.hasDataEncryption(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No encryption detected for stored data');
        } else {
          evidence.push('Data encryption configured');
        }
        break;

      case '4': // Encrypt transmission
        if (!this.hasTransmissionEncryption(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No TLS/SSL encryption for transmission');
        } else {
          evidence.push('TLS encryption enabled');
        }
        break;

      case '7': // Restrict access
        if (!this.hasAccessRestriction(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No access restrictions configured');
        } else {
          evidence.push('Access restrictions in place');
        }
        break;

      case '8': // Identify and authenticate
        if (!this.hasAuthentication(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No authentication mechanism found');
        } else {
          evidence.push('Authentication configured');
        }
        break;

      case '10': // Track and monitor
        if (!this.hasAuditLogging(workflow)) {
          status = ComplianceStatus.NON_COMPLIANT;
          evidence.push('No audit logging configured');
        } else {
          evidence.push('Audit logging enabled');
        }
        break;

      default:
        status = ComplianceStatus.PENDING_REVIEW;
        evidence.push('Manual review required');
    }

    return {
      requirementId: requirement.id,
      requirementName: requirement.name,
      status,
      description: requirement.description,
      evidence,
    };
  }

  /**
   * Check if data encryption is enabled
   */
  private hasDataEncryption(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.encryption === true || settings?.dataEncryption === true;
  }

  /**
   * Check if transmission encryption is enabled
   */
  private hasTransmissionEncryption(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.tls === true || settings?.ssl === true;
  }

  /**
   * Check if access restriction is configured
   */
  private hasAccessRestriction(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.accessControl === true || settings?.rbac === true;
  }

  /**
   * Check if authentication is enabled
   */
  private hasAuthentication(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.authentication === true || settings?.requireAuth === true;
  }

  /**
   * Check if audit logging is enabled
   */
  private hasAuditLogging(workflow: Record<string, unknown>): boolean {
    const settings = workflow.settings as Record<string, unknown> | undefined;
    return settings?.auditLog === true || settings?.logging?.enabled === true;
  }

  /**
   * Verify encryption
   */
  private verifyEncryption(workflow: Record<string, unknown>): boolean {
    return this.hasDataEncryption(workflow) && this.hasTransmissionEncryption(workflow);
  }

  /**
   * Verify access control
   */
  private verifyAccessControl(workflow: Record<string, unknown>): boolean {
    return this.hasAccessRestriction(workflow) && this.hasAuthentication(workflow);
  }

  /**
   * Determine overall compliance status
   */
  private determineStatus(
    findings: PCIFinding[],
    cardholderDataDetected: boolean,
    encryptionVerified: boolean,
    accessControlVerified: boolean,
  ): ComplianceStatus {
    if (!cardholderDataDetected) {
      return ComplianceStatus.COMPLIANT;
    }

    const nonCompliant = findings.filter((f) => f.status === ComplianceStatus.NON_COMPLIANT);

    if (nonCompliant.length > 0 || !encryptionVerified || !accessControlVerified) {
      return ComplianceStatus.NON_COMPLIANT;
    }

    const pendingReview = findings.filter((f) => f.status === ComplianceStatus.PENDING_REVIEW);
    if (pendingReview.length > 0) {
      return ComplianceStatus.PENDING_REVIEW;
    }

    return ComplianceStatus.COMPLIANT;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    findings: PCIFinding[],
    encryptionVerified: boolean,
    accessControlVerified: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (!encryptionVerified) {
      recommendations.push('Enable encryption for both stored and transmitted cardholder data');
    }

    if (!accessControlVerified) {
      recommendations.push('Implement strong access controls and authentication');
    }

    const nonCompliant = findings.filter((f) => f.status === ComplianceStatus.NON_COMPLIANT);
    for (const finding of nonCompliant) {
      recommendations.push(`Address Requirement ${finding.requirementId}: ${finding.requirementName}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Conduct quarterly vulnerability scans');
      recommendations.push('Perform annual PCI-DSS compliance assessment');
      recommendations.push('Maintain comprehensive security documentation');
    }

    return recommendations;
  }
}
