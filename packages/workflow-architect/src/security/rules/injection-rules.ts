/**
 * Injection Vulnerability Rules
 * Detects SQL injection, command injection, XSS, code injection, and template injection
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
 * SQL injection patterns
 */
const SQL_INJECTION_PATTERNS = [
  // Unparameterized queries with user input
  /(?:select|insert|update|delete|drop|create|alter)\s+.+\{\{.*?\$(?:json|input|item|node)/gi,
  // String concatenation in SQL
  /(?:select|insert|update|delete)\s+.+\+\s*\{\{/gi,
  // Direct variable interpolation
  /WHERE\s+.+\{\{.*?\$(?:json|input|item|node)/gi,
];

/**
 * Command injection patterns
 */
const COMMAND_INJECTION_PATTERNS = [
  // Shell metacharacters with user input
  /[;&|`$()]\s*\{\{.*?\$(?:json|input|item|node)/gi,
  // Common dangerous commands
  /(?:bash|sh|cmd|powershell|eval|exec|system)\s*.*\{\{.*?\$(?:json|input|item|node)/gi,
];

/**
 * XSS patterns
 */
const XSS_PATTERNS = [
  // Unescaped user input in HTML
  /<(?:script|iframe|object|embed).*?\{\{.*?\$(?:json|input|item|node)/gi,
  // Event handlers with user input
  /on(?:click|load|error|mouse|key)\s*=.*?\{\{.*?\$(?:json|input|item|node)/gi,
  // javascript: protocol
  /href\s*=\s*["']?javascript:.*?\{\{.*?\$(?:json|input|item|node)/gi,
];

/**
 * Code injection patterns
 */
const CODE_INJECTION_PATTERNS = [
  // eval() with user input
  /eval\s*\(.*?\$(?:json|input|item|node)/gi,
  // Function constructor
  /new\s+Function\s*\(.*?\$(?:json|input|item|node)/gi,
  // setTimeout/setInterval with string
  /set(?:Timeout|Interval)\s*\(.*?\$(?:json|input|item|node)/gi,
];

/**
 * Template injection patterns
 */
const TEMPLATE_INJECTION_PATTERNS = [
  // Unescaped template variables
  /\{\{.*?\$(?:json|input|item|node).*?\|safe/gi,
  // Direct template rendering
  /template\s*\(.*?\$(?:json|input|item|node)/gi,
];

/**
 * Database node types
 */
const DATABASE_NODE_TYPES = [
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
  'n8n-nodes-base.microsoftSql',
  'n8n-nodes-base.mongoDb',
  'n8n-nodes-base.sqlite',
  'n8n-nodes-base.questDb',
  'n8n-nodes-base.snowflake',
];

/**
 * Check for SQL injection vulnerabilities
 */
export const sqlInjectionRule: SecurityRule = {
  id: 'injection-001',
  name: 'SQL Injection Detection',
  description: 'Detects potential SQL injection vulnerabilities in database queries',
  severity: 'critical',
  category: 'injection',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check database nodes
      if (DATABASE_NODE_TYPES.some(type => nodeType.includes(type))) {
        const checkForSqlInjection = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check for SQL injection patterns
            for (const pattern of SQL_INJECTION_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(value)) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Potential SQL Injection',
                  description: 'Query contains user input that may not be properly sanitized',
                  severity: 'critical',
                  category: 'injection',
                  nodeName,
                  nodeType,
                  path,
                  evidence: value.substring(0, 200),
                  remediation: 'Use parameterized queries or prepared statements instead of string concatenation',
                  references: [
                    'https://owasp.org/www-community/attacks/SQL_Injection',
                    'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
                  ],
                  cwe: CWE.SQL_INJECTION,
                });
                break;
              }
            }

            // Check for lack of parameterization
            if (
              (value.toLowerCase().includes('select') ||
               value.toLowerCase().includes('insert') ||
               value.toLowerCase().includes('update') ||
               value.toLowerCase().includes('delete')) &&
              value.includes('{{') &&
              !value.includes('$parameter') &&
              !value.includes('$params')
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Unparameterized SQL Query',
                description: 'SQL query uses string interpolation instead of parameterized queries',
                severity: 'high',
                category: 'injection',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 200),
                remediation: 'Use parameterized queries to prevent SQL injection',
                references: [
                  'https://owasp.org/www-community/attacks/SQL_Injection',
                ],
                cwe: CWE.SQL_INJECTION,
              });
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkForSqlInjection(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkForSqlInjection(val, `${path}[${idx}]`));
          }
        };

        checkForSqlInjection(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for command injection vulnerabilities
 */
export const commandInjectionRule: SecurityRule = {
  id: 'injection-002',
  name: 'Command Injection Detection',
  description: 'Detects potential command injection vulnerabilities in Execute Command nodes',
  severity: 'critical',
  category: 'injection',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check Execute Command and Shell nodes
      if (
        nodeType.includes('executeCommand') ||
        nodeType.includes('shell') ||
        nodeType.toLowerCase().includes('execute')
      ) {
        const checkForCommandInjection = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check for command injection patterns
            for (const pattern of COMMAND_INJECTION_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(value)) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Potential Command Injection',
                  description: 'Command contains user input that may not be properly sanitized',
                  severity: 'critical',
                  category: 'injection',
                  nodeName,
                  nodeType,
                  path,
                  evidence: value.substring(0, 200),
                  remediation: 'Validate and sanitize all user input, use allowlists for acceptable values',
                  references: [
                    'https://owasp.org/www-community/attacks/Command_Injection',
                  ],
                  cwe: CWE.COMMAND_INJECTION,
                });
                break;
              }
            }

            // Check for shell metacharacters with user input
            if (
              /[;&|`$()]/.test(value) &&
              /\{\{.*?\$(?:json|input|item|node)/.test(value)
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Shell Metacharacters with User Input',
                description: 'Command contains shell metacharacters combined with user input',
                severity: 'high',
                category: 'injection',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 200),
                remediation: 'Avoid using shell metacharacters or properly escape user input',
                references: [
                  'https://owasp.org/www-community/attacks/Command_Injection',
                ],
                cwe: CWE.COMMAND_INJECTION,
              });
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkForCommandInjection(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkForCommandInjection(val, `${path}[${idx}]`));
          }
        };

        checkForCommandInjection(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for XSS vulnerabilities
 */
export const xssRule: SecurityRule = {
  id: 'injection-003',
  name: 'Cross-Site Scripting (XSS) Detection',
  description: 'Detects potential XSS vulnerabilities in HTML/webhook responses',
  severity: 'high',
  category: 'injection',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check HTML, HTTP, and Webhook nodes
      if (
        nodeType.toLowerCase().includes('html') ||
        nodeType.toLowerCase().includes('http') ||
        nodeType.toLowerCase().includes('webhook') ||
        nodeType.toLowerCase().includes('respond')
      ) {
        const checkForXss = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check for XSS patterns
            for (const pattern of XSS_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(value)) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Potential Cross-Site Scripting (XSS)',
                  description: 'HTML output contains unescaped user input',
                  severity: 'high',
                  category: 'injection',
                  nodeName,
                  nodeType,
                  path,
                  evidence: value.substring(0, 200),
                  remediation: 'Properly escape all user input before including in HTML output',
                  references: [
                    'https://owasp.org/www-community/attacks/xss/',
                    'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
                  ],
                  cwe: CWE.XSS,
                });
                break;
              }
            }

            // Check for unescaped user input in HTML context
            if (
              value.includes('<') &&
              value.includes('>') &&
              /\{\{.*?\$(?:json|input|item|node)/.test(value) &&
              !value.includes('|htmlEscape') &&
              !value.includes('|escape')
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Unescaped User Input in HTML',
                description: 'User input included in HTML without proper escaping',
                severity: 'medium',
                category: 'injection',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 200),
                remediation: 'Apply HTML escaping to all user input before including in HTML',
                references: [
                  'https://owasp.org/www-community/attacks/xss/',
                ],
                cwe: CWE.XSS,
              });
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkForXss(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkForXss(val, `${path}[${idx}]`));
          }
        };

        checkForXss(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for code injection in Function nodes
 */
export const codeInjectionRule: SecurityRule = {
  id: 'injection-004',
  name: 'Code Injection Detection',
  description: 'Detects potential code injection vulnerabilities in Function/Code nodes',
  severity: 'critical',
  category: 'injection',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check Function and Code nodes
      if (
        nodeType.toLowerCase().includes('function') ||
        nodeType.toLowerCase().includes('code')
      ) {
        const checkForCodeInjection = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check for code injection patterns
            for (const pattern of CODE_INJECTION_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(value)) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Potential Code Injection',
                  description: 'Code contains eval() or Function constructor with user input',
                  severity: 'critical',
                  category: 'injection',
                  nodeName,
                  nodeType,
                  path,
                  evidence: value.substring(0, 200),
                  remediation: 'Avoid using eval(), Function constructor, or dynamic code execution with user input',
                  references: [
                    'https://owasp.org/www-community/attacks/Code_Injection',
                  ],
                  cwe: CWE.CODE_INJECTION,
                });
                break;
              }
            }

            // Check for require() with user input (Node.js specific)
            if (/require\s*\(.*?\$(?:json|input|item|node)/.test(value)) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Dynamic Module Loading with User Input',
                description: 'Code uses require() with user-controlled input',
                severity: 'high',
                category: 'injection',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 200),
                remediation: 'Avoid loading modules dynamically based on user input',
                references: [
                  'https://owasp.org/www-community/attacks/Code_Injection',
                ],
                cwe: CWE.CODE_INJECTION,
              });
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkForCodeInjection(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkForCodeInjection(val, `${path}[${idx}]`));
          }
        };

        checkForCodeInjection(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for template injection
 */
export const templateInjectionRule: SecurityRule = {
  id: 'injection-005',
  name: 'Template Injection Detection',
  description: 'Detects potential template injection vulnerabilities in string interpolation',
  severity: 'high',
  category: 'injection',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      const checkForTemplateInjection = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check for template injection patterns
          for (const pattern of TEMPLATE_INJECTION_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(value)) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Potential Template Injection',
                description: 'Template contains unescaped user input or unsafe filters',
                severity: 'high',
                category: 'injection',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 200),
                remediation: 'Properly escape template variables and avoid using |safe filter with user input',
                references: [
                  'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/18-Testing_for_Server-side_Template_Injection',
                ],
                cwe: CWE.TEMPLATE_INJECTION,
              });
              break;
            }
          }

          // Check for nested template expressions (potential double evaluation)
          if (/\{\{.*?\{\{.*?\}\}.*?\}\}/.test(value)) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Nested Template Expressions',
              description: 'Nested template expressions may lead to double evaluation',
              severity: 'medium',
              category: 'injection',
              nodeName,
              nodeType,
              path,
              evidence: value.substring(0, 200),
              remediation: 'Avoid nested template expressions or ensure proper escaping',
              references: [
                'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/18-Testing_for_Server-side_Template_Injection',
              ],
              cwe: CWE.TEMPLATE_INJECTION,
            });
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkForTemplateInjection(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkForTemplateInjection(val, `${path}[${idx}]`));
        }
      };

      checkForTemplateInjection(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Export all injection rules
 */
export const injectionRules: SecurityRule[] = [
  sqlInjectionRule,
  commandInjectionRule,
  xssRule,
  codeInjectionRule,
  templateInjectionRule,
];
