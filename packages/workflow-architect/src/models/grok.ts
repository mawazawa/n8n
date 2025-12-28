/**
 * Grok 4.2 Model Configuration
 * Placeholder for xAI's Grok 4.2 model
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';

export interface GrokConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export const GROK_MODELS = {
  'grok-4.2': {
    id: 'grok-4.2',
    name: 'Grok 4.2',
    provider: 'xai',
    maxContext: 128_000,
    maxOutput: 16_000,
    costPerMillionInput: 2.0,  // Placeholder pricing
    costPerMillionOutput: 6.0,
    supportsTools: true,
    supportsVision: true,
    description: 'xAI Grok 4.2 - Advanced reasoning with real-time knowledge',
  },
  'grok-3': {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xai',
    maxContext: 100_000,
    maxOutput: 8_000,
    costPerMillionInput: 1.5,
    costPerMillionOutput: 4.5,
    supportsTools: true,
    supportsVision: false,
    description: 'xAI Grok 3 - Fast and efficient reasoning',
  },
} as const;

/**
 * Create a Grok model instance
 * Note: xAI uses OpenAI-compatible API
 */
export function createGrokModel(config: GrokConfig): BaseChatModel {
  const apiKey = config.apiKey || process.env.XAI_API_KEY;
  const baseURL = config.baseURL || process.env.XAI_BASE_URL || 'https://api.x.ai/v1';

  if (!apiKey) {
    throw new Error('XAI_API_KEY is required for Grok models');
  }

  // Use ChatOpenAI with custom base URL for Grok
  // xAI provides an OpenAI-compatible API
  return new ChatOpenAI({
    apiKey,
    configuration: {
      baseURL,
    },
    model: config.model,
    maxTokens: config.maxTokens || 16_000,
    temperature: config.temperature || 0.7,
  });
}

/**
 * Grok-specific optimizations
 */
export const GROK_OPTIMIZATIONS = {
  // Grok excels at real-time information and reasoning
  preferredTasks: [
    'real-time-data',
    'current-events',
    'reasoning',
    'analysis',
  ],

  // Optimal prompt structure for Grok
  promptTemplate: `{system_context}

Task: {task}

Context: {context}

Requirements: {requirements}

Please provide a detailed response with step-by-step reasoning.`,

  // Best practices for Grok
  bestPractices: [
    'Include specific context for better reasoning',
    'Use structured output formats',
    'Leverage real-time capabilities when needed',
    'Break down complex tasks into steps',
  ],
};

/**
 * Check if Grok API is available
 */
export function isGrokAvailable(): boolean {
  return !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
}

/**
 * Get Grok model configuration
 */
export function getGrokConfig(modelId: keyof typeof GROK_MODELS) {
  return GROK_MODELS[modelId];
}

/**
 * Estimate cost for Grok model
 */
export function estimateGrokCost(
  modelId: keyof typeof GROK_MODELS,
  inputTokens: number,
  outputTokens: number
): number {
  const model = GROK_MODELS[modelId];
  const inputCost = (inputTokens / 1_000_000) * model.costPerMillionInput;
  const outputCost = (outputTokens / 1_000_000) * model.costPerMillionOutput;
  return inputCost + outputCost;
}
