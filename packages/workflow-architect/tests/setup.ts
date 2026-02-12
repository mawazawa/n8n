/**
 * Test Setup
 * Global configuration for all tests
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.N8N_BASE_URL = 'http://localhost:5678';
  process.env.N8N_API_KEY = 'test-api-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

// Mock fetch globally if needed
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
}
