/**
 * Multi-Model Router
 * Routes requests to appropriate AI model based on context size and task type
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';

export type ModelId =
  | 'claude-opus-4-5'
  | 'claude-sonnet-4'
  | 'gemini-3-pro'
  | 'gemini-2-flash'
  | 'gpt-5.2-codex'
  | 'gpt-4o'
  | 'grok-4.2';  // Future

export interface ModelConfig {
  id: ModelId;
  provider: 'anthropic' | 'google' | 'openai' | 'xai';
  maxContext: number;
  maxOutput: number;
  costPerMillionInput: number;
  costPerMillionOutput: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  'claude-opus-4-5': {
    id: 'claude-opus-4-5',
    provider: 'anthropic',
    maxContext: 200_000,
    maxOutput: 16_000,
    costPerMillionInput: 5,
    costPerMillionOutput: 25,
    supportsTools: true,
    supportsVision: true,
  },
  'claude-sonnet-4': {
    id: 'claude-sonnet-4',
    provider: 'anthropic',
    maxContext: 200_000,
    maxOutput: 16_000,
    costPerMillionInput: 3,
    costPerMillionOutput: 15,
    supportsTools: true,
    supportsVision: true,
  },
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    provider: 'google',
    maxContext: 1_000_000,
    maxOutput: 32_000,
    costPerMillionInput: 3.5,
    costPerMillionOutput: 10.5,
    supportsTools: true,
    supportsVision: true,
  },
  'gemini-2-flash': {
    id: 'gemini-2-flash',
    provider: 'google',
    maxContext: 1_000_000,
    maxOutput: 8_000,
    costPerMillionInput: 0.075,
    costPerMillionOutput: 0.3,
    supportsTools: true,
    supportsVision: true,
  },
  'gpt-5.2-codex': {
    id: 'gpt-5.2-codex',
    provider: 'openai',
    maxContext: 256_000,
    maxOutput: 16_000,
    costPerMillionInput: 10,
    costPerMillionOutput: 30,
    supportsTools: true,
    supportsVision: true,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    maxContext: 128_000,
    maxOutput: 16_000,
    costPerMillionInput: 2.5,
    costPerMillionOutput: 10,
    supportsTools: true,
    supportsVision: true,
  },
  'grok-4.2': {
    id: 'grok-4.2',
    provider: 'xai',
    maxContext: 128_000,  // TBD
    maxOutput: 16_000,
    costPerMillionInput: 2,  // TBD
    costPerMillionOutput: 6,
    supportsTools: true,
    supportsVision: true,
  },
};

export interface RouterConfig {
  largeContextThreshold: number;
  preferredModel: ModelId;
  fallbackModels: ModelId[];
  anthropicApiKey?: string;
  googleApiKey?: string;
  openaiApiKey?: string;
}

const DEFAULT_CONFIG: RouterConfig = {
  largeContextThreshold: 100_000,
  preferredModel: 'claude-opus-4-5',
  fallbackModels: ['gemini-3-pro', 'gpt-4o'],
};

/**
 * Estimate token count from messages
 * Rough approximation: ~4 chars per token for English
 */
export function estimateTokenCount(messages: BaseMessage[]): number {
  let totalChars = 0;
  for (const message of messages) {
    const content = message.content;
    if (typeof content === 'string') {
      totalChars += content.length;
    } else if (Array.isArray(content)) {
      // Cast to unknown[] to handle LangChain's complex content types
      for (const part of content as unknown[]) {
        if (typeof part === 'string') {
          totalChars += part.length;
        } else if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text: string }).text;
          if (typeof text === 'string') {
            totalChars += text.length;
          }
        }
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

export class ModelRouter {
  private config: RouterConfig;
  private modelCache: Map<ModelId, BaseChatModel> = new Map();

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load API keys from environment if not provided
    this.config.anthropicApiKey ??= process.env.ANTHROPIC_API_KEY;
    this.config.googleApiKey ??= process.env.GOOGLE_AI_API_KEY;
    this.config.openaiApiKey ??= process.env.OPENAI_API_KEY;
  }

  /**
   * Select the best model for the given context
   */
  selectModel(messages: BaseMessage[]): ModelConfig {
    const tokenCount = estimateTokenCount(messages);

    // Large context: use models with 1M+ context
    if (tokenCount > this.config.largeContextThreshold) {
      // Prefer Gemini for large context
      if (this.config.googleApiKey && MODEL_CONFIGS['gemini-3-pro']) {
        return MODEL_CONFIGS['gemini-3-pro'];
      }
      // Fallback to GPT-5.2 Codex
      if (this.config.openaiApiKey && MODEL_CONFIGS['gpt-5.2-codex']) {
        return MODEL_CONFIGS['gpt-5.2-codex'];
      }
    }

    // Standard context: use preferred model (Claude Opus by default)
    const preferred = MODEL_CONFIGS[this.config.preferredModel];
    if (this.hasApiKey(preferred.provider)) {
      return preferred;
    }

    // Try fallbacks
    for (const fallbackId of this.config.fallbackModels) {
      const fallback = MODEL_CONFIGS[fallbackId];
      if (this.hasApiKey(fallback.provider)) {
        return fallback;
      }
    }

    throw new Error('No available AI models. Please configure at least one API key.');
  }

  /**
   * Get a LangChain chat model instance
   */
  getModel(modelId: ModelId): BaseChatModel {
    // Check cache
    if (this.modelCache.has(modelId)) {
      return this.modelCache.get(modelId)!;
    }

    const config = MODEL_CONFIGS[modelId];
    let model: BaseChatModel;

    switch (config.provider) {
      case 'anthropic':
        if (!this.config.anthropicApiKey) {
          throw new Error('ANTHROPIC_API_KEY is required for Claude models');
        }
        model = new ChatAnthropic({
          apiKey: this.config.anthropicApiKey,
          model: this.mapModelName(modelId),
          maxTokens: config.maxOutput,
        });
        break;

      case 'google':
        if (!this.config.googleApiKey) {
          throw new Error('GOOGLE_AI_API_KEY is required for Gemini models');
        }
        model = new ChatGoogleGenerativeAI({
          apiKey: this.config.googleApiKey,
          model: this.mapModelName(modelId),
          maxOutputTokens: config.maxOutput,
        });
        break;

      case 'openai':
        if (!this.config.openaiApiKey) {
          throw new Error('OPENAI_API_KEY is required for GPT models');
        }
        model = new ChatOpenAI({
          apiKey: this.config.openaiApiKey,
          model: this.mapModelName(modelId),
          maxTokens: config.maxOutput,
        });
        break;

      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }

    this.modelCache.set(modelId, model);
    return model;
  }

  /**
   * Get model for current context, automatically selecting based on size
   */
  getModelForContext(messages: BaseMessage[]): BaseChatModel {
    const config = this.selectModel(messages);
    return this.getModel(config.id);
  }

  /**
   * Map our model IDs to provider-specific model names
   */
  private mapModelName(modelId: ModelId): string {
    const mapping: Record<ModelId, string> = {
      'claude-opus-4-5': 'claude-opus-4-5-20251101',
      'claude-sonnet-4': 'claude-sonnet-4-20250514',
      'gemini-3-pro': 'gemini-3.0-pro',
      'gemini-2-flash': 'gemini-2.0-flash-exp',
      'gpt-5.2-codex': 'gpt-5.2-codex-xtrahigh',
      'gpt-4o': 'gpt-4o-2024-11-20',
      'grok-4.2': 'grok-4.2',  // TBD
    };
    return mapping[modelId] || modelId;
  }

  private hasApiKey(provider: string): boolean {
    switch (provider) {
      case 'anthropic':
        return !!this.config.anthropicApiKey;
      case 'google':
        return !!this.config.googleApiKey;
      case 'openai':
        return !!this.config.openaiApiKey;
      default:
        return false;
    }
  }

  /**
   * Get available models based on configured API keys
   */
  getAvailableModels(): ModelConfig[] {
    return Object.values(MODEL_CONFIGS).filter(
      config => this.hasApiKey(config.provider)
    );
  }

  /**
   * Estimate cost for a given number of tokens
   */
  estimateCost(modelId: ModelId, inputTokens: number, outputTokens: number): number {
    const config = MODEL_CONFIGS[modelId];
    const inputCost = (inputTokens / 1_000_000) * config.costPerMillionInput;
    const outputCost = (outputTokens / 1_000_000) * config.costPerMillionOutput;
    return inputCost + outputCost;
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null;

export function getModelRouter(config?: Partial<RouterConfig>): ModelRouter {
  if (!routerInstance || config) {
    routerInstance = new ModelRouter(config);
  }
  return routerInstance;
}
