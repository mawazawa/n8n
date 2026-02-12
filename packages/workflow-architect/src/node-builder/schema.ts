/**
 * Custom Node Builder - Schema Validation
 * Zod schemas for validating node definitions
 */

import { z } from 'zod';
import {
	NodeCategory,
	OperationType,
	PropertyType,
	type ValidationResult,
	type ValidationError,
	type ValidationWarning,
} from './types';

/**
 * Property option schema
 */
const propertyOptionSchema = z.object({
	name: z.string().min(1, 'Option name is required'),
	value: z.union([z.string(), z.number(), z.boolean()]),
	description: z.string().optional(),
	action: z.string().optional(),
});

/**
 * Routing configuration schema
 */
const routingConfigSchema = z.object({
	method: z.string().optional(),
	url: z.string().optional(),
	body: z.record(z.unknown()).optional(),
	headers: z.record(z.string()).optional(),
	qs: z.record(z.unknown()).optional(),
});

/**
 * Pagination configuration schema
 */
const paginationConfigSchema = z.object({
	type: z.enum(['offset', 'cursor', 'page', 'url']),
	limitParameter: z.string().optional(),
	offsetParameter: z.string().optional(),
	cursorParameter: z.string().optional(),
	pageParameter: z.string().optional(),
	maxRequests: z.number().int().positive().optional(),
});

/**
 * Property definition schema
 */
const propertyDefinitionSchema = z.object({
	name: z
		.string()
		.min(1, 'Property name is required')
		.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Property name must be valid identifier'),
	displayName: z.string().min(1, 'Display name is required'),
	type: z.nativeEnum(PropertyType),
	default: z.unknown().optional(),
	description: z.string().optional(),
	placeholder: z.string().optional(),
	required: z.boolean().optional(),
	options: z.array(propertyOptionSchema).optional(),
	displayOptions: z
		.object({
			show: z.record(z.array(z.unknown())).optional(),
			hide: z.record(z.array(z.unknown())).optional(),
		})
		.optional(),
	routing: routingConfigSchema.optional(),
	typeOptions: z
		.object({
			minValue: z.number().optional(),
			maxValue: z.number().optional(),
			multipleValues: z.boolean().optional(),
			multipleValueButtonText: z.string().optional(),
			rows: z.number().int().positive().optional(),
			loadOptionsMethod: z.string().optional(),
		})
		.optional(),
	extractValue: z
		.object({
			type: z.enum(['regex', 'json']),
			regex: z.string().optional(),
			jsonPath: z.string().optional(),
		})
		.optional(),
});

/**
 * Operation definition schema
 */
const operationDefinitionSchema = z.object({
	name: z
		.string()
		.min(1, 'Operation name is required')
		.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Operation name must be valid identifier'),
	displayName: z.string().min(1, 'Display name is required'),
	description: z.string().min(1, 'Description is required'),
	type: z.nativeEnum(OperationType),
	properties: z.array(propertyDefinitionSchema).optional(),
	routing: routingConfigSchema.optional(),
	pagination: paginationConfigSchema.optional(),
});

/**
 * Resource definition schema
 */
const resourceDefinitionSchema = z.object({
	name: z
		.string()
		.min(1, 'Resource name is required')
		.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Resource name must be valid identifier'),
	displayName: z.string().min(1, 'Display name is required'),
	description: z.string().optional(),
	operations: z
		.array(operationDefinitionSchema)
		.min(1, 'Resource must have at least one operation'),
});

/**
 * Credential property definition schema
 */
const credentialPropertyDefinitionSchema = z.object({
	name: z
		.string()
		.min(1, 'Property name is required')
		.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Property name must be valid identifier'),
	displayName: z.string().min(1, 'Display name is required'),
	type: z.nativeEnum(PropertyType),
	default: z.string().optional(),
	description: z.string().optional(),
	required: z.boolean().optional(),
	typeOptions: z
		.object({
			password: z.boolean().optional(),
			expiration: z.string().optional(),
		})
		.optional(),
});

/**
 * Credential test schema
 */
const credentialTestSchema = z.object({
	method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
	url: z.string().url('Test URL must be a valid URL'),
	headers: z.record(z.string()).optional(),
	body: z.record(z.unknown()).optional(),
});

/**
 * Credential definition schema
 */
const credentialDefinitionSchema = z.object({
	name: z
		.string()
		.min(1, 'Credential name is required')
		.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Credential name must be valid identifier'),
	displayName: z.string().min(1, 'Display name is required'),
	documentationUrl: z.string().url().optional(),
	properties: z
		.array(credentialPropertyDefinitionSchema)
		.min(1, 'Credential must have at least one property'),
	test: credentialTestSchema.optional(),
	authenticate: z
		.object({
			type: z.enum(['generic', 'bearer', 'oauth2']),
			properties: z.record(z.string()).optional(),
		})
		.optional(),
});

/**
 * Icon configuration schema
 */
const iconConfigSchema = z.object({
	type: z.enum(['file', 'url', 'emoji', 'fontawesome']),
	value: z.string().min(1, 'Icon value is required'),
	optimized: z.boolean().optional(),
});

/**
 * Webhook configuration schema
 */
const webhookConfigSchema = z.object({
	name: z.string().min(1, 'Webhook name is required'),
	httpMethod: z.string().min(1, 'HTTP method is required'),
	path: z.string().optional(),
});

/**
 * Node definition schema
 */
export const nodeDefinitionSchema = z
	.object({
		name: z
			.string()
			.min(1, 'Node name is required')
			.regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Node name must be PascalCase identifier'),
		displayName: z
			.string()
			.min(1, 'Display name is required')
			.max(50, 'Display name should be under 50 characters'),
		description: z
			.string()
			.min(10, 'Description should be at least 10 characters')
			.max(200, 'Description should be under 200 characters'),
		version: z.number().int().positive('Version must be a positive integer'),
		defaults: z.object({
			name: z.string().min(1, 'Default name is required'),
			color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be valid hex').optional(),
		}),
		icon: iconConfigSchema.optional(),
		category: z.nativeEnum(NodeCategory),
		credentials: z.array(credentialDefinitionSchema).optional(),
		resources: z.array(resourceDefinitionSchema).optional(),
		properties: z.array(propertyDefinitionSchema).optional(),
		inputs: z.array(z.string()).optional().default(['main']),
		outputs: z.array(z.string()).optional().default(['main']),
		webhooks: z.array(webhookConfigSchema).optional(),
		polling: z.boolean().optional(),
		group: z.array(z.string()).optional(),
		subtitle: z.string().optional(),
		documentationUrl: z.string().url().optional(),
	})
	.refine(
		(data) => {
			// Must have either resources or properties
			return (
				(data.resources && data.resources.length > 0) ||
				(data.properties && data.properties.length > 0)
			);
		},
		{
			message: 'Node must have either resources or properties defined',
			path: ['resources'],
		},
	);

/**
 * Validate node definition
 */
export function validateNodeDefinition(definition: unknown): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	try {
		const result = nodeDefinitionSchema.safeParse(definition);

		if (!result.success) {
			// Convert Zod errors to ValidationErrors
			result.error.errors.forEach((err) => {
				errors.push({
					path: err.path.join('.'),
					message: err.message,
					suggestion: getSuggestionForError(err.path.join('.'), err.message),
				});
			});
		} else {
			// Additional semantic validation
			const def = result.data;

			// Check for naming conflicts
			if (def.resources) {
				const resourceNames = new Set<string>();
				def.resources.forEach((resource) => {
					if (resourceNames.has(resource.name)) {
						errors.push({
							path: `resources.${resource.name}`,
							message: `Duplicate resource name: ${resource.name}`,
							suggestion: 'Use unique names for each resource',
						});
					}
					resourceNames.add(resource.name);

					// Check operation names within resource
					const opNames = new Set<string>();
					resource.operations.forEach((op) => {
						if (opNames.has(op.name)) {
							errors.push({
								path: `resources.${resource.name}.operations.${op.name}`,
								message: `Duplicate operation name: ${op.name}`,
								suggestion: 'Use unique names for each operation',
							});
						}
						opNames.add(op.name);
					});
				});
			}

			// Check property names
			if (def.properties) {
				const propNames = new Set<string>();
				def.properties.forEach((prop) => {
					if (propNames.has(prop.name)) {
						errors.push({
							path: `properties.${prop.name}`,
							message: `Duplicate property name: ${prop.name}`,
							suggestion: 'Use unique names for each property',
						});
					}
					propNames.add(prop.name);

					// Validate property-specific constraints
					if (prop.type === PropertyType.OPTIONS && (!prop.options || prop.options.length === 0)) {
						errors.push({
							path: `properties.${prop.name}`,
							message: 'OPTIONS type property must have options defined',
							suggestion: 'Add at least one option to the options array',
						});
					}
				});
			}

			// Warnings
			if (!def.icon) {
				warnings.push({
					path: 'icon',
					message: 'No icon specified',
					suggestion: 'Consider adding an icon for better visual identification',
				});
			}

			if (!def.documentationUrl) {
				warnings.push({
					path: 'documentationUrl',
					message: 'No documentation URL provided',
					suggestion: 'Add documentation URL to help users understand the node',
				});
			}

			if (def.description.length < 30) {
				warnings.push({
					path: 'description',
					message: 'Description is quite short',
					suggestion: 'Consider providing more details about what the node does',
				});
			}
		}
	} catch (error) {
		errors.push({
			path: 'root',
			message: error instanceof Error ? error.message : 'Unknown validation error',
			suggestion: 'Check the node definition structure',
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Validate property definition
 */
export function validateProperty(property: unknown): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	try {
		const result = propertyDefinitionSchema.safeParse(property);

		if (!result.success) {
			result.error.errors.forEach((err) => {
				errors.push({
					path: err.path.join('.'),
					message: err.message,
					suggestion: getSuggestionForError(err.path.join('.'), err.message),
				});
			});
		}
	} catch (error) {
		errors.push({
			path: 'root',
			message: error instanceof Error ? error.message : 'Unknown validation error',
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Get suggestion for common validation errors
 */
function getSuggestionForError(path: string, message: string): string {
	// Naming suggestions
	if (message.includes('valid identifier')) {
		return 'Use camelCase for property names (e.g., myProperty, userId, apiKey)';
	}

	if (message.includes('PascalCase')) {
		return 'Use PascalCase for node names (e.g., MyCustomNode, ApiIntegration)';
	}

	// URL suggestions
	if (message.includes('valid URL')) {
		return 'Provide a complete URL starting with http:// or https://';
	}

	// Required field suggestions
	if (message.includes('required')) {
		return `The field "${path}" is required and cannot be empty`;
	}

	// Length suggestions
	if (message.includes('at least')) {
		return 'Provide more descriptive text to help users understand';
	}

	if (message.includes('under')) {
		return 'Keep text concise to maintain good UX';
	}

	// Type suggestions
	if (path.includes('type')) {
		return 'Use one of the supported property types: string, number, boolean, options, etc.';
	}

	// Default suggestion
	return 'Check the documentation for the correct format';
}

/**
 * Export schemas for external use
 */
export {
	propertyDefinitionSchema,
	operationDefinitionSchema,
	resourceDefinitionSchema,
	credentialDefinitionSchema,
	iconConfigSchema,
};
