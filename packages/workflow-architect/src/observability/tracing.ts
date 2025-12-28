/**
 * OpenTelemetry Distributed Tracing
 * Provides request tracing and distributed context propagation
 */

import type { Request, Response, NextFunction } from 'express';

// OpenTelemetry types (implementation can be added when packages are installed)
interface Span {
  end(): void;
  recordException(error: Error): void;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
}

interface Tracer {
  startSpan(name: string, options?: any): Span;
}

interface TracerProvider {
  getTracer(name: string, version?: string): Tracer;
}

// Mock implementation until OpenTelemetry packages are installed
class MockSpan implements Span {
  private attributes: Record<string, string | number | boolean> = {};
  private startTime: number;
  private endTime?: number;

  constructor(private name: string) {
    this.startTime = Date.now();
  }

  end(): void {
    this.endTime = Date.now();
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Trace] ${this.name} - ${this.endTime - this.startTime}ms`, this.attributes);
    }
  }

  recordException(error: Error): void {
    this.attributes.exception = error.message;
    this.attributes['exception.type'] = error.name;
    this.attributes['exception.stacktrace'] = error.stack || '';
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setStatus(status: { code: number; message?: string }): void {
    this.attributes.status = status.code;
    if (status.message) {
      this.attributes['status.message'] = status.message;
    }
  }
}

class MockTracer implements Tracer {
  startSpan(name: string): Span {
    return new MockSpan(name);
  }
}

class MockTracerProvider implements TracerProvider {
  getTracer(name: string): Tracer {
    return new MockTracer();
  }
}

// Singleton tracer provider
let tracerProvider: TracerProvider = new MockTracerProvider();
let tracer: Tracer = tracerProvider.getTracer('workflow-architect', '0.1.0');

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(config?: {
  serviceName?: string;
  serviceVersion?: string;
  endpoint?: string;
  enabled?: boolean;
}): void {
  const {
    serviceName = 'workflow-architect',
    serviceVersion = '0.1.0',
    endpoint,
    enabled = true,
  } = config || {};

  if (!enabled) {
    console.log('[Tracing] Disabled');
    return;
  }

  // TODO: Initialize actual OpenTelemetry SDK when packages are installed
  // For now, use mock implementation
  console.log('[Tracing] Initialized (mock mode)', { serviceName, serviceVersion, endpoint });

  /*
  Example implementation with actual OpenTelemetry:

  import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
  import { Resource } from '@opentelemetry/resources';
  import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
  import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
  import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
  import { registerInstrumentations } from '@opentelemetry/instrumentation';
  import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
  import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    }),
  });

  if (endpoint) {
    const exporter = new OTLPTraceExporter({ url: endpoint });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  }

  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  tracerProvider = provider;
  tracer = provider.getTracer(serviceName, serviceVersion);
  */
}

/**
 * Get the current tracer
 */
export function getTracer(): Tracer {
  return tracer;
}

/**
 * Create a span for an operation
 */
export function startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const span = tracer.startSpan(name);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  return span;
}

/**
 * Trace an async function
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const span = startSpan(name, attributes);

  try {
    const result = await fn(span);
    span.setStatus({ code: 0 }); // OK
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace a synchronous function
 */
export function traceSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>,
): T {
  const span = startSpan(name, attributes);

  try {
    const result = fn(span);
    span.setStatus({ code: 0 }); // OK
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Express middleware for automatic tracing
 */
export function tracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const span = startSpan(`HTTP ${req.method} ${req.path}`, {
      'http.method': req.method,
      'http.url': req.url,
      'http.target': req.path,
      'http.host': req.hostname,
      'http.scheme': req.protocol,
      'http.user_agent': req.headers['user-agent'] || 'unknown',
    });

    // Add trace context to request
    (req as any).span = span;

    // End span when response finishes
    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);
      span.setAttribute('http.response_content_length', res.getHeader('content-length') || 0);

      if (res.statusCode >= 400) {
        span.setStatus({
          code: 2,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: 0 });
      }

      span.end();
    });

    // Handle errors
    res.on('error', (error: Error) => {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
    });

    next();
  };
}

/**
 * Add custom attributes to current request span
 */
export function addSpanAttributes(req: Request, attributes: Record<string, string | number | boolean>): void {
  const span = (req as any).span as Span | undefined;
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Record an exception in current request span
 */
export function recordSpanException(req: Request, error: Error): void {
  const span = (req as any).span as Span | undefined;
  if (span) {
    span.recordException(error);
  }
}

/**
 * Decorator for tracing class methods
 */
export function Trace(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return await traceAsync(
        name,
        async (span) => {
          span.setAttribute('method', propertyKey);
          span.setAttribute('class', target.constructor.name);
          return await originalMethod.apply(this, args);
        },
      );
    };

    return descriptor;
  };
}

export default {
  initializeTracing,
  getTracer,
  startSpan,
  traceAsync,
  traceSync,
  tracingMiddleware,
  addSpanAttributes,
  recordSpanException,
  Trace,
};
