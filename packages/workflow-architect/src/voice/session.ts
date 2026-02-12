/**
 * Voice Session Manager
 * Manages voice sessions, wake word detection, and command history
 */

import type {
  VoiceSession,
  VoiceCommand,
  VoiceServiceConfig,
  WakeWordDetectionResult,
  Transcription,
} from './types.js';
import { VoiceTranscriber } from './transcriber.js';
import { CommandParser } from './parser.js';
import { VoiceSynthesizer } from './synthesizer.js';
import { CommandRegistry } from './commands/index.js';
import { getWorkflowHandlers, setWorkflowCommandContext } from './commands/workflow.js';
import { getNavigationHandlers, setNavigationCommandContext } from './commands/navigation.js';
import type { WorkflowCommandContext } from './commands/workflow.js';
import type { NavigationCommandContext } from './commands/navigation.js';
import { v4 as uuidv4 } from 'uuid';

export interface VoiceSessionConfig extends VoiceServiceConfig {
  enableAutoListen?: boolean;
  enableFeedback?: boolean;
  sessionTimeout?: number; // milliseconds
  maxCommandHistory?: number;
}

export class VoiceSessionManager {
  private transcriber: VoiceTranscriber;
  private parser: CommandParser;
  private synthesizer: VoiceSynthesizer;
  private commandRegistry: CommandRegistry;
  private currentSession: VoiceSession | null = null;
  private config: VoiceSessionConfig;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private wakeWordEnabled: boolean;
  private wakeWord: string;
  private isListeningForWakeWord = false;
  private mediaStream: MediaStream | null = null;
  private cleanupStream: (() => void) | null = null;

  constructor(config: VoiceSessionConfig) {
    this.config = {
      enableAutoListen: true,
      enableFeedback: true,
      sessionTimeout: 300000, // 5 minutes default
      maxCommandHistory: 100,
      ...config,
    };

    this.wakeWordEnabled = config.enableWakeWord || false;
    this.wakeWord = (config.wakeWord || 'hey n8n').toLowerCase();

    // Initialize components
    this.transcriber = new VoiceTranscriber(config);
    this.parser = new CommandParser();
    this.synthesizer = new VoiceSynthesizer({
      language: config.defaultLanguage || 'en-US',
    });
    this.commandRegistry = new CommandRegistry();

    // Register command handlers
    this.registerCommands();
  }

  /**
   * Register all command handlers
   */
  private registerCommands(): void {
    const workflowHandlers = getWorkflowHandlers();
    const navigationHandlers = getNavigationHandlers();

    this.commandRegistry.registerCommands([...workflowHandlers, ...navigationHandlers]);
  }

  /**
   * Set workflow command context
   */
  setWorkflowContext(context: WorkflowCommandContext): void {
    setWorkflowCommandContext(context);

    // Update parser context if nodes are provided
    if (context.currentWorkflow?.nodes) {
      this.parser.setContext(context.currentWorkflow.nodes);
    }
  }

  /**
   * Set navigation command context
   */
  setNavigationContext(context: NavigationCommandContext): void {
    setNavigationCommandContext(context);
  }

  /**
   * Start a new voice session
   */
  async startSession(language?: string): Promise<VoiceSession> {
    // End existing session if any
    if (this.currentSession) {
      await this.endSession();
    }

    // Create new session
    this.currentSession = {
      id: uuidv4(),
      startedAt: Date.now(),
      isListening: false,
      language: language || this.config.defaultLanguage || 'en',
      commands: [],
    };

    // Set session timeout
    if (this.config.sessionTimeout && this.config.sessionTimeout > 0) {
      this.sessionTimeout = setTimeout(() => {
        this.endSession();
      }, this.config.sessionTimeout);
    }

    // Start listening if auto-listen is enabled
    if (this.config.enableAutoListen) {
      await this.startListening();
    }

    return this.currentSession;
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    if (this.currentSession) {
      await this.stopListening();

      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
        this.sessionTimeout = null;
      }

      this.currentSession = null;
    }
  }

  /**
   * Get current session
   */
  getSession(): VoiceSession | null {
    return this.currentSession;
  }

  /**
   * Start listening for voice commands
   */
  async startListening(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession() first.');
    }

    if (this.currentSession.isListening) {
      return; // Already listening
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start transcription stream
      this.cleanupStream = await this.transcriber.transcribeStream(
        this.mediaStream,
        async (transcription) => {
          await this.handleTranscription(transcription);
        },
      );

      this.currentSession.isListening = true;

      if (this.config.enableFeedback) {
        await this.synthesizer.speak('Listening');
      }
    } catch (error) {
      console.error('Failed to start listening:', error);
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    if (this.cleanupStream) {
      this.cleanupStream();
      this.cleanupStream = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.currentSession) {
      this.currentSession.isListening = false;
    }

    this.isListeningForWakeWord = false;
  }

  /**
   * Handle transcription
   */
  private async handleTranscription(transcription: Transcription): Promise<void> {
    if (!this.currentSession) return;

    // Check for wake word if enabled
    if (this.wakeWordEnabled && !this.isListeningForWakeWord) {
      const wakeWordResult = this.detectWakeWord(transcription.text);
      if (wakeWordResult.detected) {
        this.isListeningForWakeWord = true;
        if (this.config.enableFeedback) {
          await this.synthesizer.speak('Yes?');
        }
        return;
      }
      // Ignore transcription if wake word not detected
      return;
    }

    // Parse transcription into command
    const command = this.parser.parse(transcription);

    // Add to session history
    this.addCommandToHistory(command);

    // Execute command
    await this.executeCommand(command);

    // Reset wake word listening after command execution
    if (this.wakeWordEnabled) {
      this.isListeningForWakeWord = false;
    }
  }

  /**
   * Detect wake word in text
   */
  private detectWakeWord(text: string): WakeWordDetectionResult {
    const normalizedText = text.toLowerCase().trim();
    const detected = normalizedText.includes(this.wakeWord);

    return {
      detected,
      confidence: detected ? 0.9 : 0.0,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute a voice command
   */
  async executeCommand(command: VoiceCommand): Promise<void> {
    if (!this.currentSession) return;

    try {
      // Execute command through registry
      const result = await this.commandRegistry.executeCommand(command);

      // Provide feedback
      if (this.config.enableFeedback && result.speak) {
        await this.synthesizer.speak(result.speak);
      }

      // Log result
      console.log('Command executed:', {
        command: command.type,
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      console.error('Command execution error:', error);

      if (this.config.enableFeedback) {
        await this.synthesizer.speak('Sorry, something went wrong.');
      }
    }
  }

  /**
   * Add command to session history
   */
  private addCommandToHistory(command: VoiceCommand): void {
    if (!this.currentSession) return;

    this.currentSession.commands.push(command);

    // Trim history if needed
    const maxHistory = this.config.maxCommandHistory || 100;
    if (this.currentSession.commands.length > maxHistory) {
      this.currentSession.commands = this.currentSession.commands.slice(-maxHistory);
    }

    // Reset session timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      if (this.config.sessionTimeout && this.config.sessionTimeout > 0) {
        this.sessionTimeout = setTimeout(() => {
          this.endSession();
        }, this.config.sessionTimeout);
      }
    }
  }

  /**
   * Get command history
   */
  getCommandHistory(): VoiceCommand[] {
    return this.currentSession?.commands || [];
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    if (this.currentSession) {
      this.currentSession.commands = [];
    }
  }

  /**
   * Enable wake word detection
   */
  enableWakeWord(wakeWord?: string): void {
    this.wakeWordEnabled = true;
    if (wakeWord) {
      this.wakeWord = wakeWord.toLowerCase();
    }
  }

  /**
   * Disable wake word detection
   */
  disableWakeWord(): void {
    this.wakeWordEnabled = false;
    this.isListeningForWakeWord = false;
  }

  /**
   * Set wake word
   */
  setWakeWord(wakeWord: string): void {
    this.wakeWord = wakeWord.toLowerCase();
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    sessionId: string | null;
    duration: number;
    commandCount: number;
    isListening: boolean;
    isWakeWordEnabled: boolean;
  } {
    return {
      sessionId: this.currentSession?.id || null,
      duration: this.currentSession ? Date.now() - this.currentSession.startedAt : 0,
      commandCount: this.currentSession?.commands.length || 0,
      isListening: this.currentSession?.isListening || false,
      isWakeWordEnabled: this.wakeWordEnabled,
    };
  }

  /**
   * Persist session to storage
   */
  async persistSession(): Promise<void> {
    if (!this.currentSession) return;

    try {
      const sessionData = JSON.stringify(this.currentSession);
      localStorage.setItem(`voice-session-${this.currentSession.id}`, sessionData);
    } catch (error) {
      console.error('Failed to persist session:', error);
    }
  }

  /**
   * Load session from storage
   */
  async loadSession(sessionId: string): Promise<VoiceSession | null> {
    try {
      const sessionData = localStorage.getItem(`voice-session-${sessionId}`);
      if (!sessionData) return null;

      const session = JSON.parse(sessionData) as VoiceSession;
      this.currentSession = session;
      return session;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Get transcriber instance
   */
  getTranscriber(): VoiceTranscriber {
    return this.transcriber;
  }

  /**
   * Get parser instance
   */
  getParser(): CommandParser {
    return this.parser;
  }

  /**
   * Get synthesizer instance
   */
  getSynthesizer(): VoiceSynthesizer {
    return this.synthesizer;
  }

  /**
   * Get command registry instance
   */
  getCommandRegistry(): CommandRegistry {
    return this.commandRegistry;
  }

  /**
   * Process audio file
   */
  async processAudioFile(audioBlob: Blob): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    try {
      const transcription = await this.transcriber.transcribe(audioBlob);
      await this.handleTranscription(transcription);
    } catch (error) {
      console.error('Failed to process audio file:', error);
      throw error;
    }
  }

  /**
   * Test voice system
   */
  async test(): Promise<void> {
    await this.synthesizer.test();
  }
}
