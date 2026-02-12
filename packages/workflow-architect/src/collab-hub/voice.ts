import { EventEmitter } from 'events';
import type { VoiceChannel } from './types';
import { VoiceChannelSchema } from './types';

interface VoiceChannelOptions {
	iceServers?: RTCIceServer[];
	audioConstraints?: MediaTrackConstraints;
	echoCancellation?: boolean;
	noiseSuppression?: boolean;
	autoGainControl?: boolean;
}

interface PeerConnection {
	userId: string;
	connection: RTCPeerConnection;
	stream: MediaStream | null;
}

/**
 * Voice chat channel with WebRTC peer connections
 */
export class VoiceChannel extends EventEmitter {
	private channelId: string;
	private currentUserId: string;
	private localStream: MediaStream | null;
	private peerConnections: Map<string, PeerConnection>;
	private isMuted: boolean;
	private options: Required<VoiceChannelOptions>;
	private audioContext: AudioContext | null;
	private analyser: AnalyserNode | null;
	private speakingDetectionInterval: NodeJS.Timeout | null;

	// Default STUN/TURN servers
	private static readonly DEFAULT_ICE_SERVERS: RTCIceServer[] = [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:stun1.l.google.com:19302' },
	];

	constructor(channelId: string, userId: string, options: VoiceChannelOptions = {}) {
		super();
		this.channelId = channelId;
		this.currentUserId = userId;
		this.localStream = null;
		this.peerConnections = new Map();
		this.isMuted = false;
		this.audioContext = null;
		this.analyser = null;
		this.speakingDetectionInterval = null;
		this.options = {
			iceServers: options.iceServers ?? VoiceChannel.DEFAULT_ICE_SERVERS,
			audioConstraints: options.audioConstraints ?? {},
			echoCancellation: options.echoCancellation ?? true,
			noiseSuppression: options.noiseSuppression ?? true,
			autoGainControl: options.autoGainControl ?? true,
		};
	}

	/**
	 * Join the voice channel
	 */
	async join(channelId: string): Promise<void> {
		try {
			// Get user media
			this.localStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: this.options.echoCancellation,
					noiseSuppression: this.options.noiseSuppression,
					autoGainControl: this.options.autoGainControl,
					...this.options.audioConstraints,
				},
				video: false,
			});

			// Initialize audio processing
			this.initializeAudioProcessing();

			// Start speaking detection
			this.startSpeakingDetection();

			this.emit('joined', { channelId, userId: this.currentUserId });
		} catch (error) {
			this.emit('error', { error, message: 'Failed to join voice channel' });
			throw error;
		}
	}

	/**
	 * Leave the voice channel
	 */
	leave(): void {
		// Stop local stream
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}

		// Close all peer connections
		for (const peer of this.peerConnections.values()) {
			peer.connection.close();
		}
		this.peerConnections.clear();

		// Stop speaking detection
		this.stopSpeakingDetection();

		// Cleanup audio processing
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
			this.analyser = null;
		}

		this.emit('left', { channelId: this.channelId, userId: this.currentUserId });
	}

	/**
	 * Mute microphone
	 */
	mute(): void {
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = false;
			});
			this.isMuted = true;
			this.emit('muted', { userId: this.currentUserId });
		}
	}

	/**
	 * Unmute microphone
	 */
	unmute(): void {
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = true;
			});
			this.isMuted = false;
			this.emit('unmuted', { userId: this.currentUserId });
		}
	}

	/**
	 * Check if microphone is muted
	 */
	isMicMuted(): boolean {
		return this.isMuted;
	}

	/**
	 * Create peer connection for a remote user
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
			this.emit('remote_stream', { userId, stream: remoteStream });
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

		// Store peer connection
		this.peerConnections.set(userId, {
			userId,
			connection: peerConnection,
			stream: remoteStream,
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
		const peer = this.peerConnections.get(userId);
		if (!peer) {
			throw new Error('Peer connection not found');
		}
		await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
	}

	/**
	 * Add ICE candidate
	 */
	async addIceCandidate(userId: string, candidate: RTCIceCandidateInit): Promise<void> {
		const peer = this.peerConnections.get(userId);
		if (!peer) {
			throw new Error('Peer connection not found');
		}
		await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
	}

	/**
	 * Remove peer connection
	 */
	removePeerConnection(userId: string): void {
		const peer = this.peerConnections.get(userId);
		if (peer) {
			peer.connection.close();
			this.peerConnections.delete(userId);
			this.emit('peer_disconnected', { userId });
		}
	}

	/**
	 * Initialize audio processing for voice detection
	 */
	private initializeAudioProcessing(): void {
		if (!this.localStream) {
			return;
		}

		try {
			this.audioContext = new AudioContext();
			const source = this.audioContext.createMediaStreamSource(this.localStream);
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 512;
			this.analyser.smoothingTimeConstant = 0.8;
			source.connect(this.analyser);
		} catch (error) {
			this.emit('error', { error, message: 'Failed to initialize audio processing' });
		}
	}

	/**
	 * Start speaking detection
	 */
	private startSpeakingDetection(): void {
		this.speakingDetectionInterval = setInterval(() => {
			if (!this.analyser || this.isMuted) {
				return;
			}

			const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
			this.analyser.getByteFrequencyData(dataArray);

			// Calculate average volume
			const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

			// Threshold for speaking detection (adjust as needed)
			const speakingThreshold = 20;
			const isSpeaking = average > speakingThreshold;

			this.emit('speaking_change', {
				userId: this.currentUserId,
				speaking: isSpeaking,
				volume: average,
			});
		}, 100); // Check every 100ms
	}

	/**
	 * Stop speaking detection
	 */
	private stopSpeakingDetection(): void {
		if (this.speakingDetectionInterval) {
			clearInterval(this.speakingDetectionInterval);
			this.speakingDetectionInterval = null;
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
	getParticipants(): string[] {
		return Array.from(this.peerConnections.keys());
	}

	/**
	 * Get connection stats
	 */
	async getConnectionStats(userId: string): Promise<RTCStatsReport | null> {
		const peer = this.peerConnections.get(userId);
		if (!peer) {
			return null;
		}
		return await peer.connection.getStats();
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
 * Create a voice channel instance
 */
export function createVoiceChannel(
	channelId: string,
	userId: string,
	options?: VoiceChannelOptions
): VoiceChannel {
	return new VoiceChannel(channelId, userId, options);
}
