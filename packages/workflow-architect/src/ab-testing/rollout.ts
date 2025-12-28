/**
 * RolloutManager - Gradual experiment rollout with automatic progression
 * Manages traffic ramping and rollback triggers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { RolloutConfig, RolloutStep, RolloutStatus } from './types.js';
import { VariantManager } from './variants.js';

export interface ConfigureRolloutInput {
  experimentId: string;
  strategy: 'linear' | 'exponential' | 'custom';
  startPercentage: number;
  targetPercentage: number;
  duration: number; // milliseconds
  customSteps?: Array<{ percentage: number; delay: number }>;
}

export class RolloutManager {
  private supabase: SupabaseClient;
  private variantManager: VariantManager;
  private activeRollouts: Map<string, NodeJS.Timeout>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.variantManager = new VariantManager(supabase);
    this.activeRollouts = new Map();
  }

  /**
   * Configure a gradual rollout schedule
   */
  async configureRollout(input: ConfigureRolloutInput): Promise<RolloutConfig> {
    // Validate percentages
    if (input.startPercentage < 0 || input.startPercentage > 100) {
      throw new Error('Start percentage must be between 0 and 100');
    }
    if (input.targetPercentage < 0 || input.targetPercentage > 100) {
      throw new Error('Target percentage must be between 0 and 100');
    }
    if (input.startPercentage >= input.targetPercentage) {
      throw new Error('Target percentage must be greater than start percentage');
    }

    // Generate rollout steps
    const steps = this.generateSteps(input);

    const now = new Date().toISOString();
    const rolloutConfig = {
      id: uuidv4(),
      experiment_id: input.experimentId,
      strategy: input.strategy,
      start_percentage: input.startPercentage,
      target_percentage: input.targetPercentage,
      duration: input.duration,
      steps,
      status: 'scheduled' as RolloutStatus,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.supabase
      .from('rollout_configs')
      .insert(rolloutConfig)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create rollout config: ${error.message}`);
    }

    return this.mapToRolloutConfig(data);
  }

  /**
   * Start a rollout
   */
  async startRollout(rolloutId: string): Promise<void> {
    const config = await this.getRolloutConfig(rolloutId);

    if (config.status !== 'scheduled') {
      throw new Error(`Cannot start rollout with status: ${config.status}`);
    }

    // Update status
    await this.updateRolloutStatus(rolloutId, 'active');

    // Schedule step executions
    this.scheduleSteps(config);
  }

  /**
   * Pause a rollout
   */
  async pauseRollout(rolloutId: string): Promise<void> {
    const config = await this.getRolloutConfig(rolloutId);

    if (config.status !== 'active') {
      throw new Error(`Cannot pause rollout with status: ${config.status}`);
    }

    // Cancel scheduled steps
    const timeout = this.activeRollouts.get(rolloutId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeRollouts.delete(rolloutId);
    }

    await this.updateRolloutStatus(rolloutId, 'paused');
  }

  /**
   * Resume a paused rollout
   */
  async resumeRollout(rolloutId: string): Promise<void> {
    const config = await this.getRolloutConfig(rolloutId);

    if (config.status !== 'paused') {
      throw new Error(`Cannot resume rollout with status: ${config.status}`);
    }

    await this.updateRolloutStatus(rolloutId, 'active');
    this.scheduleSteps(config);
  }

  /**
   * Rollback a rollout
   */
  async rollbackRollout(rolloutId: string): Promise<void> {
    const config = await this.getRolloutConfig(rolloutId);

    // Cancel scheduled steps
    const timeout = this.activeRollouts.get(rolloutId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeRollouts.delete(rolloutId);
    }

    // Reset traffic to start percentage
    await this.increaseTraffic(config.experimentId, config.startPercentage);

    await this.updateRolloutStatus(rolloutId, 'rolled-back');
  }

  /**
   * Manually increase traffic percentage
   */
  async increaseTraffic(experimentId: string, targetPercentage: number): Promise<void> {
    if (targetPercentage < 0 || targetPercentage > 100) {
      throw new Error('Target percentage must be between 0 and 100');
    }

    // Get experiment variants
    const variants = await this.variantManager.getExperimentVariants(experimentId);

    if (variants.length === 0) {
      throw new Error('No variants found for experiment');
    }

    // Find treatment variant (non-control)
    const treatmentVariants = variants.filter((v) => !v.isControl);
    const controlVariant = variants.find((v) => v.isControl);

    if (treatmentVariants.length === 0 || !controlVariant) {
      throw new Error('Experiment must have at least one treatment and one control variant');
    }

    // Calculate new allocations
    const treatmentAllocation = targetPercentage / 100;
    const controlAllocation = 1 - treatmentAllocation;

    // Distribute treatment allocation evenly among treatment variants
    const perTreatmentAllocation = treatmentAllocation / treatmentVariants.length;

    // Update allocations
    const updates = treatmentVariants.map((v) => ({
      variantId: v.id,
      allocation: perTreatmentAllocation,
    }));

    updates.push({
      variantId: controlVariant.id,
      allocation: controlAllocation,
    });

    await this.variantManager.updateTrafficAllocations(updates);
  }

  /**
   * Get rollout configuration
   */
  async getRolloutConfig(rolloutId: string): Promise<RolloutConfig> {
    const { data, error } = await this.supabase
      .from('rollout_configs')
      .select('*')
      .eq('id', rolloutId)
      .single();

    if (error || !data) {
      throw new Error(`Rollout config not found: ${rolloutId}`);
    }

    return this.mapToRolloutConfig(data);
  }

  /**
   * Get rollout by experiment
   */
  async getRolloutByExperiment(experimentId: string): Promise<RolloutConfig | null> {
    const { data, error } = await this.supabase
      .from('rollout_configs')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToRolloutConfig(data);
  }

  /**
   * Generate rollout steps based on strategy
   */
  private generateSteps(input: ConfigureRolloutInput): RolloutStep[] {
    const steps: RolloutStep[] = [];
    const startTime = Date.now();

    if (input.strategy === 'custom' && input.customSteps) {
      let cumulativeDelay = 0;
      input.customSteps.forEach((step) => {
        cumulativeDelay += step.delay;
        steps.push({
          percentage: step.percentage,
          scheduledAt: new Date(startTime + cumulativeDelay).toISOString(),
          status: 'pending',
        });
      });
    } else if (input.strategy === 'linear') {
      const stepCount = 10;
      const percentageIncrement =
        (input.targetPercentage - input.startPercentage) / stepCount;
      const timeIncrement = input.duration / stepCount;

      for (let i = 1; i <= stepCount; i++) {
        steps.push({
          percentage: input.startPercentage + percentageIncrement * i,
          scheduledAt: new Date(startTime + timeIncrement * i).toISOString(),
          status: 'pending',
        });
      }
    } else if (input.strategy === 'exponential') {
      const stepCount = 8;
      const percentageRange = input.targetPercentage - input.startPercentage;

      for (let i = 1; i <= stepCount; i++) {
        const progress = Math.pow(2, i) / Math.pow(2, stepCount);
        const percentage = input.startPercentage + percentageRange * progress;
        const scheduledAt = new Date(
          startTime + (input.duration * progress),
        ).toISOString();

        steps.push({
          percentage,
          scheduledAt,
          status: 'pending',
        });
      }
    }

    return steps;
  }

  /**
   * Schedule step executions
   */
  private scheduleSteps(config: RolloutConfig): void {
    const now = Date.now();

    // Find next pending step
    const nextStep = config.steps.find((s) => s.status === 'pending');
    if (!nextStep) {
      this.updateRolloutStatus(config.id, 'completed').catch(console.error);
      return;
    }

    const scheduledTime = new Date(nextStep.scheduledAt).getTime();
    const delay = Math.max(0, scheduledTime - now);

    const timeout = setTimeout(async () => {
      try {
        // Execute step
        await this.executeStep(config.id, nextStep);

        // Schedule next step
        const updatedConfig = await this.getRolloutConfig(config.id);
        if (updatedConfig.status === 'active') {
          this.scheduleSteps(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to execute rollout step:', error);
        await this.pauseRollout(config.id);
      }
    }, delay);

    this.activeRollouts.set(config.id, timeout);
  }

  /**
   * Execute a rollout step
   */
  private async executeStep(rolloutId: string, step: RolloutStep): Promise<void> {
    const config = await this.getRolloutConfig(rolloutId);

    // Increase traffic to target percentage
    await this.increaseTraffic(config.experimentId, step.percentage);

    // Mark step as completed
    const updatedSteps = config.steps.map((s) =>
      s.scheduledAt === step.scheduledAt
        ? { ...s, status: 'completed' as const, executedAt: new Date().toISOString() }
        : s,
    );

    await this.supabase
      .from('rollout_configs')
      .update({
        steps: updatedSteps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rolloutId);
  }

  /**
   * Update rollout status
   */
  private async updateRolloutStatus(rolloutId: string, status: RolloutStatus): Promise<void> {
    const { error } = await this.supabase
      .from('rollout_configs')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rolloutId);

    if (error) {
      throw new Error(`Failed to update rollout status: ${error.message}`);
    }
  }

  /**
   * Map database record to RolloutConfig
   */
  private mapToRolloutConfig(data: Record<string, unknown>): RolloutConfig {
    return {
      id: data.id as string,
      experimentId: data.experiment_id as string,
      strategy: data.strategy as RolloutConfig['strategy'],
      startPercentage: data.start_percentage as number,
      targetPercentage: data.target_percentage as number,
      duration: data.duration as number,
      steps: data.steps as RolloutStep[],
      status: data.status as RolloutStatus,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup(): void {
    this.activeRollouts.forEach((timeout) => clearTimeout(timeout));
    this.activeRollouts.clear();
  }
}
