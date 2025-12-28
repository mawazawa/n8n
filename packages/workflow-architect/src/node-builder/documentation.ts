/**
 * Custom Node Builder - Documentation Generator
 * Auto-generate documentation for custom nodes
 */

import type { NodeDefinition, ResourceDefinition, OperationDefinition } from './types';

/**
 * Generate markdown documentation
 */
export function generateDocs(definition: NodeDefinition): string {
	const lines: string[] = [];

	// Header
	lines.push(`# ${definition.displayName}`);
	lines.push('');
	lines.push(definition.description);
	lines.push('');

	// Version
	lines.push(`**Version:** ${definition.version}`);
	lines.push('');

	// Category
	lines.push(`**Category:** ${definition.category}`);
	lines.push('');

	// Credentials
	if (definition.credentials && definition.credentials.length > 0) {
		lines.push('## Authentication');
		lines.push('');
		lines.push('This node requires authentication. Supported credential types:');
		lines.push('');
		definition.credentials.forEach((cred) => {
			lines.push(`### ${cred.displayName}`);
			lines.push('');
			if (cred.documentationUrl) {
				lines.push(`[Documentation](${cred.documentationUrl})`);
				lines.push('');
			}
			lines.push('Required fields:');
			lines.push('');
			cred.properties.forEach((prop) => {
				const required = prop.required ? ' (required)' : ' (optional)';
				lines.push(`- **${prop.displayName}**${required}: ${prop.description || ''}`);
			});
			lines.push('');
		});
	}

	// Resources and Operations
	if (definition.resources && definition.resources.length > 0) {
		lines.push('## Resources');
		lines.push('');

		definition.resources.forEach((resource) => {
			lines.push(`### ${resource.displayName}`);
			lines.push('');
			if (resource.description) {
				lines.push(resource.description);
				lines.push('');
			}

			lines.push('#### Operations');
			lines.push('');

			resource.operations.forEach((operation) => {
				lines.push(`##### ${operation.displayName}`);
				lines.push('');
				lines.push(operation.description);
				lines.push('');

				if (operation.properties && operation.properties.length > 0) {
					lines.push('**Parameters:**');
					lines.push('');
					operation.properties.forEach((prop) => {
						const required = prop.required ? ' (required)' : ' (optional)';
						const defaultValue = prop.default !== undefined ? ` [default: \`${prop.default}\`]` : '';
						lines.push(`- **${prop.displayName}**${required}${defaultValue}`);
						if (prop.description) {
							lines.push(`  - ${prop.description}`);
						}
						if (prop.options && prop.options.length > 0) {
							lines.push('  - Options:');
							prop.options.forEach((opt) => {
								lines.push(`    - \`${opt.value}\`: ${opt.name}`);
							});
						}
					});
					lines.push('');
				}
			});
		});
	}

	// Webhooks
	if (definition.webhooks && definition.webhooks.length > 0) {
		lines.push('## Webhooks');
		lines.push('');
		lines.push('This node supports webhooks:');
		lines.push('');
		definition.webhooks.forEach((webhook) => {
			lines.push(`- **${webhook.name}**: ${webhook.httpMethod}`);
		});
		lines.push('');
	}

	// Documentation link
	if (definition.documentationUrl) {
		lines.push('## Additional Resources');
		lines.push('');
		lines.push(`[Official Documentation](${definition.documentationUrl})`);
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Generate API reference documentation
 */
export function generateApiDocs(definition: NodeDefinition): string {
	const lines: string[] = [];

	lines.push(`# ${definition.displayName} - API Reference`);
	lines.push('');

	// Node Properties
	lines.push('## Node Properties');
	lines.push('');
	lines.push('```typescript');
	lines.push('interface NodeDescription {');
	lines.push(`  displayName: "${definition.displayName}";`);
	lines.push(`  name: "${definition.name}";`);
	lines.push(`  version: ${definition.version};`);
	lines.push(`  description: "${definition.description}";`);
	lines.push('}');
	lines.push('```');
	lines.push('');

	// Resources API
	if (definition.resources && definition.resources.length > 0) {
		lines.push('## Resources API');
		lines.push('');

		definition.resources.forEach((resource) => {
			lines.push(`### ${resource.displayName}`);
			lines.push('');

			resource.operations.forEach((operation) => {
				lines.push(`#### ${operation.displayName}`);
				lines.push('');

				// Request
				if (operation.routing) {
					lines.push('**Request:**');
					lines.push('');
					lines.push('```http');
					lines.push(`${operation.routing.method || operation.type} ${operation.routing.url || '/'}`);
					if (operation.routing.headers) {
						Object.entries(operation.routing.headers).forEach(([key, value]) => {
							lines.push(`${key}: ${value}`);
						});
					}
					lines.push('```');
					lines.push('');

					if (operation.routing.body) {
						lines.push('**Request Body:**');
						lines.push('');
						lines.push('```json');
						lines.push(JSON.stringify(operation.routing.body, null, 2));
						lines.push('```');
						lines.push('');
					}
				}

				// Parameters
				if (operation.properties && operation.properties.length > 0) {
					lines.push('**Parameters:**');
					lines.push('');
					lines.push('| Name | Type | Required | Description |');
					lines.push('|------|------|----------|-------------|');

					operation.properties.forEach((prop) => {
						const required = prop.required ? 'Yes' : 'No';
						const description = prop.description || '';
						lines.push(
							`| ${prop.displayName} | ${prop.type} | ${required} | ${description} |`,
						);
					});
					lines.push('');
				}
			});
		});
	}

	return lines.join('\n');
}

/**
 * Generate usage examples
 */
export function generateExamples(definition: NodeDefinition): string {
	const lines: string[] = [];

	lines.push(`# ${definition.displayName} - Examples`);
	lines.push('');

	if (definition.resources && definition.resources.length > 0) {
		const firstResource = definition.resources[0];
		const firstOperation = firstResource.operations[0];

		lines.push('## Basic Usage');
		lines.push('');
		lines.push('1. Add the node to your workflow');
		lines.push(`2. Select resource: **${firstResource.displayName}**`);
		lines.push(`3. Select operation: **${firstOperation.displayName}**`);
		lines.push('4. Configure the parameters');
		lines.push('5. Connect your credentials');
		lines.push('');

		// Example workflow
		lines.push('## Example Workflow');
		lines.push('');
		lines.push('```json');
		const exampleWorkflow = {
			nodes: [
				{
					name: definition.defaults.name,
					type: definition.name.toLowerCase(),
					typeVersion: definition.version,
					position: [250, 300],
					parameters: {
						resource: firstResource.name,
						operation: firstOperation.name,
					},
				},
			],
			connections: {},
		};
		lines.push(JSON.stringify(exampleWorkflow, null, 2));
		lines.push('```');
		lines.push('');

		// Code example
		if (firstOperation.properties && firstOperation.properties.length > 0) {
			lines.push('## Parameter Example');
			lines.push('');
			lines.push('```typescript');
			lines.push('const parameters = {');
			firstOperation.properties.slice(0, 3).forEach((prop) => {
				const value = prop.default !== undefined ? prop.default : getExampleValue(prop.type);
				const stringValue = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
				lines.push(`  ${prop.name}: ${stringValue},`);
			});
			lines.push('};');
			lines.push('```');
			lines.push('');
		}
	}

	lines.push('## Tips');
	lines.push('');
	lines.push('- Use expressions to dynamically set parameter values');
	lines.push('- Connect multiple nodes to create complex workflows');
	lines.push('- Test with small datasets first');
	lines.push('- Check the error output if something goes wrong');
	lines.push('');

	return lines.join('\n');
}

/**
 * Get example value for property type
 */
function getExampleValue(type: string): unknown {
	switch (type) {
		case 'string':
			return 'example value';
		case 'number':
			return 42;
		case 'boolean':
			return true;
		case 'json':
			return { key: 'value' };
		default:
			return 'value';
	}
}

/**
 * Generate complete documentation set
 */
export function generateCompleteDocs(definition: NodeDefinition): {
	overview: string;
	apiReference: string;
	examples: string;
} {
	return {
		overview: generateDocs(definition),
		apiReference: generateApiDocs(definition),
		examples: generateExamples(definition),
	};
}
