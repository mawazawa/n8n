/**
 * Coordinator Agent
 * Delegates tasks to team members and aggregates results
 */

import { v4 as uuid } from 'uuid';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import {
  type Agent,
  type Task,
  type TaskAssignment,
  type ProgressUpdate,
  AgentRole,
  TaskStatus,
  TaskPriority,
} from './types.js';
import { getTeam } from './team.js';

/**
 * Assignment decision from LLM
 */
const AssignmentDecisionSchema = z.object({
  agentId: z.string().describe('ID of the agent to assign the task to'),
  reasoning: z.string().describe('Why this agent was chosen'),
  estimatedDuration: z.number().describe('Estimated task duration in milliseconds'),
  priority: z.nativeEnum(TaskPriority).describe('Adjusted task priority'),
});

/**
 * Final result aggregation
 */
export interface FinalResult {
  /** Overall success */
  success: boolean;
  /** Aggregated output */
  output: Record<string, unknown>;
  /** Task results */
  taskResults: Array<{
    taskId: string;
    agentId: string;
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
  }>;
  /** Execution summary */
  summary: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Coordinator Agent Class
 */
export class Coordinator {
  private model: BaseChatModel;
  private teamId: string;
  private assignments: Map<string, TaskAssignment>;
  private progressCallbacks: Map<string, (update: ProgressUpdate) => void>;

  constructor(teamId: string, model: BaseChatModel) {
    this.teamId = teamId;
    this.model = model;
    this.assignments = new Map();
    this.progressCallbacks = new Map();
  }

  /**
   * Delegate task to appropriate agents
   */
  async delegateTask(task: Task, agents: Agent[]): Promise<TaskAssignment[]> {
    console.log(`[Coordinator] Delegating task ${task.name} to team`);

    // Filter available agents
    const availableAgents = agents.filter(a =>
      a.role !== AgentRole.COORDINATOR &&
      a.workload < 1.0 &&
      this.matchesCapabilities(task, a)
    );

    if (availableAgents.length === 0) {
      throw new Error('No available agents match task requirements');
    }

    // Use LLM to decide assignment
    const decision = await this.decideAssignment(task, availableAgents);

    const assignment: TaskAssignment = {
      id: uuid(),
      taskId: task.id,
      agentId: decision.agentId,
      teamId: this.teamId,
      assignedAt: Date.now(),
      status: TaskStatus.ASSIGNED,
      retries: 0,
      maxRetries: 3,
      metadata: {
        reasoning: decision.reasoning,
        estimatedDuration: decision.estimatedDuration,
      },
    };

    this.assignments.set(assignment.id, assignment);

    return [assignment];
  }

  /**
   * Monitor progress of assigned tasks
   */
  async *monitorProgress(): AsyncGenerator<ProgressUpdate> {
    const checkInterval = 1000; // 1 second

    while (this.assignments.size > 0) {
      // Check each assignment
      for (const [assignmentId, assignment] of this.assignments) {
        if (assignment.status === TaskStatus.IN_PROGRESS) {
          // Emit progress update
          const update: ProgressUpdate = {
            taskId: assignment.taskId,
            agentId: assignment.agentId,
            progress: 0.5, // This would be updated from actual task execution
            message: `Task ${assignment.taskId} in progress`,
            timestamp: Date.now(),
            metadata: { assignmentId },
          };

          yield update;
        }

        // Check for completion or failure
        if (assignment.status === TaskStatus.COMPLETED || assignment.status === TaskStatus.FAILED) {
          this.assignments.delete(assignmentId);
        }
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Aggregate results from multiple tasks
   */
  async aggregateResults(results: Map<string, Task>): Promise<FinalResult> {
    console.log(`[Coordinator] Aggregating results from ${results.size} tasks`);

    const taskResults = Array.from(results.values()).map(task => ({
      taskId: task.id,
      agentId: '', // Would be populated from assignment
      success: task.status === TaskStatus.COMPLETED,
      output: task.output,
      error: task.error?.message,
    }));

    const successCount = taskResults.filter(r => r.success).length;
    const overallSuccess = successCount === taskResults.length;

    // Use LLM to create summary
    const summary = await this.createSummary(taskResults);

    // Aggregate outputs
    const aggregatedOutput: Record<string, unknown> = {};
    for (const task of results.values()) {
      if (task.output) {
        aggregatedOutput[task.id] = task.output;
      }
    }

    return {
      success: overallSuccess,
      output: aggregatedOutput,
      taskResults,
      summary,
      metadata: {
        totalTasks: results.size,
        successCount,
        failureCount: results.size - successCount,
      },
    };
  }

  /**
   * Reassign failed task to different agent
   */
  async reassignTask(assignmentId: string, agents: Agent[]): Promise<TaskAssignment> {
    const oldAssignment = this.assignments.get(assignmentId);
    if (!oldAssignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    console.log(`[Coordinator] Reassigning task ${oldAssignment.taskId}`);

    // Find different available agents (exclude the one that failed)
    const availableAgents = agents.filter(a =>
      a.id !== oldAssignment.agentId &&
      a.role !== AgentRole.COORDINATOR &&
      a.workload < 1.0
    );

    if (availableAgents.length === 0) {
      throw new Error('No alternative agents available for reassignment');
    }

    // Pick the least busy agent
    const newAgent = availableAgents.reduce((min, a) =>
      a.workload < min.workload ? a : min
    );

    const newAssignment: TaskAssignment = {
      id: uuid(),
      taskId: oldAssignment.taskId,
      agentId: newAgent.id,
      teamId: this.teamId,
      assignedAt: Date.now(),
      status: TaskStatus.ASSIGNED,
      retries: oldAssignment.retries + 1,
      maxRetries: oldAssignment.maxRetries,
      metadata: {
        reassignedFrom: oldAssignment.agentId,
        reason: 'Task failure',
      },
    };

    this.assignments.set(newAssignment.id, newAssignment);
    this.assignments.delete(assignmentId);

    return newAssignment;
  }

  /**
   * Get current assignments
   */
  getAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Update assignment status
   */
  updateAssignmentStatus(assignmentId: string, status: TaskStatus): void {
    const assignment = this.assignments.get(assignmentId);
    if (assignment) {
      assignment.status = status;
    }
  }

  /**
   * Register progress callback
   */
  onProgress(taskId: string, callback: (update: ProgressUpdate) => void): void {
    this.progressCallbacks.set(taskId, callback);
  }

  /**
   * Emit progress update
   */
  private emitProgress(update: ProgressUpdate): void {
    const callback = this.progressCallbacks.get(update.taskId);
    if (callback) {
      callback(update);
    }
  }

  /**
   * Use LLM to decide task assignment
   */
  private async decideAssignment(
    task: Task,
    agents: Agent[]
  ): Promise<z.infer<typeof AssignmentDecisionSchema>> {
    const prompt = ChatPromptTemplate.fromTemplate(`You are a task coordinator for an agent team.

Task Details:
Name: {taskName}
Description: {taskDescription}
Type: {taskType}
Priority: {taskPriority}
Required Capabilities: {requiredCapabilities}

Available Agents:
{agentList}

Select the best agent for this task based on:
1. Agent capabilities matching task requirements
2. Agent current workload (lower is better)
3. Agent specializations
4. Agent past performance

Provide your decision with reasoning.`);

    const agentList = agents.map(a =>
      `- ${a.name} (ID: ${a.id})
  Role: ${a.role}
  Workload: ${(a.workload * 100).toFixed(1)}%
  Specializations: ${a.capabilities.specializations.join(', ')}
  Skills: ${a.capabilities.skills.join(', ')}`
    ).join('\n\n');

    const structuredModel = this.model.withStructuredOutput(AssignmentDecisionSchema);

    const formatted = await prompt.invoke({
      taskName: task.name,
      taskDescription: task.description,
      taskType: task.type,
      taskPriority: task.priority,
      requiredCapabilities: task.requiredCapabilities?.join(', ') || 'None specified',
      agentList,
    });

    const decision = await structuredModel.invoke(formatted);

    console.log(`[Coordinator] Assigned task to agent ${decision.agentId}: ${decision.reasoning}`);

    return decision;
  }

  /**
   * Create summary using LLM
   */
  private async createSummary(
    taskResults: Array<{
      taskId: string;
      success: boolean;
      output?: Record<string, unknown>;
      error?: string;
    }>
  ): Promise<string> {
    const prompt = ChatPromptTemplate.fromTemplate(`Summarize the execution results:

{results}

Provide a concise summary (2-3 sentences) highlighting:
1. Overall success/failure
2. Key achievements
3. Any issues encountered`);

    const resultsText = taskResults.map((r, i) =>
      `Task ${i + 1}: ${r.success ? 'Success' : 'Failed'}
${r.error ? `Error: ${r.error}` : ''}`
    ).join('\n\n');

    const formatted = await prompt.invoke({ results: resultsText });
    const response = await this.model.invoke(formatted);

    return response.content.toString();
  }

  /**
   * Check if agent capabilities match task requirements
   */
  private matchesCapabilities(task: Task, agent: Agent): boolean {
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
      return true;
    }

    const agentSkills = new Set([
      ...agent.capabilities.skills,
      ...agent.capabilities.specializations,
    ]);

    return task.requiredCapabilities.some(cap => agentSkills.has(cap));
  }
}

/**
 * Create a coordinator agent
 */
export function createCoordinator(teamId: string, model: BaseChatModel): Coordinator {
  return new Coordinator(teamId, model);
}
