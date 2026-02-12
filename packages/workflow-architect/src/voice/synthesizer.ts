/**
 * Voice Synthesizer
 * Handles text-to-speech using Web Speech API
 */

import type { SpeechSynthesisConfig } from './types.js';

interface QueuedMessage {
  text: string;
  config?: SpeechSynthesisConfig;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class VoiceSynthesizer {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private queue: QueuedMessage[] = [];
  private isSpeaking = false;
  private isPaused = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private defaultConfig: SpeechSynthesisConfig;

  constructor(config?: SpeechSynthesisConfig) {
    this.defaultConfig = {
      rate: config?.rate || 1.0,
      pitch: config?.pitch || 1.0,
      volume: config?.volume || 1.0,
      language: config?.language || 'en-US',
      voice: config?.voice,
    };

    this.initialize();
  }

  /**
   * Initialize speech synthesis
   */
  private initialize(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;

      // Load voices
      this.loadVoices();

      // Some browsers require this event to load voices
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
    } else {
      console.warn('Speech Synthesis API not supported in this environment');
    }
  }

  /**
   * Load available voices
   */
  private loadVoices(): void {
    if (this.synth) {
      this.voices = this.synth.getVoices();
    }
  }

  /**
   * Speak text
   */
  async speak(text: string, config?: SpeechSynthesisConfig): Promise<void> {
    if (!this.synth) {
      console.warn('Speech synthesis not available');
      return;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ text, config, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process message queue
   */
  private processQueue(): void {
    if (this.isSpeaking || this.queue.length === 0) {
      return;
    }

    const message = this.queue.shift();
    if (!message) return;

    this.speakNow(message.text, message.config)
      .then(message.resolve)
      .catch(message.reject);
  }

  /**
   * Speak immediately (internal)
   */
  private async speakNow(text: string, config?: SpeechSynthesisConfig): Promise<void> {
    if (!this.synth) {
      throw new Error('Speech synthesis not available');
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Apply configuration
      const finalConfig = { ...this.defaultConfig, ...config };
      utterance.rate = finalConfig.rate || 1.0;
      utterance.pitch = finalConfig.pitch || 1.0;
      utterance.volume = finalConfig.volume || 1.0;
      utterance.lang = finalConfig.language || 'en-US';

      // Set voice if specified
      if (finalConfig.voice) {
        const voice = this.getVoiceByName(finalConfig.voice);
        if (voice) {
          utterance.voice = voice;
        }
      } else {
        // Use default voice for language
        const voice = this.getDefaultVoiceForLanguage(utterance.lang);
        if (voice) {
          utterance.voice = voice;
        }
      }

      // Set up event handlers
      utterance.onstart = () => {
        this.isSpeaking = true;
        this.currentUtterance = utterance;
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.processQueue(); // Process next message
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.processQueue(); // Process next message
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      // Speak
      this.synth!.speak(utterance);
    });
  }

  /**
   * Stop speaking
   */
  stop(): void {
    if (this.synth) {
      this.synth.cancel();
      this.queue = [];
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
    }
  }

  /**
   * Pause speaking
   */
  pause(): void {
    if (this.synth && this.isSpeaking && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  /**
   * Resume speaking
   */
  resume(): void {
    if (this.synth && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  /**
   * Check if currently speaking
   */
  getSpeakingStatus(): { isSpeaking: boolean; isPaused: boolean; queueLength: number } {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      queueLength: this.queue.length,
    };
  }

  /**
   * Get voice by name
   */
  private getVoiceByName(name: string): SpeechSynthesisVoice | null {
    return this.voices.find((voice) => voice.name === name) || null;
  }

  /**
   * Get default voice for language
   */
  private getDefaultVoiceForLanguage(language: string): SpeechSynthesisVoice | null {
    // Try to find a voice that matches the language
    const languageCode = language.split('-')[0];
    const matchingVoices = this.voices.filter((voice) => voice.lang.startsWith(languageCode));

    if (matchingVoices.length === 0) {
      return null;
    }

    // Prefer default voices
    const defaultVoice = matchingVoices.find((voice) => voice.default);
    if (defaultVoice) {
      return defaultVoice;
    }

    // Return first matching voice
    return matchingVoices[0];
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  /**
   * Get voices for specific language
   */
  getVoicesForLanguage(language: string): SpeechSynthesisVoice[] {
    const languageCode = language.split('-')[0];
    return this.voices.filter((voice) => voice.lang.startsWith(languageCode));
  }

  /**
   * Set default configuration
   */
  setDefaultConfig(config: Partial<SpeechSynthesisConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): SpeechSynthesisConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Test speech with sample text
   */
  async test(text?: string): Promise<void> {
    const testText = text || 'Hello, I am your workflow assistant. How can I help you today?';
    await this.speak(testText);
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    // Reject all pending messages
    for (const message of this.queue) {
      message.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if synthesis is available
   */
  isAvailable(): boolean {
    return this.synth !== null && this.voices.length > 0;
  }

  /**
   * Get synthesis status
   */
  getStatus(): {
    available: boolean;
    speaking: boolean;
    paused: boolean;
    queueSize: number;
    voicesCount: number;
  } {
    return {
      available: this.isAvailable(),
      speaking: this.isSpeaking,
      paused: this.isPaused,
      queueSize: this.queue.length,
      voicesCount: this.voices.length,
    };
  }
}
