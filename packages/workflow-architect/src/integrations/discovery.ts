import axios from 'axios';
import {
	IntegrationSpec,
	IntegrationSpecSchema,
	IntegrationConfig,
	ConnectorType,
	AuthType,
	HttpConnectorConfig,
	GraphQLConnectorConfig,
} from './types';

/**
 * OpenAPI/Swagger specification
 */
interface OpenAPISpec {
	openapi?: string;
	swagger?: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	servers?: Array<{
		url: string;
		description?: string;
	}>;
	paths: Record<string, Record<string, {
		summary?: string;
		description?: string;
		parameters?: Array<{
			name: string;
			in: string;
			required?: boolean;
			schema?: {
				type: string;
			};
			description?: string;
		}>;
		requestBody?: {
			content: Record<string, unknown>;
		};
	}>>;
	components?: {
		securitySchemes?: Record<string, {
			type: string;
			scheme?: string;
			bearerFormat?: string;
			in?: string;
			name?: string;
		}>;
	};
}

/**
 * Integration Discovery
 * Auto-discovers integrations from OpenAPI/Swagger specs and other standards
 */
export class IntegrationDiscovery {
	/**
	 * Discover integration from URL
	 */
	async discover(url: string): Promise<IntegrationSpec> {
		try {
			// Try to fetch OpenAPI/Swagger spec
			const spec = await this.fetchOpenAPISpec(url);
			if (spec) {
				return this.parseOpenAPISpec(spec, url);
			}

			// Try GraphQL introspection
			const graphqlSpec = await this.discoverGraphQL(url);
			if (graphqlSpec) {
				return graphqlSpec;
			}

			// Fallback to basic HTTP discovery
			return this.discoverBasicHttp(url);
		} catch (error) {
			throw new Error(`Failed to discover integration: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Fetch OpenAPI/Swagger specification
	 */
	private async fetchOpenAPISpec(url: string): Promise<OpenAPISpec | null> {
		const possiblePaths = [
			'/openapi.json',
			'/swagger.json',
			'/api-docs',
			'/api/openapi.json',
			'/api/swagger.json',
			'/v1/openapi.json',
			'/docs/openapi.json',
		];

		for (const path of possiblePaths) {
			try {
				const specUrl = new URL(path, url).toString();
				const response = await axios.get<OpenAPISpec>(specUrl);
				if (response.data && (response.data.openapi || response.data.swagger)) {
					return response.data;
				}
			} catch {
				// Continue to next path
			}
		}

		return null;
	}

	/**
	 * Parse OpenAPI/Swagger specification
	 */
	private parseOpenAPISpec(spec: OpenAPISpec, baseUrl: string): IntegrationSpec {
		// Extract base URL from servers or use provided URL
		const serverUrl = spec.servers?.[0]?.url || baseUrl;

		// Detect authentication type
		const authType = this.detectAuthType(spec);

		// Extract operations
		const operations = [];
		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, operation] of Object.entries(methods)) {
				operations.push({
					name: operation.summary || `${method.toUpperCase()} ${path}`,
					method: method.toUpperCase(),
					path,
					description: operation.description,
					parameters: operation.parameters?.map((param) => ({
						name: param.name,
						type: param.schema?.type || 'string',
						required: param.required || false,
						description: param.description,
					})) || [],
				});
			}
		}

		// Build integration config
		const config: IntegrationConfig = {
			connectorType: ConnectorType.HTTP,
			connectorConfig: {
				baseUrl: serverUrl,
				timeout: 30000,
				retryAttempts: 3,
				retryDelay: 1000,
			} as HttpConnectorConfig,
			auth: authType
				? {
						type: authType,
						config: this.getAuthConfig(authType, spec),
					}
				: undefined,
		};

		const integrationSpec: IntegrationSpec = {
			metadata: {
				name: spec.info.title,
				version: spec.info.version,
				description: spec.info.description,
				tags: [],
			},
			config,
			operations,
		};

		return IntegrationSpecSchema.parse(integrationSpec);
	}

	/**
	 * Detect authentication type from OpenAPI spec
	 */
	private detectAuthType(spec: OpenAPISpec): AuthType | null {
		if (!spec.components?.securitySchemes) {
			return null;
		}

		const schemes = Object.values(spec.components.securitySchemes);
		if (schemes.length === 0) {
			return null;
		}

		const scheme = schemes[0];

		switch (scheme.type) {
			case 'http':
				if (scheme.scheme === 'bearer') {
					return AuthType.BEARER;
				}
				if (scheme.scheme === 'basic') {
					return AuthType.BASIC;
				}
				return AuthType.CUSTOM;

			case 'apiKey':
				return AuthType.API_KEY;

			case 'oauth2':
				return AuthType.OAUTH2;

			default:
				return AuthType.CUSTOM;
		}
	}

	/**
	 * Get auth configuration based on type
	 */
	private getAuthConfig(authType: AuthType, spec: OpenAPISpec): Record<string, unknown> {
		const scheme = Object.values(spec.components?.securitySchemes || {})[0];

		switch (authType) {
			case AuthType.API_KEY:
				return {
					header: scheme.name || 'X-API-Key',
					location: scheme.in || 'header',
				};

			case AuthType.BEARER:
				return {
					token: '', // To be filled by user
				};

			case AuthType.BASIC:
				return {
					username: '',
					password: '',
				};

			case AuthType.OAUTH2:
				return {
					authUrl: '',
					tokenUrl: '',
					clientId: '',
					clientSecret: '',
					grantType: 'authorization_code',
				};

			default:
				return {};
		}
	}

	/**
	 * Discover GraphQL endpoint
	 */
	private async discoverGraphQL(url: string): Promise<IntegrationSpec | null> {
		try {
			// Try common GraphQL paths
			const possiblePaths = ['/graphql', '/api/graphql', '/v1/graphql'];

			for (const path of possiblePaths) {
				try {
					const graphqlUrl = new URL(path, url).toString();

					// Try introspection query
					const response = await axios.post(graphqlUrl, {
						query: '{ __typename }',
					});

					if (response.data && !response.data.errors) {
						// It's a GraphQL endpoint
						const config: IntegrationConfig = {
							connectorType: ConnectorType.GRAPHQL,
							connectorConfig: {
								endpoint: graphqlUrl,
								timeout: 30000,
								introspection: true,
							} as GraphQLConnectorConfig,
						};

						return IntegrationSpecSchema.parse({
							metadata: {
								name: 'GraphQL API',
								version: '1.0.0',
								description: 'Auto-discovered GraphQL endpoint',
								tags: ['graphql'],
							},
							config,
						});
					}
				} catch {
					// Continue to next path
				}
			}
		} catch {
			// Not a GraphQL endpoint
		}

		return null;
	}

	/**
	 * Discover basic HTTP endpoint
	 */
	private async discoverBasicHttp(url: string): Promise<IntegrationSpec> {
		// Perform a simple GET request to check if endpoint is reachable
		try {
			await axios.get(url);
		} catch (error) {
			throw new Error(`Endpoint not reachable: ${url}`);
		}

		const config: IntegrationConfig = {
			connectorType: ConnectorType.HTTP,
			connectorConfig: {
				baseUrl: url,
				timeout: 30000,
				retryAttempts: 3,
				retryDelay: 1000,
			} as HttpConnectorConfig,
		};

		return IntegrationSpecSchema.parse({
			metadata: {
				name: 'HTTP API',
				version: '1.0.0',
				description: 'Auto-discovered HTTP endpoint',
				tags: ['http'],
			},
			config,
		});
	}

	/**
	 * Discover from Postman collection
	 */
	async discoverFromPostman(collectionUrl: string): Promise<IntegrationSpec> {
		try {
			const response = await axios.get(collectionUrl);
			const collection = response.data;

			if (!collection.info || !collection.item) {
				throw new Error('Invalid Postman collection');
			}

			// Extract base URL from first request
			const firstRequest = collection.item[0]?.request;
			const baseUrl = firstRequest?.url?.raw?.split(/[?#]/)[0] || '';

			// Extract operations
			const operations = collection.item.map((item: {
				name: string;
				request: {
					method: string;
					url: { path: string[] };
					description?: string;
				};
			}) => ({
				name: item.name,
				method: item.request.method,
				path: '/' + item.request.url.path.join('/'),
				description: item.request.description,
				parameters: [],
			}));

			const config: IntegrationConfig = {
				connectorType: ConnectorType.HTTP,
				connectorConfig: {
					baseUrl,
					timeout: 30000,
					retryAttempts: 3,
					retryDelay: 1000,
				} as HttpConnectorConfig,
			};

			return IntegrationSpecSchema.parse({
				metadata: {
					name: collection.info.name,
					version: collection.info.version || '1.0.0',
					description: collection.info.description,
					tags: ['postman'],
				},
				config,
				operations,
			});
		} catch (error) {
			throw new Error(`Failed to parse Postman collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Validate discovered integration
	 */
	async validate(spec: IntegrationSpec): Promise<boolean> {
		try {
			// Validate the spec against schema
			IntegrationSpecSchema.parse(spec);

			// Try to make a test request
			if (spec.config.connectorType === ConnectorType.HTTP) {
				const config = spec.config.connectorConfig as HttpConnectorConfig;
				await axios.head(config.baseUrl, { timeout: 5000 });
			}

			return true;
		} catch {
			return false;
		}
	}
}
