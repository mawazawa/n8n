/**
 * Custom Node Builder - Main Exports
 * Export all node builder functionality
 */

// Types
export type {
	NodeDefinition,
	PropertyDefinition,
	OperationDefinition,
	ResourceDefinition,
	CredentialDefinition,
	CredentialPropertyDefinition,
	CredentialTest,
	PropertyOption,
	RoutingConfig,
	PaginationConfig,
	IconConfig,
	IconData,
	ValidationResult,
	ValidationError,
	ValidationWarning,
	CompiledNode,
	ExecutionResult,
	RegisteredNode,
	PackageMetadata,
	OpenAPISpec,
	PostmanCollection,
	N8nNodeDefinition,
	AIGenerationContext,
} from './types';

export {
	NodeCategory,
	OperationType,
	PropertyType,
	TemplateType,
} from './types';

// Schema validation
export {
	validateNodeDefinition,
	validateProperty,
	nodeDefinitionSchema,
	propertyDefinitionSchema,
	operationDefinitionSchema,
	resourceDefinitionSchema,
	credentialDefinitionSchema,
	iconConfigSchema,
} from './schema';

// Code generation
export {
	generateNodeClass,
	generateCredentialClass,
	generateIndex,
} from './generator';

// Property builder
export {
	PropertyBuilder,
	string,
	number,
	boolean,
	options,
	multiOptions,
	json,
	dateTime,
	color,
	collection,
	credential,
	notice,
	hidden,
	presets,
} from './properties';

// Operation builder
export {
	OperationBuilder,
	ResourceBuilder,
	get,
	post,
	put,
	del,
	patch,
	custom,
	resource,
	operationPresets,
	pagination,
	routing,
} from './operations';

// Credential builder
export {
	CredentialBuilder,
	credential as createCredential,
	credentialPresets,
} from './credentials';

// Testing
export {
	createTestNode,
	mockExecution,
	validateOutput,
	testUtils,
	createTestSuite,
	TestSuite,
} from './testing';

// Packaging
export {
	generatePackageJson,
	generateTsConfig,
	generateReadme,
	generateEslintConfig,
	generatePrettierConfig,
	generateGitignore,
	generateNpmignore,
	generatePackageStructure,
} from './packaging';

// Icons
export {
	IconManager,
	iconManager,
	createIconConfig,
	iconPresets,
} from './icons';

// Documentation
export {
	generateDocs,
	generateApiDocs,
	generateExamples,
	generateCompleteDocs,
} from './documentation';

// Templates
export {
	getTemplate,
	availableTemplates,
} from './templates';

// AI assistance
export {
	generateFromDescription,
	suggestProperties,
	improveNode,
	aiUtils,
} from './ai-assist';

// Preview
export {
	NodePreview,
	SandboxEnvironment,
	createPreview,
	createSandbox,
	previewUtils,
} from './preview';

// Runtime validation
export {
	validateAtRuntime,
	coerceValue,
	sanitizeInput,
	validationUtils,
	ErrorBoundary,
} from './validation';

// Registry
export {
	NodeRegistry,
	createRegistry,
} from './registry';

// Import
export {
	importFromOpenAPI,
	importFromPostman,
	importUtils,
} from './import';

// Export
export {
	exportToN8nFormat,
	exportToJson,
	exportToTypeScript,
	exportPackage,
	exportToWorkflowTemplate,
	exportToMarkdown,
	exportUtils,
} from './export';

// CLI
export {
	NodeBuilderCLI,
	createCLI,
	runCLI,
} from './cli';

/**
 * Main builder class combining all functionality
 */
export class NodeBuilder {
	/**
	 * Create a new node from scratch
	 */
	static create(name: string): NodeDefinition {
		return {
			name,
			displayName: name,
			description: `${name} node`,
			version: 1,
			defaults: {
				name,
			},
			category: NodeCategory.CUSTOM,
			inputs: ['main'],
			outputs: ['main'],
		};
	}

	/**
	 * Create from template
	 */
	static fromTemplate(type: TemplateType): NodeDefinition {
		const { getTemplate } = require('./templates');
		return getTemplate(type);
	}

	/**
	 * Create from AI description
	 */
	static async fromDescription(description: string): Promise<NodeDefinition> {
		const { generateFromDescription } = require('./ai-assist');
		return generateFromDescription(description);
	}

	/**
	 * Import from OpenAPI
	 */
	static async fromOpenAPI(spec: OpenAPISpec): Promise<NodeDefinition[]> {
		const { importFromOpenAPI } = require('./import');
		return importFromOpenAPI(spec);
	}

	/**
	 * Import from Postman
	 */
	static async fromPostman(collection: PostmanCollection): Promise<NodeDefinition[]> {
		const { importFromPostman } = require('./import');
		return importFromPostman(collection);
	}

	/**
	 * Validate node definition
	 */
	static validate(definition: NodeDefinition): ValidationResult {
		const { validateNodeDefinition } = require('./schema');
		return validateNodeDefinition(definition);
	}

	/**
	 * Generate code
	 */
	static generateCode(definition: NodeDefinition): string {
		const { generateNodeClass } = require('./generator');
		return generateNodeClass(definition);
	}

	/**
	 * Export to various formats
	 */
	static export(definition: NodeDefinition, format: 'json' | 'typescript' | 'n8n' | 'package'): unknown {
		const { exportToJson, exportToTypeScript, exportToN8nFormat, exportPackage } = require('./export');

		switch (format) {
			case 'json':
				return exportToJson(definition);
			case 'typescript':
				return exportToTypeScript(definition);
			case 'n8n':
				return exportToN8nFormat(definition);
			case 'package':
				return exportPackage(definition);
			default:
				throw new Error(`Unknown export format: ${format}`);
		}
	}

	/**
	 * Generate documentation
	 */
	static generateDocs(definition: NodeDefinition): string {
		const { generateDocs } = require('./documentation');
		return generateDocs(definition);
	}

	/**
	 * Create preview instance
	 */
	static createPreview(): NodePreview {
		const { createPreview } = require('./preview');
		return createPreview();
	}

	/**
	 * Create test suite
	 */
	static createTestSuite(): TestSuite {
		const { createTestSuite } = require('./testing');
		return createTestSuite();
	}
}

/**
 * Default export
 */
export default NodeBuilder;
