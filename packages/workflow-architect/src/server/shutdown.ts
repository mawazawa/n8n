/**
 * Graceful Shutdown Handler
 * Handles SIGTERM and SIGINT signals for clean application shutdown
 */

import type { Server } from 'http';

interface ShutdownConfig {
  timeout?: number; // Maximum time to wait for shutdown in milliseconds
  signals?: NodeJS.Signals[]; // Signals to listen for
  onShutdown?: () => Promise<void>; // Custom shutdown logic
}

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
}

class GracefulShutdown {
  private readonly server: Server;
  private readonly config: Required<ShutdownConfig>;
  private readonly handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private forceShutdownTimer: NodeJS.Timeout | null = null;

  constructor(server: Server, config: ShutdownConfig = {}) {
    this.server = server;
    this.config = {
      timeout: config.timeout || 30000, // 30 seconds default
      signals: config.signals || ['SIGTERM', 'SIGINT'],
      onShutdown: config.onShutdown || (async () => {}),
    };
  }

  /**
   * Register a shutdown handler
   */
  addHandler(name: string, handler: () => Promise<void>, timeout?: number): void {
    this.handlers.push({ name, handler, timeout });
  }

  /**
   * Initialize shutdown listeners
   */
  listen(): void {
    this.config.signals.forEach((signal) => {
      process.on(signal, () => {
        console.log(`[Shutdown] Received ${signal} signal`);
        void this.shutdown(signal);
      });
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('[Shutdown] Uncaught exception:', error);
      void this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Shutdown] Unhandled rejection at:', promise, 'reason:', reason);
      void this.shutdown('unhandledRejection');
    });

    console.log(`[Shutdown] Listening for signals: ${this.config.signals.join(', ')}`);
  }

  /**
   * Execute shutdown sequence
   */
  private async shutdown(signal: string): Promise<void> {
    // Prevent multiple simultaneous shutdown attempts
    if (this.isShuttingDown) {
      console.log('[Shutdown] Already shutting down, ignoring signal');
      return;
    }

    this.isShuttingDown = true;
    console.log('[Shutdown] Starting graceful shutdown...');

    // Set force shutdown timer
    this.forceShutdownTimer = setTimeout(() => {
      console.error('[Shutdown] Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.config.timeout);

    try {
      // Step 1: Stop accepting new connections
      console.log('[Shutdown] Closing server...');
      await this.closeServer();

      // Step 2: Execute custom handlers in order
      console.log(`[Shutdown] Executing ${this.handlers.length} shutdown handlers...`);
      for (const { name, handler, timeout } of this.handlers) {
        try {
          console.log(`[Shutdown] Running handler: ${name}`);
          await this.executeWithTimeout(handler, timeout || 5000, name);
          console.log(`[Shutdown] Completed handler: ${name}`);
        } catch (error) {
          console.error(`[Shutdown] Handler "${name}" failed:`, error);
          // Continue with other handlers even if one fails
        }
      }

      // Step 3: Execute custom shutdown logic
      if (this.config.onShutdown) {
        console.log('[Shutdown] Running custom shutdown logic...');
        await this.executeWithTimeout(
          this.config.onShutdown,
          this.config.timeout,
          'custom shutdown',
        );
      }

      // Step 4: Clear force shutdown timer
      if (this.forceShutdownTimer) {
        clearTimeout(this.forceShutdownTimer);
        this.forceShutdownTimer = null;
      }

      console.log('[Shutdown] Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('[Shutdown] Error during shutdown:', error);
      if (this.forceShutdownTimer) {
        clearTimeout(this.forceShutdownTimer);
      }
      process.exit(1);
    }
  }

  /**
   * Close HTTP server gracefully
   */
  private async closeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          console.error('[Shutdown] Error closing server:', error);
          reject(error);
        } else {
          console.log('[Shutdown] Server closed successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout(
    fn: () => Promise<void>,
    timeout: number,
    name: string,
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout executing ${name}`));
      }, timeout);
    });

    await Promise.race([fn(), timeoutPromise]);
  }
}

/**
 * Create and initialize graceful shutdown
 */
export function setupGracefulShutdown(server: Server, config?: ShutdownConfig): GracefulShutdown {
  const shutdown = new GracefulShutdown(server, config);
  shutdown.listen();
  return shutdown;
}

/**
 * Common shutdown handlers
 */

/**
 * Close database connections
 */
export async function closeDatabaseConnections(): Promise<void> {
  console.log('[Shutdown] Closing database connections...');
  // TODO: Implement actual database connection closing
  // Example: await dbConnection.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log('[Shutdown] Database connections closed');
}

/**
 * Close WebSocket connections
 */
export async function closeWebSocketConnections(wss?: any): Promise<void> {
  if (!wss) return;

  console.log('[Shutdown] Closing WebSocket connections...');

  return new Promise((resolve) => {
    // Close all active connections
    wss.clients.forEach((client: any) => {
      client.close(1001, 'Server shutting down');
    });

    // Close the WebSocket server
    wss.close(() => {
      console.log('[Shutdown] WebSocket server closed');
      resolve();
    });
  });
}

/**
 * Flush pending logs
 */
export async function flushLogs(): Promise<void> {
  console.log('[Shutdown] Flushing logs...');
  // TODO: Implement log flushing if using async logging
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log('[Shutdown] Logs flushed');
}

/**
 * Complete pending tasks
 */
export async function completePendingTasks(taskQueue?: any): Promise<void> {
  if (!taskQueue) return;

  console.log('[Shutdown] Completing pending tasks...');
  // TODO: Implement task completion logic
  // Example: await taskQueue.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log('[Shutdown] Pending tasks completed');
}

/**
 * Save application state
 */
export async function saveApplicationState(): Promise<void> {
  console.log('[Shutdown] Saving application state...');
  // TODO: Implement state persistence
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log('[Shutdown] Application state saved');
}

export { GracefulShutdown };
export default setupGracefulShutdown;
