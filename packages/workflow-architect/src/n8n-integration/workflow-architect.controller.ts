/**
 * Workflow Architect Backend Controller
 *
 * This controller provides REST API endpoints for the Workflow Architect feature.
 * It should be integrated into n8n's backend (packages/cli).
 *
 * Routes:
 * - POST   /api/architect/chat/stream  - Stream chat responses via SSE
 * - POST   /api/architect/chat         - Get complete chat response
 * - GET    /api/architect/history/:id  - Get chat history
 * - DELETE /api/architect/history/:id  - Clear chat history
 * - GET    /api/architect/health       - Health check
 */

import type { Request, Response } from 'express';
import { getWorkflowArchitectService } from './workflow-architect.service';

/**
 * Controller for Workflow Architect endpoints
 */
export class WorkflowArchitectController {
  private service = getWorkflowArchitectService();

  /**
   * Stream chat endpoint (SSE)
   * POST /api/architect/chat/stream
   */
  async streamChat(req: Request, res: Response): Promise<void> {
    try {
      const { message, threadId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (!this.service.isReady()) {
        res.status(503).json({ error: 'Workflow Architect service is not available' });
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

      // Stream events
      try {
        for await (const event of this.service.streamChatMessage(message, threadId)) {
          const data = JSON.stringify(event);
          res.write(`data: ${data}\n\n`);
        }

        // Send done marker
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('[WorkflowArchitect] Stream error:', error);
        const errorData = JSON.stringify({
          type: 'error',
          data: error instanceof Error ? error.message : 'Unknown error',
        });
        res.write(`data: ${errorData}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error('[WorkflowArchitect] Stream setup error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Chat endpoint (complete response)
   * POST /api/architect/chat
   */
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message, threadId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (!this.service.isReady()) {
        res.status(503).json({ error: 'Workflow Architect service is not available' });
        return;
      }

      const result = await this.service.chatMessage(message, threadId);
      res.json(result);
    } catch (error) {
      console.error('[WorkflowArchitect] Chat error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get chat history
   * GET /api/architect/history/:threadId
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;

      if (!threadId) {
        res.status(400).json({ error: 'Thread ID is required' });
        return;
      }

      const history = this.service.getHistory(threadId);
      res.json(history);
    } catch (error) {
      console.error('[WorkflowArchitect] Get history error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear chat history
   * DELETE /api/architect/history/:threadId
   */
  async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;

      if (!threadId) {
        res.status(400).json({ error: 'Thread ID is required' });
        return;
      }

      this.service.clearHistory(threadId);
      res.json({ success: true });
    } catch (error) {
      console.error('[WorkflowArchitect] Clear history error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Health check endpoint
   * GET /api/architect/health
   */
  async health(req: Request, res: Response): Promise<void> {
    try {
      const health = this.service.getHealth();
      res.json(health);
    } catch (error) {
      console.error('[WorkflowArchitect] Health check error:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Create and export controller instance
 */
export const workflowArchitectController = new WorkflowArchitectController();

/**
 * Router setup function for Express
 * This should be called in n8n's backend to register the routes
 */
import type { Router } from 'express';

export function registerWorkflowArchitectRoutes(router: Router): void {
  const controller = new WorkflowArchitectController();

  // Stream chat endpoint
  router.post('/architect/chat/stream', (req, res) => {
    void controller.streamChat(req, res);
  });

  // Chat endpoint
  router.post('/architect/chat', (req, res) => {
    void controller.chat(req, res);
  });

  // History endpoints
  router.get('/architect/history/:threadId', (req, res) => {
    void controller.getHistory(req, res);
  });

  router.delete('/architect/history/:threadId', (req, res) => {
    void controller.clearHistory(req, res);
  });

  // Health check
  router.get('/architect/health', (req, res) => {
    void controller.health(req, res);
  });

  console.log('[WorkflowArchitect] Routes registered');
}

/**
 * Alternative: Export route definitions for n8n's routing system
 */
export const architectRoutes = {
  streamChat: {
    method: 'POST',
    path: '/architect/chat/stream',
    handler: (req: Request, res: Response) => {
      void workflowArchitectController.streamChat(req, res);
    },
  },
  chat: {
    method: 'POST',
    path: '/architect/chat',
    handler: (req: Request, res: Response) => {
      void workflowArchitectController.chat(req, res);
    },
  },
  getHistory: {
    method: 'GET',
    path: '/architect/history/:threadId',
    handler: (req: Request, res: Response) => {
      void workflowArchitectController.getHistory(req, res);
    },
  },
  clearHistory: {
    method: 'DELETE',
    path: '/architect/history/:threadId',
    handler: (req: Request, res: Response) => {
      void workflowArchitectController.clearHistory(req, res);
    },
  },
  health: {
    method: 'GET',
    path: '/architect/health',
    handler: (req: Request, res: Response) => {
      void workflowArchitectController.health(req, res);
    },
  },
} as const;
