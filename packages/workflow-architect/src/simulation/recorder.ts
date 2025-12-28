import type { Recording } from './types';
import { RecordingSchema } from './types';

/**
 * Execution Recorder
 * Records all workflow execution events for later playback
 */

export interface RecordingOptions {
	captureData?: boolean;
	captureExternalCalls?: boolean;
	captureMetadata?: boolean;
	maxEventSize?: number; // bytes
}

export class ExecutionRecorder {
	private recording: Partial<Recording> | null = null;
	private events: Recording['events'] = [];
	private externalCalls: Recording['externalCalls'] = [];
	private startTime: number = 0;
	private options: Required<RecordingOptions>;

	constructor(options: RecordingOptions = {}) {
		this.options = {
			captureData: options.captureData ?? true,
			captureExternalCalls: options.captureExternalCalls ?? true,
			captureMetadata: options.captureMetadata ?? true,
			maxEventSize: options.maxEventSize ?? 1024 * 1024, // 1MB default
		};
	}

	/**
	 * Start recording an execution
	 */
	start(workflowId: string, executionId: string): void {
		this.startTime = Date.now();
		this.events = [];
		this.externalCalls = [];

		this.recording = {
			id: this.generateId(),
			workflowId,
			executionId,
			startedAt: new Date().toISOString(),
			events: [],
			externalCalls: [],
		};

		this.recordEvent('execution_start', {
			workflowId,
			executionId,
		});
	}

	/**
	 * Stop recording and return the recording
	 */
	async stop(): Promise<Recording> {
		if (!this.recording) {
			throw new Error('No recording in progress');
		}

		this.recordEvent('execution_end', {
			duration: Date.now() - this.startTime,
		});

		const completedAt = new Date().toISOString();
		const duration = Date.now() - this.startTime;

		this.recording.completedAt = completedAt;
		this.recording.duration = duration;
		this.recording.events = this.events;
		this.recording.externalCalls = this.externalCalls;

		const finalRecording = RecordingSchema.parse(this.recording);

		// Reset state
		this.recording = null;
		this.events = [];
		this.externalCalls = [];

		return finalRecording;
	}

	/**
	 * Record a node start event
	 */
	recordNodeStart(nodeId: string, data?: Record<string, unknown>): void {
		this.recordEvent('node_start', { nodeId }, data);
	}

	/**
	 * Record a node end event
	 */
	recordNodeEnd(nodeId: string, data?: Record<string, unknown>): void {
		this.recordEvent('node_end', { nodeId }, data);
	}

	/**
	 * Record data input
	 */
	recordDataIn(nodeId: string, data: Record<string, unknown>): void {
		if (this.options.captureData) {
			this.recordEvent('data_in', { nodeId }, this.sanitizeData(data));
		}
	}

	/**
	 * Record data output
	 */
	recordDataOut(nodeId: string, data: Record<string, unknown>): void {
		if (this.options.captureData) {
			this.recordEvent('data_out', { nodeId }, this.sanitizeData(data));
		}
	}

	/**
	 * Record an error
	 */
	recordError(nodeId: string | undefined, error: Error): void {
		this.recordEvent(
			'error',
			{ nodeId },
			{
				message: error.message,
				type: error.constructor.name,
				stack: error.stack,
			},
		);
	}

	/**
	 * Record an external API call
	 */
	recordExternalCall(
		method: string,
		url: string,
		options?: {
			headers?: Record<string, string>;
			body?: unknown;
			response?: {
				status: number;
				headers?: Record<string, string>;
				body?: unknown;
				duration: number;
			};
		},
	): void {
		if (!this.options.captureExternalCalls) {
			return;
		}

		this.externalCalls.push({
			timestamp: this.getRelativeTime(),
			method,
			url,
			headers: options?.headers,
			body: this.sanitizeData(options?.body),
			response: options?.response
				? {
						status: options.response.status,
						headers: options.response.headers,
						body: this.sanitizeData(options.response.body),
						duration: options.response.duration,
					}
				: undefined,
		});

		this.recordEvent('external_call', { method, url });
	}

	/**
	 * Record a custom event
	 */
	recordCustomEvent(type: string, nodeId?: string, data?: Record<string, unknown>): void {
		// Map custom type to one of the enum values
		const eventType = 'node_start'; // Default fallback
		this.recordEvent(eventType, { nodeId, customType: type }, data);
	}

	/**
	 * Add metadata to recording
	 */
	setMetadata(metadata: Record<string, unknown>): void {
		if (this.recording && this.options.captureMetadata) {
			this.recording.metadata = {
				...this.recording.metadata,
				...metadata,
			};
		}
	}

	/**
	 * Check if currently recording
	 */
	isRecording(): boolean {
		return this.recording !== null;
	}

	/**
	 * Get current recording ID
	 */
	getCurrentRecordingId(): string | null {
		return this.recording?.id ?? null;
	}

	/**
	 * Internal: Record an event
	 */
	private recordEvent(
		type: Recording['events'][0]['type'],
		context?: { nodeId?: string; [key: string]: unknown },
		data?: unknown,
	): void {
		if (!this.recording) {
			return;
		}

		const event: Recording['events'][0] = {
			timestamp: this.getRelativeTime(),
			type,
			nodeId: context?.nodeId,
			data: data
				? {
						...this.sanitizeData(data),
						...context,
					}
				: context
					? (context as Record<string, unknown>)
					: undefined,
		};

		this.events.push(event);
	}

	/**
	 * Get relative timestamp from start
	 */
	private getRelativeTime(): number {
		return Date.now() - this.startTime;
	}

	/**
	 * Sanitize and limit data size
	 */
	private sanitizeData(data: unknown): Record<string, unknown> | undefined {
		if (data === null || data === undefined) {
			return undefined;
		}

		try {
			const str = JSON.stringify(data);

			// Check size limit
			if (str.length > this.options.maxEventSize) {
				return {
					_truncated: true,
					_originalSize: str.length,
					_maxSize: this.options.maxEventSize,
					_preview: str.substring(0, 100),
				};
			}

			return JSON.parse(str) as Record<string, unknown>;
		} catch (err) {
			return {
				_error: 'Failed to serialize data',
				_message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get recording statistics
	 */
	getStats():
		| {
				eventCount: number;
				externalCallCount: number;
				duration: number;
				estimatedSize: number;
		  }
		| null {
		if (!this.recording) {
			return null;
		}

		const estimatedSize =
			JSON.stringify(this.events).length + JSON.stringify(this.externalCalls).length;

		return {
			eventCount: this.events.length,
			externalCallCount: this.externalCalls.length,
			duration: Date.now() - this.startTime,
			estimatedSize,
		};
	}

	/**
	 * Export recording to JSON
	 */
	async export(recording: Recording): Promise<string> {
		return JSON.stringify(recording, null, 2);
	}

	/**
	 * Import recording from JSON
	 */
	async import(json: string): Promise<Recording> {
		const data = JSON.parse(json) as unknown;
		return RecordingSchema.parse(data);
	}
}

/**
 * Recording Manager - handles multiple recordings
 */
export class RecordingManager {
	private recordings: Map<string, Recording> = new Map();

	/**
	 * Save a recording
	 */
	async save(recording: Recording): Promise<void> {
		this.recordings.set(recording.id, recording);
	}

	/**
	 * Get a recording by ID
	 */
	async get(id: string): Promise<Recording | null> {
		return this.recordings.get(id) ?? null;
	}

	/**
	 * Delete a recording
	 */
	async delete(id: string): Promise<boolean> {
		return this.recordings.delete(id);
	}

	/**
	 * List all recordings
	 */
	async list(): Promise<Recording[]> {
		return Array.from(this.recordings.values());
	}

	/**
	 * List recordings for a workflow
	 */
	async listByWorkflow(workflowId: string): Promise<Recording[]> {
		return Array.from(this.recordings.values()).filter((r) => r.workflowId === workflowId);
	}

	/**
	 * Get recording statistics
	 */
	async getStats(id: string): Promise<{
		eventCount: number;
		externalCallCount: number;
		duration: number;
		sizeBytes: number;
	} | null> {
		const recording = await this.get(id);
		if (!recording) {
			return null;
		}

		return {
			eventCount: recording.events.length,
			externalCallCount: recording.externalCalls.length,
			duration: recording.duration,
			sizeBytes: JSON.stringify(recording).length,
		};
	}

	/**
	 * Clear all recordings
	 */
	async clear(): Promise<void> {
		this.recordings.clear();
	}
}
