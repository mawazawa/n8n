import type { SimulationResult, LoadTestResult, SimulationReport } from './types';
import { SimulationReportSchema } from './types';

/**
 * Report Builder
 * Generates comprehensive simulation reports
 */

export class ReportBuilder {
	/**
	 * Build simulation report
	 */
	build(results: SimulationResult | SimulationResult[]): SimulationReport {
		const resultArray = Array.isArray(results) ? results : [results];

		const reportId = this.generateId();
		const generatedAt = new Date().toISOString();

		// Calculate summary statistics
		const summary = this.buildSummary(resultArray);

		// Build sections
		const sections = this.buildSections(resultArray);

		// Analyze failures
		const failures = this.analyzeFailures(resultArray);

		// Analyze performance
		const performance = this.analyzePerformance(resultArray);

		return SimulationReportSchema.parse({
			id: reportId,
			title: `Simulation Report - ${resultArray.length} Run(s)`,
			summary,
			sections,
			failures,
			performance,
			generatedAt,
		});
	}

	/**
	 * Build load test report
	 */
	buildLoadTestReport(result: LoadTestResult): SimulationReport {
		const reportId = this.generateId();
		const generatedAt = new Date().toISOString();

		const summary = {
			totalExecutions: result.metrics.totalRequests,
			successRate: result.metrics.successRate,
			averageDuration: result.metrics.latency.mean,
			totalErrors: result.metrics.failedRequests,
			recommendations: this.generateLoadTestRecommendations(result),
		};

		const sections = [
			{
				title: 'Overview',
				type: 'metrics' as const,
				data: {
					totalRequests: result.metrics.totalRequests,
					successfulRequests: result.metrics.successfulRequests,
					failedRequests: result.metrics.failedRequests,
					throughput: result.metrics.throughput,
					duration: result.metrics.duration,
				},
			},
			{
				title: 'Latency Distribution',
				type: 'chart' as const,
				data: result.metrics.latency,
			},
			{
				title: 'Time Series',
				type: 'chart' as const,
				data: result.timeSeries,
			},
		];

		const failures = Object.entries(result.metrics.errors).map(([type, count]) => ({
			type,
			count,
			percentage: (count / result.metrics.totalRequests) * 100,
			examples: [],
			recommendation: this.getErrorRecommendation(type),
		}));

		const performance = {
			trends: [
				{
					metric: 'throughput',
					trend: 'stable' as const,
					change: 0,
				},
			],
			bottlenecks: [],
		};

		return SimulationReportSchema.parse({
			id: reportId,
			title: `Load Test Report - ${result.id}`,
			summary,
			sections,
			failures,
			performance,
			generatedAt,
		});
	}

	/**
	 * Build summary statistics
	 */
	private buildSummary(results: SimulationResult[]): SimulationReport['summary'] {
		const totalExecutions = results.reduce(
			(sum, r) => sum + r.aggregateMetrics.totalExecutions,
			0,
		);
		const avgSuccessRate =
			results.reduce((sum, r) => sum + r.aggregateMetrics.successRate, 0) / results.length;
		const avgDuration =
			results.reduce((sum, r) => sum + r.aggregateMetrics.averageDuration, 0) / results.length;
		const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

		const recommendations = this.generateRecommendations(results);

		return {
			totalExecutions,
			successRate: avgSuccessRate,
			averageDuration: avgDuration,
			totalErrors,
			recommendations,
		};
	}

	/**
	 * Build report sections
	 */
	private buildSections(results: SimulationResult[]): SimulationReport['sections'] {
		const sections: SimulationReport['sections'] = [];

		// Overview section
		sections.push({
			title: 'Overview',
			type: 'metrics',
			data: {
				totalRuns: results.length,
				totalExecutions: results.reduce(
					(sum, r) => sum + r.aggregateMetrics.totalExecutions,
					0,
				),
				averageSuccessRate:
					results.reduce((sum, r) => sum + r.aggregateMetrics.successRate, 0) / results.length,
				averageDuration:
					results.reduce((sum, r) => sum + r.aggregateMetrics.averageDuration, 0) / results.length,
			},
		});

		// Performance metrics section
		sections.push({
			title: 'Performance Metrics',
			type: 'table',
			data: results.map((r) => ({
				id: r.id,
				executions: r.aggregateMetrics.totalExecutions,
				successRate: `${(r.aggregateMetrics.successRate * 100).toFixed(2)}%`,
				avgDuration: `${r.aggregateMetrics.averageDuration.toFixed(2)}ms`,
				p95Duration: `${r.aggregateMetrics.p95Duration.toFixed(2)}ms`,
				p99Duration: `${r.aggregateMetrics.p99Duration.toFixed(2)}ms`,
			})),
		});

		// Error summary section
		if (results.some((r) => r.errors.length > 0)) {
			sections.push({
				title: 'Error Summary',
				type: 'table',
				data: this.aggregateErrors(results),
			});
		}

		return sections;
	}

	/**
	 * Analyze failures
	 */
	private analyzeFailures(results: SimulationResult[]): SimulationReport['failures'] {
		const errorMap = new Map<string, { count: number; examples: string[] }>();

		for (const result of results) {
			for (const error of result.errors) {
				const key = error.type;
				const existing = errorMap.get(key) ?? { count: 0, examples: [] };
				existing.count += error.count;
				if (existing.examples.length < 3) {
					existing.examples.push(error.message);
				}
				errorMap.set(key, existing);
			}
		}

		const totalErrors = Array.from(errorMap.values()).reduce((sum, e) => sum + e.count, 0);

		return Array.from(errorMap.entries()).map(([type, data]) => ({
			type,
			count: data.count,
			percentage: (data.count / totalErrors) * 100,
			examples: data.examples,
			recommendation: this.getErrorRecommendation(type),
		}));
	}

	/**
	 * Analyze performance
	 */
	private analyzePerformance(results: SimulationResult[]): SimulationReport['performance'] {
		const trends = this.calculateTrends(results);
		const bottlenecks = this.identifyBottlenecks(results);

		return { trends, bottlenecks };
	}

	/**
	 * Calculate performance trends
	 */
	private calculateTrends(results: SimulationResult[]): SimulationReport['performance']['trends'] {
		if (results.length < 2) {
			return [];
		}

		const trends: SimulationReport['performance']['trends'] = [];

		// Duration trend
		const durations = results.map((r) => r.aggregateMetrics.averageDuration);
		const durationChange = ((durations[durations.length - 1] - durations[0]) / durations[0]) * 100;

		trends.push({
			metric: 'averageDuration',
			trend:
				Math.abs(durationChange) < 5
					? 'stable'
					: durationChange > 0
						? 'degrading'
						: 'improving',
			change: durationChange,
		});

		// Success rate trend
		const successRates = results.map((r) => r.aggregateMetrics.successRate);
		const successRateChange =
			((successRates[successRates.length - 1] - successRates[0]) / successRates[0]) * 100;

		trends.push({
			metric: 'successRate',
			trend:
				Math.abs(successRateChange) < 2
					? 'stable'
					: successRateChange > 0
						? 'improving'
						: 'degrading',
			change: successRateChange,
		});

		return trends;
	}

	/**
	 * Identify bottlenecks
	 */
	private identifyBottlenecks(
		results: SimulationResult[],
	): SimulationReport['performance']['bottlenecks'] {
		// This would analyze node-level performance in real implementation
		// For now, return empty array
		return [];
	}

	/**
	 * Aggregate errors from multiple results
	 */
	private aggregateErrors(results: SimulationResult[]): Array<{
		type: string;
		message: string;
		occurrences: number;
	}> {
		const errorMap = new Map<string, { message: string; occurrences: number }>();

		for (const result of results) {
			for (const error of result.errors) {
				const key = `${error.type}:${error.message}`;
				const existing = errorMap.get(key) ?? { message: error.message, occurrences: 0 };
				existing.occurrences += error.count;
				errorMap.set(key, existing);
			}
		}

		return Array.from(errorMap.entries()).map(([key, data]) => ({
			type: key.split(':')[0],
			message: data.message,
			occurrences: data.occurrences,
		}));
	}

	/**
	 * Generate recommendations based on results
	 */
	private generateRecommendations(results: SimulationResult[]): string[] {
		const recommendations: string[] = [];

		const avgSuccessRate =
			results.reduce((sum, r) => sum + r.aggregateMetrics.successRate, 0) / results.length;

		// Low success rate
		if (avgSuccessRate < 0.95) {
			recommendations.push(
				'Success rate is below 95%. Review error logs and improve error handling.',
			);
		}

		// High P99 latency
		const avgP99 =
			results.reduce((sum, r) => sum + r.aggregateMetrics.p99Duration, 0) / results.length;
		const avgP50 =
			results.reduce((sum, r) => sum + r.aggregateMetrics.p50Duration, 0) / results.length;

		if (avgP99 > avgP50 * 3) {
			recommendations.push(
				'P99 latency is significantly higher than P50. Investigate outliers and optimize slow paths.',
			);
		}

		// High error rate
		const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
		if (totalErrors > 0) {
			recommendations.push(`Found ${totalErrors} unique error types. Review and fix errors.`);
		}

		// Performance degradation
		if (results.length >= 2) {
			const first = results[0];
			const last = results[results.length - 1];
			const degradation =
				(last.aggregateMetrics.averageDuration - first.aggregateMetrics.averageDuration) /
				first.aggregateMetrics.averageDuration;

			if (degradation > 0.1) {
				recommendations.push(
					'Performance degradation detected. Recent runs are 10%+ slower than initial runs.',
				);
			}
		}

		if (recommendations.length === 0) {
			recommendations.push('All metrics look healthy. No issues detected.');
		}

		return recommendations;
	}

	/**
	 * Generate load test recommendations
	 */
	private generateLoadTestRecommendations(result: LoadTestResult): string[] {
		const recommendations: string[] = [];

		// Check success rate
		if (result.metrics.successRate < 0.95) {
			recommendations.push(
				`Success rate is ${(result.metrics.successRate * 100).toFixed(2)}%. Investigate failures.`,
			);
		}

		// Check P95 latency
		if (result.metrics.latency.p95 > 5000) {
			recommendations.push('P95 latency exceeds 5 seconds. Optimize slow endpoints.');
		}

		// Check threshold violations
		if (result.thresholdViolations.length > 0) {
			recommendations.push(
				`${result.thresholdViolations.length} threshold violations detected.`,
			);
		}

		if (recommendations.length === 0) {
			recommendations.push('Load test passed all thresholds.');
		}

		return recommendations;
	}

	/**
	 * Get recommendation for specific error type
	 */
	private getErrorRecommendation(errorType: string): string {
		const recommendations: Record<string, string> = {
			NetworkError: 'Add retry logic and implement circuit breakers.',
			TimeoutError: 'Increase timeout values or optimize long-running operations.',
			ValidationError: 'Review input validation and add better error messages.',
			AuthError: 'Check authentication credentials and token expiration.',
		};

		return recommendations[errorType] ?? 'Review error logs and implement proper error handling.';
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Export report to HTML
	 */
	exportToHTML(report: SimulationReport): string {
		let html = `<!DOCTYPE html>
<html>
<head>
    <title>${report.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
        .recommendation { background: #fff3cd; padding: 10px; margin: 10px 0; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <h1>${report.title}</h1>
    <p>Generated at: ${new Date(report.generatedAt).toLocaleString()}</p>

    <h2>Summary</h2>
    <div class="metric">Total Executions: ${report.summary.totalExecutions}</div>
    <div class="metric">Success Rate: ${(report.summary.successRate * 100).toFixed(2)}%</div>
    <div class="metric">Average Duration: ${report.summary.averageDuration.toFixed(2)}ms</div>
    <div class="metric">Total Errors: ${report.summary.totalErrors}</div>

    <h2>Recommendations</h2>
    ${report.summary.recommendations.map((r) => `<div class="recommendation">${r}</div>`).join('')}

    ${report.sections
			.map(
				(section) => `
        <h2>${section.title}</h2>
        ${section.type === 'table' ? this.renderTable(section.data) : `<pre>${JSON.stringify(section.data, null, 2)}</pre>`}
    `,
			)
			.join('')}

</body>
</html>`;

		return html;
	}

	/**
	 * Render table HTML
	 */
	private renderTable(data: unknown): string {
		if (!Array.isArray(data) || data.length === 0) {
			return '<p>No data</p>';
		}

		const headers = Object.keys(data[0] as object);

		let html = '<table><thead><tr>';
		headers.forEach((h) => {
			html += `<th>${h}</th>`;
		});
		html += '</tr></thead><tbody>';

		data.forEach((row) => {
			html += '<tr>';
			headers.forEach((h) => {
				html += `<td>${(row as Record<string, unknown>)[h]}</td>`;
			});
			html += '</tr>';
		});

		html += '</tbody></table>';
		return html;
	}
}
