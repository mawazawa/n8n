import axios from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OAuth2Config, OAuth2ConfigSchema, OAuth2Tokens, AuthResult } from '../types';

/**
 * OAuth2 Handler
 * Manages OAuth2 authentication flow including authorization, token refresh, and storage
 */
export class OAuth2Handler {
	private config: OAuth2Config;
	private supabase: SupabaseClient;
	private tokens: Map<string, OAuth2Tokens>;
	private refreshTimeouts: Map<string, NodeJS.Timeout>;

	constructor(config: OAuth2Config, supabaseUrl: string, supabaseKey: string) {
		this.config = OAuth2ConfigSchema.parse(config);
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.tokens = new Map();
		this.refreshTimeouts = new Map();
	}

	/**
	 * Authorize and get access token
	 */
	async authorize(authorizationCode?: string): Promise<AuthResult> {
		try {
			let tokens: OAuth2Tokens;

			switch (this.config.grantType) {
				case 'authorization_code':
					if (!authorizationCode) {
						return {
							success: false,
							errorMessage: 'Authorization code required for authorization_code flow',
						};
					}
					tokens = await this.exchangeAuthorizationCode(authorizationCode);
					break;

				case 'client_credentials':
					tokens = await this.getClientCredentialsToken();
					break;

				case 'refresh_token':
					return {
						success: false,
						errorMessage: 'Use refresh() method for refresh_token grant type',
					};

				default:
					return {
						success: false,
						errorMessage: `Unsupported grant type: ${this.config.grantType}`,
					};
			}

			return {
				success: true,
				tokens,
			};
		} catch (error) {
			return {
				success: false,
				errorMessage: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Exchange authorization code for tokens
	 */
	private async exchangeAuthorizationCode(code: string): Promise<OAuth2Tokens> {
		const params = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			...(this.config.redirectUri && { redirect_uri: this.config.redirectUri }),
		});

		const response = await axios.post(this.config.tokenUrl, params.toString(), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		return this.parseTokenResponse(response.data);
	}

	/**
	 * Get token using client credentials
	 */
	private async getClientCredentialsToken(): Promise<OAuth2Tokens> {
		const params = new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			...(this.config.scope && { scope: this.config.scope.join(' ') }),
		});

		const response = await axios.post(this.config.tokenUrl, params.toString(), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		return this.parseTokenResponse(response.data);
	}

	/**
	 * Refresh access token
	 */
	async refresh(refreshToken: string): Promise<OAuth2Tokens> {
		const params = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
		});

		const response = await axios.post(this.config.tokenUrl, params.toString(), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		return this.parseTokenResponse(response.data);
	}

	/**
	 * Parse token response
	 */
	private parseTokenResponse(data: Record<string, unknown>): OAuth2Tokens {
		const tokens: OAuth2Tokens = {
			accessToken: data.access_token as string,
			refreshToken: data.refresh_token as string | undefined,
			tokenType: (data.token_type as string) || 'Bearer',
			scope: data.scope ? (data.scope as string).split(' ') : undefined,
		};

		if (data.expires_in) {
			const expiresIn = data.expires_in as number;
			tokens.expiresAt = new Date(Date.now() + expiresIn * 1000);
		}

		return tokens;
	}

	/**
	 * Store tokens for an integration
	 */
	async storeTokens(integrationId: string, tokens: OAuth2Tokens): Promise<void> {
		// Encrypt tokens before storage
		const encryptedTokens = {
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			expires_at: tokens.expiresAt?.toISOString(),
			token_type: tokens.tokenType,
			scope: tokens.scope,
		};

		const { error } = await this.supabase
			.from('integration_credentials')
			.upsert({
				integration_id: integrationId,
				credentials: encryptedTokens,
				updated_at: new Date().toISOString(),
			});

		if (error) {
			throw new Error(`Failed to store tokens: ${error.message}`);
		}

		// Cache tokens in memory
		this.tokens.set(integrationId, tokens);

		// Setup auto-refresh if we have a refresh token and expiry
		if (tokens.refreshToken && tokens.expiresAt) {
			this.setupAutoRefresh(integrationId, tokens);
		}
	}

	/**
	 * Retrieve tokens for an integration
	 */
	async retrieveTokens(integrationId: string): Promise<OAuth2Tokens | null> {
		// Check memory cache first
		const cached = this.tokens.get(integrationId);
		if (cached) {
			return cached;
		}

		// Fetch from database
		const { data, error } = await this.supabase
			.from('integration_credentials')
			.select('credentials')
			.eq('integration_id', integrationId)
			.single();

		if (error || !data) {
			return null;
		}

		const creds = data.credentials as Record<string, unknown>;
		const tokens: OAuth2Tokens = {
			accessToken: creds.access_token as string,
			refreshToken: creds.refresh_token as string | undefined,
			expiresAt: creds.expires_at ? new Date(creds.expires_at as string) : undefined,
			tokenType: (creds.token_type as string) || 'Bearer',
			scope: creds.scope as string[] | undefined,
		};

		// Cache in memory
		this.tokens.set(integrationId, tokens);

		return tokens;
	}

	/**
	 * Setup automatic token refresh
	 */
	private setupAutoRefresh(integrationId: string, tokens: OAuth2Tokens): void {
		if (!tokens.refreshToken || !tokens.expiresAt) {
			return;
		}

		// Clear existing timeout
		const existing = this.refreshTimeouts.get(integrationId);
		if (existing) {
			clearTimeout(existing);
		}

		// Calculate when to refresh (5 minutes before expiry)
		const refreshAt = tokens.expiresAt.getTime() - 5 * 60 * 1000;
		const timeout = refreshAt - Date.now();

		if (timeout > 0) {
			const timeoutId = setTimeout(async () => {
				try {
					const newTokens = await this.refresh(tokens.refreshToken!);
					await this.storeTokens(integrationId, newTokens);
				} catch (error) {
					console.error('Failed to auto-refresh token:', error);
				}
			}, timeout);

			this.refreshTimeouts.set(integrationId, timeoutId);
		}
	}

	/**
	 * Get authorization URL for OAuth2 flow
	 */
	getAuthorizationUrl(state?: string): string {
		const params = new URLSearchParams({
			client_id: this.config.clientId,
			response_type: 'code',
			...(this.config.redirectUri && { redirect_uri: this.config.redirectUri }),
			...(this.config.scope && { scope: this.config.scope.join(' ') }),
			...(state && { state }),
		});

		return `${this.config.authUrl}?${params.toString()}`;
	}

	/**
	 * Check if token is expired
	 */
	isTokenExpired(tokens: OAuth2Tokens): boolean {
		if (!tokens.expiresAt) {
			return false;
		}
		return tokens.expiresAt.getTime() < Date.now();
	}

	/**
	 * Get valid access token (refresh if needed)
	 */
	async getValidAccessToken(integrationId: string): Promise<string> {
		let tokens = await this.retrieveTokens(integrationId);

		if (!tokens) {
			throw new Error('No tokens found for integration');
		}

		// Refresh if expired
		if (this.isTokenExpired(tokens)) {
			if (!tokens.refreshToken) {
				throw new Error('Token expired and no refresh token available');
			}

			tokens = await this.refresh(tokens.refreshToken);
			await this.storeTokens(integrationId, tokens);
		}

		return tokens.accessToken;
	}

	/**
	 * Revoke tokens
	 */
	async revokeTokens(integrationId: string): Promise<void> {
		// Remove from cache
		this.tokens.delete(integrationId);

		// Clear refresh timeout
		const timeout = this.refreshTimeouts.get(integrationId);
		if (timeout) {
			clearTimeout(timeout);
			this.refreshTimeouts.delete(integrationId);
		}

		// Remove from database
		const { error } = await this.supabase
			.from('integration_credentials')
			.delete()
			.eq('integration_id', integrationId);

		if (error) {
			throw new Error(`Failed to revoke tokens: ${error.message}`);
		}
	}

	/**
	 * Update OAuth2 configuration
	 */
	updateConfig(config: Partial<OAuth2Config>): void {
		this.config = OAuth2ConfigSchema.parse({
			...this.config,
			...config,
		});
	}
}
