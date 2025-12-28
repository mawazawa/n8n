import { type Request, type Response, Router } from 'express';
import { TenantManager } from './tenant';
import { CreateTenantConfigSchema, UpdateTenantConfigSchema } from './types';
import { z } from 'zod';

/**
 * API response wrapper
 */
interface APIResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
}

/**
 * Create Tenant Management API routes
 */
export function createTenantAPI(tenantManager: TenantManager): Router {
	const router = Router();

	/**
	 * POST /tenants - Create tenant
	 */
	router.post('/tenants', async (req: Request, res: Response) => {
		try {
			// Validate request body
			const config = CreateTenantConfigSchema.parse(req.body);

			// Create tenant
			const tenant = await tenantManager.create(config);

			const response: APIResponse = {
				success: true,
				data: tenant,
			};

			res.status(201).json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_CREATE_FAILED',
					message: error instanceof Error ? error.message : String(error),
					details: error instanceof z.ZodError ? error.errors : undefined,
				},
			};

			res.status(400).json(response);
		}
	});

	/**
	 * GET /tenants/:id - Get tenant
	 */
	router.get('/tenants/:id', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			const tenant = await tenantManager.getById(id);

			if (!tenant) {
				const response: APIResponse = {
					success: false,
					error: {
						code: 'TENANT_NOT_FOUND',
						message: `Tenant ${id} not found`,
					},
				};

				return res.status(404).json(response);
			}

			const response: APIResponse = {
				success: true,
				data: tenant,
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_GET_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(500).json(response);
		}
	});

	/**
	 * GET /tenants - List tenants
	 */
	router.get('/tenants', async (req: Request, res: Response) => {
		try {
			const { status, planType, organizationId } = req.query;

			const tenants = await tenantManager.list({
				status: status as string | undefined,
				planType: planType as string | undefined,
				organizationId: organizationId as string | undefined,
			});

			const response: APIResponse = {
				success: true,
				data: {
					tenants,
					total: tenants.length,
				},
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_LIST_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(500).json(response);
		}
	});

	/**
	 * PUT /tenants/:id - Update tenant
	 */
	router.put('/tenants/:id', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			// Validate request body
			const updates = UpdateTenantConfigSchema.parse(req.body);

			// Update tenant
			const tenant = await tenantManager.update(id, updates);

			const response: APIResponse = {
				success: true,
				data: tenant,
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_UPDATE_FAILED',
					message: error instanceof Error ? error.message : String(error),
					details: error instanceof z.ZodError ? error.errors : undefined,
				},
			};

			res.status(400).json(response);
		}
	});

	/**
	 * DELETE /tenants/:id - Delete tenant
	 */
	router.delete('/tenants/:id', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			await tenantManager.delete(id);

			const response: APIResponse = {
				success: true,
				data: {
					message: 'Tenant deleted successfully',
				},
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_DELETE_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(400).json(response);
		}
	});

	/**
	 * POST /tenants/:id/suspend - Suspend tenant
	 */
	router.post('/tenants/:id/suspend', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			await tenantManager.suspend(id);

			const response: APIResponse = {
				success: true,
				data: {
					message: 'Tenant suspended successfully',
				},
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_SUSPEND_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(400).json(response);
		}
	});

	/**
	 * POST /tenants/:id/resume - Resume tenant
	 */
	router.post('/tenants/:id/resume', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			await tenantManager.resume(id);

			const response: APIResponse = {
				success: true,
				data: {
					message: 'Tenant resumed successfully',
				},
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_RESUME_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(400).json(response);
		}
	});

	/**
	 * GET /tenants/slug/:slug - Get tenant by slug
	 */
	router.get('/tenants/slug/:slug', async (req: Request, res: Response) => {
		try {
			const { slug } = req.params;

			const tenant = await tenantManager.getBySlug(slug);

			if (!tenant) {
				const response: APIResponse = {
					success: false,
					error: {
						code: 'TENANT_NOT_FOUND',
						message: `Tenant with slug ${slug} not found`,
					},
				};

				return res.status(404).json(response);
			}

			const response: APIResponse = {
				success: true,
				data: tenant,
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_GET_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(500).json(response);
		}
	});

	/**
	 * GET /tenants/domain/:domain - Get tenant by domain
	 */
	router.get('/tenants/domain/:domain', async (req: Request, res: Response) => {
		try {
			const { domain } = req.params;

			const tenant = await tenantManager.getTenantByDomain(domain);

			if (!tenant) {
				const response: APIResponse = {
					success: false,
					error: {
						code: 'TENANT_NOT_FOUND',
						message: `Tenant with domain ${domain} not found`,
					},
				};

				return res.status(404).json(response);
			}

			const response: APIResponse = {
				success: true,
				data: tenant,
			};

			res.json(response);
		} catch (error) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'TENANT_GET_FAILED',
					message: error instanceof Error ? error.message : String(error),
				},
			};

			res.status(500).json(response);
		}
	});

	return router;
}

/**
 * Middleware to validate API key
 */
export function validateAPIKey(apiKey: string) {
	return (req: Request, res: Response, next: () => void) => {
		const providedKey = req.headers['x-api-key'];

		if (!providedKey || providedKey !== apiKey) {
			const response: APIResponse = {
				success: false,
				error: {
					code: 'UNAUTHORIZED',
					message: 'Invalid API key',
				},
			};

			return res.status(401).json(response);
		}

		next();
	};
}

/**
 * Middleware to validate tenant admin permissions
 */
export function validateTenantAdmin() {
	return (req: Request, res: Response, next: () => void) => {
		// This would check if the authenticated user has admin permissions
		// for the tenant being accessed

		// For now, just pass through
		next();
	};
}

/**
 * Error handler middleware
 */
export function errorHandler() {
	return (err: Error, req: Request, res: Response, next: () => void) => {
		console.error('API Error:', err);

		const response: APIResponse = {
			success: false,
			error: {
				code: 'INTERNAL_ERROR',
				message: err.message,
			},
		};

		res.status(500).json(response);
	};
}
