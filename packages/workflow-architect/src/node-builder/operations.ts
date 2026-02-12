/**
 * Custom Node Builder - Operation Builder
 * Fluent API for building node operations and resources
 */

import type {
	OperationDefinition,
	ResourceDefinition,
	OperationType,
	PropertyDefinition,
	RoutingConfig,
	PaginationConfig,
} from './types';

/**
 * Operation builder
 */
export class OperationBuilder {
	private operation: Partial<OperationDefinition>;

	constructor(name: string, type: OperationType) {
		this.operation = {
			name,
			type,
			properties: [],
		};
	}

	/**
	 * Set display name
	 */
	displayName(name: string): this {
		this.operation.displayName = name;
		return this;
	}

	/**
	 * Set description
	 */
	description(desc: string): this {
		this.operation.description = desc;
		return this;
	}

	/**
	 * Add a property
	 */
	addProperty(property: PropertyDefinition): this {
		if (!this.operation.properties) {
			this.operation.properties = [];
		}
		this.operation.properties.push(property);
		return this;
	}

	/**
	 * Add multiple properties
	 */
	addProperties(properties: PropertyDefinition[]): this {
		if (!this.operation.properties) {
			this.operation.properties = [];
		}
		this.operation.properties.push(...properties);
		return this;
	}

	/**
	 * Configure HTTP request
	 */
	withRequest(method: string, url: string, body?: Record<string, unknown>): this {
		this.operation.routing = {
			method,
			url,
			body,
		};
		return this;
	}

	/**
	 * Set routing configuration
	 */
	routing(config: RoutingConfig): this {
		this.operation.routing = config;
		return this;
	}

	/**
	 * Add pagination
	 */
	withPagination(config: PaginationConfig): this {
		this.operation.pagination = config;
		return this;
	}

	/**
	 * Build the operation
	 */
	build(): OperationDefinition {
		if (!this.operation.displayName) {
			this.operation.displayName = this.formatDisplayName(this.operation.name!);
		}
		if (!this.operation.description) {
			this.operation.description = `${this.operation.displayName} operation`;
		}

		return this.operation as OperationDefinition;
	}

	/**
	 * Format display name
	 */
	private formatDisplayName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}
}

/**
 * Resource builder
 */
export class ResourceBuilder {
	private resource: Partial<ResourceDefinition>;

	constructor(name: string) {
		this.resource = {
			name,
			operations: [],
		};
	}

	/**
	 * Set display name
	 */
	displayName(name: string): this {
		this.resource.displayName = name;
		return this;
	}

	/**
	 * Set description
	 */
	description(desc: string): this {
		this.resource.description = desc;
		return this;
	}

	/**
	 * Add an operation
	 */
	addOperation(operation: OperationDefinition): this {
		if (!this.resource.operations) {
			this.resource.operations = [];
		}
		this.resource.operations.push(operation);
		return this;
	}

	/**
	 * Add multiple operations
	 */
	addOperations(operations: OperationDefinition[]): this {
		if (!this.resource.operations) {
			this.resource.operations = [];
		}
		this.resource.operations.push(...operations);
		return this;
	}

	/**
	 * Build the resource
	 */
	build(): ResourceDefinition {
		if (!this.resource.displayName) {
			this.resource.displayName = this.formatDisplayName(this.resource.name!);
		}

		return this.resource as ResourceDefinition;
	}

	/**
	 * Format display name
	 */
	private formatDisplayName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}
}

/**
 * Create a GET operation
 */
export function get(name: string): OperationBuilder {
	return new OperationBuilder(name, 'GET' as OperationType);
}

/**
 * Create a POST operation
 */
export function post(name: string): OperationBuilder {
	return new OperationBuilder(name, 'POST' as OperationType);
}

/**
 * Create a PUT operation
 */
export function put(name: string): OperationBuilder {
	return new OperationBuilder(name, 'PUT' as OperationType);
}

/**
 * Create a DELETE operation
 */
export function del(name: string): OperationBuilder {
	return new OperationBuilder(name, 'DELETE' as OperationType);
}

/**
 * Create a PATCH operation
 */
export function patch(name: string): OperationBuilder {
	return new OperationBuilder(name, 'PATCH' as OperationType);
}

/**
 * Create a custom operation
 */
export function custom(name: string): OperationBuilder {
	return new OperationBuilder(name, 'CUSTOM' as OperationType);
}

/**
 * Create a resource
 */
export function resource(name: string): ResourceBuilder {
	return new ResourceBuilder(name);
}

/**
 * Common operation presets
 */
export const operationPresets = {
	/**
	 * Standard CRUD operations for a resource
	 */
	crud(resourceName: string, baseUrl: string): OperationDefinition[] {
		return [
			// Create
			post('create')
				.displayName('Create')
				.description(`Create a new ${resourceName}`)
				.withRequest('POST', baseUrl)
				.build(),

			// Get (single)
			get('get')
				.displayName('Get')
				.description(`Get a ${resourceName} by ID`)
				.withRequest('GET', `${baseUrl}/={{$parameter["id"]}}`)
				.build(),

			// Get All
			get('getAll')
				.displayName('Get All')
				.description(`Get all ${resourceName}s`)
				.withRequest('GET', baseUrl)
				.withPagination({
					type: 'offset',
					limitParameter: 'limit',
					offsetParameter: 'offset',
				})
				.build(),

			// Update
			put('update')
				.displayName('Update')
				.description(`Update a ${resourceName}`)
				.withRequest('PUT', `${baseUrl}/={{$parameter["id"]}}`)
				.build(),

			// Delete
			del('delete')
				.displayName('Delete')
				.description(`Delete a ${resourceName}`)
				.withRequest('DELETE', `${baseUrl}/={{$parameter["id"]}}`)
				.build(),
		];
	},

	/**
	 * Search operation with filters
	 */
	search(resourceName: string, baseUrl: string): OperationDefinition {
		return get('search')
			.displayName('Search')
			.description(`Search ${resourceName}s`)
			.withRequest('GET', `${baseUrl}/search`)
			.build();
	},

	/**
	 * List operation with pagination
	 */
	list(resourceName: string, baseUrl: string): OperationDefinition {
		return get('list')
			.displayName('List')
			.description(`List all ${resourceName}s`)
			.withRequest('GET', baseUrl)
			.withPagination({
				type: 'offset',
				limitParameter: 'limit',
				offsetParameter: 'offset',
			})
			.build();
	},
};

/**
 * Pagination helpers
 */
export const pagination = {
	/**
	 * Offset-based pagination
	 */
	offset(limitParam: string = 'limit', offsetParam: string = 'offset'): PaginationConfig {
		return {
			type: 'offset',
			limitParameter: limitParam,
			offsetParameter: offsetParam,
		};
	},

	/**
	 * Cursor-based pagination
	 */
	cursor(cursorParam: string = 'cursor'): PaginationConfig {
		return {
			type: 'cursor',
			cursorParameter: cursorParam,
		};
	},

	/**
	 * Page-based pagination
	 */
	page(pageParam: string = 'page', limitParam: string = 'per_page'): PaginationConfig {
		return {
			type: 'page',
			pageParameter: pageParam,
			limitParameter: limitParam,
		};
	},

	/**
	 * URL-based pagination (next link in response)
	 */
	url(): PaginationConfig {
		return {
			type: 'url',
		};
	},
};

/**
 * Routing helpers
 */
export const routing = {
	/**
	 * Simple GET request
	 */
	getRequest(url: string, qs?: Record<string, unknown>): RoutingConfig {
		return {
			method: 'GET',
			url,
			qs,
		};
	},

	/**
	 * Simple POST request
	 */
	postRequest(url: string, body?: Record<string, unknown>): RoutingConfig {
		return {
			method: 'POST',
			url,
			body,
		};
	},

	/**
	 * Simple PUT request
	 */
	putRequest(url: string, body?: Record<string, unknown>): RoutingConfig {
		return {
			method: 'PUT',
			url,
			body,
		};
	},

	/**
	 * Simple DELETE request
	 */
	deleteRequest(url: string): RoutingConfig {
		return {
			method: 'DELETE',
			url,
		};
	},

	/**
	 * Request with custom headers
	 */
	withHeaders(config: RoutingConfig, headers: Record<string, string>): RoutingConfig {
		return {
			...config,
			headers,
		};
	},

	/**
	 * Request with query parameters
	 */
	withQueryParams(config: RoutingConfig, qs: Record<string, unknown>): RoutingConfig {
		return {
			...config,
			qs,
		};
	},
};
