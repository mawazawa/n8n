import type { RecoverySuggestion, ErrorContext, RecoveryResult } from './types.js';

/**
 * Automatically applies safe recovery fixes to workflows
 */
export class AutoRecovery {
  private readonly safeActionTypes = new Set([
    'retry',
    'retry_with_delay',
    'add_delay',
    'check_credentials',
  ]);

  /**
   * Check if a suggestion can be automatically applied
   */
  canAutoFix(suggestion: RecoverySuggestion): boolean {
    // Only auto-fix if action is defined
    if (!suggestion.action) {
      return false;
    }

    // Only auto-fix safe action types
    if (!this.safeActionTypes.has(suggestion.action.type)) {
      return false;
    }

    // Only auto-fix if confidence is high enough
    if (suggestion.confidence < 0.7) {
      return false;
    }

    // Only auto-fix for certain suggestion types
    const autoFixTypes = new Set(['retry', 'parameter']);
    if (!autoFixTypes.has(suggestion.type)) {
      return false;
    }

    return true;
  }

  /**
   * Apply a recovery fix
   */
  async applyFix(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult> {
    if (!suggestion.action) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'No action defined for suggestion',
      };
    }

    try {
      // Route to appropriate fix handler
      switch (suggestion.action.type) {
        case 'retry':
        case 'retry_with_delay':
          return await this.applyRetryFix(suggestion, context);

        case 'add_delay':
          return await this.applyDelayFix(suggestion, context, workflow);

        case 'update_parameter':
          return await this.applyParameterFix(suggestion, context, workflow);

        case 'swap_credentials':
          return await this.applyCredentialSwap(suggestion, context, workflow);

        case 'enable_batching':
          return await this.applyBatchingFix(suggestion, context, workflow);

        case 'check_credentials':
          return await this.applyCredentialCheck(suggestion, context);

        default:
          return {
            success: false,
            suggestion,
            appliedAt: Date.now(),
            error: `Unsupported action type: ${suggestion.action.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply retry fix
   */
  private async applyRetryFix(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
  ): Promise<RecoveryResult> {
    const params = suggestion.action!.params;
    const delayMs = (params.delayMs as number) || 0;
    const maxRetries = (params.maxRetries as number) || 3;
    const exponential = (params.exponential as boolean) || false;

    // Calculate actual delay if exponential
    const retryCount = context.previousErrors?.length || 0;
    let actualDelay = delayMs;

    if (exponential && retryCount > 0) {
      actualDelay = delayMs * Math.pow(2, retryCount);
      // Cap at 60 seconds
      actualDelay = Math.min(actualDelay, 60000);
    }

    // Check if max retries exceeded
    if (retryCount >= maxRetries) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: `Max retries (${maxRetries}) exceeded`,
      };
    }

    // Schedule retry (in a real implementation, this would trigger actual retry)
    const executionId = await this.createRetryExecution(context, {
      delayMs: actualDelay,
      retryCount: retryCount + 1,
    });

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
      newExecutionId: executionId,
    };
  }

  /**
   * Apply delay fix to workflow
   */
  private async applyDelayFix(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult> {
    if (!workflow) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'Workflow definition required for delay fix',
      };
    }

    const params = suggestion.action!.params;
    const delayMs = (params.delayMs as number) || 1000;
    const position = (params.position as string) || 'before';

    // In a real implementation, this would modify the workflow
    // to add a Wait node before/after the failing node
    const modifiedWorkflow = this.addDelayNode(
      workflow,
      context.nodeName,
      delayMs,
      position,
    );

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
    };
  }

  /**
   * Apply parameter fix to workflow
   */
  private async applyParameterFix(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult> {
    if (!workflow) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'Workflow definition required for parameter fix',
      };
    }

    const params = suggestion.action!.params;
    const parameter = params.parameter as string;
    const operation = (params.operation as string) || 'set';
    const value = params.value;

    // In a real implementation, this would modify the workflow node parameters
    const modifiedWorkflow = this.updateNodeParameter(
      workflow,
      context.nodeName,
      parameter,
      value,
      operation,
    );

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
    };
  }

  /**
   * Apply credential swap
   */
  private async applyCredentialSwap(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult> {
    if (!workflow) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'Workflow definition required for credential swap',
      };
    }

    // In a real implementation, this would find alternative credentials
    // and update the workflow node to use them
    const alternativeCredentials = await this.findAlternativeCredentials(
      context.nodeType,
    );

    if (!alternativeCredentials) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'No alternative credentials found',
      };
    }

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
    };
  }

  /**
   * Apply batching fix
   */
  private async applyBatchingFix(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult> {
    if (!workflow) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'Workflow definition required for batching fix',
      };
    }

    const params = suggestion.action!.params;
    const batchSize = (params.batchSize as number) || 100;

    // In a real implementation, this would modify the workflow
    // to process items in batches
    const modifiedWorkflow = this.enableBatching(
      workflow,
      context.nodeName,
      batchSize,
    );

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
    };
  }

  /**
   * Apply credential check
   */
  private async applyCredentialCheck(
    suggestion: RecoverySuggestion,
    context: ErrorContext,
  ): Promise<RecoveryResult> {
    // In a real implementation, this would validate credentials
    const isValid = await this.validateCredentials(context.nodeType);

    if (!isValid) {
      return {
        success: false,
        suggestion,
        appliedAt: Date.now(),
        error: 'Credentials validation failed',
      };
    }

    return {
      success: true,
      suggestion,
      appliedAt: Date.now(),
    };
  }

  /**
   * Create a retry execution with modifications
   */
  async createRetryExecution(
    context: ErrorContext,
    options: RetryOptions,
  ): Promise<string> {
    // In a real implementation, this would:
    // 1. Clone the workflow execution
    // 2. Apply any necessary modifications
    // 3. Schedule/trigger the new execution with delay
    // 4. Return the new execution ID

    // For now, return a mock execution ID
    const executionId = `retry-${context.executionId}-${options.retryCount}`;

    // Log the retry attempt
    console.log(
      `Creating retry execution ${executionId} with ${options.delayMs}ms delay (attempt ${options.retryCount})`,
    );

    return executionId;
  }

  /**
   * Add delay node to workflow
   */
  private addDelayNode(
    workflow: WorkflowDefinition,
    targetNodeName: string,
    delayMs: number,
    position: string,
  ): WorkflowDefinition {
    // In a real implementation, this would:
    // 1. Create a new Wait node with specified delay
    // 2. Insert it before/after the target node
    // 3. Update connections
    // 4. Return modified workflow

    console.log(
      `Would add ${delayMs}ms delay ${position} node ${targetNodeName}`,
    );

    return workflow; // Return unmodified for now
  }

  /**
   * Update node parameter
   */
  private updateNodeParameter(
    workflow: WorkflowDefinition,
    nodeName: string,
    parameter: string,
    value: unknown,
    operation: string,
  ): WorkflowDefinition {
    // In a real implementation, this would:
    // 1. Find the node by name
    // 2. Update the parameter based on operation (set, multiply, add, etc.)
    // 3. Return modified workflow

    console.log(
      `Would update parameter ${parameter} on node ${nodeName} using ${operation} with value ${value}`,
    );

    return workflow; // Return unmodified for now
  }

  /**
   * Find alternative credentials for a node type
   */
  private async findAlternativeCredentials(
    nodeType: string,
  ): Promise<string | null> {
    // In a real implementation, this would:
    // 1. Query available credentials for the node type
    // 2. Filter out the currently failing credential
    // 3. Return an alternative credential ID
    // 4. Return null if none found

    console.log(`Looking for alternative credentials for ${nodeType}`);

    return null; // No alternative found
  }

  /**
   * Enable batching for a node
   */
  private enableBatching(
    workflow: WorkflowDefinition,
    nodeName: string,
    batchSize: number,
  ): WorkflowDefinition {
    // In a real implementation, this would:
    // 1. Add a SplitInBatches node before the target
    // 2. Configure batch size
    // 3. Update connections
    // 4. Return modified workflow

    console.log(`Would enable batching (size: ${batchSize}) for node ${nodeName}`);

    return workflow; // Return unmodified for now
  }

  /**
   * Validate credentials
   */
  private async validateCredentials(nodeType: string): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Get credentials for the node type
    // 2. Test the credentials with the service
    // 3. Return validation result

    console.log(`Validating credentials for ${nodeType}`);

    return true; // Assume valid for now
  }

  /**
   * Get all auto-fixable suggestions
   */
  getAutoFixableSuggestions(
    suggestions: RecoverySuggestion[],
  ): RecoverySuggestion[] {
    return suggestions.filter((s) => this.canAutoFix(s));
  }

  /**
   * Apply multiple fixes in sequence
   */
  async applyFixes(
    suggestions: RecoverySuggestion[],
    context: ErrorContext,
    workflow?: WorkflowDefinition,
  ): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];

    for (const suggestion of suggestions) {
      if (!this.canAutoFix(suggestion)) {
        continue;
      }

      const result = await this.applyFix(suggestion, context, workflow);
      results.push(result);

      // Stop if a fix was successful
      if (result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Rollback a previously applied fix
   */
  async rollbackFix(result: RecoveryResult): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Revert workflow changes
    // 2. Cancel scheduled retries
    // 3. Return success status

    console.log(`Rolling back fix for suggestion ${result.suggestion.id}`);

    return true;
  }
}

/**
 * Workflow definition interface
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

/**
 * Workflow node interface
 */
export interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
  position: [number, number];
}

/**
 * Retry options
 */
export interface RetryOptions {
  delayMs: number;
  retryCount: number;
  exponential?: boolean;
}
