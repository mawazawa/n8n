/**
 * Parameter Inferer
 * Infers node parameters from workflow description and context
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { NodeBlueprint, Intent } from './types';
import { wrapError } from '../errors';

const PARAMETER_INFERENCE_PROMPT = `You are an expert at configuring n8n nodes. Given a node type and workflow context, infer the most likely parameter values.

Guidelines:
1. Extract specific values mentioned in the description
2. Apply sensible defaults for common use cases
3. Mark parameters that require user input as null or with a placeholder
4. Consider data flow from previous nodes
5. Ensure parameters match the node's schema

Respond with a JSON object of parameter key-value pairs:
{
  "parameter1": "value",
  "parameter2": 123,
  "parameter3": null,  // Requires user input
  "_userInputRequired": ["parameter3"]
}`;

export interface ParameterInferenceContext {
  nodeType: string;
  nodeName: string;
  intent: Intent;
  description: string;
  previousNodes?: NodeBlueprint[];
  availableData?: Record<string, unknown>;
}

export interface InferredParameters {
  parameters: Record<string, unknown>;
  userInputRequired: string[];
  confidence: number;
  suggestions?: Record<string, string[]>;
}

export class ParameterInferer {
  private model: BaseChatModel;
  private parameterDefaults: Map<string, Record<string, unknown>>;

  constructor(model?: BaseChatModel) {
    const router = getTaskRouter();
    this.model = model || router.getModelForTask('configuration');
    this.parameterDefaults = this.initializeDefaults();
  }

  /**
   * Infer parameters for a node
   */
  async infer(context: ParameterInferenceContext): Promise<InferredParameters> {
    try {
      // Check for defaults first
      const defaults = this.getDefaults(context.nodeType);

      // Extract values from description
      const extractedValues = this.extractFromDescription(context);

      // Get LLM suggestions for complex cases
      let llmSuggestions: Record<string, unknown> = {};
      if (this.needsLLMInference(context.nodeType)) {
        llmSuggestions = await this.inferWithLLM(context);
      }

      // Merge: LLM > Extracted > Defaults
      const parameters = {
        ...defaults,
        ...extractedValues,
        ...llmSuggestions,
      };

      // Identify required user inputs
      const userInputRequired = this.identifyRequiredInputs(context.nodeType, parameters);

      // Calculate confidence
      const confidence = this.calculateConfidence(parameters, userInputRequired);

      return {
        parameters,
        userInputRequired,
        confidence,
      };
    } catch (error) {
      throw wrapError(error, 'Failed to infer parameters');
    }
  }

  /**
   * Extract parameter values from natural language description
   */
  extractFromDescription(context: ParameterInferenceContext): Record<string, unknown> {
    const extracted: Record<string, unknown> = {};
    const description = context.description.toLowerCase();

    // Extract common patterns
    const patterns = this.getExtractionPatterns(context.nodeType);

    for (const [param, pattern] of Object.entries(patterns)) {
      const match = description.match(pattern.regex);
      if (match) {
        extracted[param] = pattern.transform ? pattern.transform(match) : match[1];
      }
    }

    return extracted;
  }

  /**
   * Apply sensible defaults for a node type
   */
  getDefaults(nodeType: string): Record<string, unknown> {
    return this.parameterDefaults.get(nodeType) || {};
  }

  /**
   * Mark parameters that require user input
   */
  identifyRequiredInputs(nodeType: string, parameters: Record<string, unknown>): string[] {
    const required: string[] = [];

    // Node-specific required parameters
    const requiredParams = this.getRequiredParams(nodeType);

    requiredParams.forEach((param) => {
      if (
        parameters[param] === null ||
        parameters[param] === undefined ||
        parameters[param] === '' ||
        parameters[param] === '__USER_INPUT_REQUIRED__'
      ) {
        required.push(param);
      }
    });

    return required;
  }

  /**
   * Infer parameters from data flow context
   */
  inferFromDataFlow(
    nodeType: string,
    previousNodes: NodeBlueprint[],
  ): Record<string, unknown> {
    const inferred: Record<string, unknown> = {};

    // If previous node is HTTP Request, this node might use its data
    const hasHttpRequest = previousNodes.some((n) => n.type.includes('httpRequest'));
    if (hasHttpRequest && nodeType.includes('set')) {
      inferred.keepOnlySet = false; // Keep all data from HTTP Request
    }

    // If previous node is Code, assume it transformed data
    const hasCode = previousNodes.some((n) => n.type.includes('code'));
    if (hasCode) {
      // Data is already processed
    }

    return inferred;
  }

  // ============================================
  // Private Methods
  // ============================================

  private initializeDefaults(): Map<string, Record<string, unknown>> {
    const defaults = new Map<string, Record<string, unknown>>();

    // Webhook defaults
    defaults.set('n8n-nodes-base.webhook', {
      httpMethod: 'POST',
      path: 'webhook',
      responseMode: 'onReceived',
    });

    // HTTP Request defaults
    defaults.set('n8n-nodes-base.httpRequest', {
      method: 'GET',
      responseFormat: 'json',
    });

    // Code defaults
    defaults.set('n8n-nodes-base.code', {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
    });

    // Set defaults
    defaults.set('n8n-nodes-base.set', {
      keepOnlySet: true,
      values: {},
    });

    // IF defaults
    defaults.set('n8n-nodes-base.if', {
      conditions: {
        combinator: 'and',
        conditions: [],
      },
    });

    // Gmail defaults
    defaults.set('n8n-nodes-base.gmail', {
      resource: 'message',
      operation: 'send',
    });

    // Slack defaults
    defaults.set('n8n-nodes-base.slack', {
      resource: 'message',
      operation: 'post',
    });

    return defaults;
  }

  private getExtractionPatterns(
    nodeType: string,
  ): Record<string, { regex: RegExp; transform?: (match: RegExpMatchArray) => unknown }> {
    const patterns: Record<
      string,
      { regex: RegExp; transform?: (match: RegExpMatchArray) => unknown }
    > = {};

    if (nodeType.includes('webhook')) {
      patterns.path = {
        regex: /webhook\s+(?:path|url|endpoint)\s+['"](.*?)['"]/i,
      };
    }

    if (nodeType.includes('httpRequest')) {
      patterns.url = {
        regex: /(?:fetch|get|post|request)\s+(?:from\s+)?['"](https?:\/\/.*?)['"]/i,
      };
      patterns.method = {
        regex: /\b(GET|POST|PUT|DELETE|PATCH)\b/i,
        transform: (match) => match[1].toUpperCase(),
      };
    }

    if (nodeType.includes('gmail') || nodeType.includes('email')) {
      patterns.toList = {
        regex: /(?:send|email)\s+(?:to\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      };
      patterns.subject = {
        regex: /subject\s+['"](.*?)['"]/i,
      };
    }

    if (nodeType.includes('slack')) {
      patterns.channel = {
        regex: /(?:channel|to)\s+#([a-zA-Z0-9-_]+)/i,
        transform: (match) => `#${match[1]}`,
      };
    }

    return patterns;
  }

  private getRequiredParams(nodeType: string): string[] {
    // Define required parameters per node type
    const required: Record<string, string[]> = {
      'n8n-nodes-base.httpRequest': ['url'],
      'n8n-nodes-base.gmail': ['toList', 'subject', 'message'],
      'n8n-nodes-base.slack': ['channel', 'text'],
      'n8n-nodes-base.postgres': ['query'],
      'n8n-nodes-base.googleSheets': ['sheetId'],
    };

    return required[nodeType] || [];
  }

  private needsLLMInference(nodeType: string): boolean {
    // Complex nodes that benefit from LLM inference
    const complexNodes = ['code', 'if', 'switch', 'function', 'aggregate'];

    return complexNodes.some((keyword) => nodeType.toLowerCase().includes(keyword));
  }

  private async inferWithLLM(context: ParameterInferenceContext): Promise<Record<string, unknown>> {
    try {
      const response = await this.model.invoke([
        new SystemMessage(PARAMETER_INFERENCE_PROMPT),
        new HumanMessage(JSON.stringify(context, null, 2)),
      ]);

      const content = response.content.toString();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr.trim());

      // Remove internal fields
      const { _userInputRequired, ...parameters } = parsed;

      return parameters;
    } catch (error) {
      // Return empty if LLM inference fails
      return {};
    }
  }

  private calculateConfidence(
    parameters: Record<string, unknown>,
    userInputRequired: string[],
  ): number {
    const totalParams = Object.keys(parameters).length;
    if (totalParams === 0) return 0;

    const filledParams = totalParams - userInputRequired.length;
    return filledParams / totalParams;
  }
}

/**
 * Convenience function to infer parameters
 */
export async function inferParameters(
  context: ParameterInferenceContext,
): Promise<InferredParameters> {
  const inferer = new ParameterInferer();
  return inferer.infer(context);
}
