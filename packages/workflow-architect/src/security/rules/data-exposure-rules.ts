/**
 * Data Exposure Security Rules
 * Detects PII leakage, sensitive data in logs, unmasked fields, and data retention issues
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
 * PII patterns (Personally Identifiable Information)
 */
const PII_PATTERNS = {
  // Credit card numbers (various formats)
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // Social Security Numbers (US)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

  // Passport numbers (generic pattern)
  passport: /\b[A-Z]{1,2}\d{6,9}\b/g,

  // Date of birth patterns
  dob: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
};

/**
 * Sensitive field names
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'ssn',
  'social_security',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'pin',
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'birthdate',
  'nationalId',
  'national_id',
  'passport',
  'driversLicense',
  'drivers_license',
  'taxId',
  'tax_id',
  'bankAccount',
  'bank_account',
  'routingNumber',
  'routing_number',
  'healthRecord',
  'medical_record',
];

/**
 * Check for PII in logs and responses
 */
export const piiInLogsRule: SecurityRule = {
  id: 'data-exposure-001',
  name: 'PII in Logs/Responses',
  description: 'Detects Personally Identifiable Information (PII) in logs or response bodies',
  severity: 'high',
  category: 'data-exposure',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check nodes that might log or return data
      if (
        nodeType.toLowerCase().includes('webhook') ||
        nodeType.toLowerCase().includes('http') ||
        nodeType.toLowerCase().includes('respond') ||
        nodeType.toLowerCase().includes('logger') ||
        nodeType.toLowerCase().includes('slack') ||
        nodeType.toLowerCase().includes('email')
      ) {
        const checkForPii = (value: unknown, path: string): void => {
          if (typeof value === 'string') {
            // Check against PII patterns
            for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
              pattern.lastIndex = 0;
              const matches = pattern.exec(value);
              if (matches) {
                // Skip if it's clearly a template or example
                if (!value.includes('example') && !value.includes('{{') && !value.includes('xxx')) {
                  vulnerabilities.push({
                    id: uuidv4(),
                    title: 'Potential PII Exposure',
                    description: `Potential ${piiType} found in ${nodeType} that may be logged or exposed`,
                    severity: 'high',
                    category: 'data-exposure',
                    nodeName,
                    nodeType,
                    path,
                    evidence: matches[0].substring(0, 20) + '***',
                    remediation: 'Mask or remove PII before logging or sending in responses',
                    references: [
                      'https://owasp.org/www-community/vulnerabilities/Information_exposure',
                    ],
                    cwe: CWE.SENSITIVE_DATA_EXPOSURE,
                  });
                }
              }
            }

            // Check if expressions might expose PII
            if (
              /\{\{.*?\$(?:json|input|item|node)/.test(value) &&
              (path.toLowerCase().includes('log') ||
               path.toLowerCase().includes('message') ||
               path.toLowerCase().includes('body'))
            ) {
              // Check if any sensitive fields are accessed
              for (const field of SENSITIVE_FIELDS) {
                const fieldPattern = new RegExp(`\\.${field}(?:[\\s}]|$)`, 'i');
                if (fieldPattern.test(value)) {
                  vulnerabilities.push({
                    id: uuidv4(),
                    title: 'Sensitive Field in Log/Response',
                    description: `Sensitive field "${field}" may be exposed in logs or responses`,
                    severity: 'medium',
                    category: 'data-exposure',
                    nodeName,
                    nodeType,
                    path,
                    evidence: value.substring(0, 100),
                    remediation: 'Mask sensitive fields or exclude them from logs and responses',
                    references: [
                      'https://owasp.org/www-community/vulnerabilities/Information_exposure',
                    ],
                    cwe: CWE.SENSITIVE_DATA_EXPOSURE,
                  });
                }
              }
            }
          } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
              checkForPii(val, `${path}.${key}`);
            }
          } else if (Array.isArray(value)) {
            value.forEach((val, idx) => checkForPii(val, `${path}[${idx}]`));
          }
        };

        checkForPii(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for sensitive data in error messages
 */
export const sensitiveDataInErrorsRule: SecurityRule = {
  id: 'data-exposure-002',
  name: 'Sensitive Data in Error Messages',
  description: 'Detects sensitive data that may be exposed in error messages',
  severity: 'medium',
  category: 'data-exposure',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check error handling nodes
      const checkErrorMessages = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          // Check if error messages include sensitive data expressions
          if (
            (path.toLowerCase().includes('error') ||
             path.toLowerCase().includes('exception') ||
             path.toLowerCase().includes('message')) &&
            /\{\{.*?\$(?:json|input|item|node)/.test(value)
          ) {
            // Check for sensitive field access in error messages
            for (const field of SENSITIVE_FIELDS) {
              const fieldPattern = new RegExp(`\\.${field}(?:[\\s}]|$)`, 'i');
              if (fieldPattern.test(value)) {
                vulnerabilities.push({
                  id: uuidv4(),
                  title: 'Sensitive Data in Error Message',
                  description: `Error message may expose sensitive field "${field}"`,
                  severity: 'medium',
                  category: 'data-exposure',
                  nodeName,
                  nodeType,
                  path,
                  evidence: value.substring(0, 100),
                  remediation: 'Use generic error messages and log detailed errors securely on the server',
                  references: [
                    'https://owasp.org/www-community/Improper_Error_Handling',
                  ],
                  cwe: CWE.INFORMATION_DISCLOSURE,
                });
              }
            }

            // Check for stack traces or debug info
            if (
              value.includes('$error.stack') ||
              value.includes('$error.trace') ||
              value.includes('$error.details')
            ) {
              vulnerabilities.push({
                id: uuidv4(),
                title: 'Stack Trace in Error Message',
                description: 'Error message may expose stack traces or debug information',
                severity: 'low',
                category: 'data-exposure',
                nodeName,
                nodeType,
                path,
                evidence: value.substring(0, 100),
                remediation: 'Avoid exposing stack traces and debug information to end users',
                references: [
                  'https://owasp.org/www-community/Improper_Error_Handling',
                ],
                cwe: CWE.INFORMATION_DISCLOSURE,
              });
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          for (const [key, val] of Object.entries(value)) {
            checkErrorMessages(val, `${path}.${key}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((val, idx) => checkErrorMessages(val, `${path}[${idx}]`));
        }
      };

      checkErrorMessages(parameters, `${nodeName}.parameters`);
    }

    return vulnerabilities;
  },
};

/**
 * Check for unmasked sensitive fields
 */
export const unmaskedSensitiveFieldsRule: SecurityRule = {
  id: 'data-exposure-003',
  name: 'Unmasked Sensitive Fields',
  description: 'Detects sensitive fields that are not masked or redacted',
  severity: 'medium',
  category: 'data-exposure',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check output/display nodes
      if (
        nodeType.toLowerCase().includes('respond') ||
        nodeType.toLowerCase().includes('webhook') ||
        nodeType.toLowerCase().includes('http') ||
        nodeType.toLowerCase().includes('slack') ||
        nodeType.toLowerCase().includes('email') ||
        nodeType.toLowerCase().includes('table')
      ) {
        const checkForUnmasked = (obj: Record<string, unknown>, path: string): void => {
          for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();

            // Check if field name is sensitive
            if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
              if (typeof value === 'string') {
                // Check if value is not masked
                if (
                  value &&
                  !value.includes('***') &&
                  !value.includes('mask') &&
                  !value.includes('redact') &&
                  !value.includes('hide')
                ) {
                  vulnerabilities.push({
                    id: uuidv4(),
                    title: 'Unmasked Sensitive Field',
                    description: `Sensitive field "${key}" appears to be unmasked in output`,
                    severity: 'medium',
                    category: 'data-exposure',
                    nodeName,
                    nodeType,
                    path: `${path}.${key}`,
                    evidence: value.substring(0, 20) + '***',
                    remediation: 'Mask sensitive fields before displaying or transmitting',
                    references: [
                      'https://owasp.org/www-community/vulnerabilities/Information_exposure',
                    ],
                    cwe: CWE.SENSITIVE_DATA_EXPOSURE,
                  });
                }
              }
            }

            // Recurse into nested objects
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              checkForUnmasked(value as Record<string, unknown>, `${path}.${key}`);
            }
          }
        };

        checkForUnmasked(parameters, `${nodeName}.parameters`);
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for data retention issues
 */
export const dataRetentionRule: SecurityRule = {
  id: 'data-exposure-004',
  name: 'Data Retention Issues',
  description: 'Detects potential data retention issues where sensitive data may be stored indefinitely',
  severity: 'low',
  category: 'data-exposure',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);
    const settings = workflow.settings as Record<string, unknown> | undefined;

    // Check workflow settings for data retention
    if (settings) {
      const saveDataSuccess = settings.saveDataSuccessExecution;
      const saveDataError = settings.saveDataErrorExecution;
      const saveManual = settings.saveManualExecutions;

      if (saveDataSuccess === 'all' || saveDataError === 'all' || saveManual) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Unlimited Data Retention',
          description: 'Workflow configured to save all execution data indefinitely',
          severity: 'low',
          category: 'data-exposure',
          path: 'workflow.settings',
          evidence: JSON.stringify({ saveDataSuccess, saveDataError, saveManual }),
          remediation: 'Configure data retention policies to automatically delete old execution data',
          references: [
            'https://docs.n8n.io/hosting/configuration/configuration-methods/',
          ],
          cwe: CWE.SENSITIVE_DATA_EXPOSURE,
        });
      }
    }

    // Check for database nodes that might store sensitive data
    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check storage nodes
      if (
        nodeType.toLowerCase().includes('database') ||
        nodeType.toLowerCase().includes('postgres') ||
        nodeType.toLowerCase().includes('mysql') ||
        nodeType.toLowerCase().includes('mongodb') ||
        nodeType.toLowerCase().includes('airtable') ||
        nodeType.toLowerCase().includes('sheet') ||
        nodeType.toLowerCase().includes('spreadsheet')
      ) {
        // Check if operation is INSERT or CREATE
        const operation = parameters.operation;
        if (operation === 'insert' || operation === 'create' || operation === 'executeQuery') {
          const checkForSensitiveData = (value: unknown, path: string): boolean => {
            if (typeof value === 'string') {
              // Check if sensitive fields are being stored
              for (const field of SENSITIVE_FIELDS) {
                const fieldPattern = new RegExp(`\\.${field}(?:[\\s}]|$)`, 'i');
                if (fieldPattern.test(value)) {
                  return true;
                }
              }
            } else if (typeof value === 'object' && value !== null) {
              for (const val of Object.values(value)) {
                if (checkForSensitiveData(val, path)) {
                  return true;
                }
              }
            } else if (Array.isArray(value)) {
              for (const val of value) {
                if (checkForSensitiveData(val, path)) {
                  return true;
                }
              }
            }
            return false;
          };

          if (checkForSensitiveData(parameters, `${nodeName}.parameters`)) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Sensitive Data Storage Without Retention Policy',
              description: 'Sensitive data is being stored without apparent retention policy',
              severity: 'low',
              category: 'data-exposure',
              nodeName,
              nodeType,
              path: `${nodeName}.parameters`,
              evidence: 'Storing sensitive fields',
              remediation: 'Implement data retention policies and consider encryption at rest',
              references: [
                'https://owasp.org/www-community/vulnerabilities/Information_exposure',
              ],
              cwe: CWE.SENSITIVE_DATA_EXPOSURE,
            });
          }
        }
      }
    }

    return vulnerabilities;
  },
};

/**
 * Check for excessive data collection
 */
export const excessiveDataCollectionRule: SecurityRule = {
  id: 'data-exposure-005',
  name: 'Excessive Data Collection',
  description: 'Detects collection of more data than necessary (principle of data minimization)',
  severity: 'low',
  category: 'data-exposure',
  check: (workflow: Record<string, unknown>): Vulnerability[] => {
    const vulnerabilities: Vulnerability[] = [];
    const nodes = extractNodes(workflow);

    for (const node of nodes) {
      const nodeName = String(node.name || 'Unknown');
      const nodeType = String(node.type || 'Unknown');
      const parameters = node.parameters as Record<string, unknown> | undefined;

      if (!parameters) continue;

      // Check API/HTTP nodes that might be collecting data
      if (
        nodeType.toLowerCase().includes('http') ||
        nodeType.toLowerCase().includes('webhook')
      ) {
        // Check if returnAll is enabled or limit is very high
        const returnAll = parameters.returnAll;
        const limit = parameters.limit as number | undefined;

        if (returnAll === true || (limit && limit > 1000)) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Excessive Data Collection',
            description: 'Node configured to collect all available data without limit',
            severity: 'low',
            category: 'data-exposure',
            nodeName,
            nodeType,
            path: `${nodeName}.parameters`,
            evidence: returnAll ? 'returnAll: true' : `limit: ${limit}`,
            remediation: 'Apply principle of data minimization - collect only necessary data',
            references: [
              'https://gdpr-info.eu/art-5-gdpr/',
            ],
            cwe: CWE.SENSITIVE_DATA_EXPOSURE,
          });
        }
      }
    }

    return vulnerabilities;
  },
};

/**
 * Export all data exposure rules
 */
export const dataExposureRules: SecurityRule[] = [
  piiInLogsRule,
  sensitiveDataInErrorsRule,
  unmaskedSensitiveFieldsRule,
  dataRetentionRule,
  excessiveDataCollectionRule,
];
