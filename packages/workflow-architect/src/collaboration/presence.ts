/**
 * Presence Manager
 * Manages user presence tracking via Supabase Realtime
 */

import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import type { UserPresence, CollaborationSession, CollaborationEvent } from './types';
import type { Database } from '../supabase/types';

interface PresenceState {
  [userId: string]: UserPresence;
}

export class PresenceManager extends EventEmitter {
  private channels: Map<string, RealtimeChannel> = new Map();
  private presenceState: Map<string, PresenceState> = new Map();
  private cleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private colorAssignments: Map<string, string> = new Map();
  private readonly INACTIVE_TIMEOUT = 30000; // 30 seconds
  private readonly CLEANUP_INTERVAL = 5000; // 5 seconds
  private readonly USER_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
    '#F8B739',
    '#52B788',
    '#E76F51',
    '#2A9D8F',
  ];

  constructor(private supabase: SupabaseClient<Database>) {
    super();
    this.setMaxListeners(100); // Support many concurrent sessions
  }

  /**
   * Join a collaboration session
   */
  async join(
    session: CollaborationSession,
    user: Omit<UserPresence, 'color' | 'lastSeen' | 'isActive'>,
  ): Promise<void> {
    const sessionId = session.id;
    const userId = user.userId;

    // Assign unique color to user
    const color = this.assignColor(sessionId, userId);

    const userPresence: UserPresence = {
      ...user,
      color,
      lastSeen: Date.now(),
      isActive: true,
    };

    // Initialize presence state for session if needed
    if (!this.presenceState.has(sessionId)) {
      this.presenceState.set(sessionId, {});
    }

    // Update presence state
    const state = this.presenceState.get(sessionId)!;
    state[userId] = userPresence;

    // Set up Realtime channel if not exists
    if (!this.channels.has(sessionId)) {
      await this.setupChannel(sessionId);
    }

    // Track presence in Realtime
    const channel = this.channels.get(sessionId)!;
    await channel.track({
      user_id: userId,
      user_name: user.userName,
      avatar_url: user.avatarUrl,
      color,
      last_seen: Date.now(),
      is_active: true,
      current_node: user.currentNode,
      cursor_position: user.cursorPosition,
    });

    // Start cleanup interval for this session if not exists
    if (!this.cleanupIntervals.has(sessionId)) {
      const interval = setInterval(() => {
        this.cleanupInactiveUsers(sessionId);
      }, this.CLEANUP_INTERVAL);
      this.cleanupIntervals.set(sessionId, interval);
    }

    // Emit user joined event
    this.emitEvent(sessionId, {
      type: 'user_joined',
      userId,
      timestamp: Date.now(),
      data: { user: userPresence },
    });
  }

  /**
   * Leave a collaboration session
   */
  async leave(session: CollaborationSession, userId: string): Promise<void> {
    const sessionId = session.id;
    const state = this.presenceState.get(sessionId);

    if (!state || !state[userId]) {
      return;
    }

    // Remove from presence state
    delete state[userId];

    // Untrack from Realtime
    const channel = this.channels.get(sessionId);
    if (channel) {
      await channel.untrack();
    }

    // Emit user left event
    this.emitEvent(sessionId, {
      type: 'user_left',
      userId,
      timestamp: Date.now(),
      data: {},
    });

    // Clean up if no more participants
    if (Object.keys(state).length === 0) {
      await this.cleanupSession(sessionId);
    }
  }

  /**
   * Update presence data for a user
   */
  async updatePresence(
    session: CollaborationSession,
    userId: string,
    data: Partial<Omit<UserPresence, 'userId' | 'userName' | 'color'>>,
  ): Promise<void> {
    const sessionId = session.id;
    const state = this.presenceState.get(sessionId);

    if (!state || !state[userId]) {
      throw new Error(`User ${userId} not in session ${sessionId}`);
    }

    // Update presence state
    const userPresence = state[userId];
    Object.assign(userPresence, {
      ...data,
      lastSeen: Date.now(),
      isActive: true,
    });

    // Update Realtime presence
    const channel = this.channels.get(sessionId);
    if (channel) {
      await channel.track({
        user_id: userId,
        user_name: userPresence.userName,
        avatar_url: userPresence.avatarUrl,
        color: userPresence.color,
        last_seen: Date.now(),
        is_active: true,
        current_node: userPresence.currentNode,
        cursor_position: userPresence.cursorPosition,
      });
    }

    // Emit appropriate events
    if (data.cursorPosition) {
      this.emitEvent(sessionId, {
        type: 'cursor_moved',
        userId,
        timestamp: Date.now(),
        data: { cursorPosition: data.cursorPosition },
      });
    }

    if (data.currentNode !== undefined) {
      this.emitEvent(sessionId, {
        type: 'node_selected',
        userId,
        timestamp: Date.now(),
        data: { nodeId: data.currentNode },
      });
    }
  }

  /**
   * Get all active users in a session
   */
  getActiveUsers(sessionId: string): UserPresence[] {
    const state = this.presenceState.get(sessionId);
    if (!state) {
      return [];
    }

    return Object.values(state).filter((user) => user.isActive);
  }

  /**
   * Get presence data for a specific user
   */
  getUserPresence(sessionId: string, userId: string): UserPresence | undefined {
    const state = this.presenceState.get(sessionId);
    return state?.[userId];
  }

  /**
   * Set up Realtime channel for a session
   */
  private async setupChannel(sessionId: string): Promise<void> {
    const channel = this.supabase.channel(`collaboration:${sessionId}`, {
      config: {
        presence: {
          key: 'user_id',
        },
      },
    });

    // Listen for presence sync
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      this.syncPresenceState(sessionId, presenceState);
    });

    // Listen for presence joins
    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      this.handlePresenceJoin(sessionId, newPresences);
    });

    // Listen for presence leaves
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      this.handlePresenceLeave(sessionId, leftPresences);
    });

    // Subscribe to channel
    await channel.subscribe();

    this.channels.set(sessionId, channel);
  }

  /**
   * Sync presence state from Realtime
   */
  private syncPresenceState(sessionId: string, presenceState: Record<string, unknown[]>): void {
    const state = this.presenceState.get(sessionId);
    if (!state) {
      return;
    }

    // Update from Realtime state
    for (const [userId, presences] of Object.entries(presenceState)) {
      if (presences.length > 0) {
        const presence = presences[0] as Record<string, unknown>;
        state[userId] = {
          userId,
          userName: presence.user_name as string,
          avatarUrl: presence.avatar_url as string | undefined,
          color: presence.color as string,
          lastSeen: presence.last_seen as number,
          isActive: presence.is_active as boolean,
          currentNode: presence.current_node as string | undefined,
          cursorPosition: presence.cursor_position as { x: number; y: number } | undefined,
        };
      }
    }
  }

  /**
   * Handle presence join events
   */
  private handlePresenceJoin(sessionId: string, newPresences: Record<string, unknown>[]): void {
    for (const presence of newPresences) {
      const userId = (presence as Record<string, unknown>).user_id as string;
      this.emitEvent(sessionId, {
        type: 'user_joined',
        userId,
        timestamp: Date.now(),
        data: { presence },
      });
    }
  }

  /**
   * Handle presence leave events
   */
  private handlePresenceLeave(sessionId: string, leftPresences: Record<string, unknown>[]): void {
    for (const presence of leftPresences) {
      const userId = (presence as Record<string, unknown>).user_id as string;
      this.emitEvent(sessionId, {
        type: 'user_left',
        userId,
        timestamp: Date.now(),
        data: { presence },
      });
    }
  }

  /**
   * Clean up inactive users (30s timeout)
   */
  private cleanupInactiveUsers(sessionId: string): void {
    const state = this.presenceState.get(sessionId);
    if (!state) {
      return;
    }

    const now = Date.now();
    const inactiveUsers: string[] = [];

    for (const [userId, user] of Object.entries(state)) {
      if (now - user.lastSeen > this.INACTIVE_TIMEOUT) {
        user.isActive = false;
        inactiveUsers.push(userId);
      }
    }

    // Emit events for inactive users
    for (const userId of inactiveUsers) {
      this.emitEvent(sessionId, {
        type: 'user_left',
        userId,
        timestamp: Date.now(),
        data: { reason: 'timeout' },
      });
    }
  }

  /**
   * Assign a unique color to a user
   */
  private assignColor(sessionId: string, userId: string): string {
    const key = `${sessionId}:${userId}`;

    // Return existing color if already assigned
    if (this.colorAssignments.has(key)) {
      return this.colorAssignments.get(key)!;
    }

    // Get colors already in use for this session
    const state = this.presenceState.get(sessionId) || {};
    const usedColors = new Set(Object.values(state).map((user) => user.color));

    // Find first available color
    let color = this.USER_COLORS[0];
    for (const availableColor of this.USER_COLORS) {
      if (!usedColors.has(availableColor)) {
        color = availableColor;
        break;
      }
    }

    // If all colors are used, generate a random one
    if (usedColors.size >= this.USER_COLORS.length) {
      color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
    }

    this.colorAssignments.set(key, color);
    return color;
  }

  /**
   * Clean up session resources
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    // Remove channel
    const channel = this.channels.get(sessionId);
    if (channel) {
      await channel.unsubscribe();
      this.channels.delete(sessionId);
    }

    // Clear cleanup interval
    const interval = this.cleanupIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.cleanupIntervals.delete(sessionId);
    }

    // Clear presence state
    this.presenceState.delete(sessionId);

    // Clear color assignments for this session
    const keysToDelete: string[] = [];
    for (const key of this.colorAssignments.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.colorAssignments.delete(key);
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
   * Destroy the presence manager and clean up all resources
   */
  async destroy(): Promise<void> {
    // Clean up all sessions
    const sessionIds = Array.from(this.channels.keys());
    for (const sessionId of sessionIds) {
      await this.cleanupSession(sessionId);
    }

    this.removeAllListeners();
  }
}
