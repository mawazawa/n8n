import { JSONPath } from 'jsonpath-plus';
import { DataMapping, DataMappingSchema } from './types';

/**
 * Mapping definition
 */
interface Mapping {
	id: string;
	name: string;
	sourceSchema?: Record<string, unknown>;
	targetSchema?: Record<string, unknown>;
	mappings: DataMapping[];
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Transformed data result
 */
interface TransformedData {
	data: Record<string, unknown>;
	errors: Array<{
		field: string;
		error: string;
	}>;
}

/**
 * Data Mapper
 * Handles data transformation between different schemas using JSONPath and templates
 */
export class DataMapper {
	/**
	 * Create a new mapping
	 */
	createMapping(
		name: string,
		mappings: DataMapping[],
		sourceSchema?: Record<string, unknown>,
		targetSchema?: Record<string, unknown>,
	): Mapping {
		// Validate mappings
		mappings.forEach((mapping) => DataMappingSchema.parse(mapping));

		return {
			id: this.generateId(),
			name,
			sourceSchema,
			targetSchema,
			mappings,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	/**
	 * Transform data using a mapping
	 */
	transform(sourceData: Record<string, unknown>, mapping: Mapping): TransformedData {
		const result: Record<string, unknown> = {};
		const errors: Array<{ field: string; error: string }> = [];

		for (const fieldMapping of mapping.mappings) {
			try {
				const value = this.transformField(sourceData, fieldMapping);
				this.setNestedValue(result, fieldMapping.targetField, value);
			} catch (error) {
				errors.push({
					field: fieldMapping.targetField,
					error: error instanceof Error ? error.message : 'Unknown error',
				});

				// Set default value if available
				if (fieldMapping.transform?.defaultValue !== undefined) {
					this.setNestedValue(result, fieldMapping.targetField, fieldMapping.transform.defaultValue);
				}
			}
		}

		return {
			data: result,
			errors,
		};
	}

	/**
	 * Transform a single field
	 */
	private transformField(sourceData: Record<string, unknown>, mapping: DataMapping): unknown {
		let value: unknown;

		// Extract value based on transform type
		if (!mapping.transform || mapping.transform.type === 'direct') {
			// Direct mapping
			value = this.getNestedValue(sourceData, mapping.sourceField);
		} else {
			switch (mapping.transform.type) {
				case 'jsonpath':
					value = this.applyJSONPath(sourceData, mapping.transform.expression || mapping.sourceField);
					break;

				case 'template':
					value = this.applyTemplate(sourceData, mapping.transform.expression || '');
					break;

				case 'function':
					value = this.applyFunction(sourceData, mapping.transform.expression || '', mapping.sourceField);
					break;

				default:
					throw new Error(`Unsupported transform type: ${mapping.transform.type}`);
			}
		}

		// Apply type coercion if specified
		if (mapping.transform?.coerce) {
			value = this.coerceType(value, mapping.transform.coerce);
		}

		return value;
	}

	/**
	 * Apply JSONPath expression
	 */
	private applyJSONPath(data: Record<string, unknown>, expression: string): unknown {
		const results = JSONPath({ path: expression, json: data });

		if (results.length === 0) {
			return undefined;
		}

		return results.length === 1 ? results[0] : results;
	}

	/**
	 * Apply template transformation
	 */
	private applyTemplate(data: Record<string, unknown>, template: string): string {
		// Replace {{ field.path }} with actual values
		return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => {
			const value = this.getNestedValue(data, path.trim());
			return value !== undefined ? String(value) : '';
		});
	}

	/**
	 * Apply function transformation
	 */
	private applyFunction(data: Record<string, unknown>, expression: string, sourceField: string): unknown {
		// Get the source value
		const sourceValue = this.getNestedValue(data, sourceField);

		// Create a safe evaluation context
		const context = {
			value: sourceValue,
			data,
			// Utility functions
			toUpperCase: (str: string) => str.toUpperCase(),
			toLowerCase: (str: string) => str.toLowerCase(),
			trim: (str: string) => str.trim(),
			split: (str: string, separator: string) => str.split(separator),
			join: (arr: string[], separator: string) => arr.join(separator),
			parse: (str: string) => JSON.parse(str),
			stringify: (obj: unknown) => JSON.stringify(obj),
		};

		// Evaluate the expression safely
		try {
			const func = new Function(...Object.keys(context), `return ${expression}`);
			return func(...Object.values(context));
		} catch (error) {
			throw new Error(`Function transformation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Coerce value to specified type
	 */
	private coerceType(value: unknown, type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'): unknown {
		if (value === null || value === undefined) {
			return value;
		}

		switch (type) {
			case 'string':
				return String(value);

			case 'number':
				const num = Number(value);
				if (isNaN(num)) {
					throw new Error(`Cannot coerce "${value}" to number`);
				}
				return num;

			case 'boolean':
				if (typeof value === 'boolean') return value;
				if (typeof value === 'string') {
					const lower = value.toLowerCase();
					if (lower === 'true' || lower === '1' || lower === 'yes') return true;
					if (lower === 'false' || lower === '0' || lower === 'no') return false;
				}
				return Boolean(value);

			case 'date':
				const date = new Date(value as string | number);
				if (isNaN(date.getTime())) {
					throw new Error(`Cannot coerce "${value}" to date`);
				}
				return date;

			case 'array':
				if (Array.isArray(value)) return value;
				return [value];

			case 'object':
				if (typeof value === 'object') return value;
				if (typeof value === 'string') {
					try {
						return JSON.parse(value);
					} catch {
						throw new Error(`Cannot coerce "${value}" to object`);
					}
				}
				return { value };

			default:
				return value;
		}
	}

	/**
	 * Get nested value from object using dot notation
	 */
	private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
		const parts = path.split('.');
		let current: unknown = obj;

		for (const part of parts) {
			if (current === null || current === undefined) {
				return undefined;
			}

			// Handle array indexing
			const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
			if (arrayMatch) {
				const [, key, index] = arrayMatch;
				current = (current as Record<string, unknown>)[key];
				if (Array.isArray(current)) {
					current = current[parseInt(index, 10)];
				}
			} else {
				current = (current as Record<string, unknown>)[part];
			}
		}

		return current;
	}

	/**
	 * Set nested value in object using dot notation
	 */
	private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
		const parts = path.split('.');
		let current: Record<string, unknown> = obj;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];

			// Handle array indexing
			const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
			if (arrayMatch) {
				const [, key, index] = arrayMatch;
				if (!current[key]) {
					current[key] = [];
				}
				const arr = current[key] as unknown[];
				const idx = parseInt(index, 10);
				if (!arr[idx]) {
					arr[idx] = {};
				}
				current = arr[idx] as Record<string, unknown>;
			} else {
				if (!current[part] || typeof current[part] !== 'object') {
					current[part] = {};
				}
				current = current[part] as Record<string, unknown>;
			}
		}

		const lastPart = parts[parts.length - 1];
		current[lastPart] = value;
	}

	/**
	 * Batch transform multiple records
	 */
	batchTransform(sourceData: Array<Record<string, unknown>>, mapping: Mapping): TransformedData[] {
		return sourceData.map((data) => this.transform(data, mapping));
	}

	/**
	 * Validate mapping against schemas
	 */
	validateMapping(mapping: Mapping): Array<{ field: string; error: string }> {
		const errors: Array<{ field: string; error: string }> = [];

		// Validate source fields exist in source schema
		if (mapping.sourceSchema) {
			for (const fieldMapping of mapping.mappings) {
				const sourceExists = this.fieldExistsInSchema(
					fieldMapping.sourceField,
					mapping.sourceSchema,
				);
				if (!sourceExists) {
					errors.push({
						field: fieldMapping.sourceField,
						error: 'Source field does not exist in schema',
					});
				}
			}
		}

		// Validate target fields match target schema
		if (mapping.targetSchema) {
			for (const fieldMapping of mapping.mappings) {
				const targetExists = this.fieldExistsInSchema(
					fieldMapping.targetField,
					mapping.targetSchema,
				);
				if (!targetExists) {
					errors.push({
						field: fieldMapping.targetField,
						error: 'Target field does not exist in schema',
					});
				}
			}
		}

		return errors;
	}

	/**
	 * Check if field exists in schema
	 */
	private fieldExistsInSchema(fieldPath: string, schema: Record<string, unknown>): boolean {
		const parts = fieldPath.split('.');
		let current: unknown = schema;

		for (const part of parts) {
			if (!current || typeof current !== 'object') {
				return false;
			}

			const cleanPart = part.replace(/\[\d+\]$/, '');
			current = (current as Record<string, unknown>)[cleanPart];
		}

		return current !== undefined;
	}

	/**
	 * Generate a unique ID
	 */
	private generateId(): string {
		return `mapping_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * Infer mapping from sample data
	 */
	inferMapping(sourceData: Record<string, unknown>, targetData: Record<string, unknown>): DataMapping[] {
		const mappings: DataMapping[] = [];
		const sourceKeys = this.flattenKeys(sourceData);
		const targetKeys = this.flattenKeys(targetData);

		// Try to match fields with same name
		for (const targetKey of targetKeys) {
			const matchingSourceKey = sourceKeys.find((sk) => {
				const sourceName = sk.split('.').pop();
				const targetName = targetKey.split('.').pop();
				return sourceName === targetName;
			});

			if (matchingSourceKey) {
				mappings.push({
					sourceField: matchingSourceKey,
					targetField: targetKey,
					transform: {
						type: 'direct',
					},
				});
			}
		}

		return mappings;
	}

	/**
	 * Flatten object keys to dot notation
	 */
	private flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
		const keys: string[] = [];

		for (const [key, value] of Object.entries(obj)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;

			if (value && typeof value === 'object' && !Array.isArray(value)) {
				keys.push(...this.flattenKeys(value as Record<string, unknown>, fullKey));
			} else {
				keys.push(fullKey);
			}
		}

		return keys;
	}
}
