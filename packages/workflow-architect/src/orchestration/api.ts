/**
 * Orchestration REST API
 * HTTP endpoints for team management and execution
 */

import type { Request, Response, Router } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  createTeam,
  getTeam,
  listTeams,
  addAgent,
  removeAgent,
  getTeamStatus,
  deleteTeam,
  type TeamConfig,
} from './team.js';
import { createPlanner } from './planner.js';
import { createExecutor, simpleTaskExecutor } from './executor.js';
import { createMetricsCollector } from './metrics.js';
import { getTemplate } from './templates/index.js';
import {
  type Task,
  type Agent,
  TaskSchema,
  AgentSchema,
  TaskPriority,
  TaskStatus,
} from './types.js';

/**
 * WebSocket clients
 */
const wsClients = new Map<string, WebSocket>();

/**
 * Create orchestration API router
 */
export function createOrchestrationAPI(router: Router): void {
  /**
   * POST /teams - Create a new team
   */
  router.post('/teams', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string(),
        description: z.string().optional(),
        topology: z.enum(['hierarchical', 'flat', 'mesh', 'star']),
        template: z.enum(['research', 'development', 'review']).optional(),
      });

      const data = schema.parse(req.body);

      let team;
      if (data.template) {
        // Use template
        const config = getTemplate(data.template);
        team = await createTeam({
          name: data.name,
          description: data.description,
          topology: config.team.topology,
        });

        // Add agents from template
        for (const agent of config.team.agents) {
          await addAgent(team.id, agent);
        }
      } else {
        // Create empty team
        team = await createTeam({
          name: data.name,
          description: data.description,
          topology: data.topology,
        });
      }

      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create team',
      });
    }
  });

  /**
   * GET /teams - List all teams
   */
  router.get('/teams', async (req: Request, res: Response) => {
    try {
      const teams = await listTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list teams',
      });
    }
  });

  /**
   * GET /teams/:id - Get team details
   */
  router.get('/teams/:id', async (req: Request, res: Response) => {
    try {
      const team = await getTeam(req.params.id);

      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      res.json(team);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get team',
      });
    }
  });

  /**
   * DELETE /teams/:id - Delete team
   */
  router.delete('/teams/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await deleteTeam(req.params.id);

      if (!deleted) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete team',
      });
    }
  });

  /**
   * POST /teams/:id/agents - Add agent to team
   */
  router.post('/teams/:id/agents', async (req: Request, res: Response) => {
    try {
      const agent = AgentSchema.parse(req.body);

      await addAgent(req.params.id, agent);

      res.status(201).json(agent);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to add agent',
      });
    }
  });

  /**
   * DELETE /teams/:id/agents/:agentId - Remove agent from team
   */
  router.delete('/teams/:id/agents/:agentId', async (req: Request, res: Response) => {
    try {
      await removeAgent(req.params.id, req.params.agentId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to remove agent',
      });
    }
  });

  /**
   * GET /teams/:id/status - Get team status
   */
  router.get('/teams/:id/status', async (req: Request, res: Response) => {
    try {
      const status = await getTeamStatus(req.params.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get team status',
      });
    }
  });

  /**
   * POST /teams/:id/execute - Execute task on team
   */
  router.post('/teams/:id/execute', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        task: TaskSchema,
        broadcast: z.boolean().optional(),
      });

      const data = schema.parse(req.body);
      const team = await getTeam(req.params.id);

      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      // Create execution plan
      const planner = createPlanner();
      const tasks = await planner.decompose(data.task);
      const graph = planner.createDependencyGraph(tasks);
      const plan = planner.optimizeExecution(graph, tasks);

      // Execute
      const executor = createExecutor({
        maxConcurrency: 3,
        taskExecutor: simpleTaskExecutor,
      });

      // Set up WebSocket broadcasting if requested
      if (data.broadcast) {
        executor.on('task:started', (event) => {
          broadcastToClients(req.params.id, {
            type: 'task:started',
            data: event,
          });
        });

        executor.on('task:completed', (event) => {
          broadcastToClients(req.params.id, {
            type: 'task:completed',
            data: event,
          });
        });
      }

      const result = await executor.execute(plan);

      res.json({
        executionId: result.id,
        success: result.failureCount === 0,
        tasksCompleted: result.successCount,
        tasksFailed: result.failureCount,
        duration: result.duration,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to execute task',
      });
    }
  });

  /**
   * GET /teams/:id/metrics - Get team metrics
   */
  router.get('/teams/:id/metrics', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        periodStart: z.coerce.number().optional(),
        periodEnd: z.coerce.number().optional(),
      });

      const params = schema.parse(req.query);
      const collector = createMetricsCollector();

      const metrics = await collector.getTeamMetrics(
        req.params.id,
        params.periodStart,
        params.periodEnd
      );

      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get metrics',
      });
    }
  });

  /**
   * GET /templates - List available team templates
   */
  router.get('/templates', (req: Request, res: Response) => {
    try {
      const templates = [
        {
          type: 'research',
          name: 'Research Team',
          description: 'Specialized team for research and information gathering',
        },
        {
          type: 'development',
          name: 'Development Team',
          description: 'Full-stack development team',
        },
        {
          type: 'review',
          name: 'Review Team',
          description: 'Quality assurance and code review team',
        },
      ];

      res.json(templates);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list templates',
      });
    }
  });
}

/**
 * Create WebSocket server for real-time updates
 */
export function createOrchestrationWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req) => {
    const teamId = new URL(req.url || '', 'http://localhost').searchParams.get('teamId');

    if (!teamId) {
      ws.close(1008, 'teamId required');
      return;
    }

    const clientId = crypto.randomUUID();
    wsClients.set(clientId, ws);

    console.log(`[WebSocket] Client ${clientId} connected to team ${teamId}`);

    ws.on('close', () => {
      wsClients.delete(clientId);
      console.log(`[WebSocket] Client ${clientId} disconnected`);
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Client ${clientId} error:`, error);
      wsClients.delete(clientId);
    });

    // Send initial connection message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      teamId,
      timestamp: Date.now(),
    }));
  });
}

/**
 * Broadcast message to all WebSocket clients
 */
function broadcastToClients(teamId: string, message: unknown): void {
  const payload = JSON.stringify({
    ...message,
    teamId,
    timestamp: Date.now(),
  });

  for (const ws of wsClients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Health check endpoint
 */
export function healthCheck(req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0',
  });
}
