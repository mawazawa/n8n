/**
 * ReportGenerator - Comprehensive experiment reports
 * Generates executive summaries, detailed metrics, and visualizations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExperimentReport, Experiment, AnalysisResult } from './types.js';
import { StatisticalAnalyzer } from './analysis.js';
import { ExperimentManager } from './manager.js';
import { MetricCollector } from './metrics.js';

export class ReportGenerator {
  private supabase: SupabaseClient;
  private analyzer: StatisticalAnalyzer;
  private experimentManager: ExperimentManager;
  private metricCollector: MetricCollector;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.analyzer = new StatisticalAnalyzer(supabase);
    this.experimentManager = new ExperimentManager(supabase);
    this.metricCollector = new MetricCollector(supabase, 0);
  }

  /**
   * Generate comprehensive experiment report
   */
  async generate(experimentId: string): Promise<ExperimentReport> {
    const experiment = await this.experimentManager.getExperiment(experimentId);
    const analysis = await this.analyzer.analyze(experimentId);

    // Generate summary
    const summary = await this.generateSummary(experiment);

    // Generate recommendations
    const recommendations = this.generateRecommendations(experiment, analysis);

    // Generate visualizations
    const visualizations = await this.generateVisualizations(experimentId, experiment);

    return {
      experimentId: experiment.id,
      experimentName: experiment.name,
      summary,
      analysis,
      recommendations,
      visualizations,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate executive summary
   */
  private async generateSummary(experiment: Experiment): Promise<ExperimentReport['summary']> {
    // Get total users
    const { count: totalUsers } = await this.supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', experiment.id);

    // Get total events
    const { count: totalEvents } = await this.supabase
      .from('metric_events')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', experiment.id);

    const duration = experiment.startDate
      ? (experiment.endDate
          ? new Date(experiment.endDate).getTime()
          : Date.now()) - new Date(experiment.startDate).getTime()
      : 0;

    return {
      status: experiment.status,
      duration,
      totalUsers: totalUsers || 0,
      totalEvents: totalEvents || 0,
      startDate: experiment.startDate || '',
      endDate: experiment.endDate,
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    experiment: Experiment,
    analysis: AnalysisResult,
  ): string[] {
    const recommendations: string[] = [];

    // Check sample size
    if (analysis.totalSampleSize < experiment.minimumSampleSize) {
      recommendations.push(
        `⚠️ Sample size (${analysis.totalSampleSize}) is below minimum (${experiment.minimumSampleSize}). Continue experiment to gather more data.`,
      );
    }

    // Check for winner
    if (analysis.recommendation) {
      const winningVariant = analysis.variants.find(
        (v) => v.variantId === analysis.recommendation?.winningVariantId,
      );

      if (winningVariant && !winningVariant.isControl) {
        recommendations.push(
          `✅ ${analysis.recommendation.reason}`,
        );
        recommendations.push(
          `🎯 Recommended action: Roll out variant "${winningVariant.variantName}" to 100% of users.`,
        );
      } else {
        recommendations.push(
          `📊 ${analysis.recommendation.reason}`,
        );
      }
    }

    // Check for significant degradations
    const degradations = analysis.comparisons.filter(
      (c) => c.significance.isSignificant && c.relativeImprovement < -5,
    );

    if (degradations.length > 0) {
      degradations.forEach((deg) => {
        recommendations.push(
          `⚠️ Warning: Variant "${deg.treatment.variantName}" shows ${Math.abs(deg.relativeImprovement).toFixed(1)}% degradation in ${deg.metricName}.`,
        );
      });
      recommendations.push(
        `🛑 Consider stopping underperforming variants.`,
      );
    }

    // Check experiment duration
    const durationDays = analysis.duration / (1000 * 60 * 60 * 24);
    if (durationDays < 7) {
      recommendations.push(
        `📅 Experiment has only run for ${durationDays.toFixed(1)} days. Consider running for at least 7 days to account for weekly patterns.`,
      );
    }

    // Check variant distribution
    const distributions = analysis.variants.map((v) => ({
      name: v.variantName,
      size: v.sampleSize,
      expected: v.isControl ? 0.5 : 0.5 / (analysis.variants.length - 1),
    }));

    const imbalanced = distributions.some(
      (d) => Math.abs(d.size / analysis.totalSampleSize - d.expected) > 0.1,
    );

    if (imbalanced) {
      recommendations.push(
        `⚖️ Traffic distribution is imbalanced. Check assignment logic.`,
      );
    }

    return recommendations;
  }

  /**
   * Generate visualization data
   */
  private async generateVisualizations(
    experimentId: string,
    experiment: Experiment,
  ): Promise<ExperimentReport['visualizations']> {
    const visualizations: ExperimentReport['visualizations'] = [];

    // 1. Variant performance comparison (bar chart)
    const performanceData = await this.generatePerformanceChart(experimentId, experiment);
    visualizations.push({
      type: 'bar-chart',
      data: performanceData,
    });

    // 2. Metric trends over time (line chart)
    const trendsData = await this.generateTrendsChart(experimentId, experiment);
    visualizations.push({
      type: 'line-chart',
      data: trendsData,
    });

    // 3. Confidence intervals (error bars)
    const confidenceData = await this.generateConfidenceChart(experimentId, experiment);
    visualizations.push({
      type: 'confidence-intervals',
      data: confidenceData,
    });

    // 4. Traffic distribution (pie chart)
    const distributionData = await this.generateDistributionChart(experimentId);
    visualizations.push({
      type: 'pie-chart',
      data: distributionData,
    });

    return visualizations;
  }

  /**
   * Generate performance comparison chart data
   */
  private async generatePerformanceChart(
    experimentId: string,
    experiment: Experiment,
  ): Promise<Record<string, unknown>> {
    const primaryMetric = experiment.metrics.find((m) => m.isPrimary);
    if (!primaryMetric) {
      return { series: [] };
    }

    const series = await Promise.all(
      experiment.variants.map(async (variant) => {
        const aggregated = await this.metricCollector.getAggregatedMetrics(
          experimentId,
          variant.id,
        );

        const metricData = aggregated.find((m) => m.metricName === primaryMetric.name);

        return {
          name: variant.name,
          value: metricData?.mean || 0,
          isControl: variant.isControl,
        };
      }),
    );

    return {
      title: `${primaryMetric.name} by Variant`,
      xAxis: 'Variant',
      yAxis: primaryMetric.name,
      unit: primaryMetric.unit || '',
      series,
    };
  }

  /**
   * Generate trends chart data
   */
  private async generateTrendsChart(
    experimentId: string,
    experiment: Experiment,
  ): Promise<Record<string, unknown>> {
    const primaryMetric = experiment.metrics.find((m) => m.isPrimary);
    if (!primaryMetric) {
      return { series: [] };
    }

    const series = await Promise.all(
      experiment.variants.map(async (variant) => {
        const history = await this.metricCollector.getMetricHistory(
          experimentId,
          variant.id,
          primaryMetric.name,
          'day',
        );

        return {
          name: variant.name,
          data: history.map((h) => ({
            timestamp: h.timestamp,
            value: h.mean,
          })),
          isControl: variant.isControl,
        };
      }),
    );

    return {
      title: `${primaryMetric.name} Over Time`,
      xAxis: 'Date',
      yAxis: primaryMetric.name,
      unit: primaryMetric.unit || '',
      series,
    };
  }

  /**
   * Generate confidence intervals chart data
   */
  private async generateConfidenceChart(
    experimentId: string,
    experiment: Experiment,
  ): Promise<Record<string, unknown>> {
    const analysis = await this.analyzer.analyze(experimentId);
    const primaryMetric = experiment.metrics.find((m) => m.isPrimary);

    if (!primaryMetric) {
      return { series: [] };
    }

    const series = analysis.variants.map((variant) => {
      const stats = variant.statistics.get(primaryMetric.name);

      return {
        name: variant.variantName,
        mean: stats?.mean || 0,
        lower: stats?.confidenceInterval.lower || 0,
        upper: stats?.confidenceInterval.upper || 0,
        isControl: variant.isControl,
      };
    });

    return {
      title: `${primaryMetric.name} with ${(experiment.confidenceLevel * 100).toFixed(0)}% Confidence Intervals`,
      xAxis: 'Variant',
      yAxis: primaryMetric.name,
      unit: primaryMetric.unit || '',
      series,
    };
  }

  /**
   * Generate traffic distribution chart data
   */
  private async generateDistributionChart(experimentId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase
      .from('assignments')
      .select('variant_id')
      .eq('experiment_id', experimentId);

    if (error || !data) {
      return { series: [] };
    }

    // Count assignments per variant
    const counts = new Map<string, number>();
    data.forEach((row) => {
      const variantId = row.variant_id as string;
      counts.set(variantId, (counts.get(variantId) || 0) + 1);
    });

    // Get variant names
    const { data: variants } = await this.supabase
      .from('variants')
      .select('id, name')
      .eq('experiment_id', experimentId);

    const series = Array.from(counts.entries()).map(([variantId, count]) => {
      const variant = variants?.find((v) => v.id === variantId);
      return {
        name: variant?.name || variantId,
        value: count,
        percentage: (count / data.length) * 100,
      };
    });

    return {
      title: 'Traffic Distribution',
      series,
    };
  }

  /**
   * Export report as JSON
   */
  async exportJson(experimentId: string): Promise<string> {
    const report = await this.generate(experimentId);
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as Markdown
   */
  async exportMarkdown(experimentId: string): Promise<string> {
    const report = await this.generate(experimentId);

    let md = `# Experiment Report: ${report.experimentName}\n\n`;

    md += `**Generated:** ${new Date(report.generatedAt).toLocaleString()}\n\n`;

    md += `## Summary\n\n`;
    md += `- **Status:** ${report.summary.status}\n`;
    md += `- **Duration:** ${(report.summary.duration / (1000 * 60 * 60 * 24)).toFixed(1)} days\n`;
    md += `- **Total Users:** ${report.summary.totalUsers.toLocaleString()}\n`;
    md += `- **Total Events:** ${report.summary.totalEvents.toLocaleString()}\n\n`;

    if (report.analysis.recommendation) {
      md += `## Recommendation\n\n`;
      md += `**Winner:** ${report.analysis.variants.find((v) => v.variantId === report.analysis.recommendation?.winningVariantId)?.variantName}\n\n`;
      md += `**Confidence:** ${(report.analysis.recommendation.confidence * 100).toFixed(1)}%\n\n`;
      md += `**Reason:** ${report.analysis.recommendation.reason}\n\n`;
    }

    md += `## Key Findings\n\n`;
    report.recommendations.forEach((rec) => {
      md += `- ${rec}\n`;
    });

    md += `\n## Variant Performance\n\n`;
    report.analysis.comparisons.forEach((comp) => {
      md += `### ${comp.metricName}\n\n`;
      md += `- **Control:** ${comp.control.variantName} (mean: ${comp.control.statistics.get(comp.metricName)?.mean.toFixed(3)})\n`;
      md += `- **Treatment:** ${comp.treatment.variantName} (mean: ${comp.treatment.statistics.get(comp.metricName)?.mean.toFixed(3)})\n`;
      md += `- **Improvement:** ${comp.relativeImprovement.toFixed(1)}%\n`;
      md += `- **Significant:** ${comp.significance.isSignificant ? '✅ Yes' : '❌ No'} (p=${comp.significance.pValue.toFixed(4)})\n\n`;
    });

    return md;
  }
}
