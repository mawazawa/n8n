/**
 * Rule Engine
 * Evaluate governance rules against resources with support for built-in and custom rules
 */

import { PolicyRule, RuleCondition, RuleResult, RuleSeverity } from './types';

export interface RuleEvaluationContext {
  resource: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  userId?: string;
  timestamp?: string;
}

export class RuleEngine {
  private customExpressionHandlers: Map<string, (context: RuleEvaluationContext) => boolean> = new Map();

  /**
   * Register a custom expression handler
   */
  registerCustomHandler(name: string, handler: (context: RuleEvaluationContext) => boolean): void {
    this.customExpressionHandlers.set(name, handler);
  }

  /**
   * Evaluate all rules against a resource
   */
  async evaluate(resource: Record<string, unknown>, rules: PolicyRule[]): Promise<RuleResult[]> {
    const context: RuleEvaluationContext = {
      resource,
      timestamp: new Date().toISOString(),
    };

    const results: RuleResult[] = [];

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      const result = await this.evaluateRule(rule, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(rule: PolicyRule, context: RuleEvaluationContext): Promise<RuleResult> {
    try {
      const passed = await this.evaluateCondition(rule.condition, context);

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        passed,
        severity: rule.severity,
        message: passed ? undefined : this.getFailureMessage(rule, context),
        evidence: passed ? undefined : this.collectEvidence(rule, context),
        suggestions: passed ? undefined : this.getSuggestions(rule),
      };
    } catch (error) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        passed: false,
        severity: RuleSeverity.CRITICAL,
        message: `Rule evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        evidence: { error: String(error) },
      };
    }
  }

  /**
   * Evaluate a condition
   */
  private async evaluateCondition(condition: RuleCondition, context: RuleEvaluationContext): Promise<boolean> {
    switch (condition.type) {
      case 'required_field':
        return this.evaluateRequiredField(condition, context);

      case 'forbidden_value':
        return this.evaluateForbiddenValue(condition, context);

      case 'pattern_match':
        return this.evaluatePatternMatch(condition, context);

      case 'custom_expression':
        return this.evaluateCustomExpression(condition, context);

      case 'composite':
        return this.evaluateComposite(condition, context);

      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  /**
   * Evaluate required field condition
   */
  private evaluateRequiredField(condition: RuleCondition, context: RuleEvaluationContext): boolean {
    if (!condition.field) {
      throw new Error('Field is required for required_field condition');
    }

    const value = this.getFieldValue(context.resource, condition.field);
    return value !== undefined && value !== null && value !== '';
  }

  /**
   * Evaluate forbidden value condition
   */
  private evaluateForbiddenValue(condition: RuleCondition, context: RuleEvaluationContext): boolean {
    if (!condition.field) {
      throw new Error('Field is required for forbidden_value condition');
    }

    const value = this.getFieldValue(context.resource, condition.field);

    if (!condition.operator) {
      // Simple equality check
      return value !== condition.value;
    }

    return !this.evaluateOperator(value, condition.operator, condition.value);
  }

  /**
   * Evaluate pattern match condition
   */
  private evaluatePatternMatch(condition: RuleCondition, context: RuleEvaluationContext): boolean {
    if (!condition.field || !condition.pattern) {
      throw new Error('Field and pattern are required for pattern_match condition');
    }

    const value = this.getFieldValue(context.resource, condition.field);

    if (typeof value !== 'string') {
      return false;
    }

    const regex = new RegExp(condition.pattern);
    return regex.test(value);
  }

  /**
   * Evaluate custom expression condition
   */
  private evaluateCustomExpression(condition: RuleCondition, context: RuleEvaluationContext): boolean {
    if (!condition.expression) {
      throw new Error('Expression is required for custom_expression condition');
    }

    const handler = this.customExpressionHandlers.get(condition.expression);

    if (!handler) {
      throw new Error(`Custom expression handler not found: ${condition.expression}`);
    }

    return handler(context);
  }

  /**
   * Evaluate composite condition (AND/OR of multiple conditions)
   */
  private async evaluateComposite(condition: RuleCondition, context: RuleEvaluationContext): Promise<boolean> {
    if (!condition.conditions || condition.conditions.length === 0) {
      throw new Error('Conditions array is required for composite condition');
    }

    const combinator = condition.combinator || 'and';
    const results = await Promise.all(
      condition.conditions.map((c) => this.evaluateCondition(c, context))
    );

    if (combinator === 'and') {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  /**
   * Evaluate operator
   */
  private evaluateOperator(
    fieldValue: unknown,
    operator: NonNullable<RuleCondition['operator']>,
    compareValue: unknown,
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === compareValue;

      case 'not_equals':
        return fieldValue !== compareValue;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          return fieldValue.includes(compareValue);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(compareValue);
        }
        return false;

      case 'not_contains':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          return !fieldValue.includes(compareValue);
        }
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(compareValue);
        }
        return true;

      case 'matches':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          const regex = new RegExp(compareValue);
          return regex.test(fieldValue);
        }
        return false;

      case 'gt':
        return Number(fieldValue) > Number(compareValue);

      case 'lt':
        return Number(fieldValue) < Number(compareValue);

      case 'gte':
        return Number(fieldValue) >= Number(compareValue);

      case 'lte':
        return Number(fieldValue) <= Number(compareValue);

      default:
        return false;
    }
  }

  /**
   * Get field value from resource using dot notation
   */
  private getFieldValue(resource: Record<string, unknown>, field: string): unknown {
    const parts = field.split('.');
    let value: unknown = resource;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }

      if (typeof value === 'object' && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get failure message for a rule
   */
  private getFailureMessage(rule: PolicyRule, context: RuleEvaluationContext): string {
    if (rule.action.message) {
      return this.interpolateMessage(rule.action.message, context);
    }

    return `Rule "${rule.name}" failed validation`;
  }

  /**
   * Collect evidence for rule failure
   */
  private collectEvidence(rule: PolicyRule, context: RuleEvaluationContext): Record<string, unknown> {
    const evidence: Record<string, unknown> = {
      ruleId: rule.id,
      ruleName: rule.name,
      condition: rule.condition,
      timestamp: context.timestamp,
    };

    // Add field value if applicable
    if (rule.condition.field) {
      evidence.fieldValue = this.getFieldValue(context.resource, rule.condition.field);
      evidence.field = rule.condition.field;
    }

    return evidence;
  }

  /**
   * Get suggestions for fixing rule violations
   */
  private getSuggestions(rule: PolicyRule): string[] {
    const suggestions: string[] = [];

    switch (rule.condition.type) {
      case 'required_field':
        suggestions.push(`Ensure field "${rule.condition.field}" is present and not empty`);
        break;

      case 'forbidden_value':
        suggestions.push(`Remove or change the value in field "${rule.condition.field}"`);
        break;

      case 'pattern_match':
        suggestions.push(`Ensure field "${rule.condition.field}" matches the required pattern`);
        break;

      case 'custom_expression':
        suggestions.push(`Review the custom validation requirements for this rule`);
        break;
    }

    if (rule.metadata?.documentation) {
      suggestions.push(`See documentation: ${rule.metadata.documentation}`);
    }

    return suggestions;
  }

  /**
   * Interpolate message with context variables
   */
  private interpolateMessage(message: string, context: RuleEvaluationContext): string {
    let result = message;

    // Replace {{field}} placeholders
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
      const value = this.getFieldValue(context.resource, field);
      return value !== undefined ? String(value) : match;
    });

    return result;
  }

  /**
   * Chain multiple rule evaluations
   */
  async evaluateChain(
    resource: Record<string, unknown>,
    ruleChains: PolicyRule[][],
  ): Promise<RuleResult[][]> {
    const results: RuleResult[][] = [];

    for (const rules of ruleChains) {
      const chainResults = await this.evaluate(resource, rules);
      results.push(chainResults);

      // Stop if any rule in the chain fails critically
      const hasCriticalFailure = chainResults.some(
        (r) => !r.passed && r.severity === RuleSeverity.CRITICAL
      );

      if (hasCriticalFailure) {
        break;
      }
    }

    return results;
  }

  /**
   * Get a summary of rule evaluation results
   */
  getSummary(results: RuleResult[]): {
    total: number;
    passed: number;
    failed: number;
    bySeverity: Record<RuleSeverity, number>;
  } {
    const summary = {
      total: results.length,
      passed: 0,
      failed: 0,
      bySeverity: {
        [RuleSeverity.INFO]: 0,
        [RuleSeverity.LOW]: 0,
        [RuleSeverity.MEDIUM]: 0,
        [RuleSeverity.HIGH]: 0,
        [RuleSeverity.CRITICAL]: 0,
      },
    };

    for (const result of results) {
      if (result.passed) {
        summary.passed++;
      } else {
        summary.failed++;
        summary.bySeverity[result.severity]++;
      }
    }

    return summary;
  }
}

/**
 * Built-in rule factory functions
 */
export const BuiltInRules = {
  /**
   * Create a required field rule
   */
  requiredField(field: string, severity: RuleSeverity = RuleSeverity.HIGH): PolicyRule {
    return {
      id: `required_${field}`,
      name: `Required Field: ${field}`,
      description: `The field "${field}" must be present and not empty`,
      condition: {
        type: 'required_field',
        field,
      },
      action: {
        type: 'block',
        message: `Field "${field}" is required`,
      },
      severity,
      enabled: true,
    };
  },

  /**
   * Create a forbidden value rule
   */
  forbiddenValue(field: string, value: unknown, severity: RuleSeverity = RuleSeverity.HIGH): PolicyRule {
    return {
      id: `forbidden_${field}_${String(value)}`,
      name: `Forbidden Value: ${field}`,
      description: `The field "${field}" must not contain the value "${String(value)}"`,
      condition: {
        type: 'forbidden_value',
        field,
        value,
        operator: 'equals',
      },
      action: {
        type: 'block',
        message: `Field "${field}" contains a forbidden value`,
      },
      severity,
      enabled: true,
    };
  },

  /**
   * Create a pattern match rule
   */
  patternMatch(field: string, pattern: string, severity: RuleSeverity = RuleSeverity.MEDIUM): PolicyRule {
    return {
      id: `pattern_${field}`,
      name: `Pattern Match: ${field}`,
      description: `The field "${field}" must match the pattern: ${pattern}`,
      condition: {
        type: 'pattern_match',
        field,
        pattern,
      },
      action: {
        type: 'block',
        message: `Field "${field}" does not match the required pattern`,
      },
      severity,
      enabled: true,
    };
  },
};
