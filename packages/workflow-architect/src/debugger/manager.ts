/**
 * Debug Session Manager
 * Manages debug sessions lifecycle and state
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import type {
  DebugSession,
  DebugSessionStatus,
  Breakpoint,
  StackFrame,
  WatchExpression,
} from './types.js';

export class DebugManager {
  private supabase = getSupabaseClient();
  private activeSessions = new Map<string, DebugSession>();

  /**
   * Create a new debug session
   */
  async createSession(workflowId: string, userId?: string): Promise<DebugSession> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session: DebugSession = {
      id: sessionId,
      workflowId,
      status: 'CREATED',
      breakpoints: [],
      stack: [],
      createdAt: now,
      updatedAt: now,
    };

    // Store in database
    const { error } = await this.supabase
      .from('debug_sessions')
      .insert({
        id: sessionId,
        workflow_id: workflowId,
        user_id: userId,
        status: 'CREATED',
        breakpoints: [],
        stack: [],
        created_at: now,
        updated_at: now,
      });

    if (error) {
      throw new Error(`Failed to create debug session: ${error.message}`);
    }

    // Cache in memory
    this.activeSessions.set(sessionId, session);

    return session;
  }

  /**
   * Get a debug session by ID
   */
  async getSession(sessionId: string): Promise<DebugSession> {
    // Check cache first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('debug_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      throw new Error(`Debug session not found: ${sessionId}`);
    }

    const session = this.mapToSession(data);
    this.activeSessions.set(sessionId, session);

    return session;
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, 'RUNNING');
  }

  /**
   * Pause a running session
   */
  async pauseSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, 'PAUSED');
  }

  /**
   * Stop a session
   */
  async stopSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, 'STOPPED');

    // Remove from cache
    this.activeSessions.delete(sessionId);
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: DebugSessionStatus): Promise<void> {
    const session = await this.getSession(sessionId);
    session.status = status;
    session.updatedAt = new Date().toISOString();

    // Update database
    const { error } = await this.supabase
      .from('debug_sessions')
      .update({
        status,
        updated_at: session.updatedAt,
      })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session status: ${error.message}`);
    }

    // Update cache
    this.activeSessions.set(sessionId, session);
  }

  /**
   * Add a breakpoint to the session
   */
  async addBreakpoint(sessionId: string, breakpoint: Breakpoint): Promise<void> {
    const session = await this.getSession(sessionId);
    session.breakpoints.push(breakpoint);
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Remove a breakpoint from the session
   */
  async removeBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    session.breakpoints = session.breakpoints.filter((bp) => bp.id !== breakpointId);
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Update breakpoints in the session
   */
  async updateBreakpoints(sessionId: string, breakpoints: Breakpoint[]): Promise<void> {
    const session = await this.getSession(sessionId);
    session.breakpoints = breakpoints;
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Add a stack frame
   */
  async pushStackFrame(sessionId: string, frame: StackFrame): Promise<void> {
    const session = await this.getSession(sessionId);
    session.stack.push(frame);
    session.currentNodeId = frame.nodeId;
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Pop the last stack frame
   */
  async popStackFrame(sessionId: string): Promise<StackFrame | undefined> {
    const session = await this.getSession(sessionId);
    const frame = session.stack.pop();

    if (session.stack.length > 0) {
      session.currentNodeId = session.stack[session.stack.length - 1].nodeId;
    } else {
      session.currentNodeId = undefined;
    }

    session.updatedAt = new Date().toISOString();
    await this.updateSession(session);

    return frame;
  }

  /**
   * Get the current stack frame
   */
  async getCurrentFrame(sessionId: string): Promise<StackFrame | undefined> {
    const session = await this.getSession(sessionId);
    return session.stack[session.stack.length - 1];
  }

  /**
   * Clear the stack
   */
  async clearStack(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    session.stack = [];
    session.currentNodeId = undefined;
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Set execution ID for the session
   */
  async setExecutionId(sessionId: string, executionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    session.executionId = executionId;
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Update watch expressions
   */
  async updateWatches(sessionId: string, watches: WatchExpression[]): Promise<void> {
    const session = await this.getSession(sessionId);
    session.watches = watches;
    session.updatedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * List all active sessions
   */
  async listActiveSessions(userId?: string): Promise<DebugSession[]> {
    const query = this.supabase
      .from('debug_sessions')
      .select('*')
      .in('status', ['CREATED', 'RUNNING', 'PAUSED'])
      .order('created_at', { ascending: false });

    if (userId) {
      query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }

    return (data || []).map(this.mapToSession);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Remove from cache
    this.activeSessions.delete(sessionId);

    // Delete from database
    const { error } = await this.supabase
      .from('debug_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }
  }

  /**
   * Update the entire session
   */
  private async updateSession(session: DebugSession): Promise<void> {
    const { error } = await this.supabase
      .from('debug_sessions')
      .update({
        status: session.status,
        execution_id: session.executionId,
        current_node_id: session.currentNodeId,
        breakpoints: session.breakpoints,
        stack: session.stack,
        watches: session.watches || [],
        metadata: session.metadata || {},
        updated_at: session.updatedAt,
      })
      .eq('id', session.id);

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    // Update cache
    this.activeSessions.set(session.id, session);
  }

  /**
   * Map database row to DebugSession
   */
  private mapToSession(data: Record<string, unknown>): DebugSession {
    return {
      id: data.id as string,
      workflowId: data.workflow_id as string,
      executionId: data.execution_id as string | undefined,
      status: data.status as DebugSessionStatus,
      breakpoints: (data.breakpoints as Breakpoint[]) || [],
      stack: (data.stack as StackFrame[]) || [],
      currentNodeId: data.current_node_id as string | undefined,
      watches: (data.watches as WatchExpression[]) || undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      metadata: (data.metadata as Record<string, unknown>) || undefined,
    };
  }
}

/**
 * Create a debug manager instance
 */
export function createDebugManager(): DebugManager {
  return new DebugManager();
}
