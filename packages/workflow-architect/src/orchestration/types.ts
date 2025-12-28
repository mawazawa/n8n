/**
 * Multi-Agent Orchestration Types
 * Core types for agent teams, coordination, and task management
 */

import { z } from 'zod';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Agent Role in team hierarchy
 */
export enum AgentRole {
  COORDINATOR = 'coordinator',
  SPECIALIST = 'specialist',
  SUPERVISOR = 'supervisor',
  WORKER = 'worker',
}

/**
 * Team topology patterns
 */
export enum TeamTopology {
  HIERARCHICAL = 'hierarchical',
  FLAT = 'flat',
  MESH = 'mesh',
  STAR = 'star',
}

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Agent status
 */
export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ERROR = 'error',
}

/**
 * Message type for inter-agent communication
 */
export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  HANDOFF = 'handoff',
  HEARTBEAT = 'heartbeat',
}

/**
 * Agent capability definition
 */
export interface AgentCapability {
  /** Unique capability ID */
  id: string;
  /** Capability name */
  name: string;
  /** Skills this agent possesses */
  skills: string[];
  /** Tools available to this agent */
  tools: string[];
  /** LLM models this agent can use */
  models: string[];
  /** Specializations (e.g., 'code', 'research', 'review') */
  specializations: string[];
  /** Performance metrics */
  metrics?: {
    successRate: number;
    averageLatency: number;
    tasksCompleted: number;
  };
}

/**
 * Agent definition
 */
export interface Agent {
  /** Unique agent ID */
  id: string;
  /** Agent name */
  name: string;
  /** Agent role in team */
  role: AgentRole;
  /** Agent capabilities */
  capabilities: AgentCapability;
  /** Current status */
  status: AgentStatus;
  /** Current workload (0-1) */
  workload: number;
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
  /** Last heartbeat timestamp */
  lastHeartbeat?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent team configuration
 */
export interface AgentTeam {
  /** Unique team ID */
  id: string;
  /** Team name */
  name: string;
  /** Team description */
  description?: string;
  /** Team agents */
  agents: Agent[];
  /** Team topology */
  topology: TeamTopology;
  /** Team leader (for hierarchical/star) */
  leaderId?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
  /** Team metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task definition
 */
export interface Task {
  /** Unique task ID */
  id: string;
  /** Task name */
  name: string;
  /** Task description */
  description: string;
  /** Task type/category */
  type: string;
  /** Task priority */
  priority: TaskPriority;
  /** Task status */
  status: TaskStatus;
  /** Required capabilities */
  requiredCapabilities?: string[];
  /** Input data */
  input: Record<string, unknown>;
  /** Output data (when completed) */
  output?: Record<string, unknown>;
  /** Task dependencies (task IDs) */
  dependencies?: string[];
  /** Deadline (unix timestamp) */
  deadline?: number;
  /** Estimated duration (ms) */
  estimatedDuration?: number;
  /** Created timestamp */
  createdAt: number;
  /** Started timestamp */
  startedAt?: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Error info */
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task assignment
 */
export interface TaskAssignment {
  /** Assignment ID */
  id: string;
  /** Task ID */
  taskId: string;
  /** Agent ID */
  agentId: string;
  /** Team ID */
  teamId: string;
  /** Assigned timestamp */
  assignedAt: number;
  /** Assignment status */
  status: TaskStatus;
  /** Retries count */
  retries: number;
  /** Max retries */
  maxRetries: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Inter-agent message
 */
export interface AgentMessage {
  /** Message ID */
  id: string;
  /** Message type */
  type: MessageType;
  /** Sender agent ID */
  fromAgentId: string;
  /** Recipient agent ID (or 'broadcast') */
  toAgentId: string;
  /** Message topic/channel */
  topic: string;
  /** Message payload */
  payload: Record<string, unknown>;
  /** Correlation ID (for request-response) */
  correlationId?: string;
  /** Timestamp */
  timestamp: number;
  /** Expiry timestamp */
  expiresAt?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Team configuration */
  team: Omit<AgentTeam, 'id' | 'createdAt' | 'updatedAt'>;
  /** Task assignment strategy */
  assignmentStrategy: 'round-robin' | 'least-busy' | 'capability-based' | 'random';
  /** Maximum concurrent tasks per team */
  maxConcurrentTasks: number;
  /** Task timeout (ms) */
  taskTimeout: number;
  /** Max retries for failed tasks */
  maxRetries: number;
  /** Enable task dependencies */
  enableDependencies: boolean;
  /** Enable heartbeat monitoring */
  enableHeartbeat: boolean;
  /** Heartbeat interval (ms) */
  heartbeatInterval: number;
  /** Agent failure threshold (missed heartbeats) */
  failureThreshold: number;
  /** Message retention (ms) */
  messageRetention: number;
  /** Enable metrics collection */
  enableMetrics: boolean;
  /** Custom configuration */
  custom?: Record<string, unknown>;
}

/**
 * Team status
 */
export interface TeamStatus {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Total agents */
  totalAgents: number;
  /** Active agents */
  activeAgents: number;
  /** Idle agents */
  idleAgents: number;
  /** Offline agents */
  offlineAgents: number;
  /** Total tasks */
  totalTasks: number;
  /** Pending tasks */
  pendingTasks: number;
  /** In-progress tasks */
  inProgressTasks: number;
  /** Completed tasks */
  completedTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Average workload (0-1) */
  averageWorkload: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Progress update
 */
export interface ProgressUpdate {
  /** Task ID */
  taskId: string;
  /** Agent ID */
  agentId: string;
  /** Progress (0-1) */
  progress: number;
  /** Status message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Execution ID */
  id: string;
  /** Team ID */
  teamId: string;
  /** Task results */
  tasks: Map<string, Task>;
  /** Success count */
  successCount: number;
  /** Failure count */
  failureCount: number;
  /** Total duration (ms) */
  duration: number;
  /** Started timestamp */
  startedAt: number;
  /** Completed timestamp */
  completedAt: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Decision for consensus
 */
export interface Decision {
  /** Decision ID */
  id: string;
  /** Proposal ID */
  proposalId: string;
  /** Decision outcome */
  outcome: 'approved' | 'rejected' | 'deferred';
  /** Votes */
  votes: Map<string, 'yes' | 'no' | 'abstain'>;
  /** Vote counts */
  voteCounts: {
    yes: number;
    no: number;
    abstain: number;
  };
  /** Required votes */
  requiredVotes: number;
  /** Decision timestamp */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Handoff context
 */
export interface HandoffContext {
  /** Handoff ID */
  id: string;
  /** From agent ID */
  fromAgentId: string;
  /** To agent ID */
  toAgentId: string;
  /** Task ID */
  taskId: string;
  /** Context data */
  context: Record<string, unknown>;
  /** Messages to transfer */
  messages: BaseMessage[];
  /** Reason for handoff */
  reason: string;
  /** Status */
  status: 'initiated' | 'acknowledged' | 'completed' | 'failed';
  /** Timestamp */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Alert from supervisor
 */
export interface Alert {
  /** Alert ID */
  id: string;
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Alert type */
  type: string;
  /** Agent ID (if applicable) */
  agentId?: string;
  /** Team ID */
  teamId: string;
  /** Alert message */
  message: string;
  /** Alert details */
  details?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
  /** Resolved timestamp */
  resolvedAt?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Team metrics
 */
export interface TeamMetrics {
  /** Team ID */
  teamId: string;
  /** Time period (start-end) */
  period: {
    start: number;
    end: number;
  };
  /** Task metrics */
  tasks: {
    total: number;
    completed: number;
    failed: number;
    averageDuration: number;
    successRate: number;
  };
  /** Agent metrics */
  agents: {
    total: number;
    averageUtilization: number;
    averageResponseTime: number;
    healthScore: number;
  };
  /** Performance metrics */
  performance: {
    throughput: number; // tasks/hour
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  };
  /** Resource metrics */
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    networkUsage: number;
  };
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource estimate for task execution
 */
export interface ResourceEstimate {
  /** Estimated duration (ms) */
  duration: number;
  /** Estimated agents needed */
  agentsNeeded: number;
  /** Estimated memory (MB) */
  memory: number;
  /** Estimated cost (arbitrary units) */
  cost: number;
  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Directed Acyclic Graph for task dependencies
 */
export interface DAG {
  /** Nodes (task IDs) */
  nodes: string[];
  /** Edges (dependencies) */
  edges: Array<{ from: string; to: string }>;
  /** Topologically sorted nodes */
  sorted: string[];
  /** Levels for parallel execution */
  levels: string[][];
}

/**
 * Execution plan
 */
export interface ExecutionPlan {
  /** Plan ID */
  id: string;
  /** Tasks in execution order */
  tasks: Task[];
  /** Dependency graph */
  graph: DAG;
  /** Execution levels (for parallelization) */
  levels: Task[][];
  /** Resource estimate */
  resourceEstimate: ResourceEstimate;
  /** Estimated completion time */
  estimatedCompletion: number;
  /** Created timestamp */
  createdAt: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Graph data for visualization
 */
export interface GraphData {
  /** Nodes */
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Edges */
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Timeline data for visualization
 */
export interface TimelineData {
  /** Events */
  events: Array<{
    id: string;
    timestamp: number;
    agentId: string;
    taskId?: string;
    type: string;
    description: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Time range */
  range: {
    start: number;
    end: number;
  };
}

/**
 * Subscription for message bus
 */
export interface Subscription {
  /** Subscription ID */
  id: string;
  /** Topic pattern */
  topic: string;
  /** Unsubscribe function */
  unsubscribe: () => void;
}

// Zod schemas for runtime validation

export const AgentCapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  models: z.array(z.string()),
  specializations: z.array(z.string()),
  metrics: z.object({
    successRate: z.number().min(0).max(1),
    averageLatency: z.number().min(0),
    tasksCompleted: z.number().int().min(0),
  }).optional(),
});

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.nativeEnum(AgentRole),
  capabilities: AgentCapabilitySchema,
  status: z.nativeEnum(AgentStatus),
  workload: z.number().min(0).max(1),
  maxConcurrentTasks: z.number().int().min(1),
  lastHeartbeat: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  priority: z.nativeEnum(TaskPriority),
  status: z.nativeEnum(TaskStatus),
  requiredCapabilities: z.array(z.string()).optional(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  dependencies: z.array(z.string()).optional(),
  deadline: z.number().optional(),
  estimatedDuration: z.number().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const OrchestratorConfigSchema = z.object({
  team: z.object({
    name: z.string(),
    description: z.string().optional(),
    agents: z.array(AgentSchema),
    topology: z.nativeEnum(TeamTopology),
    leaderId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  assignmentStrategy: z.enum(['round-robin', 'least-busy', 'capability-based', 'random']),
  maxConcurrentTasks: z.number().int().min(1),
  taskTimeout: z.number().min(0),
  maxRetries: z.number().int().min(0),
  enableDependencies: z.boolean(),
  enableHeartbeat: z.boolean(),
  heartbeatInterval: z.number().min(1000),
  failureThreshold: z.number().int().min(1),
  messageRetention: z.number().min(0),
  enableMetrics: z.boolean(),
  custom: z.record(z.unknown()).optional(),
});
