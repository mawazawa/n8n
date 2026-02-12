import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { CommandBus } from './commands';
import type { QueryBus } from './queries';
import type { EventStore } from './event-store';
import type { ProjectionManager } from './projections';
import type { ReplayEngine } from './replay';
import type { SnapshotStore } from './snapshots';
import type { SagaManager } from './sagas';
import type { SubscriptionManager } from './subscriptions';
import type { CausationTracker } from './causation';
import { CommandSchema, QuerySchema, ReplayOptionsSchema } from './types';

/**
 * CQRS API dependencies
 */
export interface CQRSApiDeps {
	commandBus: CommandBus;
	queryBus: QueryBus;
	eventStore: EventStore;
	projectionManager: ProjectionManager;
	replayEngine: ReplayEngine;
	snapshotStore: SnapshotStore;
	sagaManager: SagaManager;
	subscriptionManager: SubscriptionManager;
	causationTracker: CausationTracker;
}

/**
 * Create CQRS API router
 */
export function createCQRSApi(deps: CQRSApiDeps): Router {
	const router = Router();

	// =====================================================
	// Commands
	// =====================================================

	/**
	 * POST /commands - Dispatch a command
	 */
	router.post('/commands', async (req: Request, res: Response) => {
		try {
			const command = CommandSchema.parse(req.body);

			// Enrich with causation tracking
			const enrichedCommand = deps.causationTracker.enrichCommand(command);

			const result = await deps.commandBus.dispatch(enrichedCommand);

			if (result.success) {
				res.status(200).json({
					success: true,
					data: result.data,
					metadata: result.metadata,
				});
			} else {
				res.status(400).json({
					success: false,
					error: {
						message: result.error?.message,
						name: result.error?.name,
					},
				});
			}
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
					name: (error as Error).name,
				},
			});
		}
	});

	/**
	 * GET /commands - List registered commands
	 */
	router.get('/commands', async (req: Request, res: Response) => {
		try {
			const commands = deps.commandBus.getRegisteredCommands();
			res.status(200).json({
				success: true,
				data: commands,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Queries
	// =====================================================

	/**
	 * POST /queries - Execute a query
	 */
	router.post('/queries', async (req: Request, res: Response) => {
		try {
			const query = QuerySchema.parse(req.body);

			const result = await deps.queryBus.execute(query);

			if (result.success) {
				res.status(200).json({
					success: true,
					data: result.data,
					metadata: result.metadata,
				});
			} else {
				res.status(400).json({
					success: false,
					error: {
						message: result.error?.message,
						name: result.error?.name,
					},
				});
			}
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
					name: (error as Error).name,
				},
			});
		}
	});

	/**
	 * GET /queries - List registered queries
	 */
	router.get('/queries', async (req: Request, res: Response) => {
		try {
			const queries = deps.queryBus.getRegisteredQueries();
			res.status(200).json({
				success: true,
				data: queries,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * DELETE /queries/cache - Clear query cache
	 */
	router.delete('/queries/cache', async (req: Request, res: Response) => {
		try {
			const { queryType } = req.body;
			await deps.queryBus.invalidateCache(queryType);

			res.status(200).json({
				success: true,
				message: queryType
					? `Cache cleared for ${queryType}`
					: 'All query cache cleared',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Events
	// =====================================================

	/**
	 * GET /events/:aggregateId - Get events for an aggregate
	 */
	router.get('/events/:aggregateId', async (req: Request, res: Response) => {
		try {
			const { aggregateId } = req.params;
			const { fromVersion, toVersion, limit } = req.query;

			const events = await deps.eventStore.getEvents(aggregateId, {
				fromVersion: fromVersion ? parseInt(fromVersion as string) : undefined,
				toVersion: toVersion ? parseInt(toVersion as string) : undefined,
				limit: limit ? parseInt(limit as string) : undefined,
			});

			res.status(200).json({
				success: true,
				data: events,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /events/type/:eventType - Get events by type
	 */
	router.get('/events/type/:eventType', async (req: Request, res: Response) => {
		try {
			const { eventType } = req.params;
			const { limit } = req.query;

			const events = await deps.eventStore.getEventsByType(eventType, {
				limit: limit ? parseInt(limit as string) : undefined,
			});

			res.status(200).json({
				success: true,
				data: events,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /events/statistics - Get event store statistics
	 */
	router.get('/events/statistics', async (req: Request, res: Response) => {
		try {
			const statistics = await deps.eventStore.getStatistics();

			res.status(200).json({
				success: true,
				data: statistics,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Projections
	// =====================================================

	/**
	 * GET /projections - List all projections
	 */
	router.get('/projections', async (req: Request, res: Response) => {
		try {
			const projections = await deps.projectionManager.getAllProjections();

			res.status(200).json({
				success: true,
				data: projections,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /projections/:id - Get projection details
	 */
	router.get('/projections/:id', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const projection = await deps.projectionManager.getProjection(id);

			if (!projection) {
				res.status(404).json({
					success: false,
					error: {
						message: `Projection ${id} not found`,
					},
				});
				return;
			}

			res.status(200).json({
				success: true,
				data: projection,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /projections/:id/start - Start a projection
	 */
	router.post('/projections/:id/start', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			await deps.projectionManager.start(id);

			res.status(200).json({
				success: true,
				message: `Projection ${id} started`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /projections/:id/stop - Stop a projection
	 */
	router.post('/projections/:id/stop', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			await deps.projectionManager.stop(id);

			res.status(200).json({
				success: true,
				message: `Projection ${id} stopped`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /projections/:id/rebuild - Rebuild a projection
	 */
	router.post('/projections/:id/rebuild', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			await deps.projectionManager.rebuild(id);

			res.status(200).json({
				success: true,
				message: `Projection ${id} rebuilt`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Replay
	// =====================================================

	/**
	 * POST /replay - Trigger event replay
	 */
	router.post('/replay', async (req: Request, res: Response) => {
		try {
			const options = ReplayOptionsSchema.parse(req.body);

			// Dry run first to estimate
			const dryRun = await deps.replayEngine.dryRun(options);

			res.status(200).json({
				success: true,
				message: 'Replay initiated',
				data: dryRun,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /replay/analyze - Analyze events
	 */
	router.post('/replay/analyze', async (req: Request, res: Response) => {
		try {
			const options = ReplayOptionsSchema.parse(req.body);
			const analysis = await deps.replayEngine.analyzeEvents(options);

			res.status(200).json({
				success: true,
				data: analysis,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Snapshots
	// =====================================================

	/**
	 * GET /snapshots/:aggregateId - Get snapshots for an aggregate
	 */
	router.get('/snapshots/:aggregateId', async (req: Request, res: Response) => {
		try {
			const { aggregateId } = req.params;
			const snapshots = await deps.snapshotStore.getSnapshots(aggregateId);

			res.status(200).json({
				success: true,
				data: snapshots,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /snapshots/statistics - Get snapshot statistics
	 */
	router.get('/snapshots/statistics', async (req: Request, res: Response) => {
		try {
			const statistics = await deps.snapshotStore.getStatistics();

			res.status(200).json({
				success: true,
				data: statistics,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Sagas
	// =====================================================

	/**
	 * GET /sagas - List all sagas
	 */
	router.get('/sagas', async (req: Request, res: Response) => {
		try {
			const sagas = await deps.sagaManager.getAllSagas();

			res.status(200).json({
				success: true,
				data: sagas,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /sagas/:id - Get saga details
	 */
	router.get('/sagas/:id', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const saga = await deps.sagaManager.getSaga(id);

			if (!saga) {
				res.status(404).json({
					success: false,
					error: {
						message: `Saga ${id} not found`,
					},
				});
				return;
			}

			res.status(200).json({
				success: true,
				data: saga,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Subscriptions
	// =====================================================

	/**
	 * GET /subscriptions - List all subscriptions
	 */
	router.get('/subscriptions', async (req: Request, res: Response) => {
		try {
			const subscriptions = await deps.subscriptionManager.getAllSubscriptions();

			res.status(200).json({
				success: true,
				data: subscriptions,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /subscriptions/:id/pause - Pause a subscription
	 */
	router.post('/subscriptions/:id/pause', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			await deps.subscriptionManager.pause(id);

			res.status(200).json({
				success: true,
				message: `Subscription ${id} paused`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * POST /subscriptions/:id/resume - Resume a subscription
	 */
	router.post('/subscriptions/:id/resume', async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			await deps.subscriptionManager.resume(id);

			res.status(200).json({
				success: true,
				message: `Subscription ${id} resumed`,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	// =====================================================
	// Causation Tracking
	// =====================================================

	/**
	 * GET /causation/:correlationId - Get events by correlation ID
	 */
	router.get('/causation/:correlationId', async (req: Request, res: Response) => {
		try {
			const { correlationId } = req.params;
			const flow = await deps.causationTracker.debugFlow(correlationId);

			res.status(200).json({
				success: true,
				data: flow,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /causation/:correlationId/graph - Get causation graph
	 */
	router.get('/causation/:correlationId/graph', async (req: Request, res: Response) => {
		try {
			const { correlationId } = req.params;
			const dot = await deps.causationTracker.exportDot(correlationId);

			res.status(200).json({
				success: true,
				data: {
					format: 'dot',
					graph: dot,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	/**
	 * GET /causation/statistics - Get causation statistics
	 */
	router.get('/causation/statistics', async (req: Request, res: Response) => {
		try {
			const statistics = await deps.causationTracker.getStatistics();

			res.status(200).json({
				success: true,
				data: statistics,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: {
					message: (error as Error).message,
				},
			});
		}
	});

	return router;
}
