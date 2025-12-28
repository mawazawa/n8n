/**
 * Documentation Generator
 *
 * Comprehensive documentation generation system for workflows
 *
 * @module docs-gen
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
	Document,
	DocumentMetadata,
	Section,
	Example,
	Template,
	TemplateVariable,
	ConditionalSection,
	WorkflowAnalysis,
	DiagramConfig,
	SearchResult,
	ChangelogEntry,
	Changelog,
	Runbook,
	APIEndpoint,
	DocHostingConfig,
	ExportOptions,
	GenerationOptions,
	IndexEntry,
	DocumentIndex,
	PublishResult,
	GenerationProgress,
	ValidationResult,
} from './types';

export {
	DocumentFormat,
	DiagramType,
	TemplateType,
	SectionType,
	DocumentMetadataSchema,
	ExampleSchema,
	SectionSchema,
	DocumentSchema,
	TemplateSchema,
	WorkflowAnalysisSchema,
	DiagramConfigSchema,
	SearchResultSchema,
	ChangelogEntrySchema,
	RunbookSchema,
	APIEndpointSchema,
	DocHostingConfigSchema,
	ExportOptionsSchema,
} from './types';

// ============================================================================
// Class Exports
// ============================================================================

export { WorkflowAnalyzer } from './analyzer';
export { TemplateManager } from './templates';
export { MarkdownGenerator } from './markdown';
export { HTMLGenerator } from './html';
export { PDFGenerator } from './pdf';
export { DiagramGenerator } from './diagrams';
export { APIDocGenerator } from './api-docs';
export { RunbookGenerator } from './runbooks';
export { ChangelogGenerator } from './changelog';
export { DocSearch } from './search';
export { DocHosting } from './hosting';
export { createDocsGenRouter, startDocsGenServer } from './api';

// ============================================================================
// Main Documentation Generator Class
// ============================================================================

import { WorkflowAnalyzer } from './analyzer';
import { TemplateManager } from './templates';
import { MarkdownGenerator } from './markdown';
import { HTMLGenerator } from './html';
import { PDFGenerator } from './pdf';
import { DiagramGenerator } from './diagrams';
import { RunbookGenerator } from './runbooks';
import { DocSearch } from './search';
import { DocHosting } from './hosting';
import type {
	WorkflowAnalysis,
	Document,
	GenerationOptions,
	DocumentFormat,
	ExportOptions,
} from './types';

/**
 * Main Documentation Generator
 *
 * Unified interface for all documentation generation features
 */
export class DocumentationGenerator {
	private analyzer: WorkflowAnalyzer;
	private templateManager: TemplateManager;
	private markdownGen: MarkdownGenerator;
	private htmlGen: HTMLGenerator;
	private pdfGen: PDFGenerator;
	private diagramGen: DiagramGenerator;
	private runbookGen: RunbookGenerator;
	private search: DocSearch;
	private hosting: DocHosting;

	constructor() {
		this.analyzer = new WorkflowAnalyzer();
		this.templateManager = new TemplateManager();
		this.markdownGen = new MarkdownGenerator();
		this.htmlGen = new HTMLGenerator();
		this.pdfGen = new PDFGenerator();
		this.diagramGen = new DiagramGenerator();
		this.runbookGen = new RunbookGenerator();
		this.search = new DocSearch();
		this.hosting = new DocHosting();
	}

	/**
	 * Generate documentation for a workflow
	 */
	async generate(
		workflow: WorkflowAnalysis,
		options: GenerationOptions = {},
	): Promise<string | Buffer> {
		const {
			template = 'technical',
			format = DocumentFormat.MARKDOWN,
			includeAnalysis = true,
			includeDiagrams = true,
			includeExamples = true,
			variables = {},
			timeout = 5000,
		} = options;

		// Set timeout
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Generation timeout')), timeout),
		);

		// Generate documentation
		const generatePromise = (async () => {
			// Analyze if needed
			const analysis = includeAnalysis ? workflow : workflow;

			// Generate based on format
			switch (format) {
				case DocumentFormat.MARKDOWN:
					return this.markdownGen.generate(analysis, template, variables, {
						includeDiagrams,
						includeExamples,
					});

				case DocumentFormat.HTML:
					return this.htmlGen.generate(analysis, template, variables, {
						includeDiagrams,
						includeSearch: true,
						responsive: true,
					});

				case DocumentFormat.PDF:
					return this.pdfGen.generate(analysis, template, {
						format,
						includeDiagrams,
						includeExamples,
					} as ExportOptions);

				case DocumentFormat.JSON:
					return JSON.stringify(analysis, null, 2);

				default:
					throw new Error(`Unsupported format: ${format}`);
			}
		})();

		return Promise.race([generatePromise, timeoutPromise]) as Promise<string | Buffer>;
	}

	/**
	 * Generate runbook for a workflow
	 */
	async generateRunbook(workflow: WorkflowAnalysis): Promise<string> {
		const runbook = await this.runbookGen.generate(workflow);
		return this.runbookGen.export(runbook, 'markdown') as Promise<string>;
	}

	/**
	 * Generate diagram for a workflow
	 */
	async generateDiagram(
		workflow: WorkflowAnalysis,
		type: 'flowchart' | 'sequence' | 'dataflow' = 'flowchart',
	): Promise<string> {
		switch (type) {
			case 'flowchart':
				return this.diagramGen.generateFlowchart(workflow);
			case 'sequence':
				return this.diagramGen.generateSequence(workflow);
			case 'dataflow':
				return this.diagramGen.generateDataFlow(workflow);
			default:
				throw new Error(`Unsupported diagram type: ${type}`);
		}
	}

	/**
	 * Export documentation to specific format
	 */
	async export(
		workflow: WorkflowAnalysis,
		format: DocumentFormat,
		options: ExportOptions = { format },
	): Promise<string | Buffer> {
		return this.generate(workflow, { ...options, format });
	}

	/**
	 * Publish documentation to hosting
	 */
	async publish(workflow: WorkflowAnalysis, version: string = '1.0.0'): Promise<string> {
		// Generate HTML
		const html = await this.htmlGen.generate(workflow, 'technical');

		// Create file map
		const files = new Map<string, string>();
		files.set('index.html', html);

		// Deploy
		const result = await this.hosting.deploy(files, version);

		return result.url;
	}

	/**
	 * Search documentation
	 */
	async search(query: string, documents: Document[]): Promise<typeof documents> {
		// Index documents
		await this.search.index(documents);

		// Search
		const results = await this.search.search(query);

		// Return matching documents
		return documents.filter((doc) => results.some((r) => r.documentId === doc.id));
	}

	/**
	 * Get all available templates
	 */
	getTemplates(): ReturnType<typeof this.templateManager.listTemplates> {
		return this.templateManager.listTemplates();
	}

	/**
	 * Analyze a workflow
	 */
	async analyze(workflow: WorkflowAnalysis): Promise<WorkflowAnalysis> {
		return this.analyzer.analyze(workflow);
	}
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick generate - convenience function for simple documentation generation
 */
export async function quickGenerate(
	workflow: WorkflowAnalysis,
	format: DocumentFormat = DocumentFormat.MARKDOWN,
): Promise<string | Buffer> {
	const generator = new DocumentationGenerator();
	return generator.generate(workflow, { format });
}

/**
 * Generate markdown documentation
 */
export async function generateMarkdown(
	workflow: WorkflowAnalysis,
	template: string = 'technical',
): Promise<string> {
	const generator = new DocumentationGenerator();
	return generator.generate(workflow, {
		format: DocumentFormat.MARKDOWN,
		template,
	}) as Promise<string>;
}

/**
 * Generate HTML documentation
 */
export async function generateHTML(
	workflow: WorkflowAnalysis,
	template: string = 'technical',
): Promise<string> {
	const generator = new DocumentationGenerator();
	return generator.generate(workflow, {
		format: DocumentFormat.HTML,
		template,
	}) as Promise<string>;
}

/**
 * Generate PDF documentation
 */
export async function generatePDF(
	workflow: WorkflowAnalysis,
	template: string = 'technical',
): Promise<Buffer> {
	const generator = new DocumentationGenerator();
	return generator.generate(workflow, {
		format: DocumentFormat.PDF,
		template,
	}) as Promise<Buffer>;
}

/**
 * Generate workflow diagram
 */
export async function generateDiagram(
	workflow: WorkflowAnalysis,
	type: 'flowchart' | 'sequence' | 'dataflow' = 'flowchart',
): Promise<string> {
	const generator = new DocumentationGenerator();
	return generator.generateDiagram(workflow, type);
}

/**
 * Generate operational runbook
 */
export async function generateRunbook(workflow: WorkflowAnalysis): Promise<string> {
	const generator = new DocumentationGenerator();
	return generator.generateRunbook(workflow);
}

/**
 * Publish documentation to hosting
 */
export async function publishDocs(
	workflow: WorkflowAnalysis,
	version: string = '1.0.0',
): Promise<string> {
	const generator = new DocumentationGenerator();
	return generator.publish(workflow, version);
}

// ============================================================================
// Default Export
// ============================================================================

export default DocumentationGenerator;
