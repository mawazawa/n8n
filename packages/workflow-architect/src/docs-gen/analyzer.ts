import type { WorkflowAnalysis } from './types';
import { WorkflowAnalysisSchema } from './types';

/**
 * Workflow Analyzer
 *
 * Analyzes workflows to extract documentation-relevant information
 */

interface WorkflowNode {
	id: string;
	type: string;
	name: string;
	description?: string;
	parameters: Record<string, unknown>;
	position?: { x: number; y: number };
}

interface WorkflowConnection {
	source: string;
	target: string;
	sourceOutput?: string;
	targetInput?: string;
}

interface Workflow {
	id: string;
	name: string;
	description?: string;
	nodes: WorkflowNode[];
	connections: WorkflowConnection[];
	settings?: Record<string, unknown>;
	tags?: string[];
}

interface DataFlow {
	from: string;
	to: string;
	dataType?: string;
	transformations: string[];
}

interface Pattern {
	type: string;
	description: string;
	nodes: string[];
}

export class WorkflowAnalyzer {
	/**
	 * Analyze a workflow and extract documentation-relevant information
	 */
	async analyze(workflow: Workflow): Promise<WorkflowAnalysis> {
		const analysis: WorkflowAnalysis = {
			workflowId: workflow.id,
			name: workflow.name,
			description: workflow.description,
			nodes: this.analyzeNodes(workflow.nodes),
			connections: workflow.connections,
			triggers: this.identifyTriggers(workflow.nodes),
			patterns: this.detectPatterns(workflow),
			dataFlows: this.identifyDataFlows(workflow),
			complexity: this.calculateComplexity(workflow),
			purposes: this.inferPurposes(workflow),
			estimatedExecutionTime: this.estimateExecutionTime(workflow),
		};

		// Validate the analysis
		return WorkflowAnalysisSchema.parse(analysis);
	}

	/**
	 * Analyze individual nodes and extract relevant information
	 */
	private analyzeNodes(nodes: WorkflowNode[]): WorkflowAnalysis['nodes'] {
		return nodes.map((node) => ({
			id: node.id,
			type: node.type,
			name: node.name,
			description: node.description || this.generateNodeDescription(node),
			parameters: this.sanitizeParameters(node.parameters),
			position: node.position,
		}));
	}

	/**
	 * Generate a description for a node based on its type and parameters
	 */
	private generateNodeDescription(node: WorkflowNode): string {
		const descriptions: Record<string, string> = {
			'n8n-nodes-base.httpRequest': 'Makes HTTP requests to external APIs',
			'n8n-nodes-base.webhook': 'Receives webhook events from external services',
			'n8n-nodes-base.cron': 'Triggers workflow on a scheduled basis',
			'n8n-nodes-base.code': 'Executes custom JavaScript code',
			'n8n-nodes-base.if': 'Routes data based on conditional logic',
			'n8n-nodes-base.switch': 'Routes data to different branches',
			'n8n-nodes-base.set': 'Sets or transforms data',
			'n8n-nodes-base.merge': 'Merges data from multiple sources',
			'n8n-nodes-base.split': 'Splits data into multiple items',
		};

		return descriptions[node.type] || `Performs ${node.type} operation`;
	}

	/**
	 * Sanitize parameters by removing sensitive information
	 */
	private sanitizeParameters(parameters: Record<string, unknown>): Record<string, unknown> {
		const sensitiveKeys = ['password', 'apiKey', 'secret', 'token', 'credential'];
		const sanitized: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(parameters)) {
			const lowerKey = key.toLowerCase();
			const isSensitive = sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));

			if (isSensitive) {
				sanitized[key] = '***REDACTED***';
			} else if (typeof value === 'object' && value !== null) {
				sanitized[key] = this.sanitizeParameters(value as Record<string, unknown>);
			} else {
				sanitized[key] = value;
			}
		}

		return sanitized;
	}

	/**
	 * Identify trigger nodes in the workflow
	 */
	private identifyTriggers(nodes: WorkflowNode[]): string[] {
		const triggerTypes = ['webhook', 'cron', 'schedule', 'trigger', 'start'];
		return nodes
			.filter((node) => triggerTypes.some((type) => node.type.toLowerCase().includes(type)))
			.map((node) => node.id);
	}

	/**
	 * Detect common patterns in the workflow
	 */
	private detectPatterns(workflow: Workflow): Pattern[] {
		const patterns: Pattern[] = [];

		// ETL Pattern
		const etlPattern = this.detectETLPattern(workflow);
		if (etlPattern) patterns.push(etlPattern);

		// Error Handling Pattern
		const errorPattern = this.detectErrorHandlingPattern(workflow);
		if (errorPattern) patterns.push(errorPattern);

		// Fan-out/Fan-in Pattern
		const fanPattern = this.detectFanPattern(workflow);
		if (fanPattern) patterns.push(fanPattern);

		// Polling Pattern
		const pollingPattern = this.detectPollingPattern(workflow);
		if (pollingPattern) patterns.push(pollingPattern);

		return patterns;
	}

	private detectETLPattern(workflow: Workflow): Pattern | null {
		const extractNodes = workflow.nodes.filter((n) =>
			['httpRequest', 'database', 'api'].some((t) => n.type.includes(t)),
		);
		const transformNodes = workflow.nodes.filter((n) =>
			['code', 'set', 'function'].some((t) => n.type.includes(t)),
		);
		const loadNodes = workflow.nodes.filter((n) =>
			['database', 'storage', 'write'].some((t) => n.type.includes(t)),
		);

		if (extractNodes.length > 0 && transformNodes.length > 0 && loadNodes.length > 0) {
			return {
				type: 'ETL',
				description: 'Extract, Transform, Load pattern for data processing',
				nodes: [...extractNodes, ...transformNodes, ...loadNodes].map((n) => n.id),
			};
		}

		return null;
	}

	private detectErrorHandlingPattern(workflow: Workflow): Pattern | null {
		const errorNodes = workflow.nodes.filter((n) =>
			['error', 'catch', 'try', 'retry'].some((t) => n.type.toLowerCase().includes(t)),
		);

		if (errorNodes.length > 0) {
			return {
				type: 'Error Handling',
				description: 'Error handling and recovery mechanisms',
				nodes: errorNodes.map((n) => n.id),
			};
		}

		return null;
	}

	private detectFanPattern(workflow: Workflow): Pattern | null {
		const nodeConnections = new Map<string, number>();

		for (const conn of workflow.connections) {
			nodeConnections.set(conn.source, (nodeConnections.get(conn.source) || 0) + 1);
		}

		const fanOutNodes = Array.from(nodeConnections.entries())
			.filter(([_, count]) => count > 2)
			.map(([id]) => id);

		if (fanOutNodes.length > 0) {
			return {
				type: 'Fan-out/Fan-in',
				description: 'Parallel processing with multiple branches',
				nodes: fanOutNodes,
			};
		}

		return null;
	}

	private detectPollingPattern(workflow: Workflow): Pattern | null {
		const pollingNodes = workflow.nodes.filter((n) =>
			['cron', 'schedule', 'interval'].some((t) => n.type.toLowerCase().includes(t)),
		);

		if (pollingNodes.length > 0) {
			return {
				type: 'Polling',
				description: 'Periodic data retrieval and processing',
				nodes: pollingNodes.map((n) => n.id),
			};
		}

		return null;
	}

	/**
	 * Identify data flows between nodes
	 */
	private identifyDataFlows(workflow: Workflow): DataFlow[] {
		const flows: DataFlow[] = [];

		for (const connection of workflow.connections) {
			const sourceNode = workflow.nodes.find((n) => n.id === connection.source);
			const targetNode = workflow.nodes.find((n) => n.id === connection.target);

			if (sourceNode && targetNode) {
				flows.push({
					from: connection.source,
					to: connection.target,
					dataType: this.inferDataType(sourceNode, targetNode),
					transformations: this.detectTransformations(sourceNode, targetNode),
				});
			}
		}

		return flows;
	}

	private inferDataType(sourceNode: WorkflowNode, targetNode: WorkflowNode): string {
		// Infer data type based on node types
		if (sourceNode.type.includes('database')) return 'database-records';
		if (sourceNode.type.includes('http')) return 'json-response';
		if (sourceNode.type.includes('file')) return 'file-data';
		if (sourceNode.type.includes('webhook')) return 'webhook-payload';

		return 'generic-data';
	}

	private detectTransformations(sourceNode: WorkflowNode, targetNode: WorkflowNode): string[] {
		const transformations: string[] = [];

		if (targetNode.type.includes('code') || targetNode.type.includes('function')) {
			transformations.push('custom-code-transformation');
		}

		if (targetNode.type.includes('set')) {
			transformations.push('field-mapping');
		}

		if (targetNode.type.includes('merge')) {
			transformations.push('data-merging');
		}

		if (targetNode.type.includes('split')) {
			transformations.push('data-splitting');
		}

		return transformations;
	}

	/**
	 * Calculate workflow complexity
	 */
	private calculateComplexity(workflow: Workflow): WorkflowAnalysis['complexity'] {
		const factors = {
			nodeCount: workflow.nodes.length,
			connectionCount: workflow.connections.length,
			branchingFactor: this.calculateBranchingFactor(workflow),
			cyclomaticComplexity: this.calculateCyclomaticComplexity(workflow),
			nestingDepth: this.calculateNestingDepth(workflow),
		};

		// Calculate overall complexity score (0-100)
		const score = Math.min(
			100,
			factors.nodeCount * 2 +
				factors.connectionCount * 1.5 +
				factors.branchingFactor * 10 +
				factors.cyclomaticComplexity * 5 +
				factors.nestingDepth * 8,
		);

		return { score, factors };
	}

	private calculateBranchingFactor(workflow: Workflow): number {
		const outgoingConnections = new Map<string, number>();

		for (const conn of workflow.connections) {
			outgoingConnections.set(conn.source, (outgoingConnections.get(conn.source) || 0) + 1);
		}

		const branches = Array.from(outgoingConnections.values()).filter((count) => count > 1);
		return branches.length;
	}

	private calculateCyclomaticComplexity(workflow: Workflow): number {
		// V(G) = E - N + 2P
		// E = edges (connections), N = nodes, P = connected components (assume 1)
		const edges = workflow.connections.length;
		const nodes = workflow.nodes.length;
		return Math.max(1, edges - nodes + 2);
	}

	private calculateNestingDepth(workflow: Workflow): number {
		// Calculate maximum depth by traversing from trigger nodes
		const triggers = this.identifyTriggers(workflow.nodes);
		let maxDepth = 0;

		for (const triggerId of triggers) {
			const depth = this.calculateNodeDepth(triggerId, workflow.connections, new Set());
			maxDepth = Math.max(maxDepth, depth);
		}

		return maxDepth;
	}

	private calculateNodeDepth(
		nodeId: string,
		connections: WorkflowConnection[],
		visited: Set<string>,
	): number {
		if (visited.has(nodeId)) return 0; // Prevent infinite loops
		visited.add(nodeId);

		const outgoing = connections.filter((c) => c.source === nodeId);
		if (outgoing.length === 0) return 1;

		let maxChildDepth = 0;
		for (const conn of outgoing) {
			const childDepth = this.calculateNodeDepth(conn.target, connections, new Set(visited));
			maxChildDepth = Math.max(maxChildDepth, childDepth);
		}

		return 1 + maxChildDepth;
	}

	/**
	 * Infer the purposes of the workflow
	 */
	private inferPurposes(workflow: Workflow): string[] {
		const purposes: Set<string> = new Set();

		// Check workflow description
		if (workflow.description) {
			const desc = workflow.description.toLowerCase();
			if (desc.includes('sync')) purposes.add('Data Synchronization');
			if (desc.includes('notification')) purposes.add('Notifications');
			if (desc.includes('backup')) purposes.add('Data Backup');
			if (desc.includes('report')) purposes.add('Reporting');
			if (desc.includes('monitor')) purposes.add('Monitoring');
		}

		// Infer from node types
		const nodeTypes = workflow.nodes.map((n) => n.type.toLowerCase());

		if (nodeTypes.some((t) => t.includes('database'))) purposes.add('Database Operations');
		if (nodeTypes.some((t) => t.includes('email') || t.includes('slack')))
			purposes.add('Communication');
		if (nodeTypes.some((t) => t.includes('http') || t.includes('api')))
			purposes.add('API Integration');
		if (nodeTypes.some((t) => t.includes('schedule') || t.includes('cron')))
			purposes.add('Scheduled Automation');
		if (nodeTypes.some((t) => t.includes('webhook'))) purposes.add('Event-Driven Processing');

		return Array.from(purposes);
	}

	/**
	 * Estimate workflow execution time in milliseconds
	 */
	private estimateExecutionTime(workflow: Workflow): number {
		// Base time per node (ms)
		const baseTimePerNode = 100;

		// Additional time based on node type
		const nodeTypeTimes: Record<string, number> = {
			httpRequest: 500,
			database: 300,
			code: 200,
			webhook: 50,
			schedule: 10,
		};

		let totalTime = 0;

		for (const node of workflow.nodes) {
			totalTime += baseTimePerNode;

			for (const [type, time] of Object.entries(nodeTypeTimes)) {
				if (node.type.includes(type)) {
					totalTime += time;
					break;
				}
			}
		}

		// Add connection overhead
		totalTime += workflow.connections.length * 10;

		return totalTime;
	}
}
