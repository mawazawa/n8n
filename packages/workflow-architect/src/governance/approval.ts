/**
 * Approval Workflows
 * Manage approval requests for governance policy violations and resource changes
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  ApprovalRequest,
  ApprovalRequestSchema,
  ApprovalStatus,
  ApprovalHistory,
} from './types';

export class ApprovalManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Create a new approval request
   */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    // Validate request
    ApprovalRequestSchema.parse(request);

    // Insert request
    const { error: requestError } = await this.supabase
      .from('governance_approval_requests')
      .insert({
        id: request.id,
        workflow_id: request.workflow.id,
        workflow_name: request.workflow.name,
        workflow_description: request.workflow.description,
        action: request.action,
        requester_user_id: request.requester.userId,
        requester_email: request.requester.email,
        requester_name: request.requester.name,
        approvers: request.approvers,
        reason: request.reason,
        status: request.status,
        created_at: request.createdAt,
        expires_at: request.expiresAt,
        metadata: request.metadata,
      });

    if (requestError) {
      throw new Error(`Failed to create approval request: ${requestError.message}`);
    }

    // Log history
    await this.logHistory(request.id, 'created', 'system', 'Approval request created');

    // Notify approvers
    await this.notifyApprovers(request);

    return request;
  }

  /**
   * Approve a request
   */
  async approve(requestId: string, approverId: string, comment?: string): Promise<void> {
    const request = await this.getRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Cannot approve request with status: ${request.status}`);
    }

    // Find approver
    const approverIndex = request.approvers.findIndex((a) => a.userId === approverId);

    if (approverIndex === -1) {
      throw new Error('User is not an approver for this request');
    }

    if (request.approvers[approverIndex].status !== 'pending') {
      throw new Error('Approver has already responded');
    }

    // Update approver status
    request.approvers[approverIndex].status = 'approved';
    request.approvers[approverIndex].respondedAt = new Date().toISOString();
    request.approvers[approverIndex].comment = comment;

    // Check if all approvers have approved
    const allApproved = request.approvers.every((a) => a.status === 'approved');

    if (allApproved) {
      request.status = ApprovalStatus.APPROVED;
      request.completedAt = new Date().toISOString();
    }

    // Update request
    const { error } = await this.supabase
      .from('governance_approval_requests')
      .update({
        approvers: request.approvers,
        status: request.status,
        completed_at: request.completedAt,
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(`Failed to approve request: ${error.message}`);
    }

    // Log history
    await this.logHistory(requestId, 'approved', approverId, comment);

    // Notify requester if fully approved
    if (allApproved) {
      await this.notifyRequester(request, 'approved');
    }
  }

  /**
   * Reject a request
   */
  async reject(requestId: string, approverId: string, reason: string): Promise<void> {
    const request = await this.getRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Cannot reject request with status: ${request.status}`);
    }

    // Find approver
    const approverIndex = request.approvers.findIndex((a) => a.userId === approverId);

    if (approverIndex === -1) {
      throw new Error('User is not an approver for this request');
    }

    // Update approver status
    request.approvers[approverIndex].status = 'rejected';
    request.approvers[approverIndex].respondedAt = new Date().toISOString();
    request.approvers[approverIndex].comment = reason;

    // Mark entire request as rejected
    request.status = ApprovalStatus.REJECTED;
    request.completedAt = new Date().toISOString();

    // Update request
    const { error } = await this.supabase
      .from('governance_approval_requests')
      .update({
        approvers: request.approvers,
        status: request.status,
        completed_at: request.completedAt,
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(`Failed to reject request: ${error.message}`);
    }

    // Log history
    await this.logHistory(requestId, 'rejected', approverId, reason);

    // Notify requester
    await this.notifyRequester(request, 'rejected');
  }

  /**
   * Cancel a request
   */
  async cancel(requestId: string, userId: string, reason?: string): Promise<void> {
    const request = await this.getRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Cannot cancel request with status: ${request.status}`);
    }

    // Only requester can cancel
    if (request.requester.userId !== userId) {
      throw new Error('Only the requester can cancel this request');
    }

    // Update request
    const { error } = await this.supabase
      .from('governance_approval_requests')
      .update({
        status: ApprovalStatus.CANCELLED,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(`Failed to cancel request: ${error.message}`);
    }

    // Log history
    await this.logHistory(requestId, 'cancelled', userId, reason);
  }

  /**
   * Get a request by ID
   */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    const { data, error } = await this.supabase
      .from('governance_approval_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      workflow: {
        id: data.workflow_id,
        name: data.workflow_name,
        description: data.workflow_description,
      },
      action: data.action,
      requester: {
        userId: data.requester_user_id,
        email: data.requester_email,
        name: data.requester_name,
      },
      approvers: data.approvers,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      completedAt: data.completed_at,
      metadata: data.metadata,
    };
  }

  /**
   * List requests for a user (as requester or approver)
   */
  async listRequests(userId: string, status?: ApprovalStatus): Promise<ApprovalRequest[]> {
    let query = this.supabase
      .from('governance_approval_requests')
      .select('*')
      .or(`requester_user_id.eq.${userId},approvers.cs.${JSON.stringify([{ userId }])}`);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list requests: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      workflow: {
        id: row.workflow_id,
        name: row.workflow_name,
        description: row.workflow_description,
      },
      action: row.action,
      requester: {
        userId: row.requester_user_id,
        email: row.requester_email,
        name: row.requester_name,
      },
      approvers: row.approvers,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(approverId: string): Promise<ApprovalRequest[]> {
    const { data, error } = await this.supabase
      .from('governance_approval_requests')
      .select('*')
      .eq('status', ApprovalStatus.PENDING);

    if (error) {
      throw new Error(`Failed to get pending approvals: ${error.message}`);
    }

    // Filter to requests where this user is a pending approver
    const filtered = (data || []).filter((row) => {
      const approvers = row.approvers || [];
      return approvers.some(
        (a: { userId: string; status: string }) =>
          a.userId === approverId && a.status === 'pending'
      );
    });

    return filtered.map((row) => ({
      id: row.id,
      workflow: {
        id: row.workflow_id,
        name: row.workflow_name,
        description: row.workflow_description,
      },
      action: row.action,
      requester: {
        userId: row.requester_user_id,
        email: row.requester_email,
        name: row.requester_name,
      },
      approvers: row.approvers,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Get approval history
   */
  async getHistory(requestId: string): Promise<ApprovalHistory[]> {
    const { data, error } = await this.supabase
      .from('governance_approval_history')
      .select('*')
      .eq('request_id', requestId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to get history: ${error.message}`);
    }

    return (data || []).map((row) => ({
      requestId: row.request_id,
      action: row.action,
      actorId: row.actor_id,
      timestamp: row.timestamp,
      comment: row.comment,
    }));
  }

  /**
   * Check and expire old requests
   */
  async expireOldRequests(): Promise<number> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('governance_approval_requests')
      .update({
        status: ApprovalStatus.EXPIRED,
        completed_at: now,
      })
      .eq('status', ApprovalStatus.PENDING)
      .lt('expires_at', now)
      .select();

    if (error) {
      throw new Error(`Failed to expire requests: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * Log approval history
   */
  private async logHistory(
    requestId: string,
    action: string,
    actorId: string,
    comment?: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('governance_approval_history')
      .insert({
        id: uuidv4(),
        request_id: requestId,
        action,
        actor_id: actorId,
        timestamp: new Date().toISOString(),
        comment,
      });

    if (error) {
      console.error('Failed to log history:', error);
    }
  }

  /**
   * Notify approvers of new request
   */
  private async notifyApprovers(request: ApprovalRequest): Promise<void> {
    // In a real implementation, this would send notifications
    // via email, Slack, etc.
    console.log(`Notifying approvers for request ${request.id}`);
  }

  /**
   * Notify requester of decision
   */
  private async notifyRequester(request: ApprovalRequest, decision: 'approved' | 'rejected'): Promise<void> {
    // In a real implementation, this would send notifications
    console.log(`Notifying requester of ${decision} decision for request ${request.id}`);
  }
}
