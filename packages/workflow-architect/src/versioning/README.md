# Workflow Version Control System

A comprehensive version control system for n8n workflows with Git-like capabilities including branching, merging, and rollback.

## Overview

This module provides production-ready version control for workflow definitions, enabling teams to:

- Track all changes to workflows with full audit history
- Generate detailed diffs between any two versions
- Perform three-way merges with automatic conflict detection
- Safely rollback to previous versions with validation
- Store versions in-memory or persist to Supabase

## Components

### 1. Types (`types.ts`)

Core type definitions for the version control system:

- `WorkflowVersion` - Complete version snapshot with metadata
- `VersionChange` - Granular change tracking
- `WorkflowBranch` - Branch metadata for parallel development
- `VersionDiff` - Comprehensive diff between versions
- `MergeConflict` - Conflict detection and resolution
- `MergeResult` - Merge operation outcome
- `RollbackPreview` - Preview of rollback effects

### 2. VersionStore (`store.ts`)

In-memory and Supabase-backed storage for workflow versions.

**Key Features:**
- Deterministic hash generation (same workflow = same hash)
- Automatic change detection between versions
- Dual storage: in-memory cache + optional Supabase persistence
- Version history with pagination

**API:**

```typescript
import { VersionStore } from '@/versioning';

const store = new VersionStore({
  supabase: supabaseClient,  // optional
  persistToSupabase: true     // optional
});

// Create new version
const version = await store.createVersion(
  workflowId,
  workflow,
  'Added authentication',
  'alice@example.com'
);

// Get specific version
const v1 = await store.getVersion(workflowId, 1);

// Get version history
const history = await store.getHistory(workflowId, 10);

// Get latest version
const latest = await store.getLatestVersion(workflowId);

// Delete version
await store.deleteVersion(workflowId, 3);
```

### 3. WorkflowDiff (`diff.ts`)

Generate detailed diffs between workflow versions.

**Key Features:**
- Complete diff generation with node, connection, and settings changes
- Granular change tracking at parameter level
- Human-readable diff summaries
- Separate diffing for nodes, connections, and parameters

**API:**

```typescript
import { WorkflowDiff } from '@/versioning';

const differ = new WorkflowDiff();

// Generate complete diff
const diff = differ.diff(version1, version2);

console.log(`Nodes added: ${diff.nodesAdded.length}`);
console.log(`Nodes removed: ${diff.nodesRemoved.length}`);
console.log(`Nodes modified: ${diff.nodesModified.length}`);
console.log(`Connections added: ${diff.connectionsAdded}`);
console.log(`Connections removed: ${diff.connectionsRemoved}`);

// Get human-readable summary
const summary = differ.summarizeDiff(diff);
console.log(summary);
```

### 4. WorkflowMerge (`merge.ts`)

Three-way merge with automatic conflict detection.

**Key Features:**
- Three-way merge algorithm (base, ours, theirs)
- Automatic conflict detection
- Manual conflict resolution support
- Safe merge validation

**API:**

```typescript
import { WorkflowMerge } from '@/versioning';

const merger = new WorkflowMerge();

// Check if auto-merge is possible
const canAutoMerge = merger.canAutoMerge(base, ours, theirs);

if (canAutoMerge) {
  // Perform automatic merge
  const result = merger.merge(base, ours, theirs);
  if (result.success) {
    const mergedWorkflow = result.merged;
  }
} else {
  // Detect conflicts
  const conflicts = merger.detectConflicts(base, ours, theirs);

  // Resolve conflicts manually
  const resolutions = new Map();
  resolutions.set('nodes.abc123', {
    resolution: 'ours',
  });

  const result = merger.mergeWithResolutions(base, ours, theirs, resolutions);
}
```

### 5. RollbackManager (`rollback.ts`)

Safe rollback to previous versions with validation and preview.

**Key Features:**
- Safe rollback with validation
- Preview changes before rollback
- Rollback creates new version (preserves history)
- Undo-like functionality (rollback to previous)
- Comparison between current and target versions

**API:**

```typescript
import { RollbackManager, VersionStore, WorkflowDiff } from '@/versioning';

const store = new VersionStore();
const differ = new WorkflowDiff();
const rollbackMgr = new RollbackManager(store, differ);

// Preview rollback
const preview = await rollbackMgr.getRollbackPreview(workflowId, targetVersion);
console.log(`Can rollback: ${preview.canRollback}`);
console.log(`Affected nodes: ${preview.affectedNodes.length}`);
console.log(`Warnings: ${preview.warnings.join(', ')}`);

// Check if rollback is safe
const canRollback = await rollbackMgr.canRollback(workflowId, targetVersion);

if (canRollback) {
  // Perform rollback
  const rolledBack = await rollbackMgr.rollbackTo(workflowId, targetVersion, {
    createRollbackVersion: true,  // Create audit trail
    validateBeforeRollback: true, // Validate before rollback
    author: 'alice@example.com'
  });
}

// Quick undo (rollback to previous version)
const undone = await rollbackMgr.rollbackToPrevious(workflowId);

// Compare current with specific version
const comparison = await rollbackMgr.compareWithVersion(workflowId, 5);
console.log(comparison.summary);
```

## Implementation Details

### Deterministic Hash Generation

Hashes are generated using SHA-256 on normalized workflow JSON:
- Volatile fields (id, createdAt, updatedAt) are excluded
- Object keys are sorted alphabetically
- Same workflow structure always produces the same hash

This ensures version integrity and enables deduplication.

### Change Detection

Changes are detected at multiple levels:

1. **Workflow Level**: Name, settings, active status
2. **Node Level**: Added, removed, modified nodes
3. **Connection Level**: Added, removed connections
4. **Parameter Level**: Individual parameter changes

Each change includes:
- Type (node_added, node_removed, node_modified, etc.)
- JSON path to the change
- Old value (if applicable)
- New value (if applicable)

### Three-Way Merge Algorithm

The merge algorithm follows Git's three-way merge:

1. **Base**: Common ancestor version
2. **Ours**: Current branch version
3. **Theirs**: Version to merge in

**Conflict Detection Rules:**
- Both modified differently → Conflict
- Deleted in one, modified in other → Conflict
- Added in both with different content → Conflict

**Auto-Merge Rules:**
- Only ours changed → Use ours
- Only theirs changed → Use theirs
- Both changed identically → Use either
- No conflicts detected → Merge succeeds

### Rollback Safety

Rollbacks are validated before execution:

1. **Version Exists**: Target version must exist
2. **Valid Workflow**: Target workflow passes validation
3. **Structure Integrity**: All node references are valid
4. **Connection Integrity**: All connections reference existing nodes

Rollbacks create new versions by default, preserving complete audit history.

## Storage Options

### In-Memory Storage

Default storage mode. Fast but not persistent across restarts.

```typescript
const store = new VersionStore();
```

### Supabase Persistence

Enable Supabase persistence for production use:

```typescript
import { getSupabaseClient } from '@/supabase/client';

const store = new VersionStore({
  supabase: getSupabaseClient(),
  persistToSupabase: true
});
```

**Required Supabase Schema:**

```sql
CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  commit_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  snapshot JSONB NOT NULL,
  changes JSONB NOT NULL,
  UNIQUE(workflow_id, version)
);

CREATE INDEX idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
CREATE INDEX idx_workflow_versions_version ON workflow_versions(workflow_id, version DESC);
```

## Usage Examples

### Complete Workflow Versioning Flow

```typescript
import {
  VersionStore,
  WorkflowDiff,
  WorkflowMerge,
  RollbackManager
} from '@/versioning';

// Initialize
const store = new VersionStore();
const differ = new WorkflowDiff();
const merger = new WorkflowMerge();
const rollbackMgr = new RollbackManager(store, differ);

// Create initial version
const v1 = await store.createVersion(
  'workflow-123',
  initialWorkflow,
  'Initial version',
  'alice@example.com'
);

// Make changes and create v2
const v2 = await store.createVersion(
  'workflow-123',
  modifiedWorkflow,
  'Added HTTP node',
  'alice@example.com'
);

// Generate diff
const diff = differ.diff(v1, v2);
console.log(differ.summarizeDiff(diff));

// Create a branch (v3) from v1
const v3 = await store.createVersion(
  'workflow-123',
  branchWorkflow,
  'Added database integration',
  'bob@example.com'
);

// Merge v2 and v3
const mergeResult = merger.merge(v1.snapshot, v2.snapshot, v3.snapshot);
if (mergeResult.success) {
  const v4 = await store.createVersion(
    'workflow-123',
    mergeResult.merged,
    'Merged HTTP and database changes',
    'system'
  );
}

// Rollback if needed
if (somethingWentWrong) {
  const preview = await rollbackMgr.getRollbackPreview('workflow-123', 2);
  if (preview.canRollback) {
    await rollbackMgr.rollbackTo('workflow-123', 2);
  }
}
```

## Success Criteria

✅ **Version hashes are deterministic** - Same workflow produces same hash
✅ **Diff algorithm detects all changes** - Node, connection, and parameter changes
✅ **Merge handles non-conflicting changes** - Automatic merge when possible
✅ **Rollback creates audit trail** - History is preserved, not deleted
✅ **Type-safe implementation** - Full TypeScript support
✅ **Production-ready** - Error handling, validation, and edge cases covered

## Performance Considerations

- **In-Memory Cache**: First-level cache for fast access
- **Lazy Loading**: Supabase queries only when needed
- **Deterministic Hashing**: O(n) where n is workflow size
- **Diff Generation**: O(n) where n is number of nodes + connections
- **Merge Complexity**: O(n) for conflict detection

## Future Enhancements

- Branch management (create, delete, list branches)
- Tag support (mark important versions)
- Diff visualization in UI
- Conflict resolution UI
- Partial rollbacks (rollback specific nodes)
- Version compression (store diffs instead of full snapshots)
- Multi-workflow merge (merge changes from multiple workflows)
