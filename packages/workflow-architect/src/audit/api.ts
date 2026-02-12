/**
 * Audit API Routes
 * REST API endpoints for querying and managing audit logs
 */

import { Router, type Request, type Response } from 'express';
import { AuditSearch } from './search.js';
import { AuditDashboard } from './dashboard.js';
import { ComplianceReporter, type ReportFormat } from './compliance.js';
import { exportToJSON, exportToCSV, exportToNDJSON } from './export.js';
import { AuditQuerySchema } from './types.js';
import type { ResourceType } from './types.js';

export interface AuditAPIConfig {
  supabaseUrl: string;
  supabaseKey: string;
  enableAuth?: boolean;
  authMiddleware?: (req: Request, res: Response, next: () => void) => void;
}

/**
 * Create audit API router
 */
export function createAuditAPI(config: AuditAPIConfig): Router {
  const router = Router();
  const search = new AuditSearch({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });
  const dashboard = new AuditDashboard({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });
  const compliance = new ComplianceReporter({
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
  });

  // Apply auth middleware if provided
  if (config.enableAuth && config.authMiddleware) {
    router.use(config.authMiddleware);
  }

  // ============================================================================
  // SEARCH & QUERY ENDPOINTS
  // ============================================================================

  /**
   * GET /audit/events
   * List audit events with filters and pagination
   */
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const query = {
        eventTypes: req.query.eventTypes ? String(req.query.eventTypes).split(',') : undefined,
        actorId: req.query.actorId as string | undefined,
        resourceType: req.query.resourceType as ResourceType | undefined,
        resourceId: req.query.resourceId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        severity: req.query.severity ? String(req.query.severity).split(',') : undefined,
        searchText: req.query.searchText as string | undefined,
        tags: req.query.tags ? String(req.query.tags).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        sortBy: (req.query.sortBy as 'timestamp' | 'severity' | 'eventType') ?? 'timestamp',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') ?? 'desc',
      };

      const result = await search.search(query);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/events/:id
   * Get a single audit event by ID
   */
  router.get('/events/:id', async (req: Request, res: Response) => {
    try {
      const event = await search.getById(req.params.id);

      if (!event) {
        res.status(404).json({
          success: false,
          error: 'Event not found',
        });
        return;
      }

      res.json({
        success: true,
        data: event,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /audit/search
   * Advanced search with complex filters
   */
  router.post('/search', async (req: Request, res: Response) => {
    try {
      const validated = AuditQuerySchema.parse(req.body);
      const result = await search.search(validated);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/resource/:type/:id
   * Get all events for a specific resource
   */
  router.get('/resource/:type/:id', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = await search.getResourceHistory(req.params.type, req.params.id, limit);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/actor/:id
   * Get all events for a specific actor (user)
   */
  router.get('/actor/:id', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = await search.getActorHistory(req.params.id, limit);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/recent
   * Get recent audit events
   */
  router.get('/recent', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = await search.getRecent(limit);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/failed
   * Get failed events
   */
  router.get('/failed', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = await search.getFailedEvents(limit);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/security
   * Get security events
   */
  router.get('/security', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = await search.getSecurityEvents(limit);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // DASHBOARD & STATISTICS ENDPOINTS
  // ============================================================================

  /**
   * GET /audit/stats
   * Get dashboard statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string ?? new Date().toISOString();

      const stats = await dashboard.getDashboardStats(startDate, endDate);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/timeline
   * Get activity timeline
   */
  router.get('/timeline', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string ?? new Date().toISOString();
      const interval = (req.query.interval as 'hour' | 'day' | 'week' | 'month') ?? 'day';

      const timeline = await dashboard.getActivityTimeline(startDate, endDate, interval);

      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/top-actors
   * Get top actors by activity
   */
  router.get('/top-actors', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string ?? new Date().toISOString();
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const actors = await dashboard.getTopActors(startDate, endDate, limit);

      res.json({
        success: true,
        data: actors,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/resource-activity
   * Get resource activity statistics
   */
  router.get('/resource-activity', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string ?? new Date().toISOString();
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const resources = await dashboard.getResourceActivity(startDate, endDate, limit);

      res.json({
        success: true,
        data: resources,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // COMPLIANCE REPORT ENDPOINTS
  // ============================================================================

  /**
   * GET /audit/reports/soc2
   * Generate SOC2 compliance report
   */
  router.get('/reports/soc2', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string ?? new Date().toISOString();
      const format = (req.query.format as ReportFormat) ?? 'json';

      const report = await compliance.generateSOC2Report(startDate, endDate, format);

      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(report);
      } else if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.send(report);
      } else {
        res.json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/reports/gdpr/:userId
   * Generate GDPR compliance report for a user
   */
  router.get('/reports/gdpr/:userId', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const format = (req.query.format as ReportFormat) ?? 'json';

      const report = await compliance.generateGDPRReport(
        req.params.userId,
        startDate,
        endDate,
        format,
      );

      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(report);
      } else if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.send(report);
      } else {
        res.json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /audit/reports/access/:type/:id
   * Generate access report for a resource
   */
  router.get('/reports/access/:type/:id', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const format = (req.query.format as ReportFormat) ?? 'json';

      const report = await compliance.generateAccessReport(
        req.params.id,
        req.params.type as ResourceType,
        startDate,
        endDate,
        format,
      );

      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(report);
      } else if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.send(report);
      } else {
        res.json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================================================
  // EXPORT ENDPOINTS
  // ============================================================================

  /**
   * POST /audit/export
   * Export audit events in various formats
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const { query, format = 'json' } = req.body;
      const validated = AuditQuerySchema.parse(query);
      const result = await search.search(validated);

      let content: string;
      let contentType: string;

      switch (format) {
        case 'csv':
          content = exportToCSV(result.events);
          contentType = 'text/csv';
          res.setHeader('Content-Disposition', 'attachment; filename=audit-events.csv');
          break;

        case 'ndjson':
          content = exportToNDJSON(result.events);
          contentType = 'application/x-ndjson';
          res.setHeader('Content-Disposition', 'attachment; filename=audit-events.ndjson');
          break;

        case 'json':
        default:
          content = exportToJSON(result.events);
          contentType = 'application/json';
          res.setHeader('Content-Disposition', 'attachment; filename=audit-events.json');
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.send(content);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
