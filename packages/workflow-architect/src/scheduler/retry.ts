/**
 * RetryHandler - Implement retry strategies for failed jobs
 * Supports exponential, linear, and fixed backoff strategies
 */

import type { ScheduledJob, RetryConfig, JobRun } from './types.js';

export class RetryHandler {
  /**
   * Determine if a job should be retried based on its configuration and history
   */
  shouldRetry(job: ScheduledJob, currentAttempt: number, error: Error): boolean {
    // No retry config means no retries
    if (!job.retryConfig) {
      return false;
    }

    // Check if we've exceeded max attempts
    if (currentAttempt >= job.retryConfig.maxAttempts) {
      return false;
    }

    // Check for non-retryable errors
    if (this.isNonRetryableError(error)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate the next retry attempt time
   */
  getNextAttemptTime(job: ScheduledJob, currentAttempt: number): number {
    if (!job.retryConfig) {
      throw new Error('Job does not have retry configuration');
    }

    const delay = this.calculateDelay(job.retryConfig, currentAttempt);
    return Date.now() + delay;
  }

  /**
   * Calculate delay based on retry strategy
   */
  private calculateDelay(config: RetryConfig, attempt: number): number {
    let delay: number;

    switch (config.backoff) {
      case 'fixed':
        delay = config.initialDelay;
        break;

      case 'linear':
        delay = config.initialDelay * attempt;
        break;

      case 'exponential':
        delay = config.initialDelay * Math.pow(2, attempt - 1);
        break;

      default:
        throw new Error(`Unknown backoff strategy: ${config.backoff}`);
    }

    // Cap at max delay
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Get retry metadata for monitoring
   */
  getRetryInfo(job: ScheduledJob, currentAttempt: number): {
    canRetry: boolean;
    remainingAttempts: number;
    nextDelay: number | null;
    backoffStrategy: string;
  } {
    if (!job.retryConfig) {
      return {
        canRetry: false,
        remainingAttempts: 0,
        nextDelay: null,
        backoffStrategy: 'none',
      };
    }

    const canRetry = currentAttempt < job.retryConfig.maxAttempts;
    const remainingAttempts = Math.max(0, job.retryConfig.maxAttempts - currentAttempt);
    const nextDelay = canRetry ? this.calculateDelay(job.retryConfig, currentAttempt + 1) : null;

    return {
      canRetry,
      remainingAttempts,
      nextDelay,
      backoffStrategy: job.retryConfig.backoff,
    };
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      /invalid.*credentials/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /invalid.*configuration/i,
      /permission denied/i,
      /authentication.*failed/i,
    ];

    const errorMessage = error.message.toLowerCase();

    return nonRetryablePatterns.some((pattern) => pattern.test(errorMessage));
  }

  /**
   * Create a default retry configuration
   */
  static createDefaultConfig(): RetryConfig {
    return {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelay: 1000, // 1 second
      maxDelay: 300000, // 5 minutes
    };
  }

  /**
   * Create a retry configuration with custom parameters
   */
  static createConfig(
    maxAttempts: number,
    backoff: RetryConfig['backoff'],
    initialDelay: number,
    maxDelay: number,
  ): RetryConfig {
    if (maxAttempts < 1) {
      throw new Error('maxAttempts must be at least 1');
    }

    if (initialDelay <= 0) {
      throw new Error('initialDelay must be positive');
    }

    if (maxDelay < initialDelay) {
      throw new Error('maxDelay must be greater than or equal to initialDelay');
    }

    return {
      maxAttempts,
      backoff,
      initialDelay,
      maxDelay,
    };
  }

  /**
   * Validate retry configuration
   */
  static validateConfig(config: RetryConfig): { valid: boolean; error?: string } {
    if (config.maxAttempts < 1) {
      return { valid: false, error: 'maxAttempts must be at least 1' };
    }

    if (config.initialDelay <= 0) {
      return { valid: false, error: 'initialDelay must be positive' };
    }

    if (config.maxDelay < config.initialDelay) {
      return {
        valid: false,
        error: 'maxDelay must be greater than or equal to initialDelay',
      };
    }

    const validBackoffs = ['fixed', 'exponential', 'linear'];
    if (!validBackoffs.includes(config.backoff)) {
      return {
        valid: false,
        error: `backoff must be one of: ${validBackoffs.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get all retry delays for a configuration
   */
  static getRetrySchedule(config: RetryConfig): number[] {
    const schedule: number[] = [];

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      let delay: number;

      switch (config.backoff) {
        case 'fixed':
          delay = config.initialDelay;
          break;

        case 'linear':
          delay = config.initialDelay * attempt;
          break;

        case 'exponential':
          delay = config.initialDelay * Math.pow(2, attempt - 1);
          break;

        default:
          delay = config.initialDelay;
      }

      schedule.push(Math.min(delay, config.maxDelay));
    }

    return schedule;
  }

  /**
   * Estimate total retry time
   */
  static estimateTotalRetryTime(config: RetryConfig): number {
    const schedule = this.getRetrySchedule(config);
    return schedule.reduce((sum, delay) => sum + delay, 0);
  }

  /**
   * Calculate backoff delay with jitter (to prevent thundering herd)
   */
  calculateDelayWithJitter(config: RetryConfig, attempt: number, jitterPercent: number = 10): number {
    const baseDelay = this.calculateDelay(config, attempt);
    const jitter = baseDelay * (jitterPercent / 100);
    const randomJitter = Math.random() * jitter * 2 - jitter; // +/- jitter

    return Math.max(0, Math.min(baseDelay + randomJitter, config.maxDelay));
  }

  /**
   * Get retry strategy description
   */
  describeStrategy(config: RetryConfig): string {
    const schedule = RetryHandler.getRetrySchedule(config);
    const totalTime = RetryHandler.estimateTotalRetryTime(config);
    const totalTimeMin = Math.round(totalTime / 60000);

    let description = `${config.backoff} backoff, ${config.maxAttempts} attempts`;

    if (schedule.length > 0) {
      const delays = schedule.map((d) => `${Math.round(d / 1000)}s`).join(', ');
      description += `\nDelays: ${delays}`;
    }

    description += `\nTotal retry time: ~${totalTimeMin} minutes`;

    return description;
  }

  /**
   * Check if a job has exhausted all retry attempts
   */
  hasExhaustedRetries(job: ScheduledJob): boolean {
    if (!job.retryConfig || !job.lastRun) {
      return false;
    }

    return job.lastRun.attempt >= job.retryConfig.maxAttempts;
  }

  /**
   * Get current retry status
   */
  getRetryStatus(job: ScheduledJob): {
    currentAttempt: number;
    maxAttempts: number;
    hasRetries: boolean;
    exhausted: boolean;
  } {
    const currentAttempt = job.lastRun?.attempt || 0;
    const maxAttempts = job.retryConfig?.maxAttempts || 0;
    const hasRetries = maxAttempts > 0;
    const exhausted = hasRetries && currentAttempt >= maxAttempts;

    return {
      currentAttempt,
      maxAttempts,
      hasRetries,
      exhausted,
    };
  }

  /**
   * Create retry configuration from presets
   */
  static createPreset(preset: 'aggressive' | 'moderate' | 'conservative'): RetryConfig {
    switch (preset) {
      case 'aggressive':
        return {
          maxAttempts: 5,
          backoff: 'exponential',
          initialDelay: 500,
          maxDelay: 60000, // 1 minute
        };

      case 'moderate':
        return {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 300000, // 5 minutes
        };

      case 'conservative':
        return {
          maxAttempts: 2,
          backoff: 'linear',
          initialDelay: 5000,
          maxDelay: 600000, // 10 minutes
        };

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }
}
