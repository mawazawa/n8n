import type { Document, APIEndpoint } from './types';
import { APIEndpointSchema, DocumentFormat, SectionType } from './types';

/**
 * API Documentation Generator
 *
 * Generates API documentation from OpenAPI specifications
 */

interface OpenAPISpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	servers?: Array<{ url: string; description?: string }>;
	paths: Record<string, Record<string, unknown>>;
	components?: {
		schemas?: Record<string, unknown>;
		securitySchemes?: Record<string, unknown>;
	};
}

export class APIDocGenerator {
	/**
	 * Generate API documentation from OpenAPI specification
	 */
	generateFromOpenAPI(spec: OpenAPISpec): Document {
		const endpoints = this.extractEndpoints(spec);

		const document: Document = {
			id: `api-doc-${spec.info.title.toLowerCase().replace(/\s+/g, '-')}`,
			metadata: {
				title: spec.info.title,
				version: spec.info.version,
				description: spec.info.description,
				author: 'API Documentation Generator',
				createdAt: new Date(),
				updatedAt: new Date(),
				tags: ['api', 'documentation', 'openapi'],
			},
			sections: [
				this.generateOverviewSection(spec),
				this.generateAuthenticationSection(spec),
				this.generateEndpointsSection(endpoints),
				this.generateSchemasSection(spec),
				this.generateErrorCodesSection(),
			],
			format: DocumentFormat.MARKDOWN,
			tableOfContents: true,
			includeIndex: true,
		};

		return document;
	}

	/**
	 * Extract endpoints from OpenAPI spec
	 */
	private extractEndpoints(spec: OpenAPISpec): APIEndpoint[] {
		const endpoints: APIEndpoint[] = [];

		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, details] of Object.entries(methods as Record<string, unknown>)) {
				if (typeof details === 'object' && details !== null) {
					const endpointDetails = details as Record<string, unknown>;

					const endpoint: APIEndpoint = {
						path,
						method: method.toUpperCase() as APIEndpoint['method'],
						summary: (endpointDetails.summary as string) || '',
						description: endpointDetails.description as string | undefined,
						parameters: this.extractParameters(endpointDetails.parameters as unknown[] | undefined),
						requestBody: this.extractRequestBody(
							endpointDetails.requestBody as Record<string, unknown> | undefined,
						),
						responses: this.extractResponses(
							endpointDetails.responses as Record<string, unknown> | undefined,
						),
						authentication: this.extractAuthentication(
							endpointDetails.security as unknown[] | undefined,
						),
						tags: (endpointDetails.tags as string[]) || [],
					};

					endpoints.push(APIEndpointSchema.parse(endpoint));
				}
			}
		}

		return endpoints;
	}

	/**
	 * Extract parameters from endpoint
	 */
	private extractParameters(
		parameters: unknown[] | undefined,
	): APIEndpoint['parameters'] {
		if (!parameters || !Array.isArray(parameters)) return [];

		return parameters.map((param) => {
			const p = param as Record<string, unknown>;
			return {
				name: p.name as string,
				in: p.in as APIEndpoint['parameters'][0]['in'],
				type: (p.schema as Record<string, unknown>)?.type as string,
				required: (p.required as boolean) || false,
				description: p.description as string | undefined,
				example: p.example,
			};
		});
	}

	/**
	 * Extract request body from endpoint
	 */
	private extractRequestBody(
		requestBody: Record<string, unknown> | undefined,
	): APIEndpoint['requestBody'] {
		if (!requestBody) return undefined;

		const content = requestBody.content as Record<string, unknown> | undefined;
		if (!content) return undefined;

		const contentType = Object.keys(content)[0];
		const contentDetails = content[contentType] as Record<string, unknown>;

		return {
			contentType,
			schema: (contentDetails.schema as Record<string, unknown>) || {},
			examples: (contentDetails.examples as unknown[]) || [],
		};
	}

	/**
	 * Extract responses from endpoint
	 */
	private extractResponses(
		responses: Record<string, unknown> | undefined,
	): APIEndpoint['responses'] {
		if (!responses) return [];

		return Object.entries(responses).map(([statusCode, details]) => {
			const d = details as Record<string, unknown>;
			return {
				statusCode: parseInt(statusCode),
				description: (d.description as string) || '',
				schema: (d.content as Record<string, unknown>) || undefined,
				examples: (d.examples as unknown[]) || [],
			};
		});
	}

	/**
	 * Extract authentication requirements
	 */
	private extractAuthentication(security: unknown[] | undefined): string[] {
		if (!security || !Array.isArray(security)) return [];

		return security.flatMap((s) => Object.keys(s as Record<string, unknown>));
	}

	/**
	 * Generate overview section
	 */
	private generateOverviewSection(spec: OpenAPISpec): Document['sections'][0] {
		const servers = spec.servers || [];
		const serverList = servers.map((s) => `- ${s.url} - ${s.description || 'API Server'}`).join('\n');

		return {
			id: 'overview',
			type: SectionType.OVERVIEW,
			title: 'API Overview',
			content: `# ${spec.info.title}

${spec.info.description || 'API Documentation'}

**Version:** ${spec.info.version}

## Base URLs

${serverList || 'No base URLs defined'}

## API Specification

This API follows the OpenAPI ${spec.openapi} specification.`,
			subsections: [],
			examples: [],
			diagrams: [],
			metadata: {},
			order: 1,
		};
	}

	/**
	 * Generate authentication section
	 */
	private generateAuthenticationSection(spec: OpenAPISpec): Document['sections'][0] {
		const securitySchemes = spec.components?.securitySchemes || {};
		let authContent = '## Authentication\n\n';

		if (Object.keys(securitySchemes).length === 0) {
			authContent += 'No authentication required.\n';
		} else {
			authContent += 'This API uses the following authentication methods:\n\n';

			for (const [name, scheme] of Object.entries(securitySchemes)) {
				const s = scheme as Record<string, unknown>;
				authContent += `### ${name}\n\n`;
				authContent += `**Type:** ${s.type}\n\n`;

				if (s.type === 'http') {
					authContent += `**Scheme:** ${s.scheme}\n\n`;
				}

				if (s.type === 'apiKey') {
					authContent += `**Location:** ${s.in}\n`;
					authContent += `**Parameter Name:** ${s.name}\n\n`;
				}

				if (s.description) {
					authContent += `${s.description}\n\n`;
				}
			}
		}

		return {
			id: 'authentication',
			type: SectionType.SECURITY,
			title: 'Authentication',
			content: authContent,
			subsections: [],
			examples: [],
			diagrams: [],
			metadata: {},
			order: 2,
		};
	}

	/**
	 * Generate endpoints section
	 */
	private generateEndpointsSection(endpoints: APIEndpoint[]): Document['sections'][0] {
		const subsections = endpoints.map((endpoint, index) =>
			this.generateEndpointSubsection(endpoint, index),
		);

		return {
			id: 'endpoints',
			type: SectionType.API_REFERENCE,
			title: 'API Endpoints',
			content: '## API Endpoints\n\nComplete reference for all API endpoints.',
			subsections,
			examples: [],
			diagrams: [],
			metadata: {},
			order: 3,
		};
	}

	/**
	 * Generate endpoint subsection
	 */
	private generateEndpointSubsection(endpoint: APIEndpoint, index: number): Document['sections'][0] {
		let content = `### ${endpoint.method} ${endpoint.path}\n\n`;
		content += `${endpoint.summary}\n\n`;

		if (endpoint.description) {
			content += `${endpoint.description}\n\n`;
		}

		// Parameters
		if (endpoint.parameters.length > 0) {
			content += '**Parameters:**\n\n';
			content += '| Name | In | Type | Required | Description |\n';
			content += '|------|-----|------|----------|-------------|\n';

			for (const param of endpoint.parameters) {
				content += `| ${param.name} | ${param.in} | ${param.type} | ${param.required ? 'Yes' : 'No'} | ${param.description || '-'} |\n`;
			}

			content += '\n';
		}

		// Request Body
		if (endpoint.requestBody) {
			content += '**Request Body:**\n\n';
			content += `Content-Type: \`${endpoint.requestBody.contentType}\`\n\n`;
			content += '```json\n';
			content += JSON.stringify(endpoint.requestBody.schema, null, 2);
			content += '\n```\n\n';
		}

		// Responses
		if (endpoint.responses.length > 0) {
			content += '**Responses:**\n\n';

			for (const response of endpoint.responses) {
				content += `**${response.statusCode}** - ${response.description}\n\n`;

				if (response.schema) {
					content += '```json\n';
					content += JSON.stringify(response.schema, null, 2);
					content += '\n```\n\n';
				}
			}
		}

		// Authentication
		if (endpoint.authentication.length > 0) {
			content += '**Authentication:** ' + endpoint.authentication.join(', ') + '\n\n';
		}

		return {
			id: `endpoint-${index}`,
			type: SectionType.API_REFERENCE,
			title: `${endpoint.method} ${endpoint.path}`,
			content,
			subsections: [],
			examples: this.generateEndpointExamples(endpoint),
			diagrams: [],
			metadata: {},
			order: index,
		};
	}

	/**
	 * Generate examples for endpoint
	 */
	private generateEndpointExamples(endpoint: APIEndpoint): Document['sections'][0]['examples'] {
		const examples: Document['sections'][0]['examples'] = [];

		// cURL example
		let curlCommand = `curl -X ${endpoint.method} `;

		// Add URL with query parameters
		const queryParams = endpoint.parameters.filter((p) => p.in === 'query');
		let url = endpoint.path;

		if (queryParams.length > 0) {
			const params = queryParams.map((p) => `${p.name}=${p.example || 'value'}`).join('&');
			url += `?${params}`;
		}

		curlCommand += `"${url}" `;

		// Add headers
		const headerParams = endpoint.parameters.filter((p) => p.in === 'header');
		for (const header of headerParams) {
			curlCommand += `-H "${header.name}: ${header.example || 'value'}" `;
		}

		// Add request body
		if (endpoint.requestBody) {
			curlCommand += `-H "Content-Type: ${endpoint.requestBody.contentType}" `;
			curlCommand += `-d '${JSON.stringify(endpoint.requestBody.schema)}' `;
		}

		examples.push({
			title: 'cURL Example',
			description: 'Example request using cURL',
			code: curlCommand.trim(),
			language: 'bash',
		});

		// JavaScript example
		const jsCode = this.generateJavaScriptExample(endpoint);
		examples.push({
			title: 'JavaScript Example',
			description: 'Example request using fetch API',
			code: jsCode,
			language: 'javascript',
		});

		return examples;
	}

	/**
	 * Generate JavaScript example
	 */
	private generateJavaScriptExample(endpoint: APIEndpoint): string {
		let code = 'const response = await fetch(';

		// URL
		const queryParams = endpoint.parameters.filter((p) => p.in === 'query');
		let url = endpoint.path;

		if (queryParams.length > 0) {
			const params = queryParams.map((p) => `${p.name}=\${${p.name}}`).join('&');
			url += `?${params}`;
		}

		code += `\`${url}\`, {\n`;
		code += `  method: '${endpoint.method}',\n`;

		// Headers
		const headers: string[] = [];
		if (endpoint.requestBody) {
			headers.push(`'Content-Type': '${endpoint.requestBody.contentType}'`);
		}

		const headerParams = endpoint.parameters.filter((p) => p.in === 'header');
		for (const header of headerParams) {
			headers.push(`'${header.name}': '${header.example || 'value'}'`);
		}

		if (headers.length > 0) {
			code += '  headers: {\n    ' + headers.join(',\n    ') + '\n  },\n';
		}

		// Body
		if (endpoint.requestBody) {
			code += '  body: JSON.stringify({\n';
			code += '    // Add your data here\n';
			code += '  })\n';
		}

		code += '});\n\n';
		code += 'const data = await response.json();\n';
		code += 'console.log(data);';

		return code;
	}

	/**
	 * Generate schemas section
	 */
	private generateSchemasSection(spec: OpenAPISpec): Document['sections'][0] {
		const schemas = spec.components?.schemas || {};

		let content = '## Data Schemas\n\n';
		content += 'Object schemas used in API requests and responses.\n\n';

		for (const [name, schema] of Object.entries(schemas)) {
			content += `### ${name}\n\n`;
			content += '```json\n';
			content += JSON.stringify(schema, null, 2);
			content += '\n```\n\n';
		}

		return {
			id: 'schemas',
			type: SectionType.API_REFERENCE,
			title: 'Data Schemas',
			content,
			subsections: [],
			examples: [],
			diagrams: [],
			metadata: {},
			order: 4,
		};
	}

	/**
	 * Generate error codes section
	 */
	private generateErrorCodesSection(): Document['sections'][0] {
		const content = `## Error Codes

Standard HTTP status codes are used:

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error occurred |

### Error Response Format

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
\`\`\``;

		return {
			id: 'errors',
			type: SectionType.TROUBLESHOOTING,
			title: 'Error Codes',
			content,
			subsections: [],
			examples: [],
			diagrams: [],
			metadata: {},
			order: 5,
		};
	}

	/**
	 * Generate Postman collection from API endpoints
	 */
	generatePostmanCollection(endpoints: APIEndpoint[], info: { name: string; description?: string }): Record<string, unknown> {
		return {
			info: {
				name: info.name,
				description: info.description,
				schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
			},
			item: endpoints.map((endpoint) => ({
				name: `${endpoint.method} ${endpoint.path}`,
				request: {
					method: endpoint.method,
					header: endpoint.parameters
						.filter((p) => p.in === 'header')
						.map((p) => ({
							key: p.name,
							value: p.example || '',
							description: p.description,
						})),
					url: {
						raw: endpoint.path,
						path: endpoint.path.split('/').filter(Boolean),
						query: endpoint.parameters
							.filter((p) => p.in === 'query')
							.map((p) => ({
								key: p.name,
								value: p.example || '',
								description: p.description,
							})),
					},
					body: endpoint.requestBody
						? {
								mode: 'raw',
								raw: JSON.stringify(endpoint.requestBody.schema, null, 2),
							}
						: undefined,
				},
			})),
		};
	}
}
