/**
 * Health Check Endpoint
 * Returns status of all dependencies
 */

import type { Request, Response } from 'express';

export interface DependencyStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies: DependencyStatus[];
}

const startTime = Date.now();

/**
 * Check n8n connectivity
 */
async function checkN8n(): Promise<DependencyStatus> {
  const baseUrl = process.env.N8N_BASE_URL || 'http://localhost:5678';
  const start = Date.now();

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });

    return {
      name: 'n8n',
      status: response.ok ? 'healthy' : 'degraded',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'n8n',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check Supabase connectivity
 */
async function checkSupabase(): Promise<DependencyStatus> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const start = Date.now();

  if (!supabaseUrl) {
    return {
      name: 'supabase',
      status: 'unhealthy',
      message: 'SUPABASE_URL not configured',
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY || '',
      },
      signal: AbortSignal.timeout(5000),
    });

    return {
      name: 'supabase',
      status: response.ok ? 'healthy' : 'degraded',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'supabase',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check AI model availability
 */
async function checkAIModel(): Promise<DependencyStatus> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return {
      name: 'ai-model',
      status: 'unhealthy',
      message: 'ANTHROPIC_API_KEY not configured',
    };
  }

  // Just check if key is present and valid format
  if (!anthropicKey.startsWith('sk-ant-')) {
    return {
      name: 'ai-model',
      status: 'degraded',
      message: 'API key format may be invalid',
    };
  }

  return {
    name: 'ai-model',
    status: 'healthy',
  };
}

/**
 * Perform full health check
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const dependencies = await Promise.all([
    checkN8n(),
    checkSupabase(),
    checkAIModel(),
  ]);

  // Determine overall status
  const hasUnhealthy = dependencies.some((d) => d.status === 'unhealthy');
  const hasDegraded = dependencies.some((d) => d.status === 'degraded');

  const status = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: Date.now() - startTime,
    dependencies,
  };
}

/**
 * Express health check handler
 */
export async function healthHandler(_req: Request, res: Response) {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
}

/**
 * Express liveness probe (simple)
 */
export function livenessHandler(_req: Request, res: Response) {
  res.status(200).json({ status: 'ok' });
}

/**
 * Express readiness probe
 */
export async function readinessHandler(_req: Request, res: Response) {
  const health = await getHealthStatus();
  const ready = health.status !== 'unhealthy';
  res.status(ready ? 200 : 503).json({ ready, status: health.status });
}
