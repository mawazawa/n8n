/**
 * Voice Interface Type Definitions
 * Defines types for voice commands, transcription, and speech synthesis
 */

export type VoiceCommandType =
  | 'create_workflow'
  | 'add_node'
  | 'connect_nodes'
  | 'configure_node'
  | 'delete_node'
  | 'navigate'
  | 'execute'
  | 'help'
  | 'undo'
  | 'redo';

export interface Transcription {
  text: string;
  confidence: number;
  language: string;
  duration: number;
  words?: Array<{ word: string; start: number; end: number; confidence: number }>;
}

export interface VoiceCommand {
  type: VoiceCommandType;
  rawText: string;
  intent: string;
  entities: Record<string, string | string[]>;
  confidence: number;
  timestamp: number;
}

export interface VoiceSession {
  id: string;
  startedAt: number;
  isListening: boolean;
  language: string;
  commands: VoiceCommand[];
}

export interface SpeechSynthesisConfig {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: string;
}

export interface VoiceCommandHandler {
  type: VoiceCommandType;
  patterns: string[]; // Regex patterns to match
  handler: (command: VoiceCommand) => Promise<VoiceCommandResult>;
}

export interface VoiceCommandResult {
  success: boolean;
  message: string;
  speak?: string; // Text to speak back
  action?: Record<string, unknown>;
}

export interface TranscriptionConfig {
  language?: string;
  model?: string;
  temperature?: number;
  prompt?: string;
}

export interface VoiceServiceConfig {
  openaiApiKey?: string;
  whisperModel?: 'whisper-1';
  defaultLanguage?: string;
  enableWakeWord?: boolean;
  wakeWord?: string;
}

export interface AudioStreamConfig {
  sampleRate?: number;
  channels?: number;
  encoding?: string;
}

export interface WakeWordDetectionResult {
  detected: boolean;
  confidence: number;
  timestamp: number;
}
