/**
 * Workflow Validator
 * Validates workflow blueprints for completeness and correctness
 */

import type {
  WorkflowBlueprint,
  NodeBlueprint,
  ConnectionBlueprint,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

export class GenerationValidator {
  /**
   * Validate a complete workflow blueprint
   */
  async validate(workflow: WorkflowBlueprint): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Validate structure
    errors.push(...this.validateStructure(workflow));

    // Validate nodes
    errors.push(...this.validateNodes(workflow.nodes));
    warnings.push(...this.validateNodeWarnings(workflow.nodes));

    // Validate connections
    errors.push(...this.validateConnections(workflow.connections, workflow.nodes));
    warnings.push(...this.validateConnectionWarnings(workflow.connections, workflow.nodes));

    // Validate node compatibility
    errors.push(...this.validateNodeCompatibility(workflow));

    // Validate data type consistency
    warnings.push(...this.validateDataTypes(workflow));

    // Generate suggestions
    suggestions.push(...this.generateSuggestions(workflow));

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Check node compatibility
   */
  validateNodeCompatibility(workflow: WorkflowBlueprint): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for trigger node
    const hasTrigger = workflow.nodes.some((n) =>
      n.type.toLowerCase().includes('trigger'),
    );

    if (!hasTrigger) {
      errors.push({
        code: 'MISSING_TRIGGER',
        message: 'Workflow must have at least one trigger node',
        severity: 'error',
      });
    }

    // Check for action/output node
    const hasAction = workflow.nodes.some(
      (n) =>
        n.type.includes('gmail') ||
        n.type.includes('slack') ||
        n.type.includes('http') ||
        n.type.includes('postgres'),
    );

    if (!hasAction && workflow.nodes.length > 1) {
      errors.push({
        code: 'MISSING_ACTION',
        message: 'Workflow should have at least one action node',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Verify data type consistency
   */
  validateDataTypes(workflow: WorkflowBlueprint): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for common data type issues
    workflow.nodes.forEach((node) => {
      // If node expects array but previous might output single item
      // This would require more sophisticated schema knowledge
    });

    return warnings;
  }

  /**
   * Detect missing required fields
   */
  detectMissingFields(workflow: WorkflowBlueprint): ValidationError[] {
    const errors: ValidationError[] = [];

    workflow.nodes.forEach((node) => {
      const required = this.getRequiredFields(node.type);

      required.forEach((field) => {
        if (
          !node.parameters[field] ||
          node.parameters[field] === null ||
          node.parameters[field] === ''
        ) {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Node ${node.name} is missing required field: ${field}`,
            nodeId: node.id,
            field,
            severity: 'error',
          });
        }
      });
    });

    return errors;
  }

  // ============================================
  // Private Methods
  // ============================================

  private validateStructure(workflow: WorkflowBlueprint): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!workflow.name || workflow.name.trim() === '') {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Workflow must have a name',
        severity: 'error',
      });
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push({
        code: 'EMPTY_WORKFLOW',
        message: 'Workflow must have at least one node',
        severity: 'error',
      });
    }

    if (!workflow.connections) {
      errors.push({
        code: 'MISSING_CONNECTIONS',
        message: 'Workflow must define connections',
        severity: 'error',
      });
    }

    return errors;
  }

  private validateNodes(nodes: NodeBlueprint[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for duplicate IDs
    const ids = new Set<string>();
    nodes.forEach((node) => {
      if (ids.has(node.id)) {
        errors.push({
          code: 'DUPLICATE_NODE_ID',
          message: `Duplicate node ID: ${node.id}`,
          nodeId: node.id,
          severity: 'error',
        });
      }
      ids.add(node.id);
    });

    // Validate each node
    nodes.forEach((node) => {
      if (!node.id) {
        errors.push({
          code: 'MISSING_NODE_ID',
          message: 'Node must have an ID',
          severity: 'error',
        });
      }

      if (!node.name) {
        errors.push({
          code: 'MISSING_NODE_NAME',
          message: 'Node must have a name',
          nodeId: node.id,
          severity: 'error',
        });
      }

      if (!node.type) {
        errors.push({
          code: 'MISSING_NODE_TYPE',
          message: 'Node must have a type',
          nodeId: node.id,
          severity: 'error',
        });
      }

      if (!node.parameters) {
        errors.push({
          code: 'MISSING_NODE_PARAMETERS',
          message: 'Node must have parameters object',
          nodeId: node.id,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  private validateNodeWarnings(nodes: NodeBlueprint[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    nodes.forEach((node) => {
      // Warn about low confidence nodes
      if (node.confidence < 0.5) {
        warnings.push({
          code: 'LOW_CONFIDENCE_NODE',
          message: `Node ${node.name} has low confidence (${node.confidence})`,
          nodeId: node.id,
          severity: 'warning',
        });
      }

      // Warn about missing credentials
      if (this.needsCredentials(node.type) && !node.credentials) {
        warnings.push({
          code: 'MISSING_CREDENTIALS',
          message: `Node ${node.name} likely requires credentials`,
          nodeId: node.id,
          severity: 'warning',
        });
      }
    });

    return warnings;
  }

  private validateConnections(
    connections: ConnectionBlueprint[],
    nodes: NodeBlueprint[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    const nodeIds = new Set(nodes.map((n) => n.id));

    connections.forEach((conn, index) => {
      // Check if source node exists
      if (!nodeIds.has(conn.source)) {
        errors.push({
          code: 'INVALID_CONNECTION_SOURCE',
          message: `Connection ${index} references non-existent source node: ${conn.source}`,
          severity: 'error',
        });
      }

      // Check if target node exists
      if (!nodeIds.has(conn.target)) {
        errors.push({
          code: 'INVALID_CONNECTION_TARGET',
          message: `Connection ${index} references non-existent target node: ${conn.target}`,
          severity: 'error',
        });
      }

      // Check for self-connections
      if (conn.source === conn.target) {
        errors.push({
          code: 'SELF_CONNECTION',
          message: `Connection ${index} connects node to itself`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  private validateConnectionWarnings(
    connections: ConnectionBlueprint[],
    nodes: NodeBlueprint[],
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for orphaned nodes
    const connectedNodes = new Set<string>();
    connections.forEach((conn) => {
      connectedNodes.add(conn.source);
      connectedNodes.add(conn.target);
    });

    nodes.forEach((node) => {
      if (!connectedNodes.has(node.id) && !node.type.includes('trigger')) {
        warnings.push({
          code: 'ORPHANED_NODE',
          message: `Node ${node.name} is not connected to the workflow`,
          nodeId: node.id,
          severity: 'warning',
        });
      }
    });

    return warnings;
  }

  private generateSuggestions(workflow: WorkflowBlueprint): string[] {
    const suggestions: string[] = [];

    // Suggest error handling
    const hasErrorHandling = workflow.nodes.some((n) => n.type.includes('error'));
    if (!hasErrorHandling && workflow.nodes.length > 3) {
      suggestions.push('Consider adding error handling nodes for robustness');
    }

    // Suggest naming conventions
    const hasGenericNames = workflow.nodes.some((n) => /^node\d+$/i.test(n.name));
    if (hasGenericNames) {
      suggestions.push('Consider using more descriptive node names');
    }

    // Suggest optimization
    if (workflow.nodes.length > 10) {
      suggestions.push('Complex workflow - consider breaking into sub-workflows');
    }

    return suggestions;
  }

  private getRequiredFields(nodeType: string): string[] {
    const required: Record<string, string[]> = {
      'n8n-nodes-base.httpRequest': ['url'],
      'n8n-nodes-base.webhook': ['path'],
      'n8n-nodes-base.gmail': ['toList', 'subject'],
      'n8n-nodes-base.slack': ['channel', 'text'],
      'n8n-nodes-base.postgres': ['query'],
    };

    return required[nodeType] || [];
  }

  private needsCredentials(nodeType: string): boolean {
    const needsCreds = [
      'gmail',
      'slack',
      'postgres',
      'mysql',
      'googleSheets',
      'github',
      'stripe',
      'salesforce',
    ];

    return needsCreds.some((service) => nodeType.toLowerCase().includes(service));
  }
}

/**
 * Convenience function to validate a workflow
 */
export async function validateWorkflow(workflow: WorkflowBlueprint): Promise<ValidationResult> {
  const validator = new GenerationValidator();
  return validator.validate(workflow);
}
