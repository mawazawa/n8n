/**
 * Comment Manager
 * Manages in-workflow comments with threading, mentions, and notifications
 */

import { EventEmitter } from 'events';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Comment } from './types';
import type { Database } from '../supabase/types';

export interface CommentNotification {
  commentId: string;
  mentionedUserId: string;
  mentionedBy: string;
  workflowId: string;
  nodeId?: string;
  content: string;
  timestamp: number;
}

export interface CommentFilter {
  workflowId?: string;
  nodeId?: string;
  author?: string;
  resolved?: boolean;
  mentionsUser?: string;
}

export interface CommentUpdate {
  content?: string;
  resolved?: boolean;
}

export class CommentManager extends EventEmitter {
  private comments: Map<string, Comment> = new Map(); // commentId -> comment
  private workflowComments: Map<string, Set<string>> = new Map(); // workflowId -> commentIds
  private nodeComments: Map<string, Set<string>> = new Map(); // nodeId -> commentIds
  private mentionPattern = /@(\w+)/g;

  constructor(private supabase: SupabaseClient<Database>) {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Add a new comment to a workflow
   */
  async addComment(
    workflowId: string,
    comment: Omit<Comment, 'id' | 'createdAt' | 'replies' | 'mentions'>,
  ): Promise<Comment> {
    const commentId = uuidv4();
    const now = new Date().toISOString();

    // Parse mentions from content
    const mentions = this.parseMentions(comment.content);

    const newComment: Comment = {
      id: commentId,
      nodeId: comment.nodeId,
      content: comment.content,
      author: comment.author,
      createdAt: now,
      resolved: comment.resolved || false,
      replies: [],
      mentions,
    };

    // Store in memory
    this.comments.set(commentId, newComment);

    // Index by workflow
    if (!this.workflowComments.has(workflowId)) {
      this.workflowComments.set(workflowId, new Set());
    }
    this.workflowComments.get(workflowId)!.add(commentId);

    // Index by node if applicable
    if (newComment.nodeId) {
      if (!this.nodeComments.has(newComment.nodeId)) {
        this.nodeComments.set(newComment.nodeId, new Set());
      }
      this.nodeComments.get(newComment.nodeId)!.add(commentId);
    }

    // Persist to Supabase
    await this.persistComment(workflowId, newComment);

    // Emit notifications for mentions
    for (const mentionedUser of mentions) {
      this.emitNotification({
        commentId,
        mentionedUserId: mentionedUser,
        mentionedBy: comment.author,
        workflowId,
        nodeId: comment.nodeId,
        content: comment.content,
        timestamp: Date.now(),
      });
    }

    // Emit comment added event
    this.emit('comment:added', workflowId, newComment);

    return newComment;
  }

  /**
   * Reply to an existing comment
   */
  async replyTo(
    commentId: string,
    reply: Omit<Comment, 'id' | 'createdAt' | 'replies' | 'mentions'>,
  ): Promise<Comment> {
    const parentComment = this.comments.get(commentId);
    if (!parentComment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    const replyId = uuidv4();
    const now = new Date().toISOString();

    // Parse mentions from reply content
    const mentions = this.parseMentions(reply.content);

    const newReply: Comment = {
      id: replyId,
      nodeId: reply.nodeId,
      content: reply.content,
      author: reply.author,
      createdAt: now,
      resolved: reply.resolved || false,
      replies: [],
      mentions,
    };

    // Add reply to parent comment
    parentComment.replies.push(newReply);
    parentComment.updatedAt = now;

    // Store reply in memory for direct access
    this.comments.set(replyId, newReply);

    // Update in Supabase
    await this.updateCommentInDb(commentId, parentComment);

    // Emit notifications for mentions in reply
    const workflowId = this.findWorkflowForComment(commentId);
    if (workflowId) {
      for (const mentionedUser of mentions) {
        this.emitNotification({
          commentId: replyId,
          mentionedUserId: mentionedUser,
          mentionedBy: reply.author,
          workflowId,
          nodeId: reply.nodeId,
          content: reply.content,
          timestamp: Date.now(),
        });
      }

      // Also notify the parent comment author
      if (parentComment.author !== reply.author) {
        this.emitNotification({
          commentId: replyId,
          mentionedUserId: parentComment.author,
          mentionedBy: reply.author,
          workflowId,
          nodeId: reply.nodeId,
          content: `replied to your comment: ${reply.content}`,
          timestamp: Date.now(),
        });
      }
    }

    // Emit reply added event
    this.emit('comment:reply', commentId, newReply);

    return newReply;
  }

  /**
   * Resolve a comment
   */
  async resolveComment(commentId: string): Promise<Comment> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.resolved = true;
    comment.updatedAt = new Date().toISOString();

    // Update in Supabase
    await this.updateCommentInDb(commentId, comment);

    // Emit resolved event
    this.emit('comment:resolved', commentId, comment);

    return comment;
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // Remove from memory
    this.comments.delete(commentId);

    // Remove from workflow index
    for (const [workflowId, commentIds] of this.workflowComments.entries()) {
      if (commentIds.has(commentId)) {
        commentIds.delete(commentId);
        if (commentIds.size === 0) {
          this.workflowComments.delete(workflowId);
        }
        break;
      }
    }

    // Remove from node index if applicable
    if (comment.nodeId) {
      const nodeCommentIds = this.nodeComments.get(comment.nodeId);
      if (nodeCommentIds) {
        nodeCommentIds.delete(commentId);
        if (nodeCommentIds.size === 0) {
          this.nodeComments.delete(comment.nodeId);
        }
      }
    }

    // Delete from Supabase
    await this.deleteCommentFromDb(commentId);

    // Emit deleted event
    this.emit('comment:deleted', commentId);
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, update: CommentUpdate): Promise<Comment> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // Apply updates
    if (update.content !== undefined) {
      comment.content = update.content;
      // Re-parse mentions
      comment.mentions = this.parseMentions(update.content);
    }

    if (update.resolved !== undefined) {
      comment.resolved = update.resolved;
    }

    comment.updatedAt = new Date().toISOString();

    // Update in Supabase
    await this.updateCommentInDb(commentId, comment);

    // Emit updated event
    this.emit('comment:updated', commentId, comment);

    return comment;
  }

  /**
   * Get comments for a workflow, optionally filtered by node
   */
  getComments(workflowId: string, nodeId?: string): Comment[] {
    const commentIds = this.workflowComments.get(workflowId);
    if (!commentIds) {
      return [];
    }

    const comments: Comment[] = [];

    for (const commentId of commentIds) {
      const comment = this.comments.get(commentId);
      if (!comment) {
        continue;
      }

      // Filter by node if specified
      if (nodeId !== undefined) {
        if (comment.nodeId === nodeId) {
          comments.push(comment);
        }
      } else {
        comments.push(comment);
      }
    }

    // Sort by creation date (newest first)
    return comments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get a specific comment by ID
   */
  getComment(commentId: string): Comment | undefined {
    return this.comments.get(commentId);
  }

  /**
   * Search comments with filters
   */
  searchComments(filter: CommentFilter): Comment[] {
    let results: Comment[] = [];

    // Start with workflow filter if provided
    if (filter.workflowId) {
      results = this.getComments(filter.workflowId);
    } else {
      // Get all comments
      results = Array.from(this.comments.values());
    }

    // Apply node filter
    if (filter.nodeId !== undefined) {
      results = results.filter((comment) => comment.nodeId === filter.nodeId);
    }

    // Apply author filter
    if (filter.author) {
      results = results.filter((comment) => comment.author === filter.author);
    }

    // Apply resolved filter
    if (filter.resolved !== undefined) {
      results = results.filter((comment) => comment.resolved === filter.resolved);
    }

    // Apply mentions filter
    if (filter.mentionsUser) {
      results = results.filter((comment) => comment.mentions.includes(filter.mentionsUser!));
    }

    return results;
  }

  /**
   * Get unresolved comments count for a workflow
   */
  getUnresolvedCount(workflowId: string, nodeId?: string): number {
    const comments = this.getComments(workflowId, nodeId);
    return comments.filter((comment) => !comment.resolved).length;
  }

  /**
   * Parse @mentions from comment content
   */
  private parseMentions(content: string): string[] {
    const mentions: string[] = [];
    const matches = content.matchAll(this.mentionPattern);

    for (const match of matches) {
      const username = match[1];
      if (username && !mentions.includes(username)) {
        mentions.push(username);
      }
    }

    return mentions;
  }

  /**
   * Find workflow ID for a comment
   */
  private findWorkflowForComment(commentId: string): string | undefined {
    for (const [workflowId, commentIds] of this.workflowComments.entries()) {
      if (commentIds.has(commentId)) {
        return workflowId;
      }
    }
    return undefined;
  }

  /**
   * Persist comment to Supabase
   */
  private async persistComment(workflowId: string, comment: Comment): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.supabase as any).from('workflow_comments').insert({
        id: comment.id,
        workflow_id: workflowId,
        node_id: comment.nodeId,
        content: comment.content,
        author: comment.author,
        created_at: comment.createdAt,
        resolved: comment.resolved,
        mentions: comment.mentions,
        replies: comment.replies,
      });

      if (error) {
        console.error('Failed to persist comment to Supabase:', error);
        // Don't throw - continue with in-memory storage
      }
    } catch (error) {
      console.error('Failed to persist comment to Supabase:', error);
      // Don't throw - continue with in-memory storage
    }
  }

  /**
   * Update comment in database
   */
  private async updateCommentInDb(commentId: string, comment: Comment): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.supabase as any)
        .from('workflow_comments')
        .update({
          content: comment.content,
          resolved: comment.resolved,
          updated_at: comment.updatedAt,
          mentions: comment.mentions,
          replies: comment.replies,
        })
        .eq('id', commentId);

      if (error) {
        console.error('Failed to update comment in Supabase:', error);
      }
    } catch (error) {
      console.error('Failed to update comment in Supabase:', error);
    }
  }

  /**
   * Delete comment from database
   */
  private async deleteCommentFromDb(commentId: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.supabase as any)
        .from('workflow_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('Failed to delete comment from Supabase:', error);
      }
    } catch (error) {
      console.error('Failed to delete comment from Supabase:', error);
    }
  }

  /**
   * Load comments from database for a workflow
   */
  async loadComments(workflowId: string): Promise<Comment[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (this.supabase as any)
        .from('workflow_comments')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load comments from Supabase:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Populate in-memory cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of data as any[]) {
        const comment: Comment = {
          id: row.id,
          nodeId: row.node_id || undefined,
          content: row.content,
          author: row.author,
          createdAt: row.created_at,
          updatedAt: row.updated_at || undefined,
          resolved: row.resolved,
          replies: (row.replies as Comment[]) || [],
          mentions: (row.mentions as string[]) || [],
        };

        this.comments.set(comment.id, comment);

        // Index by workflow
        if (!this.workflowComments.has(workflowId)) {
          this.workflowComments.set(workflowId, new Set());
        }
        this.workflowComments.get(workflowId)!.add(comment.id);

        // Index by node
        if (comment.nodeId) {
          if (!this.nodeComments.has(comment.nodeId)) {
            this.nodeComments.set(comment.nodeId, new Set());
          }
          this.nodeComments.get(comment.nodeId)!.add(comment.id);
        }
      }

      return this.getComments(workflowId);
    } catch (error) {
      console.error('Failed to load comments from Supabase:', error);
      return [];
    }
  }

  /**
   * Emit notification for a mention
   */
  private emitNotification(notification: CommentNotification): void {
    this.emit('notification', notification);
    this.emit(`notification:${notification.mentionedUserId}`, notification);
  }

  /**
   * Destroy the comment manager and clean up resources
   */
  async destroy(): Promise<void> {
    this.comments.clear();
    this.workflowComments.clear();
    this.nodeComments.clear();
    this.removeAllListeners();
  }
}
