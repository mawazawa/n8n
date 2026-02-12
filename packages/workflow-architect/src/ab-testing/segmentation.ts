/**
 * SegmentManager - User segmentation for targeted experiments
 * Manages user segments with criteria-based filtering
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Segment, SegmentCriteria } from './types.js';
import { SegmentCriteriaSchema } from './types.js';

export interface CreateSegmentInput {
  name: string;
  description?: string;
  criteria: SegmentCriteria;
}

export class SegmentManager {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new user segment
   */
  async createSegment(input: CreateSegmentInput): Promise<Segment> {
    // Validate criteria
    SegmentCriteriaSchema.parse(input.criteria);

    const now = new Date().toISOString();
    const segment = {
      id: uuidv4(),
      name: input.name,
      description: input.description || null,
      criteria: input.criteria,
      estimated_size: null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.supabase
      .from('segments')
      .insert(segment)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create segment: ${error.message}`);
    }

    // Calculate estimated size
    const estimatedSize = await this.calculateSegmentSize(segment.id);

    // Update with estimated size
    await this.supabase
      .from('segments')
      .update({ estimated_size: estimatedSize })
      .eq('id', segment.id);

    return {
      ...this.mapToSegment(data),
      estimatedSize,
    };
  }

  /**
   * Update a segment
   */
  async updateSegment(
    segmentId: string,
    input: Partial<CreateSegmentInput>,
  ): Promise<Segment> {
    if (input.criteria) {
      SegmentCriteriaSchema.parse(input.criteria);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.criteria) updates.criteria = input.criteria;

    const { data, error } = await this.supabase
      .from('segments')
      .update(updates)
      .eq('id', segmentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update segment: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    // Recalculate estimated size if criteria changed
    if (input.criteria) {
      const estimatedSize = await this.calculateSegmentSize(segmentId);
      await this.supabase
        .from('segments')
        .update({ estimated_size: estimatedSize })
        .eq('id', segmentId);
    }

    return this.mapToSegment(data);
  }

  /**
   * Delete a segment
   */
  async deleteSegment(segmentId: string): Promise<void> {
    // Check if segment is used by any experiments
    const { data: experiments, error: expError } = await this.supabase
      .from('experiments')
      .select('id')
      .eq('segment_id', segmentId)
      .limit(1);

    if (expError) {
      throw new Error(`Failed to check segment usage: ${expError.message}`);
    }

    if (experiments && experiments.length > 0) {
      throw new Error('Cannot delete segment that is used by experiments');
    }

    const { error } = await this.supabase.from('segments').delete().eq('id', segmentId);

    if (error) {
      throw new Error(`Failed to delete segment: ${error.message}`);
    }
  }

  /**
   * Get a segment
   */
  async getSegment(segmentId: string): Promise<Segment> {
    const { data, error } = await this.supabase
      .from('segments')
      .select('*')
      .eq('id', segmentId)
      .single();

    if (error || !data) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    return this.mapToSegment(data);
  }

  /**
   * List all segments
   */
  async listSegments(filters?: { limit?: number; offset?: number }): Promise<Segment[]> {
    let query = this.supabase.from('segments').select('*');

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list segments: ${error.message}`);
    }

    return (data || []).map((s) => this.mapToSegment(s));
  }

  /**
   * Assign a user to appropriate segment
   */
  async assignToSegment(
    userId: string,
    userProperties?: Record<string, unknown>,
  ): Promise<Segment | null> {
    // Get all segments
    const segments = await this.listSegments();

    // Find first matching segment
    for (const segment of segments) {
      if (await this.userMatchesSegment(userId, segment, userProperties)) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Check if user matches segment criteria
   */
  async userMatchesSegment(
    userId: string,
    segment: Segment,
    userProperties?: Record<string, unknown>,
  ): Promise<boolean> {
    const { criteria } = segment;

    // Check user properties
    if (criteria.userProperties && userProperties) {
      const matches = Object.entries(criteria.userProperties).every(([key, value]) => {
        return userProperties[key] === value;
      });
      if (!matches) return false;
    }

    // Check behaviors
    if (criteria.behaviors && criteria.behaviors.length > 0) {
      const behaviorMatches = await this.checkBehaviors(userId, criteria.behaviors);
      if (!behaviorMatches) return false;
    }

    // Check cohort
    if (criteria.cohort) {
      const cohortMatches = await this.checkCohort(userId, criteria.cohort);
      if (!cohortMatches) return false;
    }

    // Check custom query
    if (criteria.customQuery) {
      // Execute custom query (simplified - in production, use secure query execution)
      console.warn('Custom query execution not implemented');
    }

    return true;
  }

  /**
   * Get users in a segment
   */
  async getSegmentUsers(segmentId: string, limit = 100): Promise<string[]> {
    const segment = await this.getSegment(segmentId);

    // This is a simplified implementation
    // In production, would query user database with criteria

    const { data, error } = await this.supabase
      .from('assignments')
      .select('user_id')
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    const userIds = (data || []).map((row) => row.user_id as string);

    // Filter by segment criteria
    const matchingUsers: string[] = [];
    for (const userId of userIds) {
      if (await this.userMatchesSegment(userId, segment)) {
        matchingUsers.push(userId);
      }
    }

    return matchingUsers;
  }

  /**
   * Calculate estimated segment size
   */
  private async calculateSegmentSize(segmentId: string): Promise<number> {
    // Simplified implementation
    // In production, would query user database with criteria
    const users = await this.getSegmentUsers(segmentId, 1000);
    return users.length;
  }

  /**
   * Check if user matches behavior criteria
   */
  private async checkBehaviors(
    userId: string,
    behaviors: NonNullable<SegmentCriteria['behaviors']>,
  ): Promise<boolean> {
    // Simplified implementation
    // In production, would query event tracking system

    for (const behavior of behaviors) {
      const { data, error } = await this.supabase
        .from('metric_events')
        .select('id')
        .eq('user_id', userId)
        .eq('metric_name', behavior.event);

      if (error) continue;

      const count = data?.length || 0;

      if (behavior.count && count < behavior.count) {
        return false;
      }

      if (behavior.within) {
        const cutoff = new Date(Date.now() - behavior.within).toISOString();
        const { data: recentData } = await this.supabase
          .from('metric_events')
          .select('id')
          .eq('user_id', userId)
          .eq('metric_name', behavior.event)
          .gte('timestamp', cutoff);

        if (!recentData || recentData.length === 0) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if user is in cohort
   */
  private async checkCohort(
    userId: string,
    cohort: NonNullable<SegmentCriteria['cohort']>,
  ): Promise<boolean> {
    // Get user's first activity date
    const { data, error } = await this.supabase
      .from('assignments')
      .select('assigned_at')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      return false;
    }

    const firstActivity = new Date(data.assigned_at as string);
    const startDate = new Date(cohort.startDate);
    const endDate = new Date(cohort.endDate);

    return firstActivity >= startDate && firstActivity <= endDate;
  }

  /**
   * Map database record to Segment
   */
  private mapToSegment(data: Record<string, unknown>): Segment {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string | undefined,
      criteria: data.criteria as SegmentCriteria,
      estimatedSize: data.estimated_size as number | undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}
