/**
 * Report Builder
 * Generates comprehensive intelligence reports in multiple formats
 */

import type { WorkflowDefinition } from '../types/workflow.js';
import type { IntelligenceReport, ReportSection } from './types.js';
import { InsightGenerator } from './insights.js';
import { RecommendationEngine } from './recommendations.js';
import { TrendDetector } from './trends.js';
import { BenchmarkService } from './benchmarking.js';
import { CostAnalyzer } from './cost-analysis.js';
import { v4 as uuidv4 } from 'uuid';

interface ReportOptions {
  type: 'executive' | 'detailed' | 'technical';
  period?: {
    start: number;
    end: number;
  };
  sections?: string[];
}

export class ReportBuilder {
  private insightGenerator: InsightGenerator;
  private recommendationEngine: RecommendationEngine;
  private trendDetector: TrendDetector;
  private benchmarkService: BenchmarkService;
  private costAnalyzer: CostAnalyzer;

  constructor() {
    this.insightGenerator = new InsightGenerator();
    this.recommendationEngine = new RecommendationEngine();
    this.trendDetector = new TrendDetector();
    this.benchmarkService = new BenchmarkService();
    this.costAnalyzer = new CostAnalyzer();
  }

  /**
   * Build intelligence report for a workflow
   */
  async buildReport(
    workflow: WorkflowDefinition,
    options: ReportOptions,
    allWorkflows: WorkflowDefinition[] = [],
  ): Promise<IntelligenceReport> {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    const now = Date.now();
    const period = options.period || {
      start: now - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      end: now,
    };

    // Gather data
    const insights = await this.insightGenerator.generate(workflow);
    const recommendations = await this.recommendationEngine.recommend(workflow);
    const benchmarkResult = await this.benchmarkService.benchmark(workflow, allWorkflows);
    const costAnalysis = await this.costAnalyzer.analyze(workflow);

    // Calculate summary
    const summary = this.generateSummary(
      insights,
      recommendations,
      benchmarkResult,
      costAnalysis,
    );

    // Build sections based on report type and options
    const sections = await this.buildSections(
      workflow,
      options,
      insights,
      recommendations,
      benchmarkResult,
      costAnalysis,
    );

    return {
      id: uuidv4(),
      workflowId: workflow.id,
      type: options.type,
      generatedAt: now,
      period,
      summary,
      sections,
      metadata: {
        nodeCount: workflow.nodes.length,
        activeStatus: workflow.active,
      },
    };
  }

  /**
   * Export report to HTML
   */
  async exportHTML(report: IntelligenceReport): Promise<string> {
    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Workflow Intelligence Report - ${report.workflowId}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-label { font-weight: bold; color: #666; }
    .metric-value { font-size: 24px; color: #007bff; }
    .section { margin: 30px 0; }
    .recommendations { list-style: none; padding: 0; }
    .recommendation { background: #fff; border-left: 4px solid #28a745; padding: 15px; margin: 10px 0; }
    .critical { border-left-color: #dc3545; }
    .high { border-left-color: #ffc107; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #007bff; color: white; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Workflow Intelligence Report</h1>
  <div class="summary">
    <h2>Executive Summary</h2>
    <div class="metric">
      <div class="metric-label">Overall Health</div>
      <div class="metric-value">${report.summary.overallHealth}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Insights</div>
      <div class="metric-value">${report.summary.totalInsights}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Critical Issues</div>
      <div class="metric-value">${report.summary.criticalIssues}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Recommendations</div>
      <div class="metric-value">${report.summary.recommendations}</div>
    </div>
  </div>
`;

    // Add sections
    for (const section of report.sections) {
      html += this.renderSection(section);
    }

    html += `
  <div class="footer">
    <p>Report generated: ${new Date(report.generatedAt).toLocaleString()}</p>
    <p>Workflow ID: ${report.workflowId}</p>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Export report to JSON
   */
  async exportJSON(report: IntelligenceReport): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report to PDF (simplified - returns HTML for PDF conversion)
   */
  async exportPDF(report: IntelligenceReport): Promise<string> {
    // In production, this would use a PDF library
    // For now, return HTML that can be converted to PDF
    return await this.exportHTML(report);
  }

  /**
   * Generate summary
   */
  private generateSummary(
    insights: Awaited<ReturnType<typeof this.insightGenerator.generate>>,
    recommendations: Awaited<ReturnType<typeof this.recommendationEngine.recommend>>,
    benchmarkResult: Awaited<ReturnType<typeof this.benchmarkService.benchmark>>,
    costAnalysis: Awaited<ReturnType<typeof this.costAnalyzer.analyze>>,
  ): IntelligenceReport['summary'] {
    // Calculate overall health score
    const healthScore = this.calculateHealthScore(
      insights,
      benchmarkResult,
      costAnalysis,
    );

    // Count critical issues
    const criticalIssues = insights.filter(
      (i) => i.severity === 'critical' || i.severity === 'high',
    ).length;

    // Extract trends
    const trends: string[] = [];
    if (costAnalysis.trends.monthly.direction === 'up') {
      trends.push('Costs increasing');
    }
    if (benchmarkResult.percentile > 75) {
      trends.push('Performance above average');
    }
    if (criticalIssues > 3) {
      trends.push('Multiple critical issues');
    }

    return {
      overallHealth: healthScore,
      totalInsights: insights.length,
      criticalIssues,
      recommendations: recommendations.length,
      trends,
    };
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(
    insights: Awaited<ReturnType<typeof this.insightGenerator.generate>>,
    benchmarkResult: Awaited<ReturnType<typeof this.benchmarkService.benchmark>>,
    costAnalysis: Awaited<ReturnType<typeof this.costAnalyzer.analyze>>,
  ): number {
    let score = 100;

    // Deduct for critical/high severity insights
    const critical = insights.filter((i) => i.severity === 'critical').length;
    const high = insights.filter((i) => i.severity === 'high').length;
    const medium = insights.filter((i) => i.severity === 'medium').length;

    score -= critical * 15;
    score -= high * 10;
    score -= medium * 5;

    // Adjust based on benchmark percentile
    const percentileBonus = (benchmarkResult.percentile - 50) * 0.2;
    score += percentileBonus;

    // Adjust based on cost trends
    if (costAnalysis.trends.monthly.direction === 'up') {
      score -= 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Build report sections
   */
  private async buildSections(
    workflow: WorkflowDefinition,
    options: ReportOptions,
    insights: Awaited<ReturnType<typeof this.insightGenerator.generate>>,
    recommendations: Awaited<ReturnType<typeof this.recommendationEngine.recommend>>,
    benchmarkResult: Awaited<ReturnType<typeof this.benchmarkService.benchmark>>,
    costAnalysis: Awaited<ReturnType<typeof this.costAnalyzer.analyze>>,
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];

    // Overview section
    sections.push({
      title: 'Workflow Overview',
      type: 'text',
      content: {
        description: `Analysis of workflow: ${workflow.name}`,
        nodeCount: workflow.nodes.length,
        activeStatus: workflow.active ? 'Active' : 'Inactive',
        tags: workflow.tags?.map((t) => t.name).join(', ') || 'None',
      },
      priority: 1,
    });

    // Key insights
    sections.push({
      title: 'Key Insights',
      type: 'recommendations',
      content: insights.slice(0, 10).map((i) => ({
        severity: i.severity,
        title: i.title,
        description: i.description,
        action: i.action,
      })),
      priority: 2,
    });

    // Recommendations
    sections.push({
      title: 'Recommended Actions',
      type: 'recommendations',
      content: recommendations.slice(0, 5).map((r) => ({
        title: r.title,
        description: r.description,
        impact: r.impact,
        effort: r.effort,
        roi: r.roi,
        improvement: r.estimatedImprovement,
      })),
      priority: 3,
    });

    // Performance benchmarks
    sections.push({
      title: 'Performance Benchmarks',
      type: 'metrics',
      content: {
        category: benchmarkResult.category,
        percentile: benchmarkResult.percentile,
        metrics: benchmarkResult.metrics,
        comparison: benchmarkResult.comparison,
      },
      priority: 4,
    });

    // Cost analysis
    sections.push({
      title: 'Cost Analysis',
      type: 'table',
      content: {
        totalCost: costAnalysis.totalCost,
        topCosts: costAnalysis.breakdown.slice(0, 10),
        trends: costAnalysis.trends.monthly,
        optimizations: costAnalysis.optimizations,
      },
      priority: 5,
    });

    // Detailed sections for technical reports
    if (options.type === 'technical' || options.type === 'detailed') {
      sections.push({
        title: 'Node-Level Analysis',
        type: 'table',
        content: workflow.nodes.map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          disabled: node.disabled || false,
        })),
        priority: 6,
      });
    }

    return sections.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Render a report section as HTML
   */
  private renderSection(section: ReportSection): string {
    let html = `<div class="section">\n  <h2>${section.title}</h2>\n`;

    switch (section.type) {
      case 'text':
        html += `  <div>${JSON.stringify(section.content, null, 2)}</div>\n`;
        break;

      case 'metrics':
        html += this.renderMetrics(section.content);
        break;

      case 'table':
        html += this.renderTable(section.content);
        break;

      case 'recommendations':
        html += this.renderRecommendations(section.content);
        break;

      default:
        html += `  <pre>${JSON.stringify(section.content, null, 2)}</pre>\n`;
    }

    html += `</div>\n`;
    return html;
  }

  private renderMetrics(content: unknown): string {
    return `  <pre>${JSON.stringify(content, null, 2)}</pre>\n`;
  }

  private renderTable(content: unknown): string {
    return `  <pre>${JSON.stringify(content, null, 2)}</pre>\n`;
  }

  private renderRecommendations(content: unknown): string {
    if (!Array.isArray(content)) {
      return `  <pre>${JSON.stringify(content, null, 2)}</pre>\n`;
    }

    let html = '  <ul class="recommendations">\n';
    for (const item of content) {
      const severity = (item as { severity?: string }).severity || 'medium';
      const title = (item as { title?: string }).title || 'Recommendation';
      const description = (item as { description?: string }).description || '';

      html += `    <li class="recommendation ${severity}">\n`;
      html += `      <strong>${title}</strong>\n`;
      html += `      <p>${description}</p>\n`;
      html += `    </li>\n`;
    }
    html += '  </ul>\n';
    return html;
  }
}
