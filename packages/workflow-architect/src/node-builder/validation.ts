/**
 * Custom Node Builder - Runtime Validation
 * Validate node execution at runtime
 */

import type { ValidationResult, NodeDefinition, PropertyDefinition } from './types';
import { PropertyType } from './types';

/**
 * Validate node input at runtime
 */
export function validateAtRuntime(
	nodeDefinition: NodeDefinition,
	input: Record<string, unknown>,
): ValidationResult {
	const errors: ValidationResult['errors'] = [];
	const warnings: ValidationResult['warnings'] = [];

	// Get properties to validate
	const properties = nodeDefinition.properties || [];

	// Validate each property
	properties.forEach((property) => {
		const value = input[property.name];

		// Check required fields
		if (property.required && (value === undefined || value === null || value === '')) {
			errors.push({
				path: property.name,
				message: `${property.displayName} is required`,
				suggestion: property.placeholder
					? `Example: ${property.placeholder}`
					: 'Please provide a value',
			});
			return;
		}

		// Skip validation if value is not provided and not required
		if (value === undefined || value === null) {
			return;
		}

		// Type validation
		const typeValidation = validatePropertyType(property, value);
		if (!typeValidation.valid) {
			errors.push({
				path: property.name,
				message: typeValidation.message || 'Invalid type',
				suggestion: typeValidation.suggestion,
			});
		}

		// Range validation for numbers
		if (property.type === PropertyType.NUMBER && typeof value === 'number') {
			if (property.typeOptions?.minValue !== undefined && value < property.typeOptions.minValue) {
				errors.push({
					path: property.name,
					message: `Value must be at least ${property.typeOptions.minValue}`,
					suggestion: `Provide a value >= ${property.typeOptions.minValue}`,
				});
			}

			if (property.typeOptions?.maxValue !== undefined && value > property.typeOptions.maxValue) {
				errors.push({
					path: property.name,
					message: `Value must be at most ${property.typeOptions.maxValue}`,
					suggestion: `Provide a value <= ${property.typeOptions.maxValue}`,
				});
			}
		}

		// Options validation
		if (
			(property.type === PropertyType.OPTIONS || property.type === PropertyType.MULTI_OPTIONS) &&
			property.options
		) {
			const validValues = property.options.map((opt) => opt.value);

			if (property.type === PropertyType.OPTIONS) {
				if (!validValues.includes(value as string | number | boolean)) {
					errors.push({
						path: property.name,
						message: `Invalid option: ${value}`,
						suggestion: `Choose one of: ${validValues.join(', ')}`,
					});
				}
			} else if (Array.isArray(value)) {
				const invalidValues = (value as Array<string | number | boolean>).filter(
					(v) => !validValues.includes(v),
				);
				if (invalidValues.length > 0) {
					errors.push({
						path: property.name,
						message: `Invalid options: ${invalidValues.join(', ')}`,
						suggestion: `Choose from: ${validValues.join(', ')}`,
					});
				}
			}
		}
	});

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Validate property type
 */
function validatePropertyType(
	property: PropertyDefinition,
	value: unknown,
): { valid: boolean; message?: string; suggestion?: string } {
	switch (property.type) {
		case PropertyType.STRING:
			if (typeof value !== 'string') {
				return {
					valid: false,
					message: `${property.displayName} must be a string`,
					suggestion: 'Provide a text value',
				};
			}
			break;

		case PropertyType.NUMBER:
			if (typeof value !== 'number') {
				// Try to coerce
				const num = Number(value);
				if (isNaN(num)) {
					return {
						valid: false,
						message: `${property.displayName} must be a number`,
						suggestion: 'Provide a numeric value',
					};
				}
			}
			break;

		case PropertyType.BOOLEAN:
			if (typeof value !== 'boolean') {
				return {
					valid: false,
					message: `${property.displayName} must be a boolean`,
					suggestion: 'Provide true or false',
				};
			}
			break;

		case PropertyType.JSON:
			if (typeof value === 'string') {
				try {
					JSON.parse(value);
				} catch {
					return {
						valid: false,
						message: `${property.displayName} must be valid JSON`,
						suggestion: 'Check JSON syntax',
					};
				}
			} else if (typeof value !== 'object' || value === null) {
				return {
					valid: false,
					message: `${property.displayName} must be a JSON object`,
					suggestion: 'Provide a valid JSON object',
				};
			}
			break;

		case PropertyType.OPTIONS:
			// Validated separately in main function
			break;

		case PropertyType.MULTI_OPTIONS:
			if (!Array.isArray(value)) {
				return {
					valid: false,
					message: `${property.displayName} must be an array`,
					suggestion: 'Select one or more options',
				};
			}
			break;

		case PropertyType.DATE_TIME:
			if (typeof value === 'string') {
				const date = new Date(value);
				if (isNaN(date.getTime())) {
					return {
						valid: false,
						message: `${property.displayName} must be a valid date`,
						suggestion: 'Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)',
					};
				}
			}
			break;

		default:
			// Unknown type, skip validation
			break;
	}

	return { valid: true };
}

/**
 * Coerce value to expected type
 */
export function coerceValue(property: PropertyDefinition, value: unknown): unknown {
	if (value === undefined || value === null) {
		return property.default;
	}

	switch (property.type) {
		case PropertyType.STRING:
			return String(value);

		case PropertyType.NUMBER:
			const num = Number(value);
			return isNaN(num) ? property.default : num;

		case PropertyType.BOOLEAN:
			if (typeof value === 'boolean') {
				return value;
			}
			if (typeof value === 'string') {
				return value.toLowerCase() === 'true' || value === '1';
			}
			if (typeof value === 'number') {
				return value !== 0;
			}
			return Boolean(value);

		case PropertyType.JSON:
			if (typeof value === 'string') {
				try {
					return JSON.parse(value);
				} catch {
					return property.default;
				}
			}
			return value;

		case PropertyType.MULTI_OPTIONS:
			if (!Array.isArray(value)) {
				return [value];
			}
			return value;

		default:
			return value;
	}
}

/**
 * Sanitize input to prevent injection attacks
 */
export function sanitizeInput(value: unknown): unknown {
	if (typeof value === 'string') {
		// Basic HTML/script tag removal
		return value
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
			.replace(/javascript:/gi, '')
			.replace(/on\w+\s*=/gi, '');
	}

	if (Array.isArray(value)) {
		return value.map(sanitizeInput);
	}

	if (typeof value === 'object' && value !== null) {
		const sanitized: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			sanitized[key] = sanitizeInput(val);
		}
		return sanitized;
	}

	return value;
}

/**
 * Validation utilities
 */
export const validationUtils = {
	/**
	 * Check if value is empty
	 */
	isEmpty(value: unknown): boolean {
		if (value === undefined || value === null) {
			return true;
		}
		if (typeof value === 'string') {
			return value.trim() === '';
		}
		if (Array.isArray(value)) {
			return value.length === 0;
		}
		if (typeof value === 'object') {
			return Object.keys(value).length === 0;
		}
		return false;
	},

	/**
	 * Validate email format
	 */
	isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	},

	/**
	 * Validate URL format
	 */
	isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Validate JSON string
	 */
	isValidJson(json: string): boolean {
		try {
			JSON.parse(json);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Validate IP address
	 */
	isValidIp(ip: string): boolean {
		const ipv4Regex =
			/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
		return ipv4Regex.test(ip) || ipv6Regex.test(ip);
	},

	/**
	 * Validate regex pattern
	 */
	isValidRegex(pattern: string): boolean {
		try {
			new RegExp(pattern);
			return true;
		} catch {
			return false;
		}
	},
};

/**
 * Create error boundary for node execution
 */
export class ErrorBoundary {
	private maxRetries: number;
	private retryDelay: number;

	constructor(maxRetries: number = 3, retryDelay: number = 1000) {
		this.maxRetries = maxRetries;
		this.retryDelay = retryDelay;
	}

	/**
	 * Execute with error handling and retries
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');

				// Don't retry on validation errors
				if (lastError.message.includes('validation')) {
					throw lastError;
				}

				// Wait before retry
				if (attempt < this.maxRetries - 1) {
					await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (attempt + 1)));
				}
			}
		}

		throw lastError;
	}
}
