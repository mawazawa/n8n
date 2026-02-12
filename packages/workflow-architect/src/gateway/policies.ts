import type { Request, Response, NextFunction } from 'express';
import type { Policy, PolicyConfig, HttpMethod } from './types.js';
import { AuthMiddleware } from './auth.js';
import { RateLimiter } from './rate-limit.js';
import { CORSHandler } from './cors.js';
import { ResponseCache } from './cache.js';
import { TransformEngine } from './transform.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { CompressionHandler } from './compression.js';

/**
 * Policy engine for managing and executing gateway policies
 * Supports policy chaining, conditional execution, and templates
 */
export class PolicyEngine {
	private policies: Map<string, Policy> = new Map();
	private instances: Map<string, unknown> = new Map();

	constructor() {}

	/**
	 * Register a policy
	 */
	registerPolicy(policy: Policy): void {
		this.policies.set(policy.id, policy);

		// Create policy instance
		this.createPolicyInstance(policy);
	}

	/**
	 * Unregister a policy
	 */
	unregisterPolicy(policyId: string): void {
		this.policies.delete(policyId);
		this.instances.delete(policyId);
	}

	/**
	 * Get policy by ID
	 */
	getPolicy(policyId: string): Policy | null {
		return this.policies.get(policyId) ?? null;
	}

	/**
	 * Get all policies
	 */
	getAllPolicies(): Policy[] {
		return Array.from(this.policies.values());
	}

	/**
	 * Create policy instance
	 */
	private createPolicyInstance(policy: Policy): void {
		switch (policy.config.type) {
			case 'auth':
				this.instances.set(policy.id, new AuthMiddleware(policy.config));
				break;
			case 'rate-limit':
				this.instances.set(policy.id, new RateLimiter(policy.config));
				break;
			case 'cors':
				this.instances.set(policy.id, new CORSHandler(policy.config));
				break;
			case 'cache':
				this.instances.set(policy.id, new ResponseCache(policy.config));
				break;
			case 'transform':
				this.instances.set(policy.id, new TransformEngine(policy.config));
				break;
			case 'circuit-breaker':
				this.instances.set(policy.id, new CircuitBreaker(policy.config));
				break;
			case 'compression':
				this.instances.set(policy.id, new CompressionHandler(policy.config));
				break;
		}
	}

	/**
	 * Get policy instance
	 */
	getPolicyInstance<T>(policyId: string): T | null {
		return (this.instances.get(policyId) as T) ?? null;
	}

	/**
	 * Apply policies to a route
	 */
	applyPolicies(policyIds: string[]): (req: Request, res: Response, next: NextFunction) => void {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			// Execute policies in order
			for (const policyId of policyIds) {
				const policy = this.policies.get(policyId);
				if (!policy || !policy.enabled) {
					continue;
				}

				// Check conditions
				if (!this.checkConditions(policy, req)) {
					continue;
				}

				// Execute policy
				const executed = await this.executePolicy(policy, req, res);
				if (!executed) {
					// Policy stopped the request
					return;
				}
			}

			next();
		};
	}

	/**
	 * Check if policy conditions are met
	 */
	private checkConditions(policy: Policy, req: Request): boolean {
		if (!policy.conditions) {
			return true;
		}

		// Check path conditions
		if (policy.conditions.paths) {
			const matches = policy.conditions.paths.some((pattern) => {
				const regex = this.pathToRegex(pattern);
				return regex.test(req.path);
			});
			if (!matches) {
				return false;
			}
		}

		// Check method conditions
		if (policy.conditions.methods) {
			if (!policy.conditions.methods.includes(req.method as HttpMethod)) {
				return false;
			}
		}

		// Check header conditions
		if (policy.conditions.headers) {
			for (const [header, value] of Object.entries(policy.conditions.headers)) {
				const actualValue = req.headers[header.toLowerCase()];
				if (actualValue !== value) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Execute a policy
	 */
	private async executePolicy(
		policy: Policy,
		req: Request,
		res: Response,
	): Promise<boolean> {
		const instance = this.instances.get(policy.id);
		if (!instance) {
			return true;
		}

		return new Promise((resolve) => {
			// Check if response has been sent
			let sent = false;
			const originalSend = res.send.bind(res);
			res.send = ((body: unknown): Response => {
				sent = true;
				return originalSend(body);
			}) as Response['send'];

			// Execute middleware
			const next = (error?: Error): void => {
				if (error || sent) {
					resolve(false);
				} else {
					resolve(true);
				}
			};

			try {
				// Get middleware function
				let middleware: ((req: Request, res: Response, next: NextFunction) => void) | null = null;

				if (instance instanceof AuthMiddleware) {
					middleware = instance.middleware();
				} else if (instance instanceof RateLimiter) {
					middleware = instance.middleware();
				} else if (instance instanceof CORSHandler) {
					middleware = instance.middleware();
				} else if (instance instanceof ResponseCache) {
					middleware = instance.middleware();
				} else if (instance instanceof TransformEngine) {
					middleware = instance.middleware();
				} else if (instance instanceof CompressionHandler) {
					middleware = instance.middleware();
				}

				if (middleware) {
					middleware(req, res, next);
				} else {
					resolve(true);
				}
			} catch (error) {
				resolve(false);
			}
		});
	}

	/**
	 * Convert path pattern to regex
	 */
	private pathToRegex(pattern: string): RegExp {
		// Escape special regex characters except * and :param
		let regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

		// Replace :param with capture groups
		regexPattern = regexPattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '([^/]+)');

		// Replace * wildcards
		regexPattern = regexPattern.replace(/\*/g, '.*');

		return new RegExp(`^${regexPattern}$`);
	}

	/**
	 * Create policy from template
	 */
	createFromTemplate(
		templateName: string,
		customConfig?: Partial<PolicyConfig>,
	): Policy | null {
		const template = this.getTemplate(templateName);
		if (!template) {
			return null;
		}

		const config = customConfig ? { ...template.config, ...customConfig } : template.config;

		return {
			...template,
			id: `${templateName}-${Date.now()}`,
			config,
		};
	}

	/**
	 * Get policy template
	 */
	private getTemplate(name: string): Policy | null {
		const templates: Record<string, Policy> = {
			'strict-auth': {
				id: 'strict-auth',
				name: 'Strict Authentication',
				enabled: true,
				config: {
					type: 'auth',
					strategies: ['jwt', 'api-key'],
				},
			},
			'basic-rate-limit': {
				id: 'basic-rate-limit',
				name: 'Basic Rate Limiting',
				enabled: true,
				config: {
					type: 'rate-limit',
					windowMs: 60000,
					maxRequests: 100,
					keyGenerator: 'ip',
					skipSuccessfulRequests: false,
					skipFailedRequests: false,
				},
			},
			'permissive-cors': {
				id: 'permissive-cors',
				name: 'Permissive CORS',
				enabled: true,
				config: {
					type: 'cors',
					origin: true,
					credentials: false,
					preflightContinue: false,
				},
			},
			'aggressive-cache': {
				id: 'aggressive-cache',
				name: 'Aggressive Caching',
				enabled: true,
				config: {
					type: 'cache',
					ttl: 3600000,
					methods: ['GET', 'HEAD'],
					varyHeaders: [],
					invalidateOn: ['POST', 'PUT', 'PATCH', 'DELETE'],
					keyGenerator: 'url-query',
					respectCacheControl: true,
				},
			},
			'default-compression': {
				id: 'default-compression',
				name: 'Default Compression',
				enabled: true,
				config: {
					type: 'compression',
					threshold: 1024,
					level: 6,
					mimeTypes: ['text/html', 'text/css', 'application/json'],
					brotli: true,
					gzip: true,
				},
			},
		};

		return templates[name] ?? null;
	}

	/**
	 * Update policy configuration
	 */
	updatePolicy(policyId: string, updates: Partial<Policy>): boolean {
		const policy = this.policies.get(policyId);
		if (!policy) {
			return false;
		}

		const updated: Policy = { ...policy, ...updates };
		this.policies.set(policyId, updated);

		// Recreate instance if config changed
		if (updates.config) {
			this.createPolicyInstance(updated);
		}

		return true;
	}

	/**
	 * Enable policy
	 */
	enablePolicy(policyId: string): boolean {
		return this.updatePolicy(policyId, { enabled: true });
	}

	/**
	 * Disable policy
	 */
	disablePolicy(policyId: string): boolean {
		return this.updatePolicy(policyId, { enabled: false });
	}
}
