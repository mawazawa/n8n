import { z } from 'zod';

/**
 * Documentation Generator Types
 *
 * Comprehensive type definitions for automated documentation generation
 */

// ============================================================================
// Enums
// ============================================================================

export enum DocumentFormat {
	MARKDOWN = 'markdown',
	HTML = 'html',
	PDF = 'pdf',
	DOCX = 'docx',
	JSON = 'json',
}

export enum DiagramType {
	FLOWCHART = 'flowchart',
	SEQUENCE = 'sequence',
	ERD = 'erd',
	DATAFLOW = 'dataflow',
	ARCHITECTURE = 'architecture',
	TIMELINE = 'timeline',
}

export enum TemplateType {
	TECHNICAL = 'technical',
	USER_GUIDE = 'user-guide',
	RUNBOOK = 'runbook',
	API_REFERENCE = 'api-reference',
	CHANGELOG = 'changelog',
	TUTORIAL = 'tutorial',
	CUSTOM = 'custom',
}

export enum SectionType {
	OVERVIEW = 'overview',
	PREREQUISITES = 'prerequisites',
	CONFIGURATION = 'configuration',
	USAGE = 'usage',
	EXAMPLES = 'examples',
	TROUBLESHOOTING = 'troubleshooting',
	API_REFERENCE = 'api-reference',
	DEPLOYMENT = 'deployment',
	SECURITY = 'security',
	FAQ = 'faq',
	CUSTOM = 'custom',
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const DocumentMetadataSchema = z.object({
	title: z.string(),
	version: z.string(),
	author: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
	tags: z.array(z.string()).default([]),
	description: z.string().optional(),
	workflowId: z.string().optional(),
	language: z.string().default('en'),
});

export const ExampleSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	code: z.string(),
	language: z.string().default('javascript'),
	output: z.string().optional(),
});

export const SectionSchema = z.object({
	id: z.string(),
	type: z.nativeEnum(SectionType),
	title: z.string(),
	content: z.string(),
	subsections: z.array(z.lazy(() => SectionSchema)).default([]),
	examples: z.array(ExampleSchema).default([]),
	diagrams: z.array(z.string()).default([]),
	metadata: z.record(z.unknown()).default({}),
	order: z.number().default(0),
});

export const DocumentSchema = z.object({
	id: z.string(),
	metadata: DocumentMetadataSchema,
	sections: z.array(SectionSchema),
	format: z.nativeEnum(DocumentFormat).default(DocumentFormat.MARKDOWN),
	tableOfContents: z.boolean().default(true),
	includeIndex: z.boolean().default(true),
	theme: z.string().optional(),
});

export const TemplateVariableSchema = z.object({
	name: z.string(),
	type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
	description: z.string(),
	required: z.boolean().default(false),
	defaultValue: z.unknown().optional(),
});

export const ConditionalSectionSchema = z.object({
	condition: z.string(), // Expression to evaluate
	sectionId: z.string(),
	elseSection: z.string().optional(),
});

export const TemplateSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.nativeEnum(TemplateType),
	description: z.string(),
	variables: z.array(TemplateVariableSchema).default([]),
	sections: z.array(SectionSchema),
	conditionalSections: z.array(ConditionalSectionSchema).default([]),
	customCSS: z.string().optional(),
	customJS: z.string().optional(),
	metadata: z.record(z.unknown()).default({}),
});

export const WorkflowAnalysisSchema = z.object({
	workflowId: z.string(),
	name: z.string(),
	description: z.string().optional(),
	nodes: z.array(
		z.object({
			id: z.string(),
			type: z.string(),
			name: z.string(),
			description: z.string().optional(),
			parameters: z.record(z.unknown()).default({}),
			position: z.object({ x: z.number(), y: z.number() }).optional(),
		}),
	),
	connections: z.array(
		z.object({
			source: z.string(),
			target: z.string(),
			sourceOutput: z.string().optional(),
			targetInput: z.string().optional(),
		}),
	),
	triggers: z.array(z.string()),
	patterns: z.array(
		z.object({
			type: z.string(),
			description: z.string(),
			nodes: z.array(z.string()),
		}),
	),
	dataFlows: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
			dataType: z.string().optional(),
			transformations: z.array(z.string()).default([]),
		}),
	),
	complexity: z.object({
		score: z.number(),
		factors: z.record(z.number()),
	}),
	purposes: z.array(z.string()),
	estimatedExecutionTime: z.number().optional(),
});

export const DiagramConfigSchema = z.object({
	type: z.nativeEnum(DiagramType),
	title: z.string().optional(),
	theme: z.string().optional(),
	direction: z.enum(['TB', 'BT', 'LR', 'RL']).default('TB'),
	includeLabels: z.boolean().default(true),
	includeIcons: z.boolean().default(true),
	colorScheme: z.record(z.string()).optional(),
});

export const SearchResultSchema = z.object({
	documentId: z.string(),
	title: z.string(),
	snippet: z.string(),
	relevanceScore: z.number(),
	highlights: z.array(z.string()).default([]),
	metadata: z.record(z.unknown()).default({}),
	url: z.string().optional(),
});

export const ChangelogEntrySchema = z.object({
	version: z.string(),
	date: z.date(),
	changes: z.array(
		z.object({
			type: z.enum(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']),
			description: z.string(),
			breaking: z.boolean().default(false),
			migrationGuide: z.string().optional(),
		}),
	),
	author: z.string().optional(),
	releaseNotes: z.string().optional(),
});

export const RunbookSchema = z.object({
	id: z.string(),
	title: z.string(),
	workflowId: z.string(),
	description: z.string(),
	prerequisites: z.array(z.string()).default([]),
	procedures: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			steps: z.array(
				z.object({
					order: z.number(),
					description: z.string(),
					command: z.string().optional(),
					expectedResult: z.string().optional(),
					troubleshooting: z.string().optional(),
				}),
			),
			rollback: z.array(z.string()).default([]),
		}),
	),
	troubleshooting: z.array(
		z.object({
			issue: z.string(),
			symptoms: z.array(z.string()),
			diagnosis: z.string(),
			resolution: z.array(z.string()),
			preventiveMeasures: z.array(z.string()).default([]),
		}),
	),
	emergencyContacts: z.array(
		z.object({
			name: z.string(),
			role: z.string(),
			email: z.string().optional(),
			phone: z.string().optional(),
			availability: z.string().optional(),
		}),
	).default([]),
	metadata: DocumentMetadataSchema,
});

export const APIEndpointSchema = z.object({
	path: z.string(),
	method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']),
	summary: z.string(),
	description: z.string().optional(),
	parameters: z.array(
		z.object({
			name: z.string(),
			in: z.enum(['query', 'header', 'path', 'body', 'cookie']),
			type: z.string(),
			required: z.boolean().default(false),
			description: z.string().optional(),
			example: z.unknown().optional(),
		}),
	).default([]),
	requestBody: z.object({
		contentType: z.string(),
		schema: z.record(z.unknown()),
		examples: z.array(z.unknown()).default([]),
	}).optional(),
	responses: z.array(
		z.object({
			statusCode: z.number(),
			description: z.string(),
			schema: z.record(z.unknown()).optional(),
			examples: z.array(z.unknown()).default([]),
		}),
	),
	authentication: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
});

export const DocHostingConfigSchema = z.object({
	provider: z.enum(['github-pages', 'netlify', 'vercel', 's3', 'custom']),
	domain: z.string().optional(),
	customDomain: z.string().optional(),
	ssl: z.boolean().default(true),
	cdn: z.boolean().default(true),
	versionControl: z.boolean().default(true),
	authentication: z.object({
		enabled: z.boolean().default(false),
		type: z.enum(['basic', 'oauth', 'apikey']).optional(),
		allowedUsers: z.array(z.string()).default([]),
	}).optional(),
	analytics: z.boolean().default(false),
});

export const ExportOptionsSchema = z.object({
	format: z.nativeEnum(DocumentFormat),
	includeTableOfContents: z.boolean().default(true),
	includeDiagrams: z.boolean().default(true),
	includeExamples: z.boolean().default(true),
	theme: z.string().optional(),
	headerTemplate: z.string().optional(),
	footerTemplate: z.string().optional(),
	pageSize: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
	orientation: z.enum(['portrait', 'landscape']).default('portrait'),
	margins: z.object({
		top: z.number().default(20),
		bottom: z.number().default(20),
		left: z.number().default(20),
		right: z.number().default(20),
	}).optional(),
});

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type Example = z.infer<typeof ExampleSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type ConditionalSection = z.infer<typeof ConditionalSectionSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type WorkflowAnalysis = z.infer<typeof WorkflowAnalysisSchema>;
export type DiagramConfig = z.infer<typeof DiagramConfigSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;
export type Runbook = z.infer<typeof RunbookSchema>;
export type APIEndpoint = z.infer<typeof APIEndpointSchema>;
export type DocHostingConfig = z.infer<typeof DocHostingConfigSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

// ============================================================================
// Additional Interfaces
// ============================================================================

export interface GenerationOptions {
	template?: string | Template;
	format?: DocumentFormat;
	includeAnalysis?: boolean;
	includeDiagrams?: boolean;
	includeExamples?: boolean;
	variables?: Record<string, unknown>;
	timeout?: number;
}

export interface Changelog {
	projectName: string;
	entries: ChangelogEntry[];
	format: DocumentFormat;
	groupByType: boolean;
}

export interface IndexEntry {
	term: string;
	documentId: string;
	sectionId: string;
	pageNumber?: number;
	frequency: number;
}

export interface DocumentIndex {
	entries: IndexEntry[];
	metadata: {
		totalDocuments: number;
		totalTerms: number;
		lastUpdated: Date;
	};
}

export interface PublishResult {
	url: string;
	version: string;
	publishedAt: Date;
	metadata: Record<string, unknown>;
}

export interface GenerationProgress {
	stage: 'analyzing' | 'templating' | 'generating' | 'formatting' | 'exporting' | 'complete';
	progress: number; // 0-100
	message: string;
	estimatedTimeRemaining?: number;
}

export interface ValidationResult {
	valid: boolean;
	errors: Array<{
		field: string;
		message: string;
		severity: 'error' | 'warning';
	}>;
	warnings: Array<{
		field: string;
		message: string;
	}>;
}
