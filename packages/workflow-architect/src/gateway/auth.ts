import type { Request, Response, NextFunction } from 'express';
import type { AuthPolicyConfig } from './types.js';

interface AuthResult {
	authenticated: boolean;
	user?: {
		id: string;
		roles: string[];
		metadata?: Record<string, unknown>;
	};
	error?: string;
}

interface JWTPayload {
	sub?: string;
	iss?: string;
	aud?: string | string[];
	exp?: number;
	iat?: number;
	roles?: string[];
	[key: string]: unknown;
}

/**
 * Authentication middleware for API Gateway
 * Supports API key, JWT, OAuth2, and basic auth
 */
export class AuthMiddleware {
	private config: AuthPolicyConfig;
	private apiKeys: Map<string, { id: string; roles: string[] }> = new Map();
	private jwtSecret?: string;

	constructor(config: AuthPolicyConfig) {
		this.config = config;
		if (config.jwt) {
			this.jwtSecret = config.jwt.secret;
		}
	}

	/**
	 * Add an API key
	 */
	addApiKey(key: string, userId: string, roles: string[] = []): void {
		this.apiKeys.set(key, { id: userId, roles });
	}

	/**
	 * Remove an API key
	 */
	removeApiKey(key: string): void {
		this.apiKeys.delete(key);
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const result = await this.authenticate(req);

			if (!result.authenticated) {
				res.status(401).json({
					error: 'Unauthorized',
					message: result.error ?? 'Authentication required',
				});
				return;
			}

			// Attach user to request
			(req as Request & { user?: AuthResult['user'] }).user = result.user;
			next();
		};
	}

	/**
	 * Authenticate a request
	 */
	async authenticate(req: Request): Promise<AuthResult> {
		// Try each strategy in order
		for (const strategy of this.config.strategies) {
			let result: AuthResult | null = null;

			switch (strategy) {
				case 'api-key':
					result = this.authenticateApiKey(req);
					break;
				case 'jwt':
					result = await this.authenticateJWT(req);
					break;
				case 'oauth2':
					result = await this.authenticateOAuth2(req);
					break;
				case 'basic':
					result = this.authenticateBasic(req);
					break;
			}

			if (result?.authenticated) {
				return result;
			}
		}

		return {
			authenticated: false,
			error: 'No valid authentication credentials provided',
		};
	}

	/**
	 * Authenticate using API key
	 */
	private authenticateApiKey(req: Request): AuthResult {
		if (!this.config.apiKey) {
			return { authenticated: false, error: 'API key authentication not configured' };
		}

		// Check header
		const headerKey = req.headers[this.config.apiKey.header.toLowerCase()] as
			| string
			| undefined;
		if (headerKey) {
			const user = this.apiKeys.get(headerKey);
			if (user) {
				return { authenticated: true, user };
			}
		}

		// Check query parameter
		if (this.config.apiKey.query) {
			const queryKey = req.query[this.config.apiKey.query] as string | undefined;
			if (queryKey) {
				const user = this.apiKeys.get(queryKey);
				if (user) {
					return { authenticated: true, user };
				}
			}
		}

		return { authenticated: false, error: 'Invalid API key' };
	}

	/**
	 * Authenticate using JWT
	 */
	private async authenticateJWT(req: Request): Promise<AuthResult> {
		if (!this.config.jwt || !this.jwtSecret) {
			return { authenticated: false, error: 'JWT authentication not configured' };
		}

		// Extract token from Authorization header
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			return { authenticated: false, error: 'No Bearer token provided' };
		}

		const token = authHeader.slice(7);

		try {
			// Decode and verify JWT (simplified - in production use jsonwebtoken library)
			const payload = this.decodeJWT(token);

			// Verify issuer
			if (this.config.jwt.issuer && payload.iss !== this.config.jwt.issuer) {
				return { authenticated: false, error: 'Invalid token issuer' };
			}

			// Verify audience
			if (this.config.jwt.audience) {
				const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
				if (!audiences.includes(this.config.jwt.audience)) {
					return { authenticated: false, error: 'Invalid token audience' };
				}
			}

			// Verify expiration
			if (payload.exp && payload.exp * 1000 < Date.now()) {
				return { authenticated: false, error: 'Token expired' };
			}

			return {
				authenticated: true,
				user: {
					id: payload.sub ?? 'unknown',
					roles: payload.roles ?? [],
					metadata: payload,
				},
			};
		} catch (error) {
			return { authenticated: false, error: 'Invalid JWT token' };
		}
	}

	/**
	 * Authenticate using OAuth2
	 */
	private async authenticateOAuth2(req: Request): Promise<AuthResult> {
		if (!this.config.oauth2) {
			return { authenticated: false, error: 'OAuth2 authentication not configured' };
		}

		// Extract token from Authorization header
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			return { authenticated: false, error: 'No Bearer token provided' };
		}

		const token = authHeader.slice(7);

		try {
			// Verify token with OAuth2 provider
			// In production, this would call the token introspection endpoint
			const response = await fetch(this.config.oauth2.tokenEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Authorization: `Basic ${Buffer.from(
						`${this.config.oauth2.clientId}:${this.config.oauth2.clientSecret}`,
					).toString('base64')}`,
				},
				body: `token=${token}`,
			});

			if (!response.ok) {
				return { authenticated: false, error: 'Token verification failed' };
			}

			const data = (await response.json()) as {
				active: boolean;
				sub?: string;
				scope?: string;
			};

			if (!data.active) {
				return { authenticated: false, error: 'Token is not active' };
			}

			return {
				authenticated: true,
				user: {
					id: data.sub ?? 'unknown',
					roles: data.scope?.split(' ') ?? [],
				},
			};
		} catch (error) {
			return { authenticated: false, error: 'OAuth2 verification failed' };
		}
	}

	/**
	 * Authenticate using Basic auth
	 */
	private authenticateBasic(req: Request): AuthResult {
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Basic ')) {
			return { authenticated: false, error: 'No Basic auth credentials provided' };
		}

		try {
			const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
			const [username, password] = credentials.split(':');

			// In production, verify against a user database
			// For now, this is a placeholder
			if (username && password) {
				return {
					authenticated: true,
					user: {
						id: username,
						roles: ['user'],
					},
				};
			}

			return { authenticated: false, error: 'Invalid credentials' };
		} catch (error) {
			return { authenticated: false, error: 'Invalid Basic auth header' };
		}
	}

	/**
	 * Decode JWT (simplified version - use jsonwebtoken in production)
	 */
	private decodeJWT(token: string): JWTPayload {
		const parts = token.split('.');
		if (parts.length !== 3) {
			throw new Error('Invalid JWT format');
		}

		const payload = parts[1];
		if (!payload) {
			throw new Error('Missing JWT payload');
		}

		const decoded = Buffer.from(payload, 'base64').toString('utf-8');
		return JSON.parse(decoded) as JWTPayload;
	}

	/**
	 * Generate a simple JWT (for testing - use jsonwebtoken in production)
	 */
	generateToken(userId: string, roles: string[] = [], expiresIn = 3600): string {
		const header = {
			alg: 'HS256',
			typ: 'JWT',
		};

		const payload: JWTPayload = {
			sub: userId,
			roles,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + expiresIn,
		};

		if (this.config.jwt?.issuer) {
			payload.iss = this.config.jwt.issuer;
		}

		if (this.config.jwt?.audience) {
			payload.aud = this.config.jwt.audience;
		}

		const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
		const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

		// In production, properly sign with the secret
		const signature = Buffer.from(`${encodedHeader}.${encodedPayload}`).toString('base64url');

		return `${encodedHeader}.${encodedPayload}.${signature}`;
	}
}
