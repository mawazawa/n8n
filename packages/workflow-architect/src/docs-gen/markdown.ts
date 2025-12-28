import type { Template, Section, WorkflowAnalysis } from './types';
import { TemplateManager } from './templates';
import { DiagramGenerator } from './diagrams';

/**
 * Markdown Generator
 *
 * Generates Markdown documentation with table of contents and code blocks
 */

interface MarkdownOptions {
	includeTableOfContents?: boolean;
	includeDiagrams?: boolean;
	includeExamples?: boolean;
	maxHeadingLevel?: number;
	codeTheme?: string;
}

export class MarkdownGenerator {
	private templateManager: TemplateManager;
	private diagramGenerator: DiagramGenerator;

	constructor() {
		this.templateManager = new TemplateManager();
		this.diagramGenerator = new DiagramGenerator();
	}

	/**
	 * Generate Markdown documentation from workflow and template
	 */
	async generate(
		workflow: WorkflowAnalysis,
		template: string | Template,
		variables: Record<string, unknown> = {},
		options: MarkdownOptions = {},
	): Promise<string> {
		const {
			includeTableOfContents = true,
			includeDiagrams = true,
			includeExamples = true,
			maxHeadingLevel = 6,
		} = options;

		// Get template
		const templateObj =
			typeof template === 'string' ? this.templateManager.getTemplate(template) : template;

		if (!templateObj) {
			throw new Error(`Template not found: ${template}`);
		}

		// Merge workflow data with variables
		const allVariables = {
			workflowName: workflow.name,
			workflowId: workflow.workflowId,
			description: workflow.description || '',
			...variables,
		};

		// Build document sections
		const sections: string[] = [];

		// Add metadata
		sections.push(this.generateMetadata(workflow, allVariables));
		sections.push('');

		// Add table of contents
		if (includeTableOfContents) {
			sections.push(this.generateTableOfContents(templateObj.sections, maxHeadingLevel));
			sections.push('');
		}

		// Generate each section
		for (const section of templateObj.sections) {
			const sectionContent = await this.generateSection(
				section,
				workflow,
				allVariables,
				includeDiagrams,
				includeExamples,
			);
			sections.push(sectionContent);
			sections.push('');
		}

		// Add workflow analysis section
		if (workflow) {
			sections.push(this.generateAnalysisSection(workflow));
			sections.push('');
		}

		return sections.join('\n');
	}

	/**
	 * Generate document metadata
	 */
	private generateMetadata(
		workflow: WorkflowAnalysis,
		variables: Record<string, unknown>,
	): string {
		const lines: string[] = ['---'];

		lines.push(`title: ${variables.workflowName || workflow.name}`);
		lines.push(`id: ${workflow.workflowId}`);

		if (workflow.description) {
			lines.push(`description: ${workflow.description}`);
		}

		if (variables.version) {
			lines.push(`version: ${variables.version}`);
		}

		if (variables.author) {
			lines.push(`author: ${variables.author}`);
		}

		lines.push(`generated: ${new Date().toISOString()}`);
		lines.push('---');

		return lines.join('\n');
	}

	/**
	 * Generate table of contents
	 */
	private generateTableOfContents(sections: Section[], maxLevel: number): string {
		const lines: string[] = ['## Table of Contents', ''];

		const addSection = (section: Section, level: number): void => {
			if (level > maxLevel) return;

			const indent = '  '.repeat(level - 1);
			const anchor = this.createAnchor(section.title);
			lines.push(`${indent}- [${section.title}](#${anchor})`);

			for (const subsection of section.subsections) {
				addSection(subsection, level + 1);
			}
		};

		for (const section of sections) {
			addSection(section, 1);
		}

		return lines.join('\n');
	}

	/**
	 * Generate a section
	 */
	private async generateSection(
		section: Section,
		workflow: WorkflowAnalysis,
		variables: Record<string, unknown>,
		includeDiagrams: boolean,
		includeExamples: boolean,
	): Promise<string> {
		const lines: string[] = [];

		// Section title
		lines.push(`## ${section.title}`);
		lines.push('');

		// Section content with variable substitution
		const content = this.templateManager.substituteVariables(section.content, variables);
		lines.push(content);
		lines.push('');

		// Add diagrams
		if (includeDiagrams && section.diagrams.length > 0) {
			for (const diagramType of section.diagrams) {
				const diagram = await this.generateDiagramForSection(workflow, diagramType);
				if (diagram) {
					lines.push(diagram);
					lines.push('');
				}
			}
		}

		// Add examples
		if (includeExamples && section.examples.length > 0) {
			lines.push('### Examples');
			lines.push('');

			for (const example of section.examples) {
				lines.push(`#### ${example.title}`);
				if (example.description) {
					lines.push('');
					lines.push(example.description);
				}
				lines.push('');
				lines.push(this.generateCodeBlock(example.code, example.language));
				lines.push('');

				if (example.output) {
					lines.push('**Output:**');
					lines.push('');
					lines.push(this.generateCodeBlock(example.output, 'text'));
					lines.push('');
				}
			}
		}

		// Add subsections
		for (const subsection of section.subsections) {
			const subsectionContent = await this.generateSubsection(
				subsection,
				workflow,
				variables,
				includeDiagrams,
				includeExamples,
			);
			lines.push(subsectionContent);
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Generate a subsection
	 */
	private async generateSubsection(
		section: Section,
		workflow: WorkflowAnalysis,
		variables: Record<string, unknown>,
		includeDiagrams: boolean,
		includeExamples: boolean,
	): Promise<string> {
		const lines: string[] = [];

		lines.push(`### ${section.title}`);
		lines.push('');

		const content = this.templateManager.substituteVariables(section.content, variables);
		lines.push(content);
		lines.push('');

		if (includeDiagrams && section.diagrams.length > 0) {
			for (const diagramType of section.diagrams) {
				const diagram = await this.generateDiagramForSection(workflow, diagramType);
				if (diagram) {
					lines.push(diagram);
					lines.push('');
				}
			}
		}

		if (includeExamples && section.examples.length > 0) {
			for (const example of section.examples) {
				lines.push(`**${example.title}**`);
				lines.push('');
				lines.push(this.generateCodeBlock(example.code, example.language));
				lines.push('');
			}
		}

		return lines.join('\n');
	}

	/**
	 * Generate code block with syntax highlighting
	 */
	private generateCodeBlock(code: string, language: string): string {
		return `\`\`\`${language}\n${code}\n\`\`\``;
	}

	/**
	 * Generate diagram for a section
	 */
	private async generateDiagramForSection(
		workflow: WorkflowAnalysis,
		diagramType: string,
	): Promise<string | null> {
		try {
			let diagram: string;

			switch (diagramType) {
				case 'flowchart':
					diagram = await this.diagramGenerator.generateFlowchart(workflow);
					break;
				case 'sequence':
					diagram = await this.diagramGenerator.generateSequence(workflow);
					break;
				case 'dataflow':
					diagram = await this.diagramGenerator.generateDataFlow(workflow);
					break;
				default:
					return null;
			}

			return `\`\`\`mermaid\n${diagram}\n\`\`\``;
		} catch {
			return null;
		}
	}

	/**
	 * Generate workflow analysis section
	 */
	private generateAnalysisSection(workflow: WorkflowAnalysis): string {
		const lines: string[] = [];

		lines.push('## Workflow Analysis');
		lines.push('');

		// Nodes table
		lines.push('### Nodes');
		lines.push('');
		lines.push('| Node ID | Type | Description |');
		lines.push('|---------|------|-------------|');

		for (const node of workflow.nodes) {
			const description = node.description || 'N/A';
			lines.push(`| ${node.id} | ${node.type} | ${description} |`);
		}
		lines.push('');

		// Connections
		lines.push('### Connections');
		lines.push('');
		lines.push('| From | To |');
		lines.push('|------|-----|');

		for (const conn of workflow.connections) {
			lines.push(`| ${conn.source} | ${conn.target} |`);
		}
		lines.push('');

		// Triggers
		if (workflow.triggers.length > 0) {
			lines.push('### Triggers');
			lines.push('');
			for (const trigger of workflow.triggers) {
				lines.push(`- ${trigger}`);
			}
			lines.push('');
		}

		// Patterns
		if (workflow.patterns.length > 0) {
			lines.push('### Detected Patterns');
			lines.push('');
			for (const pattern of workflow.patterns) {
				lines.push(`#### ${pattern.type}`);
				lines.push('');
				lines.push(pattern.description);
				lines.push('');
			}
		}

		// Complexity
		lines.push('### Complexity Metrics');
		lines.push('');
		lines.push(`**Overall Complexity Score:** ${workflow.complexity.score.toFixed(2)}`);
		lines.push('');
		lines.push('**Factors:**');
		lines.push('');

		for (const [factor, value] of Object.entries(workflow.complexity.factors)) {
			lines.push(`- ${this.formatFactorName(factor)}: ${value}`);
		}
		lines.push('');

		// Purposes
		if (workflow.purposes.length > 0) {
			lines.push('### Identified Purposes');
			lines.push('');
			for (const purpose of workflow.purposes) {
				lines.push(`- ${purpose}`);
			}
			lines.push('');
		}

		// Estimated execution time
		if (workflow.estimatedExecutionTime) {
			lines.push('### Performance');
			lines.push('');
			lines.push(
				`**Estimated Execution Time:** ${this.formatDuration(workflow.estimatedExecutionTime)}`,
			);
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Create URL-safe anchor from heading
	 */
	private createAnchor(heading: string): string {
		return heading
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-');
	}

	/**
	 * Format factor name for display
	 */
	private formatFactorName(factor: string): string {
		return factor
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}

	/**
	 * Format duration in milliseconds to human-readable string
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
		if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
		return `${(ms / 3600000).toFixed(2)}h`;
	}

	/**
	 * Generate a quick reference card
	 */
	generateQuickReference(workflow: WorkflowAnalysis): string {
		const lines: string[] = [];

		lines.push('# Quick Reference');
		lines.push('');
		lines.push(`**Workflow:** ${workflow.name}`);
		lines.push(`**Nodes:** ${workflow.nodes.length}`);
		lines.push(`**Connections:** ${workflow.connections.length}`);
		lines.push('');

		lines.push('## Triggers');
		for (const trigger of workflow.triggers) {
			const node = workflow.nodes.find((n) => n.id === trigger);
			lines.push(`- **${node?.name || trigger}** (${node?.type || 'unknown'})`);
		}
		lines.push('');

		lines.push('## Key Operations');
		const operationNodes = workflow.nodes.filter(
			(n) => !workflow.triggers.includes(n.id),
		);
		for (const node of operationNodes.slice(0, 10)) {
			// Show first 10
			lines.push(`- ${node.name} - ${node.description || node.type}`);
		}

		return lines.join('\n');
	}
}
