/**
 * Lock Manager
 * Manages optimistic locking with conflict detection for collaborative editing
 */

import { EventEmitter } from 'events';
import type { NodeLock, CollaborationSession, CollaborationEvent } from './types';

export interface LockConfig {
  defaultLockDuration: number; // milliseconds
  renewalThreshold: number; // milliseconds before expiry to auto-renew
  maxLockDuration: number; // maximum lock duration
}

export class LockManager extends EventEmitter {
  private locks: Map<string, Map<string, NodeLock>> = new Map(); // sessionId -> nodeId -> lock
  private renewalTimers: Map<string, Map<string, NodeJS.Timeout>> = new Map(); // sessionId -> nodeId -> timer
  private readonly config: LockConfig;

  constructor(config?: Partial<LockConfig>) {
    super();
    this.config = {
      defaultLockDuration: 30000, // 30 seconds
      renewalThreshold: 5000, // Renew 5 seconds before expiry
      maxLockDuration: 300000, // 5 minutes
      ...config,
    };
    this.setMaxListeners(100);
  }

  /**
   * Acquire a lock on a node (optimistic locking)
   */
  async acquireLock(
    session: CollaborationSession,
    nodeId: string,
    userId: string,
    options?: { duration?: number; reason?: string },
  ): Promise<NodeLock> {
    const sessionId = session.id;
    const duration = Math.min(
      options?.duration || this.config.defaultLockDuration,
      this.config.maxLockDuration,
    );

    // Initialize locks map for session if needed
    if (!this.locks.has(sessionId)) {
      this.locks.set(sessionId, new Map());
    }

    const sessionLocks = this.locks.get(sessionId)!;

    // Check if node is already locked
    const existingLock = sessionLocks.get(nodeId);
    if (existingLock) {
      // Check if lock is still valid
      if (existingLock.expiresAt > Date.now()) {
        // Lock is held by another user
        if (existingLock.lockedBy !== userId) {
          throw new Error(
            `Node ${nodeId} is already locked by user ${existingLock.lockedBy}`,
          );
        }
        // Lock is held by same user - extend it
        return this.renewLock(session, nodeId, userId, duration);
      }
      // Lock has expired - clean it up
      this.cleanupLock(sessionId, nodeId);
    }

    // Create new lock
    const now = Date.now();
    const lock: NodeLock = {
      nodeId,
      lockedBy: userId,
      lockedAt: now,
      expiresAt: now + duration,
      reason: options?.reason,
    };

    // Store lock
    sessionLocks.set(nodeId, lock);

    // Set up auto-renewal timer
    this.setupRenewalTimer(sessionId, nodeId, userId, duration);

    // Emit lock acquired event
    this.emitEvent(sessionId, {
      type: 'node_locked',
      userId,
      timestamp: Date.now(),
      data: { lock },
    });

    return lock;
  }

  /**
   * Release a lock on a node
   */
  async releaseLock(
    session: CollaborationSession,
    nodeId: string,
    userId: string,
  ): Promise<void> {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      return;
    }

    const lock = sessionLocks.get(nodeId);
    if (!lock) {
      return;
    }

    // Verify user owns the lock
    if (lock.lockedBy !== userId) {
      throw new Error(
        `Cannot release lock on node ${nodeId}: locked by user ${lock.lockedBy}`,
      );
    }

    // Clean up lock
    this.cleanupLock(sessionId, nodeId);

    // Emit lock released event
    this.emitEvent(sessionId, {
      type: 'node_unlocked',
      userId,
      timestamp: Date.now(),
      data: { nodeId },
    });
  }

  /**
   * Force acquire a lock (admin only)
   */
  async forceLock(
    session: CollaborationSession,
    nodeId: string,
    userId: string,
    options?: { duration?: number; reason?: string },
  ): Promise<NodeLock> {
    const sessionId = session.id;

    // Release existing lock if any
    const sessionLocks = this.locks.get(sessionId);
    const existingLock = sessionLocks?.get(nodeId);
    if (existingLock) {
      this.cleanupLock(sessionId, nodeId);
      // Emit event about forced unlock
      this.emitEvent(sessionId, {
        type: 'node_unlocked',
        userId: existingLock.lockedBy,
        timestamp: Date.now(),
        data: { nodeId, forced: true, forcedBy: userId },
      });
    }

    // Acquire new lock
    return this.acquireLock(session, nodeId, userId, options);
  }

  /**
   * Renew an existing lock
   */
  private async renewLock(
    session: CollaborationSession,
    nodeId: string,
    userId: string,
    duration: number,
  ): Promise<NodeLock> {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      throw new Error(`No locks found for session ${sessionId}`);
    }

    const lock = sessionLocks.get(nodeId);
    if (!lock) {
      throw new Error(`No lock found for node ${nodeId}`);
    }

    if (lock.lockedBy !== userId) {
      throw new Error(`Cannot renew lock: owned by user ${lock.lockedBy}`);
    }

    // Update expiration time
    lock.expiresAt = Date.now() + duration;

    // Reset renewal timer
    this.setupRenewalTimer(sessionId, nodeId, userId, duration);

    return lock;
  }

  /**
   * Get all locks for a session
   */
  getLocks(session: CollaborationSession): NodeLock[] {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      return [];
    }

    // Filter out expired locks
    const now = Date.now();
    const activeLocks: NodeLock[] = [];

    for (const [nodeId, lock] of sessionLocks.entries()) {
      if (lock.expiresAt > now) {
        activeLocks.push(lock);
      } else {
        // Clean up expired lock
        this.cleanupLock(sessionId, nodeId);
      }
    }

    return activeLocks;
  }

  /**
   * Check if a node is locked
   */
  isLocked(session: CollaborationSession, nodeId: string): boolean {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      return false;
    }

    const lock = sessionLocks.get(nodeId);
    if (!lock) {
      return false;
    }

    // Check if lock is still valid
    if (lock.expiresAt <= Date.now()) {
      this.cleanupLock(sessionId, nodeId);
      return false;
    }

    return true;
  }

  /**
   * Get lock information for a node
   */
  getLock(session: CollaborationSession, nodeId: string): NodeLock | undefined {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      return undefined;
    }

    const lock = sessionLocks.get(nodeId);
    if (!lock) {
      return undefined;
    }

    // Check if lock is still valid
    if (lock.expiresAt <= Date.now()) {
      this.cleanupLock(sessionId, nodeId);
      return undefined;
    }

    return lock;
  }

  /**
   * Release all locks held by a user in a session
   */
  async releaseUserLocks(session: CollaborationSession, userId: string): Promise<void> {
    const sessionId = session.id;
    const sessionLocks = this.locks.get(sessionId);

    if (!sessionLocks) {
      return;
    }

    const nodesToRelease: string[] = [];

    // Find all locks held by user
    for (const [nodeId, lock] of sessionLocks.entries()) {
      if (lock.lockedBy === userId) {
        nodesToRelease.push(nodeId);
      }
    }

    // Release locks
    for (const nodeId of nodesToRelease) {
      await this.releaseLock(session, nodeId, userId);
    }
  }

  /**
   * Set up auto-renewal timer for a lock
   */
  private setupRenewalTimer(
    sessionId: string,
    nodeId: string,
    userId: string,
    duration: number,
  ): void {
    // Clear existing timer if any
    this.clearRenewalTimer(sessionId, nodeId);

    // Initialize timers map for session if needed
    if (!this.renewalTimers.has(sessionId)) {
      this.renewalTimers.set(sessionId, new Map());
    }

    const sessionTimers = this.renewalTimers.get(sessionId)!;

    // Calculate when to trigger renewal (before expiry)
    const renewalDelay = duration - this.config.renewalThreshold;

    if (renewalDelay > 0) {
      const timer = setTimeout(() => {
        // Check if lock still exists and is owned by user
        const sessionLocks = this.locks.get(sessionId);
        const lock = sessionLocks?.get(nodeId);

        if (lock && lock.lockedBy === userId && lock.expiresAt > Date.now()) {
          // Auto-renew the lock
          this.renewLock(
            { id: sessionId } as CollaborationSession,
            nodeId,
            userId,
            this.config.defaultLockDuration,
          ).catch((error) => {
            console.error(`Failed to auto-renew lock for node ${nodeId}:`, error);
            this.cleanupLock(sessionId, nodeId);
          });
        }
      }, renewalDelay);

      sessionTimers.set(nodeId, timer);
    }

    // Also set up expiration cleanup
    const expirationTimer = setTimeout(() => {
      const sessionLocks = this.locks.get(sessionId);
      const lock = sessionLocks?.get(nodeId);

      if (lock && lock.expiresAt <= Date.now()) {
        this.cleanupLock(sessionId, nodeId);
        this.emitEvent(sessionId, {
          type: 'node_unlocked',
          userId: lock.lockedBy,
          timestamp: Date.now(),
          data: { nodeId, reason: 'expired' },
        });
      }
    }, duration);

    // Store expiration timer (overwrite renewal timer since expiration is more important)
    sessionTimers.set(`${nodeId}:expiry`, expirationTimer);
  }

  /**
   * Clear renewal timer for a lock
   */
  private clearRenewalTimer(sessionId: string, nodeId: string): void {
    const sessionTimers = this.renewalTimers.get(sessionId);
    if (!sessionTimers) {
      return;
    }

    const timer = sessionTimers.get(nodeId);
    if (timer) {
      clearTimeout(timer);
      sessionTimers.delete(nodeId);
    }

    const expiryTimer = sessionTimers.get(`${nodeId}:expiry`);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      sessionTimers.delete(`${nodeId}:expiry`);
    }
  }

  /**
   * Clean up a lock and its associated resources
   */
  private cleanupLock(sessionId: string, nodeId: string): void {
    // Remove lock
    const sessionLocks = this.locks.get(sessionId);
    if (sessionLocks) {
      sessionLocks.delete(nodeId);

      // Clean up session locks map if empty
      if (sessionLocks.size === 0) {
        this.locks.delete(sessionId);
      }
    }

    // Clear timers
    this.clearRenewalTimer(sessionId, nodeId);

    // Clean up timers map if empty
    const sessionTimers = this.renewalTimers.get(sessionId);
    if (sessionTimers && sessionTimers.size === 0) {
      this.renewalTimers.delete(sessionId);
    }
  }

  /**
   * Emit collaboration event
   */
  private emitEvent(sessionId: string, event: CollaborationEvent): void {
    this.emit('event', sessionId, event);
    this.emit(`event:${sessionId}`, event);
    this.emit(`event:${sessionId}:${event.type}`, event);
  }

  /**
   * Destroy the lock manager and clean up all resources
   */
  async destroy(): Promise<void> {
    // Clear all timers
    for (const [sessionId, sessionTimers] of this.renewalTimers.entries()) {
      for (const timer of sessionTimers.values()) {
        clearTimeout(timer);
      }
      sessionTimers.clear();
    }
    this.renewalTimers.clear();

    // Clear all locks
    this.locks.clear();

    this.removeAllListeners();
  }
}
