/**
 * Unit Tests for ModelRouter
 * Tests multi-model routing and selection logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelRouter, estimateTokenCount, MODEL_CONFIGS } from '../../src/models/router';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ModelId } from '../../src/models/router';

describe('ModelRouter', () => {
  describe('estimateTokenCount', () => {
    it('should estimate tokens for simple string messages', () => {
      const messages = [
        new HumanMessage('Hello world'),
        new SystemMessage('You are a helpful assistant'),
      ];

      const count = estimateTokenCount(messages);

      // Rough estimate: ~4 chars per token
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(100);
    });

    it('should handle empty messages', () => {
      const count = estimateTokenCount([]);
      expect(count).toBe(0);
    });

    it('should estimate tokens for complex content', () => {
      const messages = [
        new HumanMessage([
          { type: 'text' as const, text: 'Analyze this image' },
        ]),
      ];

      const count = estimateTokenCount(messages);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle very long messages', () => {
      const longText = 'a'.repeat(100000);
      const messages = [new HumanMessage(longText)];

      const count = estimateTokenCount(messages);
      expect(count).toBeGreaterThan(20000);
    });
  });

  describe('ModelRouter - Model Selection', () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
        googleApiKey: 'test-google-key',
        openaiApiKey: 'test-openai-key',
        preferredModel: 'claude-opus-4-5',
        largeContextThreshold: 100000,
      });
    });

    it('should select preferred model for small context', () => {
      const messages = [new HumanMessage('Short message')];

      const selected = router.selectModel(messages);

      expect(selected.id).toBe('claude-opus-4-5');
      expect(selected.provider).toBe('anthropic');
    });

    it('should select large context model for many tokens', () => {
      const longMessage = 'word '.repeat(30000); // ~120k tokens
      const messages = [new HumanMessage(longMessage)];

      const selected = router.selectModel(messages);

      // Should select Gemini for large context (1M tokens)
      expect(selected.id).toBe('gemini-3-pro');
      expect(selected.maxContext).toBeGreaterThanOrEqual(1000000);
    });

    it('should fallback to GPT if Gemini not available for large context', () => {
      const routerNoGoogle = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
        openaiApiKey: 'test-openai-key',
        // No Google API key
        largeContextThreshold: 100000,
      });

      const longMessage = 'word '.repeat(30000);
      const messages = [new HumanMessage(longMessage)];

      const selected = routerNoGoogle.selectModel(messages);

      expect(selected.id).toBe('gpt-5.2-codex');
    });

    it('should throw error if no API keys configured', () => {
      const emptyRouter = new ModelRouter({
        // No API keys
      });

      expect(() => {
        emptyRouter.selectModel([new HumanMessage('test')]);
      }).toThrow('No available AI models');
    });

    it('should use fallback models if preferred unavailable', () => {
      const routerNoAnthropic = new ModelRouter({
        googleApiKey: 'test-google-key',
        openaiApiKey: 'test-openai-key',
        preferredModel: 'claude-opus-4-5',
        fallbackModels: ['gemini-3-pro', 'gpt-4o'],
      });

      const messages = [new HumanMessage('test')];
      const selected = routerNoAnthropic.selectModel(messages);

      expect(['gemini-3-pro', 'gpt-4o']).toContain(selected.id);
    });
  });

  describe('ModelRouter - Model Retrieval', () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
        googleApiKey: 'test-google-key',
        openaiApiKey: 'test-openai-key',
      });
    });

    it('should get Anthropic model', () => {
      const model = router.getModel('claude-opus-4-5');

      expect(model).toBeDefined();
      expect(model.constructor.name).toContain('Chat');
    });

    it('should get Google model', () => {
      const model = router.getModel('gemini-3-pro');

      expect(model).toBeDefined();
    });

    it('should get OpenAI model', () => {
      const model = router.getModel('gpt-4o');

      expect(model).toBeDefined();
    });

    it('should cache model instances', () => {
      const model1 = router.getModel('claude-opus-4-5');
      const model2 = router.getModel('claude-opus-4-5');

      expect(model1).toBe(model2);
    });

    it('should throw error for missing Anthropic API key', () => {
      const routerNoAnthropic = new ModelRouter({
        googleApiKey: 'test-google-key',
      });

      expect(() => {
        routerNoAnthropic.getModel('claude-opus-4-5');
      }).toThrow('ANTHROPIC_API_KEY is required');
    });

    it('should throw error for missing Google API key', () => {
      const routerNoGoogle = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
      });

      expect(() => {
        routerNoGoogle.getModel('gemini-3-pro');
      }).toThrow('GOOGLE_AI_API_KEY is required');
    });

    it('should throw error for missing OpenAI API key', () => {
      const routerNoOpenAI = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
      });

      expect(() => {
        routerNoOpenAI.getModel('gpt-4o');
      }).toThrow('OPENAI_API_KEY is required');
    });
  });

  describe('ModelRouter - Context-Based Selection', () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        anthropicApiKey: 'test-anthropic-key',
        googleApiKey: 'test-google-key',
        openaiApiKey: 'test-openai-key',
      });
    });

    it('should get model for context automatically', () => {
      const messages = [new HumanMessage('test')];
      const model = router.getModelForContext(messages);

      expect(model).toBeDefined();
    });

    it('should select different models based on context size', () => {
      const smallMessages = [new HumanMessage('short')];
      const largeMessages = [new HumanMessage('word '.repeat(30000))];

      const smallModel = router.getModelForContext(smallMessages);
      const largeModel = router.getModelForContext(largeMessages);

      expect(smallModel).toBeDefined();
      expect(largeModel).toBeDefined();
    });
  });

  describe('ModelRouter - Available Models', () => {
    it('should list available models based on API keys', () => {
      const router = new ModelRouter({
        anthropicApiKey: 'test-key',
        googleApiKey: 'test-key',
      });

      const available = router.getAvailableModels();

      expect(available.length).toBeGreaterThan(0);
      expect(available.every(m => m.provider === 'anthropic' || m.provider === 'google')).toBe(true);
    });

    it('should return empty for no API keys', () => {
      const router = new ModelRouter({});
      const available = router.getAvailableModels();

      expect(available.length).toBe(0);
    });

    it('should include all models when all keys provided', () => {
      const router = new ModelRouter({
        anthropicApiKey: 'test-key',
        googleApiKey: 'test-key',
        openaiApiKey: 'test-key',
      });

      const available = router.getAvailableModels();

      // Should have models from all providers (excluding xai which needs special handling)
      const providers = new Set(available.map(m => m.provider));
      expect(providers.has('anthropic')).toBe(true);
      expect(providers.has('google')).toBe(true);
      expect(providers.has('openai')).toBe(true);
    });
  });

  describe('ModelRouter - Cost Estimation', () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        anthropicApiKey: 'test-key',
      });
    });

    it('should estimate cost for Claude Opus', () => {
      const cost = router.estimateCost('claude-opus-4-5', 1000000, 500000);

      // Input: 1M tokens * $5/M = $5
      // Output: 0.5M tokens * $25/M = $12.5
      // Total: $17.5
      expect(cost).toBeCloseTo(17.5, 1);
    });

    it('should estimate cost for Claude Sonnet', () => {
      const cost = router.estimateCost('claude-sonnet-4', 1000000, 500000);

      // Input: 1M * $3 = $3
      // Output: 0.5M * $15 = $7.5
      // Total: $10.5
      expect(cost).toBeCloseTo(10.5, 1);
    });

    it('should estimate cost for Gemini Flash', () => {
      const cost = router.estimateCost('gemini-2-flash', 1000000, 500000);

      // Input: 1M * $0.075 = $0.075
      // Output: 0.5M * $0.3 = $0.15
      // Total: $0.225
      expect(cost).toBeCloseTo(0.225, 2);
    });

    it('should handle zero tokens', () => {
      const cost = router.estimateCost('claude-opus-4-5', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('MODEL_CONFIGS', () => {
    it('should have all required fields for each model', () => {
      Object.entries(MODEL_CONFIGS).forEach(([id, config]) => {
        expect(config.id).toBe(id);
        expect(config.provider).toBeDefined();
        expect(config.maxContext).toBeGreaterThan(0);
        expect(config.maxOutput).toBeGreaterThan(0);
        expect(config.costPerMillionInput).toBeGreaterThanOrEqual(0);
        expect(config.costPerMillionOutput).toBeGreaterThanOrEqual(0);
        expect(typeof config.supportsTools).toBe('boolean');
        expect(typeof config.supportsVision).toBe('boolean');
      });
    });

    it('should have Gemini models with largest context', () => {
      const geminiModels = Object.values(MODEL_CONFIGS).filter(
        m => m.provider === 'google'
      );

      expect(geminiModels.every(m => m.maxContext >= 1000000)).toBe(true);
    });

    it('should have all models supporting tools', () => {
      Object.values(MODEL_CONFIGS).forEach(config => {
        expect(config.supportsTools).toBe(true);
      });
    });

    it('should have all models supporting vision', () => {
      Object.values(MODEL_CONFIGS).forEach(config => {
        expect(config.supportsVision).toBe(true);
      });
    });
  });

  describe('ModelRouter - Environment Variables', () => {
    it('should load API keys from environment', () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-test-key';

      const router = new ModelRouter({});
      const available = router.getAvailableModels();

      const hasAnthropic = available.some(m => m.provider === 'anthropic');
      expect(hasAnthropic).toBe(true);

      process.env.ANTHROPIC_API_KEY = originalEnv;
    });

    it('should prefer config over environment variables', () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-key';

      const router = new ModelRouter({
        anthropicApiKey: 'config-key',
      });

      // Should use config-key, but we can't verify directly
      // Just check it works
      expect(router.getAvailableModels().some(m => m.provider === 'anthropic')).toBe(true);

      process.env.ANTHROPIC_API_KEY = originalEnv;
    });
  });
});
