/**
 * Command Parser
 * Parses transcriptions into structured voice commands
 */

import type { Transcription, VoiceCommand, VoiceCommandType } from './types.js';
import type { WorkflowNode } from '../types/workflow.js';

interface IntentPattern {
  type: VoiceCommandType;
  patterns: RegExp[];
  priority: number;
}

interface EntityExtractor {
  name: string;
  pattern: RegExp;
  transform?: (value: string) => string;
}

export class CommandParser {
  private intentPatterns: IntentPattern[];
  private entityExtractors: EntityExtractor[];
  private nodeTypeAliases: Map<string, string>;
  private contextNodes: WorkflowNode[];

  constructor() {
    this.contextNodes = [];
    this.intentPatterns = this.initializeIntentPatterns();
    this.entityExtractors = this.initializeEntityExtractors();
    this.nodeTypeAliases = this.initializeNodeTypeAliases();
  }

  /**
   * Parse transcription into a voice command
   */
  parse(transcription: Transcription): VoiceCommand {
    const text = transcription.text.toLowerCase().trim();
    const intent = this.classifyIntent(text);
    const entities = this.extractEntities(text, intent.type);

    return {
      type: intent.type,
      rawText: transcription.text,
      intent: intent.description,
      entities,
      confidence: transcription.confidence * intent.confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Set workflow context for better parsing
   */
  setContext(nodes: WorkflowNode[]): void {
    this.contextNodes = nodes;
  }

  /**
   * Classify intent from text
   */
  private classifyIntent(text: string): { type: VoiceCommandType; description: string; confidence: number } {
    let bestMatch: { type: VoiceCommandType; description: string; confidence: number } | null = null;
    let highestPriority = -1;

    for (const pattern of this.intentPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          if (pattern.priority > highestPriority) {
            highestPriority = pattern.priority;
            bestMatch = {
              type: pattern.type,
              description: this.getIntentDescription(pattern.type),
              confidence: 0.9,
            };
          }
        }
      }
    }

    // Fallback to help
    if (!bestMatch) {
      return {
        type: 'help',
        description: 'Request help or unclear command',
        confidence: 0.5,
      };
    }

    return bestMatch;
  }

  /**
   * Extract entities from text based on command type
   */
  extractEntities(text: string, commandType: VoiceCommandType): Record<string, string | string[]> {
    const entities: Record<string, string | string[]> = {};

    // Extract based on command type
    switch (commandType) {
      case 'create_workflow':
        entities.name = this.extractWorkflowName(text);
        break;

      case 'add_node':
        entities.nodeType = this.extractNodeType(text);
        entities.nodeName = this.extractNodeName(text);
        break;

      case 'connect_nodes':
        const connection = this.extractConnection(text);
        entities.source = connection.source;
        entities.target = connection.target;
        break;

      case 'configure_node':
        entities.nodeName = this.extractNodeName(text);
        entities.parameters = this.extractParameters(text);
        break;

      case 'delete_node':
        entities.nodeName = this.extractNodeName(text);
        break;

      case 'navigate':
        entities.target = this.extractNavigationTarget(text);
        entities.action = this.extractNavigationAction(text);
        break;

      case 'execute':
        entities.mode = this.extractExecutionMode(text);
        break;
    }

    return entities;
  }

  /**
   * Extract workflow name from text
   */
  private extractWorkflowName(text: string): string {
    const patterns = [
      /(?:workflow|flow)\s+(?:called|named)\s+["']?([^"']+)["']?/i,
      /create\s+["']?([^"']+)["']?(?:\s+workflow)?/i,
      /new\s+workflow\s+["']?([^"']+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'New Workflow';
  }

  /**
   * Extract node type with fuzzy matching
   */
  private extractNodeType(text: string): string {
    // First try exact aliases
    for (const [alias, nodeType] of this.nodeTypeAliases.entries()) {
      if (text.includes(alias)) {
        return nodeType;
      }
    }

    // Try pattern matching
    const nodeTypePatterns = [
      /add\s+(?:a\s+)?(?:new\s+)?([a-z]+(?:\s+[a-z]+)?)\s+node/i,
      /insert\s+(?:a\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
      /(?:add|create)\s+([a-z]+)/i,
    ];

    for (const pattern of nodeTypePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        // Try fuzzy match with aliases
        return this.fuzzyMatchNodeType(extracted);
      }
    }

    return 'manual'; // Default to manual trigger
  }

  /**
   * Fuzzy match node type
   */
  private fuzzyMatchNodeType(input: string): string {
    const normalized = input.toLowerCase().replace(/\s+/g, '');

    // Direct match
    if (this.nodeTypeAliases.has(normalized)) {
      return this.nodeTypeAliases.get(normalized)!;
    }

    // Partial match
    for (const [alias, nodeType] of this.nodeTypeAliases.entries()) {
      if (alias.includes(normalized) || normalized.includes(alias)) {
        return nodeType;
      }
    }

    // Check if it contains known keywords
    if (input.includes('http') || input.includes('webhook')) return 'n8n-nodes-base.webhook';
    if (input.includes('code') || input.includes('javascript')) return 'n8n-nodes-base.code';
    if (input.includes('ai') || input.includes('agent')) return '@n8n/n8n-nodes-langchain.agent';
    if (input.includes('email') || input.includes('mail')) return 'n8n-nodes-base.emailSend';

    return input; // Return as-is if no match
  }

  /**
   * Extract node name from text
   */
  private extractNodeName(text: string): string {
    const patterns = [
      /(?:node|the)\s+(?:called|named)\s+["']?([^"']+)["']?/i,
      /["']([^"']+)["']\s+node/i,
      /(?:node|delete|remove)\s+["']?([^"']+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Try to match against existing nodes
    for (const node of this.contextNodes) {
      if (text.includes(node.name.toLowerCase())) {
        return node.name;
      }
    }

    return '';
  }

  /**
   * Extract connection information
   */
  private extractConnection(text: string): { source: string; target: string } {
    const patterns = [
      /connect\s+["']?([^"']+?)["']?\s+(?:to|with)\s+["']?([^"']+)["']?/i,
      /link\s+["']?([^"']+?)["']?\s+(?:to|with)\s+["']?([^"']+)["']?/i,
      /from\s+["']?([^"']+?)["']?\s+to\s+["']?([^"']+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[2]) {
        return {
          source: match[1].trim(),
          target: match[2].trim(),
        };
      }
    }

    return { source: '', target: '' };
  }

  /**
   * Extract parameters from text
   */
  private extractParameters(text: string): string {
    const patterns = [
      /(?:to|with)\s+(.+?)$/i,
      /configure\s+.+?\s+(.+)$/i,
      /set\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * Extract navigation target
   */
  private extractNavigationTarget(text: string): string {
    const patterns = [
      /go\s+to\s+["']?([^"']+)["']?/i,
      /navigate\s+to\s+["']?([^"']+)["']?/i,
      /show\s+(?:me\s+)?["']?([^"']+)["']?/i,
      /focus\s+on\s+["']?([^"']+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * Extract navigation action
   */
  private extractNavigationAction(text: string): string {
    if (text.includes('zoom in')) return 'zoom_in';
    if (text.includes('zoom out')) return 'zoom_out';
    if (text.includes('fit') || text.includes('show all')) return 'fit_view';
    if (text.includes('center')) return 'center';
    return 'navigate';
  }

  /**
   * Extract execution mode
   */
  private extractExecutionMode(text: string): string {
    if (text.includes('test') || text.includes('debug')) return 'test';
    if (text.includes('production') || text.includes('live')) return 'production';
    return 'manual';
  }

  /**
   * Initialize intent patterns
   */
  private initializeIntentPatterns(): IntentPattern[] {
    return [
      {
        type: 'create_workflow',
        patterns: [
          /create\s+(?:a\s+)?(?:new\s+)?workflow/i,
          /new\s+workflow/i,
          /start\s+(?:a\s+)?(?:new\s+)?workflow/i,
        ],
        priority: 10,
      },
      {
        type: 'add_node',
        patterns: [
          /add\s+(?:a\s+)?(?:new\s+)?\w+\s+node/i,
          /insert\s+(?:a\s+)?\w+/i,
          /create\s+(?:a\s+)?\w+\s+node/i,
        ],
        priority: 9,
      },
      {
        type: 'connect_nodes',
        patterns: [
          /connect\s+.+?\s+(?:to|with)/i,
          /link\s+.+?\s+(?:to|with)/i,
          /from\s+.+?\s+to\s+/i,
        ],
        priority: 8,
      },
      {
        type: 'configure_node',
        patterns: [
          /configure\s+.+?\s+(?:to|with)/i,
          /set\s+.+?\s+to/i,
          /update\s+.+?\s+with/i,
          /change\s+.+?\s+to/i,
        ],
        priority: 8,
      },
      {
        type: 'delete_node',
        patterns: [
          /delete\s+(?:the\s+)?\w+/i,
          /remove\s+(?:the\s+)?\w+/i,
        ],
        priority: 7,
      },
      {
        type: 'navigate',
        patterns: [
          /(?:go\s+to|navigate\s+to|show)/i,
          /zoom\s+(?:in|out)/i,
          /fit\s+to\s+view/i,
          /show\s+all/i,
          /focus\s+on/i,
        ],
        priority: 6,
      },
      {
        type: 'execute',
        patterns: [
          /(?:run|execute|start)\s+(?:the\s+)?workflow/i,
          /test\s+(?:the\s+)?workflow/i,
        ],
        priority: 7,
      },
      {
        type: 'undo',
        patterns: [/^undo$/i, /undo\s+(?:that|last|previous)/i],
        priority: 5,
      },
      {
        type: 'redo',
        patterns: [/^redo$/i, /redo\s+(?:that|last)/i],
        priority: 5,
      },
      {
        type: 'help',
        patterns: [
          /^help$/i,
          /what\s+can\s+(?:i|you)/i,
          /how\s+do\s+i/i,
          /show\s+(?:me\s+)?(?:help|commands)/i,
        ],
        priority: 4,
      },
    ];
  }

  /**
   * Initialize entity extractors
   */
  private initializeEntityExtractors(): EntityExtractor[] {
    return [
      {
        name: 'nodeName',
        pattern: /(?:node|called|named)\s+["']?([^"']+)["']?/i,
      },
      {
        name: 'nodeType',
        pattern: /(?:add|create|insert)\s+(?:a\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
      },
    ];
  }

  /**
   * Initialize node type aliases
   */
  private initializeNodeTypeAliases(): Map<string, string> {
    return new Map([
      // Triggers
      ['webhook', 'n8n-nodes-base.webhook'],
      ['manual', 'n8n-nodes-base.manualTrigger'],
      ['schedule', 'n8n-nodes-base.scheduleTrigger'],
      ['cron', 'n8n-nodes-base.cronTrigger'],

      // Core nodes
      ['http', 'n8n-nodes-base.httpRequest'],
      ['httprequest', 'n8n-nodes-base.httpRequest'],
      ['code', 'n8n-nodes-base.code'],
      ['javascript', 'n8n-nodes-base.code'],
      ['function', 'n8n-nodes-base.function'],
      ['set', 'n8n-nodes-base.set'],
      ['if', 'n8n-nodes-base.if'],
      ['switch', 'n8n-nodes-base.switch'],
      ['merge', 'n8n-nodes-base.merge'],
      ['split', 'n8n-nodes-base.splitInBatches'],

      // Communication
      ['email', 'n8n-nodes-base.emailSend'],
      ['gmail', 'n8n-nodes-base.gmail'],
      ['slack', 'n8n-nodes-base.slack'],
      ['discord', 'n8n-nodes-base.discord'],

      // Data storage
      ['postgres', 'n8n-nodes-base.postgres'],
      ['mysql', 'n8n-nodes-base.mySql'],
      ['mongodb', 'n8n-nodes-base.mongoDb'],
      ['redis', 'n8n-nodes-base.redis'],

      // AI nodes
      ['ai', '@n8n/n8n-nodes-langchain.agent'],
      ['agent', '@n8n/n8n-nodes-langchain.agent'],
      ['openai', '@n8n/n8n-nodes-langchain.lmChatOpenAi'],
      ['chatgpt', '@n8n/n8n-nodes-langchain.lmChatOpenAi'],
      ['anthropic', '@n8n/n8n-nodes-langchain.lmChatAnthropic'],
      ['claude', '@n8n/n8n-nodes-langchain.lmChatAnthropic'],
      ['vectorstore', '@n8n/n8n-nodes-langchain.vectorStorePinecone'],
      ['embedding', '@n8n/n8n-nodes-langchain.embeddingsOpenAi'],
    ]);
  }

  /**
   * Get intent description
   */
  private getIntentDescription(type: VoiceCommandType): string {
    const descriptions: Record<VoiceCommandType, string> = {
      create_workflow: 'Create a new workflow',
      add_node: 'Add a node to the workflow',
      connect_nodes: 'Connect two nodes',
      configure_node: 'Configure node parameters',
      delete_node: 'Delete a node',
      navigate: 'Navigate the workflow canvas',
      execute: 'Execute the workflow',
      help: 'Get help',
      undo: 'Undo last action',
      redo: 'Redo last action',
    };

    return descriptions[type];
  }
}
