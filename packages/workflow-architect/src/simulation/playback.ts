import type { Recording, PlaybackConfig, PlaybackResult } from './types';
import { PlaybackConfigSchema, PlaybackResultSchema } from './types';
import { VirtualClock } from './clock';

/**
 * Playback Engine
 * Replays recorded executions with speed control and comparison
 */

export class PlaybackEngine {
	private clock: VirtualClock;
	private paused: boolean = false;
	private currentEventIndex: number = 0;
	private breakpoints: Set<string> = new Set();

	constructor() {
		this.clock = new VirtualClock();
	}

	/**
	 * Play back a recording
	 */
	async play(recording: Recording, config: PlaybackConfig): Promise<PlaybackResult> {
		const validatedConfig = PlaybackConfigSchema.parse(config);

		// Setup
		this.clock.reset();
		this.clock.setSpeed(validatedConfig.speed);
		this.currentEventIndex = 0;
		this.paused = validatedConfig.stepByStep;
		this.breakpoints = new Set(validatedConfig.breakpoints);

		const differences: PlaybackResult['differences'] = [];
		const events: unknown[] = [];
		const startTime = Date.now();

		// Prepare external call mocks
		const externalCallMap = this.buildExternalCallMap(recording);

		// Play through events
		for (let i = 0; i < recording.events.length; i++) {
			this.currentEventIndex = i;
			const event = recording.events[i];

			// Check breakpoints
			if (event.nodeId && this.breakpoints.has(event.nodeId)) {
				this.paused = true;
			}

			// Wait if paused (in step-by-step mode)
			while (this.paused) {
				await this.delay(100);
			}

			// Advance clock to event time
			this.clock.setTime(event.timestamp);

			// Process event
			const result = await this.processEvent(event, recording, validatedConfig);

			events.push({
				type: event.type,
				timestamp: event.timestamp,
				nodeId: event.nodeId,
				processed: true,
			});

			// Check for differences
			if (result.different) {
				differences.push({
					type: 'data',
					nodeId: event.nodeId,
					expected: result.expected,
					actual: result.actual,
					message: result.message ?? 'Data mismatch',
				});

				// Fail fast in strict mode
				if (validatedConfig.strictMode) {
					break;
				}
			}

			// Mock external calls if needed
			if (event.type === 'external_call' && validatedConfig.mockExternalCalls) {
				const callData = externalCallMap.get(i);
				if (callData) {
					events.push({
						type: 'external_call_mocked',
						timestamp: event.timestamp,
						response: callData.response,
					});
				}
			}
		}

		const duration = Date.now() - startTime;

		return PlaybackResultSchema.parse({
			recordingId: recording.id,
			success: differences.length === 0,
			differences,
			duration,
			events,
		});
	}

	/**
	 * Pause playback
	 */
	pause(): void {
		this.paused = true;
		this.clock.pause();
	}

	/**
	 * Resume playback
	 */
	resume(): void {
		this.paused = false;
		this.clock.resume();
	}

	/**
	 * Step to next event
	 */
	stepNext(): void {
		if (this.paused) {
			// Resume temporarily for one event
			this.paused = false;
			setTimeout(() => {
				this.paused = true;
			}, 10);
		}
	}

	/**
	 * Skip to specific event
	 */
	skipTo(eventIndex: number): void {
		this.currentEventIndex = eventIndex;
	}

	/**
	 * Add breakpoint
	 */
	addBreakpoint(nodeId: string): void {
		this.breakpoints.add(nodeId);
	}

	/**
	 * Remove breakpoint
	 */
	removeBreakpoint(nodeId: string): void {
		this.breakpoints.delete(nodeId);
	}

	/**
	 * Process a single event
	 */
	private async processEvent(
		event: Recording['events'][0],
		recording: Recording,
		config: PlaybackConfig,
	): Promise<{
		different: boolean;
		expected?: unknown;
		actual?: unknown;
		message?: string;
	}> {
		// Simulate event processing
		await this.delay(10 / config.speed);

		// For now, return no differences
		// In real implementation, this would re-execute and compare
		return { different: false };
	}

	/**
	 * Build map of external calls for mocking
	 */
	private buildExternalCallMap(recording: Recording): Map<number, Recording['externalCalls'][0]> {
		const map = new Map<number, Recording['externalCalls'][0]>();
		let externalCallIndex = 0;

		for (let i = 0; i < recording.events.length; i++) {
			const event = recording.events[i];
			if (event.type === 'external_call') {
				if (externalCallIndex < recording.externalCalls.length) {
					map.set(i, recording.externalCalls[externalCallIndex]);
					externalCallIndex++;
				}
			}
		}

		return map;
	}

	/**
	 * Compare two data values
	 */
	private compareData(expected: unknown, actual: unknown): boolean {
		return JSON.stringify(expected) === JSON.stringify(actual);
	}

	/**
	 * Get current playback position
	 */
	getCurrentPosition(): {
		eventIndex: number;
		timestamp: number;
		paused: boolean;
	} {
		return {
			eventIndex: this.currentEventIndex,
			timestamp: this.clock.now(),
			paused: this.paused,
		};
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Playback Comparator
 * Compares playback results with original recordings
 */
export class PlaybackComparator {
	/**
	 * Compare playback result with original recording
	 */
	compare(result: PlaybackResult, recording: Recording): {
		dataMatch: boolean;
		timingMatch: boolean;
		externalCallsMatch: boolean;
		details: string[];
	} {
		const details: string[] = [];
		let dataMatch = true;
		let timingMatch = true;
		let externalCallsMatch = true;

		// Check data differences
		if (result.differences.length > 0) {
			dataMatch = false;
			details.push(`Found ${result.differences.length} data differences`);
		}

		// Compare timing
		const timingDiff = Math.abs(result.duration - recording.duration);
		if (timingDiff > recording.duration * 0.1) {
			// More than 10% difference
			timingMatch = false;
			details.push(
				`Timing difference: ${timingDiff}ms (expected: ${recording.duration}ms, actual: ${result.duration}ms)`,
			);
		}

		return {
			dataMatch,
			timingMatch,
			externalCallsMatch,
			details,
		};
	}

	/**
	 * Calculate similarity score
	 */
	calculateSimilarity(result: PlaybackResult, recording: Recording): number {
		const factors = {
			dataMatch: result.differences.length === 0 ? 1 : 0,
			timingMatch:
				1 - Math.min(1, Math.abs(result.duration - recording.duration) / recording.duration),
			eventCount: result.events.length / recording.events.length,
		};

		return (factors.dataMatch + factors.timingMatch + factors.eventCount) / 3;
	}
}

/**
 * Playback Debugger
 * Provides debugging capabilities during playback
 */
export class PlaybackDebugger {
	private eventLog: Array<{
		index: number;
		event: Recording['events'][0];
		timestamp: number;
		state: unknown;
	}> = [];

	/**
	 * Log an event
	 */
	logEvent(
		index: number,
		event: Recording['events'][0],
		timestamp: number,
		state: unknown,
	): void {
		this.eventLog.push({ index, event, timestamp, state });
	}

	/**
	 * Get event log
	 */
	getLog(): typeof this.eventLog {
		return this.eventLog;
	}

	/**
	 * Clear log
	 */
	clearLog(): void {
		this.eventLog = [];
	}

	/**
	 * Find events by type
	 */
	findEventsByType(type: Recording['events'][0]['type']): typeof this.eventLog {
		return this.eventLog.filter((entry) => entry.event.type === type);
	}

	/**
	 * Find events by node
	 */
	findEventsByNode(nodeId: string): typeof this.eventLog {
		return this.eventLog.filter((entry) => entry.event.nodeId === nodeId);
	}

	/**
	 * Get events in time range
	 */
	getEventsInRange(startTime: number, endTime: number): typeof this.eventLog {
		return this.eventLog.filter(
			(entry) => entry.timestamp >= startTime && entry.timestamp <= endTime,
		);
	}
}
