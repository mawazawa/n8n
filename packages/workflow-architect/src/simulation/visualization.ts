import type {
	SimulationResult,
	LoadTestResult,
	TimelineData,
	HeatmapData,
} from './types';
import { TimelineDataSchema, HeatmapDataSchema } from './types';

/**
 * Simulation Visualizer
 * Generates visualization data for simulation results
 */

export class SimulationVisualizer {
	/**
	 * Generate timeline data from simulation result
	 */
	generateTimeline(result: SimulationResult): TimelineData {
		const events: TimelineData['events'] = [];
		const lanes: TimelineData['lanes'] = [];

		// Create events from executions
		for (const execution of result.executions) {
			events.push({
				time: execution.metrics.startTime,
				type: execution.metrics.success ? 'success' : 'error',
				label: `Execution ${execution.iteration}`,
				duration: execution.metrics.duration,
				metadata: {
					executionId: execution.id,
					nodeExecutions: execution.metrics.nodeExecutions,
					dataProcessed: execution.metrics.dataProcessed,
				},
			});
		}

		// Create a single lane for now (could be expanded for parallel executions)
		lanes.push({
			id: 'executions',
			label: 'Workflow Executions',
			events: events.map((_, i) => i),
		});

		return TimelineDataSchema.parse({ events, lanes });
	}

	/**
	 * Generate heatmap from load test result
	 */
	generateHeatmap(result: LoadTestResult): HeatmapData {
		const timeSeries = result.timeSeries;
		const bucketSize = 10; // Group into buckets

		// Group data into buckets
		const buckets: number[][] = [];
		for (let i = 0; i < timeSeries.length; i += bucketSize) {
			const bucket = timeSeries.slice(i, i + bucketSize);
			buckets.push(bucket.map((b) => b.latency));
		}

		// Create 2D heatmap data
		const data: HeatmapData['data'] = buckets.map((bucket) =>
			bucket.map((latency) => ({
				value: latency,
				label: `${latency.toFixed(0)}ms`,
			})),
		);

		// Create labels
		const xLabels = Array.from(
			{ length: Math.min(bucketSize, timeSeries.length) },
			(_, i) => `T${i}`,
		);
		const yLabels = Array.from({ length: buckets.length }, (_, i) => `B${i}`);

		// Calculate color scale
		const allValues = data.flat().map((d) => d.value);
		const colorScale = {
			min: Math.min(...allValues),
			max: Math.max(...allValues),
			colors: ['#00ff00', '#ffff00', '#ff0000'], // Green to yellow to red
		};

		return HeatmapDataSchema.parse({
			data,
			xLabels,
			yLabels,
			colorScale,
		});
	}

	/**
	 * Generate latency distribution chart data
	 */
	generateLatencyDistribution(result: SimulationResult): {
		buckets: Array<{ range: string; count: number }>;
		percentiles: Array<{ percentile: string; value: number }>;
	} {
		const durations = result.executions.map((e) => e.metrics.duration);
		const sorted = [...durations].sort((a, b) => a - b);

		// Create histogram buckets
		const min = Math.min(...durations);
		const max = Math.max(...durations);
		const bucketCount = 10;
		const bucketSize = (max - min) / bucketCount;

		const buckets: Array<{ range: string; count: number }> = [];
		for (let i = 0; i < bucketCount; i++) {
			const rangeStart = min + i * bucketSize;
			const rangeEnd = min + (i + 1) * bucketSize;
			const count = durations.filter((d) => d >= rangeStart && d < rangeEnd).length;

			buckets.push({
				range: `${rangeStart.toFixed(0)}-${rangeEnd.toFixed(0)}ms`,
				count,
			});
		}

		// Calculate percentiles
		const percentiles = [
			{ percentile: 'P50', value: this.percentile(sorted, 0.5) },
			{ percentile: 'P75', value: this.percentile(sorted, 0.75) },
			{ percentile: 'P90', value: this.percentile(sorted, 0.9) },
			{ percentile: 'P95', value: this.percentile(sorted, 0.95) },
			{ percentile: 'P99', value: this.percentile(sorted, 0.99) },
		];

		return { buckets, percentiles };
	}

	/**
	 * Generate throughput over time chart data
	 */
	generateThroughputChart(result: LoadTestResult): Array<{ time: number; throughput: number }> {
		return result.timeSeries.map((ts) => ({
			time: ts.timestamp,
			throughput: ts.throughput,
		}));
	}

	/**
	 * Generate error rate chart data
	 */
	generateErrorRateChart(result: LoadTestResult): Array<{ time: number; errorRate: number }> {
		return result.timeSeries.map((ts) => ({
			time: ts.timestamp,
			errorRate: ts.errorRate * 100, // Convert to percentage
		}));
	}

	/**
	 * Generate concurrency chart data
	 */
	generateConcurrencyChart(result: LoadTestResult): Array<{ time: number; concurrency: number }> {
		return result.timeSeries.map((ts) => ({
			time: ts.timestamp,
			concurrency: ts.concurrency,
		}));
	}

	/**
	 * Export timeline to SVG
	 */
	exportTimelineToSVG(timeline: TimelineData): string {
		const width = 1000;
		const height = 400;
		const margin = { top: 20, right: 20, bottom: 40, left: 100 };

		let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

		// Background
		svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

		// Calculate time range
		const times = timeline.events.map((e) => e.time);
		const minTime = Math.min(...times);
		const maxTime = Math.max(...times);
		const timeRange = maxTime - minTime;

		const chartWidth = width - margin.left - margin.right;
		const laneHeight = (height - margin.top - margin.bottom) / timeline.lanes.length;

		// Draw lanes
		timeline.lanes.forEach((lane, laneIndex) => {
			const y = margin.top + laneIndex * laneHeight;

			// Lane label
			svg += `<text x="${margin.left - 10}" y="${y + laneHeight / 2}" text-anchor="end" font-size="12">${lane.label}</text>`;

			// Lane background
			svg += `<rect x="${margin.left}" y="${y}" width="${chartWidth}" height="${laneHeight}" fill="#f0f0f0" stroke="#ccc"/>`;

			// Draw events
			lane.events.forEach((eventIndex) => {
				const event = timeline.events[eventIndex];
				const x = margin.left + ((event.time - minTime) / timeRange) * chartWidth;
				const eventWidth = event.duration
					? Math.max(5, (event.duration / timeRange) * chartWidth)
					: 5;

				const color = event.type === 'success' ? '#4caf50' : '#f44336';

				svg += `<rect x="${x}" y="${y + 5}" width="${eventWidth}" height="${laneHeight - 10}" fill="${color}" opacity="0.8"/>`;
			});
		});

		svg += '</svg>';
		return svg;
	}

	/**
	 * Export heatmap to HTML
	 */
	exportHeatmapToHTML(heatmap: HeatmapData): string {
		const cellSize = 30;
		const width = heatmap.xLabels.length * cellSize;
		const height = heatmap.yLabels.length * cellSize;

		let html = '<div style="font-family: Arial, sans-serif;">';
		html += `<div style="display: grid; grid-template-columns: repeat(${heatmap.xLabels.length}, ${cellSize}px);">`;

		for (const row of heatmap.data) {
			for (const cell of row) {
				const colorScale = heatmap.colorScale;
				const normalized = colorScale
					? (cell.value - colorScale.min) / (colorScale.max - colorScale.min)
					: 0.5;
				const color = this.interpolateColor(normalized);

				html += `<div style="width: ${cellSize}px; height: ${cellSize}px; background-color: ${color}; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px;">`;
				html += cell.label ?? '';
				html += '</div>';
			}
		}

		html += '</div></div>';
		return html;
	}

	/**
	 * Calculate percentile
	 */
	private percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.ceil(sorted.length * p) - 1;
		return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
	}

	/**
	 * Interpolate color based on value (0-1)
	 */
	private interpolateColor(value: number): string {
		const r = Math.round(255 * value);
		const g = Math.round(255 * (1 - value));
		const b = 0;
		return `rgb(${r}, ${g}, ${b})`;
	}

	/**
	 * Export to JSON
	 */
	exportToJSON(data: unknown): string {
		return JSON.stringify(data, null, 2);
	}
}
