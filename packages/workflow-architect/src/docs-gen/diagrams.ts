import type { WorkflowAnalysis, DiagramConfig, DiagramType } from './types';

/**
 * Diagram Generator
 *
 * Generates Mermaid.js diagrams from workflow analysis
 */

export class DiagramGenerator {
	/**
	 * Generate flowchart diagram
	 */
	async generateFlowchart(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { direction = 'TB', includeLabels = true, theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push(`flowchart ${direction}`);

		// Add nodes
		for (const node of workflow.nodes) {
			const nodeId = this.sanitizeId(node.id);
			const label = includeLabels ? node.name : node.id;
			const shape = this.getNodeShape(node.type);

			lines.push(`    ${nodeId}${shape.start}${label}${shape.end}`);
		}

		// Add connections
		for (const conn of workflow.connections) {
			const sourceId = this.sanitizeId(conn.source);
			const targetId = this.sanitizeId(conn.target);
			const label = conn.sourceOutput ? `|${conn.sourceOutput}|` : '';

			lines.push(`    ${sourceId} -->${label} ${targetId}`);
		}

		// Highlight triggers
		if (workflow.triggers.length > 0) {
			for (const trigger of workflow.triggers) {
				const nodeId = this.sanitizeId(trigger);
				lines.push(`    style ${nodeId} fill:#f9f,stroke:#333,stroke-width:4px`);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Generate sequence diagram
	 */
	async generateSequence(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push('sequenceDiagram');

		// Get participants (unique nodes)
		const participants = new Set<string>();
		for (const node of workflow.nodes) {
			participants.add(node.name);
		}

		// Add participants
		for (const participant of participants) {
			lines.push(`    participant ${this.sanitizeId(participant)}`);
		}

		// Add interactions based on connections
		for (const conn of workflow.connections) {
			const source = workflow.nodes.find((n) => n.id === conn.source);
			const target = workflow.nodes.find((n) => n.id === conn.target);

			if (source && target) {
				const sourceId = this.sanitizeId(source.name);
				const targetId = this.sanitizeId(target.name);
				const message = conn.sourceOutput || 'data';

				lines.push(`    ${sourceId}->>${targetId}: ${message}`);
			}
		}

		// Add activation for trigger nodes
		for (const trigger of workflow.triggers) {
			const node = workflow.nodes.find((n) => n.id === trigger);
			if (node) {
				const nodeId = this.sanitizeId(node.name);
				lines.push(`    activate ${nodeId}`);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Generate data flow diagram
	 */
	async generateDataFlow(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { direction = 'LR', theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push(`graph ${direction}`);

		// Track data stores and processes
		const dataStores = new Set<string>();
		const processes = new Set<string>();
		const externalEntities = new Set<string>();

		// Classify nodes
		for (const node of workflow.nodes) {
			const nodeId = this.sanitizeId(node.id);
			const nodeName = node.name;

			if (this.isDataStore(node.type)) {
				dataStores.add(nodeId);
				lines.push(`    ${nodeId}[(${nodeName})]`);
			} else if (this.isExternalEntity(node.type)) {
				externalEntities.add(nodeId);
				lines.push(`    ${nodeId}[/${nodeName}/]`);
			} else {
				processes.add(nodeId);
				lines.push(`    ${nodeId}([${nodeName}])`);
			}
		}

		// Add data flows
		for (const flow of workflow.dataFlows) {
			const fromId = this.sanitizeId(flow.from);
			const toId = this.sanitizeId(flow.to);
			const dataType = flow.dataType || 'data';

			lines.push(`    ${fromId} -->|${dataType}| ${toId}`);
		}

		// Style different types
		if (dataStores.size > 0) {
			const storeList = Array.from(dataStores).join(',');
			lines.push(`    style ${storeList} fill:#e1f5ff,stroke:#01579b`);
		}

		if (externalEntities.size > 0) {
			const entityList = Array.from(externalEntities).join(',');
			lines.push(`    style ${entityList} fill:#fff3e0,stroke:#e65100`);
		}

		return lines.join('\n');
	}

	/**
	 * Generate entity relationship diagram
	 */
	async generateERD(workflow: WorkflowAnalysis, config: Partial<DiagramConfig> = {}): Promise<string> {
		const { theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push('erDiagram');

		// Extract entities from workflow (simplified)
		const entities = this.extractEntities(workflow);

		// Add entities and attributes
		for (const entity of entities) {
			lines.push(`    ${entity.name} {`);
			for (const attr of entity.attributes) {
				lines.push(`        ${attr.type} ${attr.name}`);
			}
			lines.push('    }');
		}

		// Add relationships
		for (const rel of this.extractRelationships(workflow)) {
			lines.push(
				`    ${rel.from} ${rel.cardinality} ${rel.to} : "${rel.description}"`,
			);
		}

		return lines.join('\n');
	}

	/**
	 * Generate architecture diagram
	 */
	async generateArchitecture(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { direction = 'TB', theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push(`graph ${direction}`);

		// Group nodes by pattern/purpose
		const groups = this.groupNodesByPattern(workflow);

		for (const [groupName, nodes] of Object.entries(groups)) {
			lines.push(`    subgraph ${this.sanitizeId(groupName)}[${groupName}]`);
			for (const node of nodes) {
				const nodeId = this.sanitizeId(node.id);
				lines.push(`        ${nodeId}[${node.name}]`);
			}
			lines.push('    end');
		}

		// Add connections
		for (const conn of workflow.connections) {
			const sourceId = this.sanitizeId(conn.source);
			const targetId = this.sanitizeId(conn.target);
			lines.push(`    ${sourceId} --> ${targetId}`);
		}

		return lines.join('\n');
	}

	/**
	 * Generate timeline diagram
	 */
	async generateTimeline(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push('gantt');
		lines.push(`    title ${workflow.name} Execution Timeline`);
		lines.push('    dateFormat YYYY-MM-DD');

		// Calculate execution timeline based on node dependencies
		const timeline = this.calculateExecutionTimeline(workflow);

		for (const item of timeline) {
			lines.push(`    ${item.name} :${item.id}, ${item.start}, ${item.duration}d`);
		}

		return lines.join('\n');
	}

	/**
	 * Generate state diagram
	 */
	async generateStateDiagram(
		workflow: WorkflowAnalysis,
		config: Partial<DiagramConfig> = {},
	): Promise<string> {
		const { theme = 'default' } = config;

		const lines: string[] = [];
		lines.push(`%%{init: {'theme':'${theme}'}}%%`);
		lines.push('stateDiagram-v2');

		// Identify states from workflow
		const states = this.identifyStates(workflow);

		for (const state of states) {
			if (state.isStart) {
				lines.push(`    [*] --> ${this.sanitizeId(state.name)}`);
			}

			if (state.transitions.length > 0) {
				for (const transition of state.transitions) {
					lines.push(
						`    ${this.sanitizeId(state.name)} --> ${this.sanitizeId(transition.to)}: ${transition.condition}`,
					);
				}
			}

			if (state.isEnd) {
				lines.push(`    ${this.sanitizeId(state.name)} --> [*]`);
			}
		}

		return lines.join('\n');
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Sanitize ID for Mermaid
	 */
	private sanitizeId(id: string): string {
		return id.replace(/[^a-zA-Z0-9_]/g, '_');
	}

	/**
	 * Get node shape based on type
	 */
	private getNodeShape(nodeType: string): { start: string; end: string } {
		const type = nodeType.toLowerCase();

		if (type.includes('webhook') || type.includes('trigger')) {
			return { start: '([', end: '])' }; // Stadium shape
		}

		if (type.includes('if') || type.includes('switch')) {
			return { start: '{', end: '}' }; // Diamond shape
		}

		if (type.includes('code') || type.includes('function')) {
			return { start: '[[', end: ']]' }; // Subroutine shape
		}

		if (type.includes('database')) {
			return { start: '[(', end: ')]' }; // Cylindrical shape
		}

		return { start: '[', end: ']' }; // Rectangle (default)
	}

	/**
	 * Check if node is a data store
	 */
	private isDataStore(nodeType: string): boolean {
		const dataStoreTypes = ['database', 'storage', 'cache', 'redis', 'mongodb'];
		return dataStoreTypes.some((type) => nodeType.toLowerCase().includes(type));
	}

	/**
	 * Check if node is an external entity
	 */
	private isExternalEntity(nodeType: string): boolean {
		const externalTypes = ['webhook', 'http', 'api', 'rest'];
		return externalTypes.some((type) => nodeType.toLowerCase().includes(type));
	}

	/**
	 * Extract entities from workflow
	 */
	private extractEntities(
		workflow: WorkflowAnalysis,
	): Array<{ name: string; attributes: Array<{ name: string; type: string }> }> {
		const entities: Array<{ name: string; attributes: Array<{ name: string; type: string }> }> =
			[];

		// Extract from database nodes
		for (const node of workflow.nodes) {
			if (this.isDataStore(node.type)) {
				entities.push({
					name: this.sanitizeId(node.name),
					attributes: [
						{ name: 'id', type: 'int' },
						{ name: 'data', type: 'json' },
						{ name: 'created_at', type: 'timestamp' },
					],
				});
			}
		}

		return entities;
	}

	/**
	 * Extract relationships from workflow
	 */
	private extractRelationships(
		workflow: WorkflowAnalysis,
	): Array<{ from: string; to: string; cardinality: string; description: string }> {
		const relationships: Array<{
			from: string;
			to: string;
			cardinality: string;
			description: string;
		}> = [];

		// Extract from connections between data stores
		for (const conn of workflow.connections) {
			const source = workflow.nodes.find((n) => n.id === conn.source);
			const target = workflow.nodes.find((n) => n.id === conn.target);

			if (source && target && this.isDataStore(source.type) && this.isDataStore(target.type)) {
				relationships.push({
					from: this.sanitizeId(source.name),
					to: this.sanitizeId(target.name),
					cardinality: '||--o{',
					description: 'relates to',
				});
			}
		}

		return relationships;
	}

	/**
	 * Group nodes by pattern
	 */
	private groupNodesByPattern(workflow: WorkflowAnalysis): Record<string, typeof workflow.nodes> {
		const groups: Record<string, typeof workflow.nodes> = {
			'Data Sources': [],
			'Processing': [],
			'Data Sinks': [],
		};

		for (const node of workflow.nodes) {
			if (workflow.triggers.includes(node.id)) {
				groups['Data Sources'].push(node);
			} else if (this.isDataStore(node.type)) {
				groups['Data Sinks'].push(node);
			} else {
				groups['Processing'].push(node);
			}
		}

		return groups;
	}

	/**
	 * Calculate execution timeline
	 */
	private calculateExecutionTimeline(
		workflow: WorkflowAnalysis,
	): Array<{ id: string; name: string; start: string; duration: number }> {
		const timeline: Array<{ id: string; name: string; start: string; duration: number }> = [];
		const today = new Date();

		let currentDay = 0;

		for (const node of workflow.nodes) {
			timeline.push({
				id: this.sanitizeId(node.id),
				name: node.name,
				start: new Date(today.getTime() + currentDay * 24 * 60 * 60 * 1000)
					.toISOString()
					.split('T')[0],
				duration: 1,
			});

			currentDay += 1;
		}

		return timeline;
	}

	/**
	 * Identify states from workflow
	 */
	private identifyStates(
		workflow: WorkflowAnalysis,
	): Array<{ name: string; isStart: boolean; isEnd: boolean; transitions: Array<{ to: string; condition: string }> }> {
		const states: Array<{
			name: string;
			isStart: boolean;
			isEnd: boolean;
			transitions: Array<{ to: string; condition: string }>;
		}> = [];

		for (const node of workflow.nodes) {
			const isStart = workflow.triggers.includes(node.id);
			const outgoingConns = workflow.connections.filter((c) => c.source === node.id);
			const isEnd = outgoingConns.length === 0;

			const transitions = outgoingConns.map((conn) => {
				const target = workflow.nodes.find((n) => n.id === conn.target);
				return {
					to: target ? target.name : conn.target,
					condition: conn.sourceOutput || 'success',
				};
			});

			states.push({
				name: node.name,
				isStart,
				isEnd,
				transitions,
			});
		}

		return states;
	}

	/**
	 * Generate custom diagram from template
	 */
	async generateCustom(template: string, data: Record<string, unknown>): Promise<string> {
		let diagram = template;

		// Replace variables in template
		for (const [key, value] of Object.entries(data)) {
			const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
			diagram = diagram.replace(regex, String(value));
		}

		return diagram;
	}
}
