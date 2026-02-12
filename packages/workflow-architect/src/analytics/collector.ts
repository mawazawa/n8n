/**
 * Analytics Event Collector
 * High-performance event collection with batching and auto-flush
 */

import { v4 as uuidv4 } from 'uuid';
import type { AnalyticsEvent } from './types.js';

export interface CollectorConfig {
  maxBufferSize?: number;
  flushInterval?: number;
  onFlush?: (events: AnalyticsEvent[]) => Promise<void>;
  enableValidation?: boolean;
  enrichment?: Record<string, unknown>;
}

const DEFAULT_CONFIG: Required<Omit<CollectorConfig, 'onFlush' | 'enrichment'>> = {
  maxBufferSize: 1000,
  flushInterval: 5000, // 5 seconds
  enableValidation: true,
};

/**
 * EventCollector - Collect and buffer analytics events with minimal overhead
 *
 * Features:
 * - Event buffering for batch processing
 * - Auto-flush based on size or time interval
 * - Event validation and enrichment
 * - <10ms tracking overhead
 */
export class EventCollector {
  private buffer: AnalyticsEvent[] = [];
  private config: Required<CollectorConfig>;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private eventCount = 0;

  constructor(config: CollectorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      onFlush: config.onFlush || this.defaultFlushHandler.bind(this),
      enrichment: config.enrichment || {},
    };

    this.startAutoFlush();
  }

  /**
   * Track an analytics event
   * Designed for <10ms overhead
   */
  track(event: Partial<AnalyticsEvent>): string {
    const startTime = performance.now();

    // Generate ID if not provided
    const id = event.id || uuidv4();

    // Validate event if enabled
    if (this.config.enableValidation) {
      this.validateEvent(event);
    }

    // Create complete event with enrichment
    const completeEvent: AnalyticsEvent = {
      id,
      type: event.type || 'unknown',
      workflowId: event.workflowId,
      userId: event.userId,
      timestamp: event.timestamp || Date.now(),
      properties: {
        ...this.config.enrichment,
        ...event.properties,
      },
    };

    // Add to buffer
    this.buffer.push(completeEvent);
    this.eventCount++;

    // Check if we need to flush
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush().catch(error => {
        console.error('Failed to flush events:', error);
      });
    }

    const duration = performance.now() - startTime;
    if (duration > 10) {
      console.warn(`Event tracking took ${duration.toFixed(2)}ms (target: <10ms)`);
    }

    return id;
  }

  /**
   * Manually flush the buffer
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      const eventsToFlush = [...this.buffer];
      this.buffer = [];

      await this.config.onFlush(eventsToFlush);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Get current buffer contents (for testing/debugging)
   */
  getBuffer(): readonly AnalyticsEvent[] {
    return [...this.buffer];
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      maxBufferSize: this.config.maxBufferSize,
      totalEvents: this.eventCount,
      isFlushing: this.flushing,
    };
  }

  /**
   * Clear the buffer without flushing
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Stop the collector and flush remaining events
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Auto-flush failed:', error);
      });
    }, this.config.flushInterval);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: Partial<AnalyticsEvent>): void {
    if (!event.type) {
      throw new Error('Event type is required');
    }

    if (event.timestamp && (event.timestamp < 0 || event.timestamp > Date.now() + 60000)) {
      throw new Error('Invalid event timestamp');
    }

    if (event.properties && typeof event.properties !== 'object') {
      throw new Error('Event properties must be an object');
    }
  }

  /**
   * Default flush handler (logs to console)
   */
  private async defaultFlushHandler(events: AnalyticsEvent[]): Promise<void> {
    console.log(`[Analytics] Flushed ${events.length} events`);
  }
}

/**
 * Singleton instance for convenience
 */
let globalCollector: EventCollector | null = null;

export function getGlobalCollector(config?: CollectorConfig): EventCollector {
  if (!globalCollector) {
    globalCollector = new EventCollector(config);
  }
  return globalCollector;
}

export function setGlobalCollector(collector: EventCollector): void {
  globalCollector = collector;
}

/**
 * Convenience function to track an event
 */
export function track(event: Partial<AnalyticsEvent>): string {
  return getGlobalCollector().track(event);
}
