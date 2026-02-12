/**
 * ExperimentManager - Core CRUD operations for A/B testing experiments
 * Manages experiment lifecycle: create, start, stop, update, delete
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type {
  Experiment,
  CreateExperimentInput,
  UpdateExperimentInput,
  ExperimentStatus,
  Variant,
} from './types.js';
import { CreateExperimentInputSchema, UpdateExperimentInputSchema } from './types.js';

export class ExperimentManager {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new A/B test experiment
   */
  async create(input: CreateExperimentInput, userId: string): Promise<Experiment> {
    // Validate input
    const validated = CreateExperimentInputSchema.parse(input);

    const experimentId = uuidv4();
    const now = new Date().toISOString();

    // Create experiment record
    const experiment = {
      id: experimentId,
      name: validated.name,
      description: validated.description || null,
      workflow_id: validated.workflowId,
      status: 'DRAFT' as ExperimentStatus,
      hypothesis: validated.hypothesis || null,
      minimum_sample_size: validated.minimumSampleSize,
      confidence_level: validated.confidenceLevel,
      minimum_detectable_effect: validated.minimumDetectableEffect,
      segment_id: validated.segmentId || null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    // Insert experiment
    const { data: expData, error: expError } = await this.supabase
      .from('experiments')
      .insert(experiment)
      .select()
      .single();

    if (expError) {
      throw new Error(`Failed to create experiment: ${expError.message}`);
    }

    // Create variants
    const variants = validated.variants.map((v) => ({
      id: uuidv4(),
      experiment_id: experimentId,
      name: v.name,
      description: v.description || null,
      config: v.config,
      traffic_allocation: v.trafficAllocation,
      is_control: v.isControl,
      enabled: true,
      created_at: now,
      updated_at: now,
    }));

    const { error: varError } = await this.supabase.from('variants').insert(variants);

    if (varError) {
      // Rollback experiment creation
      await this.supabase.from('experiments').delete().eq('id', experimentId);
      throw new Error(`Failed to create variants: ${varError.message}`);
    }

    // Store metrics
    const metrics = validated.metrics.map((m) => ({
      experiment_id: experimentId,
      name: m.name,
      type: m.type,
      goal: m.goal,
      description: m.description || null,
      unit: m.unit || null,
      is_primary: m.isPrimary,
    }));

    const { error: metricError } = await this.supabase.from('experiment_metrics').insert(metrics);

    if (metricError) {
      // Rollback
      await this.supabase.from('variants').delete().eq('experiment_id', experimentId);
      await this.supabase.from('experiments').delete().eq('id', experimentId);
      throw new Error(`Failed to create metrics: ${metricError.message}`);
    }

    // Fetch complete experiment
    return this.getExperiment(experimentId);
  }

  /**
   * Start an experiment
   */
  async start(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);

    // Validate experiment can be started
    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new Error(`Cannot start experiment with status: ${experiment.status}`);
    }

    // Ensure we have at least 2 variants
    if (experiment.variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants to start');
    }

    // Validate traffic allocation
    const totalAllocation = experiment.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    if (Math.abs(totalAllocation - 1.0) > 0.0001) {
      throw new Error('Traffic allocation must sum to 100%');
    }

    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from('experiments')
      .update({
        status: 'RUNNING',
        start_date: experiment.startDate || now,
        updated_at: now,
      })
      .eq('id', experimentId);

    if (error) {
      throw new Error(`Failed to start experiment: ${error.message}`);
    }
  }

  /**
   * Pause a running experiment
   */
  async pause(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);

    if (experiment.status !== 'RUNNING') {
      throw new Error(`Cannot pause experiment with status: ${experiment.status}`);
    }

    const { error } = await this.supabase
      .from('experiments')
      .update({
        status: 'PAUSED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', experimentId);

    if (error) {
      throw new Error(`Failed to pause experiment: ${error.message}`);
    }
  }

  /**
   * Stop an experiment (complete it)
   */
  async stop(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);

    if (experiment.status !== 'RUNNING' && experiment.status !== 'PAUSED') {
      throw new Error(`Cannot stop experiment with status: ${experiment.status}`);
    }

    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from('experiments')
      .update({
        status: 'COMPLETED',
        end_date: now,
        updated_at: now,
      })
      .eq('id', experimentId);

    if (error) {
      throw new Error(`Failed to stop experiment: ${error.message}`);
    }
  }

  /**
   * Get experiment status
   */
  async getStatus(experimentId: string): Promise<ExperimentStatus> {
    const { data, error } = await this.supabase
      .from('experiments')
      .select('status')
      .eq('id', experimentId)
      .single();

    if (error || !data) {
      throw new Error(`Failed to get experiment status: ${error?.message || 'Not found'}`);
    }

    return data.status as ExperimentStatus;
  }

  /**
   * Get a single experiment with all related data
   */
  async getExperiment(experimentId: string): Promise<Experiment> {
    const { data: expData, error: expError } = await this.supabase
      .from('experiments')
      .select('*')
      .eq('id', experimentId)
      .single();

    if (expError || !expData) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // Fetch variants
    const { data: varData, error: varError } = await this.supabase
      .from('variants')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('created_at', { ascending: true });

    if (varError) {
      throw new Error(`Failed to fetch variants: ${varError.message}`);
    }

    // Fetch metrics
    const { data: metricData, error: metricError } = await this.supabase
      .from('experiment_metrics')
      .select('*')
      .eq('experiment_id', experimentId);

    if (metricError) {
      throw new Error(`Failed to fetch metrics: ${metricError.message}`);
    }

    return this.mapToExperiment(expData, varData || [], metricData || []);
  }

  /**
   * Update an experiment
   */
  async update(experimentId: string, input: UpdateExperimentInput): Promise<Experiment> {
    const validated = UpdateExperimentInputSchema.parse(input);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (validated.name) updates.name = validated.name;
    if (validated.description !== undefined) updates.description = validated.description;
    if (validated.status) updates.status = validated.status;
    if (validated.endDate) updates.end_date = validated.endDate;

    const { error } = await this.supabase
      .from('experiments')
      .update(updates)
      .eq('id', experimentId);

    if (error) {
      throw new Error(`Failed to update experiment: ${error.message}`);
    }

    // Update metrics if provided
    if (validated.metrics) {
      // Delete existing metrics
      await this.supabase.from('experiment_metrics').delete().eq('experiment_id', experimentId);

      // Insert new metrics
      const metrics = validated.metrics.map((m) => ({
        experiment_id: experimentId,
        name: m.name,
        type: m.type,
        goal: m.goal,
        description: m.description || null,
        unit: m.unit || null,
        is_primary: m.isPrimary,
      }));

      const { error: metricError } = await this.supabase
        .from('experiment_metrics')
        .insert(metrics);

      if (metricError) {
        throw new Error(`Failed to update metrics: ${metricError.message}`);
      }
    }

    return this.getExperiment(experimentId);
  }

  /**
   * Delete an experiment
   */
  async delete(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);

    // Can only delete draft or completed experiments
    if (experiment.status === 'RUNNING') {
      throw new Error('Cannot delete a running experiment. Stop it first.');
    }

    // Delete in correct order (foreign keys)
    await this.supabase.from('metric_events').delete().eq('experiment_id', experimentId);
    await this.supabase.from('assignments').delete().eq('experiment_id', experimentId);
    await this.supabase.from('experiment_metrics').delete().eq('experiment_id', experimentId);
    await this.supabase.from('variants').delete().eq('experiment_id', experimentId);

    const { error } = await this.supabase.from('experiments').delete().eq('id', experimentId);

    if (error) {
      throw new Error(`Failed to delete experiment: ${error.message}`);
    }
  }

  /**
   * List all experiments with optional filters
   */
  async listExperiments(filters?: {
    workflowId?: string;
    status?: ExperimentStatus;
    limit?: number;
    offset?: number;
  }): Promise<Experiment[]> {
    let query = this.supabase.from('experiments').select('*');

    if (filters?.workflowId) {
      query = query.eq('workflow_id', filters.workflowId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list experiments: ${error.message}`);
    }

    // Fetch variants and metrics for each experiment
    const experiments = await Promise.all(
      (data || []).map((exp) => this.getExperiment(exp.id)),
    );

    return experiments;
  }

  /**
   * Get experiments by workflow
   */
  async getByWorkflow(workflowId: string): Promise<Experiment[]> {
    return this.listExperiments({ workflowId });
  }

  /**
   * Map database records to Experiment object
   */
  private mapToExperiment(
    expData: Record<string, unknown>,
    varData: Record<string, unknown>[],
    metricData: Record<string, unknown>[],
  ): Experiment {
    const variants: Variant[] = varData.map((v) => ({
      id: v.id as string,
      experimentId: v.experiment_id as string,
      name: v.name as string,
      description: v.description as string | undefined,
      config: v.config as Variant['config'],
      trafficAllocation: v.traffic_allocation as number,
      isControl: v.is_control as boolean,
      enabled: v.enabled as boolean,
      createdAt: v.created_at as string,
      updatedAt: v.updated_at as string,
    }));

    const metrics = metricData.map((m) => ({
      name: m.name as string,
      type: m.type as Experiment['metrics'][number]['type'],
      goal: m.goal as Experiment['metrics'][number]['goal'],
      description: m.description as string | undefined,
      unit: m.unit as string | undefined,
      isPrimary: m.is_primary as boolean,
    }));

    return {
      id: expData.id as string,
      name: expData.name as string,
      description: expData.description as string | undefined,
      workflowId: expData.workflow_id as string,
      status: expData.status as ExperimentStatus,
      variants,
      metrics,
      hypothesis: expData.hypothesis as string | undefined,
      startDate: expData.start_date as string | undefined,
      endDate: expData.end_date as string | undefined,
      minimumSampleSize: expData.minimum_sample_size as number,
      confidenceLevel: expData.confidence_level as number,
      minimumDetectableEffect: expData.minimum_detectable_effect as number,
      segmentId: expData.segment_id as string | undefined,
      createdBy: expData.created_by as string,
      createdAt: expData.created_at as string,
      updatedAt: expData.updated_at as string,
    };
  }
}
