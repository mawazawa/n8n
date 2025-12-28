import { EventEmitter } from 'events';
import type { VideoRoom } from './types';
import { VideoRoomSchema } from './types';

interface VideoRoomOptions {
	iceServers?: RTCIceServer[];
	videoConstraints?: MediaTrackConstraints;
	audioConstraints?: MediaTrackConstraints;
	defaultLayout?: 'grid' | 'speaker' | 'spotlight';
	maxParticipants?: number;
}

interface Participant {
	userId: string;
	connection: RTCPeerConnection;
	stream: MediaStream | null;
	cameraEnabled: boolean;
	micEnabled: boolean;
	screenSharing: boolean;
}

interface VirtualBackgroundOptions {
	type: 'blur' | 'image' | 'none';
	blurAmount?: number;
	imageUrl?: string;
}

/**
 * Video conferencing room with grid, speaker, and spotlight views
 */
export class VideoRoom extends EventEmitter {
	private roomId: string;
	private currentUserId: string;
	private localStream: MediaStream | null;
	private participants: Map<string, Participant>;
	private layout: 'grid' | 'speaker' | 'spotlight';
	private options: Required<Omit<VideoRoomOptions, 'defaultLayout'>>;
	private virtualBackground: VirtualBackgroundOptions;
	private canvas: HTMLCanvasElement | null;
	private canvasContext: CanvasRenderingContext2D | null;

	// Default STUN/TURN servers
	private static readonly DEFAULT_ICE_SERVERS: RTCIceServer[] = [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:stun1.l.google.com:19302' },
	];

	constructor(roomId: string, userId: string, options: VideoRoomOptions = {}) {
		super();
		this.roomId = roomId;
		this.currentUserId = userId;
		this.localStream = null;
		this.participants = new Map();
		this.layout = options.defaultLayout ?? 'grid';
		this.virtualBackground = { type: 'none' };
		this.canvas = null;
		this.canvasContext = null;
		this.options = {
			iceServers: options.iceServers ?? VideoRoom.DEFAULT_ICE_SERVERS,
			videoConstraints: options.videoConstraints ?? {
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 30 },
			},
			audioConstraints: options.audioConstraints ?? {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
			maxParticipants: options.maxParticipants ?? 50,
		};
	}

	/**
	 * Join the video room
	 */
	async join(roomId: string): Promise<void> {
		if (this.participants.size >= this.options.maxParticipants) {
			throw new Error('Room is full');
		}

		try {
			// Get user media
			this.localStream = await navigator.mediaDevices.getUserMedia({
				video: this.options.videoConstraints,
				audio: this.options.audioConstraints,
			});

			this.emit('joined', {
				roomId,
				userId: this.currentUserId,
				stream: this.localStream,
			});
		} catch (error) {
			this.emit('error', { error, message: 'Failed to join video room' });
			throw error;
		}
	}

	/**
	 * Leave the video room
	 */
	leave(): void {
		// Stop local stream
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}

		// Close all peer connections
		for (const participant of this.participants.values()) {
			participant.connection.close();
		}
		this.participants.clear();

		this.emit('left', { roomId: this.roomId, userId: this.currentUserId });
	}

	/**
	 * Enable camera
	 */
	async enableCamera(): Promise<void> {
		if (!this.localStream) {
			throw new Error('Not joined to room');
		}

		try {
			// If video track exists and is disabled, enable it
			const videoTrack = this.localStream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = true;
			} else {
				// Get new video stream
				const videoStream = await navigator.mediaDevices.getUserMedia({
					video: this.options.videoConstraints,
					audio: false,
				});

				const newVideoTrack = videoStream.getVideoTracks()[0];
				this.localStream.addTrack(newVideoTrack);

				// Update all peer connections
				for (const participant of this.participants.values()) {
					const sender = participant.connection
						.getSenders()
						.find(s => s.track?.kind === 'video');
					if (sender) {
						await sender.replaceTrack(newVideoTrack);
					} else {
						participant.connection.addTrack(newVideoTrack, this.localStream);
					}
				}
			}

			this.emit('camera_enabled', { userId: this.currentUserId });
		} catch (error) {
			this.emit('error', { error, message: 'Failed to enable camera' });
			throw error;
		}
	}

	/**
	 * Disable camera
	 */
	disableCamera(): void {
		if (!this.localStream) {
			return;
		}

		const videoTrack = this.localStream.getVideoTracks()[0];
		if (videoTrack) {
			videoTrack.enabled = false;
			this.emit('camera_disabled', { userId: this.currentUserId });
		}
	}

	/**
	 * Mute microphone
	 */
	mute(): void {
		if (!this.localStream) {
			return;
		}

		this.localStream.getAudioTracks().forEach(track => {
			track.enabled = false;
		});
		this.emit('muted', { userId: this.currentUserId });
	}

	/**
	 * Unmute microphone
	 */
	unmute(): void {
		if (!this.localStream) {
			return;
		}

		this.localStream.getAudioTracks().forEach(track => {
			track.enabled = true;
		});
		this.emit('unmuted', { userId: this.currentUserId });
	}

	/**
	 * Set video layout
	 */
	setLayout(layout: 'grid' | 'speaker' | 'spotlight'): void {
		this.layout = layout;
		this.emit('layout_changed', { layout });
	}

	/**
	 * Get current layout
	 */
	getLayout(): 'grid' | 'speaker' | 'spotlight' {
		return this.layout;
	}

	/**
	 * Set virtual background
	 */
	async setVirtualBackground(options: VirtualBackgroundOptions): Promise<void> {
		this.virtualBackground = options;

		if (options.type === 'none') {
			// Remove virtual background processing
			this.canvas = null;
			this.canvasContext = null;
			this.emit('virtual_background_changed', { type: 'none' });
			return;
		}

		// Initialize canvas for background processing
		if (!this.canvas) {
			this.canvas = document.createElement('canvas');
			this.canvasContext = this.canvas.getContext('2d');
		}

		// Apply virtual background processing
		// Note: In production, this would use libraries like @tensorflow/tfjs
		// and body segmentation models for proper background replacement
		this.emit('virtual_background_changed', options);
	}

	/**
	 * Create peer connection for a remote participant
	 */
	async createPeerConnection(userId: string): Promise<RTCPeerConnection> {
		const peerConnection = new RTCPeerConnection({
			iceServers: this.options.iceServers,
		});

		// Add local stream tracks
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				peerConnection.addTrack(track, this.localStream!);
			});
		}

		// Handle ICE candidates
		peerConnection.onicecandidate = (event) => {
			if (event.candidate) {
				this.emit('ice_candidate', {
					userId,
					candidate: event.candidate,
				});
			}
		};

		// Handle remote stream
		const remoteStream = new MediaStream();
		peerConnection.ontrack = (event) => {
			event.streams[0].getTracks().forEach(track => {
				remoteStream.addTrack(track);
			});

			const participant = this.participants.get(userId);
			if (participant) {
				participant.stream = remoteStream;
				this.emit('remote_stream', { userId, stream: remoteStream });
			}
		};

		// Handle connection state changes
		peerConnection.onconnectionstatechange = () => {
			this.emit('connection_state_change', {
				userId,
				state: peerConnection.connectionState,
			});

			if (peerConnection.connectionState === 'failed') {
				this.handleConnectionFailure(userId);
			}
		};

		// Store participant
		this.participants.set(userId, {
			userId,
			connection: peerConnection,
			stream: remoteStream,
			cameraEnabled: true,
			micEnabled: true,
			screenSharing: false,
		});

		return peerConnection;
	}

	/**
	 * Create and send offer to remote peer
	 */
	async createOffer(userId: string): Promise<RTCSessionDescriptionInit> {
		const peerConnection = await this.createPeerConnection(userId);
		const offer = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offer);
		return offer;
	}

	/**
	 * Create and send answer to remote peer
	 */
	async createAnswer(userId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
		const peerConnection = await this.createPeerConnection(userId);
		await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
		const answer = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answer);
		return answer;
	}

	/**
	 * Handle remote answer
	 */
	async handleAnswer(userId: string, answer: RTCSessionDescriptionInit): Promise<void> {
		const participant = this.participants.get(userId);
		if (!participant) {
			throw new Error('Participant not found');
		}
		await participant.connection.setRemoteDescription(new RTCSessionDescription(answer));
	}

	/**
	 * Add ICE candidate
	 */
	async addIceCandidate(userId: string, candidate: RTCIceCandidateInit): Promise<void> {
		const participant = this.participants.get(userId);
		if (!participant) {
			throw new Error('Participant not found');
		}
		await participant.connection.addIceCandidate(new RTCIceCandidate(candidate));
	}

	/**
	 * Remove participant
	 */
	removeParticipant(userId: string): void {
		const participant = this.participants.get(userId);
		if (participant) {
			participant.connection.close();
			this.participants.delete(userId);
			this.emit('participant_left', { userId });
		}
	}

	/**
	 * Handle connection failure
	 */
	private handleConnectionFailure(userId: string): void {
		this.emit('connection_failed', { userId });
		// Could implement reconnection logic here
	}

	/**
	 * Get active participants
	 */
	getParticipants(): Participant[] {
		return Array.from(this.participants.values());
	}

	/**
	 * Get participant count
	 */
	getParticipantCount(): number {
		return this.participants.size;
	}

	/**
	 * Get local stream
	 */
	getLocalStream(): MediaStream | null {
		return this.localStream;
	}

	/**
	 * Get connection stats
	 */
	async getConnectionStats(userId: string): Promise<RTCStatsReport | null> {
		const participant = this.participants.get(userId);
		if (!participant) {
			return null;
		}
		return await participant.connection.getStats();
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.leave();
		this.removeAllListeners();
	}
}

/**
 * Create a video room instance
 */
export function createVideoRoom(
	roomId: string,
	userId: string,
	options?: VideoRoomOptions
): VideoRoom {
	return new VideoRoom(roomId, userId, options);
}
