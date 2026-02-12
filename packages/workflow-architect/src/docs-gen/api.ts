import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import { WorkflowAnalyzer } from './analyzer';
import { MarkdownGenerator } from './markdown';
import { HTMLGenerator } from './html';
import { PDFGenerator } from './pdf';
import { DiagramGenerator } from './diagrams';
import { DocSearch } from './search';
import { DocHosting } from './hosting';
import { RunbookGenerator } from './runbooks';
import { ChangelogGenerator } from './changelog';
import type { WorkflowAnalysis, ExportOptions, DocumentFormat } from './types';

/**
 * Documentation Generator REST API
 *
 * Express router providing REST endpoints for documentation generation
 */

// ============================================================================
// Request Schemas
// ============================================================================

const GenerateDocsRequestSchema = z.object({
	workflow: z.object({
		id: z.string(),
		name: z.string(),
		description: z.string().optional(),
		nodes: z.array(z.any()),
		connections: z.array(z.any()),
	}),
	template: z.string().default('technical'),
	variables: z.record(z.unknown()).optional(),
	format: z.enum(['markdown', 'html', 'pdf', 'json']).default('markdown'),
});

const ExportDocsRequestSchema = z.object({
	workflowId: z.string(),
	format: z.nativeEnum({ MARKDOWN: 'markdown', HTML: 'html', PDF: 'pdf' } as const),
	options: z
		.object({
			includeTableOfContents: z.boolean().optional(),
			includeDiagrams: z.boolean().optional(),
			includeExamples: z.boolean().optional(),
			theme: z.string().optional(),
		})
		.optional(),
});

const SearchDocsRequestSchema = z.object({
	query: z.string(),
	fuzzy: z.boolean().default(true),
	maxResults: z.number().default(10),
});

const PublishDocsRequestSchema = z.object({
	workflowId: z.string(),
	version: z.string().default('1.0.0'),
	provider: z.enum(['github-pages', 'netlify', 'vercel', 's3', 'custom']).optional(),
	domain: z.string().optional(),
});

// ============================================================================
// API Router
// ============================================================================

export function createDocsGenRouter(): Router {
	const router = express.Router();

	// Middleware
	router.use(express.json({ limit: '10mb' }));

	// Services
	const analyzer = new WorkflowAnalyzer();
	const markdownGen = new MarkdownGenerator();
	const htmlGen = new HTMLGenerator();
	const pdfGen = new PDFGenerator();
	const diagramGen = new DiagramGenerator();
	const search = new DocSearch();
	const hosting = new DocHosting();
	const runbookGen = new RunbookGenerator();
	const changelogGen = new ChangelogGenerator();

	// Storage for generated docs
	const documentsStore = new Map<string, { analysis: WorkflowAnalysis; content: string }>();

	// ============================================================================
	// Endpoints
	// ============================================================================

	/**
	 * POST /docs/generate
	 * Generate documentation for a workflow
	 */
	router.post('/generate', async (req: Request, res: Response) => {
		try {
			const body = GenerateDocsRequestSchema.parse(req.body);

			// Analyze workflow
			const analysis = await analyzer.analyze(body.workflow as WorkflowAnalysis);

			// Generate documentation
			let content: string;

			switch (body.format) {
				case 'markdown':
					content = await markdownGen.generate(
						analysis,
						body.template,
						body.variables || {},
					);
					break;
				case 'html':
					content = await htmlGen.generate(analysis, body.template, body.variables || {});
					break;
				case 'pdf':
					const pdfBuffer = await pdfGen.generate(analysis, body.template, {
						format: 'pdf' as DocumentFormat,
					} as ExportOptions);
					res.setHeader('Content-Type', 'application/pdf');
					res.setHeader(
						'Content-Disposition',
						`attachment; filename="${body.workflow.id}.pdf"`,
					);
					return res.send(pdfBuffer);
				case 'json':
					content = JSON.stringify(analysis, null, 2);
					break;
				default:
					throw new Error(`Unsupported format: ${body.format}`);
			}

			// Store generated documentation
			documentsStore.set(body.workflow.id, { analysis, content });

			res.json({
				success: true,
				workflowId: body.workflow.id,
				format: body.format,
				content,
				metadata: {
					generatedAt: new Date().toISOString(),
					nodeCount: analysis.nodes.length,
					connectionCount: analysis.connections.length,
					complexity: analysis.complexity.score,
				},
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * GET /docs/:workflowId
	 * Get documentation for a specific workflow
	 */
	router.get('/:workflowId', (req: Request, res: Response) => {
		try {
			const { workflowId } = req.params;
			const doc = documentsStore.get(workflowId);

			if (!doc) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${workflowId}`,
				});
			}

			res.json({
				success: true,
				workflowId,
				content: doc.content,
				analysis: doc.analysis,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * POST /docs/export
	 * Export documentation to different formats
	 */
	router.post('/export', async (req: Request, res: Response) => {
		try {
			const body = ExportDocsRequestSchema.parse(req.body);
			const doc = documentsStore.get(body.workflowId);

			if (!doc) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${body.workflowId}`,
				});
			}

			const options: ExportOptions = {
				format: body.format as DocumentFormat,
				includeTableOfContents: body.options?.includeTableOfContents ?? true,
				includeDiagrams: body.options?.includeDiagrams ?? true,
				includeExamples: body.options?.includeExamples ?? true,
				theme: body.options?.theme,
			};

			let content: string | Buffer;
			let contentType: string;
			let filename: string;

			switch (body.format) {
				case 'markdown':
					content = await markdownGen.generate(doc.analysis, 'technical');
					contentType = 'text/markdown';
					filename = `${body.workflowId}.md`;
					break;
				case 'html':
					content = await htmlGen.generate(doc.analysis, 'technical');
					contentType = 'text/html';
					filename = `${body.workflowId}.html`;
					break;
				case 'pdf':
					content = await pdfGen.generate(doc.analysis, 'technical', options);
					contentType = 'application/pdf';
					filename = `${body.workflowId}.pdf`;
					break;
				default:
					throw new Error(`Unsupported format: ${body.format}`);
			}

			res.setHeader('Content-Type', contentType);
			res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
			res.send(content);
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * GET /docs/search
	 * Search documentation
	 */
	router.get('/search', async (req: Request, res: Response) => {
		try {
			const query = SearchDocsRequestSchema.parse({
				query: req.query.q || req.query.query || '',
				fuzzy: req.query.fuzzy === 'true',
				maxResults: parseInt((req.query.limit as string) || '10'),
			});

			// Index all documents if not already indexed
			const docs: WorkflowAnalysis[] = Array.from(documentsStore.values()).map(
				(d) => d.analysis,
			);

			// Note: This is a simplified search - in production, you would maintain a persistent index
			const results = await search.search(query.query, {
				fuzzy: query.fuzzy,
				maxResults: query.maxResults,
			});

			res.json({
				success: true,
				query: query.query,
				results,
				total: results.length,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * POST /docs/publish
	 * Publish documentation to hosting provider
	 */
	router.post('/publish', async (req: Request, res: Response) => {
		try {
			const body = PublishDocsRequestSchema.parse(req.body);
			const doc = documentsStore.get(body.workflowId);

			if (!doc) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${body.workflowId}`,
				});
			}

			// Generate HTML for publishing
			const html = await htmlGen.generate(doc.analysis, 'technical');

			// Create file map
			const files = new Map<string, string>();
			files.set('index.html', html);

			// Configure hosting if provider specified
			if (body.provider || body.domain) {
				const hostingConfig = new DocHosting({
					provider: body.provider,
					domain: body.domain,
				});

				const result = await hostingConfig.deploy(files, body.version);

				res.json({
					success: true,
					...result,
				});
			} else {
				// Use default hosting
				const result = await hosting.deploy(files, body.version);

				res.json({
					success: true,
					...result,
				});
			}
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * POST /docs/runbook
	 * Generate operational runbook
	 */
	router.post('/runbook', async (req: Request, res: Response) => {
		try {
			const { workflowId } = req.body;
			const doc = documentsStore.get(workflowId);

			if (!doc) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${workflowId}`,
				});
			}

			const runbook = await runbookGen.generate(doc.analysis);

			res.json({
				success: true,
				runbook,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * POST /docs/diagram
	 * Generate workflow diagram
	 */
	router.post('/diagram', async (req: Request, res: Response) => {
		try {
			const { workflowId, type = 'flowchart' } = req.body;
			const doc = documentsStore.get(workflowId);

			if (!doc) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${workflowId}`,
				});
			}

			let diagram: string;

			switch (type) {
				case 'flowchart':
					diagram = await diagramGen.generateFlowchart(doc.analysis);
					break;
				case 'sequence':
					diagram = await diagramGen.generateSequence(doc.analysis);
					break;
				case 'dataflow':
					diagram = await diagramGen.generateDataFlow(doc.analysis);
					break;
				default:
					throw new Error(`Unsupported diagram type: ${type}`);
			}

			res.json({
				success: true,
				type,
				diagram,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * GET /docs/stats
	 * Get documentation statistics
	 */
	router.get('/stats', (req: Request, res: Response) => {
		try {
			const stats = {
				totalDocuments: documentsStore.size,
				deploymentStats: hosting.getStats(),
				searchStats: search.getIndexStats(),
			};

			res.json({
				success: true,
				stats,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * DELETE /docs/:workflowId
	 * Delete documentation for a workflow
	 */
	router.delete('/:workflowId', (req: Request, res: Response) => {
		try {
			const { workflowId } = req.params;
			const deleted = documentsStore.delete(workflowId);

			if (!deleted) {
				return res.status(404).json({
					success: false,
					error: `Documentation not found for workflow: ${workflowId}`,
				});
			}

			res.json({
				success: true,
				message: `Documentation deleted for workflow: ${workflowId}`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * Error handling middleware
	 */
	router.use((err: Error, req: Request, res: Response) => {
		console.error('API Error:', err);
		res.status(500).json({
			success: false,
			error: err.message || 'Internal server error',
		});
	});

	return router;
}

/**
 * Create and start documentation API server
 */
export function startDocsGenServer(port: number = 3000): void {
	const app = express();
	const router = createDocsGenRouter();

	app.use('/api/docs', router);

	app.listen(port, () => {
		console.log(`Documentation Generator API running on port ${port}`);
		console.log(`API endpoints available at http://localhost:${port}/api/docs`);
	});
}
