import type { NetworkCondition } from './types';
import { NetworkConditionSchema } from './types';

/**
 * Network Simulator
 * Simulates various network conditions for testing
 */

export class NetworkSimulator {
	private conditions: NetworkCondition;
	private enabled: boolean = true;
	private requestCount: number = 0;
	private bytesTransferred: number = 0;

	constructor(conditions?: Partial<NetworkCondition>) {
		this.conditions = NetworkConditionSchema.parse(conditions ?? {});
	}

	/**
	 * Set network conditions
	 */
	setConditions(conditions: Partial<NetworkCondition>): void {
		this.conditions = NetworkConditionSchema.parse({
			...this.conditions,
			...conditions,
		});
	}

	/**
	 * Simulate network request
	 */
	async simulateRequest(dataSize: number = 0): Promise<{
		success: boolean;
		duration: number;
		error?: string;
	}> {
		if (!this.enabled) {
			return { success: true, duration: 0 };
		}

		this.requestCount++;
		const startTime = Date.now();

		// Check packet loss
		if (this.shouldDropPacket()) {
			return {
				success: false,
				duration: Date.now() - startTime,
				error: 'Packet lost',
			};
		}

		// Apply latency
		const latency = this.calculateLatency();
		await this.delay(latency);

		// Apply bandwidth throttling
		if (this.conditions.bandwidth) {
			const transferTime = this.calculateTransferTime(dataSize);
			await this.delay(transferTime);
		}

		// Check corruption
		if (this.shouldCorruptPacket()) {
			return {
				success: false,
				duration: Date.now() - startTime,
				error: 'Data corrupted',
			};
		}

		this.bytesTransferred += dataSize;

		return {
			success: true,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Calculate latency based on distribution
	 */
	private calculateLatency(): number {
		const { min, max, distribution } = this.conditions.latency;

		switch (distribution) {
			case 'constant':
				return min;

			case 'uniform':
				return min + Math.random() * (max - min);

			case 'normal': {
				// Box-Muller transform for normal distribution
				const mean = (min + max) / 2;
				const stdDev = (max - min) / 6;
				const u1 = Math.random();
				const u2 = Math.random();
				const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
				return Math.max(min, Math.min(max, mean + z * stdDev));
			}

			case 'exponential': {
				const lambda = 1 / ((max + min) / 2);
				return Math.min(max, -Math.log(1 - Math.random()) / lambda);
			}

			default:
				return min;
		}
	}

	/**
	 * Calculate transfer time based on bandwidth
	 */
	private calculateTransferTime(dataSize: number): number {
		if (!this.conditions.bandwidth?.download) {
			return 0;
		}

		// Time = size / bandwidth (in milliseconds)
		return (dataSize / this.conditions.bandwidth.download) * 1000;
	}

	/**
	 * Check if packet should be dropped
	 */
	private shouldDropPacket(): boolean {
		return Math.random() < this.conditions.packetLoss;
	}

	/**
	 * Check if packet should be corrupted
	 */
	private shouldCorruptPacket(): boolean {
		return Math.random() < this.conditions.corruption;
	}

	/**
	 * Check if packet should be duplicated
	 */
	shouldDuplicatePacket(): boolean {
		return Math.random() < this.conditions.duplicate;
	}

	/**
	 * Check if packet should be reordered
	 */
	shouldReorderPacket(): boolean {
		return Math.random() < this.conditions.reorder;
	}

	/**
	 * Add jitter to timing
	 */
	addJitter(baseTime: number): number {
		if (this.conditions.jitter === 0) {
			return baseTime;
		}

		const jitter = (Math.random() - 0.5) * 2 * this.conditions.jitter;
		return Math.max(0, baseTime + jitter);
	}

	/**
	 * Enable network simulation
	 */
	enable(): void {
		this.enabled = true;
	}

	/**
	 * Disable network simulation
	 */
	disable(): void {
		this.enabled = false;
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		requestCount: number;
		bytesTransferred: number;
		averageLatency: number;
		packetLossRate: number;
	} {
		return {
			requestCount: this.requestCount,
			bytesTransferred: this.bytesTransferred,
			averageLatency: (this.conditions.latency.min + this.conditions.latency.max) / 2,
			packetLossRate: this.conditions.packetLoss,
		};
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.requestCount = 0;
		this.bytesTransferred = 0;
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Predefined Network Profiles
 */
export class NetworkProfiles {
	/**
	 * 4G mobile network
	 */
	static mobile4G(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 50,
				max: 150,
				distribution: 'normal',
			},
			bandwidth: {
				download: 12500000, // 100 Mbps
				upload: 6250000, // 50 Mbps
			},
			packetLoss: 0.01,
			jitter: 20,
		});
	}

	/**
	 * 3G mobile network
	 */
	static mobile3G(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 100,
				max: 400,
				distribution: 'normal',
			},
			bandwidth: {
				download: 1875000, // 15 Mbps
				upload: 937500, // 7.5 Mbps
			},
			packetLoss: 0.02,
			jitter: 50,
		});
	}

	/**
	 * Poor WiFi
	 */
	static poorWiFi(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 100,
				max: 500,
				distribution: 'exponential',
			},
			bandwidth: {
				download: 625000, // 5 Mbps
				upload: 312500, // 2.5 Mbps
			},
			packetLoss: 0.05,
			jitter: 100,
			corruption: 0.01,
		});
	}

	/**
	 * Satellite connection
	 */
	static satellite(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 500,
				max: 800,
				distribution: 'constant',
			},
			bandwidth: {
				download: 12500000, // 100 Mbps
				upload: 1562500, // 12.5 Mbps
			},
			packetLoss: 0.03,
			jitter: 50,
		});
	}

	/**
	 * Offline (no connection)
	 */
	static offline(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 0,
				max: 0,
				distribution: 'constant',
			},
			packetLoss: 1.0, // 100% packet loss
		});
	}

	/**
	 * Perfect connection
	 */
	static perfect(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 0,
				max: 0,
				distribution: 'constant',
			},
			packetLoss: 0,
			jitter: 0,
		});
	}

	/**
	 * High latency
	 */
	static highLatency(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 500,
				max: 2000,
				distribution: 'uniform',
			},
			packetLoss: 0.02,
			jitter: 200,
		});
	}

	/**
	 * Unstable connection
	 */
	static unstable(): NetworkCondition {
		return NetworkConditionSchema.parse({
			latency: {
				min: 50,
				max: 1000,
				distribution: 'exponential',
			},
			packetLoss: 0.1,
			jitter: 300,
			corruption: 0.02,
			duplicate: 0.05,
			reorder: 0.05,
		});
	}
}

/**
 * Network Event Logger
 */
export class NetworkEventLogger {
	private events: Array<{
		timestamp: number;
		type: 'request' | 'response' | 'error' | 'dropped' | 'corrupted';
		details: Record<string, unknown>;
	}> = [];

	/**
	 * Log network event
	 */
	log(
		type: 'request' | 'response' | 'error' | 'dropped' | 'corrupted',
		details: Record<string, unknown>,
	): void {
		this.events.push({
			timestamp: Date.now(),
			type,
			details,
		});
	}

	/**
	 * Get all events
	 */
	getEvents(): typeof this.events {
		return this.events;
	}

	/**
	 * Get events by type
	 */
	getEventsByType(
		type: 'request' | 'response' | 'error' | 'dropped' | 'corrupted',
	): typeof this.events {
		return this.events.filter((e) => e.type === type);
	}

	/**
	 * Clear events
	 */
	clear(): void {
		this.events = [];
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		total: number;
		byType: Record<string, number>;
	} {
		const byType: Record<string, number> = {};

		for (const event of this.events) {
			byType[event.type] = (byType[event.type] ?? 0) + 1;
		}

		return {
			total: this.events.length,
			byType,
		};
	}
}
