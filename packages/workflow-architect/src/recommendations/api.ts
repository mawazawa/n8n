/**
 * Recommendations API
 *
 * REST API endpoints for workflow recommendations with authentication,
 * feedback processing, and A/B testing support.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { RecommendationEngine } from './engine.js';
import { FeedbackProcessor } from './feedback.js';
import { ABTestManager } from './ab-testing.js';
import { PersonalizationEngine } from './personalization.js';
import { TrendingCalculator } from './trending.js';
import { ExplanationBuilder } from './explanation.js';
import type { FeedbackSignal, RecommendationContext } from './types.js';

interface AuthRequest extends Request {
	userId?: string;
}

const FeedbackSchema = z.object({
	recommendationId: z.string(),
	workflowId: z.string(),
	type: z.enum(['click', 'save', 'use', 'dismiss', 'rate', 'view', 'time_spent']),
	value: z.number().optional(),
	context: z.record(z.unknown()).optional(),
});

const PreferencesSchema = z.object({
	categories: z.array(z.string()).optional(),
	tags: z.array(z.string()).optional(),
	complexity: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
});

export class RecommendationsAPI {
	private readonly router: Router;
	private readonly recommendationEngine: RecommendationEngine;
	private readonly feedbackProcessor: FeedbackProcessor;
	private readonly abTestManager: ABTestManager;
	private readonly personalizationEngine: PersonalizationEngine;
	private readonly trendingCalculator: TrendingCalculator;
	private readonly explanationBuilder: ExplanationBuilder;

	constructor(private readonly supabase: SupabaseClient) {
		this.router = Router();
		this.recommendationEngine = new RecommendationEngine();
		this.feedbackProcessor = new FeedbackProcessor();
		this.abTestManager = new ABTestManager();
		this.personalizationEngine = new PersonalizationEngine();
		this.trendingCalculator = new TrendingCalculator();
		this.explanationBuilder = new ExplanationBuilder();

		this.setupRoutes();
	}

	/**
	 * Get Express router
	 */
	getRouter(): Router {
		return this.router;
	}

	/**
	 * Setup all API routes
	 */
	private setupRoutes(): void {
		// ========================================================================
		// Public Routes
		// ========================================================================

		// Trending workflows (no auth required)
		this.router.get('/trending', this.handleGetTrending.bind(this));
		this.router.get('/trending/:category', this.handleGetTrendingByCategory.bind(this));

		// ========================================================================
		// Authenticated Routes
		// ========================================================================

		// Get personalized recommendations
		this.router.get(
			'/',
			this.authMiddleware.bind(this),
			this.handleGetRecommendations.bind(this),
		);

		// Get explanation for a recommendation
		this.router.get(
			'/explain/:id',
			this.authMiddleware.bind(this),
			this.handleGetExplanation.bind(this),
		);

		// Submit feedback
		this.router.post(
			'/feedback',
			this.authMiddleware.bind(this),
			this.handleSubmitFeedback.bind(this),
		);

		// Update user preferences
		this.router.post(
			'/preferences',
			this.authMiddleware.bind(this),
			this.handleUpdatePreferences.bind(this),
		);

		// Get user preferences
		this.router.get(
			'/preferences',
			this.authMiddleware.bind(this),
			this.handleGetPreferences.bind(this),
		);

		// Get user profile
		this.router.get(
			'/profile',
			this.authMiddleware.bind(this),
			this.handleGetProfile.bind(this),
		);

		// Track workflow view (implicit feedback)
		this.router.post(
			'/track/view',
			this.authMiddleware.bind(this),
			this.handleTrackView.bind(this),
		);

		// Track time spent (implicit feedback)
		this.router.post(
			'/track/time-spent',
			this.authMiddleware.bind(this),
			this.handleTrackTimeSpent.bind(this),
		);

		// ========================================================================
		// Admin Routes (A/B Testing)
		// ========================================================================

		// Create A/B experiment
		this.router.post(
			'/experiments',
			this.authMiddleware.bind(this),
			this.adminMiddleware.bind(this),
			this.handleCreateExperiment.bind(this),
		);

		// Start experiment
		this.router.post(
			'/experiments/:id/start',
			this.authMiddleware.bind(this),
			this.adminMiddleware.bind(this),
			this.handleStartExperiment.bind(this),
		);

		// Stop experiment
		this.router.post(
			'/experiments/:id/stop',
			this.authMiddleware.bind(this),
			this.adminMiddleware.bind(this),
			this.handleStopExperiment.bind(this),
		);

		// Get experiment results
		this.router.get(
			'/experiments/:id/results',
			this.authMiddleware.bind(this),
			this.adminMiddleware.bind(this),
			this.handleGetExperimentResults.bind(this),
		);

		// List experiments
		this.router.get(
			'/experiments',
			this.authMiddleware.bind(this),
			this.adminMiddleware.bind(this),
			this.handleListExperiments.bind(this),
		);
	}

	// ==========================================================================
	// Middleware
	// ==========================================================================

	private async authMiddleware(
		req: AuthRequest,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const token = req.headers.authorization?.replace('Bearer ', '');
			if (!token) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const { data, error } = await this.supabase.auth.getUser(token);
			if (error || !data.user) {
				res.status(401).json({ error: 'Invalid token' });
				return;
			}

			req.userId = data.user.id;
			next();
		} catch (error) {
			res.status(500).json({ error: 'Authentication failed' });
		}
	}

	private async adminMiddleware(
		req: AuthRequest,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			// Check if user has admin role
			const { data, error } = await this.supabase
				.from('user_roles')
				.select('role')
				.eq('user_id', req.userId)
				.single();

			if (error || !data || data.role !== 'admin') {
				res.status(403).json({ error: 'Forbidden: Admin access required' });
				return;
			}

			next();
		} catch (error) {
			res.status(500).json({ error: 'Authorization failed' });
		}
	}

	// ==========================================================================
	// Recommendation Handlers
	// ==========================================================================

	private async handleGetRecommendations(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;

			// Parse query parameters
			const limit = parseInt(req.query.limit as string) || 10;
			const currentWorkflow = req.query.currentWorkflow as string | undefined;
			const strategies = req.query.strategies
				? (req.query.strategies as string).split(',')
				: undefined;
			const excludeWorkflows = req.query.exclude
				? (req.query.exclude as string).split(',')
				: undefined;

			// Generate recommendations
			const result = await this.recommendationEngine.recommend({
				userId,
				context: {
					currentWorkflow,
					timeOfDay: new Date().getHours(),
					dayOfWeek: new Date().getDay(),
				},
				strategies,
				limit,
				excludeWorkflows,
			});

			res.json({
				recommendations: result.recommendations,
				requestId: result.requestId,
				generatedAt: result.generatedAt,
				performanceMs: result.performanceMs,
			});
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleGetTrending(req: Request, res: Response): Promise<void> {
		try {
			const limit = parseInt(req.query.limit as string) || 10;
			const windowHours = parseInt(req.query.window as string) || 24;

			const trending = await this.trendingCalculator.calculateTrending(windowHours);

			res.json({
				trending: trending.slice(0, limit),
				windowHours,
				calculatedAt: new Date().toISOString(),
			});
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleGetTrendingByCategory(req: Request, res: Response): Promise<void> {
		try {
			const category = req.params.category;
			const limit = parseInt(req.query.limit as string) || 10;

			const trending = await this.trendingCalculator.getTrendingByCategory(category, limit);

			res.json({
				trending,
				category,
				calculatedAt: new Date().toISOString(),
			});
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleGetExplanation(req: AuthRequest, res: Response): Promise<void> {
		try {
			const recommendationId = req.params.id;

			// In real implementation, fetch recommendation from database
			// For now, return a mock explanation
			res.json({
				recommendationId,
				explanation: 'This workflow was recommended based on your interests',
				factors: [],
			});
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	// ==========================================================================
	// Feedback Handlers
	// ==========================================================================

	private async handleSubmitFeedback(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;
			const validated = FeedbackSchema.parse(req.body);

			const signal: FeedbackSignal = {
				userId,
				recommendationId: validated.recommendationId,
				workflowId: validated.workflowId,
				type: validated.type,
				value: validated.value,
				timestamp: new Date().toISOString(),
				context: validated.context ?? {},
			};

			// Process feedback
			if (validated.type === 'rate') {
				await this.feedbackProcessor.processExplicitFeedback(signal);
			} else {
				await this.feedbackProcessor.processImplicitFeedback(signal);
			}

			res.status(201).json({ success: true });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid feedback data', details: error.errors });
			} else {
				res.status(500).json({ error: (error as Error).message });
			}
		}
	}

	private async handleTrackView(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;
			const { workflowId, recommendationId } = req.body;

			if (!workflowId) {
				res.status(400).json({ error: 'workflowId required' });
				return;
			}

			const signal: FeedbackSignal = {
				userId,
				recommendationId: recommendationId ?? '',
				workflowId,
				type: 'view',
				timestamp: new Date().toISOString(),
				context: {},
			};

			await this.feedbackProcessor.processImplicitFeedback(signal);

			res.status(201).json({ success: true });
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleTrackTimeSpent(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;
			const { workflowId, durationMs } = req.body;

			if (!workflowId || !durationMs) {
				res.status(400).json({ error: 'workflowId and durationMs required' });
				return;
			}

			await this.feedbackProcessor.processTimeSpent(userId, workflowId, durationMs);

			res.status(201).json({ success: true });
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	// ==========================================================================
	// Preferences Handlers
	// ==========================================================================

	private async handleUpdatePreferences(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;
			const validated = PreferencesSchema.parse(req.body);

			// Update user preferences in database
			// For now, just return success
			res.json({ success: true, preferences: validated });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid preferences data', details: error.errors });
			} else {
				res.status(500).json({ error: (error as Error).message });
			}
		}
	}

	private async handleGetPreferences(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;

			// Fetch user preferences from database
			// For now, return mock data
			res.json({
				userId,
				categories: [],
				tags: [],
				complexity: 'intermediate',
			});
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleGetProfile(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId!;

			const profile = await this.personalizationEngine.buildProfile(userId);

			res.json(profile);
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	// ==========================================================================
	// A/B Testing Handlers
	// ==========================================================================

	private async handleCreateExperiment(req: AuthRequest, res: Response): Promise<void> {
		try {
			const experiment = await this.abTestManager.createExperiment(req.body);

			res.status(201).json(experiment);
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ error: 'Invalid experiment config', details: error.errors });
			} else {
				res.status(400).json({ error: (error as Error).message });
			}
		}
	}

	private async handleStartExperiment(req: AuthRequest, res: Response): Promise<void> {
		try {
			const experimentId = req.params.id;
			await this.abTestManager.startExperiment(experimentId);

			res.json({ success: true });
		} catch (error) {
			res.status(400).json({ error: (error as Error).message });
		}
	}

	private async handleStopExperiment(req: AuthRequest, res: Response): Promise<void> {
		try {
			const experimentId = req.params.id;
			await this.abTestManager.completeExperiment(experimentId);

			res.json({ success: true });
		} catch (error) {
			res.status(400).json({ error: (error as Error).message });
		}
	}

	private async handleGetExperimentResults(req: AuthRequest, res: Response): Promise<void> {
		try {
			const experimentId = req.params.id;
			const results = await this.abTestManager.getResults(experimentId);

			res.json(results);
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}

	private async handleListExperiments(req: AuthRequest, res: Response): Promise<void> {
		try {
			const status = req.query.status as 'draft' | 'active' | 'paused' | 'completed' | undefined;
			const experiments = await this.abTestManager.listExperiments(status);

			res.json({ experiments });
		} catch (error) {
			res.status(500).json({ error: (error as Error).message });
		}
	}
}

/**
 * Create and configure recommendations API router
 */
export function createRecommendationsAPI(supabase: SupabaseClient): Router {
	const api = new RecommendationsAPI(supabase);
	return api.getRouter();
}
