/**
 * Custom Node Builder - Import
 * Import nodes from OpenAPI/Swagger and Postman collections
 */

import type { NodeDefinition, OpenAPISpec, PostmanCollection, PropertyDefinition } from './types';
import { NodeCategory, PropertyType, OperationType } from './types';

/**
 * Import nodes from OpenAPI/Swagger specification
 */
export async function importFromOpenAPI(spec: OpenAPISpec): Promise<NodeDefinition[]> {
	const nodes: NodeDefinition[] = [];

	// Extract base information
	const nodeName = spec.info.title.replace(/[^a-zA-Z0-9]/g, '');
	const baseUrl = spec.servers?.[0]?.url || '';

	// Group paths by resource (first path segment)
	const resourceGroups = new Map<string, Array<{ path: string; method: string; operation: unknown }>>();

	Object.entries(spec.paths).forEach(([path, pathItem]) => {
		const segments = path.split('/').filter(Boolean);
		const resourceName = segments[0] || 'default';

		if (!resourceGroups.has(resourceName)) {
			resourceGroups.set(resourceName, []);
		}

		// Process each HTTP method
		Object.entries(pathItem as Record<string, unknown>).forEach(([method, operation]) => {
			if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
				resourceGroups.get(resourceName)!.push({
					path,
					method: method.toUpperCase(),
					operation,
				});
			}
		});
	});

	// Create node definition
	const nodeDefinition: NodeDefinition = {
		name: nodeName,
		displayName: spec.info.title,
		description: spec.info.description || `Integration with ${spec.info.title}`,
		version: 1,
		defaults: {
			name: spec.info.title,
			color: '#00AA88',
		},
		category: NodeCategory.DEVELOPMENT,
		credentials: extractCredentials(spec),
		resources: Array.from(resourceGroups.entries()).map(([resourceName, operations]) => ({
			name: resourceName,
			displayName: formatDisplayName(resourceName),
			operations: operations.map((op) => ({
				name: extractOperationName(op),
				displayName: formatDisplayName(extractOperationName(op)),
				description: extractOperationDescription(op.operation),
				type: op.method as OperationType,
				properties: extractOperationProperties(op.operation),
				routing: {
					method: op.method,
					url: op.path.replace(/{([^}]+)}/g, '={{$parameter["$1"]}}'),
				},
			})),
		})),
		inputs: ['main'],
		outputs: ['main'],
		documentationUrl: (spec as unknown as { externalDocs?: { url?: string } }).externalDocs?.url,
	};

	nodes.push(nodeDefinition);

	return nodes;
}

/**
 * Import nodes from Postman collection
 */
export async function importFromPostman(collection: PostmanCollection): Promise<NodeDefinition[]> {
	const nodes: NodeDefinition[] = [];

	// Extract base information
	const nodeName = collection.info.name.replace(/[^a-zA-Z0-9]/g, '');

	// Group requests by folder
	const resourceGroups = new Map<string, typeof collection.item>();

	collection.item.forEach((item) => {
		const resourceName = item.name || 'default';
		if (!resourceGroups.has(resourceName)) {
			resourceGroups.set(resourceName, []);
		}
		resourceGroups.get(resourceName)!.push(item);
	});

	// Create node definition
	const nodeDefinition: NodeDefinition = {
		name: nodeName,
		displayName: collection.info.name,
		description: collection.info.description || `Integration with ${collection.info.name}`,
		version: 1,
		defaults: {
			name: collection.info.name,
			color: '#FF6B35',
		},
		category: NodeCategory.DEVELOPMENT,
		resources: Array.from(resourceGroups.entries()).map(([resourceName, items]) => ({
			name: resourceName,
			displayName: formatDisplayName(resourceName),
			operations: items.map((item) => {
				const url = typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
				return {
					name: item.name.replace(/[^a-zA-Z0-9]/g, ''),
					displayName: item.name,
					description: `Execute ${item.name}`,
					type: item.request.method as OperationType,
					routing: {
						method: item.request.method,
						url: url,
						headers: item.request.header
							? Object.fromEntries(
									item.request.header.map((h) => [h.key, h.value]),
							  )
							: undefined,
					},
				};
			}),
		})),
		inputs: ['main'],
		outputs: ['main'],
	};

	nodes.push(nodeDefinition);

	return nodes;
}

/**
 * Extract credentials from OpenAPI spec
 */
function extractCredentials(spec: OpenAPISpec): NodeDefinition['credentials'] {
	if (!spec.components?.securitySchemes) {
		return undefined;
	}

	const credentials: NodeDefinition['credentials'] = [];

	Object.entries(spec.components.securitySchemes).forEach(([name, scheme]) => {
		const schemeObj = scheme as { type: string; scheme?: string; in?: string; name?: string };

		if (schemeObj.type === 'http' && schemeObj.scheme === 'bearer') {
			credentials.push({
				name: `${name}Credentials`,
				displayName: formatDisplayName(name),
				properties: [
					{
						name: 'token',
						displayName: 'Bearer Token',
						type: PropertyType.STRING,
						required: true,
						typeOptions: { password: true },
					},
				],
				authenticate: {
					type: 'bearer',
				},
			});
		} else if (schemeObj.type === 'apiKey') {
			credentials.push({
				name: `${name}Credentials`,
				displayName: formatDisplayName(name),
				properties: [
					{
						name: 'apiKey',
						displayName: 'API Key',
						type: PropertyType.STRING,
						required: true,
						typeOptions: { password: true },
					},
				],
				authenticate: {
					type: 'generic',
					properties: {
						[schemeObj.name || 'X-API-Key']: '={{$credentials.apiKey}}',
					},
				},
			});
		} else if (schemeObj.type === 'http' && schemeObj.scheme === 'basic') {
			credentials.push({
				name: `${name}Credentials`,
				displayName: formatDisplayName(name),
				properties: [
					{
						name: 'username',
						displayName: 'Username',
						type: PropertyType.STRING,
						required: true,
					},
					{
						name: 'password',
						displayName: 'Password',
						type: PropertyType.STRING,
						required: true,
						typeOptions: { password: true },
					},
				],
			});
		}
	});

	return credentials.length > 0 ? credentials : undefined;
}

/**
 * Extract operation name from OpenAPI operation
 */
function extractOperationName(op: { path: string; method: string; operation: unknown }): string {
	const operation = op.operation as { operationId?: string };

	if (operation.operationId) {
		return operation.operationId;
	}

	// Generate name from path and method
	const pathSegments = op.path.split('/').filter(Boolean);
	const lastSegment = pathSegments[pathSegments.length - 1] || 'resource';
	return `${op.method.toLowerCase()}${formatDisplayName(lastSegment).replace(/\s/g, '')}`;
}

/**
 * Extract operation description
 */
function extractOperationDescription(operation: unknown): string {
	const op = operation as { summary?: string; description?: string };
	return op.summary || op.description || 'Execute operation';
}

/**
 * Extract operation properties from OpenAPI operation
 */
function extractOperationProperties(operation: unknown): PropertyDefinition[] {
	const properties: PropertyDefinition[] = [];
	const op = operation as {
		parameters?: Array<{
			name: string;
			in: string;
			description?: string;
			required?: boolean;
			schema?: { type: string };
		}>;
		requestBody?: {
			content?: {
				'application/json'?: {
					schema?: { properties?: Record<string, { type: string; description?: string }> };
				};
			};
		};
	};

	// Extract parameters
	if (op.parameters) {
		op.parameters.forEach((param) => {
			if (param.in === 'query' || param.in === 'path') {
				properties.push({
					name: param.name,
					displayName: formatDisplayName(param.name),
					type: mapOpenApiTypeToPropertyType(param.schema?.type || 'string'),
					description: param.description,
					required: param.required,
				});
			}
		});
	}

	// Extract request body properties
	if (op.requestBody?.content?.['application/json']?.schema?.properties) {
		Object.entries(op.requestBody.content['application/json'].schema.properties).forEach(
			([name, schema]) => {
				properties.push({
					name,
					displayName: formatDisplayName(name),
					type: mapOpenApiTypeToPropertyType(schema.type),
					description: schema.description,
				});
			},
		);
	}

	return properties;
}

/**
 * Map OpenAPI type to PropertyType
 */
function mapOpenApiTypeToPropertyType(type: string): PropertyType {
	switch (type) {
		case 'string':
			return PropertyType.STRING;
		case 'number':
		case 'integer':
			return PropertyType.NUMBER;
		case 'boolean':
			return PropertyType.BOOLEAN;
		case 'object':
		case 'array':
			return PropertyType.JSON;
		default:
			return PropertyType.STRING;
	}
}

/**
 * Format display name
 */
function formatDisplayName(name: string): string {
	return name
		.replace(/[-_]/g, ' ')
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

/**
 * Import utilities
 */
export const importUtils = {
	/**
	 * Validate OpenAPI spec
	 */
	validateOpenAPI(spec: unknown): spec is OpenAPISpec {
		const s = spec as Partial<OpenAPISpec>;
		return !!(s.openapi && s.info && s.paths);
	},

	/**
	 * Validate Postman collection
	 */
	validatePostman(collection: unknown): collection is PostmanCollection {
		const c = collection as Partial<PostmanCollection>;
		return !!(c.info && c.item && Array.isArray(c.item));
	},

	/**
	 * Load from URL
	 */
	async loadFromUrl(url: string): Promise<unknown> {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to load from URL: ${response.statusText}`);
		}
		return response.json();
	},

	/**
	 * Load from file
	 */
	async loadFromFile(content: string): Promise<unknown> {
		try {
			return JSON.parse(content);
		} catch {
			throw new Error('Invalid JSON format');
		}
	},
};
