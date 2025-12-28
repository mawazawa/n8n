# Collaborative Editing System

Production-ready collaborative editing system for workflow-architect with real-time presence, optimistic locking, operational transform, and in-workflow comments.

## Features

- **Real-time Presence**: Track active users with <100ms latency via Supabase Realtime
- **Optimistic Locking**: Atomic lock acquisition with auto-renewal and conflict detection
- **Operational Transform**: Concurrent edit resolution with version vectors
- **In-workflow Comments**: Threading, @mentions, and notification hooks
- **Change Attribution**: All changes tracked to users for audit and collaboration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Collaboration System                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Presence   │  │   Locking    │  │     Sync     │     │
│  │   Manager    │  │   Manager    │  │   (OT)       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            │                                │
│                   ┌────────▼────────┐                       │
│                   │  Supabase       │                       │
│                   │  Realtime       │                       │
│                   └─────────────────┘                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             Comment Manager                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### 1. Initialize Managers

```typescript
import { getSupabaseClient } from '../supabase/client';
import { PresenceManager, LockManager, CollaborationSync, CommentManager } from './collaboration';

const supabase = getSupabaseClient();

// Initialize managers
const presenceManager = new PresenceManager(supabase);
const lockManager = new LockManager({
  defaultLockDuration: 30000,
  renewalThreshold: 5000,
  maxLockDuration: 300000,
});
const sync = new CollaborationSync({
  mergeStrategy: 'last_write_wins',
});
const commentManager = new CommentManager(supabase);
```

### 2. User Presence Tracking

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { CollaborationSession } from './collaboration';

// Create session
const session: CollaborationSession = {
  id: uuidv4(),
  workflowId: 'workflow-123',
  createdAt: Date.now(),
  participants: [],
  locks: [],
  version: 0,
};

// Join session
await presenceManager.join(session, {
  userId: 'user-456',
  userName: 'Alice',
  avatarUrl: 'https://example.com/avatar.jpg',
  currentNode: 'node-789',
});

// Update presence
await presenceManager.updatePresence(session, 'user-456', {
  cursorPosition: { x: 100, y: 200 },
  currentNode: 'node-abc',
});

// Listen for presence events
presenceManager.on('event', (sessionId, event) => {
  console.log('Presence event:', event.type, event.userId);
});

// Get active users
const activeUsers = presenceManager.getActiveUsers(session.id);
console.log('Active users:', activeUsers);

// Leave session
await presenceManager.leave(session, 'user-456');
```

### 3. Node Locking

```typescript
// Acquire lock
try {
  const lock = await lockManager.acquireLock(session, 'node-789', 'user-456', {
    duration: 30000,
    reason: 'Editing parameters',
  });
  console.log('Lock acquired:', lock);
} catch (error) {
  console.error('Failed to acquire lock:', error.message);
}

// Check if locked
const isLocked = lockManager.isLocked(session, 'node-789');
console.log('Node locked:', isLocked);

// Get lock info
const lock = lockManager.getLock(session, 'node-789');
if (lock) {
  console.log('Locked by:', lock.lockedBy, 'expires at:', new Date(lock.expiresAt));
}

// Release lock
await lockManager.releaseLock(session, 'node-789', 'user-456');

// Force lock (admin only)
const forcedLock = await lockManager.forceLock(session, 'node-789', 'admin-user', {
  reason: 'Emergency edit',
});

// Listen for lock events
lockManager.on('event', (sessionId, event) => {
  if (event.type === 'node_locked') {
    console.log('Node locked:', event.data.lock);
  } else if (event.type === 'node_unlocked') {
    console.log('Node unlocked:', event.data.nodeId);
  }
});

// Get all locks
const allLocks = lockManager.getLocks(session);
console.log('Active locks:', allLocks);

// Release all locks for a user (on disconnect)
await lockManager.releaseUserLocks(session, 'user-456');
```

### 4. Operational Transform Sync

```typescript
import type { Operation } from './collaboration';

// Create operation
const operation: Operation = {
  id: uuidv4(),
  type: 'update',
  userId: 'user-456',
  timestamp: Date.now(),
  version: 0,
  nodeId: 'node-789',
  path: ['parameters', 'value'],
  value: 'new value',
  oldValue: 'old value',
};

// Apply operation
const result = await sync.applyOperation(session, operation);
console.log('Operation applied:', result.operation);
console.log('Transformed:', result.transformed);
console.log('Conflicts:', result.conflicts);

// Listen for sync events
sync.on('event', (sessionId, event) => {
  if (event.type === 'workflow_changed') {
    console.log('Workflow changed:', event.data.operation);
    if (event.data.conflicts.length > 0) {
      console.log('Conflicts detected:', event.data.conflicts);
    }
  }
});

// Resolve conflicts with local state
import type { LocalState } from './collaboration';

const localState: LocalState = {
  data: { /* current workflow data */ },
  versionVector: { 'user-456': 5, 'user-789': 3 },
  pendingOperations: [],
};

const resolveResult = sync.resolveConflict(operation, localState);
console.log('Conflict resolution:', resolveResult);

// Get version vector
const versionVector = sync.getVersionVector(session.id);
console.log('Version vector:', versionVector);

// Get operation history
const history = sync.getHistory(session.id, Date.now() - 3600000); // Last hour
console.log('Recent operations:', history);
```

### 5. Comments and Mentions

```typescript
// Add comment to workflow
const comment = await commentManager.addComment('workflow-123', {
  nodeId: 'node-789',
  content: 'Hey @bob, can you review this node configuration?',
  author: 'alice',
  resolved: false,
});
console.log('Comment added:', comment);

// Reply to comment
const reply = await commentManager.replyTo(comment.id, {
  content: '@alice looks good to me!',
  author: 'bob',
  resolved: false,
});
console.log('Reply added:', reply);

// Listen for notifications
commentManager.on('notification', (notification) => {
  console.log('Notification for:', notification.mentionedUserId);
  console.log('Mentioned by:', notification.mentionedBy);
  console.log('Comment:', notification.content);
  // Send email, push notification, etc.
});

// Get comments for workflow
const allComments = commentManager.getComments('workflow-123');
console.log('All comments:', allComments);

// Get comments for specific node
const nodeComments = commentManager.getComments('workflow-123', 'node-789');
console.log('Node comments:', nodeComments);

// Update comment
await commentManager.updateComment(comment.id, {
  content: 'Updated content with @charlie',
  resolved: false,
});

// Resolve comment
await commentManager.resolveComment(comment.id);

// Search comments
const unresolvedComments = commentManager.searchComments({
  workflowId: 'workflow-123',
  resolved: false,
});
console.log('Unresolved comments:', unresolvedComments);

const mentionsMe = commentManager.searchComments({
  workflowId: 'workflow-123',
  mentionsUser: 'alice',
});
console.log('Comments mentioning me:', mentionsMe);

// Get unresolved count
const unresolvedCount = commentManager.getUnresolvedCount('workflow-123');
console.log('Unresolved count:', unresolvedCount);

// Delete comment
await commentManager.deleteComment(comment.id);

// Load comments from database
await commentManager.loadComments('workflow-123');
```

## Event System

All managers extend EventEmitter and emit standardized events:

### Presence Events
- `user_joined`: User joined the session
- `user_left`: User left the session
- `cursor_moved`: User moved cursor
- `node_selected`: User selected a node

### Lock Events
- `node_locked`: Node was locked
- `node_unlocked`: Node was unlocked

### Sync Events
- `workflow_changed`: Workflow was modified

### Comment Events
- `comment:added`: New comment added
- `comment:reply`: Reply added to comment
- `comment:updated`: Comment updated
- `comment:resolved`: Comment resolved
- `comment:deleted`: Comment deleted
- `notification`: Mention notification

## Success Criteria

✅ **Presence updates within 100ms latency**
- Uses Supabase Realtime for low-latency updates
- Auto-cleanup of inactive users after 30s

✅ **Lock acquisition is atomic (no race conditions)**
- Atomic check-and-set pattern
- Expiration with auto-renewal
- Force lock capability for admins

✅ **Comments support @mentions with notification hooks**
- Automatic mention parsing from content
- Event-based notification system
- Threaded replies with nested mentions

✅ **All changes attributed to users**
- Every operation includes userId and timestamp
- Version vectors for causality tracking
- Conflict detection and resolution

## Performance

- **Presence**: <100ms latency via Supabase Realtime channels
- **Locking**: Atomic operations with in-memory cache
- **Sync**: O(n) transformation where n = concurrent operations
- **Comments**: In-memory cache with async database persistence

## Database Schema (Supabase)

```sql
-- Comments table (optional - falls back to in-memory if not exists)
CREATE TABLE IF NOT EXISTS workflow_comments (
  id UUID PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  node_id TEXT,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  mentions TEXT[],
  replies JSONB
);

CREATE INDEX idx_workflow_comments_workflow ON workflow_comments(workflow_id);
CREATE INDEX idx_workflow_comments_node ON workflow_comments(node_id);
CREATE INDEX idx_workflow_comments_author ON workflow_comments(author);
```

## Cleanup

Always destroy managers when done:

```typescript
await presenceManager.destroy();
await lockManager.destroy();
await sync.destroy();
await commentManager.destroy();
```

## Testing

The system is designed to be testable with mock Supabase clients:

```typescript
import { createClient } from '@supabase/supabase-js';

// Use test Supabase instance
const testSupabase = createClient('http://localhost:54321', 'test-anon-key');
const testPresence = new PresenceManager(testSupabase);
// ... run tests
```
