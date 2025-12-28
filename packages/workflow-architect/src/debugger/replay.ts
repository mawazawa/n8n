/**
 * Replay Engine
 * Allows replaying executions with modifications for testing
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import type { ReplaySession, ExecutionResult } from './types.js';
import { DiffGenerator } from './diff.js';

export class ReplayEngine {
  private supabase = getSupabaseClient();
  private activeSessions = new Map<string, ReplaySession>();
  private diffGenerator = new DiffGenerator();

  /**
   * Start a replay session from an existing execution
   */
  async startReplay(executionId: string, startNodeId?: string): Promise<ReplaySession> {
    // Fetch original execution data
    const execution = await this.fetchExecution(executionId);

    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const session: ReplaySession = {
      id: uuidv4(),
      originalExecutionId: executionId,
      startNodeId: startNodeId || this.getFirstNodeId(execution),
      modifications: {},
      status: 'created',
      createdAt: new Date().toISOString(),
    };

    // Save to database
    await this.saveSession(session);

    // Cache in memory
    this.activeSessions.set(session.id, session);

    return session;
  }

  /**
   * Modify input data for a specific node
   */
  async modifyInput(replayId: string, nodeId: string, input: unknown): Promise<void> {
    const session = await this.getSession(replayId);

    session.modifications[nodeId] = {
      input,
      modifiedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    this.activeSessions.set(replayId, session);
  }

  /**
   * Replay execution from a specific node
   */
  async replayFromNode(replayId: string, nodeId: string): Promise<ExecutionResult> {
    const session = await this.getSession(replayId);

    // Update status
    session.status = 'running';
    await this.saveSession(session);

    try {
      // Execute the workflow
      const result = await this.executeReplay(session, nodeId);

      // Update status
      session.status = 'completed';
      await this.saveSession(session);

      return result;
    } catch (error) {
      // Update status
      session.status = 'error';
      await this.saveSession(session);

      throw error;
    }
  }

  /**
   * Compare original execution with replay
   */
  async compareResults(
    replayId: string,
  ): Promise<{
    hasChanges: boolean;
    nodeChanges: Array<{
      nodeId: string;
      originalOutput: unknown;
      replayOutput: unknown;
      diff: ReturnType<DiffGenerator['generateDiff']>;
    }>;
  }> {
    const session = await this.getSession(replayId);

    // Fetch original execution
    const originalExecution = await this.fetchExecution(session.originalExecutionId);
    if (!originalExecution) {
      throw new Error('Original execution not found');
    }

    // Fetch replay execution
    const replayExecution = await this.fetchReplayExecution(replayId);
    if (!replayExecution) {
      throw new Error('Replay execution not found');
    }

    const nodeChanges: Array<{
      nodeId: string;
      originalOutput: unknown;
      replayOutput: unknown;
      diff: ReturnType<DiffGenerator['generateDiff']>;
    }> = [];

    const allNodeIds = new Set([
      ...Object.keys(originalExecution.data || {}),
      ...Object.keys(replayExecution.data || {}),
    ]);

    for (const nodeId of allNodeIds) {
      const originalOutput = (originalExecution.data as Record<string, unknown>)?.[nodeId];
      const replayOutput = (replayExecution.data as Record<string, unknown>)?.[nodeId];

      const diff = this.diffGenerator.generateDiff(originalOutput, replayOutput);

      nodeChanges.push({
        nodeId,
        originalOutput,
        replayOutput,
        diff,
      });
    }

    const hasChanges = nodeChanges.some(
      (change) =>
        change.diff.summary.additions > 0 ||
        change.diff.summary.deletions > 0 ||
        change.diff.summary.modifications > 0,
    );

    return {
      hasChanges,
      nodeChanges,
    };
  }

  /**
   * Get replay session
   */
  async getSession(replayId: string): Promise<ReplaySession> {
    // Check cache
    if (this.activeSessions.has(replayId)) {
      return this.activeSessions.get(replayId)!;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('execution_snapshots')
      .select('*')
      .eq('id', replayId)
      .eq('snapshot_type', 'replay')
      .single();

    if (error || !data) {
      throw new Error(`Replay session not found: ${replayId}`);
    }

    const session: ReplaySession = {
      id: data.id as string,
      originalExecutionId: data.execution_id as string,
      startNodeId: data.start_node_id as string,
      modifications: (data.modifications as Record<string, unknown>) || {},
      status: data.status as ReplaySession['status'],
      createdAt: data.created_at as string,
    };

    this.activeSessions.set(replayId, session);
    return session;
  }

  /**
   * List all replay sessions
   */
  async listSessions(executionId?: string): Promise<ReplaySession[]> {
    const query = this.supabase
      .from('execution_snapshots')
      .select('*')
      .eq('snapshot_type', 'replay')
      .order('created_at', { ascending: false });

    if (executionId) {
      query.eq('execution_id', executionId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list replay sessions: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id as string,
      originalExecutionId: row.execution_id as string,
      startNodeId: row.start_node_id as string,
      modifications: (row.modifications as Record<string, unknown>) || {},
      status: row.status as ReplaySession['status'],
      createdAt: row.created_at as string,
    }));
  }

  /**
   * Delete a replay session
   */
  async deleteSession(replayId: string): Promise<void> {
    this.activeSessions.delete(replayId);

    const { error } = await this.supabase
      .from('execution_snapshots')
      .delete()
      .eq('id', replayId)
      .eq('snapshot_type', 'replay');

    if (error) {
      throw new Error(`Failed to delete replay session: ${error.message}`);
    }
  }

  /**
   * Save replay session to database
   */
  private async saveSession(session: ReplaySession): Promise<void> {
    const { error } = await this.supabase
      .from('execution_snapshots')
      .upsert({
        id: session.id,
        snapshot_type: 'replay',
        execution_id: session.originalExecutionId,
        start_node_id: session.startNodeId,
        modifications: session.modifications,
        status: session.status,
        created_at: session.createdAt,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to save replay session: ${error.message}`);
    }
  }

  /**
   * Fetch original execution data
   */
  private async fetchExecution(executionId: string): Promise<ExecutionResult | null> {
    // This is a simplified implementation
    // In a real implementation, this would fetch from n8n's execution data
    // or from a stored snapshot in the database

    const { data, error } = await this.supabase
      .from('execution_snapshots')
      .select('*')
      .eq('execution_id', executionId)
      .eq('snapshot_type', 'execution')
      .single();

    if (error || !data) {
      return null;
    }

    return {
      executionId: data.execution_id as string,
      status: data.status as ExecutionResult['status'],
      data: (data.snapshot_data as Record<string, unknown>) || {},
    };
  }

  /**
   * Fetch replay execution data
   */
  private async fetchReplayExecution(replayId: string): Promise<ExecutionResult | null> {
    const { data, error } = await this.supabase
      .from('execution_snapshots')
      .select('*')
      .eq('id', replayId)
      .eq('snapshot_type', 'replay')
      .single();

    if (error || !data) {
      return null;
    }

    return {
      executionId: replayId,
      status: data.status as ExecutionResult['status'],
      data: (data.snapshot_data as Record<string, unknown>) || {},
    };
  }

  /**
   * Get the first node ID from execution data
   */
  private getFirstNodeId(execution: ExecutionResult): string {
    const nodeIds = Object.keys(execution.data || {});
    return nodeIds[0] || '';
  }

  /**
   * Execute the replay
   */
  private async executeReplay(
    session: ReplaySession,
    startNodeId: string,
  ): Promise<ExecutionResult> {
    // This is a simplified implementation
    // In a real implementation, this would:
    // 1. Load the original workflow
    // 2. Apply modifications to node inputs
    // 3. Execute the workflow starting from startNodeId
    // 4. Collect results and save as a snapshot

    // For now, return a mock result
    const executionId = uuidv4();

    const result: ExecutionResult = {
      executionId,
      status: 'success',
      data: {
        [startNodeId]: {
          modified: true,
          input: session.modifications[startNodeId]?.input,
        },
      },
    };

    // Save snapshot
    await this.supabase.from('execution_snapshots').insert({
      id: executionId,
      snapshot_type: 'replay',
      execution_id: session.originalExecutionId,
      snapshot_data: result.data,
      status: result.status,
      created_at: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Clone a replay session
   */
  async cloneSession(replayId: string): Promise<ReplaySession> {
    const original = await this.getSession(replayId);

    const cloned: ReplaySession = {
      id: uuidv4(),
      originalExecutionId: original.originalExecutionId,
      startNodeId: original.startNodeId,
      modifications: { ...original.modifications },
      status: 'created',
      createdAt: new Date().toISOString(),
    };

    await this.saveSession(cloned);
    this.activeSessions.set(cloned.id, cloned);

    return cloned;
  }

  /**
   * Reset modifications
   */
  async resetModifications(replayId: string): Promise<void> {
    const session = await this.getSession(replayId);
    session.modifications = {};
    await this.saveSession(session);
    this.activeSessions.set(replayId, session);
  }

  /**
   * Get modifications for a session
   */
  async getModifications(replayId: string): Promise<Record<string, { input: unknown; modifiedAt: string }>> {
    const session = await this.getSession(replayId);
    return session.modifications as Record<string, { input: unknown; modifiedAt: string }>;
  }
}

/**
 * Create a replay engine instance
 */
export function createReplayEngine(): ReplayEngine {
  return new ReplayEngine();
}
