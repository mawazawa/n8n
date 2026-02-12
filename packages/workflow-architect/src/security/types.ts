/**
 * Security Scanner Type Definitions
 * Defines types for vulnerability detection and security scanning
 */

export type VulnerabilitySeverity = 'low' | 'medium' | 'high' | 'critical';
export type VulnerabilityCategory = 'credential' | 'injection' | 'configuration' | 'data-exposure' | 'authentication' | 'access-control';

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  category: VulnerabilityCategory;
  nodeName?: string;
  nodeType?: string;
  path?: string;
  evidence?: string;
  remediation: string;
  references?: string[];
  cwe?: string; // Common Weakness Enumeration ID
}

export interface ScanResult {
  workflowId: string;
  workflowName: string;
  scannedAt: string;
  duration: number;
  vulnerabilities: Vulnerability[];
  score: number; // 0-100, higher is more secure
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface ScanOptions {
  skipRules?: string[];
  customRules?: SecurityRule[];
  checkCredentials?: boolean;
  checkConnections?: boolean;
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  severity: VulnerabilitySeverity;
  category: VulnerabilityCategory;
  check: (workflow: Record<string, unknown>) => Vulnerability[];
}

/**
 * Severity weights for score calculation
 */
export const SEVERITY_WEIGHTS = {
  critical: 40,
  high: 20,
  medium: 5,
  low: 1,
} as const;

/**
 * CWE (Common Weakness Enumeration) mappings
 */
export const CWE = {
  HARDCODED_CREDENTIALS: 'CWE-798',
  CLEARTEXT_STORAGE: 'CWE-312',
  SQL_INJECTION: 'CWE-89',
  COMMAND_INJECTION: 'CWE-78',
  XSS: 'CWE-79',
  CODE_INJECTION: 'CWE-94',
  TEMPLATE_INJECTION: 'CWE-1336',
  INSECURE_TRANSPORT: 'CWE-319',
  DISABLED_SSL_VERIFICATION: 'CWE-295',
  CORS_MISCONFIGURATION: 'CWE-942',
  MISSING_AUTHENTICATION: 'CWE-306',
  SENSITIVE_DATA_EXPOSURE: 'CWE-200',
  INFORMATION_DISCLOSURE: 'CWE-209',
  IMPROPER_ACCESS_CONTROL: 'CWE-284',
  UNVALIDATED_REDIRECT: 'CWE-601',
} as const;
