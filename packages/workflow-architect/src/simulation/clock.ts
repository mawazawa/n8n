/**
 * Virtual Clock for Simulation Time Control
 * Allows time dilation (speed up/slow down) and deterministic time progression
 */

export interface ScheduledCallback {
	id: string;
	executeAt: number;
	callback: () => void | Promise<void>;
	repeating?: {
		interval: number;
		count?: number; // undefined = infinite
	};
}

export class VirtualClock {
	private currentTime: number;
	private startTime: number;
	private paused: boolean = false;
	private speed: number = 1;
	private scheduledCallbacks: Map<string, ScheduledCallback> = new Map();
	private intervalHandle: NodeJS.Timeout | null = null;
	private tickInterval: number = 10; // ms

	constructor(startTime?: number) {
		this.startTime = startTime ?? Date.now();
		this.currentTime = this.startTime;
	}

	/**
	 * Get current virtual time
	 */
	now(): number {
		return this.currentTime;
	}

	/**
	 * Advance time by specified duration
	 */
	advance(duration: number): void {
		if (this.paused) {
			return;
		}

		const targetTime = this.currentTime + duration;
		this.advanceToTime(targetTime);
	}

	/**
	 * Set time to specific timestamp
	 */
	setTime(timestamp: number): void {
		this.currentTime = timestamp;
		this.executeScheduledCallbacks();
	}

	/**
	 * Advance to specific time, executing callbacks along the way
	 */
	private advanceToTime(targetTime: number): void {
		while (this.currentTime < targetTime) {
			const nextCallback = this.getNextCallback();

			if (nextCallback && nextCallback.executeAt <= targetTime) {
				// Advance to callback time
				this.currentTime = nextCallback.executeAt;
				this.executeCallback(nextCallback);
			} else {
				// No more callbacks before target
				this.currentTime = targetTime;
				break;
			}
		}
	}

	/**
	 * Pause time progression
	 */
	pause(): void {
		this.paused = true;
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}

	/**
	 * Resume time progression
	 */
	resume(): void {
		this.paused = false;
		this.startTicking();
	}

	/**
	 * Set time dilation speed (1 = real-time, 2 = 2x faster, 0.5 = half speed)
	 */
	setSpeed(speed: number): void {
		if (speed <= 0) {
			throw new Error('Speed must be positive');
		}
		this.speed = speed;

		// Restart ticking with new speed
		if (!this.paused && this.intervalHandle) {
			this.pause();
			this.resume();
		}
	}

	getSpeed(): number {
		return this.speed;
	}

	isPaused(): boolean {
		return this.paused;
	}

	/**
	 * Schedule a callback to execute at a future time
	 */
	scheduleAt(executeAt: number, callback: () => void | Promise<void>): string {
		const id = `callback-${Date.now()}-${Math.random()}`;
		this.scheduledCallbacks.set(id, {
			id,
			executeAt,
			callback,
		});
		return id;
	}

	/**
	 * Schedule a callback after a delay
	 */
	scheduleIn(delay: number, callback: () => void | Promise<void>): string {
		return this.scheduleAt(this.currentTime + delay, callback);
	}

	/**
	 * Schedule a repeating callback
	 */
	scheduleRepeating(
		interval: number,
		callback: () => void | Promise<void>,
		count?: number,
	): string {
		const id = `repeating-${Date.now()}-${Math.random()}`;
		this.scheduledCallbacks.set(id, {
			id,
			executeAt: this.currentTime + interval,
			callback,
			repeating: { interval, count },
		});
		return id;
	}

	/**
	 * Cancel a scheduled callback
	 */
	cancel(id: string): boolean {
		return this.scheduledCallbacks.delete(id);
	}

	/**
	 * Clear all scheduled callbacks
	 */
	clearAll(): void {
		this.scheduledCallbacks.clear();
	}

	/**
	 * Get next callback to execute
	 */
	private getNextCallback(): ScheduledCallback | null {
		let next: ScheduledCallback | null = null;

		for (const callback of this.scheduledCallbacks.values()) {
			if (!next || callback.executeAt < next.executeAt) {
				next = callback;
			}
		}

		return next;
	}

	/**
	 * Execute a callback and handle repeating
	 */
	private executeCallback(scheduled: ScheduledCallback): void {
		const { id, callback, repeating } = scheduled;

		// Execute callback
		void Promise.resolve(callback());

		// Handle repeating
		if (repeating) {
			const remaining = repeating.count !== undefined ? repeating.count - 1 : undefined;

			if (remaining === undefined || remaining > 0) {
				// Reschedule
				this.scheduledCallbacks.set(id, {
					...scheduled,
					executeAt: this.currentTime + repeating.interval,
					repeating: {
						interval: repeating.interval,
						count: remaining,
					},
				});
			} else {
				// Done repeating
				this.scheduledCallbacks.delete(id);
			}
		} else {
			// One-time callback
			this.scheduledCallbacks.delete(id);
		}
	}

	/**
	 * Execute all callbacks that should run at current time
	 */
	private executeScheduledCallbacks(): void {
		const toExecute: ScheduledCallback[] = [];

		for (const callback of this.scheduledCallbacks.values()) {
			if (callback.executeAt <= this.currentTime) {
				toExecute.push(callback);
			}
		}

		// Sort by execution time
		toExecute.sort((a, b) => a.executeAt - b.executeAt);

		// Execute in order
		for (const callback of toExecute) {
			this.executeCallback(callback);
		}
	}

	/**
	 * Start automatic time progression
	 */
	private startTicking(): void {
		if (this.intervalHandle) {
			return;
		}

		const realInterval = this.tickInterval / this.speed;

		this.intervalHandle = setInterval(() => {
			if (!this.paused) {
				this.advance(this.tickInterval);
			}
		}, realInterval);
	}

	/**
	 * Stop automatic time progression
	 */
	stop(): void {
		this.pause();
		this.clearAll();
	}

	/**
	 * Reset clock to start time
	 */
	reset(): void {
		this.stop();
		this.currentTime = this.startTime;
		this.paused = false;
		this.speed = 1;
	}

	/**
	 * Get elapsed time since start
	 */
	elapsed(): number {
		return this.currentTime - this.startTime;
	}

	/**
	 * Create a timeout (setTimeout equivalent)
	 */
	setTimeout(callback: () => void | Promise<void>, delay: number): string {
		return this.scheduleIn(delay, callback);
	}

	/**
	 * Create an interval (setInterval equivalent)
	 */
	setInterval(callback: () => void | Promise<void>, interval: number): string {
		return this.scheduleRepeating(interval, callback);
	}

	/**
	 * Clear a timeout or interval
	 */
	clearTimeout(id: string): boolean {
		return this.cancel(id);
	}

	clearInterval(id: string): boolean {
		return this.cancel(id);
	}

	/**
	 * Wait for specified duration (async)
	 */
	async wait(duration: number): Promise<void> {
		return new Promise((resolve) => {
			this.scheduleIn(duration, resolve);
		});
	}

	/**
	 * Get statistics about scheduled callbacks
	 */
	getStats(): {
		totalScheduled: number;
		nextExecutionIn: number | null;
		repeatings: number;
	} {
		const next = this.getNextCallback();
		let repeatings = 0;

		for (const callback of this.scheduledCallbacks.values()) {
			if (callback.repeating) {
				repeatings++;
			}
		}

		return {
			totalScheduled: this.scheduledCallbacks.size,
			nextExecutionIn: next ? next.executeAt - this.currentTime : null,
			repeatings,
		};
	}

	/**
	 * Fast-forward to next scheduled event
	 */
	skipToNext(): boolean {
		const next = this.getNextCallback();
		if (next) {
			this.setTime(next.executeAt);
			return true;
		}
		return false;
	}

	/**
	 * Fast-forward to specific time, optionally executing callbacks
	 */
	fastForward(duration: number, executeCallbacks: boolean = true): void {
		const targetTime = this.currentTime + duration;

		if (executeCallbacks) {
			this.advanceToTime(targetTime);
		} else {
			this.currentTime = targetTime;
		}
	}
}

/**
 * Global virtual clock instance for simulations
 */
let globalClock: VirtualClock | null = null;

export function getGlobalClock(): VirtualClock {
	if (!globalClock) {
		globalClock = new VirtualClock();
	}
	return globalClock;
}

export function setGlobalClock(clock: VirtualClock): void {
	globalClock = clock;
}

export function resetGlobalClock(): void {
	if (globalClock) {
		globalClock.reset();
	}
}
