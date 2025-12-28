/**
 * Mock System for Workflow Testing
 * Intercepts and mocks node executions for isolated testing
 */

import { MockDefinition, MockInterception, MockRequest, MockResponse } from './types.js';

/**
 * Main mock system for intercepting node executions
 */
export class MockSystem {
  private mocks: Map<string, MockDefinition[]> = new Map();
  private interceptions: MockInterception[] = [];
  private recording = false;
  private credentials: Map<string, Record<string, unknown>> = new Map();

  /**
   * Register a mock for a specific node type
   */
  mockNode(nodeType: string, response: unknown, options?: Partial<MockDefinition>): void {
    const mock: MockDefinition = {
      nodeType,
      nodeName: options?.nodeName,
      response,
      delay: options?.delay ?? 0,
      errorRate: options?.errorRate ?? 0,
    };

    const existing = this.mocks.get(nodeType) ?? [];
    existing.push(mock);
    this.mocks.set(nodeType, existing);
  }

  /**
   * Register a mock for a specific node by name
   */
  mockNodeByName(nodeName: string, nodeType: string, response: unknown, options?: Partial<MockDefinition>): void {
    this.mockNode(nodeType, response, { ...options, nodeName });
  }

  /**
   * Mock credential data for testing
   */
  mockCredential(type: string, data: Record<string, unknown>): void {
    this.credentials.set(type, data);
  }

  /**
   * Get mocked credential data
   */
  getCredential(type: string): Record<string, unknown> | undefined {
    return this.credentials.get(type);
  }

  /**
   * Intercept a node execution and return mocked response
   */
  async intercept(
    nodeType: string,
    nodeName: string,
    input: unknown
  ): Promise<unknown> {
    const mocks = this.mocks.get(nodeType);

    if (!mocks || mocks.length === 0) {
      throw new Error(`No mock registered for node type: ${nodeType}`);
    }

    // Find specific mock by node name, or use first available
    const mock = mocks.find(m => !m.nodeName || m.nodeName === nodeName) ?? mocks[0];

    // Simulate error if error rate is set
    if (mock.errorRate && Math.random() < mock.errorRate) {
      throw new Error(`Simulated error for node ${nodeName}`);
    }

    // Simulate delay if set
    if (mock.delay && mock.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, mock.delay));
    }

    const startTime = Date.now();
    const response = typeof mock.response === 'function'
      ? await (mock.response as (input: unknown) => Promise<unknown>)(input)
      : mock.response;
    const duration = Date.now() - startTime;

    // Record interception if recording is enabled
    if (this.recording) {
      this.interceptions.push({
        request: {
          nodeType,
          nodeName,
          input,
          timestamp: startTime,
        },
        response: {
          output: response,
          duration,
          timestamp: Date.now(),
        },
      });
    }

    return response;
  }

  /**
   * Check if a mock exists for a node type
   */
  hasMock(nodeType: string, nodeName?: string): boolean {
    const mocks = this.mocks.get(nodeType);
    if (!mocks || mocks.length === 0) return false;

    if (nodeName) {
      return mocks.some(m => !m.nodeName || m.nodeName === nodeName);
    }

    return true;
  }

  /**
   * Start recording interceptions
   */
  startRecording(): void {
    this.recording = true;
    this.interceptions = [];
  }

  /**
   * Stop recording and return interceptions
   */
  stopRecording(): MockInterception[] {
    this.recording = false;
    return [...this.interceptions];
  }

  /**
   * Get all recorded interceptions
   */
  getInterceptions(): MockInterception[] {
    return [...this.interceptions];
  }

  /**
   * Clear all interceptions
   */
  clearInterceptions(): void {
    this.interceptions = [];
  }

  /**
   * Clear all mocks
   */
  clearMocks(): void {
    this.mocks.clear();
  }

  /**
   * Clear mock for specific node type
   */
  clearMock(nodeType: string): void {
    this.mocks.delete(nodeType);
  }

  /**
   * Clear all credentials
   */
  clearCredentials(): void {
    this.credentials.clear();
  }

  /**
   * Reset entire mock system
   */
  reset(): void {
    this.clearMocks();
    this.clearCredentials();
    this.clearInterceptions();
    this.recording = false;
  }

  /**
   * Get statistics about mock usage
   */
  getStats(): {
    totalMocks: number;
    totalInterceptions: number;
    mocksByType: Record<string, number>;
    interceptionsByType: Record<string, number>;
  } {
    const mocksByType: Record<string, number> = {};
    const interceptionsByType: Record<string, number> = {};

    for (const [nodeType, mocks] of this.mocks.entries()) {
      mocksByType[nodeType] = mocks.length;
    }

    for (const interception of this.interceptions) {
      const type = interception.request.nodeType;
      interceptionsByType[type] = (interceptionsByType[type] ?? 0) + 1;
    }

    return {
      totalMocks: Array.from(this.mocks.values()).reduce((sum, mocks) => sum + mocks.length, 0),
      totalInterceptions: this.interceptions.length,
      mocksByType,
      interceptionsByType,
    };
  }
}

/**
 * Mock builder for fluent mock creation
 */
export class MockBuilder {
  private nodeType: string;
  private nodeName?: string;
  private response: unknown;
  private delay = 0;
  private errorRate = 0;

  constructor(nodeType: string) {
    this.nodeType = nodeType;
  }

  /**
   * Set specific node name
   */
  forNode(nodeName: string): this {
    this.nodeName = nodeName;
    return this;
  }

  /**
   * Set response data
   */
  returns(response: unknown): this {
    this.response = response;
    return this;
  }

  /**
   * Set response delay in milliseconds
   */
  withDelay(ms: number): this {
    this.delay = ms;
    return this;
  }

  /**
   * Set error rate (0-1)
   */
  withErrorRate(rate: number): this {
    this.errorRate = Math.max(0, Math.min(1, rate));
    return this;
  }

  /**
   * Build the mock definition
   */
  build(): MockDefinition {
    return {
      nodeType: this.nodeType,
      nodeName: this.nodeName,
      response: this.response,
      delay: this.delay,
      errorRate: this.errorRate,
    };
  }

  /**
   * Register this mock with a mock system
   */
  register(mockSystem: MockSystem): void {
    const mock = this.build();
    mockSystem.mockNode(mock.nodeType, mock.response, {
      nodeName: mock.nodeName,
      delay: mock.delay,
      errorRate: mock.errorRate,
    });
  }
}

/**
 * Create a new mock builder
 */
export function mock(nodeType: string): MockBuilder {
  return new MockBuilder(nodeType);
}

/**
 * Common mock presets for frequently used nodes
 */
export class MockPresets {
  /**
   * HTTP Request node mock
   */
  static httpRequest(url: string, response: unknown, statusCode = 200): MockDefinition {
    return {
      nodeType: 'n8n-nodes-base.httpRequest',
      response: {
        json: response,
        statusCode,
        headers: { 'content-type': 'application/json' },
      },
    };
  }

  /**
   * Webhook node mock
   */
  static webhook(data: unknown): MockDefinition {
    return {
      nodeType: 'n8n-nodes-base.webhook',
      response: {
        json: data,
      },
    };
  }

  /**
   * Code node mock
   */
  static code(result: unknown): MockDefinition {
    return {
      nodeType: 'n8n-nodes-base.code',
      response: result,
    };
  }

  /**
   * Database query mock
   */
  static database(rows: unknown[]): MockDefinition {
    return {
      nodeType: 'n8n-nodes-base.postgres',
      response: rows,
    };
  }

  /**
   * Email send mock
   */
  static email(success = true): MockDefinition {
    return {
      nodeType: 'n8n-nodes-base.emailSend',
      response: {
        success,
        messageId: crypto.randomUUID(),
      },
    };
  }

  /**
   * AI Agent mock
   */
  static aiAgent(response: string, metadata?: Record<string, unknown>): MockDefinition {
    return {
      nodeType: '@n8n/n8n-nodes-langchain.agent',
      response: {
        output: response,
        metadata: metadata ?? {},
      },
    };
  }

  /**
   * Generic success response
   */
  static success(data?: unknown): MockDefinition {
    return {
      nodeType: '*',
      response: {
        success: true,
        data: data ?? {},
      },
    };
  }

  /**
   * Generic error response
   */
  static error(message: string): MockDefinition {
    return {
      nodeType: '*',
      response: new Error(message),
    };
  }
}
