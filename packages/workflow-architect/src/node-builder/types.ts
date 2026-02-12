/**
 * Custom Node Builder - Type Definitions
 * Core types for building n8n custom nodes
 */

/**
 * Node categories matching n8n's standard categories
 */
export enum NodeCategory {
	ANALYTICS = 'Analytics',
	COMMUNICATION = 'Communication',
	CRM = 'CRM',
	CUSTOMER_SUCCESS = 'Customer Success',
	DEVELOPMENT = 'Development',
	EDUCATION = 'Education',
	FINANCE = 'Finance & Accounting',
	HR = 'HR',
	IT_OPERATIONS = 'IT Operations',
	MARKETING = 'Marketing & Content',
	PRODUCTIVITY = 'Productivity',
	SALES = 'Sales',
	SECURITY = 'Security',
	CUSTOM = 'Custom',
}

/**
 * Operation types for node operations
 */
export enum OperationType {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	DELETE = 'DELETE',
	PATCH = 'PATCH',
	RESOURCE = 'RESOURCE',
	CUSTOM = 'CUSTOM',
}

/**
 * Property types matching n8n INodePropertyTypes
 */
export enum PropertyType {
	STRING = 'string',
	NUMBER = 'number',
	BOOLEAN = 'boolean',
	OPTIONS = 'options',
	MULTI_OPTIONS = 'multiOptions',
	JSON = 'json',
	DATE_TIME = 'dateTime',
	COLOR = 'color',
	COLLECTION = 'collection',
	FIXED_COLLECTION = 'fixedCollection',
	CREDENTIAL = 'credential',
	NOTICE = 'notice',
	HIDDEN = 'hidden',
}

/**
 * Display conditions for properties
 */
export interface DisplayCondition {
	property: string;
	value: unknown;
	operator?: 'equals' | 'notEquals' | 'contains' | 'regex';
}

/**
 * Property option for dropdowns
 */
export interface PropertyOption {
	name: string;
	value: string | number | boolean;
	description?: string;
	action?: string;
}

/**
 * Routing configuration for API requests
 */
export interface RoutingConfig {
	method?: string;
	url?: string;
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
	qs?: Record<string, unknown>;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
	type: 'offset' | 'cursor' | 'page' | 'url';
	limitParameter?: string;
	offsetParameter?: string;
	cursorParameter?: string;
	pageParameter?: string;
	maxRequests?: number;
}

/**
 * Property definition for node inputs
 */
export interface PropertyDefinition {
	name: string;
	displayName: string;
	type: PropertyType;
	default?: unknown;
	description?: string;
	placeholder?: string;
	required?: boolean;
	options?: PropertyOption[];
	displayOptions?: {
		show?: Record<string, unknown[]>;
		hide?: Record<string, unknown[]>;
	};
	routing?: RoutingConfig;
	typeOptions?: {
		minValue?: number;
		maxValue?: number;
		multipleValues?: boolean;
		multipleValueButtonText?: string;
		rows?: number;
		loadOptionsMethod?: string;
	};
	extractValue?: {
		type: 'regex' | 'json';
		regex?: string;
		jsonPath?: string;
	};
}

/**
 * Operation definition for resource operations
 */
export interface OperationDefinition {
	name: string;
	displayName: string;
	description: string;
	type: OperationType;
	properties?: PropertyDefinition[];
	routing?: RoutingConfig;
	pagination?: PaginationConfig;
}

/**
 * Resource definition grouping related operations
 */
export interface ResourceDefinition {
	name: string;
	displayName: string;
	description?: string;
	operations: OperationDefinition[];
}

/**
 * Credential property definition
 */
export interface CredentialPropertyDefinition {
	name: string;
	displayName: string;
	type: PropertyType;
	default?: string;
	description?: string;
	required?: boolean;
	typeOptions?: {
		password?: boolean;
		expiration?: string;
	};
}

/**
 * Credential test configuration
 */
export interface CredentialTest {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	url: string;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
}

/**
 * Credential definition
 */
export interface CredentialDefinition {
	name: string;
	displayName: string;
	documentationUrl?: string;
	properties: CredentialPropertyDefinition[];
	test?: CredentialTest;
	authenticate?: {
		type: 'generic' | 'bearer' | 'oauth2';
		properties?: Record<string, string>;
	};
}

/**
 * Icon configuration
 */
export interface IconConfig {
	type: 'file' | 'url' | 'emoji' | 'fontawesome';
	value: string;
	optimized?: boolean;
}

/**
 * Complete node definition
 */
export interface NodeDefinition {
	name: string;
	displayName: string;
	description: string;
	version: number;
	defaults: {
		name: string;
		color?: string;
	};
	icon?: IconConfig;
	category: NodeCategory;
	credentials?: CredentialDefinition[];
	resources?: ResourceDefinition[];
	properties?: PropertyDefinition[];
	inputs?: string[];
	outputs?: string[];
	webhooks?: {
		name: string;
		httpMethod: string;
		path?: string;
	}[];
	polling?: boolean;
	group?: string[];
	subtitle?: string;
	documentationUrl?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
	path: string;
	message: string;
	suggestion?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
	path: string;
	message: string;
	suggestion?: string;
}

/**
 * Compiled node output
 */
export interface CompiledNode {
	code: string;
	sourceMap?: string;
	dependencies: string[];
}

/**
 * Node execution result for testing
 */
export interface ExecutionResult {
	success: boolean;
	data?: unknown[];
	error?: {
		message: string;
		stack?: string;
	};
}

/**
 * Registered node in registry
 */
export interface RegisteredNode {
	id: string;
	nodeDefinition: NodeDefinition;
	version: string;
	author: string;
	createdAt: Date;
	updatedAt: Date;
	downloads: number;
	published: boolean;
}

/**
 * Icon data for processing
 */
export interface IconData {
	format: 'svg' | 'png' | 'jpg';
	data: string | Buffer;
	width?: number;
	height?: number;
}

/**
 * Template type for pre-built nodes
 */
export enum TemplateType {
	REST_API = 'restApi',
	DATABASE = 'database',
	WEBHOOK = 'webhook',
	TRIGGER = 'trigger',
	AI_LANGCHAIN = 'aiLangchain',
	FILE_PROCESSING = 'fileProcessing',
	DATA_TRANSFORMATION = 'dataTransformation',
}

/**
 * AI generation context
 */
export interface AIGenerationContext {
	description: string;
	apiDocumentation?: string;
	exampleRequest?: Record<string, unknown>;
	exampleResponse?: Record<string, unknown>;
	authType?: 'apiKey' | 'oauth2' | 'basic' | 'none';
	baseUrl?: string;
}

/**
 * Package metadata for npm publishing
 */
export interface PackageMetadata {
	name: string;
	version: string;
	description: string;
	author?: string;
	license?: string;
	keywords?: string[];
	repository?: {
		type: string;
		url: string;
	};
}

/**
 * OpenAPI specification (simplified)
 */
export interface OpenAPISpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	servers?: Array<{
		url: string;
		description?: string;
	}>;
	paths: Record<string, Record<string, unknown>>;
	components?: {
		schemas?: Record<string, unknown>;
		securitySchemes?: Record<string, unknown>;
	};
}

/**
 * Postman collection (simplified)
 */
export interface PostmanCollection {
	info: {
		name: string;
		description?: string;
		schema: string;
	};
	item: Array<{
		name: string;
		request: {
			method: string;
			url: string | { raw: string };
			header?: Array<{ key: string; value: string }>;
			body?: unknown;
		};
	}>;
}

/**
 * n8n node format for export
 */
export interface N8nNodeDefinition {
	displayName: string;
	name: string;
	icon?: string;
	group: string[];
	version: number;
	description: string;
	defaults: {
		name: string;
	};
	inputs: string[];
	outputs: string[];
	credentials?: Array<{
		name: string;
		required: boolean;
	}>;
	properties: Array<Record<string, unknown>>;
}
