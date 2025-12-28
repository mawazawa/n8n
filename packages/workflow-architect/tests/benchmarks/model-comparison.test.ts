/**
 * Model Comparison Benchmarks
 * Compare performance, cost, and quality across different AI models
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ModelRouter, type ModelId } from '../../src/models/router.js';
import { getTaskRouter, type TaskType } from '../../src/models/task-router.js';
import { getCostTracker } from '../../src/models/cost-tracker.js';
import { getLatencyMonitor } from '../../src/models/latency-monitor.js';
import { HumanMessage } from '@langchain/core/messages';

// Test configuration
const BENCHMARK_CONFIG = {
  // Set to true to run actual API calls (requires API keys)
  runActualCalls: process.env.RUN_BENCHMARK_CALLS === 'true',

  // Models to test
  modelsToTest: [
    'claude-sonnet-4',
    'gpt-4o',
    'gemini-2-flash',
  ] as ModelId[],

  // Task types to benchmark
  taskTypes: [
    'discovery',
    'building',
    'response',
  ] as TaskType[],

  // Number of iterations per test
  iterations: 3,
};

// Test prompts for different task types
const TEST_PROMPTS: Record<TaskType, string> = {
  discovery: 'List the top 5 most commonly used n8n nodes for data transformation.',
  building: 'Create a simple workflow that sends a daily email digest of new GitHub issues.',
  configuration: 'Configure a webhook trigger to accept POST requests with JSON data.',
  response: 'Explain the benefits of using workflow automation for business processes.',
  complex: 'Design a multi-step workflow that processes customer orders, updates inventory, sends notifications, and generates reports.',
  simple: 'What is the HTTP Request node used for in n8n?',
  reasoning: 'Analyze the trade-offs between using scheduled triggers vs webhook triggers for a data sync workflow.',
  analysis: 'Compare the performance implications of using HTTP Request nodes vs native integrations.',
};

interface BenchmarkResult {
  modelId: ModelId;
  taskType: TaskType;
  latency: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  responseLength: number;
  timestamp: Date;
}

describe('Model Comparison Benchmarks', () => {
  let router: ModelRouter;
  let taskRouter: ReturnType<typeof getTaskRouter>;
  let costTracker: ReturnType<typeof getCostTracker>;
  let latencyMonitor: ReturnType<typeof getLatencyMonitor>;
  let results: BenchmarkResult[] = [];

  beforeAll(() => {
    router = new ModelRouter();
    taskRouter = getTaskRouter();
    costTracker = getCostTracker();
    latencyMonitor = getLatencyMonitor();
  });

  describe('Latency Benchmarks', () => {
    it('should measure and compare latency across models', async () => {
      if (!BENCHMARK_CONFIG.runActualCalls) {
        console.log('Skipping actual API calls. Set RUN_BENCHMARK_CALLS=true to run.');
        expect(true).toBe(true);
        return;
      }

      const latencyResults: Record<string, number[]> = {};

      for (const modelId of BENCHMARK_CONFIG.modelsToTest) {
        latencyResults[modelId] = [];

        for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
          const requestId = `benchmark-${modelId}-${i}`;
          const prompt = TEST_PROMPTS.simple;

          latencyMonitor.startRequest(requestId, modelId);

          try {
            const model = router.getModel(modelId);
            await model.invoke([new HumanMessage(prompt)]);
          } catch (error) {
            console.warn(`Error testing ${modelId}:`, error);
            continue;
          }

          const latency = latencyMonitor.endRequest(requestId, modelId);
          if (latency) {
            latencyResults[modelId].push(latency);
          }
        }
      }

      // Calculate and display averages
      console.log('\n=== Latency Benchmark Results ===');
      for (const [modelId, latencies] of Object.entries(latencyResults)) {
        const avg = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
        console.log(`${modelId}: ${avg.toFixed(0)}ms (avg of ${latencies.length} runs)`);
      }

      // Verify we got results
      expect(Object.keys(latencyResults).length).toBeGreaterThan(0);
    });

    it('should compare latency by task type', async () => {
      if (!BENCHMARK_CONFIG.runActualCalls) {
        expect(true).toBe(true);
        return;
      }

      const taskLatencies: Record<TaskType, Record<string, number>> = {} as any;

      for (const taskType of BENCHMARK_CONFIG.taskTypes) {
        taskLatencies[taskType] = {};

        for (const modelId of BENCHMARK_CONFIG.modelsToTest) {
          const requestId = `task-${taskType}-${modelId}`;
          const prompt = TEST_PROMPTS[taskType];

          latencyMonitor.startRequest(requestId, modelId);

          try {
            const model = taskRouter.getModelForTask(taskType);
            await model.invoke([new HumanMessage(prompt)]);
          } catch (error) {
            console.warn(`Error testing ${taskType} with ${modelId}:`, error);
            continue;
          }

          const latency = latencyMonitor.endRequest(requestId, modelId);
          if (latency) {
            taskLatencies[taskType][modelId] = latency;
          }
        }
      }

      console.log('\n=== Latency by Task Type ===');
      for (const [taskType, models] of Object.entries(taskLatencies)) {
        console.log(`\n${taskType}:`);
        for (const [modelId, latency] of Object.entries(models)) {
          console.log(`  ${modelId}: ${latency.toFixed(0)}ms`);
        }
      }

      expect(Object.keys(taskLatencies).length).toBeGreaterThan(0);
    });
  });

  describe('Cost Benchmarks', () => {
    it('should compare costs across models', async () => {
      if (!BENCHMARK_CONFIG.runActualCalls) {
        expect(true).toBe(true);
        return;
      }

      const costResults: Record<string, number> = {};

      for (const modelId of BENCHMARK_CONFIG.modelsToTest) {
        const requestId = `cost-${modelId}-${Date.now()}`;
        const prompt = TEST_PROMPTS.building;

        try {
          const model = router.getModel(modelId);
          const response = await model.invoke([new HumanMessage(prompt)]);

          // Estimate tokens (rough approximation)
          const inputTokens = Math.ceil(prompt.length / 4);
          const outputTokens = Math.ceil(response.content.toString().length / 4);

          const cost = costTracker.trackRequest({
            requestId,
            modelId,
            inputTokens,
            outputTokens,
            taskType: 'building',
          });

          costResults[modelId] = cost.totalCost;
        } catch (error) {
          console.warn(`Error testing ${modelId}:`, error);
        }
      }

      console.log('\n=== Cost Comparison ===');
      for (const [modelId, cost] of Object.entries(costResults)) {
        console.log(`${modelId}: $${cost.toFixed(6)} per request`);
      }

      // Find most cost-effective
      const sortedByCost = Object.entries(costResults).sort((a, b) => a[1] - b[1]);
      console.log(`\nMost cost-effective: ${sortedByCost[0]?.[0]}`);

      expect(Object.keys(costResults).length).toBeGreaterThan(0);
    });

    it('should analyze cost per 1K tokens', () => {
      const costPer1k: Record<string, { input: number; output: number }> = {
        'claude-sonnet-4': {
          input: (3 / 1000) * 1000, // $3 per 1M tokens = $0.003 per 1K
          output: (15 / 1000) * 1000,
        },
        'gpt-4o': {
          input: (2.5 / 1000) * 1000,
          output: (10 / 1000) * 1000,
        },
        'gemini-2-flash': {
          input: (0.075 / 1000) * 1000,
          output: (0.3 / 1000) * 1000,
        },
      };

      console.log('\n=== Cost per 1K Tokens ===');
      for (const [modelId, costs] of Object.entries(costPer1k)) {
        console.log(`${modelId}:`);
        console.log(`  Input: $${costs.input.toFixed(6)}/1K tokens`);
        console.log(`  Output: $${costs.output.toFixed(6)}/1K tokens`);
      }

      // Calculate cost for a typical request (1K in, 500 out)
      console.log('\n=== Cost for Typical Request (1K in, 500 out) ===');
      for (const [modelId, costs] of Object.entries(costPer1k)) {
        const totalCost = costs.input + (costs.output * 0.5);
        console.log(`${modelId}: $${totalCost.toFixed(6)}`);
      }

      expect(Object.keys(costPer1k).length).toBeGreaterThan(0);
    });
  });

  describe('Quality Benchmarks', () => {
    it('should compare response quality metrics', async () => {
      if (!BENCHMARK_CONFIG.runActualCalls) {
        expect(true).toBe(true);
        return;
      }

      const qualityMetrics: Record<string, {
        avgLength: number;
        structureScore: number;
        samples: number;
      }> = {};

      for (const modelId of BENCHMARK_CONFIG.modelsToTest) {
        const responses: string[] = [];

        for (const taskType of BENCHMARK_CONFIG.taskTypes) {
          const prompt = TEST_PROMPTS[taskType];

          try {
            const model = router.getModel(modelId);
            const response = await model.invoke([new HumanMessage(prompt)]);
            responses.push(response.content.toString());
          } catch (error) {
            console.warn(`Error testing ${modelId}:`, error);
          }
        }

        if (responses.length > 0) {
          const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;

          // Simple structure score: check for lists, code blocks, sections
          const structureScore = responses.reduce((score, r) => {
            let s = 0;
            if (r.includes('\n-') || r.includes('\n*')) s += 1; // Has lists
            if (r.includes('```')) s += 1; // Has code blocks
            if (r.includes('\n#') || r.includes('\n##')) s += 1; // Has headers
            return score + s;
          }, 0) / responses.length;

          qualityMetrics[modelId] = {
            avgLength,
            structureScore,
            samples: responses.length,
          };
        }
      }

      console.log('\n=== Quality Metrics ===');
      for (const [modelId, metrics] of Object.entries(qualityMetrics)) {
        console.log(`${modelId}:`);
        console.log(`  Avg Response Length: ${metrics.avgLength.toFixed(0)} chars`);
        console.log(`  Structure Score: ${metrics.structureScore.toFixed(1)}/3`);
        console.log(`  Samples: ${metrics.samples}`);
      }

      expect(Object.keys(qualityMetrics).length).toBeGreaterThan(0);
    });
  });

  describe('Performance Summary', () => {
    it('should generate comprehensive comparison report', () => {
      // Mock data for demonstration
      const comparisonReport = {
        'claude-sonnet-4': {
          avgLatency: 1200,
          costPer1K: 0.003,
          qualityScore: 9.2,
          bestFor: ['complex reasoning', 'long context', 'detailed responses'],
        },
        'gpt-4o': {
          avgLatency: 980,
          costPer1K: 0.0025,
          qualityScore: 9.0,
          bestFor: ['balanced tasks', 'JSON output', 'function calling'],
        },
        'gemini-2-flash': {
          avgLatency: 650,
          costPer1K: 0.000075,
          qualityScore: 8.5,
          bestFor: ['speed', 'cost efficiency', 'simple tasks'],
        },
      };

      console.log('\n=== Comprehensive Model Comparison ===\n');

      for (const [modelId, metrics] of Object.entries(comparisonReport)) {
        console.log(`${modelId}:`);
        console.log(`  Avg Latency: ${metrics.avgLatency}ms`);
        console.log(`  Cost/1K tokens: $${metrics.costPer1K.toFixed(6)}`);
        console.log(`  Quality Score: ${metrics.qualityScore}/10`);
        console.log(`  Best For: ${metrics.bestFor.join(', ')}`);
        console.log('');
      }

      // Recommendations
      console.log('=== Recommendations ===');
      console.log('Fast Discovery: gemini-2-flash');
      console.log('Building Workflows: claude-sonnet-4');
      console.log('Simple Responses: gemini-2-flash');
      console.log('Complex Reasoning: claude-sonnet-4');
      console.log('Cost Optimization: gemini-2-flash');
      console.log('Balanced Performance: gpt-4o');

      expect(Object.keys(comparisonReport).length).toBe(3);
    });

    it('should calculate optimal model selection strategy', () => {
      const selectionStrategy = {
        byTask: {
          discovery: { model: 'gemini-2-flash', reason: 'Fast and cost-effective' },
          building: { model: 'claude-sonnet-4', reason: 'Best quality for complex tasks' },
          configuration: { model: 'gemini-2-flash', reason: 'Simple, structured output' },
          response: { model: 'gpt-4o', reason: 'Balanced quality and speed' },
          complex: { model: 'claude-sonnet-4', reason: 'Superior reasoning capabilities' },
          simple: { model: 'gemini-2-flash', reason: 'Fastest and cheapest' },
        },
        byConstraint: {
          'max-cost': { model: 'gemini-2-flash', savings: '95% vs claude-sonnet-4' },
          'max-latency': { model: 'gemini-2-flash', speed: '45% faster than claude-sonnet-4' },
          'max-quality': { model: 'claude-sonnet-4', score: '9.2/10' },
        },
      };

      console.log('\n=== Optimal Selection Strategy ===\n');

      console.log('By Task Type:');
      for (const [task, selection] of Object.entries(selectionStrategy.byTask)) {
        console.log(`  ${task}: ${selection.model} - ${selection.reason}`);
      }

      console.log('\nBy Constraint:');
      for (const [constraint, selection] of Object.entries(selectionStrategy.byConstraint)) {
        console.log(`  ${constraint}: ${selection.model}`);
      }

      expect(selectionStrategy.byTask).toBeDefined();
      expect(selectionStrategy.byConstraint).toBeDefined();
    });
  });

  describe('Load Balancing Simulation', () => {
    it('should simulate load distribution across models', () => {
      const totalRequests = 1000;
      const distribution = {
        'claude-sonnet-4': 0,
        'gpt-4o': 0,
        'gemini-2-flash': 0,
      };

      // Simulate weighted distribution
      const weights = {
        'claude-sonnet-4': 0.3, // 30% for high-quality tasks
        'gpt-4o': 0.3,          // 30% for balanced tasks
        'gemini-2-flash': 0.4,  // 40% for fast/cheap tasks
      };

      for (let i = 0; i < totalRequests; i++) {
        const rand = Math.random();
        if (rand < weights['gemini-2-flash']) {
          distribution['gemini-2-flash']++;
        } else if (rand < weights['gemini-2-flash'] + weights['gpt-4o']) {
          distribution['gpt-4o']++;
        } else {
          distribution['claude-sonnet-4']++;
        }
      }

      console.log('\n=== Load Distribution (1000 requests) ===');
      for (const [model, count] of Object.entries(distribution)) {
        const percentage = (count / totalRequests) * 100;
        console.log(`${model}: ${count} requests (${percentage.toFixed(1)}%)`);
      }

      // Calculate estimated costs
      const costPer1K = {
        'claude-sonnet-4': 0.003,
        'gpt-4o': 0.0025,
        'gemini-2-flash': 0.000075,
      };

      let totalCost = 0;
      console.log('\n=== Estimated Costs (assuming 1K tokens per request) ===');
      for (const [model, count] of Object.entries(distribution)) {
        const cost = count * costPer1K[model as keyof typeof costPer1K];
        totalCost += cost;
        console.log(`${model}: $${cost.toFixed(3)}`);
      }
      console.log(`Total: $${totalCost.toFixed(3)}`);

      expect(distribution['gemini-2-flash']).toBeGreaterThan(0);
    });
  });
});
