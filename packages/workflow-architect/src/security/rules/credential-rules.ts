/**
 * Credential Security Rules
 * Detects hardcoded secrets, exposed credentials, and credential misuse
 */

import type { SecurityRule, Vulnerability } from '../types.js';
import { CWE } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Common secret patterns
 */
const SECRET_PATTERNS = {
  // API Keys and tokens
  apiKey: /(?:api[_-]?key|apikey|access[_-]?key)["\s:=]+([a-zA-Z0-9_\-]{20,})/gi,
  bearerToken: /bearer\s+([a-zA-Z0-9_\-\.]{20,})/gi,
  jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

  // AWS credentials
  awsAccessKey: /AKIA[0-9A-Z]{16}/g,
  awsSecretKey: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)["\s:=]+([a-zA-Z0-9/+=]{40})/gi,

  // Generic secrets
  password: /(?:password|passwd|pwd)["\s:=]+([^\s"',}{]{8,})/gi,
  secret: /(?:secret|token)["\s:=]+([a-zA-Z0-9_\-]{16,})/gi,

  // Base64 encoded (potential secrets)
  base64Long: /(?:^|[^a-zA-Z0-9])([a-zA-Z0-9+/]{64,}={0,2})(?:[^a-zA-Z0-9]|$)/g,

  // Private keys
  privateKey: /-----BEGIN\s+(?:RSA|EC|OPENSSH|DSA|ENCRYPTED)?\s*PRIVATE KEY-----/gi,

  // OAuth tokens
  oauth: /oauth[_-]?(?:token|secret)["\s:=]+([a-zA-Z0-9_\-]{20,})/gi,

  // Database connection strings with credentials
  dbConnection: /(?:mysql|postgres|mongodb|redis):\/\/[^:]+:[^@]+@/gi,
};

/**
 * Suspicious parameter names that might contain secrets
 */
const SENSITIVE_PARAM_NAMES = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessKey',
  'access_key',
  'privateKey',
  'private_key',
  'clientSecret',
  'client_secret',
  'authToken',
  'auth_token',
  'bearerToken',
  'bearer_token',
  'refreshToken',
  'refresh_token',
];

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
 * Check for hardcoded secrets in parameters
 */
export const hardcodedSecretsRule: SecurityRule = {
  id: 'credential-001',
  name: 'Hardcoded Secrets Detection',
  description: 'Detects hardcoded API keys, passwords, tokens, and other secrets in node parameters',
  severity: 'critical',
  category: 'credential',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check all parameter values recursively
      const checkValue = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check against all secret patterns
          for (const [patternName, pattern] of Object.entries(SECRET_PATTERNS)) {
            pattern.lastIndex = 0; // Reset regex
            const matches = pattern.exec(value);
            if (matches) {
              const evidence = value.length > 100 ? value.substring(0, 100) + '...' : value;
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Hardcoded Secret Detected',
                description: `Found potential ${patternName} hardcoded in node parameters`,
                severity: 'critical',
                category: 'credential',
                nodeName,
                nodeType,
                path,
                evidence,
                remediation: 'Replace hardcoded secret with credential reference or environment variable',
                references: [
                  'https://cwe.mitre.org/data/definitions/798.html',
                  'https://docs.n8n.io/integrations/builtin/credentials/',
                ],
                cwe: CWE.HARDCODED_CREDENTIALS,
              });
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkValue(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkValue(val, `${path}[${idx}]`));
        }
      };

      checkValue(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for exposed credentials in expressions
 */
export const exposedCredentialsInExpressionsRule: SecurityRule = {
  id: 'credential-002',
  name: 'Exposed Credentials in Expressions',
  description: 'Detects credentials or sensitive data exposed through n8n expressions',
  severity: 'high',
  category: 'credential',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkExpressions = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check for expressions that might expose credentials
          const expressionPattern = /\{\{.*?\}\}/g;
          const expressions = value.match(expressionPattern) || [];

          for (const expr of expressions) {
            // Check for credential access patterns
            if (
              expr.includes('$credentials') ||
              expr.includes('$env') ||
              expr.includes('process.env')
            ) {
              // Check if exposed in potentially logged/visible places
              if (
                path.includes('body') ||
                path.includes('response') ||
                path.includes('message') ||
                path.includes('text')
              ) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Credential Exposed in Expression',
                  description: 'Credentials or environment variables accessed in expression that may be logged or exposed',
                  severity: 'high',
                  category: 'credential',
                  nodeName,
                  nodeType,
                  path,
                  evidence: expr,
                  remediation: 'Avoid exposing credentials in response bodies, messages, or logged fields',
                  references: [
                    'https://docs.n8n.io/code-examples/expressions/',
                  ],
                  cwe: CWE.CLEARTEXT_STORAGE,
                });
              }
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkExpressions(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkExpressions(val, `${path}[${idx}]`));
        }
      };

      checkExpressions(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for credentials in HTTP headers
 */
export const credentialsInHeadersRule: SecurityRule = {
  id: 'credential-003',
  name: 'Credentials in HTTP Headers',
  description: 'Detects hardcoded credentials or secrets in HTTP request headers',
  severity: 'high',
  category: 'credential',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check HTTP-related nodes
      if (nodeType.toLowerCase().includes('http') || nodeType.toLowerCase().includes('webhook')) {
        const headers = parameters.headerParameters as Record<string, unknown> | undefined;
        const options = parameters.options as Record<string, unknown> | undefined;

        const checkHeaders = (headerObj: Record<string, unknown> | undefined, path: string): void => {
          if (!headerObj) return;

          const headerValues = headerObj.values as Array<Record<string, unknown>> | undefined;
          if (!headerValues) return;

          for (const header of headerValues) {
            const name = String(header.name || '').toLowerCase();
            const value = String(header.value || '');

            // Check for sensitive headers
            if (
              name === 'authorization' ||
              name === 'x-api-key' ||
              name === 'api-key' ||
              name.includes('token') ||
              name.includes('secret')
            ) {
              // Check if hardcoded (not using credentials or expressions)
              if (value && !value.includes('{{') && !value.includes('$credentials')) {
                // Check if looks like a secret
                for (const [patternName, pattern] of Object.entries(SECRET_PATTERNS)) {
                  pattern.lastIndex = 0;
                  if (pattern.test(value)) {
                    vulnerabilities.push({
                      id: uuidv4(),
                      title: 'Hardcoded Credential in HTTP Header',
                      description: `Hardcoded ${patternName} found in ${name} header`,
                      severity: 'high',
                      category: 'credential',
                      nodeName,
                      nodeType,
                      path: `${path}.${name}`,
                      evidence: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
                      remediation: 'Use n8n credentials or secure credential storage instead of hardcoding',
                      references: [
                        'https://docs.n8n.io/integrations/builtin/credentials/',
                      ],
                      cwe: CWE.HARDCODED_CREDENTIALS,
                    });
                    break;
                  }
                }
              }
            }
          }
        };

        checkHeaders(headers as Record<string, unknown> | undefined, `${nodeName}.headers`);
        if (options) {
          checkHeaders(options.headers as Record<string, unknown> | undefined, `${nodeName}.options.headers`);
        }
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for sensitive parameter names with hardcoded values
 */
export const sensitiveParameterNamesRule: SecurityRule = {
  id: 'credential-004',
  name: 'Sensitive Parameter Names',
  description: 'Detects parameters with sensitive names (password, secret, token, etc.) that contain hardcoded values',
  severity: 'medium',
  category: 'credential',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkParams = (params: Record<string, unknown>, path: string): void => {
        for (const [key, value] of Object.entries(params)) {
          const lowerKey = key.toLowerCase();

          // Check if parameter name is sensitive
          if (SENSITIVE_PARAM_NAMES.some(name => lowerKey.includes(name.toLowerCase()))) {
            // Check if value is hardcoded (not using credentials or expressions)
            if (typeof value === 'string' && value && !value.includes('{{') && !value.includes('$credentials')) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Sensitive Parameter with Hardcoded Value',
                description: `Parameter "${key}" appears to contain sensitive data but is hardcoded`,
                severity: 'medium',
                category: 'credential',
                nodeName,
                nodeType,
                path: `${path}.${key}`,
                evidence: value.substring(0, 20) + '***',
                remediation: 'Use n8n credentials or environment variables instead of hardcoding sensitive values',
                references: [
                  'https://docs.n8n.io/integrations/builtin/credentials/',
                ],
                cwe: CWE.HARDCODED_CREDENTIALS,
              });
            }
          }

          // Recurse into nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkParams(value as Record<string, unknown>, `${path}.${key}`);
          }
        }
      };

      checkParams(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Export all credential rules
 */
export const credentialRules: SecurityRule[] = [
  hardcodedSecretsRule,
  exposedCredentialsInExpressionsRule,
  credentialsInHeadersRule,
  sensitiveParameterNamesRule,
];
