/**
 * Node Selector
 * Matches intent to available n8n nodes with confidence scoring
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { Intent, NodeSuggestion, NodeSelectionContext } from './types';
import { getRAGStore } from '../rag';
import { wrapError } from '../errors';

// Common n8n node mappings
const NODE_REGISTRY: Record<
  string,
  { type: string; displayName: string; description: string; keywords: string[] }
> = {
  webhook: {
    type: 'n8n-nodes-base.webhook',
    displayName: 'Webhook',
    description: 'Receive HTTP requests',
    keywords: ['trigger', 'http', 'api', 'receive'],
  },
  httpRequest: {
    type: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    description: 'Make HTTP requests to any API',
    keywords: ['api', 'http', 'rest', 'fetch', 'call'],
  },
  code: {
    type: 'n8n-nodes-base.code',
    displayName: 'Code',
    description: 'Run custom JavaScript code',
    keywords: ['javascript', 'transform', 'custom', 'script'],
  },
  set: {
    type: 'n8n-nodes-base.set',
    displayName: 'Set',
    description: 'Set node data',
    keywords: ['transform', 'map', 'set', 'data'],
  },
  if: {
    type: 'n8n-nodes-base.if',
    displayName: 'IF',
    description: 'Conditional branching',
    keywords: ['condition', 'branch', 'if', 'logic'],
  },
  switch: {
    type: 'n8n-nodes-base.switch',
    displayName: 'Switch',
    description: 'Route to different branches',
    keywords: ['condition', 'route', 'branch', 'case'],
  },
  merge: {
    type: 'n8n-nodes-base.merge',
    displayName: 'Merge',
    description: 'Merge data from multiple branches',
    keywords: ['combine', 'merge', 'join'],
  },
  gmail: {
    type: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    description: 'Send and receive emails via Gmail',
    keywords: ['email', 'gmail', 'send', 'mail'],
  },
  slack: {
    type: 'n8n-nodes-base.slack',
    displayName: 'Slack',
    description: 'Send messages to Slack',
    keywords: ['slack', 'message', 'notify', 'chat'],
  },
  googleSheets: {
    type: 'n8n-nodes-base.googleSheets',
    displayName: 'Google Sheets',
    description: 'Read and write to Google Sheets',
    keywords: ['sheets', 'spreadsheet', 'data', 'google'],
  },
  postgres: {
    type: 'n8n-nodes-base.postgres',
    displayName: 'Postgres',
    description: 'Execute queries in PostgreSQL',
    keywords: ['database', 'postgres', 'sql', 'query'],
  },
  schedule: {
    type: 'n8n-nodes-base.scheduleTrigger',
    displayName: 'Schedule Trigger',
    description: 'Trigger workflow on schedule',
    keywords: ['schedule', 'cron', 'timer', 'interval'],
  },
  wait: {
    type: 'n8n-nodes-base.wait',
    displayName: 'Wait',
    description: 'Wait before continuing',
    keywords: ['wait', 'delay', 'pause', 'sleep'],
  },
  filter: {
    type: 'n8n-nodes-base.filter',
    displayName: 'Filter',
    description: 'Filter items based on conditions',
    keywords: ['filter', 'remove', 'condition'],
  },
  aggregate: {
    type: 'n8n-nodes-base.aggregate',
    displayName: 'Aggregate',
    description: 'Aggregate and summarize data',
    keywords: ['aggregate', 'sum', 'count', 'group'],
  },
};

const NODE_SELECTION_PROMPT = `You are an expert n8n node selector. Given a workflow intent and available nodes, select the most suitable nodes.

Consider:
1. Node capabilities and limitations
2. Data type compatibility
3. Authentication requirements
4. Performance characteristics
5. Ease of configuration

Respond with a JSON array of node suggestions:
[
  {
    "nodeType": "n8n-nodes-base.nodeName",
    "displayName": "Node Display Name",
    "confidence": 0.0-1.0,
    "rationale": "Why this node is suitable",
    "alternatives": [
      { "nodeType": "alternative", "confidence": 0.0-1.0 }
    ],
    "requiredCredentials": ["credential_type"],
    "estimatedConfig": {}
  }
]`;

export interface NodeSelectorConfig {
  model?: BaseChatModel;
  useRAG?: boolean;
}

export class NodeSelector {
  private model: BaseChatModel;
  private useRAG: boolean;

  constructor(config: NodeSelectorConfig = {}) {
    const router = getTaskRouter();
    this.model = config.model || router.getModelForTask('discovery');
    this.useRAG = config.useRAG ?? true;
  }

  /**
   * Select nodes based on intent
   */
  async selectNodes(intent: Intent, context?: Partial<NodeSelectionContext>): Promise<NodeSuggestion[]> {
    try {
      // Get relevant examples from RAG if enabled
      let examples: string[] = [];
      if (this.useRAG) {
        examples = await this.getRelevantExamples(intent);
      }

      // Build selection context
      const selectionContext = {
        intent,
        availableNodes: this.getAvailableNodes(),
        examples,
        ...context,
      };

      // Get suggestions from LLM
      const response = await this.model.invoke([
        new SystemMessage(NODE_SELECTION_PROMPT),
        new HumanMessage(JSON.stringify(selectionContext, null, 2)),
      ]);

      // Parse and validate
      const suggestions = this.parseSuggestions(response.content.toString());

      // Rank by suitability
      const rankedSuggestions = this.rankSuggestions(suggestions, intent);

      return rankedSuggestions;
    } catch (error) {
      throw wrapError(error, 'Failed to select nodes');
    }
  }

  /**
   * Match a specific action to node types
   */
  matchActionToNodes(action: string): NodeSuggestion[] {
    const lowerAction = action.toLowerCase();
    const matches: NodeSuggestion[] = [];

    // Search node registry
    for (const [key, node] of Object.entries(NODE_REGISTRY)) {
      const score = this.calculateMatchScore(lowerAction, node.keywords);

      if (score > 0.3) {
        matches.push({
          nodeType: node.type,
          displayName: node.displayName,
          confidence: score,
          rationale: `Matches keywords: ${node.keywords.join(', ')}`,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get trigger node suggestions
   */
  suggestTriggerNode(intent: Intent): NodeSuggestion {
    // Webhook for API/HTTP triggers
    if (intent.dataSources.some((s) => s.includes('webhook') || s.includes('api'))) {
      return {
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        confidence: 0.9,
        rationale: 'Intent mentions webhook or API trigger',
      };
    }

    // Schedule for time-based triggers
    if (
      intent.requiredCapabilities.includes('scheduling') ||
      intent.description?.toLowerCase().includes('schedule')
    ) {
      return {
        nodeType: 'n8n-nodes-base.scheduleTrigger',
        displayName: 'Schedule Trigger',
        confidence: 0.85,
        rationale: 'Intent requires scheduled execution',
      };
    }

    // Manual trigger as fallback
    return {
      nodeType: 'n8n-nodes-base.manualTrigger',
      displayName: 'Manual Trigger',
      confidence: 0.6,
      rationale: 'No specific trigger mentioned, using manual',
    };
  }

  /**
   * Get action node suggestions
   */
  suggestActionNodes(intent: Intent): NodeSuggestion[] {
    const actions: NodeSuggestion[] = [];

    // Email actions
    if (intent.dataTargets.some((t) => t.includes('email') || t.includes('gmail'))) {
      actions.push({
        nodeType: 'n8n-nodes-base.gmail',
        displayName: 'Gmail',
        confidence: 0.9,
        rationale: 'Intent mentions email as target',
        requiredCredentials: ['gmailOAuth2'],
      });
    }

    // Slack actions
    if (intent.dataTargets.some((t) => t.includes('slack'))) {
      actions.push({
        nodeType: 'n8n-nodes-base.slack',
        displayName: 'Slack',
        confidence: 0.9,
        rationale: 'Intent mentions Slack as target',
        requiredCredentials: ['slackOAuth2'],
      });
    }

    // Database actions
    if (intent.dataTargets.some((t) => t.includes('database') || t.includes('postgres'))) {
      actions.push({
        nodeType: 'n8n-nodes-base.postgres',
        displayName: 'Postgres',
        confidence: 0.85,
        rationale: 'Intent mentions database as target',
        requiredCredentials: ['postgres'],
      });
    }

    // HTTP Request for generic APIs
    if (intent.dataTargets.some((t) => t.includes('api') || t.includes('http'))) {
      actions.push({
        nodeType: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
        confidence: 0.8,
        rationale: 'Intent mentions API endpoint',
      });
    }

    return actions;
  }

  /**
   * Get transformation node suggestions
   */
  suggestTransformationNodes(intent: Intent): NodeSuggestion[] {
    const transformations: NodeSuggestion[] = [];

    // Code for complex transformations
    if (intent.transformations.length > 2 || intent.complexity === 'complex') {
      transformations.push({
        nodeType: 'n8n-nodes-base.code',
        displayName: 'Code',
        confidence: 0.85,
        rationale: 'Complex transformations require custom code',
      });
    }

    // Set for simple transformations
    if (intent.transformations.length > 0) {
      transformations.push({
        nodeType: 'n8n-nodes-base.set',
        displayName: 'Set',
        confidence: 0.8,
        rationale: 'Data transformation needed',
      });
    }

    // Filter if conditions present
    if (intent.conditions.length > 0) {
      transformations.push({
        nodeType: 'n8n-nodes-base.filter',
        displayName: 'Filter',
        confidence: 0.75,
        rationale: 'Conditional filtering required',
      });
    }

    return transformations;
  }

  // ============================================
  // Private Methods
  // ============================================

  private getAvailableNodes(): Array<{ type: string; displayName: string; description: string }> {
    return Object.values(NODE_REGISTRY);
  }

  private async getRelevantExamples(intent: Intent): Promise<string[]> {
    try {
      const ragStore = await getRAGStore();
      const results = await ragStore.search(intent.primaryAction, {
        limit: 3,
        category: intent.workflowType,
      });

      return results.map((r) => `Example: ${r.name}\nNodes used: ${r.workflow.nodes.map((n) => n.type).join(', ')}`);
    } catch (error) {
      // RAG is optional, continue without examples
      return [];
    }
  }

  private parseSuggestions(content: string): NodeSuggestion[] {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr.trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      // Fallback to empty array
      return [];
    }
  }

  private rankSuggestions(suggestions: NodeSuggestion[], intent: Intent): NodeSuggestion[] {
    return suggestions
      .map((suggestion) => {
        // Boost confidence based on intent match
        let adjustedConfidence = suggestion.confidence;

        // Boost if matches workflow type
        if (
          (intent.workflowType === 'webhook' && suggestion.nodeType.includes('webhook')) ||
          (intent.workflowType === 'notification' && suggestion.nodeType.includes('slack'))
        ) {
          adjustedConfidence *= 1.2;
        }

        return {
          ...suggestion,
          confidence: Math.min(adjustedConfidence, 1.0),
        };
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  private calculateMatchScore(action: string, keywords: string[]): number {
    let score = 0;

    for (const keyword of keywords) {
      if (action.includes(keyword)) {
        score += 0.3;
      }
    }

    return Math.min(score, 1.0);
  }
}

/**
 * Convenience function to select nodes
 */
export async function selectNodes(intent: Intent): Promise<NodeSuggestion[]> {
  const selector = new NodeSelector();
  return selector.selectNodes(intent);
}
