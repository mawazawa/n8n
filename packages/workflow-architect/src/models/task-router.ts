/**
 * Task-Based Model Router
 * Routes to different models based on the type of task being performed
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createGrokModel, isGrokAvailable } from './grok.js';

export type TaskType =
  | 'discovery'      // Finding relevant nodes/workflows
  | 'building'       // Creating workflow structure
  | 'configuration'  // Setting parameters and credentials
  | 'response'       // Generating user-facing responses
  | 'complex'        // Complex reasoning tasks
  | 'simple'         // Simple, fast tasks
  | 'reasoning'      // Advanced reasoning with real-time data
  | 'analysis';      // Data analysis and insights

export interface TaskModelConfig {
  modelId: string;
  provider: 'anthropic' | 'openai' | 'google';
  maxTokens?: number;
  temperature?: number;
}

export interface TaskRouterConfig {
  defaultModel: string;
  taskModels: Partial<Record<TaskType, TaskModelConfig>>;
  enableCostOptimization?: boolean;
  enableLatencyOptimization?: boolean;
}

const DEFAULT_TASK_MODELS: Record<TaskType, TaskModelConfig> = {
  discovery: {
    modelId: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    maxTokens: 2048,
    temperature: 0.3,
  },
  building: {
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 4096,
    temperature: 0.5,
  },
  configuration: {
    modelId: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    maxTokens: 2048,
    temperature: 0.2,
  },
  response: {
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 2048,
    temperature: 0.7,
  },
  complex: {
    modelId: 'claude-opus-4-20250514',
    provider: 'anthropic',
    maxTokens: 8192,
    temperature: 0.5,
  },
  simple: {
    modelId: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    maxTokens: 1024,
    temperature: 0.3,
  },
  reasoning: {
    modelId: 'grok-4.2',
    provider: 'openai', // Using OpenAI client for Grok
    maxTokens: 4096,
    temperature: 0.6,
  },
  analysis: {
    modelId: 'gpt-4o',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.4,
  },
};

/**
 * Create a task-based model router
 */
export function createTaskRouter(config: Partial<TaskRouterConfig> = {}) {
  const taskModels = { ...DEFAULT_TASK_MODELS, ...config.taskModels };
  const modelCache = new Map<string, BaseChatModel>();

  /**
   * Get or create a model instance
   */
  function getModel(modelConfig: TaskModelConfig): BaseChatModel {
    const cacheKey = `${modelConfig.provider}:${modelConfig.modelId}`;

    if (modelCache.has(cacheKey)) {
      return modelCache.get(cacheKey)!;
    }

    let model: BaseChatModel;

    switch (modelConfig.provider) {
      case 'anthropic':
        model = new ChatAnthropic({
          modelName: modelConfig.modelId,
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        });
        break;

      case 'openai':
        model = new ChatOpenAI({
          modelName: modelConfig.modelId,
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        });
        break;

      case 'google':
        model = new ChatGoogleGenerativeAI({
          modelName: modelConfig.modelId,
          maxOutputTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        });
        break;

      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }

    modelCache.set(cacheKey, model);
    return model;
  }

  return {
    /**
     * Get the appropriate model for a task type
     */
    getModelForTask(taskType: TaskType): BaseChatModel {
      const modelConfig = taskModels[taskType];
      return getModel(modelConfig);
    },

    /**
     * Get the optimal model based on task complexity and requirements
     */
    selectOptimalModel(options: {
      taskType: TaskType;
      complexity?: 'low' | 'medium' | 'high';
      requiresRealTime?: boolean;
      maxLatency?: number;
    }): BaseChatModel {
      const { taskType, complexity = 'medium', requiresRealTime = false } = options;

      // Prefer Grok for real-time tasks if available
      if (requiresRealTime && isGrokAvailable()) {
        return getModel({
          modelId: 'grok-4.2',
          provider: 'openai',
          maxTokens: 4096,
        });
      }

      // Adjust model based on complexity
      if (complexity === 'high') {
        return this.getModelForTask('complex');
      } else if (complexity === 'low') {
        return this.getModelForTask('simple');
      }

      // Default to task-specific model
      return this.getModelForTask(taskType);
    },

    /**
     * Get model config for a task type
     */
    getConfigForTask(taskType: TaskType): TaskModelConfig {
      return taskModels[taskType];
    },

    /**
     * Select model based on context size
     * Uses larger context models for big inputs
     */
    selectByContextSize(tokenCount: number): BaseChatModel {
      if (tokenCount > 100000) {
        // For very large context, use Gemini 2.0 Pro (if available) or Claude
        if (process.env.GOOGLE_AI_API_KEY) {
          return getModel({
            modelId: 'gemini-2.0-flash-exp',
            provider: 'google',
            maxTokens: 8192,
          });
        }
        return this.getModelForTask('complex');
      }

      if (tokenCount > 50000) {
        return this.getModelForTask('complex');
      }

      if (tokenCount > 20000) {
        return this.getModelForTask('building');
      }

      return this.getModelForTask('simple');
    },

    /**
     * Estimate cost for a task
     */
    estimateCost(taskType: TaskType, inputTokens: number, outputTokens: number): number {
      const config = taskModels[taskType];

      // Approximate costs per 1M tokens (as of Dec 2024)
      const costs: Record<string, { input: number; output: number }> = {
        'claude-opus-4-20250514': { input: 15, output: 75 },
        'claude-sonnet-4-20250514': { input: 3, output: 15 },
        'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
        'gpt-4-turbo': { input: 10, output: 30 },
        'gpt-4o': { input: 5, output: 15 },
        'gemini-2.0-flash-exp': { input: 0, output: 0 }, // Free during preview
      };

      const modelCosts = costs[config.modelId] || { input: 5, output: 15 };
      const inputCost = (inputTokens / 1_000_000) * modelCosts.input;
      const outputCost = (outputTokens / 1_000_000) * modelCosts.output;

      return inputCost + outputCost;
    },

    /**
     * Clear the model cache
     */
    clearCache() {
      modelCache.clear();
    },
  };
}

export type TaskRouter = ReturnType<typeof createTaskRouter>;

// Singleton instance
let routerInstance: TaskRouter | null = null;

export function getTaskRouter(): TaskRouter {
  if (!routerInstance) {
    routerInstance = createTaskRouter();
  }
  return routerInstance;
}
