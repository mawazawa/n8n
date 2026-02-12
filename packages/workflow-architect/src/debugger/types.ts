/**
 * Debugger Type Definitions
 * Core types for advanced debugging tools
 */

import { z } from 'zod';

/**
 * Breakpoint Types
 */
export const BreakpointTypeEnum = z.enum([
  'NODE_ENTRY',
  'NODE_EXIT',
  'CONDITION',
  'ERROR',
]);

export type BreakpointType = z.infer<typeof BreakpointTypeEnum>;

export const BreakpointSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  type: BreakpointTypeEnum,
  condition: z.string().optional(),
  enabled: z.boolean(),
  hitCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Breakpoint = z.infer<typeof BreakpointSchema>;

export const CreateBreakpointInputSchema = z.object({
  nodeId: z.string().describe('The ID of the node to set breakpoint on'),
  type: BreakpointTypeEnum.default('NODE_ENTRY'),
  condition: z.string().optional().describe('Optional condition expression (e.g., "$.data.amount > 100")'),
  enabled: z.boolean().default(true),
});

export type CreateBreakpointInput = z.infer<typeof CreateBreakpointInputSchema>;

/**
 * Watch Expressions
 */
export const WatchExpressionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  expression: z.string(),
  value: z.unknown().optional(),
  error: z.string().optional(),
  nodeId: z.string().optional(),
  autoRefresh: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WatchExpression = z.infer<typeof WatchExpressionSchema>;

export const CreateWatchInputSchema = z.object({
  expression: z.string().describe('JSONPath or expression to watch (e.g., "$.data[*].email")'),
  nodeId: z.string().optional().describe('Optional node ID to scope the watch to'),
  autoRefresh: z.boolean().default(true).describe('Auto-refresh on each step'),
});

export type CreateWatchInput = z.infer<typeof CreateWatchInputSchema>;

/**
 * Stack Frames
 */
export const StackFrameSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  nodeType: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
  duration: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type StackFrame = z.infer<typeof StackFrameSchema>;

/**
 * Debug Session
 */
export const DebugSessionStatusEnum = z.enum([
  'CREATED',
  'RUNNING',
  'PAUSED',
  'STOPPED',
  'COMPLETED',
  'ERROR',
]);

export type DebugSessionStatus = z.infer<typeof DebugSessionStatusEnum>;

export const DebugSessionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  executionId: z.string().optional(),
  status: DebugSessionStatusEnum,
  breakpoints: z.array(BreakpointSchema),
  stack: z.array(StackFrameSchema),
  currentNodeId: z.string().optional(),
  watches: z.array(WatchExpressionSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type DebugSession = z.infer<typeof DebugSessionSchema>;

/**
 * Step Results
 */
export const StepResultSchema = z.object({
  sessionId: z.string(),
  currentNodeId: z.string(),
  previousNodeId: z.string().optional(),
  frame: StackFrameSchema,
  breakpointHit: BreakpointSchema.optional(),
  completed: z.boolean(),
});

export type StepResult = z.infer<typeof StepResultSchema>;

/**
 * Data Inspection
 */
export const DataTypeEnum = z.enum([
  'string',
  'number',
  'boolean',
  'null',
  'undefined',
  'object',
  'array',
  'function',
  'date',
  'regexp',
  'error',
  'buffer',
  'json',
  'xml',
  'html',
  'binary',
  'unknown',
]);

export type DataType = z.infer<typeof DataTypeEnum>;

export const InspectionResultSchema = z.object({
  type: DataTypeEnum,
  value: z.unknown(),
  size: z.number().optional(),
  truncated: z.boolean().default(false),
  preview: z.string(),
  formatted: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  children: z.array(z.lazy(() => InspectionResultSchema)).optional(),
});

export type InspectionResult = z.infer<typeof InspectionResultSchema>;

/**
 * Timeline
 */
export const TimelineEventSchema = z.object({
  nodeId: z.string(),
  nodeName: z.string(),
  nodeType: z.string(),
  startTime: z.number(),
  endTime: z.number().optional(),
  duration: z.number().optional(),
  status: z.enum(['running', 'completed', 'error', 'waiting']),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  parallel: z.boolean().default(false),
  branchId: z.string().optional(),
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const TimelineSchema = z.object({
  executionId: z.string(),
  events: z.array(TimelineEventSchema),
  totalDuration: z.number(),
  startTime: z.number(),
  endTime: z.number().optional(),
  parallelBranches: z.array(z.string()).optional(),
});

export type Timeline = z.infer<typeof TimelineSchema>;

/**
 * Profiling
 */
export const ProfileMetricsSchema = z.object({
  nodeId: z.string(),
  nodeName: z.string(),
  executionTime: z.number(),
  cpuTime: z.number().optional(),
  memoryUsed: z.number().optional(),
  memoryPeak: z.number().optional(),
  callCount: z.number().default(1),
});

export type ProfileMetrics = z.infer<typeof ProfileMetricsSchema>;

export const FlameGraphNodeSchema = z.object({
  name: z.string(),
  value: z.number(),
  children: z.array(z.lazy(() => FlameGraphNodeSchema)).optional(),
});

export type FlameGraphNode = z.infer<typeof FlameGraphNodeSchema>;

export const ProfileResultSchema = z.object({
  sessionId: z.string(),
  totalDuration: z.number(),
  totalMemory: z.number(),
  metrics: z.array(ProfileMetricsSchema),
  flameGraph: FlameGraphNodeSchema.optional(),
  hotspots: z.array(z.object({
    nodeId: z.string(),
    metric: z.string(),
    value: z.number(),
  })).optional(),
});

export type ProfileResult = z.infer<typeof ProfileResultSchema>;

/**
 * Memory Analysis
 */
export const MemorySnapshotSchema = z.object({
  nodeId: z.string(),
  timestamp: z.number(),
  heapUsed: z.number(),
  heapTotal: z.number(),
  external: z.number(),
  dataSize: z.number(),
});

export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

export const MemoryLeakSchema = z.object({
  nodeId: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  growthRate: z.number(),
  recommendation: z.string(),
});

export type MemoryLeak = z.infer<typeof MemoryLeakSchema>;

export const MemoryReportSchema = z.object({
  sessionId: z.string(),
  snapshots: z.array(MemorySnapshotSchema),
  totalDataSize: z.number(),
  peakMemory: z.number(),
  leaks: z.array(MemoryLeakSchema).optional(),
  optimization: z.array(z.string()).optional(),
});

export type MemoryReport = z.infer<typeof MemoryReportSchema>;

/**
 * Network Inspection
 */
export const NetworkRequestSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  status: z.number().optional(),
  statusText: z.string().optional(),
  responseHeaders: z.record(z.string()).optional(),
  responseBody: z.unknown().optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  duration: z.number().optional(),
  size: z.number().optional(),
  error: z.string().optional(),
  timing: z.object({
    dns: z.number().optional(),
    tcp: z.number().optional(),
    tls: z.number().optional(),
    request: z.number().optional(),
    wait: z.number().optional(),
    download: z.number().optional(),
  }).optional(),
});

export type NetworkRequest = z.infer<typeof NetworkRequestSchema>;

/**
 * Diff Visualization
 */
export const DiffChangeTypeEnum = z.enum(['add', 'remove', 'modify', 'none']);

export type DiffChangeType = z.infer<typeof DiffChangeTypeEnum>;

export const DiffChangeSchema = z.object({
  type: DiffChangeTypeEnum,
  path: z.string(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  line: z.number().optional(),
});

export type DiffChange = z.infer<typeof DiffChangeSchema>;

export const DiffSchema = z.object({
  mode: z.enum(['side-by-side', 'inline']),
  changes: z.array(DiffChangeSchema),
  summary: z.object({
    additions: z.number(),
    deletions: z.number(),
    modifications: z.number(),
  }),
  formatted: z.string().optional(),
});

export type Diff = z.infer<typeof DiffSchema>;

/**
 * Replay
 */
export const ReplaySessionSchema = z.object({
  id: z.string(),
  originalExecutionId: z.string(),
  startNodeId: z.string(),
  modifications: z.record(z.unknown()),
  status: z.enum(['created', 'running', 'completed', 'error']),
  createdAt: z.string(),
});

export type ReplaySession = z.infer<typeof ReplaySessionSchema>;

export const ExecutionResultSchema = z.object({
  executionId: z.string(),
  status: z.enum(['success', 'error', 'running', 'waiting']),
  data: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

/**
 * Export
 */
export const ExportFormatEnum = z.enum(['json', 'html']);

export type ExportFormat = z.infer<typeof ExportFormatEnum>;

export const ExportedSessionSchema = z.object({
  session: DebugSessionSchema,
  timeline: TimelineSchema.optional(),
  profile: ProfileResultSchema.optional(),
  memory: MemoryReportSchema.optional(),
  network: z.array(NetworkRequestSchema).optional(),
  format: ExportFormatEnum,
  exportedAt: z.string(),
});

export type ExportedSession = z.infer<typeof ExportedSessionSchema>;

/**
 * WebSocket Debug Commands
 */
export const DebugCommandTypeEnum = z.enum([
  'PAUSE',
  'RESUME',
  'STEP_INTO',
  'STEP_OVER',
  'STEP_OUT',
  'ADD_BREAKPOINT',
  'REMOVE_BREAKPOINT',
  'ENABLE_BREAKPOINT',
  'DISABLE_BREAKPOINT',
  'ADD_WATCH',
  'REMOVE_WATCH',
  'INSPECT_DATA',
  'GET_STACK',
  'GET_SESSION',
]);

export type DebugCommandType = z.infer<typeof DebugCommandTypeEnum>;

export const DebugCommandSchema = z.object({
  type: DebugCommandTypeEnum,
  sessionId: z.string(),
  payload: z.unknown().optional(),
});

export type DebugCommand = z.infer<typeof DebugCommandSchema>;

export const DebugEventTypeEnum = z.enum([
  'SESSION_CREATED',
  'SESSION_UPDATED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'SESSION_STOPPED',
  'BREAKPOINT_HIT',
  'STEP_COMPLETED',
  'WATCH_UPDATED',
  'ERROR',
]);

export type DebugEventType = z.infer<typeof DebugEventTypeEnum>;

export const DebugEventSchema = z.object({
  type: DebugEventTypeEnum,
  sessionId: z.string(),
  timestamp: z.number(),
  data: z.unknown().optional(),
});

export type DebugEvent = z.infer<typeof DebugEventSchema>;
