/**
 * Execution Replay for Workflow Testing
 * Records and replays workflow executions for regression testing
 */

import fs from 'fs/promises';
import path from 'path';
import { RecordedExecution, RecordedNodeExecution } from './types.js';

/**
 * Main execution replay system
 */
export class ExecutionReplay {
  private recordingDir: string;
  private recordings: Map<string, RecordedExecution> = new Map();
  private isRecording = false;
  private currentRecording?: RecordedExecution;

  constructor(recordingDir: string = './__recordings__') {
    this.recordingDir = recordingDir;
  }

  /**
   * Record an execution
   */
  async record(execution: RecordedExecution): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.recordingDir, { recursive: true });

    // Save recording
    const recordingPath = this.getRecordingPath(execution.id);
    await fs.writeFile(recordingPath, JSON.stringify(execution, null, 2), 'utf-8');

    this.recordings.set(execution.id, execution);
  }

  /**
   * Start recording a new execution
   */
  startRecording(workflowId: string, input: Record<string, unknown>): string {
    const executionId = crypto.randomUUID();

    this.currentRecording = {
      id: executionId,
      workflowId,
      timestamp: new Date().toISOString(),
      input,
      output: {},
      nodeExecutions: [],
      duration: 0,
      status: 'success',
    };

    this.isRecording = true;

    return executionId;
  }

  /**
   * Record node execution during recording
   */
  recordNodeExecution(
    nodeName: string,
    nodeType: string,
    input: unknown,
    output: unknown,
    duration: number,
    error?: string
  ): void {
    if (!this.isRecording || !this.currentRecording) {
      return;
    }

    this.currentRecording.nodeExecutions.push({
      nodeName,
      nodeType,
      input,
      output,
      duration,
      error,
    });
  }

  /**
   * Stop recording and save
   */
  async stopRecording(
    output: Record<string, unknown>,
    error?: { message: string; stack?: string }
  ): Promise<string | undefined> {
    if (!this.isRecording || !this.currentRecording) {
      return undefined;
    }

    this.currentRecording.output = output;
    this.currentRecording.status = error ? 'error' : 'success';
    this.currentRecording.error = error;

    // Calculate total duration
    this.currentRecording.duration = this.currentRecording.nodeExecutions.reduce(
      (sum, node) => sum + node.duration,
      0
    );

    const recordingId = this.currentRecording.id;

    await this.record(this.currentRecording);

    this.isRecording = false;
    this.currentRecording = undefined;

    return recordingId;
  }

  /**
   * Replay a recorded execution
   */
  async replay(recordingId: string): Promise<{
    execution: RecordedExecution;
    replayOutput: Record<string, unknown>;
    matched: boolean;
    differences?: Array<{
      node: string;
      expected: unknown;
      actual: unknown;
    }>;
  }> {
    // Load recording
    const recording = await this.loadRecording(recordingId);

    // Simulate replay (in real implementation, would execute workflow with recorded inputs)
    const replayOutput = await this.executeReplay(recording);

    // Compare results
    const differences = this.compareExecutions(recording, replayOutput);

    return {
      execution: recording,
      replayOutput,
      matched: differences.length === 0,
      differences: differences.length > 0 ? differences : undefined,
    };
  }

  /**
   * Execute replay of recorded execution
   */
  private async executeReplay(
    recording: RecordedExecution
  ): Promise<Record<string, unknown>> {
    // In a real implementation, this would execute the workflow
    // with the recorded inputs and return the actual output

    // For now, return a simulated output
    return {
      workflowId: recording.workflowId,
      executionId: crypto.randomUUID(),
      input: recording.input,
      output: recording.output,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compare recorded execution with replay results
   */
  compare(
    original: RecordedExecution,
    replay: RecordedExecution
  ): Array<{
    node: string;
    field: string;
    expected: unknown;
    actual: unknown;
  }> {
    const differences: Array<{
      node: string;
      field: string;
      expected: unknown;
      actual: unknown;
    }> = [];

    // Compare node executions
    for (let i = 0; i < original.nodeExecutions.length; i++) {
      const originalNode = original.nodeExecutions[i];
      const replayNode = replay.nodeExecutions[i];

      if (!replayNode) {
        differences.push({
          node: originalNode.nodeName,
          field: 'execution',
          expected: 'executed',
          actual: 'not executed',
        });
        continue;
      }

      // Compare outputs
      if (!this.deepEqual(originalNode.output, replayNode.output)) {
        differences.push({
          node: originalNode.nodeName,
          field: 'output',
          expected: originalNode.output,
          actual: replayNode.output,
        });
      }

      // Compare errors
      if (originalNode.error !== replayNode.error) {
        differences.push({
          node: originalNode.nodeName,
          field: 'error',
          expected: originalNode.error,
          actual: replayNode.error,
        });
      }
    }

    return differences;
  }

  /**
   * Compare executions and find differences
   */
  private compareExecutions(
    recording: RecordedExecution,
    replayOutput: Record<string, unknown>
  ): Array<{
    node: string;
    expected: unknown;
    actual: unknown;
  }> {
    const differences: Array<{
      node: string;
      expected: unknown;
      actual: unknown;
    }> = [];

    // In a real implementation, this would compare the actual outputs
    // For now, we'll do a simple comparison

    if (!this.deepEqual(recording.output, replayOutput)) {
      differences.push({
        node: 'workflow',
        expected: recording.output,
        actual: replayOutput,
      });
    }

    return differences;
  }

  /**
   * Load a recording from disk
   */
  async loadRecording(recordingId: string): Promise<RecordedExecution> {
    const recordingPath = this.getRecordingPath(recordingId);
    const content = await fs.readFile(recordingPath, 'utf-8');
    return JSON.parse(content) as RecordedExecution;
  }

  /**
   * List all recordings
   */
  async listRecordings(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.recordingDir);
      return files
        .filter(file => file.endsWith('.recording.json'))
        .map(file => file.replace('.recording.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Get recording metadata
   */
  async getRecordingMetadata(recordingId: string): Promise<{
    id: string;
    workflowId: string;
    timestamp: string;
    duration: number;
    status: 'success' | 'error';
    nodeCount: number;
  } | undefined> {
    try {
      const recording = await this.loadRecording(recordingId);
      return {
        id: recording.id,
        workflowId: recording.workflowId,
        timestamp: recording.timestamp,
        duration: recording.duration,
        status: recording.status,
        nodeCount: recording.nodeExecutions.length,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Delete a recording
   */
  async deleteRecording(recordingId: string): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);
    await fs.unlink(recordingPath);
    this.recordings.delete(recordingId);
  }

  /**
   * Delete all recordings
   */
  async deleteAllRecordings(): Promise<void> {
    try {
      await fs.rm(this.recordingDir, { recursive: true });
      this.recordings.clear();
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Get recording file path
   */
  private getRecordingPath(recordingId: string): string {
    return path.join(this.recordingDir, `${recordingId}.recording.json`);
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => this.deepEqual(val, b[idx]));
      }

      if (Array.isArray(a) || Array.isArray(b)) return false;

      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(key =>
        this.deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      );
    }

    return false;
  }

  /**
   * Export recording as JSON
   */
  async exportRecording(recordingId: string): Promise<string | undefined> {
    try {
      const recording = await this.loadRecording(recordingId);
      return JSON.stringify(recording, null, 2);
    } catch {
      return undefined;
    }
  }

  /**
   * Import recording from JSON
   */
  async importRecording(json: string): Promise<string> {
    const recording = JSON.parse(json) as RecordedExecution;
    await this.record(recording);
    return recording.id;
  }

  /**
   * Find recordings by workflow ID
   */
  async findByWorkflowId(workflowId: string): Promise<RecordedExecution[]> {
    const allRecordings = await this.listRecordings();
    const results: RecordedExecution[] = [];

    for (const recordingId of allRecordings) {
      const recording = await this.loadRecording(recordingId);
      if (recording.workflowId === workflowId) {
        results.push(recording);
      }
    }

    return results;
  }

  /**
   * Get statistics about recordings
   */
  async getStats(): Promise<{
    totalRecordings: number;
    totalDuration: number;
    successfulRecordings: number;
    failedRecordings: number;
    byWorkflow: Record<string, number>;
  }> {
    const allRecordings = await this.listRecordings();
    let totalDuration = 0;
    let successfulRecordings = 0;
    let failedRecordings = 0;
    const byWorkflow: Record<string, number> = {};

    for (const recordingId of allRecordings) {
      const recording = await this.loadRecording(recordingId);
      totalDuration += recording.duration;

      if (recording.status === 'success') {
        successfulRecordings++;
      } else {
        failedRecordings++;
      }

      byWorkflow[recording.workflowId] = (byWorkflow[recording.workflowId] ?? 0) + 1;
    }

    return {
      totalRecordings: allRecordings.length,
      totalDuration,
      successfulRecordings,
      failedRecordings,
      byWorkflow,
    };
  }
}

/**
 * Regression detector using execution recordings
 */
export class RegressionDetector {
  constructor(private replay: ExecutionReplay) {}

  /**
   * Detect regressions by comparing recordings
   */
  async detectRegressions(
    baselineRecordingId: string,
    currentRecordingId: string
  ): Promise<{
    hasRegression: boolean;
    differences: Array<{
      node: string;
      field: string;
      expected: unknown;
      actual: unknown;
      severity: 'critical' | 'warning' | 'info';
    }>;
    summary: string;
  }> {
    const baseline = await this.replay.loadRecording(baselineRecordingId);
    const current = await this.replay.loadRecording(currentRecordingId);

    const rawDifferences = this.replay.compare(baseline, current);

    // Classify differences by severity
    const differences = rawDifferences.map(diff => ({
      ...diff,
      severity: this.classifySeverity(diff),
    }));

    const hasRegression = differences.some(d => d.severity === 'critical');

    const summary = this.generateSummary(differences);

    return {
      hasRegression,
      differences,
      summary,
    };
  }

  /**
   * Classify severity of difference
   */
  private classifySeverity(
    diff: { node: string; field: string; expected: unknown; actual: unknown }
  ): 'critical' | 'warning' | 'info' {
    // Critical: errors or execution failures
    if (diff.field === 'error' || diff.field === 'execution') {
      return 'critical';
    }

    // Warning: output changes
    if (diff.field === 'output') {
      return 'warning';
    }

    // Info: other changes
    return 'info';
  }

  /**
   * Generate summary of differences
   */
  private generateSummary(
    differences: Array<{
      node: string;
      field: string;
      severity: 'critical' | 'warning' | 'info';
    }>
  ): string {
    const critical = differences.filter(d => d.severity === 'critical').length;
    const warnings = differences.filter(d => d.severity === 'warning').length;
    const info = differences.filter(d => d.severity === 'info').length;

    if (critical > 0) {
      return `Found ${critical} critical regression(s), ${warnings} warning(s), and ${info} informational difference(s)`;
    }

    if (warnings > 0) {
      return `Found ${warnings} warning(s) and ${info} informational difference(s)`;
    }

    if (info > 0) {
      return `Found ${info} informational difference(s)`;
    }

    return 'No regressions detected';
  }

  /**
   * Batch regression detection
   */
  async detectBatchRegressions(
    baselineRecordingIds: string[],
    currentRecordingIds: string[]
  ): Promise<{
    totalTests: number;
    regressions: number;
    results: Array<{
      baselineId: string;
      currentId: string;
      hasRegression: boolean;
      summary: string;
    }>;
  }> {
    const results: Array<{
      baselineId: string;
      currentId: string;
      hasRegression: boolean;
      summary: string;
    }> = [];

    let regressions = 0;

    for (let i = 0; i < baselineRecordingIds.length; i++) {
      const baselineId = baselineRecordingIds[i];
      const currentId = currentRecordingIds[i];

      if (!currentId) continue;

      const result = await this.detectRegressions(baselineId, currentId);

      results.push({
        baselineId,
        currentId,
        hasRegression: result.hasRegression,
        summary: result.summary,
      });

      if (result.hasRegression) {
        regressions++;
      }
    }

    return {
      totalTests: results.length,
      regressions,
      results,
    };
  }
}
