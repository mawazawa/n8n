/**
 * Advanced Debugging Tools
 * Main exports for the debugger module
 */

// Types
export * from './types.js';

// Core Components
export { DebugManager, createDebugManager } from './manager.js';
export { BreakpointManager, createBreakpointManager } from './breakpoints.js';
export { StepController, createStepController } from './stepping.js';
export { WatchManager, createWatchManager } from './watch.js';
export { DataInspector, createDataInspector } from './inspector.js';

// Analysis & Visualization
export { TimelineBuilder, createTimelineBuilder } from './timeline.js';
export type { ExecutionData } from './timeline.js';
export { Profiler, createProfiler } from './profiler.js';
export { MemoryAnalyzer, createMemoryAnalyzer } from './memory.js';
export { NetworkInspector, createNetworkInspector } from './network.js';
export { DiffGenerator, createDiffGenerator } from './diff.js';

// Replay & Export
export { ReplayEngine, createReplayEngine } from './replay.js';
export { SessionExporter, createSessionExporter } from './export.js';

// WebSocket API
export { DebuggerServer, createDebuggerServer } from './api.js';
export type { DebuggerServerConfig, ConnectedDebugClient } from './api.js';

/**
 * Create a complete debugger instance with all components
 */
export function createDebugger() {
  // Create core components
  const debugManager = createDebugManager();
  const breakpointManager = createBreakpointManager(debugManager);
  const stepController = createStepController(debugManager, breakpointManager);
  const watchManager = createWatchManager(debugManager);
  const dataInspector = createDataInspector();

  // Create analysis tools
  const timelineBuilder = createTimelineBuilder();
  const profiler = createProfiler(debugManager);
  const memoryAnalyzer = createMemoryAnalyzer(debugManager);
  const networkInspector = createNetworkInspector();
  const diffGenerator = createDiffGenerator();

  // Create replay & export
  const replayEngine = createReplayEngine();
  const sessionExporter = createSessionExporter(
    debugManager,
    timelineBuilder,
    profiler,
    memoryAnalyzer,
    networkInspector,
  );

  // Create WebSocket server
  const server = createDebuggerServer(
    debugManager,
    breakpointManager,
    stepController,
    watchManager,
    dataInspector,
  );

  return {
    // Core
    debugManager,
    breakpointManager,
    stepController,
    watchManager,
    dataInspector,

    // Analysis
    timelineBuilder,
    profiler,
    memoryAnalyzer,
    networkInspector,
    diffGenerator,

    // Replay & Export
    replayEngine,
    sessionExporter,

    // Server
    server,

    /**
     * Start the debugger server
     */
    start(config?: { port?: number; path?: string }) {
      server.start(config);
    },

    /**
     * Stop the debugger server
     */
    stop() {
      server.stop();
    },
  };
}

export type Debugger = ReturnType<typeof createDebugger>;
