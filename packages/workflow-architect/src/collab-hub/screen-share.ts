import { EventEmitter } from 'events';

interface ScreenShareOptions {
	preferCurrentTab?: boolean;
	audio?: boolean;
	cursor?: 'always' | 'motion' | 'never';
	displaySurface?: 'monitor' | 'window' | 'application';
	maxWidth?: number;
	maxHeight?: number;
	frameRate?: number;
}

interface AnnotationData {
	type: 'pen' | 'arrow' | 'text' | 'rectangle' | 'circle';
	position: { x: number; y: number };
	color: string;
	data: Record<string, unknown>;
}

/**
 * Screen sharing with application window selection and annotation overlay
 */
export class ScreenShare extends EventEmitter {
	private userId: string;
	private stream: MediaStream | null;
	private isSharing: boolean;
	private annotations: AnnotationData[];
	private canvas: HTMLCanvasElement | null;
	private canvasContext: CanvasRenderingContext2D | null;
	private options: Required<ScreenShareOptions>;

	constructor(userId: string, options: ScreenShareOptions = {}) {
		super();
		this.userId = userId;
		this.stream = null;
		this.isSharing = false;
		this.annotations = [];
		this.canvas = null;
		this.canvasContext = null;
		this.options = {
			preferCurrentTab: options.preferCurrentTab ?? false,
			audio: options.audio ?? false,
			cursor: options.cursor ?? 'motion',
			displaySurface: options.displaySurface ?? 'monitor',
			maxWidth: options.maxWidth ?? 1920,
			maxHeight: options.maxHeight ?? 1080,
			frameRate: options.frameRate ?? 30,
		};
	}

	/**
	 * Start screen sharing
	 */
	async startSharing(options?: Partial<ScreenShareOptions>): Promise<void> {
		if (this.isSharing) {
			throw new Error('Already sharing screen');
		}

		const shareOptions = { ...this.options, ...options };

		try {
			this.stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: shareOptions.cursor,
					displaySurface: shareOptions.displaySurface,
					width: { max: shareOptions.maxWidth },
					height: { max: shareOptions.maxHeight },
					frameRate: { max: shareOptions.frameRate },
				} as MediaTrackConstraints,
				audio: shareOptions.audio,
			});

			// Listen for stream ending (user clicks stop sharing)
			this.stream.getVideoTracks()[0].onended = () => {
				this.stopSharing();
			};

			this.isSharing = true;
			this.emit('sharing_started', {
				userId: this.userId,
				stream: this.stream,
			});
		} catch (error) {
			this.emit('error', { error, message: 'Failed to start screen sharing' });
			throw error;
		}
	}

	/**
	 * Stop screen sharing
	 */
	stopSharing(): void {
		if (!this.isSharing) {
			return;
		}

		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
			this.stream = null;
		}

		this.isSharing = false;
		this.clearAnnotations();

		this.emit('sharing_stopped', { userId: this.userId });
	}

	/**
	 * Add annotation overlay
	 */
	addAnnotation(annotation: AnnotationData): void {
		if (!this.isSharing) {
			throw new Error('Not currently sharing');
		}

		this.annotations.push(annotation);
		this.emit('annotation_added', { userId: this.userId, annotation });
	}

	/**
	 * Clear all annotations
	 */
	clearAnnotations(): void {
		this.annotations = [];
		this.emit('annotations_cleared', { userId: this.userId });
	}

	/**
	 * Get current annotations
	 */
	getAnnotations(): AnnotationData[] {
		return [...this.annotations];
	}

	/**
	 * Check if currently sharing
	 */
	isCurrentlySharing(): boolean {
		return this.isSharing;
	}

	/**
	 * Get shared stream
	 */
	getStream(): MediaStream | null {
		return this.stream;
	}

	/**
	 * Get stream settings
	 */
	getStreamSettings(): MediaTrackSettings | null {
		if (!this.stream) {
			return null;
		}

		const videoTrack = this.stream.getVideoTracks()[0];
		return videoTrack ? videoTrack.getSettings() : null;
	}

	/**
	 * Toggle audio sharing
	 */
	async toggleAudio(): Promise<void> {
		if (!this.stream) {
			throw new Error('No active stream');
		}

		const audioTrack = this.stream.getAudioTracks()[0];
		if (audioTrack) {
			audioTrack.enabled = !audioTrack.enabled;
			this.emit('audio_toggled', {
				userId: this.userId,
				enabled: audioTrack.enabled,
			});
		}
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stopSharing();
		this.removeAllListeners();
	}
}

/**
 * Create a screen share instance
 */
export function createScreenShare(userId: string, options?: ScreenShareOptions): ScreenShare {
	return new ScreenShare(userId, options);
}
