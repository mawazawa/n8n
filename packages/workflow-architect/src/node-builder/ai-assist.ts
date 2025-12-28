/**
 * Custom Node Builder - AI Assistant
 * AI-powered node generation using LLM
 */

import type {
	NodeDefinition,
	PropertyDefinition,
	AIGenerationContext,
	ResourceDefinition,
	OperationDefinition,
} from './types';
import { NodeCategory, PropertyType, OperationType } from './types';

/**
 * Generate node from natural language description
 */
export async function generateFromDescription(
	description: string,
	context?: Partial<AIGenerationContext>,
): Promise<NodeDefinition> {
	// In a real implementation, this would call an LLM API
	// For now, return a basic template based on keywords

	const lowerDesc = description.toLowerCase();

	// Detect node type from description
	let category = NodeCategory.CUSTOM;
	let name = 'CustomNode';
	let displayName = 'Custom Node';

	if (lowerDesc.includes('api') || lowerDesc.includes('rest') || lowerDesc.includes('http')) {
		category = NodeCategory.DEVELOPMENT;
		name = 'ApiNode';
		displayName = 'API Node';
	} else if (lowerDesc.includes('database') || lowerDesc.includes('sql')) {
		category = NodeCategory.DEVELOPMENT;
		name = 'DatabaseNode';
		displayName = 'Database Node';
	} else if (lowerDesc.includes('webhook')) {
		category = NodeCategory.DEVELOPMENT;
		name = 'WebhookNode';
		displayName = 'Webhook Node';
	}

	// Generate basic node structure
	const nodeDefinition: NodeDefinition = {
		name,
		displayName,
		description: description,
		version: 1,
		defaults: {
			name: displayName,
			color: '#00AA88',
		},
		category,
		inputs: ['main'],
		outputs: ['main'],
		properties: await suggestProperties(context || { description }),
	};

	// Add credentials if auth type is specified
	if (context?.authType && context.authType !== 'none') {
		nodeDefinition.credentials = [
			{
				name: `${name}Credentials`,
				displayName: `${displayName} Credentials`,
				properties: generateCredentialProperties(context.authType),
			},
		];
	}

	// Add base URL if provided
	if (context?.baseUrl) {
		nodeDefinition.properties?.unshift({
			name: 'baseUrl',
			displayName: 'Base URL',
			type: PropertyType.STRING,
			default: context.baseUrl,
			description: 'The base URL for the API',
		});
	}

	return nodeDefinition;
}

/**
 * Suggest properties based on context
 */
export async function suggestProperties(
	context: AIGenerationContext,
): Promise<PropertyDefinition[]> {
	const properties: PropertyDefinition[] = [];

	// Analyze context to suggest properties
	const description = context.description.toLowerCase();

	// Common operation selector
	properties.push({
		name: 'operation',
		displayName: 'Operation',
		type: PropertyType.OPTIONS,
		options: [
			{ name: 'Get', value: 'get' },
			{ name: 'Create', value: 'create' },
			{ name: 'Update', value: 'update' },
			{ name: 'Delete', value: 'delete' },
		],
		default: 'get',
		description: 'The operation to perform',
	});

	// If example request/response provided, extract fields
	if (context.exampleRequest) {
		Object.keys(context.exampleRequest).forEach((key) => {
			if (!properties.some((p) => p.name === key)) {
				properties.push({
					name: key,
					displayName: formatDisplayName(key),
					type: inferType(context.exampleRequest![key]),
					description: `${formatDisplayName(key)} parameter`,
				});
			}
		});
	}

	return properties;
}

/**
 * Improve existing node with AI feedback
 */
export async function improveNode(
	definition: NodeDefinition,
	feedback: string,
): Promise<NodeDefinition> {
	// In a real implementation, this would use LLM to improve the node
	// For now, apply basic improvements

	const improved = { ...definition };

	// Improve descriptions if they're too short
	if (improved.description.length < 30) {
		improved.description = `${improved.description}. This node provides functionality for ${improved.displayName.toLowerCase()}.`;
	}

	// Add common properties if missing
	if (!improved.properties || improved.properties.length === 0) {
		improved.properties = await suggestProperties({
			description: improved.description,
		});
	}

	// Add documentation URL placeholder if missing
	if (!improved.documentationUrl && feedback.toLowerCase().includes('documentation')) {
		improved.documentationUrl = 'https://docs.example.com';
	}

	return improved;
}

/**
 * Generate credential properties based on auth type
 */
function generateCredentialProperties(authType: string): PropertyDefinition[] {
	switch (authType) {
		case 'apiKey':
			return [
				{
					name: 'apiKey',
					displayName: 'API Key',
					type: PropertyType.STRING,
					required: true,
					typeOptions: { password: true },
					description: 'The API key for authentication',
				},
			];

		case 'oauth2':
			return [
				{
					name: 'clientId',
					displayName: 'Client ID',
					type: PropertyType.STRING,
					required: true,
					description: 'OAuth2 Client ID',
				},
				{
					name: 'clientSecret',
					displayName: 'Client Secret',
					type: PropertyType.STRING,
					required: true,
					typeOptions: { password: true },
					description: 'OAuth2 Client Secret',
				},
			];

		case 'basic':
			return [
				{
					name: 'username',
					displayName: 'Username',
					type: PropertyType.STRING,
					required: true,
					description: 'Username for authentication',
				},
				{
					name: 'password',
					displayName: 'Password',
					type: PropertyType.STRING,
					required: true,
					typeOptions: { password: true },
					description: 'Password for authentication',
				},
			];

		default:
			return [];
	}
}

/**
 * Infer property type from value
 */
function inferType(value: unknown): PropertyType {
	if (typeof value === 'string') {
		return PropertyType.STRING;
	}
	if (typeof value === 'number') {
		return PropertyType.NUMBER;
	}
	if (typeof value === 'boolean') {
		return PropertyType.BOOLEAN;
	}
	if (Array.isArray(value)) {
		return PropertyType.JSON;
	}
	if (typeof value === 'object' && value !== null) {
		return PropertyType.JSON;
	}
	return PropertyType.STRING;
}

/**
 * Format display name from camelCase/snake_case
 */
function formatDisplayName(name: string): string {
	return name
		.replace(/_/g, ' ')
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

/**
 * AI assistant utilities
 */
export const aiUtils = {
	/**
	 * Suggest operation names from description
	 */
	suggestOperations(description: string): string[] {
		const operations: string[] = [];
		const lowerDesc = description.toLowerCase();

		if (lowerDesc.includes('get') || lowerDesc.includes('retrieve') || lowerDesc.includes('list')) {
			operations.push('get', 'getAll');
		}
		if (lowerDesc.includes('create') || lowerDesc.includes('add') || lowerDesc.includes('insert')) {
			operations.push('create');
		}
		if (lowerDesc.includes('update') || lowerDesc.includes('modify') || lowerDesc.includes('edit')) {
			operations.push('update');
		}
		if (lowerDesc.includes('delete') || lowerDesc.includes('remove')) {
			operations.push('delete');
		}
		if (lowerDesc.includes('search') || lowerDesc.includes('find')) {
			operations.push('search');
		}

		return operations.length > 0 ? operations : ['get', 'create', 'update', 'delete'];
	},

	/**
	 * Suggest resource name from description
	 */
	suggestResourceName(description: string): string {
		// Extract potential resource names (nouns)
		const words = description.split(/\s+/);
		const nouns = words.filter((word) => {
			const lower = word.toLowerCase();
			return (
				lower.length > 3 &&
				!['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(lower)
			);
		});

		if (nouns.length > 0) {
			return nouns[0].toLowerCase();
		}

		return 'resource';
	},

	/**
	 * Generate icon suggestion from description
	 */
	suggestIcon(description: string): string {
		const lowerDesc = description.toLowerCase();

		if (lowerDesc.includes('api')) return 'fa:plug';
		if (lowerDesc.includes('database')) return 'fa:database';
		if (lowerDesc.includes('webhook')) return 'fa:webhook';
		if (lowerDesc.includes('email')) return 'fa:envelope';
		if (lowerDesc.includes('file')) return 'fa:file';
		if (lowerDesc.includes('cloud')) return 'fa:cloud';
		if (lowerDesc.includes('calendar')) return 'fa:calendar';
		if (lowerDesc.includes('user')) return 'fa:user';

		return 'fa:puzzle-piece';
	},

	/**
	 * Suggest category from description
	 */
	suggestCategory(description: string): NodeCategory {
		const lowerDesc = description.toLowerCase();

		if (lowerDesc.includes('api') || lowerDesc.includes('development')) {
			return NodeCategory.DEVELOPMENT;
		}
		if (lowerDesc.includes('email') || lowerDesc.includes('communication')) {
			return NodeCategory.COMMUNICATION;
		}
		if (lowerDesc.includes('crm') || lowerDesc.includes('customer')) {
			return NodeCategory.CRM;
		}
		if (lowerDesc.includes('marketing')) {
			return NodeCategory.MARKETING;
		}
		if (lowerDesc.includes('analytics')) {
			return NodeCategory.ANALYTICS;
		}

		return NodeCategory.CUSTOM;
	},
};
