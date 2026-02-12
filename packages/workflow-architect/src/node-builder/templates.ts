/**
 * Custom Node Builder - Templates
 * Pre-built node templates for common use cases
 */

import type { NodeDefinition, TemplateType } from './types';
import { NodeCategory, OperationType, PropertyType } from './types';
import { presets } from './properties';
import { operationPresets } from './operations';

/**
 * Get template by type
 */
export function getTemplate(type: TemplateType): NodeDefinition {
	switch (type) {
		case 'restApi':
			return restApiTemplate();
		case 'database':
			return databaseTemplate();
		case 'webhook':
			return webhookTemplate();
		case 'trigger':
			return triggerTemplate();
		case 'aiLangchain':
			return aiLangchainTemplate();
		case 'fileProcessing':
			return fileProcessingTemplate();
		case 'dataTransformation':
			return dataTransformationTemplate();
		default:
			throw new Error(`Unknown template type: ${type}`);
	}
}

/**
 * REST API template
 */
function restApiTemplate(): NodeDefinition {
	return {
		name: 'RestApi',
		displayName: 'REST API',
		description: 'Make HTTP requests to a REST API',
		version: 1,
		defaults: {
			name: 'REST API',
			color: '#00AA88',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:plug',
		},
		category: NodeCategory.DEVELOPMENT,
		credentials: [
			{
				name: 'ApiKey',
				displayName: 'API Key',
				properties: [
					{
						name: 'apiKey',
						displayName: 'API Key',
						type: PropertyType.STRING,
						required: true,
						typeOptions: { password: true },
					},
					{
						name: 'baseUrl',
						displayName: 'Base URL',
						type: PropertyType.STRING,
						required: true,
						default: 'https://api.example.com',
					},
				],
				authenticate: {
					type: 'generic',
					properties: {
						'X-API-Key': '={{$credentials.apiKey}}',
					},
				},
			},
		],
		resources: [
			{
				name: 'resource',
				displayName: 'Resource',
				operations: operationPresets.crud('resource', '/api/resources'),
			},
		],
		inputs: ['main'],
		outputs: ['main'],
	};
}

/**
 * Database template
 */
function databaseTemplate(): NodeDefinition {
	return {
		name: 'Database',
		displayName: 'Database',
		description: 'Execute database operations',
		version: 1,
		defaults: {
			name: 'Database',
			color: '#0066CC',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:database',
		},
		category: NodeCategory.DEVELOPMENT,
		credentials: [
			{
				name: 'DatabaseCredentials',
				displayName: 'Database Credentials',
				properties: [
					{
						name: 'host',
						displayName: 'Host',
						type: PropertyType.STRING,
						required: true,
						default: 'localhost',
					},
					{
						name: 'port',
						displayName: 'Port',
						type: PropertyType.NUMBER,
						required: true,
						default: '5432',
					},
					{
						name: 'database',
						displayName: 'Database',
						type: PropertyType.STRING,
						required: true,
					},
					{
						name: 'user',
						displayName: 'User',
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
			},
		],
		properties: [
			{
				name: 'operation',
				displayName: 'Operation',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'Execute Query', value: 'executeQuery' },
					{ name: 'Insert', value: 'insert' },
					{ name: 'Update', value: 'update' },
					{ name: 'Delete', value: 'delete' },
				],
				default: 'executeQuery',
			},
			{
				name: 'query',
				displayName: 'Query',
				type: PropertyType.STRING,
				typeOptions: { rows: 5 },
				displayOptions: {
					show: {
						operation: ['executeQuery'],
					},
				},
				default: 'SELECT * FROM table',
			},
		],
		inputs: ['main'],
		outputs: ['main'],
	};
}

/**
 * Webhook template
 */
function webhookTemplate(): NodeDefinition {
	return {
		name: 'Webhook',
		displayName: 'Webhook',
		description: 'Receive data from webhooks',
		version: 1,
		defaults: {
			name: 'Webhook',
			color: '#FF6B6B',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:webhook',
		},
		category: NodeCategory.DEVELOPMENT,
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
			},
		],
		properties: [
			{
				name: 'path',
				displayName: 'Path',
				type: PropertyType.STRING,
				default: 'webhook',
				description: 'The path for the webhook URL',
			},
			{
				name: 'responseMode',
				displayName: 'Response Mode',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'On Received', value: 'onReceived' },
					{ name: 'Last Node', value: 'lastNode' },
				],
				default: 'onReceived',
			},
		],
		inputs: [],
		outputs: ['main'],
	};
}

/**
 * Trigger template
 */
function triggerTemplate(): NodeDefinition {
	return {
		name: 'Trigger',
		displayName: 'Trigger',
		description: 'Trigger workflow on a schedule or event',
		version: 1,
		defaults: {
			name: 'Trigger',
			color: '#00CC88',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:clock',
		},
		category: NodeCategory.DEVELOPMENT,
		polling: true,
		properties: [
			{
				name: 'triggerType',
				displayName: 'Trigger Type',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'Schedule', value: 'schedule' },
					{ name: 'Polling', value: 'polling' },
				],
				default: 'schedule',
			},
			{
				name: 'interval',
				displayName: 'Interval',
				type: PropertyType.NUMBER,
				displayOptions: {
					show: {
						triggerType: ['schedule'],
					},
				},
				default: 60,
				description: 'Interval in seconds',
			},
		],
		inputs: [],
		outputs: ['main'],
	};
}

/**
 * AI/LangChain template
 */
function aiLangchainTemplate(): NodeDefinition {
	return {
		name: 'AiAgent',
		displayName: 'AI Agent',
		description: 'AI agent powered by LangChain',
		version: 1,
		defaults: {
			name: 'AI Agent',
			color: '#9B59B6',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:robot',
		},
		category: NodeCategory.CUSTOM,
		credentials: [
			{
				name: 'OpenAiApi',
				displayName: 'OpenAI API',
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
					type: 'bearer',
				},
			},
		],
		properties: [
			{
				name: 'prompt',
				displayName: 'Prompt',
				type: PropertyType.STRING,
				typeOptions: { rows: 5 },
				default: 'You are a helpful assistant.',
				description: 'The prompt for the AI agent',
			},
			{
				name: 'model',
				displayName: 'Model',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'GPT-4', value: 'gpt-4' },
					{ name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
				],
				default: 'gpt-3.5-turbo',
			},
			{
				name: 'temperature',
				displayName: 'Temperature',
				type: PropertyType.NUMBER,
				default: 0.7,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
				},
			},
		],
		inputs: ['main'],
		outputs: ['main'],
	};
}

/**
 * File processing template
 */
function fileProcessingTemplate(): NodeDefinition {
	return {
		name: 'FileProcessor',
		displayName: 'File Processor',
		description: 'Process files (read, write, convert)',
		version: 1,
		defaults: {
			name: 'File Processor',
			color: '#F39C12',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:file',
		},
		category: NodeCategory.DEVELOPMENT,
		properties: [
			{
				name: 'operation',
				displayName: 'Operation',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'Read File', value: 'read' },
					{ name: 'Write File', value: 'write' },
					{ name: 'Delete File', value: 'delete' },
					{ name: 'Convert', value: 'convert' },
				],
				default: 'read',
			},
			{
				name: 'filePath',
				displayName: 'File Path',
				type: PropertyType.STRING,
				default: '/path/to/file.txt',
			},
			{
				name: 'encoding',
				displayName: 'Encoding',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'UTF-8', value: 'utf8' },
					{ name: 'ASCII', value: 'ascii' },
					{ name: 'Base64', value: 'base64' },
				],
				default: 'utf8',
				displayOptions: {
					show: {
						operation: ['read', 'write'],
					},
				},
			},
		],
		inputs: ['main'],
		outputs: ['main'],
	};
}

/**
 * Data transformation template
 */
function dataTransformationTemplate(): NodeDefinition {
	return {
		name: 'DataTransformer',
		displayName: 'Data Transformer',
		description: 'Transform and manipulate data',
		version: 1,
		defaults: {
			name: 'Data Transformer',
			color: '#3498DB',
		},
		icon: {
			type: 'fontawesome',
			value: 'fa:shuffle',
		},
		category: NodeCategory.DEVELOPMENT,
		properties: [
			{
				name: 'operation',
				displayName: 'Operation',
				type: PropertyType.OPTIONS,
				options: [
					{ name: 'Map', value: 'map' },
					{ name: 'Filter', value: 'filter' },
					{ name: 'Reduce', value: 'reduce' },
					{ name: 'Sort', value: 'sort' },
					{ name: 'Group By', value: 'groupBy' },
				],
				default: 'map',
			},
			{
				name: 'expression',
				displayName: 'Expression',
				type: PropertyType.STRING,
				typeOptions: { rows: 3 },
				default: 'item.field',
				description: 'JavaScript expression to apply',
			},
		],
		inputs: ['main'],
		outputs: ['main'],
	};
}

/**
 * List all available templates
 */
export const availableTemplates = [
	{
		type: 'restApi' as TemplateType,
		name: 'REST API',
		description: 'Make HTTP requests to a REST API',
		category: NodeCategory.DEVELOPMENT,
	},
	{
		type: 'database' as TemplateType,
		name: 'Database',
		description: 'Execute database operations',
		category: NodeCategory.DEVELOPMENT,
	},
	{
		type: 'webhook' as TemplateType,
		name: 'Webhook',
		description: 'Receive data from webhooks',
		category: NodeCategory.DEVELOPMENT,
	},
	{
		type: 'trigger' as TemplateType,
		name: 'Trigger',
		description: 'Trigger workflow on a schedule or event',
		category: NodeCategory.DEVELOPMENT,
	},
	{
		type: 'aiLangchain' as TemplateType,
		name: 'AI Agent',
		description: 'AI agent powered by LangChain',
		category: NodeCategory.CUSTOM,
	},
	{
		type: 'fileProcessing' as TemplateType,
		name: 'File Processor',
		description: 'Process files (read, write, convert)',
		category: NodeCategory.DEVELOPMENT,
	},
	{
		type: 'dataTransformation' as TemplateType,
		name: 'Data Transformer',
		description: 'Transform and manipulate data',
		category: NodeCategory.DEVELOPMENT,
	},
];
