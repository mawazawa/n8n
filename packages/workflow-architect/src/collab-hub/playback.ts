import { EventEmitter } from 'events';
import type { Recording, RecordingEvent } from './types';

interface PlaybackEngineOptions {
	autoPlay?: boolean;
	defaultSpeed?: number;
}

/**
 * Recording playback engine with speed control and timeline scrubbing
 */
export class PlaybackEngine extends EventEmitter {
	private recording: Recording | null;
	private currentIndex: number;
	private isPlaying: boolean;
	private isPaused: boolean;
	private playbackSpeed: number;
	private playbackTimer: NodeJS.Timeout | null;
	private startTimestamp: number;
	private pausedTimestamp: number;
	private options: Required<PlaybackEngineOptions>;

	constructor(options: PlaybackEngineOptions = {}) {
		super();
		this.recording = null;
		this.currentIndex = 0;
		this.isPlaying = false;
		this.isPaused = false;
		this.playbackTimer = null;
		this.startTimestamp = 0;
		this.pausedTimestamp = 0;
		this.options = {
			autoPlay: options.autoPlay ?? false,
			defaultSpeed: options.defaultSpeed ?? 1.0,
		};
		this.playbackSpeed = this.options.defaultSpeed;
	}

	/**
	 * Load and start playing a recording
	 */
	async play(recordingId: string, recording: Recording): Promise<void> {
		if (this.isPlaying) {
			this.stop();
		}

		this.recording = recording;
		this.currentIndex = 0;
		this.isPlaying = true;
		this.isPaused = false;
		this.startTimestamp = Date.now();

		this.emit('playback_started', { recordingId });

		if (this.options.autoPlay) {
			this.playNextEvent();
		}
	}

	/**
	 * Pause playback
	 */
	pause(): void {
		if (!this.isPlaying || this.isPaused) {
			return;
		}

		this.isPaused = true;
		this.pausedTimestamp = Date.now();

		if (this.playbackTimer) {
			clearTimeout(this.playbackTimer);
			this.playbackTimer = null;
		}

		this.emit('playback_paused', {
			currentIndex: this.currentIndex,
			timestamp: this.getCurrentTimestamp(),
		});
	}

	/**
	 * Resume playback
	 */
	resume(): void {
		if (!this.isPlaying || !this.isPaused) {
			return;
		}

		this.isPaused = false;
		const pausedDuration = Date.now() - this.pausedTimestamp;
		this.startTimestamp += pausedDuration;

		this.emit('playback_resumed', {
			currentIndex: this.currentIndex,
			timestamp: this.getCurrentTimestamp(),
		});

		this.playNextEvent();
	}

	/**
	 * Stop playback
	 */
	stop(): void {
		if (!this.isPlaying) {
			return;
		}

		this.isPlaying = false;
		this.isPaused = false;
		this.currentIndex = 0;

		if (this.playbackTimer) {
			clearTimeout(this.playbackTimer);
			this.playbackTimer = null;
		}

		this.emit('playback_stopped');
	}

	/**
	 * Set playback speed
	 */
	setSpeed(speed: number): void {
		if (speed <= 0 || speed > 10) {
			throw new Error('Speed must be between 0 and 10');
		}

		this.playbackSpeed = speed;
		this.emit('speed_changed', { speed });

		// Restart playback with new speed if currently playing
		if (this.isPlaying && !this.isPaused) {
			if (this.playbackTimer) {
				clearTimeout(this.playbackTimer);
				this.playbackTimer = null;
			}
			this.playNextEvent();
		}
	}

	/**
	 * Get current playback speed
	 */
	getSpeed(): number {
		return this.playbackSpeed;
	}

	/**
	 * Seek to a specific timestamp in the recording
	 */
	seek(timestamp: number): void {
		if (!this.recording) {
			throw new Error('No recording loaded');
		}

		if (timestamp < 0 || (this.recording.duration && timestamp > this.recording.duration)) {
			throw new Error('Invalid timestamp');
		}

		// Find the event index at this timestamp
		let index = 0;
		for (let i = 0; i < this.recording.events.length; i++) {
			if (this.recording.events[i].timestamp <= timestamp) {
				index = i;
			} else {
				break;
			}
		}

		this.currentIndex = index;
		this.startTimestamp = Date.now() - timestamp / this.playbackSpeed;

		this.emit('playback_seeked', { timestamp, index });

		// Restart playback if currently playing
		if (this.isPlaying && !this.isPaused) {
			if (this.playbackTimer) {
				clearTimeout(this.playbackTimer);
				this.playbackTimer = null;
			}
			this.playNextEvent();
		}
	}

	/**
	 * Get current playback timestamp
	 */
	getCurrentTimestamp(): number {
		if (!this.isPlaying) {
			return 0;
		}

		if (this.isPaused) {
			return (this.pausedTimestamp - this.startTimestamp) * this.playbackSpeed;
		}

		return (Date.now() - this.startTimestamp) * this.playbackSpeed;
	}

	/**
	 * Get current event index
	 */
	getCurrentIndex(): number {
		return this.currentIndex;
	}

	/**
	 * Play next event in the recording
	 */
	private playNextEvent(): void {
		if (!this.recording || !this.isPlaying || this.isPaused) {
			return;
		}

		if (this.currentIndex >= this.recording.events.length) {
			this.emit('playback_ended');
			this.stop();
			return;
		}

		const event = this.recording.events[this.currentIndex];
		const currentTimestamp = this.getCurrentTimestamp();
		const delay = Math.max(0, (event.timestamp - currentTimestamp) / this.playbackSpeed);

		this.playbackTimer = setTimeout(() => {
			this.emit('event_played', { event, index: this.currentIndex });
			this.currentIndex++;
			this.playNextEvent();
		}, delay);
	}

	/**
	 * Get playback progress (0-1)
	 */
	getProgress(): number {
		if (!this.recording || !this.recording.duration) {
			return 0;
		}

		const current = this.getCurrentTimestamp();
		return Math.min(1, current / this.recording.duration);
	}

	/**
	 * Check if playback is active
	 */
	isActive(): boolean {
		return this.isPlaying;
	}

	/**
	 * Check if playback is currently paused
	 */
	isPausing(): boolean {
		return this.isPaused;
	}

	/**
	 * Get loaded recording
	 */
	getRecording(): Recording | null {
		return this.recording;
	}

	/**
	 * Skip forward by duration (milliseconds)
	 */
	skipForward(duration: number): void {
		const currentTimestamp = this.getCurrentTimestamp();
		this.seek(currentTimestamp + duration);
	}

	/**
	 * Skip backward by duration (milliseconds)
	 */
	skipBackward(duration: number): void {
		const currentTimestamp = this.getCurrentTimestamp();
		this.seek(Math.max(0, currentTimestamp - duration));
	}

	/**
	 * Jump to next event
	 */
	nextEvent(): void {
		if (!this.recording || this.currentIndex >= this.recording.events.length - 1) {
			return;
		}

		const nextEvent = this.recording.events[this.currentIndex + 1];
		this.seek(nextEvent.timestamp);
	}

	/**
	 * Jump to previous event
	 */
	previousEvent(): void {
		if (!this.recording || this.currentIndex <= 0) {
			return;
		}

		const prevEvent = this.recording.events[Math.max(0, this.currentIndex - 1)];
		this.seek(prevEvent.timestamp);
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stop();
		this.recording = null;
		this.removeAllListeners();
	}
}

/**
 * Create a playback engine instance
 */
export function createPlaybackEngine(options?: PlaybackEngineOptions): PlaybackEngine {
	return new PlaybackEngine(options);
}
