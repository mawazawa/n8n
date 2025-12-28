import { z } from 'zod';

/**
 * UI component types for config fields
 */
export enum ConfigUIComponent {
	TEXT = 'text',
	NUMBER = 'number',
	BOOLEAN = 'boolean',
	SELECT = 'select',
	MULTISELECT = 'multiselect',
	TEXTAREA = 'textarea',
	COLOR = 'color',
	DATE = 'date',
	FILE = 'file',
	JSON = 'json',
	CODE = 'code',
}

/**
 * Config field definition
 */
export interface ConfigField {
	key: string;
	label: string;
	description?: string;
	component: ConfigUIComponent;
	defaultValue?: unknown;
	required?: boolean;
	validation?: z.ZodType;
	options?: Array<{ value: unknown; label: string }>;
	placeholder?: string;
	min?: number;
	max?: number;
	step?: number;
	language?: string; // For code editor
	accept?: string; // For file input
}

/**
 * Config section for grouping fields
 */
export interface ConfigSection {
	title: string;
	description?: string;
	fields: ConfigField[];
	collapsible?: boolean;
	collapsed?: boolean;
}

/**
 * Config schema with UI hints
 */
export interface ConfigSchema {
	title: string;
	description?: string;
	sections: ConfigSection[];
	validation?: z.ZodType;
}

/**
 * Configuration schema builder
 */
export class ConfigSchemaBuilder {
	private schema: ConfigSchema = {
		title: '',
		sections: [],
	};

	/**
	 * Set schema title and description
	 */
	withTitle(title: string, description?: string): this {
		this.schema.title = title;
		this.schema.description = description;
		return this;
	}

	/**
	 * Add a section
	 */
	addSection(title: string, description?: string): ConfigSectionBuilder {
		const section: ConfigSection = {
			title,
			description,
			fields: [],
		};

		this.schema.sections.push(section);
		return new ConfigSectionBuilder(this, section);
	}

	/**
	 * Set schema-level validation
	 */
	withValidation(validation: z.ZodType): this {
		this.schema.validation = validation;
		return this;
	}

	/**
	 * Build the schema
	 */
	build(): ConfigSchema {
		return this.schema;
	}
}

/**
 * Config section builder
 */
export class ConfigSectionBuilder {
	constructor(
		private parent: ConfigSchemaBuilder,
		private section: ConfigSection,
	) {}

	/**
	 * Make section collapsible
	 */
	collapsible(collapsed: boolean = false): this {
		this.section.collapsible = true;
		this.section.collapsed = collapsed;
		return this;
	}

	/**
	 * Add text field
	 */
	addText(
		key: string,
		label: string,
		options?: {
			description?: string;
			defaultValue?: string;
			required?: boolean;
			placeholder?: string;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.TEXT,
			...options,
		});
		return this;
	}

	/**
	 * Add number field
	 */
	addNumber(
		key: string,
		label: string,
		options?: {
			description?: string;
			defaultValue?: number;
			required?: boolean;
			min?: number;
			max?: number;
			step?: number;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.NUMBER,
			...options,
		});
		return this;
	}

	/**
	 * Add boolean field
	 */
	addBoolean(
		key: string,
		label: string,
		options?: {
			description?: string;
			defaultValue?: boolean;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.BOOLEAN,
			...options,
		});
		return this;
	}

	/**
	 * Add select field
	 */
	addSelect(
		key: string,
		label: string,
		selectOptions: Array<{ value: unknown; label: string }>,
		options?: {
			description?: string;
			defaultValue?: unknown;
			required?: boolean;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.SELECT,
			options: selectOptions,
			...options,
		});
		return this;
	}

	/**
	 * Add textarea field
	 */
	addTextarea(
		key: string,
		label: string,
		options?: {
			description?: string;
			defaultValue?: string;
			required?: boolean;
			placeholder?: string;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.TEXTAREA,
			...options,
		});
		return this;
	}

	/**
	 * Add code editor field
	 */
	addCode(
		key: string,
		label: string,
		language: string,
		options?: {
			description?: string;
			defaultValue?: string;
			required?: boolean;
			validation?: z.ZodType;
		},
	): this {
		this.section.fields.push({
			key,
			label,
			component: ConfigUIComponent.CODE,
			language,
			...options,
		});
		return this;
	}

	/**
	 * End section and return to schema builder
	 */
	end(): ConfigSchemaBuilder {
		return this.parent;
	}
}

/**
 * Config validator
 */
export class ConfigValidator {
	/**
	 * Validate configuration against schema
	 */
	validate(config: Record<string, unknown>, schema: ConfigSchema): {
		valid: boolean;
		errors: Array<{ field: string; message: string }>;
		data?: Record<string, unknown>;
	} {
		const errors: Array<{ field: string; message: string }> = [];
		const validatedData: Record<string, unknown> = {};

		// Validate each field
		for (const section of schema.sections) {
			for (const field of section.fields) {
				const value = config[field.key];

				// Check required fields
				if (field.required && (value === undefined || value === null)) {
					errors.push({
						field: field.key,
						message: `${field.label} is required`,
					});
					continue;
				}

				// Use default value if not provided
				if (value === undefined && field.defaultValue !== undefined) {
					validatedData[field.key] = field.defaultValue;
					continue;
				}

				// Field-specific validation
				const fieldErrors = this.validateField(field, value);
				errors.push(...fieldErrors);

				if (fieldErrors.length === 0) {
					validatedData[field.key] = value;
				}
			}
		}

		// Schema-level validation
		if (schema.validation && errors.length === 0) {
			const result = schema.validation.safeParse(validatedData);
			if (!result.success) {
				for (const error of result.error.errors) {
					errors.push({
						field: error.path.join('.'),
						message: error.message,
					});
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			data: errors.length === 0 ? validatedData : undefined,
		};
	}

	/**
	 * Validate individual field
	 */
	private validateField(
		field: ConfigField,
		value: unknown,
	): Array<{ field: string; message: string }> {
		const errors: Array<{ field: string; message: string }> = [];

		// Skip if undefined (handled by required check)
		if (value === undefined || value === null) {
			return errors;
		}

		// Type validation based on component
		switch (field.component) {
			case ConfigUIComponent.NUMBER:
				if (typeof value !== 'number' || isNaN(value)) {
					errors.push({
						field: field.key,
						message: `${field.label} must be a number`,
					});
					break;
				}

				if (field.min !== undefined && value < field.min) {
					errors.push({
						field: field.key,
						message: `${field.label} must be at least ${field.min}`,
					});
				}

				if (field.max !== undefined && value > field.max) {
					errors.push({
						field: field.key,
						message: `${field.label} must be at most ${field.max}`,
					});
				}
				break;

			case ConfigUIComponent.BOOLEAN:
				if (typeof value !== 'boolean') {
					errors.push({
						field: field.key,
						message: `${field.label} must be a boolean`,
					});
				}
				break;

			case ConfigUIComponent.SELECT:
			case ConfigUIComponent.MULTISELECT:
				if (field.options) {
					const validValues = new Set(field.options.map((o) => o.value));
					const values = Array.isArray(value) ? value : [value];

					for (const v of values) {
						if (!validValues.has(v)) {
							errors.push({
								field: field.key,
								message: `${field.label} has invalid value: ${v}`,
							});
						}
					}
				}
				break;

			case ConfigUIComponent.JSON:
				if (typeof value === 'string') {
					try {
						JSON.parse(value);
					} catch {
						errors.push({
							field: field.key,
							message: `${field.label} must be valid JSON`,
						});
					}
				}
				break;
		}

		// Custom validation
		if (field.validation) {
			const result = field.validation.safeParse(value);
			if (!result.success) {
				for (const error of result.error.errors) {
					errors.push({
						field: field.key,
						message: error.message,
					});
				}
			}
		}

		return errors;
	}
}

/**
 * Config UI generator
 */
export class ConfigUIGenerator {
	/**
	 * Generate JSON Schema for UI rendering
	 */
	generateJSONSchema(schema: ConfigSchema): Record<string, unknown> {
		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const section of schema.sections) {
			for (const field of section.fields) {
				properties[field.key] = this.fieldToJSONSchema(field);

				if (field.required) {
					required.push(field.key);
				}
			}
		}

		return {
			type: 'object',
			title: schema.title,
			description: schema.description,
			properties,
			required,
		};
	}

	/**
	 * Convert field to JSON Schema
	 */
	private fieldToJSONSchema(field: ConfigField): Record<string, unknown> {
		const schema: Record<string, unknown> = {
			title: field.label,
			description: field.description,
		};

		switch (field.component) {
			case ConfigUIComponent.TEXT:
			case ConfigUIComponent.TEXTAREA:
			case ConfigUIComponent.CODE:
				schema.type = 'string';
				if (field.defaultValue) schema.default = field.defaultValue;
				break;

			case ConfigUIComponent.NUMBER:
				schema.type = 'number';
				if (field.min !== undefined) schema.minimum = field.min;
				if (field.max !== undefined) schema.maximum = field.max;
				if (field.defaultValue !== undefined) schema.default = field.defaultValue;
				break;

			case ConfigUIComponent.BOOLEAN:
				schema.type = 'boolean';
				if (field.defaultValue !== undefined) schema.default = field.defaultValue;
				break;

			case ConfigUIComponent.SELECT:
				schema.type = 'string';
				if (field.options) {
					schema.enum = field.options.map((o) => o.value);
				}
				if (field.defaultValue) schema.default = field.defaultValue;
				break;

			case ConfigUIComponent.MULTISELECT:
				schema.type = 'array';
				schema.items = { type: 'string' };
				if (field.options) {
					schema.uniqueItems = true;
				}
				break;
		}

		return schema;
	}
}
