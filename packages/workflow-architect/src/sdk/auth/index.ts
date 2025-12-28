/**
 * Authentication helpers for the SDK
 * Supports API key, OAuth2, and JWT authentication
 */

import { z } from 'zod';

export const APIKeyAuthSchema = z.object({
	type: z.literal('apiKey'),
	key: z.string(),
});

export const OAuth2AuthSchema = z.object({
	type: z.literal('oauth2'),
	clientId: z.string(),
	clientSecret: z.string(),
	redirectUri: z.string().url(),
	scope: z.string().optional(),
});

export const JWTAuthSchema = z.object({
	type: z.literal('jwt'),
	token: z.string(),
	refreshToken: z.string().optional(),
});

export const AuthConfigSchema = z.discriminatedUnion('type', [
	APIKeyAuthSchema,
	OAuth2AuthSchema,
	JWTAuthSchema,
]);

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * Authentication manager for handling different auth types
 * Integration: const auth = new AuthManager(config);
 */
export class AuthManager {
	constructor(private config: AuthConfig) {}

	getAuthHeader(): string {
		switch (this.config.type) {
			case 'apiKey':
				return `Bearer ${this.config.key}`;
			case 'jwt':
				return `Bearer ${this.config.token}`;
			case 'oauth2':
				throw new Error('OAuth2 requires token exchange first');
		}
	}

	async refreshToken(refreshToken: string): Promise<string> {
		// Placeholder for JWT refresh logic
		return refreshToken;
	}

	async exchangeOAuthCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
		// Placeholder for OAuth2 code exchange
		return { accessToken: code };
	}
}
