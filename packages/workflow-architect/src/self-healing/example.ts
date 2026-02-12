/**
 * Self-Healing Workflows Example
 *
 * Demonstrates complete self-healing workflow implementation.
 */

import { createSelfHealingSystem } from './index.js';
import type { HealingPolicy, HealthMetric } from './types.js';
import { HealingPolicySchema } from './types.js';

/**
 * Example: Complete Self-Healing Workflow
 */
async function selfHealingExample() {
  console.log('=== Self-Healing Workflows Example ===\n');

  // 1. Create the self-healing system
  console.log('1. Creating self-healing system...');
  const system = createSelfHealingSystem({
    zScoreThreshold: 3,
    iqrMultiplier: 1.5,
  });
  console.log('✓ System created\n');

  // 2. Configure healing policy
  console.log('2. Configuring healing policy...');
  const policy: HealingPolicy = HealingPolicySchema.parse({
    name: 'Production Workflow Auto-Healing',
    workflowId: 'prod-workflow-001',
    enabled: true,
    triggers: [
      {
        anomalyType: 'ERROR_RATE',
        threshold: 0.1, // 10% error rate
        window: 60000, // 1 minute
      },
      {
        anomalyType: 'LATENCY',
        threshold: 5000, // 5 seconds
        window: 300000, // 5 minutes
      },
      {
        anomalyType: 'MEMORY',
        threshold: 0.85, // 85% memory usage
        window: 120000, // 2 minutes
      },
    ],
    actions: [
      {
        type: 'RETRY',
        target: 'api-call-node',
        params: {
          maxRetries: 3,
          initialDelay: 1000,
          backoffMultiplier: 2,
          jitter: true,
        },
        priority: 8,
      },
      {
        type: 'CIRCUIT_BREAK',
        target: 'external-service',
        params: {
          timeout: 60000,
          failureThreshold: 5,
        },
        priority: 7,
      },
      {
        type: 'SCALE',
        target: 'workflow',
        params: {
          direction: 'up',
          factor: 2,
        },
        priority: 6,
      },
    ],
    cooldown: 60000,
    maxActionsPerHour: 10,
    notifyOnAction: true,
  });
  console.log('✓ Policy configured\n');

  // 3. Simulate workflow metrics
  console.log('3. Simulating workflow metrics...');
  const metrics: HealthMetric = {
    workflowId: 'prod-workflow-001',
    timestamp: Date.now(),
    metrics: {
      latency: 6500, // High latency
      errorRate: 0.15, // High error rate
      memoryUsage: 0.82,
      cpuUsage: 0.65,
      throughput: 45,
      activeConnections: 12,
    },
    state: 'UNHEALTHY',
  };
  console.log('✓ Metrics simulated:', {
    latency: `${metrics.metrics.latency}ms`,
    errorRate: `${(metrics.metrics.errorRate! * 100).toFixed(1)}%`,
    state: metrics.state,
  });
  console.log();

  // 4. Detect anomalies
  console.log('4. Detecting anomalies...');
  const anomalies = await system.detector.detect(metrics);
  console.log(`✓ ${anomalies.length} anomalies detected:`);
  anomalies.forEach((anomaly, i) => {
    console.log(`  ${i + 1}. ${anomaly.type} - Severity: ${anomaly.severity.toFixed(2)}`);
  });
  console.log();

  // 5. Diagnose root causes
  console.log('5. Diagnosing root causes...');
  for (const anomaly of anomalies) {
    const rootCause = await system.diagnostics.diagnose(anomaly);
    console.log(`✓ Root cause for ${anomaly.type}:`);
    rootCause.probableCauses.forEach((cause, i) => {
      console.log(`  ${i + 1}. ${cause.description} (${(cause.confidence * 100).toFixed(0)}% confidence)`);
      console.log(`     Suggested: ${cause.suggestedActions.join(', ')}`);
    });
  }
  console.log();

  // 6. Execute healing actions
  console.log('6. Executing healing actions...');
  const healingResults = [];
  for (const action of policy.actions) {
    const context = {
      workflowId: policy.workflowId,
      anomaly: anomalies[0],
      policy,
      previousAttempts: [],
    };

    const result = await system.executor.execute(action, context);
    healingResults.push(result);
    console.log(`✓ ${action.type} action: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.duration}ms)`);
  }
  console.log();

  // 7. Configure circuit breaker
  console.log('7. Configuring circuit breaker...');
  try {
    await system.circuitBreaker.execute('external-service', async () => {
      // Simulate external API call
      if (Math.random() > 0.5) {
        throw new Error('External service unavailable');
      }
      return { status: 'ok' };
    });
    console.log('✓ Circuit breaker: CLOSED (healthy)');
  } catch (error) {
    console.log('✓ Circuit breaker: OPEN (protecting)');
  }
  const cbState = system.circuitBreaker.getState('external-service');
  console.log(`  State: ${cbState.state}, Failures: ${cbState.failureCount}`);
  console.log();

  // 8. Configure fallback
  console.log('8. Configuring fallback paths...');
  system.fallbackManager.registerFallback('primary-api', {
    nodeId: 'primary-api',
    fallbackPath: 'cached-data',
    cascadingFallbacks: ['backup-api', 'default-value'],
    defaultValue: { data: 'cached', status: 'degraded' },
    timeout: 30000,
  });
  console.log('✓ Fallback configured with cascading paths');
  console.log();

  // 9. Configure rollback
  console.log('9. Configuring auto-rollback...');
  system.rollbackTrigger.configureRollback('prod-workflow-001', {
    workflowId: 'prod-workflow-001',
    enabled: true,
    triggers: [
      {
        errorRate: 0.5,
      },
      {
        consecutiveFailures: 5,
      },
    ],
    targetVersion: 'v1.0.0',
    notifyOnRollback: true,
  });
  console.log('✓ Rollback policy configured');
  console.log();

  // 10. Learn from failures
  console.log('10. Learning from failures...');
  await system.learner.learn(
    {
      id: 'failure-001',
      workflowId: 'prod-workflow-001',
      errorType: 'ECONNREFUSED',
      errorMessage: 'Connection refused to external API',
      timestamp: Date.now(),
    },
    healingResults[0]
  );
  const patterns = system.learner.getAllPatterns();
  console.log(`✓ Learned ${patterns.length} failure patterns`);
  const stats = system.learner.getPatternStatistics();
  console.log(`  Average success rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%`);
  console.log();

  // 11. Configure notifications
  console.log('11. Configuring notifications...');
  system.notifier.configure('prod-workflow-001', {
    channels: ['EMAIL', 'SLACK'],
    severityFilter: ['ERROR', 'CRITICAL'],
    rateLimit: {
      maxPerMinute: 10,
      maxPerHour: 100,
    },
    emailConfig: {
      recipients: ['admin@example.com', 'ops@example.com'],
    },
    slackConfig: {
      webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
      channel: '#alerts',
    },
  });
  console.log('✓ Notifications configured for EMAIL and SLACK');
  console.log();

  // 12. Send test notification
  console.log('12. Sending test notification...');
  await system.notifier.notify({
    type: 'HEALING_COMPLETED',
    severity: 'WARNING',
    workflowId: 'prod-workflow-001',
    timestamp: Date.now(),
    anomaly: anomalies[0],
    healingResult: healingResults[0],
  });
  console.log('✓ Notification sent');
  console.log();

  // 13. Get health status
  console.log('13. Getting health status...');
  const currentHealth = await system.monitor.getCurrentHealth('prod-workflow-001');
  console.log('✓ Current health:', {
    state: currentHealth.state,
    latency: `${currentHealth.metrics.latency}ms`,
    errorRate: `${((currentHealth.metrics.errorRate || 0) * 100).toFixed(1)}%`,
  });
  console.log();

  // 14. Summary
  console.log('=== Summary ===');
  console.log(`Anomalies detected: ${anomalies.length}`);
  console.log(`Healing actions executed: ${healingResults.length}`);
  console.log(`Successful actions: ${healingResults.filter((r) => r.success).length}`);
  console.log(`Failure patterns learned: ${patterns.length}`);
  console.log(`Circuit breaker state: ${cbState.state}`);
  console.log(`Notification channels: 2 (EMAIL, SLACK)`);
  console.log('\n✓ Self-healing workflow example completed successfully!');
}

/**
 * Example: Real-time Health Monitoring
 */
async function monitoringExample() {
  console.log('\n=== Real-time Health Monitoring Example ===\n');

  const system = createSelfHealingSystem();

  console.log('Starting real-time monitoring (10 seconds)...\n');

  let eventCount = 0;
  const startTime = Date.now();

  for await (const event of system.monitor.monitor('workflow-001', {
    interval: 2000,
    duration: 10000,
  })) {
    eventCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[${elapsed}s] Event: ${event.type}`);

    if (event.type === 'ANOMALY_DETECTED') {
      const { anomalies } = event.data as { anomalies: unknown[] };
      console.log(`  → ${anomalies.length} anomalies detected`);
    } else if (event.type === 'STATE_CHANGED') {
      const { state } = event.data as { state: string };
      console.log(`  → Health state: ${state}`);
    }
  }

  console.log(`\n✓ Monitoring completed (${eventCount} events)\n`);
}

/**
 * Run examples
 */
async function main() {
  try {
    await selfHealingExample();
    await monitoringExample();
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { selfHealingExample, monitoringExample };
