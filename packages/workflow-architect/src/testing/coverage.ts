/**
 * Coverage Analyzer for Workflow Testing
 * Tracks node execution coverage and identifies untested paths
 */

import { CoverageInfo, CoverageReport } from './types.js';
import { WorkflowDefinition, WorkflowNode } from '../types/workflow.js';

/**
 * Tracks execution coverage for a single workflow
 */
export class WorkflowCoverageTracker {
  private workflowId: string;
  private allNodes: Set<string>;
  private executedNodes: Set<string>;
  private executionPaths: string[][];
  private currentPath: string[];

  constructor(workflowId: string, nodes: WorkflowNode[]) {
    this.workflowId = workflowId;
    this.allNodes = new Set(nodes.map(n => n.name));
    this.executedNodes = new Set();
    this.executionPaths = [];
    this.currentPath = [];
  }

  /**
   * Record node execution
   */
  recordNodeExecution(nodeName: string): void {
    this.executedNodes.add(nodeName);
    this.currentPath.push(nodeName);
  }

  /**
   * Mark execution path complete
   */
  completeExecutionPath(): void {
    if (this.currentPath.length > 0) {
      this.executionPaths.push([...this.currentPath]);
      this.currentPath = [];
    }
  }

  /**
   * Get coverage information
   */
  getCoverage(): CoverageInfo {
    const totalNodes = this.allNodes.size;
    const executedNodes = this.executedNodes.size;
    const percentage = totalNodes > 0 ? (executedNodes / totalNodes) * 100 : 0;

    const uncoveredNodes = Array.from(this.allNodes).filter(
      node => !this.executedNodes.has(node)
    );

    return {
      totalNodes,
      executedNodes,
      percentage,
      uncoveredNodes,
    };
  }

  /**
   * Get all execution paths
   */
  getExecutionPaths(): string[][] {
    return [...this.executionPaths];
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.executedNodes.clear();
    this.executionPaths = [];
    this.currentPath = [];
  }
}

/**
 * Main coverage analyzer for tracking test coverage across workflows
 */
export class CoverageAnalyzer {
  private trackers: Map<string, WorkflowCoverageTracker> = new Map();
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private threshold = 80; // Default 80% coverage threshold

  /**
   * Start tracking coverage for a workflow
   */
  startTracking(workflow: WorkflowDefinition): void {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID for coverage tracking');
    }

    const tracker = new WorkflowCoverageTracker(workflow.id, workflow.nodes);
    this.trackers.set(workflow.id, tracker);
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Stop tracking coverage for a workflow
   */
  stopTracking(workflowId: string): CoverageInfo | undefined {
    const tracker = this.trackers.get(workflowId);
    if (!tracker) {
      return undefined;
    }

    tracker.completeExecutionPath();
    const coverage = tracker.getCoverage();
    this.trackers.delete(workflowId);
    return coverage;
  }

  /**
   * Record node execution
   */
  recordExecution(workflowId: string, nodeName: string): void {
    const tracker = this.trackers.get(workflowId);
    if (!tracker) {
      console.warn(`No coverage tracker found for workflow ${workflowId}`);
      return;
    }

    tracker.recordNodeExecution(nodeName);
  }

  /**
   * Mark execution complete
   */
  completeExecution(workflowId: string): void {
    const tracker = this.trackers.get(workflowId);
    if (tracker) {
      tracker.completeExecutionPath();
    }
  }

  /**
   * Get coverage for a specific workflow
   */
  getCoverage(workflowId: string): CoverageInfo | undefined {
    const tracker = this.trackers.get(workflowId);
    return tracker?.getCoverage();
  }

  /**
   * Get comprehensive coverage report
   */
  getReport(): CoverageReport {
    const byWorkflow: Record<string, CoverageInfo> = {};
    let totalNodes = 0;
    let totalExecuted = 0;
    const allUncoveredPaths: string[] = [];

    for (const [workflowId, tracker] of this.trackers.entries()) {
      const coverage = tracker.getCoverage();
      byWorkflow[workflowId] = coverage;
      totalNodes += coverage.totalNodes;
      totalExecuted += coverage.executedNodes;

      // Add uncovered paths
      for (const node of coverage.uncoveredNodes) {
        allUncoveredPaths.push(`${workflowId}:${node}`);
      }
    }

    const overallPercentage = totalNodes > 0 ? (totalExecuted / totalNodes) * 100 : 0;

    return {
      overall: {
        totalNodes,
        executedNodes: totalExecuted,
        percentage: overallPercentage,
        uncoveredNodes: [], // Not applicable at overall level
      },
      byWorkflow,
      uncoveredPaths: allUncoveredPaths,
    };
  }

  /**
   * Set coverage threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(100, threshold));
  }

  /**
   * Check if coverage meets threshold
   */
  meetsThreshold(workflowId?: string): boolean {
    if (workflowId) {
      const coverage = this.getCoverage(workflowId);
      return coverage ? coverage.percentage >= this.threshold : false;
    }

    const report = this.getReport();
    return report.overall.percentage >= this.threshold;
  }

  /**
   * Get untested nodes for a workflow
   */
  getUntestedNodes(workflowId: string): string[] {
    const coverage = this.getCoverage(workflowId);
    return coverage?.uncoveredNodes ?? [];
  }

  /**
   * Get execution paths for a workflow
   */
  getExecutionPaths(workflowId: string): string[][] {
    const tracker = this.trackers.get(workflowId);
    return tracker?.getExecutionPaths() ?? [];
  }

  /**
   * Analyze branch coverage (conditional paths)
   */
  analyzeBranchCoverage(workflowId: string): {
    totalBranches: number;
    coveredBranches: number;
    percentage: number;
    uncoveredBranches: string[];
  } {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { totalBranches: 0, coveredBranches: 0, percentage: 0, uncoveredBranches: [] };
    }

    const paths = this.getExecutionPaths(workflowId);
    const branches = this.extractBranches(workflow);
    const coveredBranches = new Set<string>();

    // Check which branches are covered by execution paths
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const branchKey = `${path[i]}->${path[i + 1]}`;
        if (branches.has(branchKey)) {
          coveredBranches.add(branchKey);
        }
      }
    }

    const totalBranches = branches.size;
    const covered = coveredBranches.size;
    const percentage = totalBranches > 0 ? (covered / totalBranches) * 100 : 0;
    const uncovered = Array.from(branches).filter(b => !coveredBranches.has(b));

    return {
      totalBranches,
      coveredBranches: covered,
      percentage,
      uncoveredBranches: uncovered,
    };
  }

  /**
   * Extract all possible branches from workflow
   */
  private extractBranches(workflow: WorkflowDefinition): Set<string> {
    const branches = new Set<string>();

    for (const [sourceNode, connections] of Object.entries(workflow.connections)) {
      for (const connectionType of Object.values(connections)) {
        for (const outputConnections of connectionType) {
          for (const connection of outputConnections) {
            branches.add(`${sourceNode}->${connection.node}`);
          }
        }
      }
    }

    return branches;
  }

  /**
   * Generate coverage suggestions
   */
  generateSuggestions(workflowId: string): string[] {
    const coverage = this.getCoverage(workflowId);
    if (!coverage) {
      return ['Workflow not found or not tracked'];
    }

    const suggestions: string[] = [];

    if (coverage.percentage < this.threshold) {
      suggestions.push(
        `Coverage is ${coverage.percentage.toFixed(1)}%, below threshold of ${this.threshold}%`
      );
    }

    if (coverage.uncoveredNodes.length > 0) {
      suggestions.push(
        `Add tests to cover these nodes: ${coverage.uncoveredNodes.join(', ')}`
      );
    }

    const branchCoverage = this.analyzeBranchCoverage(workflowId);
    if (branchCoverage.percentage < this.threshold) {
      suggestions.push(
        `Branch coverage is ${branchCoverage.percentage.toFixed(1)}%. Consider testing different execution paths.`
      );
    }

    if (suggestions.length === 0) {
      suggestions.push('Coverage looks good! All nodes and branches are tested.');
    }

    return suggestions;
  }

  /**
   * Export coverage report as JSON
   */
  exportReport(): string {
    return JSON.stringify(this.getReport(), null, 2);
  }

  /**
   * Generate HTML coverage report
   */
  generateHtmlReport(): string {
    const report = this.getReport();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Workflow Test Coverage Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .workflow { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
    .coverage-bar { width: 100%; height: 20px; background: #eee; border-radius: 3px; overflow: hidden; }
    .coverage-fill { height: 100%; background: #4caf50; transition: width 0.3s; }
    .coverage-low { background: #f44336; }
    .coverage-medium { background: #ff9800; }
    .uncovered { color: #f44336; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Workflow Test Coverage Report</h1>

  <div class="summary">
    <h2>Overall Coverage</h2>
    <p>Total Nodes: ${report.overall.totalNodes}</p>
    <p>Executed Nodes: ${report.overall.executedNodes}</p>
    <p>Coverage: ${report.overall.percentage.toFixed(1)}%</p>
    <div class="coverage-bar">
      <div class="coverage-fill ${this.getCoverageClass(report.overall.percentage)}"
           style="width: ${report.overall.percentage}%"></div>
    </div>
  </div>

  <h2>By Workflow</h2>
  ${Object.entries(report.byWorkflow).map(([id, coverage]) => `
    <div class="workflow">
      <h3>${id}</h3>
      <p>Nodes: ${coverage.executedNodes}/${coverage.totalNodes} (${coverage.percentage.toFixed(1)}%)</p>
      <div class="coverage-bar">
        <div class="coverage-fill ${this.getCoverageClass(coverage.percentage)}"
             style="width: ${coverage.percentage}%"></div>
      </div>
      ${coverage.uncoveredNodes.length > 0 ? `
        <p class="uncovered">Uncovered nodes: ${coverage.uncoveredNodes.join(', ')}</p>
      ` : ''}
    </div>
  `).join('')}

  ${report.uncoveredPaths.length > 0 ? `
    <h2>Uncovered Paths</h2>
    <table>
      <tr><th>Path</th></tr>
      ${report.uncoveredPaths.map(path => `<tr><td>${path}</td></tr>`).join('')}
    </table>
  ` : ''}
</body>
</html>`;

    return html;
  }

  /**
   * Get CSS class based on coverage percentage
   */
  private getCoverageClass(percentage: number): string {
    if (percentage >= 80) return 'coverage-fill';
    if (percentage >= 50) return 'coverage-medium';
    return 'coverage-low';
  }

  /**
   * Reset all coverage tracking
   */
  reset(): void {
    this.trackers.clear();
    this.workflows.clear();
  }
}
