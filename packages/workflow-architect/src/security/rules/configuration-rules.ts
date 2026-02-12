/**
 * Configuration Security Rules
 * Detects insecure configurations like HTTP instead of HTTPS, disabled SSL, etc.
 */

import type { SecurityRule, Vulnerability } from '../types.js';
import { CWE } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extract nodes from workflow
 */
function extractNodes(workflow: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(workflow.nodes)) {
    return workflow.nodes as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * Check for HTTP instead of HTTPS
 */
export const insecureTransportRule: SecurityRule = {
  id: 'configuration-001',
  name: 'Insecure Transport Detection',
  description: 'Detects use of HTTP instead of HTTPS for sensitive communications',
  severity: 'high',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkForHttp = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check for HTTP URLs (but not localhost/127.0.0.1 for development)
          const httpMatch = value.match(/http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)([^\s"'<>]+)/gi);
          if (httpMatch) {
            for (const url of httpMatch) {
              // Skip if it's a redirect to HTTPS or a known safe pattern
              if (!url.includes('redirect') && !url.includes('localhost')) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Insecure HTTP Connection',
                  description: 'Connection uses HTTP instead of HTTPS, transmitting data in cleartext',
                  severity: 'high',
                  category: 'configuration',
                  nodeName,
                  nodeType,
                  path,
                  evidence: url,
                  remediation: 'Use HTTPS instead of HTTP to encrypt data in transit',
                  references: [
                    'https://owasp.org/www-community/vulnerabilities/Insecure_Transport',
                  ],
                  cwe: CWE.INSECURE_TRANSPORT,
                });
              }
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkForHttp(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkForHttp(val, `${path}[${idx}]`));
        }
      };

      checkForHttp(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for disabled SSL verification
 */
export const disabledSslVerificationRule: SecurityRule = {
  id: 'configuration-002',
  name: 'Disabled SSL Verification',
  description: 'Detects disabled SSL/TLS certificate verification',
  severity: 'critical',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check for SSL verification settings
      const checkSslSettings = (obj: Record<string, unknown>, path: string): void => {
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();

          // Check for common SSL verification disable flags
          if (
            (lowerKey.includes('ssl') ||
             lowerKey.includes('tls') ||
             lowerKey.includes('verify') ||
             lowerKey.includes('rejectunauthorized') ||
             lowerKey.includes('allowunauthorized')) &&
            (value === false || value === 'false' || value === 0)
          ) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Disabled SSL/TLS Verification',
              description: 'SSL/TLS certificate verification is disabled, allowing man-in-the-middle attacks',
              severity: 'critical',
              category: 'configuration',
              nodeName,
              nodeType,
              path: `${path}.${key}`,
              evidence: `${key}: ${value}`,
              remediation: 'Enable SSL/TLS certificate verification or use proper certificate management',
              references: [
                'https://owasp.org/www-community/vulnerabilities/Insecure_Transport',
              ],
              cwe: CWE.DISABLED_SSL_VERIFICATION,
            });
          }

          // Recurse into nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkSslSettings(value as Record<string, unknown>, `${path}.${key}`);
          }
        }
      };

      checkSslSettings(parameters, `${nodeName}.parameters`);

      // Also check options
      const options = parameters.options as Record<string, unknown> | undefined;
      if (options) {
        checkSslSettings(options, `${nodeName}.options`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for overly permissive CORS settings
 */
export const permissiveCorsRule: SecurityRule = {
  id: 'configuration-003',
  name: 'Overly Permissive CORS',
  description: 'Detects overly permissive Cross-Origin Resource Sharing (CORS) configurations',
  severity: 'medium',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check webhook and HTTP response nodes
      if (
        nodeType.toLowerCase().includes('webhook') ||
        nodeType.toLowerCase().includes('http') ||
        nodeType.toLowerCase().includes('respond')
      ) {
        const checkCors = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check for wildcard CORS
            if (
              (path.toLowerCase().includes('cors') ||
               path.toLowerCase().includes('access-control-allow-origin')) &&
              value === '*'
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Wildcard CORS Configuration',
                description: 'CORS is configured to allow all origins (*), which may expose sensitive data',
                severity: 'medium',
                category: 'configuration',
                nodeName,
                nodeType,
                path,
                evidence: value,
                remediation: 'Restrict CORS to specific trusted origins instead of using wildcard',
                references: [
                  'https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny',
                ],
                cwe: CWE.CORS_MISCONFIGURATION,
              });
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkCors(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkCors(val, `${path}[${idx}]`));
          }
        };

        checkCors(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for missing authentication on webhooks
 */
export const missingWebhookAuthRule: SecurityRule = {
  id: 'configuration-004',
  name: 'Missing Webhook Authentication',
  description: 'Detects webhooks without authentication that may be publicly accessible',
  severity: 'high',
  category: 'authentication',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check webhook nodes
      if (nodeType.toLowerCase().includes('webhook')) {
        const authentication = parameters.authentication;
        const authType = parameters.authType;
        const options = parameters.options as Record<string, unknown> | undefined;

        // Check if authentication is disabled or not configured
        if (
          !authentication ||
          authentication === 'none' ||
          authentication === false ||
          authType === 'none' ||
          (options && (options.authentication === 'none' || options.authentication === false))
        ) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Webhook Without Authentication',
            description: 'Webhook is publicly accessible without authentication',
            severity: 'high',
            category: 'authentication',
            nodeName,
            nodeType,
            path: `${nodeName}.authentication`,
            evidence: 'No authentication configured',
            remediation: 'Enable authentication (Basic Auth, Header Auth, or custom authentication) for webhooks',
            references: [
              'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
            ],
            cwe: CWE.MISSING_AUTHENTICATION,
          });
        }
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for unsafe redirect configurations
 */
export const unsafeRedirectRule: SecurityRule = {
  id: 'configuration-005',
  name: 'Unvalidated Redirect',
  description: 'Detects redirects that may be vulnerable to open redirect attacks',
  severity: 'medium',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkRedirects = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check for redirects with user input
          if (
            (path.toLowerCase().includes('redirect') ||
             path.toLowerCase().includes('location') ||
             value.toLowerCase().includes('redirect')) &&
            /\{\{.*?\$(?:json|input|item|node|query|param)/.test(value)
          ) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Unvalidated Redirect',
              description: 'Redirect URL contains user input without validation',
              severity: 'medium',
              category: 'configuration',
              nodeName,
              nodeType,
              path,
              evidence: value.substring(0, 200),
              remediation: 'Validate redirect URLs against an allowlist of trusted destinations',
              references: [
                'https://owasp.org/www-community/attacks/Unvalidated_Redirects_and_Forwards',
              ],
              cwe: CWE.UNVALIDATED_REDIRECT,
            });
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkRedirects(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkRedirects(val, `${path}[${idx}]`));
        }
      };

      checkRedirects(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for debug mode enabled in production
 */
export const debugModeEnabledRule: SecurityRule = {
  id: 'configuration-006',
  name: 'Debug Mode Enabled',
  description: 'Detects debug mode or verbose logging that may leak sensitive information',
  severity: 'low',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkDebugSettings = (obj: Record<string, unknown>, path: string): void => {
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();

          // Check for debug/verbose flags
          if (
            (lowerKey.includes('debug') ||
             lowerKey.includes('verbose') ||
             lowerKey.includes('trace')) &&
            (value === true || value === 'true' || value === 1 || value === 'on')
          ) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Debug Mode Enabled',
              description: 'Debug or verbose logging is enabled, which may leak sensitive information',
              severity: 'low',
              category: 'configuration',
              nodeName,
              nodeType,
              path: `${path}.${key}`,
              evidence: `${key}: ${value}`,
              remediation: 'Disable debug mode and verbose logging in production environments',
              references: [
                'https://owasp.org/www-community/vulnerabilities/Information_exposure_through_debug_information',
              ],
              cwe: CWE.INFORMATION_DISCLOSURE,
            });
          }

          // Recurse into nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkDebugSettings(value as Record<string, unknown>, `${path}.${key}`);
          }
        }
      };

      checkDebugSettings(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for weak encryption configurations
 */
export const weakEncryptionRule: SecurityRule = {
  id: 'configuration-007',
  name: 'Weak Encryption Configuration',
  description: 'Detects use of weak or outdated encryption algorithms',
  severity: 'high',
  category: 'configuration',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    const weakAlgorithms = ['md5', 'sha1', 'des', 'rc4', 'rc2', 'md4'];

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkEncryption = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();

          // Check for weak algorithms
          for (const weakAlgo of weakAlgorithms) {
            if (
              lowerValue.includes(weakAlgo) &&
              (path.toLowerCase().includes('algorithm') ||
               path.toLowerCase().includes('hash') ||
               path.toLowerCase().includes('encrypt') ||
               path.toLowerCase().includes('cipher'))
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Weak Encryption Algorithm',
                description: `Weak or outdated encryption algorithm detected: ${weakAlgo.toUpperCase()}`,
                severity: 'high',
                category: 'configuration',
                nodeName,
                nodeType,
                path,
                evidence: value,
                remediation: 'Use strong, modern encryption algorithms like AES-256, SHA-256, or better',
                references: [
                  'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography',
                ],
                cwe: CWE.INSECURE_TRANSPORT,
              });
              break;
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkEncryption(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkEncryption(val, `${path}[${idx}]`));
        }
      };

      checkEncryption(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Export all configuration rules
 */
export const configurationRules: SecurityRule[] = [
  insecureTransportRule,
  disabledSslVerificationRule,
  permissiveCorsRule,
  missingWebhookAuthRule,
  unsafeRedirectRule,
  debugModeEnabledRule,
  weakEncryptionRule,
];
