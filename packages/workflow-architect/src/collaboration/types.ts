/**
 * Collaboration Types
 * Type definitions for collaborative editing in workflow-architect
 */

export interface UserPresence {
  userId: string;
  userName: string;
  avatarUrl?: string;
  color: string; // Unique color for this user
  lastSeen: number;
  isActive: boolean;
  currentNode?: string; // Node ID user is focused on
  cursorPosition?: { x: number; y: number };
}

export interface NodeLock {
  nodeId: string;
  lockedBy: string;
  lockedAt: number;
  expiresAt: number;
  reason?: string;
}

export interface CollaborationSession {
  id: string;
  workflowId: string;
  createdAt: number;
  participants: UserPresence[];
  locks: NodeLock[];
  version: number;
}

export interface CollaborationEvent {
  type:
    | 'user_joined'
    | 'user_left'
    | 'cursor_moved'
    | 'node_selected'
    | 'node_locked'
    | 'node_unlocked'
    | 'workflow_changed';
  userId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface Comment {
  id: string;
  nodeId?: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
  resolved: boolean;
  replies: Comment[];
  mentions: string[];
}
