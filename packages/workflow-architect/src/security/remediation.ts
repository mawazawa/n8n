/**
 * Security Remediation
 * Provides detailed remediation suggestions and auto-fix capabilities
 */

import type { Vulnerability, ScanResult } from './types.js';

/**
 * Remediation details with step-by-step instructions
 */
export interface RemediationGuide {
  vulnerability: Vulnerability;
  steps: string[];
  codeExamples?: {
    before: string;
    after: string;
  };
  autoFixable: boolean;
  estimatedEffort: 'low' | 'medium' | 'high';
  resources: string[];
}

/**
 * Auto-fix result
 */
export interface AutoFixResult {
  success: boolean;
  applied: boolean;
  message: string;
  workflow?: Record<string, unknown>;
  error?: string;
}

/**
 * Get detailed remediation guide for a vulnerability
 */
export function getRemediation(vulnerability: Vulnerability): RemediationGuide {
  const ruleId = vulnerability.id.split('-')[0];

  // Determine if auto-fixable based on rule category
  const autoFixable = isAutoFixable(ruleId);

  // Get specific remediation steps based on rule
  const steps = getRemediationSteps(ruleId, vulnerability);
  const codeExamples = getCodeExamples(ruleId, vulnerability);
  const estimatedEffort = getEstimatedEffort(ruleId, vulnerability);
  const resources = getResources(ruleId, vulnerability);

  return {
    vulnerability,
    steps,
    codeExamples,
    autoFixable,
    estimatedEffort,
    resources,
  };
}

/**
 * Apply auto-fix to a workflow for a specific vulnerability
 */
export function applyAutoFix(
  workflow: Record<string, unknown>,
  vulnerability: Vulnerability,
): AutoFixResult {
  const ruleId = vulnerability.id.split('-')[0];

  // Check if auto-fixable
  if (!isAutoFixable(ruleId)) {
    return {
      success: false,
      applied: false,
      message: 'This vulnerability cannot be auto-fixed',
    };
  }

  try {
    // Clone workflow to avoid mutations
    const fixedWorkflow = JSON.parse(JSON.stringify(workflow));

    // Apply fix based on rule type
    switch (ruleId) {
      case 'configuration-001': // HTTP to HTTPS
        return fixInsecureTransport(fixedWorkflow, vulnerability);

      case 'configuration-002': // Disabled SSL
        return fixDisabledSsl(fixedWorkflow, vulnerability);

      case 'configuration-006': // Debug mode
        return fixDebugMode(fixedWorkflow, vulnerability);

      case 'data-exposure-004': // Data retention
        return fixDataRetention(fixedWorkflow, vulnerability);

      default:
        return {
          success: false,
          applied: false,
          message: `Auto-fix not implemented for rule ${ruleId}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      applied: false,
      message: 'Auto-fix failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate a formatted security report
 */
export function generateSecurityReport(scanResult: ScanResult): string {
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(80));
  lines.push('SECURITY SCAN REPORT');
  lines.push('='.repeat(80));
  lines.push('');

  // Workflow info
  lines.push(`Workflow: ${scanResult.workflowName}`);
  lines.push(`Workflow ID: ${scanResult.workflowId}`);
  lines.push(`Scanned At: ${scanResult.scannedAt}`);
  lines.push(`Duration: ${scanResult.duration}ms`);
  lines.push('');

  // Score
  lines.push('SECURITY SCORE');
  lines.push('-'.repeat(80));
  const scoreBar = generateScoreBar(scanResult.score);
  lines.push(`Score: ${scanResult.score}/100 ${scoreBar}`);
  lines.push('');

  // Summary
  lines.push('VULNERABILITY SUMMARY');
  lines.push('-'.repeat(80));
  lines.push(`Critical: ${scanResult.summary.critical}`);
  lines.push(`High: ${scanResult.summary.high}`);
  lines.push(`Medium: ${scanResult.summary.medium}`);
  lines.push(`Low: ${scanResult.summary.low}`);
  lines.push(`Total: ${scanResult.vulnerabilities.length}`);
  lines.push('');

  // If no vulnerabilities, return early
  if (scanResult.vulnerabilities.length === 0) {
    lines.push('✓ No security vulnerabilities found!');
    lines.push('='.repeat(80));
    return lines.join('\n');
  }

  // Group vulnerabilities by severity
  const bySeverity = {
    critical: scanResult.vulnerabilities.filter(v => v.severity === 'critical'),
    high: scanResult.vulnerabilities.filter(v => v.severity === 'high'),
    medium: scanResult.vulnerabilities.filter(v => v.severity === 'medium'),
    low: scanResult.vulnerabilities.filter(v => v.severity === 'low'),
  };

  // Report each severity level
  for (const [severity, vulns] of Object.entries(bySeverity)) {
    if (vulns.length === 0) continue;

    lines.push('');
    lines.push(`${severity.toUpperCase()} SEVERITY (${vulns.length})`);
    lines.push('='.repeat(80));

    for (let i = 0; i < vulns.length; i++) {
      const vuln = vulns[i];
      lines.push('');
      lines.push(`${i + 1}. ${vuln.title}`);
      lines.push(`   Category: ${vuln.category}`);
      if (vuln.nodeName) {
        lines.push(`   Node: ${vuln.nodeName} (${vuln.nodeType})`);
      }
      if (vuln.path) {
        lines.push(`   Path: ${vuln.path}`);
      }
      lines.push(`   Description: ${vuln.description}`);
      if (vuln.evidence) {
        lines.push(`   Evidence: ${vuln.evidence}`);
      }
      if (vuln.cwe) {
        lines.push(`   CWE: ${vuln.cwe}`);
      }
      lines.push(`   Remediation: ${vuln.remediation}`);

      // Check if auto-fixable
      const autoFixable = isAutoFixable(vuln.id.split('-')[0]);
      if (autoFixable) {
        lines.push('   ✓ Auto-fix available');
      }
    }
  }

  // Recommendations
  lines.push('');
  lines.push('RECOMMENDATIONS');
  lines.push('='.repeat(80));
  lines.push(generateRecommendations(scanResult));

  lines.push('');
  lines.push('='.repeat(80));

  return lines.join('\n');
}

/**
 * Generate HTML security report
 */
export function generateHtmlReport(scanResult: ScanResult): string {
  const severityColors = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#ffc107',
    low: '#17a2b8',
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report - ${scanResult.workflowName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-top: 0; }
    h2 { color: #555; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
    .header { margin-bottom: 30px; }
    .meta { color: #666; font-size: 14px; }
    .score { font-size: 48px; font-weight: bold; color: ${getScoreColor(scanResult.score)}; }
    .score-label { font-size: 14px; color: #666; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin: 30px 0; }
    .summary-item { padding: 20px; border-radius: 6px; text-align: center; }
    .summary-item.critical { background: #dc354520; border-left: 4px solid #dc3545; }
    .summary-item.high { background: #fd7e1420; border-left: 4px solid #fd7e14; }
    .summary-item.medium { background: #ffc10720; border-left: 4px solid #ffc107; }
    .summary-item.low { background: #17a2b820; border-left: 4px solid #17a2b8; }
    .summary-count { font-size: 32px; font-weight: bold; }
    .summary-label { font-size: 14px; color: #666; text-transform: uppercase; }
    .vulnerability { margin: 20px 0; padding: 20px; border-radius: 6px; border-left: 4px solid #ddd; background: #f9f9f9; }
    .vulnerability.critical { border-left-color: #dc3545; }
    .vulnerability.high { border-left-color: #fd7e14; }
    .vulnerability.medium { border-left-color: #ffc107; }
    .vulnerability.low { border-left-color: #17a2b8; }
    .vulnerability-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
    .vulnerability-meta { font-size: 13px; color: #666; margin-bottom: 10px; }
    .vulnerability-description { margin: 10px 0; }
    .vulnerability-evidence { background: #f0f0f0; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; margin: 10px 0; overflow-x: auto; }
    .vulnerability-remediation { background: #e8f4f8; padding: 15px; border-radius: 4px; margin: 10px 0; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 8px; }
    .badge.critical { background: #dc3545; color: white; }
    .badge.high { background: #fd7e14; color: white; }
    .badge.medium { background: #ffc107; color: #000; }
    .badge.low { background: #17a2b8; color: white; }
    .badge.auto-fix { background: #28a745; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Security Scan Report</h1>
      <div class="meta">
        <strong>Workflow:</strong> ${scanResult.workflowName}<br>
        <strong>Workflow ID:</strong> ${scanResult.workflowId}<br>
        <strong>Scanned At:</strong> ${new Date(scanResult.scannedAt).toLocaleString()}<br>
        <strong>Duration:</strong> ${scanResult.duration}ms
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <div class="score">${scanResult.score}</div>
      <div class="score-label">Security Score (0-100)</div>
    </div>

    <h2>Summary</h2>
    <div class="summary">
      <div class="summary-item critical">
        <div class="summary-count">${scanResult.summary.critical}</div>
        <div class="summary-label">Critical</div>
      </div>
      <div class="summary-item high">
        <div class="summary-count">${scanResult.summary.high}</div>
        <div class="summary-label">High</div>
      </div>
      <div class="summary-item medium">
        <div class="summary-count">${scanResult.summary.medium}</div>
        <div class="summary-label">Medium</div>
      </div>
      <div class="summary-item low">
        <div class="summary-count">${scanResult.summary.low}</div>
        <div class="summary-label">Low</div>
      </div>
    </div>

    ${scanResult.vulnerabilities.length > 0 ? `
      <h2>Vulnerabilities</h2>
      ${scanResult.vulnerabilities.map((v, i) => `
        <div class="vulnerability ${v.severity}">
          <div class="vulnerability-title">
            ${i + 1}. ${v.title}
            <span class="badge ${v.severity}">${v.severity}</span>
            ${isAutoFixable(v.id.split('-')[0]) ? '<span class="badge auto-fix">Auto-fix</span>' : ''}
          </div>
          <div class="vulnerability-meta">
            <strong>Category:</strong> ${v.category}
            ${v.nodeName ? ` | <strong>Node:</strong> ${v.nodeName} (${v.nodeType})` : ''}
            ${v.path ? ` | <strong>Path:</strong> ${v.path}` : ''}
            ${v.cwe ? ` | <strong>CWE:</strong> ${v.cwe}` : ''}
          </div>
          <div class="vulnerability-description">${v.description}</div>
          ${v.evidence ? `<div class="vulnerability-evidence">${v.evidence}</div>` : ''}
          <div class="vulnerability-remediation">
            <strong>Remediation:</strong> ${v.remediation}
          </div>
        </div>
      `).join('')}
    ` : '<p>✓ No security vulnerabilities found!</p>'}
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Check if a rule is auto-fixable
 */
function isAutoFixable(ruleId: string): boolean {
  const autoFixableRules = [
    'configuration-001', // HTTP to HTTPS
    'configuration-002', // Disabled SSL
    'configuration-006', // Debug mode
    'data-exposure-004', // Data retention
  ];

  return autoFixableRules.includes(ruleId);
}

/**
 * Get remediation steps for a specific rule
 */
function getRemediationSteps(ruleId: string, vulnerability: Vulnerability): string[] {
  const steps: Record<string, string[]> = {
    'credential-001': [
      'Identify all hardcoded secrets in the workflow',
      'Create proper n8n credentials for each secret',
      'Replace hardcoded values with credential references',
      'Test the workflow to ensure credentials work correctly',
      'Delete or rotate the exposed secrets',
    ],
    'credential-002': [
      'Review all expressions that access credentials',
      'Ensure credentials are not exposed in logged fields',
      'Use intermediate nodes to process sensitive data',
      'Avoid including credentials in response bodies',
    ],
    'credential-003': [
      'Move hardcoded credentials to n8n credential store',
      'Update HTTP headers to reference credentials',
      'Test the API calls with new credential setup',
      'Remove hardcoded values from workflow',
    ],
    'credential-004': [
      'Identify parameters with sensitive names',
      'Move sensitive values to credentials or environment variables',
      'Update references to use secure storage',
      'Verify functionality after changes',
    ],
    'injection-001': [
      'Convert to parameterized queries',
      'Use database-specific parameter syntax',
      'Validate and sanitize all user inputs',
      'Test queries with various inputs including malicious payloads',
      'Review and update security documentation',
    ],
    'injection-002': [
      'Validate all user inputs against allowlist',
      'Escape shell metacharacters properly',
      'Use built-in functions instead of shell commands where possible',
      'Implement input validation at workflow entry points',
      'Test with malicious inputs',
    ],
    'injection-003': [
      'Apply HTML escaping to all user inputs',
      'Use templating engines with auto-escaping',
      'Implement Content Security Policy headers',
      'Test for XSS with common payloads',
    ],
    'injection-004': [
      'Remove eval() and Function constructor usage',
      'Use safer alternatives for dynamic code',
      'Implement strict input validation',
      'Review code execution patterns',
    ],
    'injection-005': [
      'Escape template variables properly',
      'Avoid using |safe filter with user input',
      'Implement template sandboxing',
      'Test templates with malicious inputs',
    ],
    'configuration-001': [
      'Replace HTTP URLs with HTTPS equivalents',
      'Update API endpoints to use secure connections',
      'Verify SSL/TLS certificates',
      'Test connections after update',
    ],
    'configuration-002': [
      'Enable SSL/TLS verification',
      'Install proper certificates if needed',
      'Remove rejectUnauthorized: false settings',
      'Test connections with valid certificates',
    ],
    'configuration-003': [
      'Replace wildcard CORS with specific origins',
      'Create allowlist of trusted domains',
      'Update CORS configuration',
      'Test cross-origin requests',
    ],
    'configuration-004': [
      'Enable webhook authentication',
      'Choose appropriate auth method (Basic, Header, etc.)',
      'Configure authentication credentials',
      'Test webhook with authentication',
      'Document authentication requirements',
    ],
    'configuration-005': [
      'Create allowlist of valid redirect destinations',
      'Validate redirect URLs against allowlist',
      'Reject invalid or suspicious redirects',
      'Test redirect validation',
    ],
    'configuration-006': [
      'Disable debug mode in production',
      'Reduce logging verbosity',
      'Review logs for sensitive data',
      'Implement proper logging strategy',
    ],
    'configuration-007': [
      'Replace weak algorithms with strong alternatives',
      'Use AES-256 for encryption',
      'Use SHA-256 or higher for hashing',
      'Update all affected nodes',
      'Test cryptographic operations',
    ],
    'data-exposure-001': [
      'Identify all PII in workflow',
      'Implement PII masking or redaction',
      'Remove PII from logs and responses',
      'Test data flow to ensure PII is protected',
    ],
    'data-exposure-002': [
      'Use generic error messages for users',
      'Log detailed errors securely on server',
      'Remove sensitive data from error messages',
      'Test error handling',
    ],
    'data-exposure-003': [
      'Implement field masking for sensitive data',
      'Use partial display (e.g., last 4 digits)',
      'Apply masking before output',
      'Test masked outputs',
    ],
    'data-exposure-004': [
      'Configure data retention policies',
      'Set appropriate expiration for workflow data',
      'Implement automated data cleanup',
      'Document retention policies',
    ],
    'data-exposure-005': [
      'Review data collection requirements',
      'Limit data collection to necessary fields',
      'Implement data minimization',
      'Update workflow to collect only required data',
    ],
  };

  return steps[ruleId] || [
    'Review the vulnerability details',
    'Consult security documentation',
    'Implement appropriate controls',
    'Test thoroughly after changes',
    'Document the remediation',
  ];
}

/**
 * Get code examples for remediation
 */
function getCodeExamples(ruleId: string, vulnerability: Vulnerability): { before: string; after: string } | undefined {
  const examples: Record<string, { before: string; after: string }> = {
    'credential-001': {
      before: 'apiKey: "sk_live_1234567890abcdef"',
      after: 'apiKey: "={{$credentials.myApiKey}}"',
    },
    'injection-001': {
      before: 'SELECT * FROM users WHERE id = {{$json.userId}}',
      after: 'SELECT * FROM users WHERE id = $1  // Use parameterized query',
    },
    'configuration-001': {
      before: 'url: "http://api.example.com"',
      after: 'url: "https://api.example.com"',
    },
    'configuration-002': {
      before: 'rejectUnauthorized: false',
      after: 'rejectUnauthorized: true',
    },
  };

  return examples[ruleId];
}

/**
 * Get estimated effort for remediation
 */
function getEstimatedEffort(ruleId: string, vulnerability: Vulnerability): 'low' | 'medium' | 'high' {
  // Auto-fixable issues are low effort
  if (isAutoFixable(ruleId)) {
    return 'low';
  }

  // Injection vulnerabilities typically require medium to high effort
  if (ruleId.startsWith('injection-')) {
    return 'high';
  }

  // Credential issues require medium effort
  if (ruleId.startsWith('credential-')) {
    return 'medium';
  }

  // Configuration issues are usually low effort
  if (ruleId.startsWith('configuration-')) {
    return 'low';
  }

  // Data exposure issues vary
  if (ruleId.startsWith('data-exposure-')) {
    return 'medium';
  }

  return 'medium';
}

/**
 * Get additional resources for remediation
 */
function getResources(ruleId: string, vulnerability: Vulnerability): string[] {
  const resources = vulnerability.references || [];

  // Add general security resources
  resources.push('https://docs.n8n.io/hosting/security/');
  resources.push('https://owasp.org/www-project-top-ten/');

  return resources;
}

/**
 * Fix insecure transport (HTTP to HTTPS)
 */
function fixInsecureTransport(workflow: Record<string, unknown>, vulnerability: Vulnerability): AutoFixResult {
  const nodes = workflow.nodes as Array<Record<string, unknown>> | undefined;
  if (!nodes) {
    return { success: false, applied: false, message: 'No nodes found in workflow' };
  }

  let fixed = false;

  for (const node of nodes) {
    if (node.name === vulnerability.nodeName) {
      const parameters = node.parameters as Record<string, unknown> | undefined;
      if (parameters) {
        // Recursively replace HTTP with HTTPS
        const replaceHttp = (obj: Record<string, unknown>): void => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              if (value.startsWith('http://') && !value.includes('localhost') && !value.includes('127.0.0.1')) {
                obj[key] = value.replace('http://', 'https://');
                fixed = true;
              }
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              replaceHttp(value as Record<string, unknown>);
            }
          }
        };

        replaceHttp(parameters);
      }
    }
  }

  if (fixed) {
    return {
      success: true,
      applied: true,
      message: 'Replaced HTTP with HTTPS',
      workflow,
    };
  }

  return {
    success: false,
    applied: false,
    message: 'No HTTP URLs found to fix',
  };
}

/**
 * Fix disabled SSL verification
 */
function fixDisabledSsl(workflow: Record<string, unknown>, vulnerability: Vulnerability): AutoFixResult {
  const nodes = workflow.nodes as Array<Record<string, unknown>> | undefined;
  if (!nodes) {
    return { success: false, applied: false, message: 'No nodes found in workflow' };
  }

  let fixed = false;

  for (const node of nodes) {
    if (node.name === vulnerability.nodeName) {
      const parameters = node.parameters as Record<string, unknown> | undefined;
      if (parameters) {
        // Fix SSL settings recursively
        const fixSsl = (obj: Record<string, unknown>): void => {
          for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();
            if (
              (lowerKey.includes('ssl') ||
               lowerKey.includes('tls') ||
               lowerKey.includes('rejectunauthorized')) &&
              (value === false || value === 'false' || value === 0)
            ) {
              obj[key] = true;
              fixed = true;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              fixSsl(value as Record<string, unknown>);
            }
          }
        };

        fixSsl(parameters);
      }
    }
  }

  if (fixed) {
    return {
      success: true,
      applied: true,
      message: 'Enabled SSL/TLS verification',
      workflow,
    };
  }

  return {
    success: false,
    applied: false,
    message: 'No SSL settings found to fix',
  };
}

/**
 * Fix debug mode
 */
function fixDebugMode(workflow: Record<string, unknown>, vulnerability: Vulnerability): AutoFixResult {
  const nodes = workflow.nodes as Array<Record<string, unknown>> | undefined;
  if (!nodes) {
    return { success: false, applied: false, message: 'No nodes found in workflow' };
  }

  let fixed = false;

  for (const node of nodes) {
    if (node.name === vulnerability.nodeName) {
      const parameters = node.parameters as Record<string, unknown> | undefined;
      if (parameters) {
        // Fix debug settings recursively
        const fixDebug = (obj: Record<string, unknown>): void => {
          for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();
            if (
              (lowerKey.includes('debug') ||
               lowerKey.includes('verbose') ||
               lowerKey.includes('trace')) &&
              (value === true || value === 'true' || value === 1)
            ) {
              obj[key] = false;
              fixed = true;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              fixDebug(value as Record<string, unknown>);
            }
          }
        };

        fixDebug(parameters);
      }
    }
  }

  if (fixed) {
    return {
      success: true,
      applied: true,
      message: 'Disabled debug mode',
      workflow,
    };
  }

  return {
    success: false,
    applied: false,
    message: 'No debug settings found to fix',
  };
}

/**
 * Fix data retention
 */
function fixDataRetention(workflow: Record<string, unknown>, vulnerability: Vulnerability): AutoFixResult {
  const settings = workflow.settings as Record<string, unknown> | undefined;
  if (!settings) {
    workflow.settings = {};
  }

  const workflowSettings = workflow.settings as Record<string, unknown>;
  workflowSettings.saveDataSuccessExecution = 'none';
  workflowSettings.saveDataErrorExecution = 'none';
  workflowSettings.saveManualExecutions = false;

  return {
    success: true,
    applied: true,
    message: 'Configured data retention to not save execution data',
    workflow,
  };
}

/**
 * Generate score bar visualization
 */
function generateScoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Get color based on score
 */
function getScoreColor(score: number): string {
  if (score >= 80) return '#28a745';
  if (score >= 60) return '#ffc107';
  if (score >= 40) return '#fd7e14';
  return '#dc3545';
}

/**
 * Generate recommendations based on scan results
 */
function generateRecommendations(scanResult: ScanResult): string {
  const recommendations: string[] = [];

  if (scanResult.summary.critical > 0) {
    recommendations.push('• Address all CRITICAL vulnerabilities immediately');
  }

  if (scanResult.summary.high > 0) {
    recommendations.push('• Prioritize HIGH severity vulnerabilities');
  }

  if (scanResult.vulnerabilities.some(v => v.category === 'credential')) {
    recommendations.push('• Use n8n credential store for all secrets and API keys');
  }

  if (scanResult.vulnerabilities.some(v => v.category === 'injection')) {
    recommendations.push('• Implement input validation and parameterized queries');
  }

  if (scanResult.vulnerabilities.some(v => v.category === 'configuration')) {
    recommendations.push('• Review and harden security configurations');
  }

  if (scanResult.vulnerabilities.some(v => v.category === 'data-exposure')) {
    recommendations.push('• Implement data minimization and PII protection');
  }

  const autoFixableCount = scanResult.vulnerabilities.filter(v =>
    isAutoFixable(v.id.split('-')[0])
  ).length;

  if (autoFixableCount > 0) {
    recommendations.push(`• ${autoFixableCount} vulnerabilities can be auto-fixed`);
  }

  if (scanResult.score < 60) {
    recommendations.push('• Consider a comprehensive security review');
  }

  if (recommendations.length === 0) {
    recommendations.push('• Continue following security best practices');
    recommendations.push('• Perform regular security scans');
  }

  return recommendations.join('\n');
}
