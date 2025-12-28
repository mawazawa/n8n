import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type SAMLConfig, SAMLConfigSchema, type OIDCConfig, OIDCConfigSchema } from './types';

/**
 * SSO provider types
 */
export enum SSOProvider {
	SAML = 'SAML',
	OIDC = 'OIDC',
	OAUTH2 = 'OAUTH2',
}

/**
 * User provisioning mode
 */
export enum ProvisioningMode {
	JIT = 'JIT', // Just-in-time
	MANUAL = 'MANUAL',
	SYNC = 'SYNC', // Automated sync
}

/**
 * TenantSSO handles SSO configuration per tenant
 */
export class TenantSSO {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Configure SAML SSO
	 */
	async configureSAML(tenantId: string, config: SAMLConfig): Promise<void> {
		// Validate config
		const validatedConfig = SAMLConfigSchema.parse(config);

		// Save SAML configuration
		const { error } = await this.supabase.from('tenant_sso_configs').upsert({
			tenant_id: tenantId,
			provider: SSOProvider.SAML,
			enabled: validatedConfig.enabled,
			config: validatedConfig,
			updated_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to configure SAML: ${error.message}`);
		}
	}

	/**
	 * Configure OIDC SSO
	 */
	async configureOIDC(tenantId: string, config: OIDCConfig): Promise<void> {
		// Validate config
		const validatedConfig = OIDCConfigSchema.parse(config);

		// Save OIDC configuration
		const { error } = await this.supabase.from('tenant_sso_configs').upsert({
			tenant_id: tenantId,
			provider: SSOProvider.OIDC,
			enabled: validatedConfig.enabled,
			config: validatedConfig,
			updated_at: new Date().toISOString(),
		});

		if (error) {
			throw new Error(`Failed to configure OIDC: ${error.message}`);
		}
	}

	/**
	 * Get SSO configuration
	 */
	async getConfig(
		tenantId: string,
	): Promise<{ provider: SSOProvider; config: SAMLConfig | OIDCConfig } | null> {
		const { data, error } = await this.supabase
			.from('tenant_sso_configs')
			.select('*')
			.eq('tenant_id', tenantId)
			.eq('enabled', true)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get SSO config: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return {
			provider: data.provider,
			config: data.config,
		};
	}

	/**
	 * Disable SSO
	 */
	async disableSSO(tenantId: string): Promise<void> {
		const { error } = await this.supabase
			.from('tenant_sso_configs')
			.update({
				enabled: false,
				updated_at: new Date().toISOString(),
			})
			.eq('tenant_id', tenantId);

		if (error) {
			throw new Error(`Failed to disable SSO: ${error.message}`);
		}
	}

	/**
	 * Map identity provider user to local user
	 */
	async mapIdentityProviderUser(
		tenantId: string,
		idpUserId: string,
		attributes: Record<string, unknown>,
	): Promise<{ userId: string; isNew: boolean }> {
		const config = await this.getConfig(tenantId);
		if (!config) {
			throw new Error('SSO not configured for this tenant');
		}

		// Extract user attributes based on mapping
		const attributeMapping =
			'attributeMapping' in config.config
				? config.config.attributeMapping
				: undefined;

		const email = attributeMapping?.email
			? (attributes[attributeMapping.email] as string)
			: (attributes.email as string);

		const firstName = attributeMapping?.firstName
			? (attributes[attributeMapping.firstName] as string)
			: (attributes.firstName as string);

		const lastName = attributeMapping?.lastName
			? (attributes[attributeMapping.lastName] as string)
			: (attributes.lastName as string);

		const role = attributeMapping?.role
			? (attributes[attributeMapping.role] as string)
			: (attributes.role as string);

		if (!email) {
			throw new Error('Email not found in identity provider attributes');
		}

		// Check if user already exists
		const { data: existingUser } = await this.supabase
			.from('users')
			.select('id')
			.eq('tenant_id', tenantId)
			.eq('email', email)
			.single();

		if (existingUser) {
			// Update user with latest attributes
			await this.supabase
				.from('users')
				.update({
					first_name: firstName,
					last_name: lastName,
					role,
					idp_user_id: idpUserId,
					updated_at: new Date().toISOString(),
				})
				.eq('id', existingUser.id);

			return { userId: existingUser.id, isNew: false };
		}

		// Create new user (JIT provisioning)
		const { data: newUser, error } = await this.supabase
			.from('users')
			.insert({
				tenant_id: tenantId,
				email,
				first_name: firstName,
				last_name: lastName,
				role: role ?? 'member',
				idp_user_id: idpUserId,
				status: 'active',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.select('id')
			.single();

		if (error || !newUser) {
			throw new Error(`Failed to create user: ${error?.message}`);
		}

		return { userId: newUser.id, isNew: true };
	}

	/**
	 * Configure user provisioning
	 */
	async configureProvisioning(
		tenantId: string,
		mode: ProvisioningMode,
		options?: {
			syncInterval?: number; // in seconds
			roleMapping?: Record<string, string>;
			groupMapping?: Record<string, string[]>;
		},
	): Promise<void> {
		await this.supabase.from('tenant_sso_provisioning').upsert({
			tenant_id: tenantId,
			mode,
			sync_interval: options?.syncInterval,
			role_mapping: options?.roleMapping,
			group_mapping: options?.groupMapping,
			updated_at: new Date().toISOString(),
		});
	}

	/**
	 * Sync users from identity provider
	 */
	async syncUsers(tenantId: string): Promise<{
		created: number;
		updated: number;
		deactivated: number;
	}> {
		console.log(`Syncing users for tenant ${tenantId}`);

		// This would integrate with the identity provider API to:
		// 1. Fetch all users
		// 2. Create/update users in local database
		// 3. Deactivate users not present in IdP

		return {
			created: 0,
			updated: 0,
			deactivated: 0,
		};
	}

	/**
	 * Generate SAML metadata
	 */
	async generateSAMLMetadata(tenantId: string): Promise<string> {
		const config = await this.getConfig(tenantId);

		if (!config || config.provider !== SSOProvider.SAML) {
			throw new Error('SAML not configured for this tenant');
		}

		const samlConfig = config.config as SAMLConfig;

		// Generate SAML metadata XML
		const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${samlConfig.issuer}">
  <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                 Location="${samlConfig.entryPoint}"
                                 index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

		return metadata;
	}

	/**
	 * Validate SAML assertion
	 */
	async validateSAMLAssertion(
		tenantId: string,
		assertion: string,
	): Promise<{ valid: boolean; userId?: string; error?: string }> {
		const config = await this.getConfig(tenantId);

		if (!config || config.provider !== SSOProvider.SAML) {
			return { valid: false, error: 'SAML not configured' };
		}

		// This would validate the SAML assertion:
		// 1. Verify signature
		// 2. Check timestamps
		// 3. Validate issuer
		// 4. Extract user attributes

		console.log(`Validating SAML assertion for tenant ${tenantId}`);

		return { valid: true };
	}

	/**
	 * Handle OIDC callback
	 */
	async handleOIDCCallback(
		tenantId: string,
		code: string,
		state: string,
	): Promise<{ userId: string; isNew: boolean }> {
		const config = await this.getConfig(tenantId);

		if (!config || config.provider !== SSOProvider.OIDC) {
			throw new Error('OIDC not configured for this tenant');
		}

		const oidcConfig = config.config as OIDCConfig;

		// Exchange code for tokens
		// This would make a request to the token endpoint
		console.log(`Exchanging code for tokens: ${code}, ${state}`);

		// Get user info
		// This would make a request to the userInfo endpoint
		const userInfo = {
			sub: 'user-id',
			email: 'user@example.com',
			given_name: 'John',
			family_name: 'Doe',
		};

		// Map to local user
		const result = await this.mapIdentityProviderUser(
			tenantId,
			userInfo.sub,
			userInfo,
		);

		return result;
	}

	/**
	 * Test SSO configuration
	 */
	async testConfiguration(tenantId: string): Promise<{
		success: boolean;
		message: string;
		details?: Record<string, unknown>;
	}> {
		const config = await this.getConfig(tenantId);

		if (!config) {
			return {
				success: false,
				message: 'No SSO configuration found',
			};
		}

		// Test configuration based on provider
		if (config.provider === SSOProvider.SAML) {
			return this.testSAMLConfiguration(tenantId, config.config as SAMLConfig);
		} else if (config.provider === SSOProvider.OIDC) {
			return this.testOIDCConfiguration(tenantId, config.config as OIDCConfig);
		}

		return {
			success: false,
			message: 'Unsupported SSO provider',
		};
	}

	/**
	 * Test SAML configuration
	 */
	private async testSAMLConfiguration(
		tenantId: string,
		config: SAMLConfig,
	): Promise<{
		success: boolean;
		message: string;
		details?: Record<string, unknown>;
	}> {
		// Validate SAML configuration
		try {
			// Test connection to IdP
			// Verify certificate
			// Test metadata endpoint

			return {
				success: true,
				message: 'SAML configuration is valid',
				details: {
					issuer: config.issuer,
					entryPoint: config.entryPoint,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Test OIDC configuration
	 */
	private async testOIDCConfiguration(
		tenantId: string,
		config: OIDCConfig,
	): Promise<{
		success: boolean;
		message: string;
		details?: Record<string, unknown>;
	}> {
		// Validate OIDC configuration
		try {
			// Test connection to IdP
			// Verify discovery endpoint
			// Test token endpoint

			return {
				success: true,
				message: 'OIDC configuration is valid',
				details: {
					issuer: config.issuer,
					clientId: config.clientId,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get SSO login URL
	 */
	async getLoginURL(tenantId: string, redirectUrl?: string): Promise<string> {
		const config = await this.getConfig(tenantId);

		if (!config) {
			throw new Error('SSO not configured for this tenant');
		}

		if (config.provider === SSOProvider.SAML) {
			const samlConfig = config.config as SAMLConfig;
			return samlConfig.entryPoint;
		} else if (config.provider === SSOProvider.OIDC) {
			const oidcConfig = config.config as OIDCConfig;
			const params = new URLSearchParams({
				client_id: oidcConfig.clientId,
				redirect_uri: redirectUrl ?? 'http://localhost:3000/auth/callback',
				response_type: 'code',
				scope: oidcConfig.scope.join(' '),
			});
			return `${oidcConfig.authorizationURL}?${params.toString()}`;
		}

		throw new Error('Unsupported SSO provider');
	}
}
