/**
 * Natural Language Query REST API
 * Express router with NLQ endpoints
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  NLQuerySchema,
  FeedbackSchema,
  SuggestionRequestSchema,
  HistoryRequestSchema,
} from './types';
import type { NLQueryService } from './index';

/**
 * API configuration
 */
export interface NLQAPIConfig {
  enableStreaming?: boolean;
  enableAnalytics?: boolean;
  requireAuth?: boolean;
}

/**
 * Create NLQ API router
 */
export function createNLQAPI(service: NLQueryService, config: NLQAPIConfig = {}): Router {
  const router = Router();

  /**
   * POST /nlq/query - Execute natural language query
   */
  router.post('/query', async (req: Request, res: Response) => {
    try {
      // Validate input
      const input = NLQuerySchema.parse(req.body);

      // Get user ID from request (authentication middleware should set this)
      const userId = (req as Request & { userId?: string }).userId || 'anonymous';
      const sessionId = req.headers['x-session-id'] as string | undefined;

      // Execute query
      const result = await service.query({
        text: input.text,
        context: input.context as Parameters<typeof service.query>[0]['context'],
        userId,
        sessionId,
        timestamp: input.timestamp,
      });

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error('Query execution error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * POST /nlq/query/stream - Execute query with streaming response
   */
  if (config.enableStreaming) {
    router.post('/query/stream', async (req: Request, res: Response) => {
      try {
        const input = NLQuerySchema.parse(req.body);
        const userId = (req as Request & { userId?: string }).userId || 'anonymous';
        const sessionId = req.headers['x-session-id'] as string | undefined;

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Stream query execution
        await service.queryStream(
          {
            text: input.text,
            context: input.context as Parameters<typeof service.query>[0]['context'],
            userId,
            sessionId,
            timestamp: input.timestamp,
          },
          (chunk) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          },
        );

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('Streaming query error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Query failed' })}\n\n`);
        res.end();
      }
    });
  }

  /**
   * POST /nlq/suggest - Get query suggestions
   */
  router.post('/suggest', async (req: Request, res: Response) => {
    try {
      const input = SuggestionRequestSchema.parse(req.body);
      const userId = (req as Request & { userId?: string }).userId;

      const suggestions = await service.getSuggestions(input.partial, userId);

      res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      console.error('Suggestion error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * GET /nlq/history - Get query history
   */
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const history = await service.getHistory(userId, limit, offset);

      res.json({
        success: true,
        history,
      });
    } catch (error) {
      console.error('History error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /nlq/feedback - Submit feedback
   */
  router.post('/feedback', async (req: Request, res: Response) => {
    try {
      const feedback = FeedbackSchema.parse(req.body);
      const userId = (req as Request & { userId?: string }).userId;

      // Verify user owns the query
      if (userId && feedback.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Cannot submit feedback for another user',
        });
        return;
      }

      await service.submitFeedback({
        queryId: feedback.queryId,
        userId: feedback.userId,
        rating: feedback.rating,
        helpful: feedback.helpful,
        comment: feedback.comment,
        timestamp: feedback.timestamp,
      });

      res.json({
        success: true,
        message: 'Feedback submitted successfully',
      });
    } catch (error) {
      console.error('Feedback error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid feedback',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * GET /nlq/popular - Get popular queries
   */
  router.get('/popular', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const popular = await service.getPopularQueries(limit);

      res.json({
        success: true,
        queries: popular,
      });
    } catch (error) {
      console.error('Popular queries error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /nlq/analytics - Get analytics report
   */
  if (config.enableAnalytics) {
    router.get('/analytics', async (req: Request, res: Response) => {
      try {
        // Parse time range from query params
        const start = req.query.start ? new Date(req.query.start as string) : undefined;
        const end = req.query.end ? new Date(req.query.end as string) : undefined;

        const timeRange = start && end ? { start, end } : undefined;

        const report = await service.getAnalyticsReport(timeRange);

        res.json({
          success: true,
          report,
        });
      } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * GET /nlq/favorites - Get favorite queries
   */
  router.get('/favorites', async (req: Request, res: Response) => {
    try {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const favorites = await service.getFavorites(userId, limit);

      res.json({
        success: true,
        favorites,
      });
    } catch (error) {
      console.error('Favorites error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /nlq/favorites/:queryId - Add query to favorites
   */
  router.post('/favorites/:queryId', async (req: Request, res: Response) => {
    try {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { queryId } = req.params;
      const success = await service.addFavorite(userId, queryId);

      if (success) {
        res.json({
          success: true,
          message: 'Added to favorites',
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Query not found',
        });
      }
    } catch (error) {
      console.error('Add favorite error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /nlq/favorites/:queryId - Remove query from favorites
   */
  router.delete('/favorites/:queryId', async (req: Request, res: Response) => {
    try {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { queryId } = req.params;
      const success = await service.removeFavorite(userId, queryId);

      if (success) {
        res.json({
          success: true,
          message: 'Removed from favorites',
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Query not found',
        });
      }
    } catch (error) {
      console.error('Remove favorite error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /nlq/health - Health check
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
