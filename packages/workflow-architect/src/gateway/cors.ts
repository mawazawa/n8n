import type { Request, Response, NextFunction } from 'express';
import type { CORSPolicyConfig } from './types.js';

/**
 * CORS handler for managing Cross-Origin Resource Sharing
 * Supports per-route policies and preflight handling
 */
export class CORSHandler {
	private config: CORSPolicyConfig;

	constructor(config: CORSPolicyConfig) {
		this.config = config;
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return (req: Request, res: Response, next: NextFunction): void => {
			const origin = req.headers.origin;

			// Check if origin is allowed
			if (origin && this.isOriginAllowed(origin)) {
				// Set Access-Control-Allow-Origin
				res.setHeader('Access-Control-Allow-Origin', origin);

				// Set Vary header to indicate origin affects the response
				const varyHeader = res.getHeader('Vary') as string | undefined;
				if (varyHeader) {
					if (!varyHeader.includes('Origin')) {
						res.setHeader('Vary', `${varyHeader}, Origin`);
					}
				} else {
					res.setHeader('Vary', 'Origin');
				}
			} else if (this.config.origin === true || this.config.origin === '*') {
				res.setHeader('Access-Control-Allow-Origin', '*');
			}

			// Set Access-Control-Allow-Credentials
			if (this.config.credentials) {
				res.setHeader('Access-Control-Allow-Credentials', 'true');
			}

			// Set Access-Control-Expose-Headers
			if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
				res.setHeader('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '));
			}

			// Handle preflight requests
			if (req.method === 'OPTIONS') {
				this.handlePreflight(req, res);

				if (!this.config.preflightContinue) {
					res.status(204).end();
					return;
				}
			}

			next();
		};
	}

	/**
	 * Handle preflight requests
	 */
	private handlePreflight(req: Request, res: Response): void {
		// Set Access-Control-Allow-Methods
		const allowedMethods = this.config.methods ?? ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
		res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));

		// Set Access-Control-Allow-Headers
		const requestHeaders = req.headers['access-control-request-headers'];
		if (requestHeaders) {
			if (this.config.allowedHeaders && this.config.allowedHeaders.length > 0) {
				res.setHeader('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
			} else {
				// Echo back the requested headers
				res.setHeader('Access-Control-Allow-Headers', requestHeaders);
			}
		}

		// Set Access-Control-Max-Age
		if (this.config.maxAge !== undefined) {
			res.setHeader('Access-Control-Max-Age', this.config.maxAge.toString());
		}
	}

	/**
	 * Check if origin is allowed
	 */
	private isOriginAllowed(origin: string): boolean {
		if (this.config.origin === true || this.config.origin === '*') {
			return true;
		}

		if (typeof this.config.origin === 'string') {
			return origin === this.config.origin;
		}

		if (Array.isArray(this.config.origin)) {
			return this.config.origin.some((allowed) => {
				if (allowed instanceof RegExp) {
					return allowed.test(origin);
				}
				return origin === allowed;
			});
		}

		return false;
	}

	/**
	 * Update CORS configuration
	 */
	configure(config: Partial<CORSPolicyConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): CORSPolicyConfig {
		return { ...this.config };
	}

	/**
	 * Add allowed origin
	 */
	addOrigin(origin: string): void {
		if (typeof this.config.origin === 'string') {
			this.config.origin = [this.config.origin, origin];
		} else if (Array.isArray(this.config.origin)) {
			this.config.origin.push(origin);
		} else {
			this.config.origin = [origin];
		}
	}

	/**
	 * Remove allowed origin
	 */
	removeOrigin(origin: string): void {
		if (Array.isArray(this.config.origin)) {
			this.config.origin = this.config.origin.filter((o) => o !== origin);
		}
	}

	/**
	 * Add allowed method
	 */
	addMethod(method: string): void {
		if (!this.config.methods) {
			this.config.methods = [];
		}
		if (!this.config.methods.includes(method as never)) {
			this.config.methods.push(method as never);
		}
	}

	/**
	 * Remove allowed method
	 */
	removeMethod(method: string): void {
		if (this.config.methods) {
			this.config.methods = this.config.methods.filter((m) => m !== method);
		}
	}

	/**
	 * Add allowed header
	 */
	addAllowedHeader(header: string): void {
		if (!this.config.allowedHeaders) {
			this.config.allowedHeaders = [];
		}
		if (!this.config.allowedHeaders.includes(header)) {
			this.config.allowedHeaders.push(header);
		}
	}

	/**
	 * Remove allowed header
	 */
	removeAllowedHeader(header: string): void {
		if (this.config.allowedHeaders) {
			this.config.allowedHeaders = this.config.allowedHeaders.filter((h) => h !== header);
		}
	}

	/**
	 * Add exposed header
	 */
	addExposedHeader(header: string): void {
		if (!this.config.exposedHeaders) {
			this.config.exposedHeaders = [];
		}
		if (!this.config.exposedHeaders.includes(header)) {
			this.config.exposedHeaders.push(header);
		}
	}

	/**
	 * Remove exposed header
	 */
	removeExposedHeader(header: string): void {
		if (this.config.exposedHeaders) {
			this.config.exposedHeaders = this.config.exposedHeaders.filter((h) => h !== header);
		}
	}
}
