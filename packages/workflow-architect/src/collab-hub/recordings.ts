import { EventEmitter } from 'events';
import type { Recording, RecordingEvent } from './types';
import { RecordingSchema, RecordingEventSchema } from './types';

interface RecordingManagerOptions {
	maxRecordings?: number;
	maxEvents?: number;
	captureAudio?: boolean;
	captureVideo?: boolean;
}

/**
 * Session recording manager with event and media capture
 */
export class RecordingManager extends EventEmitter {
	private recordings: Map<string, Recording>;
	private activeRecording: Recording | null;
	private mediaRecorder: MediaRecorder | null;
	private recordedChunks: Blob[];
	private options: Required<RecordingManagerOptions>;

	constructor(options: RecordingManagerOptions = {}) {
		super();
		this.recordings = new Map();
		this.activeRecording = null;
		this.mediaRecorder = null;
		this.recordedChunks = [];
		this.options = {
			maxRecordings: options.maxRecordings ?? 100,
			maxEvents: options.maxEvents ?? 100000,
			captureAudio: options.captureAudio ?? false,
			captureVideo: options.captureVideo ?? false,
		};
	}

	/**
	 * Start a new recording
	 */
	async start(participants: string[] = []): Promise<Recording> {
		if (this.activeRecording) {
			throw new Error('Recording already in progress');
		}

		if (this.recordings.size >= this.options.maxRecordings) {
			throw new Error('Maximum recordings limit reached');
		}

		const recording: Recording = RecordingSchema.parse({
			id: this.generateId(),
			startTime: new Date(),
			participants,
			events: [],
		});

		this.activeRecording = recording;
		this.recordings.set(recording.id, recording);

		// Start media recording if enabled
		if (this.options.captureAudio || this.options.captureVideo) {
			await this.startMediaRecording();
		}

		this.emit('recording_started', { recordingId: recording.id });

		return recording;
	}

	/**
	 * Stop the active recording
	 */
	async stop(): Promise<Recording> {
		if (!this.activeRecording) {
			throw new Error('No active recording');
		}

		const recording = this.activeRecording;
		recording.endTime = new Date();
		recording.duration = recording.endTime.getTime() - recording.startTime.getTime();

		// Stop media recording
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			await this.stopMediaRecording();
		}

		this.recordings.set(recording.id, recording);
		this.activeRecording = null;

		this.emit('recording_stopped', { recording });

		return recording;
	}

	/**
	 * Capture an event
	 */
	captureEvent(type: RecordingEvent['type'], data: Record<string, unknown>): void {
		if (!this.activeRecording) {
			return;
		}

		if (this.activeRecording.events.length >= this.options.maxEvents) {
			// Remove oldest event
			this.activeRecording.events.shift();
		}

		const timestamp = Date.now() - this.activeRecording.startTime.getTime();
		const event: RecordingEvent = RecordingEventSchema.parse({
			type,
			timestamp,
			data,
		});

		this.activeRecording.events.push(event);
		this.emit('event_captured', { event });
	}

	/**
	 * Start media recording (audio/video)
	 */
	private async startMediaRecording(): Promise<void> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: this.options.captureAudio,
				video: this.options.captureVideo,
			});

			this.recordedChunks = [];
			this.mediaRecorder = new MediaRecorder(stream);

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.recordedChunks.push(event.data);
				}
			};

			this.mediaRecorder.onstop = () => {
				this.processRecordedMedia();
			};

			this.mediaRecorder.start(100); // Capture in 100ms chunks
		} catch (error) {
			this.emit('error', { error, message: 'Failed to start media recording' });
		}
	}

	/**
	 * Stop media recording
	 */
	private stopMediaRecording(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.mediaRecorder) {
				resolve();
				return;
			}

			this.mediaRecorder.onstop = () => {
				this.processRecordedMedia();
				resolve();
			};

			this.mediaRecorder.stop();

			// Stop all tracks
			this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
		});
	}

	/**
	 * Process recorded media
	 */
	private processRecordedMedia(): void {
		if (!this.activeRecording || this.recordedChunks.length === 0) {
			return;
		}

		const blob = new Blob(this.recordedChunks, {
			type: this.options.captureVideo ? 'video/webm' : 'audio/webm',
		});

		// Create object URL for the recording
		const url = URL.createObjectURL(blob);

		if (this.options.captureVideo) {
			this.activeRecording.videoUrl = url;
		} else if (this.options.captureAudio) {
			this.activeRecording.audioUrl = url;
		}

		this.recordedChunks = [];
	}

	/**
	 * Get recording by ID
	 */
	getRecording(recordingId: string): Recording | undefined {
		return this.recordings.get(recordingId);
	}

	/**
	 * Get all recordings
	 */
	getAllRecordings(): Recording[] {
		return Array.from(this.recordings.values()).sort(
			(a, b) => b.startTime.getTime() - a.startTime.getTime()
		);
	}

	/**
	 * Get recordings for a participant
	 */
	getParticipantRecordings(userId: string): Recording[] {
		return Array.from(this.recordings.values())
			.filter((r) => r.participants.includes(userId))
			.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
	}

	/**
	 * Delete a recording
	 */
	async delete(recordingId: string): Promise<void> {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			throw new Error('Recording not found');
		}

		// Revoke object URLs
		if (recording.audioUrl) {
			URL.revokeObjectURL(recording.audioUrl);
		}
		if (recording.videoUrl) {
			URL.revokeObjectURL(recording.videoUrl);
		}

		this.recordings.delete(recordingId);
		this.emit('recording_deleted', { recordingId });
	}

	/**
	 * Export recording as JSON
	 */
	exportRecording(recordingId: string): string {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			throw new Error('Recording not found');
		}

		return JSON.stringify(recording, null, 2);
	}

	/**
	 * Import recording from JSON
	 */
	importRecording(json: string): Recording {
		const recording = RecordingSchema.parse(JSON.parse(json));
		this.recordings.set(recording.id, recording);
		this.emit('recording_imported', { recordingId: recording.id });
		return recording;
	}

	/**
	 * Get active recording
	 */
	getActiveRecording(): Recording | null {
		return this.activeRecording;
	}

	/**
	 * Check if recording is in progress
	 */
	isRecording(): boolean {
		return this.activeRecording !== null;
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Clear all recordings
	 */
	clear(): void {
		// Revoke all object URLs
		for (const recording of this.recordings.values()) {
			if (recording.audioUrl) {
				URL.revokeObjectURL(recording.audioUrl);
			}
			if (recording.videoUrl) {
				URL.revokeObjectURL(recording.videoUrl);
			}
		}

		this.recordings.clear();
		this.emit('recordings_cleared');
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.activeRecording) {
			this.stop();
		}
		this.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a recording manager instance
 */
export function createRecordingManager(options?: RecordingManagerOptions): RecordingManager {
	return new RecordingManager(options);
}
