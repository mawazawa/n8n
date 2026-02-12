/**
 * Security Scanner
 * Scans n8n workflows for security vulnerabilities
 */

import type {
  ScanResult,
  ScanOptions,
  Vulnerability,
  SecurityRule,
} from './types.js';
import { SEVERITY_WEIGHTS } from './types.js';
import { allRules, getCriticalRules } from './rules/index.js';

/**
 * Scan history storage (in-memory for now)
 * Limited to prevent unbounded memory growth
 */
const scanHistory = new Map<string, ScanResult[]>();
const MAX_WORKFLOWS_IN_HISTORY = 1000; // Maximum number of workflows to track
const MAX_SCANS_PER_WORKFLOW = 50; // Maximum scans per workflow
const workflowAccessOrder: string[] = []; // Track LRU order for eviction

/**
 * SecurityScanner class
 * Provides comprehensive security scanning for n8n workflows
 */
export class SecurityScanner {
  private rules: SecurityRule[];

  constructor(customRules?: SecurityRule[]) {
    this.rules = customRules || allRules;
  }

  /**
   * Perform a full security scan on a workflow
   */
  async scan(
    workflow: Record<string, unknown>,
    options: ScanOptions = {},
  ): Promise<ScanResult> {
    const startTime = Date.now();

    // Get workflow metadata
    const workflowId = String(workflow.id || 'unknown');
    const workflowName = String(workflow.name || 'Untitled Workflow');

    // Determine which rules to run
    let rulesToRun = this.rules;

    // Apply skipRules filter
    if (options.skipRules && options.skipRules.length > 0) {
      rulesToRun = rulesToRun.filter(rule => !options.skipRules!.includes(rule.id));
    }

    // Add custom rules
    if (options.customRules && options.customRules.length > 0) {
      rulesToRun = [...rulesToRun, ...options.customRules];
    }

    // Run all applicable rules
    const allVulnerabilities: Vulnerability[] = [];

    for (const rule of rulesToRun) {
      try {
        const vulnerabilities = rule.check(workflow);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error(`Error running rule ${rule.id}:`, error);
        // Continue with other rules even if one fails
      }
    }

    // Calculate duration
    const duration = Date.now() - startTime;

    // Create scan result
    const scanResult: ScanResult = {
      workflowId,
      workflowName,
      scannedAt: new Date().toISOString(),
      duration,
      vulnerabilities: allVulnerabilities,
      score: this.calculateScore(allVulnerabilities),
      summary: this.calculateSummary(allVulnerabilities),
    };

    // Store in history
    this.storeScanHistory(workflowId, scanResult);

    return scanResult;
  }

  /**
   * Perform a quick scan for critical issues only
   */
  async quickScan(workflow: Record<string, unknown>): Promise<ScanResult> {
    const startTime = Date.now();

    // Get workflow metadata
    const workflowId = String(workflow.id || 'unknown');
    const workflowName = String(workflow.name || 'Untitled Workflow');

    // Run only critical rules
    const criticalRules = getCriticalRules();
    const allVulnerabilities: Vulnerability[] = [];

    for (const rule of criticalRules) {
      try {
        const vulnerabilities = rule.check(workflow);
        allVulnerabilities.push(...vulnerabilities);
      } catch (error) {
        console.error(`Error running rule ${rule.id}:`, error);
      }
    }

    // Calculate duration
    const duration = Date.now() - startTime;

    // Create scan result
    const scanResult: ScanResult = {
      workflowId,
      workflowName,
      scannedAt: new Date().toISOString(),
      duration,
      vulnerabilities: allVulnerabilities,
      score: this.calculateScore(allVulnerabilities),
      summary: this.calculateSummary(allVulnerabilities),
    };

    return scanResult;
  }

  /**
   * Get scan history for a workflow
   */
  getScanHistory(workflowId: string, limit = 10): ScanResult[] {
    const history = scanHistory.get(workflowId) || [];
    return history.slice(0, limit);
  }

  /**
   * Compare two scan results
   */
  compareScans(
    scanA: ScanResult,
    scanB: ScanResult,
  ): {
    new: Vulnerability[];
    fixed: Vulnerability[];
    unchanged: Vulnerability[];
    scoreChange: number;
  } {
    // Create vulnerability ID maps
    const vulnAMap = new Map(scanA.vulnerabilities.map(v => [this.getVulnKey(v), v]));
    const vulnBMap = new Map(scanB.vulnerabilities.map(v => [this.getVulnKey(v), v]));

    const newVulns: Vulnerability[] = [];
    const fixedVulns: Vulnerability[] = [];
    const unchangedVulns: Vulnerability[] = [];

    // Find new vulnerabilities (in B but not in A)
    for (const [key, vuln] of vulnBMap) {
      if (!vulnAMap.has(key)) {
        newVulns.push(vuln);
      } else {
        unchangedVulns.push(vuln);
      }
    }

    // Find fixed vulnerabilities (in A but not in B)
    for (const [key, vuln] of vulnAMap) {
      if (!vulnBMap.has(key)) {
        fixedVulns.push(vuln);
      }
    }

    // Calculate score change
    const scoreChange = scanB.score - scanA.score;

    return {
      new: newVulns,
      fixed: fixedVulns,
      unchanged: unchangedVulns,
      scoreChange,
    };
  }

  /**
   * Calculate security score (0-100, higher is more secure)
   */
  calculateScore(vulnerabilities: Vulnerability[]): number {
    if (vulnerabilities.length === 0) {
      return 100;
    }

    // Calculate weighted penalty
    let totalPenalty = 0;
    for (const vuln of vulnerabilities) {
      totalPenalty += SEVERITY_WEIGHTS[vuln.severity];
    }

    // Calculate score (max penalty of 500 = score of 0)
    const maxPenalty = 500;
    const score = Math.max(0, 100 - (totalPenalty / maxPenalty) * 100);

    return Math.round(score * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Calculate vulnerability summary by severity
   */
  private calculateSummary(vulnerabilities: Vulnerability[]): {
    critical: number;
    high: number;
    medium: number;
    low: number;
  } {
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary;
  }

  /**
   * Store scan result in history with LRU eviction
   */
  private storeScanHistory(workflowId: string, scanResult: ScanResult): void {
    const history = scanHistory.get(workflowId) || [];
    history.unshift(scanResult); // Add to beginning

    // Keep only last MAX_SCANS_PER_WORKFLOW scans per workflow
    if (history.length > MAX_SCANS_PER_WORKFLOW) {
      history.splice(MAX_SCANS_PER_WORKFLOW);
    }

    scanHistory.set(workflowId, history);

    // Update LRU order for this workflow
    const existingIndex = workflowAccessOrder.indexOf(workflowId);
    if (existingIndex !== -1) {
      workflowAccessOrder.splice(existingIndex, 1);
    }
    workflowAccessOrder.push(workflowId);

    // Evict oldest workflows if we exceed the limit
    while (scanHistory.size > MAX_WORKFLOWS_IN_HISTORY && workflowAccessOrder.length > 0) {
      const oldestWorkflowId = workflowAccessOrder.shift();
      if (oldestWorkflowId) {
        scanHistory.delete(oldestWorkflowId);
      }
    }
  }

  /**
   * Generate a unique key for a vulnerability
   * Used for comparing vulnerabilities across scans
   */
  private getVulnKey(vuln: Vulnerability): string {
    // Use rule ID, node name, and path to uniquely identify a vulnerability
    return `${vuln.id.split('-')[0]}-${vuln.nodeName || 'global'}-${vuln.path || 'root'}`;
  }

  /**
   * Get statistics about the scanner
   */
  getStats(): {
    totalRules: number;
    rulesByCategory: Record<string, number>;
    rulesBySeverity: Record<string, number>;
  } {
    const rulesByCategory: Record<string, number> = {};
    const rulesBySeverity: Record<string, number> = {};

    for (const rule of this.rules) {
      rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
      rulesBySeverity[rule.severity] = (rulesBySeverity[rule.severity] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      rulesByCategory,
      rulesBySeverity,
    };
  }

  /**
   * Clear scan history for a workflow or all workflows
   */
  clearHistory(workflowId?: string): void {
    if (workflowId) {
      scanHistory.delete(workflowId);
    } else {
      scanHistory.clear();
    }
  }

  /**
   * Get vulnerabilities by category
   */
  getVulnerabilitiesByCategory(
    scanResult: ScanResult,
  ): Record<string, Vulnerability[]> {
    const byCategory: Record<string, Vulnerability[]> = {};

    for (const vuln of scanResult.vulnerabilities) {
      if (!byCategory[vuln.category]) {
        byCategory[vuln.category] = [];
      }
      byCategory[vuln.category].push(vuln);
    }

    return byCategory;
  }

  /**
   * Get vulnerabilities by severity
   */
  getVulnerabilitiesBySeverity(
    scanResult: ScanResult,
  ): Record<string, Vulnerability[]> {
    const bySeverity: Record<string, Vulnerability[]> = {};

    for (const vuln of scanResult.vulnerabilities) {
      if (!bySeverity[vuln.severity]) {
        bySeverity[vuln.severity] = [];
      }
      bySeverity[vuln.severity].push(vuln);
    }

    return bySeverity;
  }

  /**
   * Get vulnerabilities by node
   */
  getVulnerabilitiesByNode(
    scanResult: ScanResult,
  ): Record<string, Vulnerability[]> {
    const byNode: Record<string, Vulnerability[]> = {};

    for (const vuln of scanResult.vulnerabilities) {
      const nodeName = vuln.nodeName || 'Global';
      if (!byNode[nodeName]) {
        byNode[nodeName] = [];
      }
      byNode[nodeName].push(vuln);
    }

    return byNode;
  }

  /**
   * Filter vulnerabilities by severity
   */
  filterBySeverity(
    vulnerabilities: Vulnerability[],
    severities: string[],
  ): Vulnerability[] {
    return vulnerabilities.filter(v => severities.includes(v.severity));
  }

  /**
   * Filter vulnerabilities by category
   */
  filterByCategory(
    vulnerabilities: Vulnerability[],
    categories: string[],
  ): Vulnerability[] {
    return vulnerabilities.filter(v => categories.includes(v.category));
  }
}

/**
 * Create a default scanner instance
 */
export function createScanner(customRules?: SecurityRule[]): SecurityScanner {
  return new SecurityScanner(customRules);
}

/**
 * Quick scan helper function
 */
export async function quickScan(workflow: Record<string, unknown>): Promise<ScanResult> {
  const scanner = createScanner();
  return scanner.quickScan(workflow);
}

/**
 * Full scan helper function
 */
export async function fullScan(
  workflow: Record<string, unknown>,
  options?: ScanOptions,
): Promise<ScanResult> {
  const scanner = createScanner();
  return scanner.scan(workflow, options);
}
