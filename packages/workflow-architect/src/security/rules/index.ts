/**
 * Security Rules Index
 * Exports all built-in security rules
 */

import type { SecurityRule } from '../types.js';
import { credentialRules } from './credential-rules.js';
import { injectionRules } from './injection-rules.js';
import { configurationRules } from './configuration-rules.js';
import { dataExposureRules } from './data-exposure-rules.js';

/**
 * All built-in security rules
 */
export const allRules: SecurityRule[] = [
  ...credentialRules,
  ...injectionRules,
  ...configurationRules,
  ...dataExposureRules,
];

/**
 * Export individual rule categories for selective use
 */
export {
  credentialRules,
  injectionRules,
  configurationRules,
  dataExposureRules,
};

/**
 * Export individual rules from each category
 */
export {
  hardcodedSecretsRule,
  exposedCredentialsInExpressionsRule,
  credentialsInHeadersRule,
  sensitiveParameterNamesRule,
} from './credential-rules.js';

export {
  sqlInjectionRule,
  commandInjectionRule,
  xssRule,
  codeInjectionRule,
  templateInjectionRule,
} from './injection-rules.js';

export {
  insecureTransportRule,
  disabledSslVerificationRule,
  permissiveCorsRule,
  missingWebhookAuthRule,
  unsafeRedirectRule,
  debugModeEnabledRule,
  weakEncryptionRule,
} from './configuration-rules.js';

export {
  piiInLogsRule,
  sensitiveDataInErrorsRule,
  unmaskedSensitiveFieldsRule,
  dataRetentionRule,
  excessiveDataCollectionRule,
} from './data-exposure-rules.js';

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): SecurityRule[] {
  return allRules.filter(rule => rule.category === category);
}

/**
 * Get rules by severity
 */
export function getRulesBySeverity(severity: string): SecurityRule[] {
  return allRules.filter(rule => rule.severity === severity);
}

/**
 * Get critical rules only (for quick scans)
 */
export function getCriticalRules(): SecurityRule[] {
  return allRules.filter(rule => rule.severity === 'critical');
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): SecurityRule | undefined {
  return allRules.find(rule => rule.id === id);
}
