/**
 * Custom Node Builder - Credential Builder
 * Generate credential types for authentication
 */

import type { CredentialDefinition, CredentialPropertyDefinition, CredentialTest } from './types';
import { PropertyType } from './types';

/**
 * Credential builder
 */
export class CredentialBuilder {
	private credential: Partial<CredentialDefinition>;

	constructor(name: string) {
		this.credential = {
			name,
			properties: [],
		};
	}

	/**
	 * Set display name
	 */
	displayName(name: string): this {
		this.credential.displayName = name;
		return this;
	}

	/**
	 * Set documentation URL
	 */
	documentationUrl(url: string): this {
		this.credential.documentationUrl = url;
		return this;
	}

	/**
	 * Add a property
	 */
	addProperty(property: CredentialPropertyDefinition): this {
		if (!this.credential.properties) {
			this.credential.properties = [];
		}
		this.credential.properties.push(property);
		return this;
	}

	/**
	 * Add multiple properties
	 */
	addProperties(properties: CredentialPropertyDefinition[]): this {
		if (!this.credential.properties) {
			this.credential.properties = [];
		}
		this.credential.properties.push(...properties);
		return this;
	}

	/**
	 * Configure test request
	 */
	withTestRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string): this {
		this.credential.test = {
			method,
			url,
		};
		return this;
	}

	/**
	 * Set authentication type
	 */
	authenticate(type: 'generic' | 'bearer' | 'oauth2', properties?: Record<string, string>): this {
		this.credential.authenticate = {
			type,
			properties,
		};
		return this;
	}

	/**
	 * Build the credential
	 */
	build(): CredentialDefinition {
		if (!this.credential.displayName) {
			this.credential.displayName = this.formatDisplayName(this.credential.name!);
		}

		return this.credential as CredentialDefinition;
	}

	/**
	 * Format display name
	 */
	private formatDisplayName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/Api$/, ' API')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}
}

/**
 * Create credential property
 */
function createProperty(
	name: string,
	displayName: string,
	type: PropertyType,
	options?: Partial<CredentialPropertyDefinition>,
): CredentialPropertyDefinition {
	return {
		name,
		displayName,
		type,
		...options,
	};
}

/**
 * Preset credential types
 */
export const credentialPresets = {
	/**
	 * API Key authentication
	 */
	apiKey(name: string = 'ApiKey'): CredentialBuilder {
		return new CredentialBuilder(name)
			.displayName('API Key')
			.addProperties([
				createProperty('apiKey', 'API Key', PropertyType.STRING, {
					required: true,
					typeOptions: { password: true },
					description: 'The API key for authentication',
				}),
			])
			.authenticate('generic', {
				'X-API-Key': '={{$credentials.apiKey}}',
			});
	},

	/**
	 * Basic authentication
	 */
	basicAuth(name: string = 'BasicAuth'): CredentialBuilder {
		return new CredentialBuilder(name)
			.displayName('Basic Auth')
			.addProperties([
				createProperty('username', 'Username', PropertyType.STRING, {
					required: true,
					description: 'Username for authentication',
				}),
				createProperty('password', 'Password', PropertyType.STRING, {
					required: true,
					typeOptions: { password: true },
					description: 'Password for authentication',
				}),
			])
			.authenticate('generic', {
				Authorization: '=Basic ' + Buffer.from('{{$credentials.username}}:{{$credentials.password}}').toString('base64'),
			});
	},

	/**
	 * Bearer token authentication
	 */
	bearerToken(name: string = 'BearerToken'): CredentialBuilder {
		return new CredentialBuilder(name)
			.displayName('Bearer Token')
			.addProperties([
				createProperty('token', 'Access Token', PropertyType.STRING, {
					required: true,
					typeOptions: { password: true },
					description: 'The bearer token for authentication',
				}),
			])
			.authenticate('bearer');
	},

	/**
	 * OAuth2 authentication
	 */
	oauth2(name: string = 'OAuth2'): CredentialBuilder {
		return new CredentialBuilder(name)
			.displayName('OAuth2')
			.addProperties([
				createProperty('authUrl', 'Authorization URL', PropertyType.STRING, {
					required: true,
					description: 'The OAuth2 authorization endpoint',
				}),
				createProperty('accessTokenUrl', 'Access Token URL', PropertyType.STRING, {
					required: true,
					description: 'The OAuth2 token endpoint',
				}),
				createProperty('clientId', 'Client ID', PropertyType.STRING, {
					required: true,
					description: 'OAuth2 Client ID',
				}),
				createProperty('clientSecret', 'Client Secret', PropertyType.STRING, {
					required: true,
					typeOptions: { password: true },
					description: 'OAuth2 Client Secret',
				}),
				createProperty('scope', 'Scope', PropertyType.STRING, {
					description: 'OAuth2 scopes (space-separated)',
				}),
			])
			.authenticate('oauth2');
	},

	/**
	 * Header-based authentication
	 */
	headerAuth(name: string, headerName: string, headerDisplayName?: string): CredentialBuilder {
		return new CredentialBuilder(name)
			.displayName(headerDisplayName || `${headerName} Auth`)
			.addProperties([
				createProperty('value', headerDisplayName || headerName, PropertyType.STRING, {
					required: true,
					typeOptions: { password: true },
					description: `The ${headerName} header value`,
				}),
			])
			.authenticate('generic', {
				[headerName]: '={{$credentials.value}}',
			});
	},

	/**
	 * Custom authentication
	 */
	custom(name: string): CredentialBuilder {
		return new CredentialBuilder(name);
	},
};

/**
 * Export credential builder
 */
export function credential(name: string): CredentialBuilder {
	return new CredentialBuilder(name);
}
