/**
 * Workflow Generator REST API
 * Express routes for workflow generation endpoints
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { WorkflowGenerator } from './index';
import {
  GenerationRequestSchema,
  GenerationFeedbackSchema,
  type GenerationRequest,
  type RefinementRequest,
  type APIResponse,
} from './types';
import { explainWorkflow } from './explanation';
import { generateAlternatives } from './alternatives';
import { ErrorCode, WorkflowArchitectError, wrapError } from '../errors';

export function createGeneratorAPI(): Router {
  const router = Router();
  const generator = new WorkflowGenerator();

  /**
   * POST /generate
   * Generate workflow from description
   */
  router.post('/generate', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // Validate request
      const request = GenerationRequestSchema.parse(req.body);

      // Generate workflow
      const result = await generator.generate(request);

      // Send response
      const response: APIResponse<typeof result> = {
        success: true,
        data: result,
        metadata: {
          requestId: generateRequestId(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      handleError(res, error, startTime);
    }
  });

  /**
   * POST /generate/refine
   * Refine existing generation with feedback
   */
  router.post('/generate/refine', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // Validate request
      const schema = z.object({
        workflow: z.any(), // WorkflowBlueprint
        feedback: z.array(GenerationFeedbackSchema),
        iteration: z.number().int().min(0).default(0),
      });

      const request: RefinementRequest = schema.parse(req.body);

      // Refine workflow
      const refined = await generator.refine(request);

      const response: APIResponse<typeof refined> = {
        success: true,
        data: refined,
        metadata: {
          requestId: generateRequestId(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      handleError(res, error, startTime);
    }
  });

  /**
   * POST /generate/explain
   * Explain a workflow in natural language
   */
  router.post('/generate/explain', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { workflow } = req.body;

      if (!workflow) {
        throw new WorkflowArchitectError(
          'Workflow is required',
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const explanation = await explainWorkflow(workflow);

      const response: APIResponse<typeof explanation> = {
        success: true,
        data: explanation,
        metadata: {
          requestId: generateRequestId(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      handleError(res, error, startTime);
    }
  });

  /**
   * POST /generate/alternatives
   * Get alternative approaches for the same goal
   */
  router.post('/generate/alternatives', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { intent, count } = req.body;

      if (!intent) {
        throw new WorkflowArchitectError(
          'Intent is required',
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const alternatives = await generateAlternatives(intent, count);

      const response: APIResponse<typeof alternatives> = {
        success: true,
        data: alternatives,
        metadata: {
          requestId: generateRequestId(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      handleError(res, error, startTime);
    }
  });

  /**
   * GET /generate/examples
   * Get example prompts for inspiration
   */
  router.get('/generate/examples', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const examples = [
        {
          description: 'Send an email notification when a form is submitted via webhook',
          category: 'notification',
          difficulty: 'beginner',
        },
        {
          description:
            'Fetch data from an API every hour and store it in a Google Sheet',
          category: 'automation',
          difficulty: 'beginner',
        },
        {
          description:
            'Process CSV file uploads, validate data, and send Slack alerts for errors',
          category: 'data-processing',
          difficulty: 'intermediate',
        },
        {
          description:
            'Build an AI agent that answers customer questions using a knowledge base',
          category: 'ai-agent',
          difficulty: 'advanced',
        },
        {
          description:
            'Monitor multiple APIs for changes and trigger different actions based on conditions',
          category: 'monitoring',
          difficulty: 'intermediate',
        },
      ];

      const response: APIResponse<typeof examples> = {
        success: true,
        data: examples,
        metadata: {
          requestId: generateRequestId(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      handleError(res, error, startTime);
    }
  });

  /**
   * GET /generate/health
   * Health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
      },
    });
  });

  return router;
}

// ============================================
// Helper Functions
// ============================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function handleError(res: Response, error: unknown, startTime: number): void {
  if (error instanceof WorkflowArchitectError) {
    const statusCode = getStatusCode(error.code);

    const response: APIResponse<never> = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.context,
      },
      metadata: {
        requestId: generateRequestId(),
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      },
    };

    res.status(statusCode).json(response);
  } else if (error instanceof z.ZodError) {
    const response: APIResponse<never> = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          errors: error.errors,
        },
      },
      metadata: {
        requestId: generateRequestId(),
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      },
    };

    res.status(400).json(response);
  } else {
    const wrappedError = wrapError(error);

    const response: APIResponse<never> = {
      success: false,
      error: {
        code: wrappedError.code,
        message: wrappedError.message,
      },
      metadata: {
        requestId: generateRequestId(),
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      },
    };

    res.status(500).json(response);
  }
}

function getStatusCode(errorCode: ErrorCode): number {
  switch (errorCode) {
    case ErrorCode.VALIDATION_ERROR:
      return 400;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.N8N_AUTH:
      return 401;
    case ErrorCode.MODEL_RATE_LIMIT:
      return 429;
    case ErrorCode.AGENT_TIMEOUT:
    case ErrorCode.MODEL_TIMEOUT:
      return 504;
    default:
      return 500;
  }
}

/**
 * Mount the generator API on an Express app
 */
export function mountGeneratorAPI(app: Router, basePath = '/api/generator'): void {
  app.use(basePath, createGeneratorAPI());
}
