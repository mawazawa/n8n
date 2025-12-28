# Model Selection Strategy

This document describes the multi-model architecture and intelligent routing system used by the Workflow Architect to optimize performance, cost, and quality.

## Overview

The Workflow Architect supports multiple AI models from different providers:

- **Claude 3.5 Sonnet** (Anthropic) - High-quality reasoning and long context
- **GPT-4o** (OpenAI) - Balanced performance and capabilities
- **Grok 4.2** (xAI) - Real-time data and advanced reasoning
- **Gemini 2.0 Flash** (Google) - Ultra-fast and cost-effective

Each model has different strengths, costs, and latency profiles. Our intelligent routing system automatically selects the optimal model for each task.

## Supported Models

### Claude 3.5 Sonnet

**Provider:** Anthropic
**Best For:** Complex reasoning, long context, detailed responses

**Specifications:**
- Context Window: 200K tokens
- Max Output: 16K tokens
- Cost: $3/1M input, $15/1M output tokens
- Avg Latency: ~1,200ms (p95: 2,400ms)

**Strengths:**
- Exceptional reasoning capabilities
- Excellent with structured prompts (XML tags)
- Strong performance on complex workflow design
- Handles long context effectively

**Use Cases:**
- Building complex workflows
- Debugging intricate issues
- Optimization recommendations
- Multi-step reasoning tasks

### GPT-4o

**Provider:** OpenAI
**Best For:** Balanced tasks, JSON output, function calling

**Specifications:**
- Context Window: 128K tokens
- Max Output: 16K tokens
- Cost: $2.5/1M input, $10/1M output tokens
- Avg Latency: ~980ms (p95: 1,950ms)

**Strengths:**
- Fast and reliable
- Excellent structured output (JSON mode)
- Strong function calling capabilities
- Good balance of quality and cost

**Use Cases:**
- User-facing responses
- Structured data generation
- Configuration tasks
- General-purpose workflows

### Grok 4.2

**Provider:** xAI
**Best For:** Real-time data, advanced reasoning, current events

**Specifications:**
- Context Window: 128K tokens
- Max Output: 16K tokens
- Cost: $2/1M input, $6/1M output tokens (placeholder)
- Avg Latency: ~1,450ms (p95: 2,850ms)

**Strengths:**
- Access to real-time information
- Strong analytical capabilities
- Handles nuanced questions well
- Direct, conversational responses

**Use Cases:**
- Real-time data analysis
- Current trends and patterns
- Complex reasoning problems
- Comparative analysis

### Gemini 2.0 Flash

**Provider:** Google
**Best For:** Speed, cost efficiency, simple tasks

**Specifications:**
- Context Window: 1M tokens
- Max Output: 8K tokens
- Cost: $0.075/1M input, $0.3/1M output tokens
- Avg Latency: ~650ms (p95: 1,200ms)

**Strengths:**
- Extremely fast responses
- Very cost-effective
- Massive context window
- Good quality for simple tasks

**Use Cases:**
- Node discovery
- Quick lookups
- Simple responses
- High-volume operations

## Task-Based Routing

The system automatically routes tasks to optimal models based on task type:

### Task Type Mapping

| Task Type | Default Model | Reasoning |
|-----------|--------------|-----------|
| **Discovery** | Gemini 2.0 Flash | Fast, cheap, good enough quality |
| **Building** | Claude Sonnet 4 | Complex reasoning needed |
| **Configuration** | Gemini 2.0 Flash | Structured, simple output |
| **Response** | GPT-4o | User-facing, balanced quality |
| **Complex** | Claude Opus 4 | Maximum reasoning power |
| **Simple** | Gemini 2.0 Flash | Speed and cost priority |
| **Reasoning** | Grok 4.2 | Advanced reasoning with real-time data |
| **Analysis** | GPT-4o | Balanced analytical capabilities |

### Selection Criteria

The router considers multiple factors:

1. **Task Complexity**
   - Low: Gemini 2.0 Flash
   - Medium: GPT-4o
   - High: Claude Sonnet 4

2. **Context Size**
   - < 20K tokens: Any model
   - 20-100K tokens: Claude or Gemini
   - > 100K tokens: Gemini 3.0 Pro (1M context)

3. **Real-Time Requirements**
   - Needs current data: Grok 4.2
   - Historical data: Any model

4. **Cost Constraints**
   - Strict budget: Gemini 2.0 Flash
   - Balanced: GPT-4o
   - Quality priority: Claude Sonnet 4

5. **Latency Requirements**
   - < 1s: Gemini 2.0 Flash
   - < 2s: GPT-4o
   - No strict limit: Claude Sonnet 4

## Load Balancing

### Strategies

The load balancer supports multiple strategies:

#### 1. Round Robin
Distributes requests evenly across available models.

```typescript
const balancer = getLoadBalancer({ strategy: 'round-robin' });
```

#### 2. Least Loaded
Routes to the model with the lowest current load.

```typescript
const balancer = getLoadBalancer({ strategy: 'least-loaded' });
```

#### 3. Fastest
Routes to the model with the best recent latency.

```typescript
const balancer = getLoadBalancer({ strategy: 'fastest' });
```

#### 4. Weighted
Routes based on configured weights (e.g., 40% Gemini, 30% GPT, 30% Claude).

```typescript
const balancer = getLoadBalancer({
  strategy: 'weighted',
  weights: {
    'gemini-2-flash': 2,
    'gpt-4o': 1.5,
    'claude-sonnet-4': 1.5,
  },
});
```

#### 5. Adaptive (Default)
Dynamically adjusts based on real-time metrics.

```typescript
const balancer = getLoadBalancer({ strategy: 'adaptive' });
```

**Adaptive scoring formula:**
```
score = (healthScore × 0.4) + (loadScore × 0.3) + (latencyScore × 0.3)
```

### Health Checks

The load balancer performs automatic health checks:

- **Frequency:** Every 60 seconds (configurable)
- **Metrics:** P95 latency, error rate, current load
- **Circuit Breaker:** Opens after 5 consecutive failures
- **Reset:** Automatic after 60 seconds

## Fallback System

### Retry Logic

Failed requests automatically retry with exponential backoff:

1. **First Attempt:** Primary model
2. **Retry 1:** Same model (1s delay)
3. **Retry 2:** Same model (2s delay)
4. **Retry 3:** Fallback to secondary model

### Fallback Chain

Default fallback order:
```
Claude Sonnet 4 → GPT-4o → Gemini 2.0 Flash
```

### Circuit Breaker

Prevents cascading failures:

- **Threshold:** 5 failures
- **Open Duration:** 60 seconds
- **Half-Open:** Test request before fully closing

## Cost Tracking

### Per-Request Tracking

Every request is tracked with:
- Model used
- Input/output tokens
- Cost calculation
- Timestamp
- User/session IDs

### Cost Analysis

Available metrics:
- Total cost (hourly, daily, monthly)
- Cost per model
- Cost per task type
- Cost per user
- Cost projections

### Cost Optimization

**Tips:**
1. Use Gemini 2.0 Flash for simple tasks (95% cost savings)
2. Batch similar requests
3. Set cost alerts and budgets
4. Monitor cost trends
5. Use task-based routing (automatic optimization)

**Example savings:**
- Discovery tasks: $0.000075 (Gemini) vs $0.003 (Claude) = **97.5% savings**
- 10,000 requests/day: **$2.25 vs $90** = **$87.75 savings/day**

## Latency Monitoring

### Metrics Tracked

For each model:
- **P50 (Median):** Typical response time
- **P95:** 95% of requests faster than this
- **P99:** 99% of requests faster than this
- **Mean:** Average latency
- **Min/Max:** Range of latencies

### Performance Targets

| Model | P95 Target | P99 Target |
|-------|-----------|-----------|
| Gemini 2.0 Flash | < 1,200ms | < 1,800ms |
| GPT-4o | < 2,000ms | < 2,800ms |
| Claude Sonnet 4 | < 2,500ms | < 3,800ms |
| Grok 4.2 | < 3,000ms | < 4,200ms |

### Latency Optimization

**Automatic optimizations:**
1. Route fast tasks to Gemini
2. Detect slow models and reduce load
3. Parallel requests when possible
4. Cache frequently used responses

## Model-Specific Prompts

Each model has optimized prompt templates:

### Claude (XML Tags)
```typescript
import { optimizeForClaude } from './prompts/model-specific/claude';

const prompt = optimizeForClaude({
  task: 'Build a workflow',
  context: 'E-commerce order processing',
  examples: ['Example workflow...'],
  outputFormat: 'json',
});
```

### GPT (Markdown)
```typescript
import { optimizeForGPT } from './prompts/model-specific/gpt';

const prompt = optimizeForGPT({
  task: 'Generate configuration',
  useChainOfThought: true,
  outputFormat: 'json',
});
```

### Grok (Conversational)
```typescript
import { optimizeForGrok } from './prompts/model-specific/grok';

const prompt = optimizeForGrok({
  task: 'Analyze current trends',
  useRealTimeData: true,
  requireReasoning: true,
});
```

## Usage Examples

### Basic Usage

```typescript
import { getModelRouter } from './models/router';

const router = getModelRouter();
const model = router.getModelForContext(messages);
const response = await model.invoke(messages);
```

### Task-Based Routing

```typescript
import { getTaskRouter } from './models/task-router';

const taskRouter = getTaskRouter();
const model = taskRouter.getModelForTask('building');
const response = await model.invoke(messages);
```

### With Fallback

```typescript
import { getFallbackSystem } from './models/fallback';

const fallback = getFallbackSystem();
const result = await fallback.invokeWithFallback(messages, {
  preferredModel: 'claude-sonnet-4',
  fallbackChain: ['gpt-4o', 'gemini-2-flash'],
});

console.log(`Used: ${result.modelUsed}, Attempts: ${result.attempts}`);
```

### With Load Balancing

```typescript
import { getLoadBalancer } from './models/load-balancer';

const balancer = getLoadBalancer({ strategy: 'adaptive' });
const model = balancer.getModel({ taskType: 'building' });
const response = await model.invoke(messages);
```

## Best Practices

### 1. Choose the Right Model

- **Discovery/Search:** Gemini 2.0 Flash
- **Workflow Building:** Claude Sonnet 4
- **User Responses:** GPT-4o
- **Real-Time Data:** Grok 4.2
- **Cost Sensitive:** Gemini 2.0 Flash
- **Quality Critical:** Claude Sonnet 4

### 2. Monitor Costs

```typescript
import { getCostTracker } from './models/cost-tracker';

const tracker = getCostTracker();
const monthlyCost = tracker.getMonthCost();
const projection = tracker.getMonthlyProjection();

console.log(`Current: $${monthlyCost}, Projected: $${projection}`);
```

### 3. Track Performance

```typescript
import { getLatencyMonitor } from './models/latency-monitor';

const monitor = getLatencyMonitor();
const metrics = monitor.getAllMetrics();

for (const [model, stats] of Object.entries(metrics)) {
  console.log(`${model} P95: ${stats.p95}ms`);
}
```

### 4. Handle Failures

Always use fallback for production:

```typescript
const result = await fallback.executeWithFallback(
  async (model) => await model.invoke(messages),
  {
    preferredModel: 'claude-sonnet-4',
    maxRetries: 3,
  }
);
```

### 5. Optimize Prompts

Use model-specific optimizations:

```typescript
import { optimizeForClaude } from './prompts/model-specific/claude';
import { optimizeForGPT } from './prompts/model-specific/gpt';

// Automatically select optimizer based on model
const optimizer = modelId.startsWith('claude')
  ? optimizeForClaude
  : optimizeForGPT;
```

## Configuration

### Environment Variables

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
XAI_API_KEY=...

# Model Router
PREFERRED_MODEL=claude-sonnet-4
LARGE_CONTEXT_THRESHOLD=100000

# Load Balancer
LOAD_BALANCER_STRATEGY=adaptive
MAX_LOAD_PER_MODEL=10

# Cost Tracking
ENABLE_COST_TRACKING=true
COST_ALERT_THRESHOLD=100

# Latency Monitoring
ENABLE_LATENCY_MONITORING=true
SLOW_REQUEST_THRESHOLD=5000
```

### Programmatic Configuration

```typescript
import { ModelRouter } from './models/router';
import { LoadBalancer } from './models/load-balancer';
import { CostTracker } from './models/cost-tracker';

const router = new ModelRouter({
  preferredModel: 'claude-sonnet-4',
  fallbackModels: ['gpt-4o', 'gemini-2-flash'],
});

const balancer = new LoadBalancer({
  strategy: 'adaptive',
  maxLoadPerModel: 10,
  latencyThresholdMs: 3000,
});

const costTracker = new CostTracker({
  enableAlerts: true,
  costAlertThreshold: 100,
  retentionDays: 90,
});
```

## Monitoring Dashboard

Access the model performance dashboard:

```typescript
import { ModelDashboard } from './ui/components/ModelDashboard';

// Renders interactive dashboard with:
// - Real-time performance metrics
// - Cost breakdown
// - Latency trends
// - Health status
// - Model comparison
```

## Benchmarks

Run benchmarks to compare models:

```bash
RUN_BENCHMARK_CALLS=true pnpm test tests/benchmarks/model-comparison.test.ts
```

**Sample Results:**

| Model | Avg Latency | P95 Latency | Cost/1K | Quality |
|-------|-------------|-------------|---------|---------|
| Claude Sonnet 4 | 1,200ms | 2,400ms | $0.003 | 9.2/10 |
| GPT-4o | 980ms | 1,950ms | $0.0025 | 9.0/10 |
| Grok 4.2 | 1,450ms | 2,850ms | $0.002 | 8.8/10 |
| Gemini 2.0 Flash | 650ms | 1,200ms | $0.000075 | 8.5/10 |

## Troubleshooting

### High Latency

1. Check model health: `monitor.getHealthStatus()`
2. Switch to faster model: Use Gemini 2.0 Flash
3. Enable adaptive load balancing
4. Review context size (reduce if possible)

### High Costs

1. Review cost breakdown: `tracker.getSummary()`
2. Switch simple tasks to Gemini
3. Enable task-based routing
4. Set cost alerts and budgets
5. Monitor cost projections

### Model Failures

1. Check circuit breaker status: `fallback.getCircuitStatus()`
2. Reset circuit if needed: `fallback.resetCircuit(modelId)`
3. Verify API keys are valid
4. Check fallback chain configuration
5. Review error logs

### Poor Quality

1. Use appropriate model for task complexity
2. Optimize prompts for specific model
3. Increase temperature for creative tasks
4. Use Claude for complex reasoning
5. Provide more context/examples

## Future Enhancements

Planned improvements:

- [ ] Support for more models (Gemini 3.0, Claude 4, GPT-5)
- [ ] Advanced caching layer
- [ ] Multi-region deployment
- [ ] A/B testing framework
- [ ] Automatic prompt optimization
- [ ] Cost prediction ML model
- [ ] Quality scoring system
- [ ] Custom model training

## References

- [Anthropic API Documentation](https://docs.anthropic.com)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google AI Documentation](https://ai.google.dev)
- [xAI Documentation](https://x.ai/api-docs)

## Support

For issues or questions:
- GitHub Issues: [workflow-architect/issues](https://github.com/n8n-io/n8n/issues)
- Documentation: [docs/](../docs/)
- Examples: [examples/](../examples/)
