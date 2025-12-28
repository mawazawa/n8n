/**
 * Intent Analyzer
 * Extracts structured intent from natural language workflow descriptions
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { Intent } from './types';
import { IntentSchema } from './types';
import { ModelError, ErrorCode, wrapError } from '../errors';

const INTENT_ANALYSIS_PROMPT = `You are an expert at analyzing workflow automation requirements and extracting structured intent.

Given a natural language description of a workflow, extract the following information:

1. **Primary Action**: The main goal or objective (e.g., "send email when form submitted")
2. **Action Verbs**: Key verbs that indicate operations (e.g., ["send", "notify", "transform"])
3. **Data Sources**: Where data comes from (e.g., ["webhook", "google sheets", "database"])
4. **Data Targets**: Where data goes to (e.g., ["slack", "email", "database"])
5. **Conditions**: Any conditional logic (e.g., ["if amount > 100", "on weekdays only"])
6. **Transformations**: Data modifications needed (e.g., ["format date", "calculate total"])
7. **Workflow Type**: Category of workflow (etl, automation, notification, approval, monitoring, integration, ai-agent, data-processing, webhook)
8. **Complexity**: Overall complexity (simple, moderate, complex)
9. **Required Capabilities**: Specific features needed (e.g., ["scheduling", "error-retry", "conditional-branching"])
10. **Confidence**: How confident you are in the analysis (0.0 to 1.0)

Respond ONLY with a valid JSON object matching this exact schema:
{
  "primaryAction": "string",
  "actionVerbs": ["string"],
  "dataSources": ["string"],
  "dataTargets": ["string"],
  "conditions": ["string"],
  "transformations": ["string"],
  "workflowType": "etl|automation|notification|approval|monitoring|integration|ai-agent|data-processing|webhook",
  "complexity": "simple|moderate|complex",
  "requiredCapabilities": ["string"],
  "confidence": 0.0-1.0
}

Do not include any explanation, markdown formatting, or additional text. Only return the JSON object.`;

export interface IntentAnalyzerConfig {
  model?: BaseChatModel;
  enableCaching?: boolean;
}

export class IntentAnalyzer {
  private model: BaseChatModel;
  private cache = new Map<string, Intent>();
  private enableCaching: boolean;

  constructor(config: IntentAnalyzerConfig = {}) {
    const router = getTaskRouter();
    this.model = config.model || router.getModelForTask('simple');
    this.enableCaching = config.enableCaching ?? true;
  }

  /**
   * Analyze a workflow description and extract structured intent
   */
  async analyze(description: string): Promise<Intent> {
    // Check cache first
    const cacheKey = this.getCacheKey(description);
    if (this.enableCaching && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Call LLM for intent extraction
      const response = await this.model.invoke([
        new SystemMessage(INTENT_ANALYSIS_PROMPT),
        new HumanMessage(description),
      ]);

      // Parse response
      const content = response.content.toString();
      const intent = this.parseIntentResponse(content);

      // Validate with Zod
      const validatedIntent = IntentSchema.parse(intent);

      // Cache result
      if (this.enableCaching) {
        this.cache.set(cacheKey, validatedIntent);
      }

      return validatedIntent;
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limit')) {
        throw new ModelError('Rate limit exceeded', ErrorCode.MODEL_RATE_LIMIT, {
          description,
        });
      }
      throw wrapError(error, 'Failed to analyze workflow intent');
    }
  }

  /**
   * Batch analyze multiple descriptions
   */
  async analyzeBatch(descriptions: string[]): Promise<Intent[]> {
    const results = await Promise.allSettled(descriptions.map((desc) => this.analyze(desc)));

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Return low-confidence fallback intent
        return this.createFallbackIntent(descriptions[index]);
      }
    });
  }

  /**
   * Extract specific components from description
   */
  extractActionVerbs(description: string): string[] {
    // Common action verbs in workflow automation
    const actionVerbs = [
      'send',
      'receive',
      'create',
      'update',
      'delete',
      'read',
      'fetch',
      'get',
      'post',
      'put',
      'notify',
      'alert',
      'trigger',
      'schedule',
      'process',
      'transform',
      'filter',
      'aggregate',
      'merge',
      'split',
      'validate',
      'check',
      'monitor',
      'track',
      'log',
      'store',
      'save',
    ];

    const lowerDesc = description.toLowerCase();
    const found = actionVerbs.filter((verb) => {
      const pattern = new RegExp(`\\b${verb}(s|ed|ing)?\\b`, 'i');
      return pattern.test(lowerDesc);
    });

    return [...new Set(found)]; // Remove duplicates
  }

  /**
   * Detect mentioned services/platforms
   */
  detectServices(description: string): string[] {
    const commonServices = [
      'slack',
      'email',
      'gmail',
      'sheets',
      'google sheets',
      'airtable',
      'notion',
      'discord',
      'webhook',
      'api',
      'database',
      'postgres',
      'mysql',
      'mongodb',
      'redis',
      'http',
      'rest',
      'graphql',
      'salesforce',
      'hubspot',
      'stripe',
      'github',
      'gitlab',
      'jira',
      'trello',
      'asana',
    ];

    const lowerDesc = description.toLowerCase();
    return commonServices.filter((service) => lowerDesc.includes(service));
  }

  /**
   * Estimate complexity based on description length and keywords
   */
  estimateComplexity(description: string): 'simple' | 'moderate' | 'complex' {
    const words = description.split(/\s+/).length;
    const complexKeywords = [
      'if',
      'else',
      'loop',
      'iterate',
      'multiple',
      'conditional',
      'branch',
      'parallel',
      'aggregate',
      'join',
      'merge',
    ];

    const hasComplexKeywords = complexKeywords.some((keyword) =>
      description.toLowerCase().includes(keyword),
    );

    if (words < 20 && !hasComplexKeywords) {
      return 'simple';
    } else if (words < 50 && !hasComplexKeywords) {
      return 'moderate';
    } else {
      return 'complex';
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private getCacheKey(description: string): string {
    // Simple hash for cache key
    return description.trim().toLowerCase().slice(0, 100);
  }

  private parseIntentResponse(content: string): Intent {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr.trim());
      return parsed as Intent;
    } catch (error) {
      throw new ModelError('Failed to parse intent response', ErrorCode.MODEL_API, {
        content,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createFallbackIntent(description: string): Intent {
    return {
      primaryAction: description.slice(0, 100),
      actionVerbs: this.extractActionVerbs(description),
      dataSources: this.detectServices(description),
      dataTargets: this.detectServices(description),
      conditions: [],
      transformations: [],
      workflowType: 'automation',
      complexity: this.estimateComplexity(description),
      requiredCapabilities: [],
      confidence: 0.3, // Low confidence for fallback
    };
  }
}

/**
 * Convenience function to analyze a single description
 */
export async function analyzeIntent(description: string): Promise<Intent> {
  const analyzer = new IntentAnalyzer();
  return analyzer.analyze(description);
}
