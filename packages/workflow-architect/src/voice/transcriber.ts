/**
 * Voice Transcriber
 * Handles speech-to-text conversion using OpenAI Whisper API
 */

import type {
  Transcription,
  TranscriptionConfig,
  VoiceServiceConfig,
  AudioStreamConfig,
} from './types.js';

export class VoiceTranscriber {
  private config: VoiceServiceConfig;
  private defaultLanguage: string;
  private apiKey: string;
  private whisperModel: string;

  constructor(config: VoiceServiceConfig) {
    this.config = config;
    this.apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.whisperModel = config.whisperModel || 'whisper-1';
    this.defaultLanguage = config.defaultLanguage || 'en';

    if (!this.apiKey) {
      console.warn('OpenAI API key not provided. Transcription will not work.');
    }
  }

  /**
   * Transcribe audio from a blob
   */
  async transcribe(
    audioBlob: Blob,
    config?: TranscriptionConfig,
  ): Promise<Transcription> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for transcription');
    }

    const startTime = Date.now();
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', this.whisperModel);
    formData.append('language', config?.language || this.defaultLanguage);
    formData.append('response_format', 'verbose_json');

    if (config?.temperature !== undefined) {
      formData.append('temperature', config.temperature.toString());
    }

    if (config?.prompt) {
      formData.append('prompt', config.prompt);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Transcription failed: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = (Date.now() - startTime) / 1000;

      return this.parseTranscriptionResult(result, duration);
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  /**
   * Transcribe from a media stream (real-time)
   * This collects audio chunks and transcribes them
   */
  async transcribeStream(
    mediaStream: MediaStream,
    onTranscription: (transcription: Transcription) => void,
    streamConfig?: AudioStreamConfig,
  ): Promise<() => void> {
    const audioContext = new AudioContext({
      sampleRate: streamConfig?.sampleRate || 16000,
    });
    const source = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    const audioChunks: Float32Array[] = [];
    let isRecording = true;
    let silenceStart: number | null = null;
    const SILENCE_THRESHOLD = 0.01;
    const SILENCE_DURATION = 1500; // 1.5 seconds of silence triggers transcription

    processor.onaudioprocess = (e) => {
      if (!isRecording) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(inputData);
      audioChunks.push(chunk);

      // Detect silence
      const rms = Math.sqrt(
        chunk.reduce((sum, sample) => sum + sample * sample, 0) / chunk.length,
      );

      if (rms < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION && audioChunks.length > 0) {
          // Process accumulated audio
          this.processAudioChunks(audioChunks, onTranscription);
          audioChunks.length = 0;
          silenceStart = null;
        }
      } else {
        silenceStart = null;
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    // Return cleanup function
    return () => {
      isRecording = false;
      processor.disconnect();
      source.disconnect();
      audioContext.close();

      // Process any remaining audio
      if (audioChunks.length > 0) {
        this.processAudioChunks(audioChunks, onTranscription);
      }
    };
  }

  /**
   * Process accumulated audio chunks
   */
  private async processAudioChunks(
    chunks: Float32Array[],
    onTranscription: (transcription: Transcription) => void,
  ): Promise<void> {
    try {
      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to WAV blob
      const wavBlob = this.floatTo16BitPCM(combined);

      // Transcribe
      const transcription = await this.transcribe(wavBlob);
      onTranscription(transcription);
    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  }

  /**
   * Convert Float32Array to 16-bit PCM WAV blob
   */
  private floatTo16BitPCM(float32Array: Float32Array): Blob {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + float32Array.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, 16000, true); // sample rate
    view.setUint32(28, 16000 * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, float32Array.length * 2, true);

    // PCM data
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Parse Whisper API response into Transcription
   */
  private parseTranscriptionResult(result: any, duration: number): Transcription {
    const words = result.words?.map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence || 0.95,
    }));

    return {
      text: result.text,
      confidence: this.calculateConfidence(words),
      language: result.language || this.defaultLanguage,
      duration,
      words,
    };
  }

  /**
   * Calculate overall confidence from word-level confidence
   */
  private calculateConfidence(words?: Array<{ confidence: number }>): number {
    if (!words || words.length === 0) return 0.95; // Default confidence

    const avgConfidence =
      words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
    return avgConfidence;
  }

  /**
   * Detect language from audio
   */
  async detectLanguage(audioBlob: Blob): Promise<string> {
    // Use Whisper without specifying language
    const transcription = await this.transcribe(audioBlob, { language: '' });
    return transcription.language;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'en', // English
      'es', // Spanish
      'de', // German
      'fr', // French
      'it', // Italian
      'pt', // Portuguese
      'nl', // Dutch
      'pl', // Polish
      'ru', // Russian
      'ja', // Japanese
      'ko', // Korean
      'zh', // Chinese
    ];
  }
}
