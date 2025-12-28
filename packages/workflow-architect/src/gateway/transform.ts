import type { Request, Response, NextFunction } from 'express';
import { JSONPath } from 'jsonpath-plus';
import type { TransformPolicyConfig } from './types.js';

/**
 * Request/response transformation engine
 * Supports header manipulation and JSONPath-based body transformations
 */
export class TransformEngine {
	private config: TransformPolicyConfig;

	constructor(config: TransformPolicyConfig) {
		this.config = config;
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			// Transform request
			if (this.config.request) {
				this.transformRequest(req);
			}

			// Transform response
			if (this.config.response) {
				this.interceptResponse(res);
			}

			next();
		};
	}

	/**
	 * Transform request
	 */
	transformRequest(req: Request): Request {
		if (!this.config.request) return req;

		// Add/modify headers
		if (this.config.request.headers) {
			for (const [key, value] of Object.entries(this.config.request.headers)) {
				req.headers[key.toLowerCase()] = value;
			}
		}

		// Remove headers
		if (this.config.request.removeHeaders) {
			for (const header of this.config.request.removeHeaders) {
				delete req.headers[header.toLowerCase()];
			}
		}

		// Transform body
		if (this.config.request.body && req.body) {
			req.body = { ...req.body, ...this.config.request.body };
		}

		// Apply JSONPath transformations
		if (this.config.request.jsonPath && req.body) {
			for (const transform of this.config.request.jsonPath) {
				this.applyJSONPathTransform(req.body, transform.path, transform.value);
			}
		}

		return req;
	}

	/**
	 * Transform response (returns transformed data)
	 */
	transformResponse(statusCode: number, headers: Record<string, string>, body: unknown): {
		statusCode: number;
		headers: Record<string, string>;
		body: unknown;
	} {
		if (!this.config.response) {
			return { statusCode, headers, body };
		}

		const transformedHeaders = { ...headers };

		// Add/modify headers
		if (this.config.response.headers) {
			for (const [key, value] of Object.entries(this.config.response.headers)) {
				transformedHeaders[key.toLowerCase()] = value;
			}
		}

		// Remove headers
		if (this.config.response.removeHeaders) {
			for (const header of this.config.response.removeHeaders) {
				delete transformedHeaders[header.toLowerCase()];
			}
		}

		let transformedBody = body;

		// Transform body
		if (this.config.response.body && typeof transformedBody === 'object' && transformedBody !== null) {
			transformedBody = { ...transformedBody, ...this.config.response.body };
		}

		// Apply JSONPath transformations
		if (this.config.response.jsonPath && typeof transformedBody === 'object' && transformedBody !== null) {
			transformedBody = JSON.parse(JSON.stringify(transformedBody)); // Deep clone
			for (const transform of this.config.response.jsonPath) {
				this.applyJSONPathTransform(transformedBody, transform.path, transform.value);
			}
		}

		return {
			statusCode,
			headers: transformedHeaders,
			body: transformedBody,
		};
	}

	/**
	 * Intercept response to apply transformations
	 */
	private interceptResponse(res: Response): void {
		const originalSend = res.send.bind(res);
		res.send = ((body: unknown): Response => {
			const headers: Record<string, string> = {};
			const headerNames = res.getHeaderNames();
			for (const name of headerNames) {
				const value = res.getHeader(name);
				if (typeof value === 'string') {
					headers[name] = value;
				} else if (typeof value === 'number') {
					headers[name] = value.toString();
				} else if (Array.isArray(value)) {
					headers[name] = value.join(', ');
				}
			}

			const transformed = this.transformResponse(res.statusCode, headers, body);

			// Apply transformed headers
			for (const [key, value] of Object.entries(transformed.headers)) {
				res.setHeader(key, value);
			}

			return originalSend(transformed.body);
		}) as Response['send'];
	}

	/**
	 * Apply JSONPath transformation to an object
	 */
	private applyJSONPathTransform(obj: unknown, path: string, value: unknown): void {
		try {
			// Evaluate the JSONPath
			const nodes = JSONPath({
				path,
				json: obj,
				resultType: 'all',
			});

			// Set the value for each matched node
			for (const node of nodes) {
				if (node.parent && node.parentProperty !== undefined) {
					// Type guard to ensure parent is an object with index signature
					const parent = node.parent as Record<string | number, unknown>;
					const property = node.parentProperty as string | number;
					parent[property] = value;
				}
			}
		} catch (error) {
			// Silently ignore invalid JSONPath expressions
			console.warn(`Invalid JSONPath expression: ${path}`, error);
		}
	}

	/**
	 * Evaluate a template string with variables
	 */
	evaluateTemplate(template: string, variables: Record<string, unknown>): string {
		let result = template;

		// Replace {{variable}} patterns
		for (const [key, value] of Object.entries(variables)) {
			const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
			result = result.replace(pattern, String(value));
		}

		return result;
	}

	/**
	 * Extract variables from request
	 */
	extractVariables(req: Request): Record<string, unknown> {
		const user = (req as Request & { user?: { id: string } }).user;

		return {
			// Request properties
			method: req.method,
			path: req.path,
			url: req.url,
			hostname: req.hostname,
			ip: req.ip,

			// Headers
			userAgent: req.headers['user-agent'],
			contentType: req.headers['content-type'],
			authorization: req.headers.authorization,

			// User properties
			userId: user?.id,

			// Timestamp
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Transform using template
	 */
	transformWithTemplate(
		data: Record<string, unknown>,
		template: Record<string, string>,
		variables: Record<string, unknown>,
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const [key, templateValue] of Object.entries(template)) {
			if (typeof templateValue === 'string') {
				result[key] = this.evaluateTemplate(templateValue, { ...data, ...variables });
			} else {
				result[key] = templateValue;
			}
		}

		return result;
	}
}
