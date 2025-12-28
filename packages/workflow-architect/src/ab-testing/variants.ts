/**
 * VariantManager - Variant management for A/B testing
 * Handles CRUD operations for experiment variants
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Variant, VariantConfig } from './types.js';
import { VariantConfigSchema } from './types.js';

export interface CreateVariantInput {
  experimentId: string;
  name: string;
  description?: string;
  config: VariantConfig;
  trafficAllocation: number;
  isControl?: boolean;
}

export interface UpdateVariantInput {
  name?: string;
  description?: string;
  config?: VariantConfig;
  trafficAllocation?: number;
  enabled?: boolean;
}

export class VariantManager {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new variant for an experiment
   */
  async create(input: CreateVariantInput): Promise<Variant> {
    // Validate config
    VariantConfigSchema.parse(input.config);

    // Validate traffic allocation
    if (input.trafficAllocation < 0 || input.trafficAllocation > 1) {
      throw new Error('Traffic allocation must be between 0 and 1');
    }

    // Check total allocation doesn't exceed 100%
    await this.validateTotalAllocation(input.experimentId, input.trafficAllocation);

    const now = new Date().toISOString();
    const variant = {
      id: uuidv4(),
      experiment_id: input.experimentId,
      name: input.name,
      description: input.description || null,
      config: input.config,
      traffic_allocation: input.trafficAllocation,
      is_control: input.isControl || false,
      enabled: true,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.supabase
      .from('variants')
      .insert(variant)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create variant: ${error.message}`);
    }

    return this.mapToVariant(data);
  }

  /**
   * Update a variant
   */
  async update(variantId: string, input: UpdateVariantInput): Promise<Variant> {
    // Validate config if provided
    if (input.config) {
      VariantConfigSchema.parse(input.config);
    }

    // Validate traffic allocation if provided
    if (input.trafficAllocation !== undefined) {
      if (input.trafficAllocation < 0 || input.trafficAllocation > 1) {
        throw new Error('Traffic allocation must be between 0 and 1');
      }

      const variant = await this.getVariant(variantId);
      await this.validateTotalAllocation(
        variant.experimentId,
        input.trafficAllocation - variant.trafficAllocation,
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.config) updates.config = input.config;
    if (input.trafficAllocation !== undefined)
      updates.traffic_allocation = input.trafficAllocation;
    if (input.enabled !== undefined) updates.enabled = input.enabled;

    const { data, error } = await this.supabase
      .from('variants')
      .update(updates)
      .eq('id', variantId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update variant: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    return this.mapToVariant(data);
  }

  /**
   * Delete a variant
   */
  async delete(variantId: string): Promise<void> {
    // Check if this is the last variant
    const variant = await this.getVariant(variantId);
    const variants = await this.getExperimentVariants(variant.experimentId);

    if (variants.length <= 2) {
      throw new Error('Cannot delete variant - experiment must have at least 2 variants');
    }

    // Check if this is the control variant
    if (variant.isControl) {
      throw new Error('Cannot delete control variant - assign another variant as control first');
    }

    // Delete assignments for this variant
    await this.supabase.from('assignments').delete().eq('variant_id', variantId);

    // Delete metric events for this variant
    await this.supabase.from('metric_events').delete().eq('variant_id', variantId);

    // Delete variant
    const { error } = await this.supabase.from('variants').delete().eq('id', variantId);

    if (error) {
      throw new Error(`Failed to delete variant: ${error.message}`);
    }
  }

  /**
   * Get a single variant
   */
  async getVariant(variantId: string): Promise<Variant> {
    const { data, error } = await this.supabase
      .from('variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (error || !data) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    return this.mapToVariant(data);
  }

  /**
   * Get all variants for an experiment
   */
  async getExperimentVariants(experimentId: string): Promise<Variant[]> {
    const { data, error } = await this.supabase
      .from('variants')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch variants: ${error.message}`);
    }

    return (data || []).map((v) => this.mapToVariant(v));
  }

  /**
   * Get variant for a user (wrapper for assignment manager)
   */
  async getVariantForUser(userId: string, experimentId: string): Promise<Variant> {
    // This method is a placeholder - actual implementation should use AssignmentManager
    throw new Error('Use AssignmentManager.getVariant() instead');
  }

  /**
   * Enable a variant
   */
  async enable(variantId: string): Promise<Variant> {
    return this.update(variantId, { enabled: true });
  }

  /**
   * Disable a variant
   */
  async disable(variantId: string): Promise<Variant> {
    return this.update(variantId, { enabled: false });
  }

  /**
   * Set variant as control
   */
  async setAsControl(variantId: string): Promise<Variant> {
    const variant = await this.getVariant(variantId);

    // Remove control flag from other variants
    await this.supabase
      .from('variants')
      .update({ is_control: false })
      .eq('experiment_id', variant.experimentId);

    // Set this variant as control
    return this.update(variantId, { enabled: true }); // Ensure it's enabled
  }

  /**
   * Update traffic allocations for all variants
   */
  async updateTrafficAllocations(
    allocations: Array<{ variantId: string; allocation: number }>,
  ): Promise<Variant[]> {
    // Validate total allocation sums to 1.0
    const total = allocations.reduce((sum, a) => sum + a.allocation, 0);
    if (Math.abs(total - 1.0) > 0.0001) {
      throw new Error('Traffic allocations must sum to 100%');
    }

    // Validate all variants belong to same experiment
    const variants = await Promise.all(allocations.map((a) => this.getVariant(a.variantId)));
    const experimentIds = new Set(variants.map((v) => v.experimentId));
    if (experimentIds.size !== 1) {
      throw new Error('All variants must belong to the same experiment');
    }

    // Update each variant
    const updatedVariants = await Promise.all(
      allocations.map((a) => this.update(a.variantId, { trafficAllocation: a.allocation })),
    );

    return updatedVariants;
  }

  /**
   * Clone a variant
   */
  async clone(variantId: string, newName: string): Promise<Variant> {
    const source = await this.getVariant(variantId);

    return this.create({
      experimentId: source.experimentId,
      name: newName,
      description: source.description,
      config: { ...source.config },
      trafficAllocation: 0, // Start with 0 traffic
      isControl: false,
    });
  }

  /**
   * Validate total traffic allocation doesn't exceed 100%
   */
  private async validateTotalAllocation(
    experimentId: string,
    additionalAllocation: number,
  ): Promise<void> {
    const variants = await this.getExperimentVariants(experimentId);
    const currentTotal = variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    const newTotal = currentTotal + additionalAllocation;

    if (newTotal > 1.0001) {
      // Allow small floating point errors
      throw new Error(
        `Total traffic allocation would exceed 100% (current: ${(currentTotal * 100).toFixed(1)}%, additional: ${(additionalAllocation * 100).toFixed(1)}%)`,
      );
    }
  }

  /**
   * Map database record to Variant
   */
  private mapToVariant(data: Record<string, unknown>): Variant {
    return {
      id: data.id as string,
      experimentId: data.experiment_id as string,
      name: data.name as string,
      description: data.description as string | undefined,
      config: data.config as VariantConfig,
      trafficAllocation: data.traffic_allocation as number,
      isControl: data.is_control as boolean,
      enabled: data.enabled as boolean,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}
