# Analytics Dashboard Backend

Production-ready analytics backend for the Workflow Architect package. This module provides comprehensive event collection, metric aggregation, reporting, and data export capabilities.

## Features

- **Event Collection**: High-performance event collection with <10ms overhead
- **Metric Aggregation**: Efficient aggregation supporting 1M+ events
- **Built-in Metrics**: Pre-configured workflow and execution metrics
- **Report Generation**: Automated daily/weekly/monthly reports with trend analysis
- **Anomaly Detection**: Statistical anomaly detection for metrics
- **Data Export**: CSV and JSON export with streaming support for large datasets

## Installation

The analytics module is part of the `@n8n/workflow-architect` package:

```typescript
import {
  EventCollector,
  MetricAggregator,
  ReportGenerator,
  DataExporter,
  // ... other exports
} from '@n8n/workflow-architect/analytics';
```

## Quick Start

### 1. Event Collection

```typescript
import { EventCollector, track } from '@n8n/workflow-architect/analytics';

// Create a collector with custom configuration
const collector = new EventCollector({
  maxBufferSize: 1000,
  flushInterval: 5000,
  onFlush: async (events) => {
    // Send events to your analytics backend
    await analyticsBackend.send(events);
  },
});

// Track an event
const eventId = collector.track({
  type: 'workflow_created',
  workflowId: 'wf_123',
  userId: 'user_456',
  properties: {
    templateUsed: true,
    nodeCount: 5,
  },
});

// Or use the convenience function
track({
  type: 'workflow_executed',
  workflowId: 'wf_123',
  properties: {
    duration: 1234,
    success: true,
  },
});

// Manually flush events
await collector.flush();

// Stop collector (flushes remaining events)
await collector.stop();
```

### 2. Built-in Metrics

```typescript
import {
  workflowCreated,
  workflowExecuted,
  activeUser,
  apiCall,
  recordError,
  measureExecution,
  startTimer,
} from '@n8n/workflow-architect/analytics';

// Track workflow creation
workflowCreated('wf_123', 'user_456');

// Track workflow execution
workflowExecuted('wf_123', true, 1234); // success, duration in ms

// Track active user
activeUser('user_456');

// Track API calls
apiCall('/api/workflows', 'POST', 201);

// Record errors
recordError('ValidationError', 'INVALID_INPUT', {
  field: 'name',
});

// Measure execution time
const result = await measureExecution('database_query', async () => {
  return await db.query('SELECT * FROM workflows');
}, { operation: 'select' });

// Or use a timer
const timer = startTimer('complex_operation');
// ... do work ...
const duration = timer.stop({ status: 'success' });
```

### 3. Metric Aggregation

```typescript
import { MetricAggregator, getAggregator } from '@n8n/workflow-architect/analytics';

const aggregator = new MetricAggregator();

// Configure metric aggregation
aggregator.configureMetric('execution_duration', {
  type: 'p95',
  period: 'hour',
  buckets: 50,
});

// Aggregate events
const timeSeriesData = aggregator.aggregate(
  events,
  (event) => {
    if (event.type === 'execution_complete') {
      return {
        name: 'execution_duration',
        type: 'histogram',
        value: event.properties.duration as number,
        labels: { workflow_id: event.workflowId || '' },
        timestamp: event.timestamp,
      };
    }
    return null;
  },
  'hour'
);

// Get window statistics
const stats = aggregator.getWindowStats('execution_duration', 'hour');
console.log(stats);
// {
//   count: 1000,
//   sum: 45000,
//   avg: 45,
//   min: 10,
//   max: 500,
//   bucketCount: 12,
//   startTime: ...,
//   endTime: ...
// }

// Get percentiles
const p95 = aggregator.computePercentile('execution_duration', 95);
console.log(`95th percentile: ${p95}ms`);
```

### 4. Report Generation

```typescript
import { ReportGenerator } from '@n8n/workflow-architect/analytics';

const reportGen = new ReportGenerator();

// Generate a custom report
const report = await reportGen.generateReport({
  name: 'Weekly Performance Report',
  description: 'Weekly workflow performance metrics',
  metrics: [
    'workflows_executed',
    'execution_duration_seconds',
    'execution_success_rate',
  ],
  startDate: new Date('2025-12-21'),
  endDate: new Date('2025-12-28'),
  aggregation: {
    type: 'avg',
    period: 'day',
  },
});

console.log(report);
// {
//   id: '...',
//   name: 'Weekly Performance Report',
//   data: {
//     metrics: { ... },
//     trends: [ ... ],
//     anomalies: [ ... ],
//     summary: { ... }
//   },
//   ...
// }

// Generate daily rollup
const dailyReport = await reportGen.generateDailyRollup();

// Generate weekly rollup
const weeklyReport = await reportGen.generateWeeklyRollup();

// Generate monthly rollup
const monthlyReport = await reportGen.generateMonthlyRollup();

// Schedule recurring reports
const scheduleId = reportGen.scheduleReport(
  {
    name: 'Daily Report',
    description: 'Automated daily report',
    metrics: ['workflows_created', 'workflows_executed'],
  },
  'daily'
);

// Cancel scheduled report
reportGen.cancelSchedule(scheduleId);

// List all reports
const allReports = reportGen.listReports();

// Filter reports
const filteredReports = reportGen.listReports({
  name: 'Performance',
  metrics: ['execution_duration_seconds'],
});
```

### 5. Data Export

```typescript
import { DataExporter } from '@n8n/workflow-architect/analytics';

const exporter = new DataExporter('./exports');

// Export to CSV
const csvPath = await exporter.exportToCSV(metrics, 'metrics-2025-12');

// Export to JSON
const jsonPath = await exporter.exportToJSON(events, 'events-2025-12');

// Export with streaming (for large datasets)
const streamPath = await exporter.exportToCSV(
  largeDataset,
  'large-export',
  { streaming: true }
);

// Export with date range
const filteredPath = await exporter.exportWithDateRange(
  metrics,
  'december-metrics',
  new Date('2025-12-01'),
  new Date('2025-12-31'),
  'csv'
);

// Export with custom fields
const customPath = await exporter.exportWithFields(
  events,
  'custom-export',
  ['id', 'type', 'timestamp', 'workflowId'],
  'json'
);

// Export report
const reportPath = await exporter.exportReport(report, 'json');
```

## Configuration

### EventCollector Configuration

```typescript
const collector = new EventCollector({
  // Maximum buffer size before auto-flush
  maxBufferSize: 1000,

  // Auto-flush interval in milliseconds
  flushInterval: 5000,

  // Custom flush handler
  onFlush: async (events) => {
    await sendToBackend(events);
  },

  // Enable event validation
  enableValidation: true,

  // Add enrichment data to all events
  enrichment: {
    environment: 'production',
    version: '1.0.0',
  },
});
```

### MetricAggregator Configuration

```typescript
aggregator.configureMetric('metric_name', {
  // Aggregation type
  type: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99',

  // Time period
  period: 'hour' | 'day' | 'week' | 'month',

  // Number of histogram buckets (for histograms)
  buckets: 50,
});
```

## Built-in Metrics

The analytics module comes with pre-configured metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `workflows_created` | Counter | Number of workflows created |
| `workflows_executed` | Counter | Number of workflow executions |
| `execution_duration_seconds` | Histogram | Workflow execution duration (seconds) |
| `execution_success_rate` | Gauge | Workflow execution success rate |
| `active_users` | Gauge | Number of active users |
| `api_calls_total` | Counter | Total API calls |
| `errors_total` | Counter | Total errors (with labels) |

## Performance

- **Event Collection**: <10ms overhead per event
- **Aggregation**: Supports 1M+ events efficiently
- **Memory**: Optimized for large datasets with streaming
- **Export**: Streaming export handles datasets of any size

## Best Practices

1. **Use buffering**: Let events buffer and auto-flush for better performance
2. **Configure metrics**: Pre-configure metrics for better aggregation performance
3. **Use streaming**: Enable streaming for exports >100k records
4. **Monitor buffer**: Check buffer size to avoid memory issues
5. **Custom flush handlers**: Implement custom handlers for your analytics backend

## API Reference

See the TypeScript definitions in `types.ts` for complete API documentation.

## License

Part of the n8n workflow-architect package.
