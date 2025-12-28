/**
 * Custom Node Builder - Property Builder
 * Fluent API for building node properties
 */

import type { PropertyDefinition, PropertyOption, PropertyType, RoutingConfig } from './types';

/**
 * Property builder with fluent API
 */
export class PropertyBuilder {
	private property: Partial<PropertyDefinition>;

	constructor(name: string, type: PropertyType) {
		this.property = {
			name,
			type,
		};
	}

	/**
	 * Set display name
	 */
	displayName(name: string): this {
		this.property.displayName = name;
		return this;
	}

	/**
	 * Set default value
	 */
	withDefault(value: unknown): this {
		this.property.default = value;
		return this;
	}

	/**
	 * Set description
	 */
	withDescription(description: string): this {
		this.property.description = description;
		return this;
	}

	/**
	 * Set placeholder
	 */
	withPlaceholder(placeholder: string): this {
		this.property.placeholder = placeholder;
		return this;
	}

	/**
	 * Mark as required
	 */
	required(isRequired: boolean = true): this {
		this.property.required = isRequired;
		return this;
	}

	/**
	 * Add options for dropdown
	 */
	withOptions(options: PropertyOption[]): this {
		this.property.options = options;
		return this;
	}

	/**
	 * Add display condition - show when
	 */
	displayIf(conditions: Record<string, unknown[]>): this {
		if (!this.property.displayOptions) {
			this.property.displayOptions = {};
		}
		this.property.displayOptions.show = conditions;
		return this;
	}

	/**
	 * Add display condition - hide when
	 */
	hideIf(conditions: Record<string, unknown[]>): this {
		if (!this.property.displayOptions) {
			this.property.displayOptions = {};
		}
		this.property.displayOptions.hide = conditions;
		return this;
	}

	/**
	 * Add routing configuration
	 */
	routing(config: RoutingConfig): this {
		this.property.routing = config;
		return this;
	}

	/**
	 * Add type options
	 */
	typeOptions(options: PropertyDefinition['typeOptions']): this {
		this.property.typeOptions = options;
		return this;
	}

	/**
	 * Enable multiple values
	 */
	multipleValues(enabled: boolean = true, buttonText?: string): this {
		if (!this.property.typeOptions) {
			this.property.typeOptions = {};
		}
		this.property.typeOptions.multipleValues = enabled;
		if (buttonText) {
			this.property.typeOptions.multipleValueButtonText = buttonText;
		}
		return this;
	}

	/**
	 * Set number constraints
	 */
	numberRange(min?: number, max?: number): this {
		if (!this.property.typeOptions) {
			this.property.typeOptions = {};
		}
		if (min !== undefined) {
			this.property.typeOptions.minValue = min;
		}
		if (max !== undefined) {
			this.property.typeOptions.maxValue = max;
		}
		return this;
	}

	/**
	 * Set textarea rows
	 */
	rows(count: number): this {
		if (!this.property.typeOptions) {
			this.property.typeOptions = {};
		}
		this.property.typeOptions.rows = count;
		return this;
	}

	/**
	 * Build the property
	 */
	build(): PropertyDefinition {
		if (!this.property.displayName) {
			// Auto-generate display name from property name
			this.property.displayName = this.formatDisplayName(this.property.name!);
		}

		return this.property as PropertyDefinition;
	}

	/**
	 * Format display name from property name
	 */
	private formatDisplayName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}
}

/**
 * Create a string property
 */
export function string(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'string' as PropertyType);
}

/**
 * Create a number property
 */
export function number(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'number' as PropertyType);
}

/**
 * Create a boolean property
 */
export function boolean(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'boolean' as PropertyType);
}

/**
 * Create an options property (dropdown)
 */
export function options(name: string, opts: PropertyOption[]): PropertyBuilder {
	return new PropertyBuilder(name, 'options' as PropertyType).withOptions(opts);
}

/**
 * Create a multi-options property (multi-select)
 */
export function multiOptions(name: string, opts: PropertyOption[]): PropertyBuilder {
	return new PropertyBuilder(name, 'multiOptions' as PropertyType).withOptions(opts);
}

/**
 * Create a JSON property
 */
export function json(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'json' as PropertyType);
}

/**
 * Create a dateTime property
 */
export function dateTime(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'dateTime' as PropertyType);
}

/**
 * Create a color property
 */
export function color(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'color' as PropertyType);
}

/**
 * Create a collection property
 */
export function collection(name: string): PropertyBuilder {
	return new PropertyBuilder(name, 'collection' as PropertyType);
}

/**
 * Create a credential property
 */
export function credential(name: string, credentialType: string): PropertyBuilder {
	return new PropertyBuilder(name, 'credential' as PropertyType).withDefault(credentialType);
}

/**
 * Create a notice property (informational)
 */
export function notice(name: string, message: string): PropertyBuilder {
	return new PropertyBuilder(name, 'notice' as PropertyType).withDescription(message);
}

/**
 * Create a hidden property
 */
export function hidden(name: string, value: unknown): PropertyBuilder {
	return new PropertyBuilder(name, 'hidden' as PropertyType).withDefault(value);
}

/**
 * Common property presets
 */
export const presets = {
	/**
	 * API endpoint URL
	 */
	endpoint(required: boolean = true): PropertyDefinition {
		return string('endpoint')
			.displayName('Endpoint')
			.withDescription('The API endpoint path')
			.withPlaceholder('/api/v1/resource')
			.required(required)
			.build();
	},

	/**
	 * HTTP method selector
	 */
	httpMethod(): PropertyDefinition {
		return options('httpMethod', [
			{ name: 'GET', value: 'GET' },
			{ name: 'POST', value: 'POST' },
			{ name: 'PUT', value: 'PUT' },
			{ name: 'PATCH', value: 'PATCH' },
			{ name: 'DELETE', value: 'DELETE' },
		])
			.displayName('HTTP Method')
			.withDescription('The HTTP method to use')
			.withDefault('GET')
			.build();
	},

	/**
	 * Request body (JSON)
	 */
	requestBody(): PropertyDefinition {
		return json('body')
			.displayName('Request Body')
			.withDescription('The request body as JSON')
			.withPlaceholder('{ "key": "value" }')
			.build();
	},

	/**
	 * Query parameters
	 */
	queryParameters(): PropertyDefinition {
		return json('queryParameters')
			.displayName('Query Parameters')
			.withDescription('Query parameters to add to the URL')
			.withPlaceholder('{ "param": "value" }')
			.build();
	},

	/**
	 * Headers
	 */
	headers(): PropertyDefinition {
		return json('headers')
			.displayName('Headers')
			.withDescription('Custom headers to send with the request')
			.withPlaceholder('{ "X-Custom-Header": "value" }')
			.build();
	},

	/**
	 * Pagination limit
	 */
	limit(): PropertyDefinition {
		return number('limit')
			.displayName('Limit')
			.withDescription('Maximum number of results to return')
			.withDefault(50)
			.numberRange(1, 1000)
			.build();
	},

	/**
	 * Pagination offset
	 */
	offset(): PropertyDefinition {
		return number('offset')
			.displayName('Offset')
			.withDescription('Number of results to skip')
			.withDefault(0)
			.numberRange(0)
			.build();
	},

	/**
	 * Return all results
	 */
	returnAll(): PropertyDefinition {
		return boolean('returnAll')
			.displayName('Return All')
			.withDescription('Whether to return all results or only up to the limit')
			.withDefault(false)
			.build();
	},

	/**
	 * Filter expression
	 */
	filters(): PropertyDefinition {
		return string('filters')
			.displayName('Filters')
			.withDescription('Filter expression to apply')
			.withPlaceholder('status=active')
			.build();
	},

	/**
	 * Sort field
	 */
	sortBy(): PropertyDefinition {
		return string('sortBy')
			.displayName('Sort By')
			.withDescription('Field to sort by')
			.withPlaceholder('createdAt')
			.build();
	},

	/**
	 * Sort order
	 */
	sortOrder(): PropertyDefinition {
		return options('sortOrder', [
			{ name: 'Ascending', value: 'asc' },
			{ name: 'Descending', value: 'desc' },
		])
			.displayName('Sort Order')
			.withDescription('Sort order')
			.withDefault('asc')
			.build();
	},

	/**
	 * ID field (for get/update/delete operations)
	 */
	id(displayName: string = 'ID'): PropertyDefinition {
		return string('id')
			.displayName(displayName)
			.withDescription(`The ${displayName.toLowerCase()} to operate on`)
			.required(true)
			.build();
	},

	/**
	 * Additional fields
	 */
	additionalFields(fields: PropertyDefinition[]): PropertyDefinition {
		return collection('additionalFields')
			.displayName('Additional Fields')
			.withDescription('Additional optional fields')
			.withDefault({})
			.build();
	},
};
