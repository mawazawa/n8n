/**
 * Custom Node Builder - Export
 * Export nodes to various formats
 */

import type { NodeDefinition, N8nNodeDefinition } from './types';
import { generateNodeClass, generateCredentialClass } from './generator';

/**
 * Export to n8n node format
 */
export function exportToN8nFormat(definition: NodeDefinition): N8nNodeDefinition {
	const n8nNode: N8nNodeDefinition = {
		displayName: definition.displayName,
		name: camelCase(definition.name),
		icon: definition.icon?.value || 'fa:plug',
		group: [definition.category],
		version: definition.version,
		description: definition.description,
		defaults: {
			name: definition.defaults.name,
		},
		inputs: definition.inputs || ['main'],
		outputs: definition.outputs || ['main'],
		properties: [],
	};

	// Add credentials
	if (definition.credentials && definition.credentials.length > 0) {
		n8nNode.credentials = definition.credentials.map((cred) => ({
			name: camelCase(cred.name),
			required: true,
		}));
	}

	// Convert properties
	if (definition.properties && definition.properties.length > 0) {
		n8nNode.properties = definition.properties.map((prop) => ({
			displayName: prop.displayName,
			name: prop.name,
			type: prop.type,
			default: prop.default,
			description: prop.description,
			required: prop.required,
			options: prop.options,
			displayOptions: prop.displayOptions,
			typeOptions: prop.typeOptions,
			routing: prop.routing,
		}));
	}

	// Convert resources to properties
	if (definition.resources && definition.resources.length > 0) {
		// Resource selector
		n8nNode.properties.push({
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: definition.resources.map((r) => ({
				name: r.displayName,
				value: r.name,
				description: r.description,
			})),
			default: definition.resources[0].name,
		});

		// Operations for each resource
		definition.resources.forEach((resource) => {
			n8nNode.properties.push({
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: [resource.name],
					},
				},
				options: resource.operations.map((op) => ({
					name: op.displayName,
					value: op.name,
					description: op.description,
					action: op.displayName.toLowerCase(),
				})),
				default: resource.operations[0].name,
			});

			// Properties for each operation
			resource.operations.forEach((op) => {
				if (op.properties && op.properties.length > 0) {
					op.properties.forEach((prop) => {
						n8nNode.properties.push({
							...prop,
							displayOptions: {
								show: {
									resource: [resource.name],
									operation: [op.name],
									...prop.displayOptions?.show,
								},
								...prop.displayOptions,
							},
						});
					});
				}
			});
		});
	}

	return n8nNode;
}

/**
 * Export to JSON
 */
export function exportToJson(definition: NodeDefinition): string {
	return JSON.stringify(definition, null, 2);
}

/**
 * Export to TypeScript
 */
export function exportToTypeScript(definition: NodeDefinition): string {
	const parts: string[] = [];

	// Generate node class
	parts.push(generateNodeClass(definition));

	// Generate credentials
	if (definition.credentials && definition.credentials.length > 0) {
		parts.push('');
		definition.credentials.forEach((cred) => {
			parts.push(generateCredentialClass(cred));
		});
	}

	return parts.join('\n\n');
}

/**
 * Export complete package
 */
export function exportPackage(definition: NodeDefinition): {
	node: string;
	credentials: Record<string, string>;
	packageJson: string;
	readme: string;
} {
	const { generatePackageJson, generateReadme } = require('./packaging');

	const result = {
		node: generateNodeClass(definition),
		credentials: {} as Record<string, string>,
		packageJson: generatePackageJson([definition], {
			name: `n8n-nodes-${camelCase(definition.name)}`,
			version: '1.0.0',
			description: definition.description,
		}),
		readme: generateReadme([definition], {
			name: `n8n-nodes-${camelCase(definition.name)}`,
			version: '1.0.0',
			description: definition.description,
		}),
	};

	// Generate credentials
	if (definition.credentials && definition.credentials.length > 0) {
		definition.credentials.forEach((cred) => {
			result.credentials[cred.name] = generateCredentialClass(cred);
		});
	}

	return result;
}

/**
 * Export to workflow template
 */
export function exportToWorkflowTemplate(definition: NodeDefinition): string {
	const workflow = {
		name: `${definition.displayName} Template`,
		nodes: [
			{
				parameters: {},
				name: definition.defaults.name,
				type: camelCase(definition.name),
				typeVersion: definition.version,
				position: [250, 300],
			},
		],
		connections: {},
		settings: {
			executionOrder: 'v1',
		},
	};

	return JSON.stringify(workflow, null, 2);
}

/**
 * Export to Markdown documentation
 */
export function exportToMarkdown(definition: NodeDefinition): string {
	const { generateDocs } = require('./documentation');
	return generateDocs(definition);
}

/**
 * Export utilities
 */
export const exportUtils = {
	/**
	 * Create downloadable file content
	 */
	createDownloadableFile(content: string, filename: string): {
		content: string;
		filename: string;
		mimeType: string;
	} {
		const ext = filename.split('.').pop()?.toLowerCase();
		let mimeType = 'text/plain';

		switch (ext) {
			case 'json':
				mimeType = 'application/json';
				break;
			case 'ts':
				mimeType = 'text/typescript';
				break;
			case 'js':
				mimeType = 'text/javascript';
				break;
			case 'md':
				mimeType = 'text/markdown';
				break;
		}

		return {
			content,
			filename,
			mimeType,
		};
	},

	/**
	 * Create ZIP archive content (base64)
	 */
	async createZipArchive(files: Record<string, string>): Promise<string> {
		// In a real implementation, this would use a ZIP library
		// For now, return a placeholder
		const manifest = {
			files: Object.keys(files),
			createdAt: new Date().toISOString(),
		};

		return Buffer.from(JSON.stringify({ manifest, files })).toString('base64');
	},

	/**
	 * Validate export format
	 */
	validateExport(definition: NodeDefinition, format: string): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (format === 'n8n' || format === 'typescript') {
			// Check for required fields
			if (!definition.name || !definition.displayName) {
				errors.push('Node must have name and displayName');
			}

			if (!definition.properties && !definition.resources) {
				errors.push('Node must have either properties or resources');
			}
		}

		if (format === 'package') {
			// Additional checks for package export
			if (definition.credentials && definition.credentials.length === 0) {
				errors.push('Package export requires at least one credential definition');
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	},
};

/**
 * Convert PascalCase to camelCase
 */
function camelCase(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}
