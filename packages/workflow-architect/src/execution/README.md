# Execution Monitoring System

Production-ready execution monitoring, analysis, and suggestion system for n8n workflows.

## Features

### 1. Real-time Monitoring (`monitor.ts`)
- WebSocket-based real-time execution tracking
- Automatic reconnection with exponential backoff
- In-memory storage with configurable retention
- Event-driven architecture using EventEmitter

### 2. Execution Analysis (`analyzer.ts`)
- Bottleneck detection (>5s or >50% of total time)
- Performance metrics aggregation
- Execution comparison and trend analysis
- Pattern identification

### 3. AI-Powered Suggestions (`suggestions.ts`)
- Performance optimization recommendations
- Reliability improvements
- Cost reduction strategies
- Security best practices

## Quick Start

```typescript
import {
  createExecutionMonitor,
  ExecutionAnalyzer,
  generateSuggestions
} from './execution/index.js';

// Start monitoring
const monitor = createExecutionMonitor({
  retentionHours: 24,
  maxStoredExecutions: 1000,
});

await monitor.startMonitoring();

// Listen to events
monitor.on('execution_finished', (execution) => {
  console.log('Execution completed:', execution.id);

  // Generate suggestions
  const suggestions = generateSuggestions(execution);
  for (const suggestion of suggestions) {
    console.log(`[${suggestion.severity}] ${suggestion.message}`);
    console.log(`Action: ${suggestion.action}`);
  }
});

// Analyze executions
const analyzer = new ExecutionAnalyzer();
const recent = monitor.getRecentExecutions(100);
const metrics = analyzer.calculateMetrics(recent);

console.log('Success rate:', metrics.successRate);
console.log('Average duration:', metrics.averageDuration);
```

## Monitor Events

- `connected` - WebSocket connection established
- `disconnected` - Connection lost
- `reconnecting` - Attempting to reconnect
- `execution_started` - New execution started
- `execution_finished` - Execution completed
- `node_started` - Node execution started
- `node_finished` - Node execution completed
- `error` - Error occurred
- `cleanup_completed` - Old executions cleaned up

## Configuration

```typescript
interface ExecutionMonitorConfig {
  n8nBaseUrl: string;           // n8n instance URL
  n8nApiKey: string;            // API key
  retentionHours?: number;      // How long to keep executions (default: 24)
  maxStoredExecutions?: number; // Max executions in memory (default: 1000)
  reconnectInterval?: number;   // Reconnect delay in ms (default: 5000)
  reconnectMaxAttempts?: number; // Max reconnection attempts (default: 10)
}
```

## Type Safety

All code uses strict TypeScript with:
- No `any` types
- Explicit type definitions
- Proper null/undefined handling
- Type guards where needed

## Production Ready

- Graceful connection handling with reconnection logic
- Memory-bounded storage with automatic cleanup
- Comprehensive error handling
- Event-driven architecture for scalability
