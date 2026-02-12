/**
 * AssignmentManager - Traffic assignment with consistent hashing
 * Ensures stable variant assignment for users with <10ms overhead
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { Assignment, Variant, Experiment } from './types.js';

export class AssignmentManager {
  private supabase: SupabaseClient;
  private assignmentCache: Map<string, string>; // userId:experimentId -> variantId
  private exclusionLists: Map<string, Set<string>>; // experimentId -> Set<userId>

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.assignmentCache = new Map();
    this.exclusionLists = new Map();
  }

  /**
   * Assign a user to a variant using consistent hashing
   * Performance target: <10ms
   */
  async assign(userId: string, experimentId: string): Promise<Variant> {
    const startTime = performance.now();

    // Check cache first for sticky assignments
    const cacheKey = `${userId}:${experimentId}`;
    const cachedVariantId = this.assignmentCache.get(cacheKey);

    if (cachedVariantId) {
      const variant = await this.getVariantById(cachedVariantId);
      return variant;
    }

    // Check if user is excluded
    if (this.isUserExcluded(userId, experimentId)) {
      throw new Error(`User ${userId} is excluded from experiment ${experimentId}`);
    }

    // Check for existing assignment in database
    const existingAssignment = await this.getExistingAssignment(userId, experimentId);
    if (existingAssignment) {
      this.assignmentCache.set(cacheKey, existingAssignment.variantId);
      const variant = await this.getVariantById(existingAssignment.variantId);
      return variant;
    }

    // Get experiment variants
    const variants = await this.getExperimentVariants(experimentId);

    // Filter enabled variants
    const enabledVariants = variants.filter((v) => v.enabled);
    if (enabledVariants.length === 0) {
      throw new Error(`No enabled variants for experiment ${experimentId}`);
    }

    // Use consistent hashing to assign variant
    const variantId = this.consistentHash(userId, experimentId, enabledVariants);

    // Create assignment record
    const assignment: Assignment = {
      id: this.generateAssignmentId(userId, experimentId),
      userId,
      experimentId,
      variantId,
      assignedAt: new Date().toISOString(),
      sticky: true,
      metadata: {
        assignmentTime: performance.now() - startTime,
      },
    };

    // Store in database (fire and forget for performance)
    this.storeAssignment(assignment).catch((error) => {
      console.error('Failed to store assignment:', error);
    });

    // Update cache
    this.assignmentCache.set(cacheKey, variantId);

    const variant = enabledVariants.find((v) => v.id === variantId);
    if (!variant) {
      throw new Error('Failed to find assigned variant');
    }

    return variant;
  }

  /**
   * Get variant for a user (existing assignment or new)
   */
  async getVariant(userId: string, experimentId: string): Promise<Variant> {
    return this.assign(userId, experimentId);
  }

  /**
   * Force assign a specific variant to a user
   */
  async forceAssign(userId: string, experimentId: string, variantId: string): Promise<void> {
    // Validate variant exists
    await this.getVariantById(variantId);

    const assignment: Assignment = {
      id: this.generateAssignmentId(userId, experimentId),
      userId,
      experimentId,
      variantId,
      assignedAt: new Date().toISOString(),
      sticky: true,
      metadata: {
        forced: true,
      },
    };

    await this.storeAssignment(assignment);

    // Update cache
    const cacheKey = `${userId}:${experimentId}`;
    this.assignmentCache.set(cacheKey, variantId);
  }

  /**
   * Add users to exclusion list
   */
  addToExclusionList(experimentId: string, userIds: string[]): void {
    if (!this.exclusionLists.has(experimentId)) {
      this.exclusionLists.set(experimentId, new Set());
    }
    const exclusionSet = this.exclusionLists.get(experimentId)!;
    userIds.forEach((userId) => exclusionSet.add(userId));
  }

  /**
   * Remove users from exclusion list
   */
  removeFromExclusionList(experimentId: string, userIds: string[]): void {
    const exclusionSet = this.exclusionLists.get(experimentId);
    if (exclusionSet) {
      userIds.forEach((userId) => exclusionSet.delete(userId));
    }
  }

  /**
   * Check if user is excluded from experiment
   */
  private isUserExcluded(userId: string, experimentId: string): boolean {
    const exclusionSet = this.exclusionLists.get(experimentId);
    return exclusionSet ? exclusionSet.has(userId) : false;
  }

  /**
   * Consistent hashing algorithm for stable variant assignment
   * Uses SHA-256 hash to ensure uniform distribution
   */
  private consistentHash(userId: string, experimentId: string, variants: Variant[]): string {
    // Create deterministic hash from userId and experimentId
    const hashInput = `${userId}:${experimentId}`;
    const hash = createHash('sha256').update(hashInput).digest();

    // Convert first 8 bytes to a number between 0 and 1
    const hashValue = hash.readUInt32BE(0) / 0xffffffff;

    // Assign based on traffic allocation
    let cumulativeAllocation = 0;
    for (const variant of variants) {
      cumulativeAllocation += variant.trafficAllocation;
      if (hashValue < cumulativeAllocation) {
        return variant.id;
      }
    }

    // Fallback to last variant (should not happen if allocations sum to 1)
    return variants[variants.length - 1].id;
  }

  /**
   * Get existing assignment from database
   */
  private async getExistingAssignment(
    userId: string,
    experimentId: string,
  ): Promise<Assignment | null> {
    const { data, error } = await this.supabase
      .from('assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('experiment_id', experimentId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToAssignment(data);
  }

  /**
   * Get experiment variants
   */
  private async getExperimentVariants(experimentId: string): Promise<Variant[]> {
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
   * Get variant by ID
   */
  private async getVariantById(variantId: string): Promise<Variant> {
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
   * Store assignment in database
   */
  private async storeAssignment(assignment: Assignment): Promise<void> {
    const { error } = await this.supabase.from('assignments').upsert(
      {
        id: assignment.id,
        user_id: assignment.userId,
        experiment_id: assignment.experimentId,
        variant_id: assignment.variantId,
        assigned_at: assignment.assignedAt,
        sticky: assignment.sticky,
        metadata: assignment.metadata,
      },
      {
        onConflict: 'user_id,experiment_id',
      },
    );

    if (error) {
      throw new Error(`Failed to store assignment: ${error.message}`);
    }
  }

  /**
   * Generate deterministic assignment ID
   */
  private generateAssignmentId(userId: string, experimentId: string): string {
    const hash = createHash('sha256').update(`${userId}:${experimentId}`).digest('hex');
    return hash.substring(0, 32);
  }

  /**
   * Get all assignments for an experiment
   */
  async getExperimentAssignments(experimentId: string): Promise<Assignment[]> {
    const { data, error } = await this.supabase
      .from('assignments')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch assignments: ${error.message}`);
    }

    return (data || []).map((a) => this.mapToAssignment(a));
  }

  /**
   * Get variant distribution for an experiment
   */
  async getVariantDistribution(experimentId: string): Promise<
    Array<{
      variantId: string;
      variantName: string;
      count: number;
      percentage: number;
    }>
  > {
    const assignments = await this.getExperimentAssignments(experimentId);
    const variants = await this.getExperimentVariants(experimentId);

    const distribution = new Map<string, number>();
    assignments.forEach((a) => {
      distribution.set(a.variantId, (distribution.get(a.variantId) || 0) + 1);
    });

    const total = assignments.length;

    return variants.map((v) => ({
      variantId: v.id,
      variantName: v.name,
      count: distribution.get(v.id) || 0,
      percentage: total > 0 ? ((distribution.get(v.id) || 0) / total) * 100 : 0,
    }));
  }

  /**
   * Clear assignment cache
   */
  clearCache(): void {
    this.assignmentCache.clear();
  }

  /**
   * Clear assignment cache for specific experiment
   */
  clearExperimentCache(experimentId: string): void {
    const keysToDelete: string[] = [];
    this.assignmentCache.forEach((value, key) => {
      if (key.endsWith(`:${experimentId}`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.assignmentCache.delete(key));
  }

  /**
   * Map database record to Assignment
   */
  private mapToAssignment(data: Record<string, unknown>): Assignment {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      experimentId: data.experiment_id as string,
      variantId: data.variant_id as string,
      assignedAt: data.assigned_at as string,
      sticky: data.sticky as boolean,
      metadata: data.metadata as Record<string, unknown> | undefined,
    };
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
      config: data.config as Variant['config'],
      trafficAllocation: data.traffic_allocation as number,
      isControl: data.is_control as boolean,
      enabled: data.enabled as boolean,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}
