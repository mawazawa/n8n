/**
 * Voice Interface Module
 * Production-ready voice command system for workflow-architect
 *
 * Features:
 * - Speech-to-text with OpenAI Whisper API
 * - Natural language command parsing
 * - Text-to-speech feedback
 * - Session management with wake word detection
 * - Multi-language support
 * - Command history tracking
 */

// Core components
export { VoiceTranscriber } from './transcriber.js';
export { CommandParser } from './parser.js';
export { VoiceSynthesizer } from './synthesizer.js';
export { VoiceSessionManager } from './session.js';
export type { VoiceSessionConfig } from './session.js';

// Command handling
export { CommandRegistry, commandRegistry } from './commands/index.js';
export {
  getWorkflowHandlers,
  setWorkflowCommandContext,
  createWorkflowHandler,
  addNodeHandler,
  connectNodesHandler,
  configureNodeHandler,
  deleteNodeHandler,
} from './commands/workflow.js';
export type { WorkflowCommandContext } from './commands/workflow.js';

export {
  getNavigationHandlers,
  setNavigationCommandContext,
  navigateHandler,
  executeHandler,
  helpHandler,
  undoHandler,
  redoHandler,
} from './commands/navigation.js';
export type { NavigationCommandContext } from './commands/navigation.js';

// Types
export type {
  VoiceCommandType,
  Transcription,
  VoiceCommand,
  VoiceSession,
  SpeechSynthesisConfig,
  VoiceCommandHandler,
  VoiceCommandResult,
  TranscriptionConfig,
  VoiceServiceConfig,
  AudioStreamConfig,
  WakeWordDetectionResult,
} from './types.js';
