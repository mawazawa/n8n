/**
 * Batch Generator
 * Handles batch workflow generation with parallel processing and rate limiting
 */

import type {
  GenerationRequest,
  GenerationResult,
  BatchGenerationRequest,
  BatchGenerationResult,
} from './types';
import { WorkflowGenerator } from './index';
import { wrapError } from '../errors';

export interface BatchGeneratorConfig {
  maxConcurrency?: number;
  rateLimit?: number; // requests per second
  stopOnError?: boolean;
  retryCount?: number;
}

export class BatchGenerator {
  private maxConcurrency: number;
  private rateLimit: number;
  private stopOnError: boolean;
  private retryCount: number;
  private generator: WorkflowGenerator;

  constructor(config: BatchGeneratorConfig = {}) {
    this.maxConcurrency = config.maxConcurrency || 5;
    this.rateLimit = config.rateLimit || 10;
    this.stopOnError = config.stopOnError || false;
    this.retryCount = config.retryCount || 2;
    this.generator = new WorkflowGenerator();
  }

  /**
   * Generate multiple workflows in batch
   */
  async generateBatch(request: BatchGenerationRequest): Promise<BatchGenerationResult> {
    const startTime = Date.now();
    const results: Array<GenerationResult | { error: string }> = [];

    try {
      // Apply options
      const parallel = request.options?.parallel ?? true;
      const maxConcurrency = request.options?.maxConcurrency || this.maxConcurrency;
      const stopOnError = request.options?.stopOnError || this.stopOnError;

      if (parallel) {
        // Parallel processing with concurrency limit
        const batches = this.createBatches(request.requests, maxConcurrency);

        for (const batch of batches) {
          const batchResults = await Promise.allSettled(
            batch.map((req) => this.generateWithRetry(req)),
          );

          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              results.push(result.value);
            } else {
              const error = { error: result.reason?.message || 'Generation failed' };
              results.push(error);

              if (stopOnError) {
                break;
              }
            }
          }

          if (stopOnError && results.some((r) => 'error' in r)) {
            break;
          }

          // Rate limiting between batches
          await this.delay(1000 / this.rateLimit);
        }
      } else {
        // Sequential processing
        for (const req of request.requests) {
          try {
            const result = await this.generateWithRetry(req);
            results.push(result);
          } catch (error) {
            const errorResult = {
              error: error instanceof Error ? error.message : 'Generation failed',
            };
            results.push(errorResult);

            if (stopOnError) {
              break;
            }
          }

          // Rate limiting
          await this.delay(1000 / this.rateLimit);
        }
      }

      // Generate summary
      const summary = this.generateSummary(results, Date.now() - startTime);

      return {
        results,
        summary,
      };
    } catch (error) {
      throw wrapError(error, 'Batch generation failed');
    }
  }

  /**
   * Parallel generation with rate limiting
   */
  private async generateWithRateLimit(
    requests: GenerationRequest[],
  ): Promise<Array<GenerationResult | { error: string }>> {
    const results: Array<GenerationResult | { error: string }> = [];
    const queue = [...requests];

    const workers: Promise<void>[] = [];

    for (let i = 0; i < this.maxConcurrency; i++) {
      workers.push(this.worker(queue, results));
    }

    await Promise.all(workers);

    return results;
  }

  /**
   * Worker for parallel processing
   */
  private async worker(
    queue: GenerationRequest[],
    results: Array<GenerationResult | { error: string }>,
  ): Promise<void> {
    while (queue.length > 0) {
      const request = queue.shift();
      if (!request) break;

      try {
        const result = await this.generateWithRetry(request);
        results.push(result);
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : 'Generation failed',
        });
      }

      // Rate limiting
      await this.delay(1000 / this.rateLimit);
    }
  }

  /**
   * Generate with retry logic
   */
  private async generateWithRetry(request: GenerationRequest): Promise<GenerationResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        return await this.generator.generate(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation errors
        if (lastError.message.includes('validation') || lastError.message.includes('invalid')) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < this.retryCount) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Generation failed after retries');
  }

  /**
   * Aggregate reporting
   */
  private generateSummary(
    results: Array<GenerationResult | { error: string }>,
    duration: number,
  ): BatchGenerationResult['summary'] {
    const total = results.length;
    const successful = results.filter((r) => !('error' in r)).length;
    const failed = total - successful;

    const successfulResults = results.filter(
      (r): r is GenerationResult => !('error' in r),
    );

    const averageConfidence =
      successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length
        : 0;

    return {
      total,
      successful,
      failed,
      averageConfidence,
      totalDuration: duration,
    };
  }

  /**
   * Error handling per request
   */
  private handleRequestError(request: GenerationRequest, error: Error): { error: string } {
    return {
      error: `Failed to generate workflow for "${request.description.slice(0, 50)}...": ${error.message}`,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for batch generation
 */
export async function generateBatch(
  request: BatchGenerationRequest,
): Promise<BatchGenerationResult> {
  const generator = new BatchGenerator();
  return generator.generateBatch(request);
}
